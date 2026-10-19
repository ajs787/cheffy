import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  db = await TestDb.create();
  alice = await db.createUser('alice');
  bob = await db.createUser('bob');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('profiles', () => {
  it('enforces username format and uniqueness', async () => {
    const id = randomUUID();
    await db.admin('insert into auth.users (id, email) values ($1, $2)', [id, 'x@example.test']);
    const insert = (username: string) =>
      db.query(id, 'insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
        id,
        username,
        'X',
      ]);
    await expectDbError(insert('Has Caps'), /profiles_username_format/);
    await expectDbError(insert('ab'), /profiles_username_format/);
    await expectDbError(insert('.dot'), /profiles_username_format/);
    await expectDbError(insert('alice'), /profiles_username_key/);
  });

  it('only lets users create their own profile', async () => {
    const id = randomUUID();
    await db.admin('insert into auth.users (id, email) values ($1, $2)', [id, 'y@example.test']);
    await expectDbError(
      db.query(alice.id, 'insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
        id,
        'imposter',
        'Imposter',
      ]),
      /row-level security/,
    );
  });

  it("cannot edit someone else's profile", async () => {
    const rows = await db.query(bob.id, `update public.profiles set bio = 'hacked' where id = $1 returning id`, [
      alice.id,
    ]);
    expect(rows).toHaveLength(0);
    const [profile] = await db.admin<{ bio: string }>('select bio from public.profiles where id = $1', [alice.id]);
    expect(profile.bio).toBe('');
  });

  it('reports username availability', async () => {
    const [taken] = await db.query<{ ok: boolean }>(bob.id, `select public.username_available('ALICE ') as ok`);
    const [free] = await db.query<{ ok: boolean }>(bob.id, `select public.username_available('newname') as ok`);
    expect(taken.ok).toBe(false);
    expect(free.ok).toBe(true);
  });
});

