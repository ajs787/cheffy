/**
 * Anonymous Takes: comments shown as "Chef #01", with the account kept
 * server-side. Runs the real migrations with RLS, as each role would.
 */
import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser; // the creator
let ana: TestUser;
let ben: TestUser;
let cara: TestUser;
let postId: string;

interface Row {
  id: string;
  author_id: string | null;
  anon_number: number | null;
  reply_to_user_id: string | null;
  reply_to_anon_number: number | null;
  parent_id: string | null;
}

const take = async (
  user: TestUser,
  body: string,
  opts: { post?: string; parent?: string; replyTo?: string } = {},
) =>
  (
    await db.query<Row>(user.id, 'select * from public.post_anonymous_take($1, $2, $3, $4)', [
      opts.post ?? postId,
      body,
      opts.parent ?? null,
      opts.replyTo ?? null,
    ])
  )[0]!;

const named = async (user: TestUser, body: string, opts: { parent?: string; replyToAnon?: number } = {}) =>
  (
    await db.query<Row>(
      user.id,
      `insert into public.comments (post_id, author_id, body, parent_id, reply_to_anon_number)
       values ($1, $2, $3, $4, $5) returning *`,
      [postId, user.id, body, opts.parent ?? null, opts.replyToAnon ?? null],
    )
  )[0]!;

const setMode = (mode: 'off' | 'beta' | 'all') =>
  db.admin(`update public.app_config set value = to_jsonb($1::text) where key = 'anonymous_takes.mode'`, [
    mode,
  ]);

const notificationsFor = (user: TestUser) =>
  db.query<{ actor_id: string | null; type: string; comment_id: string | null }>(
    user.id,
    'select actor_id, type, comment_id from public.notifications order by created_at',
  );

