import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let fan: TestUser;
let other: TestUser;
let postId: string;

type Row = {
  type: string;
  actor_id: string;
  post_id: string | null;
  comment_id: string | null;
  read_at: string | null;
};
const inbox = async (user: TestUser) =>
  db.query<Row>(
    user.id,
    'select type, actor_id, post_id, comment_id, read_at from public.notifications order by created_at',
  );
const types = async (user: TestUser) => (await inbox(user)).map((n) => n.type);
const unread = async (user: TestUser) =>
  (await db.query<{ n: number }>(user.id, 'select public.unread_notification_count() as n'))[0]!.n;

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  fan = await db.createUser('fan');
  other = await db.createUser('other');
  postId = await db.createPost(cook.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.admin('delete from public.notifications');
});

describe('notifications', () => {
  it('arrive for follows and go away on unfollow', async () => {
    await db.follow(fan.id, cook.id);
    expect(await inbox(cook)).toMatchObject([{ type: 'follow', actor_id: fan.id }]);
    await db.query(fan.id, 'delete from public.follows where follower_id = $1', [fan.id]);
    expect(await inbox(cook)).toEqual([]);
  });

  it('arrive for post likes once, and not for your own', async () => {
    await db.query(fan.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [fan.id, postId]);
    await db.query(fan.id, 'delete from public.likes where user_id = $1', [fan.id]);
    expect(await types(cook)).toEqual([]);
    await db.query(fan.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [fan.id, postId]);
    await db.query(cook.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [cook.id, postId]);
    expect(await inbox(cook)).toMatchObject([{ type: 'post_like', actor_id: fan.id, post_id: postId }]);
  });

  it('arrive for comments, replies and comment likes', async () => {
    const [{ id: top }] = await db.query<{ id: string }>(
      fan.id,
      `insert into public.comments (post_id, author_id, body) values ($1, $2, 'yum') returning id`,
      [postId, fan.id],
    );
    await db.query(cook.id, 'insert into public.comment_likes (user_id, comment_id) values ($1, $2)', [
      cook.id,
      top,
    ]);
    await db.query(
      cook.id,
      `insert into public.comments (post_id, author_id, body, parent_id, reply_to_user_id) values ($1, $2, 'thanks!', $3, $4)`,
      [postId, cook.id, top, fan.id],
    );
    expect(await types(cook)).toEqual(['comment']);
    expect(await types(fan)).toEqual(['comment_like', 'comment_reply']);
    // Deleting the comment takes its notifications with it.
    await db.query(fan.id, 'delete from public.comments where id = $1', [top]);
    expect(await types(cook)).toEqual([]);
    expect(await types(fan)).toEqual([]);
  });

  it('cover follow requests: request, then accepted', async () => {
    await db.query(cook.id, 'update public.profiles set is_private = true where id = $1', [cook.id]);
    await db.query(other.id, 'select public.follow_user($1)', [cook.id]);
    expect(await types(cook)).toEqual(['follow_request']);
    await db.query(cook.id, 'select public.accept_follow_request($1)', [other.id]);
    // The request notification is done; the requester hears it was accepted.
    expect(await types(cook)).toEqual([]);
    expect(await inbox(other)).toMatchObject([{ type: 'follow_accepted', actor_id: cook.id }]);
    await db.query(cook.id, 'update public.profiles set is_private = false where id = $1', [cook.id]);
  });

  it('remove a declined or cancelled request', async () => {
    await db.query(cook.id, 'update public.profiles set is_private = true where id = $1', [cook.id]);
    const late = await db.createUser('late');
    await db.query(late.id, 'select public.follow_user($1)', [cook.id]);
    await db.query(late.id, 'delete from public.follow_requests where requester_id = $1', [late.id]);
    expect(await types(cook)).toEqual([]);
    await db.query(cook.id, 'update public.profiles set is_private = false where id = $1', [cook.id]);
  });

  it('are private to the recipient and can be marked read', async () => {
    await db.follow(other.id, fan.id);
    expect(await inbox(cook)).toEqual([]);
    expect(await unread(fan)).toBe(1);
    await db.query(fan.id, 'select public.mark_notifications_read()');
    expect(await unread(fan)).toBe(0);
    expect((await inbox(fan))[0]!.read_at).not.toBeNull();
  });

  it('cannot be forged by clients', async () => {
    await expectDbError(
      db.query(
        fan.id,
        `insert into public.notifications (recipient_id, actor_id, type) values ($1, $2, 'follow')`,
        [cook.id, fan.id],
      ),
      /permission denied/,
    );
    await expectDbError(
      db.query(fan.id, `select public.notify($1, $2, 'follow')`, [cook.id, fan.id]),
      /permission denied/,
    );
  });

  it('hide anyone you have blocked', async () => {
    const pest = await db.createUser('pest2');
    await db.follow(pest.id, cook.id);
    expect(await types(cook)).toContain('follow');
    await db.query(cook.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [
      cook.id,
      pest.id,
    ]);
    expect((await inbox(cook)).some((n) => n.actor_id === pest.id)).toBe(false);
  });
});
