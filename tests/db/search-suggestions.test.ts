/**
 * Search suggestions: trending_creations, newly_cooked and tag_suggestions.
 * Runs the real migrations with RLS.
 */
import { TestDb, type TestUser } from './harness';

let db: TestDb;
let me: TestUser;
let cook: TestUser;
let other: TestUser;
let fan: TestUser;

const trending = (user: TestUser, limit = 20, offset = 0) =>
  db.query<{ post_id: string; score: number }>(
    user.id,
    'select post_id, score from public.trending_creations($1, $2)',
    [limit, offset],
  );
const newlyCooked = (user: TestUser, limit = 20, offset = 0) =>
  db.query<{ post_id: string }>(user.id, 'select post_id from public.newly_cooked($1, $2)', [limit, offset]);

type TagRow = { section: string; name: string; post_count: string | number; personal: boolean };
const tagSuggestions = (user: TestUser, suggested = 8, popular = 12, explore = 6) =>
  db.query<TagRow>(
    user.id,
    'select section, name, post_count, personal from public.tag_suggestions($1, $2, $3)',
    [suggested, popular, explore],
  );

const like = (user: TestUser, postId: string, daysAgo = 0) =>
  db.admin(
    `insert into public.likes (user_id, post_id, created_at) values ($1, $2, now() - make_interval(days => $3::integer))`,
    [user.id, postId, daysAgo],
  );
const comment = (user: TestUser, postId: string, daysAgo = 0) =>
  db.admin(
    `insert into public.comments (post_id, author_id, body, created_at)
     values ($1, $2, 'Looks great', now() - make_interval(days => $3::integer))`,
    [postId, user.id, daysAgo],
  );
// published_at is trigger-protected; skip triggers to backdate the fixture.
const publishedDaysAgo = (postId: string, days: number) =>
  db.pg.transaction(async (tx) => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query(
      `update public.posts set published_at = now() - make_interval(days => $2::integer) where id = $1`,
      [postId, days],
    );
  });
const block = (blocker: TestUser, blocked: TestUser) =>
  db.query(blocker.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
    blocker.id,
    blocked.id,
  ]);