beforeEach(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  ana = await db.createUser('ana');
  ben = await db.createUser('ben');
  cara = await db.createUser('cara');
  postId = await db.createPost(cook.id);
  await setMode('all');
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('posting', () => {
  it('is on by default for new posts and the creator can switch it off and on', async () => {
    const [p] = await db.admin<{ allow_anonymous_takes: boolean }>(
      'select allow_anonymous_takes from public.posts where id = $1',
      [postId],
    );
    expect(p!.allow_anonymous_takes).toBe(true);
    await db.createPost(cook.id, { id: postId, allow_anonymous_takes: false });
    await expectDbError(take(ana, 'too salty'), /aren’t open/);
    // An older app editing the post (no field sent) keeps the creator's choice.
    await db.createPost(cook.id, { id: postId, title: 'Renamed' });
    await expectDbError(take(ana, 'too salty'), /aren’t open/);
    await db.createPost(cook.id, { id: postId, allow_anonymous_takes: true });
    expect((await take(ana, 'too salty')).anon_number).toBe(1);
  });

  it('numbers chefs per post in order and keeps each person’s number in that thread', async () => {
    const a1 = await take(ana, 'respectfully that pasta needs another 20 minutes');
    const b1 = await take(ben, 'looks amazing');
    const a2 = await take(ana, 'ok the sauce though');
    expect([a1.anon_number, b1.anon_number, a2.anon_number]).toEqual([1, 2, 1]);
    expect([a1.author_id, b1.author_id, a2.author_id]).toEqual([null, null, null]);

    // A different post starts again, so numbers can't be followed across posts.
    const other = await db.createPost(cara.id);
    expect((await take(ben, 'first!', { post: other })).anon_number).toBe(1);
    expect((await take(ana, 'second', { post: other })).anon_number).toBe(2);
  });

  it('keeps named comments working next to anonymous ones', async () => {
    const n = await named(ben, 'Recipe please!');
    expect(n.author_id).toBe(ben.id);
    expect(n.anon_number).toBeNull();
    await take(ana, 'anon');
    const rows = await db.query<Row>(
      cara.id,
      'select * from public.comments where post_id = $1 order by created_at',
      [postId],
    );
    expect(rows.map((r) => [r.author_id, r.anon_number])).toEqual([
      [ben.id, null],
      [null, 1],
    ]);
  });

  it('threads anonymous replies and addresses them by Chef number', async () => {
    const top = await take(ana, 'needs salt');
    const reply = await take(ben, 'agree', { parent: top.id, replyTo: top.id });
    expect(reply).toMatchObject({ parent_id: top.id, reply_to_anon_number: 1, reply_to_user_id: null });

    // A named reply to an anonymous chef.
    const namedReply = await named(cara, 'disagree', { parent: top.id, replyToAnon: 1 });
    expect(namedReply).toMatchObject({ reply_to_anon_number: 1, reply_to_user_id: null });

    // Naming a Chef number that isn't in the thread answers the comment it was written under.
    const stray = await named(cara, 'hm', { parent: reply.id, replyToAnon: 9 });
    expect(stray).toMatchObject({ parent_id: top.id, reply_to_anon_number: 2 });
  });

  it('allows likes on anonymous comments, notifying the author without naming them to anyone', async () => {
    const t = await take(ana, 'bold choice');
    await db.query(ben.id, 'insert into public.comment_likes (user_id, comment_id) values ($1, $2)', [
      ben.id,
      t.id,
    ]);
    const [c] = await db.query<{ like_count: number }>(
      ben.id,
      'select like_count from public.comments where id = $1',
      [t.id],
    );
    expect(c!.like_count).toBe(1);
    // Ana hears about the like (the liker is named, as for any like).
    expect(await notificationsFor(ana)).toEqual([
      { actor_id: ben.id, type: 'comment_like', comment_id: t.id },
    ]);
  });

  it('is text only: no pictures and no @mentions', async () => {
    const t = await db.query<{ mention_ids: string[] }>(
      ana.id,
      'select mention_ids from public.post_anonymous_take($1, $2)',
      [postId, '@ben look'],
    );
    expect(t[0]!.mention_ids).toEqual([]);
    expect(await db.admin('select * from public.comment_mentions')).toEqual([]);
  });

  it('returns the first take when the same one is retried', async () => {
    const first = await take(ana, 'crispy!');
    const again = await take(ana, 'crispy!');
    expect(again.id).toBe(first.id);
    expect(await db.admin('select id from public.comments where anon_number is not null')).toHaveLength(1);
  });

  it('keeps existing takes (still anonymous) when the creator turns it off', async () => {
    const t = await take(ana, 'mid');
    await db.createPost(cook.id, { id: postId, allow_anonymous_takes: false });
    const rows = await db.query<Row>(cara.id, 'select * from public.comments where id = $1', [t.id]);
    expect(rows[0]).toMatchObject({ author_id: null, anon_number: 1 });
    // Named comments stay open.
    await named(ben, 'still here');
  });

  it('only opens on public, published posts by public accounts, never on your own', async () => {
    await expectDbError(take(cook, 'my own post is great'), /aren’t open/);

    const followers = await db.createPost(cook.id, { visibility: 'followers' });
    await db.follow(ana.id, cook.id);
    await expectDbError(take(ana, 'x', { post: followers }), /aren’t open/);

    const draft = await db.createPost(cook.id, { status: 'draft' });
    await expectDbError(take(ana, 'x', { post: draft }), /aren’t open/);

    const priv = await db.createUser('quiet');
    const privPost = await db.createPost(priv.id);
    await db.follow(ana.id, priv.id);
    await db.admin('update public.profiles set is_private = true where id = $1', [priv.id]);
    await expectDbError(take(ana, 'x', { post: privPost }), /aren’t open/);
  });

  it('follows the rollout switch: off, beta testers only, or everyone', async () => {
    await setMode('off');
    await expectDbError(take(ana, 'x'), /aren’t open/);
    const t = await db.query<{ s: { available: boolean; open: boolean } }>(
      ana.id,
      'select public.anonymous_takes_status($1) s',
      [postId],
    );
    expect(t[0]!.s).toMatchObject({ available: false, open: false });

    await setMode('beta');
    await db.admin('insert into public.anonymous_takes_testers (user_id) values ($1)', [ana.id]);
    // The creator isn't in the beta, so their post isn't open yet.
    await expectDbError(take(ana, 'x'), /aren’t open/);
    await db.admin('insert into public.anonymous_takes_testers (user_id) values ($1)', [cook.id]);
    expect((await take(ana, 'x')).anon_number).toBe(1);
    await expectDbError(take(ben, 'y'), /aren’t open/);
  });

  it('tells the viewer their own Chef name on a post, and nobody else’s', async () => {
    await take(ana, 'x');
    const status = async (u: TestUser) =>
      (
        await db.query<{ s: Record<string, unknown> }>(u.id, 'select public.anonymous_takes_status($1) s', [
          postId,
        ])
      )[0]!.s;
    expect(await status(ana)).toEqual({ available: true, open: true, name: 'Chef #01' });
    expect(await status(ben)).toEqual({ available: true, open: true, name: null });
    expect(await status(cook)).toEqual({ available: true, open: false, name: null });
  });

  it('deletes an account’s anonymous comments with it and never reuses its number', async () => {
    await take(ana, 'one');
    await take(ben, 'two');
    await db.admin('delete from auth.users where id = $1', [ana.id]);
    await db.admin('delete from public.profiles where id = $1', [ana.id]);
    const left = await db.admin<{ anon_number: number }>('select anon_number from public.comments');
    expect(left).toEqual([{ anon_number: 2 }]);
    expect((await take(cara, 'three')).anon_number).toBe(3);
  });
});

describe('identity protection', () => {
  it('keeps the account mapping unreadable to every client', async () => {
    await take(ana, 'x');
    for (const table of ['anonymous_identities', 'anonymous_threads', 'anonymous_takes_testers']) {
      await expectDbError(db.query(ana.id, `select * from public.${table}`), /permission denied/);
      await expectDbError(db.query(cook.id, `select * from public.${table}`), /permission denied/);
    }
    for (const fn of [
      `public.anonymous_user('${postId}', 1)`,
      `public.anonymous_takes_eligible('${ana.id}', '${postId}')`,
      `public.comment_author_id(c) from public.comments c`,
    ]) {
      await expectDbError(db.query(cook.id, `select ${fn}`), /permission denied/);
    }
  });

  it('gives the creator no way to see who an anonymous commenter is', async () => {
    const t = await take(ana, 'controversial');
    const [row] = await db.query<Record<string, unknown>>(
      cook.id,
      'select * from public.comments where id = $1',
      [t.id],
    );
    expect(Object.values(row!)).not.toContain(ana.id);
    // Their notification (also the Realtime payload) has no actor.
    expect(await notificationsFor(cook)).toEqual([{ actor_id: null, type: 'comment', comment_id: t.id }]);
    // Asking "is this mine?" only ever answers for yourself.
    const owns = async (u: TestUser) =>
      (
        await db.query<{ v: boolean }>(
          u.id,
          'select public.viewer_owns_comment(c) v from public.comments c where c.id = $1',
          [t.id],
        )
      )[0]!.v;
    expect(await owns(ana)).toBe(true);
    expect(await owns(cook)).toBe(false);
  });

  it('notifies replies to an anonymous chef without naming either side', async () => {
    const top = await take(ana, 'top');
    const r = await take(ben, 'reply', { parent: top.id, replyTo: top.id });
    expect(await notificationsFor(ana)).toEqual([
      { actor_id: null, type: 'comment_reply', comment_id: r.id },
    ]);
    const n = await named(cara, 'named reply', { parent: top.id, replyToAnon: 1 });
    expect((await notificationsFor(ana)).at(-1)).toEqual({
      actor_id: cara.id,
      type: 'comment_reply',
      comment_id: n.id,
    });
    // Replying to your own anonymous comment doesn't notify you.
    await take(ana, 'me again', { parent: top.id, replyTo: top.id });
    expect(await notificationsFor(ana)).toHaveLength(2);
  });

  it('shows the anonymous name in the push text', async () => {
    await take(ana, 'hello');
    const [m] = await db.admin<{ body: string }>(
      `select public.push_message(n) ->> 'body' as body from public.notifications n where n.recipient_id = $1`,
      [cook.id],
    );
    expect(m!.body).toBe('Chef #01 commented on Iced Strawberry Matcha');
  });

  it('won’t let anyone write or change a Chef number directly', async () => {
    await expectDbError(
      db.query(
        ana.id,
        'insert into public.comments (post_id, author_id, anon_number, body) values ($1, null, 1, $2)',
        [postId, 'x'],
      ),
      /permission denied/,
    );
    const n = await named(ana, 'mine');
    await expectDbError(
      db.query(ana.id, 'update public.comments set anon_number = 1 where id = $1', [n.id]),
      /permission denied/,
    );
    const t = await take(ben, 'x');
    // Ben can't take over his anonymous comment's authorship, or edit it as named.
    await expectDbError(
      db.query(ben.id, 'update public.comments set author_id = $2 where id = $1', [t.id, ben.id]),
      /permission denied/,
    );
  });

  it('lets only the author delete their anonymous comment (and the creator, as for any comment)', async () => {
    const t = await take(ana, 'x');
    await expectDbError(db.query(ben.id, 'select public.delete_anonymous_take($1)', [t.id]), /not found/);
    const viaTable = await db.query(ben.id, 'delete from public.comments where id = $1 returning id', [t.id]);
    expect(viaTable).toEqual([]);
    await db.query(ana.id, 'select public.delete_anonymous_take($1)', [t.id]);
    expect(await db.admin('select id from public.comments')).toEqual([]);

    const t2 = await take(ana, 'y');
    expect(
      await db.query(cook.id, 'delete from public.comments where id = $1 returning id', [t2.id]),
    ).toHaveLength(1);
  });

  it('keeps blocks: no anonymous takes on a blocker’s posts, no notifications across a block', async () => {
    await db.query(cook.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      cook.id,
      ana.id,
    ]);
    await expectDbError(take(ana, 'sneaky'), /aren’t open/);

    // Ben blocks Cara; Cara's anonymous reply to Ben's comment doesn't reach him.
    await db.query(ben.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      ben.id,
      cara.id,
    ]);
    const top = await named(ben, 'my take');
    await take(cara, 'reply', { parent: top.id, replyTo: top.id });
    expect((await notificationsFor(ben)).filter((n) => n.type === 'comment_reply')).toEqual([]);
  });

  it('reports an anonymous comment without exposing who wrote it to the reporter', async () => {
    const t = await take(ana, 'mean');
    await db.query(
      cook.id,
      `insert into public.reports (reporter_id, target_type, target_comment_id, reason) values ($1, 'comment', $2, 'harassment')`,
      [cook.id, t.id],
    );
    await expectDbError(db.query(cook.id, 'select target_owner_id from public.reports'), /permission denied/);
    await expectDbError(db.query(cook.id, 'select target_snapshot from public.reports'), /permission denied/);
    const [r] = await db.admin<{ target_owner_id: string; target_snapshot: Record<string, unknown> }>(
      'select target_owner_id, target_snapshot from public.reports',
    );
    expect(r!.target_owner_id).toBe(ana.id);
    expect(r!.target_snapshot).toMatchObject({ body: 'mean', anonymous_name: 'Chef #01' });
    expect(r!.target_snapshot).not.toHaveProperty('owner_username');
  });

  it('accepts the new report reasons', async () => {
    const t = await take(ana, 'x');
    for (const [user, reason] of [
      [ben, 'hate'],
      [cara, 'threats'],
    ] as const) {
      await db.query(
        user.id,
        `insert into public.reports (reporter_id, target_type, target_comment_id, reason) values ($1, 'comment', $2, $3)`,
        [user.id, t.id, reason],
      );
    }
  });
});

