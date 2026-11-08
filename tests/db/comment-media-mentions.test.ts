import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let ana: TestUser;
let ben: TestUser;
let cara: TestUser;
let dev: TestUser;
let postId: string;

interface Insert {
  body?: string;
  mentions?: string[];
  upload?: string | null;
  parentId?: string | null;
  replyTo?: string | null;
  post?: string;
}

const comment = async (user: TestUser, opts: Insert = {}) =>
  (
    await db.query<{ id: string }>(
      user.id,
      `insert into public.comments (post_id, author_id, body, parent_id, reply_to_user_id, media_upload_id, mention_ids)
       values ($1, $2, $3, $4, $5, $6, $7::uuid[]) returning id`,
      [
        opts.post ?? postId,
        user.id,
        opts.body ?? '',
        opts.parentId ?? null,
        opts.replyTo ?? null,
        opts.upload ?? null,
        opts.mentions ?? [],
      ],
    )
  )[0]!.id;

/** What the comment-media Edge Function records after checking a file. */
const upload = async (owner: TestUser, kind = 'photo', createdAt?: string) => {
  const id = randomUUID();
  const ext = kind === 'sticker' ? 'png' : 'jpg';
  await db.admin(
    `insert into public.comment_uploads (id, owner_id, kind, path, thumb_path, mime, bytes, width, height, created_at)
     values ($1, $2, $3, $4, $5, $6, 1000, 800, 600, coalesce($7::timestamptz, now()))`,
    [
      id,
      owner.id,
      kind,
      `${owner.id}/${id}.${ext}`,
      `${owner.id}/${id}_t.${ext}`,
      kind === 'sticker' ? 'image/png' : 'image/jpeg',
      createdAt ?? null,
    ],
  );
  await db.admin(
    `insert into storage.objects (bucket_id, name, owner) values ('comment-media', $1, $3), ('comment-media', $2, $3)`,
    [`${owner.id}/${id}.${ext}`, `${owner.id}/${id}_t.${ext}`, owner.id],
  );
  return { id, path: `${owner.id}/${id}.${ext}`, thumb: `${owner.id}/${id}_t.${ext}` };
};

const mentionNotes = (recipient: TestUser, commentId?: string) =>
  db.admin<{ actor_id: string; comment_id: string }>(
    `select actor_id, comment_id from public.notifications
     where recipient_id = $1 and type = 'comment_mention' and ($2::uuid is null or comment_id = $2)`,
    [recipient.id, commentId ?? null],
  );

