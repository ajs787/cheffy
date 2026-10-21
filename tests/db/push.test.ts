import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let cook: TestUser;
let fan: TestUser;
let postId: string;

beforeAll(async () => {
  db = await TestDb.create();
  cook = await db.createUser('cook');
  fan = await db.createUser('fan');
  postId = await db.createPost(cook.id, { title: 'Iced Matcha' });
}, 60_000);

afterAll(async () => {
  await db.close();
});

const token = 'ExponentPushToken[abc123_DEF-xyz]';

describe('push tokens', () => {
  it('register for the caller, move between accounts, and stay private', async () => {
    await db.query(cook.id, `select public.register_push_token($1, 'ios')`, [token]);
    expect(await db.query(cook.id, 'select token from public.push_tokens')).toEqual([{ token }]);
    // Same phone, different account: the token follows the person signed in.
    await db.query(fan.id, `select public.register_push_token($1, 'ios')`, [token]);
    expect(await db.query(cook.id, 'select token from public.push_tokens')).toEqual([]);
    expect(await db.query(fan.id, 'select token from public.push_tokens')).toEqual([{ token }]);
  });

  it('reject anything that is not an Expo push token', async () => {
    await expectDbError(
      db.query(cook.id, `select public.register_push_token('not a token', 'ios')`),
      /invalid push token/,
    );
  });

  it('cannot be written directly', async () => {
    await expectDbError(
      db.query(cook.id, `insert into public.push_tokens (token, user_id, platform) values ('x', $1, 'ios')`, [
        cook.id,
      ]),
      /permission denied/,
    );
  });
});

describe('push content and preferences', () => {
  it('say who did what and link to it', async () => {
    await db.query(fan.id, 'insert into public.likes (user_id, post_id) values ($1, $2)', [fan.id, postId]);
    const [row] = await db.admin<{ m: { body: string; data: { path: string } } }>(
      `select public.push_message(n) as m from public.notifications n where n.type = 'post_like' and n.recipient_id = $1`,
      [cook.id],
    );
    expect(row!.m.body).toBe('fan liked your Iced Matcha');
    expect(row!.m.data.path).toBe(`/post/${postId}`);
  });

  it('respect each person’s preferences (default on)', async () => {
    const wanted = async (type: string) =>
      (await db.admin<{ w: boolean }>('select public.push_wanted($1, $2) as w', [cook.id, type]))[0]!.w;
    expect(await wanted('post_like')).toBe(true);
    await db.query(
      cook.id,
      'insert into public.notification_preferences (user_id, likes) values ($1, false)',
      [cook.id],
    );
    expect(await wanted('post_like')).toBe(false);
    expect(await wanted('comment_like')).toBe(false);
    expect(await wanted('follow')).toBe(true);
    expect(await db.query(fan.id, 'select * from public.notification_preferences')).toEqual([]);
  });

  it('can be upserted by the owner, never for someone else', async () => {
    const upsert = (user: TestUser, target: TestUser, likes: boolean) =>
      db.query(
        user.id,
        `insert into public.notification_preferences (user_id, follows, likes, comments) values ($1, true, $2, true)
         on conflict (user_id) do update set user_id = excluded.user_id, likes = excluded.likes`,
        [target.id, likes],
      );
    await upsert(fan, fan, false);
    await upsert(fan, fan, true);
    await expectDbError(upsert(fan, cook, true), /row-level security/);
  });

  it('keep the delivery helpers server-only', async () => {
    await expectDbError(
      db.query(fan.id, 'select public.push_wanted($1, $2)', [cook.id, 'follow']),
      /permission denied/,
    );
  });
});