describe('abuse limits', () => {
  it('caps anonymous takes per post per hour', async () => {
    for (let i = 0; i < 8; i++) await take(ana, `take ${i}`);
    await expectDbError(take(ana, 'one more'), /a lot of takes on one post/);
  });

  it('rejects the same anonymous take again after the retry window', async () => {
    const first = await take(ben, 'Recipe?');
    await db.admin(`update public.comments set created_at = now() - interval '5 minutes' where id = $1`, [
      first.id,
    ]);
    await expectDbError(take(ben, 'recipe? '), /already posted/);
    // Named comments can repeat (a second "😂" is fine).
    await named(ben, 'Recipe?');
    await named(ben, 'Recipe?');
  });

  it('caps all comments per hour', async () => {
    await db.admin(`insert into public.app_config (key, value) values ('comments.hourly_limit', '3')`);
    await named(ben, 'a');
    await named(ben, 'b');
    await take(ben, 'c');
    await expectDbError(named(ben, 'd'), /commenting a lot/);
    await expectDbError(take(ben, 'e'), /commenting a lot/);
  });

  it('blocks suspended accounts', async () => {
    await db.admin('update public.profiles set suspended_at = now() where id = $1', [ana.id]);
    await expectDbError(take(ana, 'x'), /suspended|aren’t open/);
  });

  it('runs the blocked-terms filter on anonymous takes', async () => {
    await db.admin(`insert into public.moderation_terms (term) values ('zorblax')`);
    await expectDbError(take(ana, 'you zorblax'), /isn't allowed/);
  });
});

describe('moderation', () => {
  let mod: TestUser;
  let reportId: string;
  let takeId: string;

  beforeEach(async () => {
    mod = await db.createUser('mod');
    await db.admin('insert into public.moderators (user_id) values ($1)', [mod.id]);
    takeId = (await take(ana, 'awful')).id;
    reportId = (
      await db.query<{ id: string }>(
        ben.id,
        `insert into public.reports (reporter_id, target_type, target_comment_id, reason)
         values ($1, 'comment', $2, 'harassment') returning id`,
        [ben.id, takeId],
      )
    )[0]!.id;
  });

  const detail = async () =>
    (
      await db.query<{ d: Record<string, any> }>(mod.id, 'select public.admin_report_detail($1) d', [
        reportId,
      ])
    )[0]!.d;

  it('lists and shows the comment by its Chef name, with the author hidden until revealed', async () => {
    const list = await db.query<{ owner_username: string }>(
      mod.id,
      'select owner_username from public.admin_reports()',
    );
    expect(list[0]!.owner_username).toBe('Chef #01 (anonymous)');
    const searched = await db.query(mod.id, `select id from public.admin_reports(p_search => 'ana')`);
    expect(searched).toEqual([]);

    const d = await detail();
    expect(d.author).toBeNull();
    expect(d.report).toMatchObject({ anonymous: true, identity_revealed: false });
    expect(d.current.anonymous_name).toBe('Chef #01');
    expect(d.current.thread).toEqual([expect.objectContaining({ name: 'Chef #01', is_reported: true })]);
  });

  it('reveals the account only to moderators, with a reason, and records it', async () => {
    await expectDbError(
      db.query(cook.id, 'select public.admin_reveal_anonymous_author($1, $2)', [reportId, 'curious who']),
      /moderators only|permission denied/,
    );
    await expectDbError(
      db.query(mod.id, 'select public.admin_reveal_anonymous_author($1, $2)', [reportId, '']),
      /say why/,
    );
    const [r] = await db.query<{ a: Record<string, any> }>(
      mod.id,
      'select public.admin_reveal_anonymous_author($1, $2) a',
      [reportId, 'Repeated harassment reports'],
    );
    expect(r!.a).toMatchObject({ id: ana.id, username: 'ana', reports_against: 1 });
    expect(r!.a.recent_reports).toEqual([expect.objectContaining({ id: reportId, anonymous: true })]);

    const d = await detail();
    expect(d.author.username).toBe('ana');
    expect(d.history).toEqual([
      expect.objectContaining({
        action: 'reveal_identity',
        moderator: 'mod',
        note: 'Repeated harassment reports',
      }),
    ]);
  });

  it('removes the comment, and suspends the author only after a recorded reveal', async () => {
    await db.query(mod.id, `select public.admin_moderate_report($1, 'remove', 'open', 'Harassment')`, [
      reportId,
    ]);
    const hidden = await db.query(cara.id, 'select id from public.comments where id = $1', [takeId]);
    expect(hidden).toEqual([]);

    const second = await take(ana, 'still awful');
    const r2 = (
      await db.query<{ id: string }>(
        ben.id,
        `insert into public.reports (reporter_id, target_type, target_comment_id, reason)
         values ($1, 'comment', $2, 'threats') returning id`,
        [ben.id, second.id],
      )
    )[0]!.id;
    await expectDbError(
      db.query(mod.id, `select public.admin_moderate_report($1, 'suspend_author', 'open', 'x')`, [r2]),
      /reveal who wrote it first/,
    );
    await db.query(mod.id, 'select public.admin_reveal_anonymous_author($1, $2)', [r2, 'Threats']);
    await db.query(mod.id, `select public.admin_moderate_report($1, 'suspend_author', 'open', 'Threats')`, [
      r2,
    ]);

    const [p] = await db.admin<{ suspended_at: string | null }>(
      'select suspended_at from public.profiles where id = $1',
      [ana.id],
    );
    expect(p!.suspended_at).not.toBeNull();
    // Their anonymous comments are hidden like their named ones.
    const [c] = await db.admin<{ hidden_reason: string }>(
      'select hidden_reason from public.comments where id = $1',
      [second.id],
    );
    expect(c!.hidden_reason).toBe('Account suspended');
    const [status] = await db.admin<{ status: string }>('select status from public.reports where id = $1', [
      r2,
    ]);
    expect(status!.status).toBe('actioned');

    // Unsuspending brings them back.
    await db.query(mod.id, `select public.moderate('user', $1, 'unsuspend', '')`, [ana.id]);
    const [back] = await db.admin<{ hidden_at: string | null }>(
      'select hidden_at from public.comments where id = $1',
      [second.id],
    );
    expect(back!.hidden_at).toBeNull();
  });
});