const storedMentions = async (commentId: string) =>
  (
    await db.admin<{ user_id: string; username: string }>(
      'select user_id, username from public.comment_mentions where comment_id = $1 order by username',
      [commentId],
    )
  ).map((m) => m.username);

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  ana = await db.createUser('ana');
  ben = await db.createUser('ben');
  cara = await db.createUser('cara');
  dev = await db.createUser('dev');
  postId = await db.createPost(cook.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('mention tokens', () => {
  it('finds @names in order, ignoring emails and trailing dots', async () => {
    const [row] = await db.admin<{ t: string[] }>(
      `select public.mention_tokens('hi @Ana and @ben. mail me a@cook.com, @ana again @x @cara_b.') as t`,
    );
    expect(row!.t).toEqual(['ana', 'ben', 'cara_b']);
  });
});

describe('mentions', () => {
  it('store by id, notify once, and resolve after a rename', async () => {
    const id = await comment(ana, { body: '@ben @cara try this', mentions: [ben.id, cara.id, ben.id] });
    expect(await storedMentions(id)).toEqual(['ben', 'cara']);
    expect(await mentionNotes(ben, id)).toHaveLength(1);
    expect(await mentionNotes(cara, id)).toHaveLength(1);

    await db.query(ben.id, `update public.profiles set username = 'benny' where id = $1`, [ben.id]);
    const [m] = await db.query<{ username: string; current: string }>(
      ana.id,
      `select m.username, p.username as current from public.comment_mentions m
       join public.profiles p on p.id = m.user_id where m.comment_id = $1 and m.user_id = $2`,
      [id, ben.id],
    );
    expect(m).toEqual({ username: 'ben', current: 'benny' });
    await db.query(ben.id, `update public.profiles set username = 'ben' where id = $1`, [ben.id]);
  });

  it('drop spoofed ids the text doesn’t name, unknown ids and self-mentions', async () => {
    const ghost = randomUUID();
    const id = await comment(ana, { body: 'hello @ana @dev', mentions: [ben.id, ghost, ana.id] });
    expect(await storedMentions(id)).toEqual([]);
    expect(await mentionNotes(ben, id)).toHaveLength(0);
    const [row] = await db.admin<{ mention_ids: string[] }>(
      'select mention_ids from public.comments where id = $1',
      [id],
    );
    expect(row!.mention_ids).toEqual([]);
  });

  it('allow at most five per comment', async () => {
    const extra = await Promise.all(['e1x', 'e2x', 'e3x', 'e4x', 'e5x', 'e6x'].map((n) => db.createUser(n)));
    await expectDbError(
      comment(ana, { body: extra.map((u) => `@${u.username}`).join(' '), mentions: extra.map((u) => u.id) }),
      /up to 5 mentions/,
    );
  });

  it('never let a blocked person reach someone who blocked them', async () => {
    await db.query(dev.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      dev.id,
      ana.id,
    ]);
    const id = await comment(ana, { body: '@dev look', mentions: [dev.id] });
    expect(await storedMentions(id)).toEqual([]);
    expect(await mentionNotes(dev, id)).toHaveLength(0);
    const suggestions = await db.query<{ username: string }>(
      ana.id,
      `select username from public.mention_suggestions('de')`,
    );
    expect(suggestions.map((s) => s.username)).not.toContain('dev');
    await db.query(dev.id, 'delete from public.user_blocks where blocker_id = $1', [dev.id]);
  });

  it('respect “who can mention you”', async () => {
    await db.query(cara.id, `update public.profiles set mention_policy = 'nobody' where id = $1`, [cara.id]);
    const blocked = await comment(ana, { body: '@cara', mentions: [cara.id] });
    expect(await storedMentions(blocked)).toEqual([]);

    await db.query(cara.id, `update public.profiles set mention_policy = 'following' where id = $1`, [
      cara.id,
    ]);
    expect(await storedMentions(await comment(ana, { body: '@cara', mentions: [cara.id] }))).toEqual([]);
    await db.follow(cara.id, ana.id);
    expect(await storedMentions(await comment(ana, { body: '@cara', mentions: [cara.id] }))).toEqual([
      'cara',
    ]);
    await db.query(cara.id, `update public.profiles set mention_policy = 'everyone' where id = $1`, [
      cara.id,
    ]);
  });

  it('only notify people who can see the post', async () => {
    const privatePost = await db.createPost(cook.id, { visibility: 'followers' });
    await db.follow(ana.id, cook.id);
    const id = await comment(ana, {
      post: privatePost,
      body: '@ben you should see this',
      mentions: [ben.id],
    });
    expect(await storedMentions(id)).toEqual(['ben']);
    expect(await mentionNotes(ben, id)).toHaveLength(0);
  });

  it('skip the person already told about the comment, and count replies too', async () => {
    const top = await comment(ana, { body: '@cook nice!', mentions: [cook.id] });
    expect(await mentionNotes(cook, top)).toHaveLength(0);
    const [note] = await db.admin<{ n: number }>(
      `select count(*)::int as n from public.notifications where recipient_id = $1 and comment_id = $2`,
      [cook.id, top],
    );
    expect(note!.n).toBe(1);
    const reply = await comment(ben, {
      body: '@cara agree',
      parentId: top,
      replyTo: ana.id,
      mentions: [cara.id],
    });
    expect(await mentionNotes(cara, reply)).toHaveLength(1);
  });

  it('cap notifications to one person per day', async () => {
    const spammer = await db.createUser('spammer');
    const target = await db.createUser('target');
    for (let i = 0; i < 7; i++) await comment(spammer, { body: `@target ${i}`, mentions: [target.id] });
    expect(await mentionNotes(target)).toHaveLength(5);
  });

  it('suggest friends and followed accounts first', async () => {
    const me = await db.createUser('mia');
    const pal = await db.createUser('sam_pal');
    const fav = await db.createUser('sam_fav');
    await db.createUser('sam_other');
    await db.follow(me.id, pal.id);
    await db.follow(pal.id, me.id);
    await db.follow(me.id, fav.id);
    const rows = await db.query<{ username: string; relation: string }>(
      me.id,
      `select username, relation from public.mention_suggestions('sam')`,
    );
    expect(rows.map((r) => r.username)).toEqual(['sam_pal', 'sam_fav', 'sam_other']);
    expect(rows[0]!.relation).toBe('mutual');
    const empty = await db.query<{ username: string }>(
      me.id,
      `select username from public.mention_suggestions('')`,
    );
    expect(empty.map((r) => r.username).sort()).toEqual(['sam_fav', 'sam_pal']);
  });
});

