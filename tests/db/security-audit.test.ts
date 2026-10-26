/**
 * Regression tests for the 2026-10-26 security audit (SECURITY_AUDIT.md).
 * Each test asserts the secure behaviour; before the fixes they failed and
 * reproduced the issue described in the audit.
 */
import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let mod: TestUser;
let alice: TestUser; // author / blocker
let bob: TestUser; // other party
let carol: TestUser; // unrelated third party

const report = (user: TestUser, type: 'post' | 'comment' | 'user', id: string, reason = 'inappropriate') =>
  db.query<{ id: string }>(
    user.id,
    `insert into public.reports (reporter_id, target_type, target_post_id, target_comment_id, target_user_id, reason)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [user.id, type, type === 'post' ? id : null, type === 'comment' ? id : null, type === 'user' ? id : null, reason],
  );
const postStatus = async (id: string) =>
  (await db.admin<{ status: string }>('select status from public.posts where id = $1', [id]))[0]!.status;

beforeEach(async () => {
  db = await TestDb.create();
  mod = await db.createUser('moddy');
  alice = await db.createUser('alice');
  bob = await db.createUser('bob');
  carol = await db.createUser('carol');
  await db.admin('insert into public.moderators (user_id) values ($1)', [mod.id]);
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('profiles: gated columns and lifecycle', () => {
  it('cannot set unlock-gated or moderation columns when creating a profile', async () => {
    const id = randomUUID();
    await db.admin('insert into auth.users (id, email) values ($1, $2)', [id, 'sneaky@example.test']);
    await expectDbError(
      db.query(id, `insert into public.profiles (id, username, display_name, theme, frame) values ($1, 'sneaky', 'S', 'saffron', 'host')`, [id]),
      /permission denied/,
    );
    await expectDbError(
      db.query(id, `insert into public.profiles (id, username, display_name, suspended_at) values ($1, 'sneaky', 'S', now())`, [id]),
      /permission denied/,
    );
    // The normal sign-up insert still works.
    await db.query(id, `insert into public.profiles (id, username, display_name) values ($1, 'sneaky', 'S')`, [id]);
  });

  it('cannot delete their own profile row directly (account deletion goes through the Edge Function)', async () => {
    await expectDbError(db.query(bob.id, 'delete from public.profiles where id = $1', [bob.id]), /permission denied/);
  });
});

describe('suspension', () => {
  it('a suspended account cannot publish a draft with a still-valid token', async () => {
    const draft = await db.createPost(bob.id, { status: 'draft' });
    await db.query(mod.id, `select public.moderate('user', $1::uuid, 'suspend', '')`, [bob.id]);
    await expectDbError(
      db.query(bob.id, `update public.posts set status = 'published' where id = $1`, [draft]),
      /suspended|row-level security/,
    );
    expect(await postStatus(draft)).toBe('draft');
  });
});

describe('relationship helpers', () => {
  it('third parties cannot ask whether two other users blocked each other', async () => {
    await db.query(alice.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice.id, bob.id]);
    await expectDbError(db.query(carol.id, 'select public.has_blocked($1, $2)', [alice.id, bob.id]), /permission denied/);
    await expectDbError(db.query(carol.id, 'select public.is_blocked_between($1, $2)', [alice.id, bob.id]), /permission denied/);
  });

  it('collaboration status of other people is not exposed', async () => {
    const post = await db.createPost(alice.id);
    await db.query(alice.id, 'select public.invite_collaborators($1, $2::uuid[])', [post, [bob.id]]);
    await expectDbError(
      db.query(carol.id, 'select public.collaboration_status($1, $2)', [post, bob.id]),
      /permission denied/,
    );
  });

  it('blocking a co-chef ends their access to the shared post', async () => {
    const post = await db.createPost(alice.id, { visibility: 'followers' }, { images: 1 });
    await db.query(alice.id, 'select public.invite_collaborators($1, $2::uuid[])', [post, [bob.id]]);
    await db.query(bob.id, 'select public.respond_to_collaboration($1, true)', [post]);
    expect(await db.query(bob.id, 'select 1 from public.posts where id = $1', [post])).toHaveLength(1);
    await db.query(alice.id, 'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2)', [alice.id, bob.id]);
    expect(await db.query(bob.id, 'select 1 from public.posts where id = $1', [post])).toEqual([]);
    expect(await db.query(bob.id, 'select 1 from public.post_images where post_id = $1', [post])).toEqual([]);
  });
});

describe('reports', () => {
  it('reporting a post you cannot see does not reveal its content', async () => {
    const secret = await db.createPost(alice.id, { visibility: 'private', title: 'Secret Stew', review: 'hidden words' });
    expect(await db.query(carol.id, 'select 1 from public.posts where id = $1', [secret])).toEqual([]);
    // Either the report is refused, or the reporter can't read the evidence copy.
    let readable = '';
    try {
      const [{ id }] = (await report(carol, 'post', secret)) as [{ id: string }];
      const rows = await db
        .query<{ s: unknown }>(carol.id, 'select target_snapshot as s from public.reports where id = $1', [id])
        .catch(() => []);
      readable = JSON.stringify(rows);
    } catch {
      // refused: fine
    }
    expect(readable).not.toContain('Secret Stew');
    expect(readable).not.toContain('hidden words');
  });

  it('reporters cannot see who reviewed their report or the internal note', async () => {
    const post = await db.createPost(alice.id);
    const [{ id }] = (await report(carol, 'post', post)) as [{ id: string }];
    await db.query(mod.id, `select public.admin_set_report_status($1, 'dismissed', 'open', 'internal note')`, [id]);
    await expectDbError(
      db.query(carol.id, 'select reviewed_by, resolution_note from public.reports where id = $1', [id]),
      /permission denied/,
    );
    // They can still see their own report and its outcome.
    const own = await db.query<{ status: string }>(carol.id, 'select status from public.reports where id = $1', [id]);
    expect(own).toEqual([{ status: 'dismissed' }]);
  });

  it('restoring auto-hidden content is not undone by one more report', async () => {
    const post = await db.createPost(alice.id);
    const reporters = [bob, carol, await db.createUser('dave')];
    const ids: string[] = [];
    for (const r of reporters) ids.push((await report(r, 'post', post))[0]!.id);
    expect(await postStatus(post)).toBe('removed');
    await db.query(mod.id, `select public.admin_moderate_report($1, 'restore', 'open', 'fine')`, [ids[0]]);
    expect(await postStatus(post)).toBe('published');
    await report(await db.createUser('eve'), 'post', post);
    expect(await postStatus(post)).toBe('published');
  });
});

describe('storage paths', () => {
  it('rejects image paths with dot segments', async () => {
    const post = await db.createPost(alice.id);
    await expectDbError(
      db.query(
        alice.id,
        `insert into public.post_images (post_id, storage_path, thumb_path, width, height, position)
         values ($1, $2, $3, 100, 100, 9)`,
        [post, `${alice.id}/../../auth/v1/logout`, `${alice.id}/x_thumb.jpg`],
      ),
      /post_images_path_format|check constraint/,
    );
  });

  it('the author cannot delete or overwrite photos held as report evidence', async () => {
    const post = await db.createPost(alice.id, {}, { images: 1 });
    const path = (
      await db.admin<{ storage_path: string }>('select storage_path from public.post_images where post_id = $1', [post])
    )[0]!.storage_path;
    await db.admin("insert into storage.objects (bucket_id, name, owner) values ('post-images', $1, $2)", [path, alice.id]);
    await report(carol, 'post', post);
    const deleted = await db.query(
      alice.id,
      "delete from storage.objects where bucket_id = 'post-images' and name = $1 returning 1",
      [path],
    );
    expect(deleted).toEqual([]);
    expect(await db.admin("select 1 from storage.objects where bucket_id = 'post-images' and name = $1", [path])).toHaveLength(1);
  });
});
