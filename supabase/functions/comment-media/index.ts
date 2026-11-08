// comment-media: the only way a photo or sticker gets into a comment.
//
//   POST multipart/form-data
//     id     uuid chosen by the app (retrying the same id is safe)
//     kind   'photo' | 'sticker'
//     full   the image (≤ 2048 px, ≤ 3 MB)
//     thumb  the list-size image (≤ 720 px, ≤ 512 KB)
//   → { id, kind, width, height }
//
// It checks the caller, the real bytes of both files (JPEG/PNG/WebP
// signature and header size, never the claimed type), a per-hour limit, then
// stores them under comment-media/{uid}/ with the service role and records
// the upload. The comment insert links to that record (see the
// 20261029000001 migration), so the database only ever points at files this
// function checked. Each call also sweeps a few unused uploads.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

import { checkImage, EXTENSIONS, imageInfo, LIMITS, type UploadKind } from '../_shared/imageInfo.ts';

const BUCKET = 'comment-media';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'not authenticated' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !who.user) return json(401, { error: 'not authenticated' });
  const uid = who.user.id;

  // Requests bigger than both files could be are refused before reading.
  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (declared > LIMITS.fullBytes + LIMITS.thumbBytes + 64 * 1024) return json(413, { error: 'file too large' });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json(400, { error: 'expected multipart form data' });
  }
  const id = String(form.get('id') ?? '');
  const kind = String(form.get('kind') ?? '') as UploadKind;
  const full = form.get('full');
  const thumb = form.get('thumb');
  if (!UUID.test(id) || (kind !== 'photo' && kind !== 'sticker') || !(full instanceof File) || !(thumb instanceof File)) {
    return json(400, { error: 'invalid upload' });
  }

  const { data: profile } = await admin.from('profiles').select('suspended_at').eq('id', uid).maybeSingle();
  if (!profile || profile.suspended_at) return json(403, { error: 'account can’t post' });

  // Same id again (the first response was lost): hand back what's stored.
  const { data: existing } = await admin
    .from('comment_uploads')
    .select('id, owner_id, kind, width, height')
    .eq('id', id)
    .maybeSingle();
  if (existing) {
    return existing.owner_id === uid
      ? json(200, { id, kind: existing.kind, width: existing.width, height: existing.height })
      : json(409, { error: 'invalid upload' });
  }

  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from('comment_uploads')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', uid)
    .gte('created_at', since);
  if ((count ?? 0) >= LIMITS.perHour) return json(429, { error: 'too many uploads, try again later' });

  const fullBytes = new Uint8Array(await full.arrayBuffer());
  const thumbBytes = new Uint8Array(await thumb.arrayBuffer());
  const fullInfo = imageInfo(fullBytes);
  const thumbInfo = imageInfo(thumbBytes);
  const problem =
    checkImage(fullInfo, fullBytes.byteLength, kind, 'full') ?? checkImage(thumbInfo, thumbBytes.byteLength, kind, 'thumb');
  if (problem || !fullInfo || !thumbInfo) return json(422, { error: problem ?? 'invalid image' });

  const path = `${uid}/${id}.${EXTENSIONS[fullInfo.mime]}`;
  const thumbPath = `${uid}/${id}_t.${EXTENSIONS[thumbInfo.mime]}`;
  const store = (p: string, bytes: Uint8Array, mime: string) =>
    admin.storage.from(BUCKET).upload(p, bytes, { contentType: mime, cacheControl: '31536000', upsert: false });

  const [a, b] = await Promise.all([store(path, fullBytes, fullInfo.mime), store(thumbPath, thumbBytes, thumbInfo.mime)]);
  if (a.error || b.error) {
    await admin.storage.from(BUCKET).remove([path, thumbPath]);
    console.error('comment-media upload failed', a.error ?? b.error);
    return json(500, { error: 'upload failed, please try again' });
  }

  const { error: insertError } = await admin.from('comment_uploads').insert({
    id,
    owner_id: uid,
    kind,
    path,
    thumb_path: thumbPath,
    mime: fullInfo.mime,
    bytes: fullBytes.byteLength,
    width: fullInfo.width,
    height: fullInfo.height,
  });
  if (insertError) {
    await admin.storage.from(BUCKET).remove([path, thumbPath]);
    console.error('comment-media record failed', insertError);
    return json(500, { error: 'upload failed, please try again' });
  }

  // Housekeeping: remove a few uploads nobody used (failed posts, deleted
  // comments) once they're an hour old. Never blocks the response's success.
  try {
    const { data: stale } = await admin.rpc('comment_uploads_to_sweep', { p_limit: 20 });
    const rows = (stale ?? []) as { id: string; path: string; thumb_path: string }[];
    if (rows.length > 0) {
      const { error } = await admin.storage.from(BUCKET).remove(rows.flatMap((r) => [r.path, r.thumb_path]));
      if (!error) await admin.rpc('forget_comment_uploads', { p_ids: rows.map((r) => r.id) });
    }
  } catch (error) {
    console.error('comment-media sweep failed', error);
  }

  return json(200, { id, kind, width: fullInfo.width, height: fullInfo.height });
});
