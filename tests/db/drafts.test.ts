import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb, type TestUser } from './harness';

/**
 * Drafts are `posts` rows with status = 'draft'. They must round-trip every
 * field through save_post, and belong to their author alone: nobody else can
 * read, edit, publish, delete or interact with them, whatever the visibility.
 */

let db: TestDb;
let author: TestUser;
let follower: TestUser;
let stranger: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  author = await db.createUser('drafter');
  follower = await db.createUser('fan');
  stranger = await db.createUser('stranger');
  await db.follow(follower.id, author.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

const saveAs = (userId: string, post: Record<string, unknown>, images: unknown[] = [], tags: string[] = [], categories: string[] | null = null) =>
  db.query(userId, 'select public.save_post($1::jsonb, $2::jsonb, $3::text[], $4::uuid[])', [
    JSON.stringify(post),
    JSON.stringify(images),
    tags,
    categories,
  ]);

async function fullDraft() {
  const id = randomUUID();
  const imageIds = [randomUUID(), randomUUID()];
  const images = imageIds.map((imageId, i) => ({
    id: imageId,
    storage_path: `${author.id}/${id}/${imageId}.jpg`,
    thumb_path: `${author.id}/${id}/${imageId}_thumb.jpg`,
    width: 1000 + i,
    height: 1200 + i,
  }));
  const cooking = await db.categoryId('primary', 'cooking');
  const subs = await db.admin<{ id: string }>(
    'select id from public.categories where parent_id = $1 order by id limit 1',
    [cooking],
  );
  const post = {
    id,
    title: 'Half-finished lasagna',
    primary_category_id: cooking,
    rating: 7.5,
    review: 'Needs more salt',
    story: 'Started at midnight.',
    visibility: 'followers',
    status: 'draft',
    made_on: '2026-10-20',
    would_make_again: true,
    recipe_url: 'https://example.com/lasagna',
    ingredients: 'pasta, sauce',
    prep_notes: 'old note',
    next_time_notes: 'rest it longer',
    cook_time_minutes: 90,
    is_budget: true,
    budget_cost_cents: 320,
  };
  await saveAs(author.id, post, images, ['comfort food', 'weeknight'], subs.map((s) => s.id));
  return { id, post, images, categoryIds: subs.map((s) => s.id) };
}

describe('draft persistence', () => {
  it('keeps every field, photo, tag and category for the author', async () => {
    const { id, post, images, categoryIds } = await fullDraft();
    const [row] = await db.query<Record<string, unknown>>(author.id, 'select * from public.posts where id = $1', [id]);
    expect(row).toMatchObject({
      title: post.title,
      status: 'draft',
      review: post.review,
      story: post.story,
      visibility: 'followers',
      would_make_again: true,
      recipe_url: post.recipe_url,
      ingredients: post.ingredients,
      prep_notes: post.prep_notes,
      next_time_notes: post.next_time_notes,
      cook_time_minutes: 90,
      is_budget: true,
      budget_cost_cents: 320,
      published_at: null,
    });
    expect(Number(row.rating)).toBe(7.5);

    const savedImages = await db.query<{ id: string; width: number }>(
      author.id,
      'select id, width from public.post_images where post_id = $1 order by position',
      [id],
    );
    expect(savedImages.map((i) => i.id)).toEqual(images.map((i) => i.id));

    const tags = await db.query<{ name: string }>(
      author.id,
      'select t.name from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = $1 order by t.name',
      [id],
    );
    expect(tags.map((t) => t.name)).toEqual(['comfort food', 'weeknight']);

    const cats = await db.query<{ category_id: string }>(
      author.id,
      'select category_id from public.post_categories where post_id = $1',
      [id],
    );
    expect(cats.map((c) => c.category_id)).toEqual(categoryIds);
  });

  it('saving a draft again updates it in place and keeps it a draft', async () => {
    const { id, post } = await fullDraft();
    await saveAs(author.id, { ...post, title: 'Lasagna, take two', rating: null });
    const rows = await db.query<{ title: string; status: string; rating: string | null }>(
      author.id,
      'select title, status, rating from public.posts where id = $1',
      [id],
    );
    expect(rows).toEqual([{ title: 'Lasagna, take two', status: 'draft', rating: null }]);
  });

  it('lists only the signed-in author’s drafts', async () => {
    await fullDraft();
    await db.createPost(stranger.id, { status: 'draft', rating: null });
    const mine = await db.query<{ author_id: string }>(
      author.id,
      `select author_id from public.posts where status = 'draft'`,
    );
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((r) => r.author_id === author.id)).toBe(true);
  });

  it('the author can publish and delete their own draft', async () => {
    const { id, post } = await fullDraft();
    await saveAs(author.id, { ...post, status: 'published' });
    const [published] = await db.admin<{ status: string }>('select status from public.posts where id = $1', [id]);
    expect(published.status).toBe('published');

    const other = await fullDraft();
    const deleted = await db.query(author.id, 'delete from public.posts where id = $1 returning id', [other.id]);
    expect(deleted).toHaveLength(1);
    expect(await db.admin('select 1 from public.post_images where post_id = $1', [other.id])).toHaveLength(0);
  });
});