describe('photo and sticker comments', () => {
  it('allow image-only, text+image and sticker replies; copy the upload’s metadata', async () => {
    const photo = await upload(ana);
    const id = await comment(ana, { upload: photo.id });
    const [row] = await db.admin<Record<string, unknown>>(
      'select body, media_kind, media_path, media_thumb_path, media_width from public.comments where id = $1',
      [id],
    );
    expect(row).toMatchObject({
      body: '',
      media_kind: 'photo',
      media_path: photo.path,
      media_thumb_path: photo.thumb,
      media_width: 800,
    });

    const sticker = await upload(ben, 'sticker');
    const reply = await comment(ben, { upload: sticker.id, parentId: id, replyTo: ana.id, body: 'me too' });
    const [r] = await db.admin<{ media_kind: string; parent_id: string }>(
      'select media_kind, parent_id from public.comments where id = $1',
      [reply],
    );
    expect(r).toEqual({ media_kind: 'sticker', parent_id: id });
  });

  it('reject empty comments without a picture', async () => {
    await expectDbError(comment(ana, { body: '   ' }), /comments_body_length/);
  });

  it('reject someone else’s, reused, expired or invented uploads', async () => {
    const bens = await upload(ben);
    await expectDbError(comment(ana, { upload: bens.id }), /attachment not found/);
    await expectDbError(comment(ana, { upload: randomUUID() }), /attachment not found/);
    const once = await upload(ana);
    await comment(ana, { upload: once.id });
    await expectDbError(comment(ana, { upload: once.id }), /already used/);
    const old = await upload(ana, 'photo', new Date(Date.now() - 2 * 3600_000).toISOString());
    await expectDbError(comment(ana, { upload: old.id }), /expired/);
  });

  it('never let clients set paths, write uploads or touch the bucket', async () => {
    await expectDbError(
      db.query(
        ana.id,
        `insert into public.comments (post_id, author_id, body, media_path) values ($1, $2, 'x', 'a/b.jpg')`,
        [postId, ana.id],
      ),
      /permission denied/,
    );
    await expectDbError(
      db.query(
        ana.id,
        `insert into public.comment_uploads (id, owner_id, kind, path, thumb_path, mime, bytes, width, height)
         values ($1, $2, 'photo', $3, $4, 'image/jpeg', 1, 1, 1)`,
        [randomUUID(), ana.id, `${ana.id}/a.jpg`, `${ana.id}/a_t.jpg`],
      ),
      /permission denied/,
    );
    await expectDbError(
      db.query(ana.id, `insert into storage.objects (bucket_id, name) values ('comment-media', $1)`, [
        `${ana.id}/x.jpg`,
      ]),
      /row-level security/,
    );
    // Editing can't swap the picture.
    const mine = await upload(ana);
    const id = await comment(ana, { upload: mine.id, body: 'mine' });
    await expectDbError(
      db.query(ana.id, `update public.comments set media_path = 'x/y.jpg' where id = $1`, [id]),
      /permission denied/,
    );
  });

  it('let only people who can see the comment read the file', async () => {
    const hidden = await db.createPost(cook.id, { visibility: 'followers' });
    await db.follow(ana.id, cook.id).catch(() => undefined);
    const pic = await upload(ana);
    await comment(ana, { post: hidden, upload: pic.id });
    const canRead = async (user: TestUser) =>
      (
        await db.query(
          user.id,
          `select name from storage.objects where bucket_id = 'comment-media' and name = $1`,
          [pic.thumb],
        )
      ).length > 0;
    expect(await canRead(ana)).toBe(true);
    expect(await canRead(cook)).toBe(true);
    expect(await canRead(ben)).toBe(false);

    // Blocks hide it too.
    await db.query(cook.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      cook.id,
      ana.id,
    ]);
    expect(await canRead(cook)).toBe(false);
    await db.query(cook.id, 'delete from public.user_blocks where blocker_id = $1', [cook.id]);
  });

  it('sweep unused uploads after an hour, but keep report evidence', async () => {
    const stale = await upload(ana, 'photo', new Date(Date.now() - 2 * 3600_000).toISOString());
    const fresh = await upload(ana);
    const used = await upload(ben, 'photo');
    const usedComment = await comment(ben, { upload: used.id, body: 'report me' });
    await db.query(
      cara.id,
      `insert into public.reports (reporter_id, target_type, target_comment_id, reason) values ($1, 'comment', $2, 'spam')`,
      [cara.id, usedComment],
    );
    await db.query(ben.id, 'delete from public.comments where id = $1', [usedComment]);
    await db.admin(
      `update public.comment_uploads set created_at = now() - interval '2 hours' where id = $1`,
      [used.id],
    );

    const sweep = async () =>
      (await db.admin<{ id: string }>('select id from public.comment_uploads_to_sweep(200)')).map(
        (r) => r.id,
      );
    const ids = await sweep();
    expect(ids).toContain(stale.id);
    expect(ids).not.toContain(fresh.id);
    expect(ids).not.toContain(used.id);
    const [{ n }] = (await db.admin<{ n: number }>('select public.forget_comment_uploads($1::uuid[]) as n', [
      [stale.id],
    ])) as [{ n: number }];
    expect(n).toBe(1);
    await expectDbError(db.query(ana.id, 'select public.comment_uploads_to_sweep(10)'), /permission denied/);
  });
});

