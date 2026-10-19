import { TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let friend: TestUser;
let stranger: TestUser;
let ids: Record<string, string>;
let cat: Record<string, string>;

interface RankingRow {
  rank: string;
  total_count: string;
  post_id: string;
  title: string;
  rating: string;
  primary_slug: string;
  secondary_name: string | null;
  thumb_path: string | null;
}

const rankings = (viewer: string, args: Record<string, unknown> = {}) =>
  db.query<RankingRow>(
    viewer,
    `select * from public.get_rankings(
       p_user_id => $1, p_primary_id => $2, p_category_id => $3, p_tag_id => $4,
       p_sort => $5, p_limit => $6, p_offset => $7)`,
    [
      args.user ?? cook.id,
      args.primary ?? null,
      args.category ?? null,
      args.tag ?? null,
      args.sort ?? 'highest',
      args.limit ?? 30,
      args.offset ?? 0,
    ],
  );

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  friend = await db.createUser('friend');
  stranger = await db.createUser('stranger2');
  await db.follow(friend.id, cook.id);

  cat = {
    cooking: await db.categoryId('primary', 'cooking'),
    baking: await db.categoryId('primary', 'baking'),
    drinks: await db.categoryId('primary', 'drinks'),
    cookies: await db.categoryId('subcategory', 'cookies', 'baking'),
    matcha: await db.categoryId('subcategory', 'matcha', 'drinks'),
    korean: await db.categoryId('cuisine', 'korean'),
  };

  ids = {
    cookies: await db.createPost(
      cook.id,
      { title: 'Brown Butter Cookies', primary_category_id: cat.baking, subcategory_id: cat.cookies, rating: 9.8, made_on: '2026-01-20' },
      { images: 1, tags: ['dessert'] },
    ),
    ribs: await db.createPost(cook.id, {
      title: 'Korean Short Ribs',
      primary_category_id: cat.cooking,
      cuisine_id: cat.korean,
      rating: 9.6,
      made_on: '2026-02-01',
    }),
    matchaOld: await db.createPost(cook.id, {
      title: 'Iced Strawberry Matcha',
      primary_category_id: cat.drinks,
      subcategory_id: cat.matcha,
      rating: 8.9,
      made_on: '2026-01-01',
    }),
    // Same rating as matchaOld but made later → ranks higher on the tie-break.
    matchaNew: await db.createPost(cook.id, {
      title: 'Matcha Latte',
      primary_category_id: cat.drinks,
      subcategory_id: cat.matcha,
      rating: 8.9,
      made_on: '2026-03-01',
      visibility: 'followers',
    }),
    focaccia: await db.createPost(cook.id, {
      title: 'Homemade Focaccia',
      primary_category_id: cat.baking,
      rating: 7.1,
      made_on: '2026-02-15',
      visibility: 'private',
    }),
    draft: await db.createPost(cook.id, { title: 'Draft', status: 'draft', rating: null }),
  };
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('rankings', () => {
  it('ranks by rating with a deterministic tie-break and excludes drafts', async () => {
    const rows = await rankings(cook.id);
    expect(rows.map((r) => r.title)).toEqual([
      'Brown Butter Cookies',
      'Korean Short Ribs',
      'Matcha Latte',
      'Iced Strawberry Matcha',
      'Homemade Focaccia',
    ]);
    expect(rows.map((r) => Number(r.rank))).toEqual([1, 2, 3, 4, 5]);
    expect(Number(rows[0].total_count)).toBe(5);
    expect(rows[0].thumb_path).toMatch(/_thumb\.jpg$/);
    expect(rows[0].secondary_name).toBe('Cookies');
    expect(rows[1].secondary_name).toBe('Korean');
  });

  it('filters by primary category and recomputes ranks within the filter', async () => {
    const rows = await rankings(cook.id, { primary: cat.drinks });
    expect(rows.map((r) => [Number(r.rank), r.title])).toEqual([
      [1, 'Matcha Latte'],
      [2, 'Iced Strawberry Matcha'],
    ]);
  });

  it('filters by subcategory, cuisine and tag', async () => {
    expect((await rankings(cook.id, { category: cat.korean })).map((r) => r.title)).toEqual(['Korean Short Ribs']);
    expect((await rankings(cook.id, { category: cat.matcha })).length).toBe(2);
    const [tag] = await db.admin<{ id: string }>(`select id from public.tags where slug = 'dessert'`);
    expect((await rankings(cook.id, { tag: tag.id })).map((r) => r.title)).toEqual(['Brown Butter Cookies']);
  });

  it('sorts by lowest, most recent and oldest while keeping rating ranks', async () => {
    const lowest = await rankings(cook.id, { sort: 'lowest' });
    expect(lowest.map((r) => Number(r.rank))).toEqual([5, 4, 3, 2, 1]);

    const recent = await rankings(cook.id, { sort: 'recent' });
    expect(recent.map((r) => r.title)[0]).toBe('Matcha Latte');
    expect(Number(recent[0].rank)).toBe(3);

    const oldest = await rankings(cook.id, { sort: 'oldest' });
    expect(oldest.map((r) => r.title)[0]).toBe('Iced Strawberry Matcha');
  });

  it('paginates', async () => {
    const page2 = await rankings(cook.id, { limit: 2, offset: 2 });
    expect(page2.map((r) => Number(r.rank))).toEqual([3, 4]);
  });

  it("respects visibility when browsing a friend's rankings", async () => {
    const friendView = await rankings(friend.id);
    expect(friendView.map((r) => r.title)).toEqual([
      'Brown Butter Cookies',
      'Korean Short Ribs',
      'Matcha Latte',
      'Iced Strawberry Matcha',
    ]);
    const strangerView = await rankings(stranger.id);
    expect(strangerView.map((r) => [Number(r.rank), r.title])).toEqual([
      [1, 'Brown Butter Cookies'],
      [2, 'Korean Short Ribs'],
      [3, 'Iced Strawberry Matcha'],
    ]);
  });

  it('ranking_filters lists only dimensions the user has used', async () => {
    const rows = await db.query<{ kind: string; slug: string }>(cook.id, 'select * from public.ranking_filters($1)', [
      cook.id,
    ]);
    expect(rows.map((r) => `${r.kind}:${r.slug}`).sort()).toEqual([
      'cuisine:korean',
      'subcategory:cookies',
      'subcategory:matcha',
      'tag:dessert',
    ]);
  });
});

describe('profile stats', () => {
  it('counts only posts the viewer can see', async () => {
    const [{ stats: own }] = await db.query<{ stats: { posts: number; followers: number; by_primary: { slug: string; count: number }[] } }>(
      cook.id,
      'select public.profile_stats($1) as stats',
      [cook.id],
    );
    expect(own.posts).toBe(5);
    expect(own.followers).toBe(1);
    expect(own.by_primary).toEqual([
      { slug: 'cooking', name: 'Cooking', count: 1 },
      { slug: 'baking', name: 'Baking', count: 2 },
      { slug: 'drinks', name: 'Drinks', count: 2 },
    ]);
    const [{ stats: theirs }] = await db.query<{ stats: { posts: number } }>(
      stranger.id,
      'select public.profile_stats($1) as stats',
      [cook.id],
    );
    expect(theirs.posts).toBe(3);
  });
});

describe('feed', () => {
  it("shows followed users' visible posts newest first, plus your own", async () => {
    const ownPost = await db.createPost(friend.id, { title: 'My own toast' });
    const rows = await db.query<{ id: string; title: string }>(friend.id, 'select id, title from public.feed_posts()');
    expect(rows[0].id).toBe(ownPost);
    expect(rows.map((r) => r.id)).not.toContain(ids.focaccia);
    expect(rows.map((r) => r.id)).not.toContain(ids.draft);
    expect(rows.map((r) => r.id)).toContain(ids.matchaNew);
    expect(rows).toHaveLength(5);
  });

  it('is empty for someone who follows nobody and has no posts', async () => {
    expect(await db.query(stranger.id, 'select * from public.feed_posts()')).toHaveLength(0);
  });

  it('paginates with a stable cursor', async () => {
    const all = await db.query<{ id: string; published_at: Date }>(friend.id, 'select id, published_at from public.feed_posts()');
    const first = await db.query<{ id: string; published_at: Date }>(
      friend.id,
      'select id, published_at from public.feed_posts(p_limit => 2)',
    );
    const last = first[first.length - 1];
    const next = await db.query<{ id: string }>(
      friend.id,
      'select id from public.feed_posts(p_before => $1, p_before_id => $2, p_limit => 2)',
      [last.published_at, last.id],
    );
    expect([...first.map((r) => r.id), ...next.map((r) => r.id)]).toEqual(all.slice(0, 4).map((r) => r.id));
  });
});

describe('discover & search', () => {
  it("discover excludes your own posts and respects visibility", async () => {
    const rows = await db.query<{ id: string }>(stranger.id, 'select id from public.discover_posts()');
    const visible = rows.map((r) => r.id);
    expect(visible).toContain(ids.cookies);
    expect(visible).not.toContain(ids.matchaNew);
    expect(visible).not.toContain(ids.focaccia);
    const own = await db.query<{ id: string }>(cook.id, 'select id from public.discover_posts()');
    expect(own.map((r) => r.id)).not.toContain(ids.cookies);
  });

  it('top sort orders by rating and category filter matches subcategories', async () => {
    const top = await db.query<{ title: string }>(stranger.id, `select title from public.discover_posts(p_sort => 'top')`);
    expect(top[0].title).toBe('Brown Butter Cookies');
    const matcha = await db.query<{ title: string }>(
      friend.id,
      'select title from public.discover_posts(p_category_id => $1)',
      [cat.matcha],
    );
    expect(matcha.map((r) => r.title).sort()).toEqual(['Iced Strawberry Matcha', 'Matcha Latte']);
  });

  it('loved sort only includes posts with likes', async () => {
    await db.query(friend.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [friend.id, ids.ribs]);
    const loved = await db.query<{ id: string }>(stranger.id, `select id from public.discover_posts(p_sort => 'loved')`);
    expect(loved.map((r) => r.id)).toEqual([ids.ribs]);
  });

  it('search matches name, tag and category names, case-insensitively', async () => {
    const search = async (q: string) =>
      (await db.query<{ title: string }>(stranger.id, 'select title from public.search_posts($1)', [q])).map((r) => r.title);
    expect(await search('cookies')).toEqual(['Brown Butter Cookies']);
    expect(await search('DESSERT')).toEqual(['Brown Butter Cookies']);
    expect(await search('korean')).toEqual(['Korean Short Ribs']);
    expect(await search('matcha')).toEqual(['Iced Strawberry Matcha']);
    expect(await search('%')).toEqual([]);
    expect(await search('a')).toEqual([]);
  });

  it('trending taxonomy only reports categories with enough visible posts', async () => {
    const rows = await db.query<{ slug: string; post_count: number }>(
      friend.id,
      'select slug, post_count from public.trending_taxonomy(p_min_posts => 2)',
    );
    expect(rows).toEqual([{ slug: 'matcha', post_count: 2 }]);
    const strangerRows = await db.query(stranger.id, 'select * from public.trending_taxonomy(p_min_posts => 2)');
    expect(strangerRows).toHaveLength(0);
  });

  it('suggested cooks are people you do not follow who have visible posts', async () => {
    const rows = await db.query<{ id: string }>(stranger.id, 'select id from public.suggested_cooks()');
    expect(rows.map((r) => r.id)).toEqual([cook.id, friend.id]);
    const friendRows = await db.query<{ id: string }>(friend.id, 'select id from public.suggested_cooks()');
    expect(friendRows.map((r) => r.id)).not.toContain(cook.id);
  });
});