describe('draft privacy', () => {
  let draftId: string;
  let draft: Record<string, unknown>;

  beforeAll(async () => {
    const created = await fullDraft();
    draftId = created.id;
    draft = created.post;
    for (const image of created.images) {
      for (const name of [image.storage_path, image.thumb_path]) {
        await db.admin(`insert into storage.objects (bucket_id, name, owner) values ('post-images', $1, $2)`, [
          name,
          author.id,
        ]);
      }
    }
  });

  for (const who of ['follower', 'stranger'] as const) {
    const user = () => (who === 'follower' ? follower : stranger);

    it(`${who} cannot read the draft or anything attached to it`, async () => {
      const u = user().id;
      expect(await db.query(u, 'select id from public.posts where id = $1', [draftId])).toHaveLength(0);
      expect(await db.query(u, 'select id from public.post_images where post_id = $1', [draftId])).toHaveLength(0);
      expect(await db.query(u, 'select tag_id from public.post_tags where post_id = $1', [draftId])).toHaveLength(0);
      expect(
        await db.query(u, 'select category_id from public.post_categories where post_id = $1', [draftId]),
      ).toHaveLength(0);
      expect(
        await db.query(u, `select name from storage.objects where bucket_id = 'post-images' and name like $1`, [
          `%/${draftId}/%`,
        ]),
      ).toHaveLength(0);
    });

    it(`${who} cannot edit, publish or delete the draft`, async () => {
      const u = user().id;
      expect(
        await db.query(u, `update public.posts set title = 'hijacked' where id = $1 returning id`, [draftId]),
      ).toHaveLength(0);
      expect(await db.query(u, 'delete from public.posts where id = $1 returning id', [draftId])).toHaveLength(0);
      await expectDbError(saveAs(u, { ...draft, title: 'hijacked', status: 'published' }));
      await expectDbError(saveAs(u, { ...draft, title: 'hijacked' }));

      const [row] = await db.admin<{ title: string; status: string; author_id: string }>(
        'select title, status, author_id from public.posts where id = $1',
        [draftId],
      );
      expect(row).toEqual({ title: draft.title, status: 'draft', author_id: author.id });
    });

    it(`${who} cannot like, comment on or save the draft`, async () => {
      const u = user().id;
      await expectDbError(
        db.query(u, 'insert into public.likes (user_id, post_id) values ($1, $2)', [u, draftId]),
      );
      await expectDbError(
        db.query(u, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'hi')`, [draftId, u]),
      );
      await expectDbError(
        db.query(u, 'insert into public.saved_posts (user_id, post_id) values ($1, $2)', [u, draftId]),
      );
    });
  }

  it('a draft never shows up in the author’s public diary for others', async () => {
    const rows = await db.query<{ id: string }>(
      stranger.id,
      'select id from public.diary_posts($1, null, null, null, 50)',
      [author.id],
    );
    expect(rows.map((r) => r.id)).not.toContain(draftId);
  });
});
