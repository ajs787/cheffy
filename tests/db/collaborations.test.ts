import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let audrey: TestUser;
let sophie: TestUser;
let mallory: TestUser;
let fan: TestUser;

const invite = (by: TestUser, post: string, users: TestUser[]) =>
  db.query(by.id, 'select public.invite_collaborators($1, $2::uuid[])', [post, users.map((u) => u.id)]);
const respond = (user: TestUser, post: string, accept: boolean) =>
  db.query(user.id, 'select public.respond_to_collaboration($1, $2)', [post, accept]);
const rate = (user: TestUser, post: string, rating: number, review = '') =>
  db.query(user.id, 'select public.set_my_evaluation($1, $2, $3)', [post, rating, review]);
const status = async (post: string, user: TestUser) =>
  (
    await db.admin<{ status: string }>(
      'select status from public.post_collaborators where post_id = $1 and user_id = $2',
      [post, user.id],
    )
  )[0]?.status;
const types = async (user: TestUser) =>
  (
    await db.query<{ type: string }>(user.id, 'select type from public.notifications order by created_at')
  ).map((n) => n.type);

beforeAll(async () => {
  db = await TestDb.create();
  audrey = await db.createUser('audrey');
  sophie = await db.createUser('sophie');
  mallory = await db.createUser('mallory');
  fan = await db.createUser('fan');
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe('inviting', () => {
  it('only the creator can invite, and only to a published post', async () => {
    const post = await db.createPost(audrey.id, { title: 'Homemade Tiramisu' });
    await expectDbError(invite(mallory, post, [mallory]), /only the creator/);
    await expectDbError(invite(sophie, post, [sophie]), /only the creator/);
    const draft = await db.createPost(audrey.id, { status: 'draft' });
    await expectDbError(invite(audrey, draft, [sophie]), /publish the creation/);
    await expectDbError(invite(audrey, post, [audrey]), /already the creator/);
  });

  it('cannot be forged by writing rows directly', async () => {
    const post = await db.createPost(audrey.id);
    await expectDbError(
      db.query(
        mallory.id,
        `insert into public.post_collaborators (post_id, user_id, status, invited_by) values ($1, $2, 'accepted', $3)`,
        [post, mallory.id, audrey.id],
      ),
      /permission denied/,
    );
    await expectDbError(
      db.query(
        mallory.id,
        `insert into public.post_evaluations (post_id, user_id, rating) values ($1, $2, 10)`,
        [post, mallory.id],
      ),
      /permission denied/,
    );
  });

  it('notifies the invitee, who can see the post before deciding', async () => {
    const post = await db.createPost(audrey.id, { visibility: 'private', title: 'Secret Tiramisu' });
    await invite(audrey, post, [sophie]);
    expect(await status(post, sophie)).toBe('pending');
    expect(await types(sophie)).toContain('collab_invite');
    expect(await db.query(sophie.id, 'select id from public.posts where id = $1', [post])).toHaveLength(1);
    // Nobody else gains access.
    expect(await db.query(fan.id, 'select id from public.posts where id = $1', [post])).toHaveLength(0);
  });

  it('caps a creation at 5 collaborators', async () => {
    const post = await db.createPost(audrey.id);
    const many = await Promise.all(['cook1', 'cook2', 'cook3', 'cook4', 'cook5', 'cook6'].map((n) => db.createUser(n)));
    await expectDbError(invite(audrey, post, many), /at most 5/);
  });

  it('respects blocks', async () => {
    const post = await db.createPost(audrey.id);
    const blocked = await db.createUser('blocked');
    await db.query(blocked.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      blocked.id,
      audrey.id,
    ]);
    await expectDbError(invite(audrey, post, [blocked]), /can't be invited/);
  });
});

describe('responding', () => {
  it('accepting makes a co-creator, tells the creator, and is the invitee’s choice alone', async () => {
    const post = await db.createPost(audrey.id);
    await invite(audrey, post, [sophie]);
    await expectDbError(respond(mallory, post, true), /no pending invitation/);
    await respond(sophie, post, true);
    expect(await status(post, sophie)).toBe('accepted');
    expect(await types(audrey)).toContain('collab_accepted');
    // The invite is answered, so it leaves Sophie's inbox.
    expect((await types(sophie)).filter((t) => t === 'collab_invite')).toHaveLength(1);
  });

  it('declining keeps them out; re-inviting asks again', async () => {
    const post = await db.createPost(audrey.id, { visibility: 'private' });
    await invite(audrey, post, [sophie]);
    await respond(sophie, post, false);
    expect(await status(post, sophie)).toBe('declined');
    expect(await db.query(sophie.id, 'select id from public.posts where id = $1', [post])).toHaveLength(0);
    await invite(audrey, post, [sophie]);
    expect(await status(post, sophie)).toBe('pending');
  });
});

describe('ratings', () => {
  it('each co-creator rates independently and never overwrites another', async () => {
    const post = await db.createPost(audrey.id, { rating: 9 });
    await invite(audrey, post, [sophie]);
    await expectDbError(rate(sophie, post, 8), /only accepted collaborators/);
    await respond(sophie, post, true);
    await rate(sophie, post, 7.46, '  a bit too sweet  ');
    const [mine] = await db.admin<{ rating: string; review: string }>(
      'select rating, review from public.post_evaluations where post_id = $1 and user_id = $2',
      [post, sophie.id],
    );
    expect(mine).toEqual({ rating: '7.5', review: 'a bit too sweet' });
    const [p] = await db.admin<{ rating: string }>('select rating from public.posts where id = $1', [post]);
    expect(Number(p!.rating)).toBe(9);
    await expectDbError(rate(mallory, post, 1), /only accepted collaborators/);
  });

  it('each person’s rankings use their own rating', async () => {
    const chef = await db.createUser('chef');
    const pal = await db.createUser('pal');
    const shared = await db.createPost(chef.id, { title: 'Shared', rating: 9 });
    const solo = await db.createPost(pal.id, { title: 'Solo', rating: 8 });
    await invite(chef, shared, [pal]);
    await respond(pal, shared, true);
    // Unrated collaborations aren't ranked yet.
    let ranked = await db.query<{ post_id: string; rating?: string }>(pal.id, 'select post_id from public.get_rankings($1)', [
      pal.id,
    ]);
    expect(ranked.map((r) => r.post_id)).toEqual([solo]);
    await rate(pal, shared, 6);
    ranked = await db.query<{ post_id: string; rating: string }>(
      pal.id,
      'select post_id, rating from public.get_rankings($1)',
      [pal.id],
    );
    expect(ranked.map((r) => [r.post_id, Number(r.rating)])).toEqual([
      [solo, 8],
      [shared, 6],
    ]);
    const chefRanks = await db.query<{ rating: string }>(
      chef.id,
      'select rating from public.get_rankings($1)',
      [chef.id],
    );
    expect(chefRanks.map((r) => Number(r.rating))).toEqual([9]);
  });
});

describe('shared creation in diaries, stats and feeds', () => {
  it('appears for each accepted collaborator, once', async () => {
    const chef = await db.createUser('chef2');
    const pal = await db.createUser('pal2');
    const follower = await db.createUser('follower2');
    await db.follow(follower.id, pal.id);
    const post = await db.createPost(chef.id, { title: 'Shared' });
    await invite(chef, post, [pal]);
    // Pending doesn't count yet.
    expect(await db.query(pal.id, 'select id from public.diary_posts($1)', [pal.id])).toHaveLength(0);
    await respond(pal, post, true);
    expect(
      (await db.query<{ id: string }>(pal.id, 'select id from public.diary_posts($1)', [pal.id])).map(
        (r) => r.id,
      ),
    ).toEqual([post]);
    const [stats] = await db.query<{ s: { posts: number } }>(
      follower.id,
      'select public.profile_stats($1) as s',
      [pal.id],
    );
    expect(stats!.s.posts).toBe(1);
    const feed = await db.query<{ id: string }>(follower.id, 'select id from public.feed_posts()');
    expect(feed.filter((r) => r.id === post)).toHaveLength(1);
  });

  it('likes and comments stay on the one shared post', async () => {
    const chef = await db.createUser('chef3');
    const pal = await db.createUser('pal3');
    const post = await db.createPost(chef.id);
    await invite(chef, post, [pal]);
    await respond(pal, post, true);
    await db.query(fan.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [fan.id, post]);
    const [p] = await db.admin<{ like_count: number }>('select like_count from public.posts where id = $1', [
      post,
    ]);
    expect(p!.like_count).toBe(1);
    // Still exactly one post row: nothing was copied to the collaborator.
    expect(await db.admin('select id from public.posts where author_id = $1', [pal.id])).toHaveLength(0);
  });
});

describe('leaving and editing', () => {
  it('a collaborator can leave; the creation and creator stay, their rating goes', async () => {
    const chef = await db.createUser('chef4');
    const pal = await db.createUser('pal4');
    const post = await db.createPost(chef.id, { visibility: 'private' });
    await invite(chef, post, [pal]);
    await respond(pal, post, true);
    await rate(pal, post, 8);
    await db.query(pal.id, 'select public.remove_collaborator($1, $2)', [post, pal.id]);
    expect(await status(post, pal)).toBe('removed');
    expect(await db.admin('select 1 from public.posts where id = $1', [post])).toHaveLength(1);
    expect(await db.admin('select 1 from public.post_evaluations where post_id = $1', [post])).toHaveLength(
      0,
    );
    // Access ends with the collaboration.
    expect(await db.query(pal.id, 'select id from public.posts where id = $1', [post])).toHaveLength(0);
  });

  it('only the creator removes others or edits shared details', async () => {
    const chef = await db.createUser('chef5');
    const pal = await db.createUser('pal5');
    const other = await db.createUser('other5');
    const post = await db.createPost(chef.id, { title: 'Original' });
    await invite(chef, post, [pal, other]);
    await respond(pal, post, true);
    await respond(other, post, true);
    await expectDbError(
      db.query(pal.id, 'select public.remove_collaborator($1, $2)', [post, other.id]),
      /only the creator/,
    );
    const updated = await db.query(
      pal.id,
      `update public.posts set title = 'Hijacked' where id = $1 returning id`,
      [post],
    );
    expect(updated).toEqual([]);
    await expectDbError(
      db.query(pal.id, 'select public.save_post($1::jsonb)', [
        JSON.stringify({ id: post, title: 'Hijacked' }),
      ]),
      /post not found|row-level security|permission/,
    );
    await db.query(chef.id, 'select public.remove_collaborator($1, $2)', [post, other.id]);
    expect(await status(post, other)).toBe('removed');
  });

  it('pending and declined invitations stay private to creator and invitee', async () => {
    const chef = await db.createUser('chef6');
    const pal = await db.createUser('pal6');
    const post = await db.createPost(chef.id);
    await invite(chef, post, [pal]);
    expect(
      await db.query(fan.id, 'select * from public.post_collaborators where post_id = $1', [post]),
    ).toEqual([]);
    await respond(pal, post, true);
    expect(
      await db.query(fan.id, 'select user_id from public.post_collaborators where post_id = $1', [post]),
    ).toEqual([{ user_id: pal.id }]);
  });
});