describe('creating posts', () => {
  it('creates a post with images and normalized tags', async () => {
    const postId = await db.createPost(alice.id, {}, { images: 2, tags: ['Iced', 'Oat Milk', 'oat-milk', ' iced '] });
    const [post] = await db.admin<{ author_id: string; rating: string; published_at: string | null }>(
      'select author_id, rating, published_at from public.posts where id = $1',
      [postId],
    );
    expect(post.author_id).toBe(alice.id);
    expect(Number(post.rating)).toBe(9.2);
    expect(post.published_at).not.toBeNull();

    const tags = await db.admin<{ slug: string }>(
      'select t.slug from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = $1 order by 1',
      [postId],
    );
    expect(tags.map((t) => t.slug)).toEqual(['iced', 'oat-milk']);

    const images = await db.admin<{ position: number }>(
      'select position from public.post_images where post_id = $1 order by position',
      [postId],
    );
    expect(images.map((i) => i.position)).toEqual([0, 1]);
  });

  it('ignores a forged author_id and attributes the post to the caller', async () => {
    const postId = await db.createPost(alice.id, { author_id: bob.id });
    const [post] = await db.admin<{ author_id: string }>('select author_id from public.posts where id = $1', [postId]);
    expect(post.author_id).toBe(alice.id);
  });

  it('rejects direct inserts on behalf of someone else', async () => {
    const drinks = await db.categoryId('primary', 'drinks');
    await expectDbError(
      db.query(
        alice.id,
        `insert into public.posts (author_id, title, primary_category_id, rating) values ($1, 'x', $2, 5)`,
        [bob.id, drinks],
      ),
      /row-level security/,
    );
  });

  it.each([
    [{ rating: 10.5 }, /posts_rating_range/],
    [{ rating: -1 }, /posts_rating_range/],
    [{ rating: null }, /posts_published_requirements/],
    [{ title: '   ' }, /posts_title_length/],
    [{ title: 'x'.repeat(81) }, /posts_title_length/],
    [{ visibility: 'friends' }, /posts_visibility_check/],
    [{ recipe_url: 'javascript:alert(1)' }, /posts_recipe_url_format/],
    [{ temperature: 'warm' }, /posts_temperature_check/],
  ])('rejects invalid data %j', async (overrides, error) => {
    await expectDbError(db.createPost(alice.id, overrides), error);
  });

  it('rounds ratings to one decimal place', async () => {
    const postId = await db.createPost(alice.id, { rating: 8.25 });
    const [post] = await db.admin<{ rating: string }>('select rating from public.posts where id = $1', [postId]);
    expect(Number(post.rating)).toBe(8.3);
  });

  it('allows the full 0–10 range', async () => {
    for (const rating of [0, 10]) {
      await expect(db.createPost(alice.id, { rating })).resolves.toBeDefined();
    }
  });

  it('validates taxonomy: subcategory must belong to the primary category', async () => {
    const matcha = await db.categoryId('subcategory', 'matcha', 'drinks');
    const baking = await db.categoryId('primary', 'baking');
    await expectDbError(
      db.createPost(alice.id, { primary_category_id: baking, subcategory_id: matcha }),
      /subcategory_id must be a subcategory/,
    );
    const korean = await db.categoryId('cuisine', 'korean');
    await expectDbError(db.createPost(alice.id, { primary_category_id: korean }), /primary category/);
    await expectDbError(db.createPost(alice.id, { cuisine_id: matcha }), /must reference a cuisine/);
  });

  it('accepts a fully classified post', async () => {
    const postId = await db.createPost(alice.id, {
      title: 'Kimchi Fried Rice',
      primary_category_id: await db.categoryId('primary', 'cooking'),
      cuisine_id: await db.categoryId('cuisine', 'korean'),
      meal_type_id: await db.categoryId('meal_type', 'lunch'),
      dish_type_id: await db.categoryId('dish_type', 'rice'),
      cook_time_minutes: 20,
      recipe_url: 'https://example.com/kimchi-fried-rice',
    });
    expect(postId).toBeDefined();
  });

  it('caps images and tags', async () => {
    await expectDbError(db.createPost(alice.id, {}, { images: 7 }), /at most 6 images/);
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    await expectDbError(db.createPost(alice.id, {}, { tags }), /at most 10 tags/);
  });

  it('rejects images stored outside the author folder', async () => {
    const postId = await db.createPost(alice.id);
    await expectDbError(
      db.query(
        alice.id,
        `insert into public.post_images (post_id, storage_path, thumb_path, width, height, position)
         values ($1, $2, $3, 10, 10, 1)`,
        [postId, `${bob.id}/x.jpg`, `${bob.id}/x_thumb.jpg`],
      ),
      /row-level security/,
    );
  });

  it('clients cannot forge counters or publish dates', async () => {
    const postId = await db.createPost(alice.id);
    await expectDbError(
      db.query(alice.id, 'update public.posts set like_count = 999 where id = $1', [postId]),
      /permission denied/,
    );
    await expectDbError(
      db.query(alice.id, `update public.posts set published_at = '2000-01-01' where id = $1`, [postId]),
      /permission denied/,
    );
  });
});

describe('drafts', () => {
  it('allows drafts without a rating and hides them from everyone else', async () => {
    const draftId = await db.createPost(alice.id, { status: 'draft', rating: null });
    const [draft] = await db.admin<{ published_at: string | null }>(
      'select published_at from public.posts where id = $1',
      [draftId],
    );
    expect(draft.published_at).toBeNull();
    expect(await db.query(alice.id, 'select id from public.posts where id = $1', [draftId])).toHaveLength(1);
    expect(await db.query(bob.id, 'select id from public.posts where id = $1', [draftId])).toHaveLength(0);
  });

  it('publishing a draft sets published_at and later edits keep it', async () => {
    const id = await db.createPost(alice.id, { status: 'draft', rating: null });
    await db.query(alice.id, 'select public.save_post($1::jsonb)', [
      JSON.stringify({
        id,
        title: 'Now published',
        primary_category_id: await db.categoryId('primary', 'drinks'),
        rating: 8,
        status: 'published',
      }),
    ]);
    const [first] = await db.admin<{ published_at: Date }>('select published_at from public.posts where id = $1', [id]);
    expect(first.published_at).not.toBeNull();

    await db.query(alice.id, 'select public.save_post($1::jsonb)', [
      JSON.stringify({
        id,
        title: 'Edited',
        primary_category_id: await db.categoryId('primary', 'drinks'),
        rating: 8.5,
        status: 'published',
      }),
    ]);
    const [second] = await db.admin<{ published_at: Date }>('select published_at from public.posts where id = $1', [
      id,
    ]);
    expect(second.published_at).toEqual(first.published_at);
  });
});