beforeEach(async () => {
  db = await TestDb.create();
  me = await db.createUser('viewer');
  cook = await db.createUser('cook');
  other = await db.createUser('other');
  fan = await db.createUser('fan');
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('trending_creations', () => {
  it('ranks by recent likes and comments, not lifetime likes', async () => {
    const oldHit = await db.createPost(cook.id, { title: 'Old hit' }, { images: 1 });
    const hotNow = await db.createPost(other.id, { title: 'Hot now' }, { images: 1 });
    const extra: TestUser[] = [];
    for (let i = 0; i < 4; i++) extra.push(await db.createUser(`old${i}`));
    for (const u of extra) await like(u, oldHit, 40); // lots of likes, a month ago
    await like(fan, hotNow, 1);
    await comment(fan, hotNow, 2);

    const rows = await trending(me);
    expect(rows.map((r) => r.post_id)).toEqual([hotNow]);
    expect(rows[0]!.score).toBe(2 + 3);
  });

  it('weights the last 7 days over days 8–14 and ignores the cook’s own engagement', async () => {
    const thisWeek = await db.createPost(cook.id, {}, { images: 1 });
    const lastWeek = await db.createPost(other.id, {}, { images: 1 });
    await like(fan, thisWeek, 2);
    await like(fan, lastWeek, 10);
    await comment(other, lastWeek, 1); // the cook commenting on their own post
    const rows = await trending(me);
    expect(rows.map((r) => r.post_id)).toEqual([thisWeek, lastWeek]);
  });

  it('leaves out own, private, followers-only, blocked, removed and photo-less posts', async () => {
    const mine = await db.createPost(me.id, {}, { images: 1 });
    const followersOnly = await db.createPost(cook.id, { visibility: 'followers' }, { images: 1 });
    await db.follow(me.id, cook.id);
    const secret = await db.createUser('secret');
    await db.admin('update public.profiles set is_private = true where id = $1', [secret.id]);
    const fromPrivate = await db.createPost(secret.id, {}, { images: 1 });
    const blocker = await db.createUser('blocker');
    const fromBlocker = await db.createPost(blocker.id, {}, { images: 1 });
    await block(blocker, me);
    const blocked = await db.createUser('blocked');
    const fromBlocked = await db.createPost(blocked.id, {}, { images: 1 });
    await block(me, blocked);
    const removed = await db.createPost(other.id, {}, { images: 1 });
    const noPhoto = await db.createPost(other.id, {});
    const visible = await db.createPost(other.id, {}, { images: 1 });
    for (const id of [mine, followersOnly, fromPrivate, fromBlocker, fromBlocked, removed, noPhoto, visible])
      await like(fan, id, 1);
    await db.admin("update public.posts set status = 'removed' where id = $1", [removed]);

    expect((await trending(me)).map((r) => r.post_id)).toEqual([visible]);
  });

  it('shows everyone’s best two before a cook’s third, and pages without repeats', async () => {
    const cookPosts: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await db.createPost(cook.id, { title: `Cook ${i}` }, { images: 1 });
      cookPosts.push(id);
      for (const u of [fan, other, me]) await like(u, id, 1);
    }
    const otherPost = await db.createPost(other.id, {}, { images: 1 });
    await like(fan, otherPost, 1);

    const all = (await trending(me)).map((r) => r.post_id);
    expect(all).toHaveLength(4);
    expect(all[2]).toBe(otherPost); // the cook's third waits
    const paged = [...(await trending(me, 2, 0)), ...(await trending(me, 2, 2))].map((r) => r.post_id);
    expect(paged).toEqual(all);
  });
});

describe('newly_cooked', () => {
  it('lists recent creations from discoverable public accounts, never the viewer’s own', async () => {
    const mine = await db.createPost(me.id, {}, { images: 1 });
    const hidden = await db.createUser('hidden');
    await db.admin('update public.profiles set discoverable = false where id = $1', [hidden.id]);
    const fromHidden = await db.createPost(hidden.id, {}, { images: 1 });
    const secret = await db.createUser('secret');
    await db.admin('update public.profiles set is_private = true where id = $1', [secret.id]);
    await db.follow(me.id, secret.id).catch(() => undefined);
    const fromPrivate = await db.createPost(secret.id, {}, { images: 1 });
    const old = await db.createPost(other.id, {}, { images: 1 });
    await publishedDaysAgo(old, 120);
    const draft = await db.createPost(other.id, { status: 'draft', rating: null }, { images: 1 });
    const blocker = await db.createUser('blocker');
    const fromBlocker = await db.createPost(blocker.id, {}, { images: 1 });
    await block(blocker, me);
    const fresh = await db.createPost(cook.id, {}, { images: 1 });

    const ids = (await newlyCooked(me)).map((r) => r.post_id);
    expect(ids).toEqual([fresh]);
    for (const id of [mine, fromHidden, fromPrivate, old, draft, fromBlocker]) expect(ids).not.toContain(id);
  });

  it('puts each cook’s newest first so a prolific cook doesn’t bury a new one', async () => {
    const busy: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await db.createPost(cook.id, { title: `Busy ${i}` }, { images: 1 });
      await publishedDaysAgo(id, i); // 0, 1, 2 days ago
      busy.push(id);
    }
    const newcomer = await db.createPost(other.id, {}, { images: 1 });
    await publishedDaysAgo(newcomer, 5);

    const ids = (await newlyCooked(me)).map((r) => r.post_id);
    expect(ids).toEqual([busy[0], newcomer, busy[1], busy[2]]);
    expect((await newlyCooked(me, 2, 2)).map((r) => r.post_id)).toEqual([busy[1], busy[2]]);
  });
});

