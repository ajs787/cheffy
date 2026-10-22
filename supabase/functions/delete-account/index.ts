// delete-account: permanently deletes the caller's Cheffy account (App Store
// 5.1.1(v)). Runs on Supabase's servers so cleanup doesn't depend on the app:
//   1. identify the caller from their own access token;
//   2. remove every file under {uid}/ in post-images and avatars;
//   3. delete the auth user, which cascades to the profile, posts, comments,
//      likes, follows, collaborations, notifications and push tokens.
// The service-role key is provided by the Edge runtime and never leaves it.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const BUCKETS = ['post-images', 'avatars'] as const;

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

  // Files live at {uid}/file or {uid}/{postId}/file.
  for (const bucket of BUCKETS) {
    const paths: string[] = [];
    const walk = async (prefix: string, depth: number): Promise<void> => {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
        if (error) throw error;
        for (const item of data) {
          const path = `${prefix}/${item.name}`;
          if (item.id === null) {
            if (depth < 2) await walk(path, depth + 1);
          } else {
            paths.push(path);
          }
        }
        if (data.length < 100) break;
      }
    };
    try {
      await walk(uid, 1);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
    } catch (error) {
      console.error('delete-account storage cleanup failed', bucket, error);
      // Keep the account so the person can retry; nothing half-deleted.
      return json(500, { error: 'could not remove your photos, please try again' });
    }
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
  if (deleteError) {
    console.error('delete-account deleteUser failed', deleteError);
    return json(500, { error: 'could not delete your account, please try again' });
  }
  return json(200, { deleted: true });
});