describe('editing and deleting', () => {
  it('lets the author edit, reorder images and replace tags', async () => {
    const postId = await db.createPost(alice.id, {}, { images: 3, tags: ['iced'] });
    const images = await db.admin<{ id: string; storage_path: string; thumb_path: string }>(
      'select id, storage_path, thumb_path from public.post_images where post_id = $1 order by position',
      [postId],
    );
    const reordered = [images[2], images[0]].map((i) => ({ ...i, width: 10, height: 10 }));
    await db.query(alice.id, 'select public.save_post($1::jsonb, $2::jsonb, $3::text[])', [
      JSON.stringify({
        id: postId,
        title: 'Hot Matcha',
        primary_category_id: await db.categoryId('primary', 'drinks'),
        rating: 7.5,
        status: 'published',
      }),
      JSON.stringify(reordered),
      ['hot'],
    ]);
    const after = await db.admin<{ id: string }>(
      'select id from public.post_images where post_id = $1 order by position',
      [postId],
    );
    expect(after.map((i) => i.id)).toEqual([images[2].id, images[0].id]);
    const tags = await db.admin<{ slug: string }>(
      'select t.slug from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = $1',
      [postId],
    );
    expect(tags.map((t) => t.slug)).toEqual(['hot']);
  });

  it("cannot edit another user's post via RPC or direct update", async () => {
    const postId = await db.createPost(alice.id);
    await expectDbError(
      db.query(bob.id, 'select public.save_post($1::jsonb)', [
        JSON.stringify({
          id: postId,
          title: 'Mine now',
          primary_category_id: await db.categoryId('primary', 'drinks'),
          rating: 1,
        }),
      ]),
      /post not found/,
    );
    const updated = await db.query(bob.id, `update public.posts set title = 'x' where id = $1 returning id`, [postId]);
    expect(updated).toHaveLength(0);
    const [post] = await db.admin<{ title: string }>('select title from public.posts where id = $1', [postId]);
    expect(post.title).toBe('Iced Strawberry Matcha');
  });

  it("cannot delete another user's post", async () => {
    const postId = await db.createPost(alice.id);
    const deleted = await db.query(bob.id, 'delete from public.posts where id = $1 returning id', [postId]);
    expect(deleted).toHaveLength(0);
    expect(await db.admin('select id from public.posts where id = $1', [postId])).toHaveLength(1);
  });

  it('author deletion cascades to images, tags, likes and comments', async () => {
    const postId = await db.createPost(alice.id, {}, { images: 1, tags: ['cascade'] });
    await db.query(bob.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [bob.id, postId]);
    await db.query(bob.id, `insert into public.comments (post_id, author_id, body) values ($1, $2, 'yum')`, [
      postId,
      bob.id,
    ]);
    const deleted = await db.query(alice.id, 'delete from public.posts where id = $1 returning id', [postId]);
    expect(deleted).toHaveLength(1);
    for (const table of ['post_images', 'post_tags', 'likes', 'comments']) {
      expect(await db.admin(`select 1 from public.${table} where post_id = $1`, [postId])).toHaveLength(0);
    }
  });
});

describe('accounts', () => {
  it('delete_account removes the user and everything they own', async () => {
    const carol = await db.createUser('carol');
    const postId = await db.createPost(carol.id, {}, { images: 1 });
    await db.follow(carol.id, alice.id);
    await db.query(carol.id, 'select public.delete_account()');
    expect(await db.admin('select 1 from auth.users where id = $1', [carol.id])).toHaveLength(0);
    expect(await db.admin('select 1 from public.profiles where id = $1', [carol.id])).toHaveLength(0);
    expect(await db.admin('select 1 from public.posts where id = $1', [postId])).toHaveLength(0);
    expect(await db.admin('select 1 from public.follows where follower_id = $1', [carol.id])).toHaveLength(0);
  });

  it('anonymous callers have no access', async () => {
    await expectDbError(
      db.pg.transaction(async (tx) => {
        await tx.exec('set local role anon');
        await tx.query('select * from public.posts');
      }),
      /permission denied/,
    );
  });
});