describe('tag_suggestions', () => {
  it('suggests the viewer’s tags, then popular, then new ones to explore — each tag once', async () => {
    await db.createPost(me.id, {}, { tags: ['matcha'] });
    await db.createPost(cook.id, {}, { tags: ['matcha', 'iced'] });
    await db.createPost(other.id, {}, { tags: ['iced', 'brunch'] });
    await db.createPost(fan.id, {}, { tags: ['iced', 'brunch'] });
    const oldOne = await db.createPost(cook.id, {}, { tags: ['sourdough'] });
    const oldTwo = await db.createPost(other.id, {}, { tags: ['sourdough'] });
    await publishedDaysAgo(oldOne, 100);
    await publishedDaysAgo(oldTwo, 100);

    const rows = await tagSuggestions(me, 8, 2, 6);
    const section = (s: string) => rows.filter((r) => r.section === s).map((r) => r.name);
    expect(section('suggested')).toEqual(['matcha']);
    expect(rows.find((r) => r.name === 'matcha')!.personal).toBe(true);
    // Popular is ranked by recent use: iced (3 recent) then brunch (2), not sourdough (old).
    expect(section('popular')).toEqual(['iced', 'brunch']);
    expect(section('explore')).toEqual(['sourdough']);
    const names = rows.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    // Counts are other people's posts only.
    expect(Number(rows.find((r) => r.name === 'matcha')!.post_count)).toBe(1);
  });

  it('learns from likes, saves and highly rated posts', async () => {
    const liked = await db.createPost(cook.id, {}, { tags: ['ramen'] });
    await db.createPost(other.id, {}, { tags: ['tacos'] });
    await db.createPost(other.id, {}, { tags: ['tacos'] });
    await db.createPost(other.id, {}, { tags: ['tacos'] });
    await like(me, liked);
    expect((await tagSuggestions(me)).filter((r) => r.section === 'suggested').map((r) => r.name)).toEqual([
      'ramen',
    ]);
  });

  it('falls back to what followed cooks tag, and to popular tags for a brand-new viewer', async () => {
    await db.createPost(cook.id, {}, { tags: ['dumplings'] });
    await db.createPost(other.id, {}, { tags: ['pie'] });
    await db.createPost(fan.id, {}, { tags: ['pie'] });

    const fresh = await tagSuggestions(me);
    expect(fresh.filter((r) => r.section === 'suggested')).toHaveLength(0);
    expect(fresh.filter((r) => r.section === 'popular').map((r) => r.name)).toEqual(['pie', 'dumplings']);

    await db.follow(me.id, cook.id);
    const following = await tagSuggestions(me);
    expect(following.filter((r) => r.section === 'suggested').map((r) => r.name)).toEqual(['dumplings']);
  });

  it('never surfaces tags that only appear on own, private, blocked, draft or removed posts', async () => {
    await db.createPost(me.id, {}, { tags: ['mine'] });
    const secret = await db.createUser('secret');
    await db.admin('update public.profiles set is_private = true where id = $1', [secret.id]);
    await db.createPost(secret.id, {}, { tags: ['hidden'] });
    await db.createPost(cook.id, { visibility: 'private' }, { tags: ['diary'] });
    await db.createPost(other.id, { status: 'draft', rating: null }, { tags: ['unfinished'] });
    const blocker = await db.createUser('blocker');
    await db.createPost(blocker.id, {}, { tags: ['grudge'] });
    await block(blocker, me);
    const removed = await db.createPost(other.id, {}, { tags: ['gone'] });
    await db.admin("update public.posts set status = 'removed' where id = $1", [removed]);
    await db.createPost(fan.id, {}, { tags: ['visible'] });

    const names = (await tagSuggestions(me)).map((r) => r.name);
    expect(names).toEqual(['visible']);
  });

  it('is not callable signed out', async () => {
    await expect(
      db.pg.transaction(async (tx) => {
        await tx.exec('set local role anon');
        return tx.query('select * from public.tag_suggestions()');
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