describe('moderation', () => {
  it('keeps the picture as evidence and lets moderators remove just the picture', async () => {
    const mod = await db.createUser('modder');
    await db.admin('insert into public.moderators (user_id) values ($1)', [mod.id]);
    const pic = await upload(ana);
    const id = await comment(ana, { upload: pic.id, body: '@ben look', mentions: [ben.id] });
    await db.query(
      cara.id,
      `insert into public.reports (reporter_id, target_type, target_comment_id, reason) values ($1, 'comment', $2, 'inappropriate')`,
      [cara.id, id],
    );
    const [report] = await db.admin<{
      id: string;
      target_snapshot: { media: { path: string }; mentions: string[] };
    }>('select id, target_snapshot from public.reports where target_comment_id = $1', [id]);
    expect(report!.target_snapshot.media.path).toBe(pic.path);
    expect(report!.target_snapshot.mentions).toEqual(['ben']);

    const [detail] = await db.query<{ d: { current: { media: { path: string } } } }>(
      mod.id,
      'select public.admin_report_detail($1) as d',
      [report!.id],
    );
    expect(detail!.d.current.media.path).toBe(pic.path);
    expect(
      await db.query(
        mod.id,
        `select 1 from storage.objects where bucket_id = 'comment-media' and name = $1`,
        [pic.path],
      ),
    ).toHaveLength(1);

    await expectDbError(
      db.query(ana.id, `select public.admin_moderate_comment_media($1, 'remove_media', 'open', '')`, [
        report!.id,
      ]),
      /moderators only/,
    );
    await db.query(
      mod.id,
      `select public.admin_moderate_comment_media($1, 'remove_media', 'open', 'graphic')`,
      [report!.id],
    );
    const [row] = await db.admin<{ media_hidden_at: string | null; body: string }>(
      'select media_hidden_at, body from public.comments where id = $1',
      [id],
    );
    expect(row!.media_hidden_at).not.toBeNull();
    expect(row!.body).toBe('@ben look');
    const [after] = await db.admin<{ status: string }>('select status from public.reports where id = $1', [
      report!.id,
    ]);
    expect(after!.status).toBe('actioned');
    const log = await db.admin<{ action: string }>(
      `select action from public.moderation_actions where report_id = $1`,
      [report!.id],
    );
    expect(log.map((l) => l.action)).toContain('remove_media');
    // Nobody else can sign the removed picture now.
    expect(
      await db.query(
        ben.id,
        `select 1 from storage.objects where bucket_id = 'comment-media' and name = $1`,
        [pic.thumb],
      ),
    ).toHaveLength(0);
  });
});

describe('push', () => {
  it('describes mentions and carries the comment id', async () => {
    const id = await comment(ana, { body: '@ben hi', mentions: [ben.id] });
    const [row] = await db.admin<{ m: { body: string; data: { path: string; commentId: string } } }>(
      `select public.push_message(n) as m from public.notifications n where n.comment_id = $1 and n.type = 'comment_mention'`,
      [id],
    );
    expect(row!.m.body).toMatch(/^ana mentioned you in a comment on /);
    expect(row!.m.data).toMatchObject({ path: `/post/${postId}`, commentId: id });
    const [pref] = await db.admin<{ w: boolean }>(`select public.push_wanted($1, 'comment_mention') as w`, [
      ben.id,
    ]);
    expect(pref!.w).toBe(true);
  });
});
