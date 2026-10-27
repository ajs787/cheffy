/**
 * "For Your Taste" (taste_topics, taste_posts) and the mutual count on
 * suggested_friends. Runs the real migrations with RLS.
 */
import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let me: TestUser;
let cook: TestUser;
let other: TestUser;

type Topic = { kind: string; name: string; post_count: string | number; personal: boolean };
const topics = (user: TestUser) =>
  db.query<Topic>(user.id, 'select kind, name, post_count, personal from public.taste_topics(30)');
const tastePosts = (user: TestUser, limit = 20, offset = 0) =>
  db.query<{ post_id: string; score: number }>(user.id, 'select post_id, score from public.taste_posts($1, $2)', [
    limit,
    offset,
  ]);

beforeEach(async () => {
  db = await TestDb.create();
  me = await db.createUser('taster');
  cook = await db.createUser('cook');
  other = await db.createUser('other');
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('taste_topics', () => {
  it('puts the viewer’s own interests first and counts only posts they can browse', async () => {
    await db.createPost(me.id, {}, { tags: ['matcha'] });
    await db.createPost(cook.id, {}, { tags: ['matcha'] });
    await db.createPost(other.id, {}, { tags: ['matcha'] });
    for (let i = 0; i < 3; i++) await db.createPost(cook.id, { title: `Pasta ${i}` }, { tags: ['pasta'] });
    await db.createPost(cook.id, {}, { tags: ['lonely'] }); // a single post isn't a suggestion

    const rows = await topics(me);
    const names = rows.map((r) => r.name);
    expect(names[0]).toBe('matcha');
    expect(rows[0]!.personal).toBe(true);
    // Two other people's posts; the viewer's own isn't counted (Browse leaves it out too).
    expect(Number(rows[0]!.post_count)).toBe(2);
    expect(names).toContain('pasta');
    expect(rows.find((r) => r.name === 'pasta')!.personal).toBe(false);
    expect(names).not.toContain('lonely');
  });

  it('never surfaces tags that only appear on private, blocked or draft posts', async () => {
    const secret = await db.createUser('secret');
    await db.admin('update public.profiles set is_private = true where id = $1', [secret.id]);
    await db.createPost(secret.id, {}, { tags: ['hidden'] });
    await db.createPost(secret.id, {}, { tags: ['hidden'] });
    await db.createPost(cook.id, { visibility: 'private' }, { tags: ['diary'] });
    await db.createPost(cook.id, { visibility: 'private' }, { tags: ['diary'] });
    await db.createPost(other.id, { status: 'draft', rating: null }, { tags: ['unfinished'] });
    await db.createPost(other.id, { status: 'draft', rating: null }, { tags: ['unfinished'] });
    const blocker = await db.createUser('blocker');
    await db.createPost(blocker.id, {}, { tags: ['grudge'] });
    await db.createPost(blocker.id, {}, { tags: ['grudge'] });
    await db.query(blocker.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      blocker.id,
      me.id,
    ]);

    const names = (await topics(me)).map((r) => r.name);
    expect(names).not.toContain('hidden');
    expect(names).not.toContain('diary');
    expect(names).not.toContain('unfinished');
    expect(names).not.toContain('grudge');
  });

  it('shows one chip per name across tags and cuisines', async () => {
    const korean = await db.categoryId('cuisine', 'korean');
    await db.createPost(cook.id, {}, { tags: ['korean'], categories: [korean] });
    await db.createPost(other.id, {}, { tags: ['korean'], categories: [korean] });
    const rows = (await topics(me)).filter((r) => r.name.toLowerCase() === 'korean');
    expect(rows).toHaveLength(1);
  });

  it('offers Budget Eats only when there are budget posts to browse', async () => {
    expect((await topics(me)).map((r) => r.kind)).not.toContain('budget');
    await db.createPost(cook.id, { is_budget: true });
    await db.createPost(other.id, { is_budget: true });
    const budget = (await topics(me)).find((r) => r.kind === 'budget');
    expect(budget?.name).toBe('Budget Eats');
    expect(Number(budget?.post_count)).toBe(2);
  });

  it('is not callable without signing in', async () => {
    for (const sql of ['select * from public.taste_topics(5)', 'select * from public.taste_posts(5, 0)']) {
      await expectDbError(
        db.pg.transaction(async (tx) => {
          await tx.exec('set local role anon');
          await tx.query(sql);
        }),
        /permission denied/,
      );
    }
  });
});

describe('taste_posts', () => {
  it('ranks creations that match the viewer’s taste above others', async () => {
    await db.createPost(me.id, {}, { tags: ['matcha'], images: 1 });
    const match = await db.createPost(cook.id, { rating: 8 }, { tags: ['matcha'], images: 1 });
    const plain = await db.createPost(other.id, { rating: 8 }, { tags: ['stew'], images: 1 });
    const ids = (await tastePosts(me)).map((r) => r.post_id);
    expect(ids.indexOf(match)).toBeLessThan(ids.indexOf(plain));
  });

  it('leaves out own, liked, saved, photo-less, private and removed posts', async () => {
    const mine = await db.createPost(me.id, {}, { images: 1 });
    const liked = await db.createPost(cook.id, {}, { images: 1 });
    const saved = await db.createPost(cook.id, {}, { images: 1 });
    const noPhoto = await db.createPost(cook.id);
    const privatePost = await db.createPost(other.id, { visibility: 'private' }, { images: 1 });
    const removed = await db.createPost(other.id, {}, { images: 1 });
    const visible = await db.createPost(other.id, {}, { images: 1 });
    await db.query(me.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [me.id, liked]);
    await db.query(me.id, 'insert into public.saved_posts (user_id, post_id) values ($1, $2)', [me.id, saved]);
    await db.admin("update public.posts set status = 'removed' where id = $1", [removed]);

    const ids = (await tastePosts(me)).map((r) => r.post_id);
    expect(ids).toEqual([visible]);
    for (const hidden of [mine, liked, saved, noPhoto, privatePost, removed]) expect(ids).not.toContain(hidden);
  });

  it('gives each cook at most two spots before anyone’s third', async () => {
    for (let i = 0; i < 4; i++) await db.createPost(cook.id, { rating: 10 }, { images: 1 });
    const theirs = await db.createPost(other.id, { rating: 6 }, { images: 1 });
    const ids = (await tastePosts(me)).map((r) => r.post_id);
    expect(ids).toHaveLength(5);
    expect(ids.slice(0, 3)).toContain(theirs);
  });

  it('pages without repeats', async () => {
    for (let i = 0; i < 5; i++) await db.createPost(i % 2 ? cook.id : other.id, {}, { images: 1 });
    const pages = [...(await tastePosts(me, 2, 0)), ...(await tastePosts(me, 2, 2)), ...(await tastePosts(me, 2, 4))];
    expect(new Set(pages.map((r) => r.post_id)).size).toBe(5);
  });
});

describe('suggested_friends mutual_count', () => {
  it('counts how many people you follow follow them', async () => {
    const target = await db.createUser('target');
    await db.follow(me.id, cook.id);
    await db.follow(me.id, other.id);
    await db.follow(cook.id, target.id);
    await db.follow(other.id, target.id);
    const rows = await db.query<{ user_id: string; mutual_count: number }>(
      me.id,
      'select user_id, mutual_count from public.suggested_friends(20)',
    );
    expect(rows.find((r) => r.user_id === target.id)?.mutual_count).toBe(2);
  });
});

describe('search_creations', () => {
  it('puts title matches above tag-only matches, exact first', async () => {
    const tagOnly = await db.createPost(cook.id, { title: 'Green drink' }, { tags: ['matcha'] });
    const contains = await db.createPost(cook.id, { title: 'Iced strawberry matcha' });
    const exact = await db.createPost(other.id, { title: 'Matcha' });
    const prefix = await db.createPost(other.id, { title: 'Matcha latte' });
    const rows = await db.query<{ post_id: string }>(
      me.id,
      "select post_id from public.search_creations('matcha', 0, 20)",
    );
    expect(rows.map((r) => r.post_id)).toEqual([exact, prefix, contains, tagOnly]);
  });

  it('never returns posts the viewer cannot see', async () => {
    await db.createPost(cook.id, { title: 'Secret matcha', visibility: 'private' });
    const rows = await db.query(me.id, "select post_id from public.search_creations('matcha', 0, 20)");
    expect(rows).toEqual([]);
  });
});
