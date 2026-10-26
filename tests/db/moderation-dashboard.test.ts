import { expectDbError, TestDb, type TestUser } from './harness';

let db: TestDb;
let mod: TestUser;
let author: TestUser;
let reporter: TestUser;
let other: TestUser;

type ReportRow = { id: string; status: string; priority: string; target_reports: number; preview: string };

const report = async (
  user: TestUser,
  type: 'post' | 'comment' | 'user',
  id: string,
  reason = 'inappropriate',
  details = '',
) =>
  (
    await db.query<{ id: string }>(
      user.id,
      `insert into public.reports (reporter_id, target_type, target_post_id, target_comment_id, target_user_id, reason, details)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [
        user.id,
        type,
        type === 'post' ? id : null,
        type === 'comment' ? id : null,
        type === 'user' ? id : null,
        reason,
        details,
      ],
    )
  )[0]!.id;

const list = (user: TestUser, status = 'active') =>
  db.query<ReportRow>(user.id, 'select * from public.admin_reports($1)', [status]);
const detail = async (user: TestUser, id: string) =>
  (
    await db.query<{ d: Record<string, any> }>(user.id, 'select public.admin_report_detail($1) as d', [id])
  )[0]!.d;
const setStatus = (user: TestUser, id: string, to: string, expected: string, note = '') =>
  db.query(user.id, 'select public.admin_set_report_status($1, $2, $3, $4)', [id, to, expected, note]);
const statusOf = async (id: string) =>
  (await db.admin<{ status: string }>('select status from public.reports where id = $1', [id]))[0]!.status;

beforeEach(async () => {
  db = await TestDb.create();
  mod = await db.createUser('moddy');
  author = await db.createUser('author');
  reporter = await db.createUser('reporter');
  other = await db.createUser('other');
  await db.admin('insert into public.moderators (user_id) values ($1)', [mod.id]);
}, 60_000);

afterEach(async () => {
  await db.close();
});

describe('admin access', () => {
  it('rejects every dashboard function for ordinary users', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    for (const sql of [
      'select * from public.admin_report_counts()',
      "select * from public.admin_reports('all')",
      `select public.admin_report_detail('${id}')`,
      `select public.admin_set_report_status('${id}', 'dismissed', 'open', '')`,
      `select public.admin_add_report_note('${id}', 'hi')`,
      `select public.admin_moderate_report('${id}', 'remove', 'open', '')`,
    ]) {
      await expectDbError(db.query(reporter.id, sql), /moderators only/);
    }
    // Reporters see only their own reports, and can't touch review fields.
    expect(await db.query(other.id, 'select * from public.reports')).toEqual([]);
    await expectDbError(
      db.query(reporter.id, "update public.reports set status = 'dismissed' where id = $1", [id]),
      /permission denied/,
    );
    await expectDbError(
      db.query(reporter.id, 'select public.claim_report_alert($1)', [id]),
      /permission denied/,
    );
    await expectDbError(db.query(reporter.id, 'select * from public.moderator_emails()'), /permission denied/);
    expect(await statusOf(id)).toBe('open');
  });
});

describe('reporting', () => {
  it('keeps evidence and the owner even if the content is later deleted', async () => {
    const postId = await db.createPost(author.id, { title: 'Bad Post', review: 'nasty words' }, { images: 1 });
    const id = await report(reporter, 'post', postId, 'harassment', 'see the review');
    await db.query(author.id, 'delete from public.posts where id = $1', [postId]);
    const d = await detail(mod, id);
    expect(d.snapshot.title).toBe('Bad Post');
    expect(d.snapshot.review).toBe('nasty words');
    expect(d.snapshot.images).toHaveLength(1);
    expect(d.snapshot.owner_username).toBe('author');
    expect(d.current.exists).toBe(false);
    expect(d.report.details).toBe('see the review');
    expect(d.author.username).toBe('author');
    // Reporter identity is never part of the detail.
    expect(JSON.stringify(d)).not.toContain(reporter.id);
  });

  it('scrubs the evidence when the author deletes their account', async () => {
    const commentPost = await db.createPost(other.id);
    const commentId = (
      await db.query<{ id: string }>(
        author.id,
        'insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id',
        [commentPost, author.id, 'mean comment'],
      )
    )[0]!.id;
    const id = await report(reporter, 'comment', commentId);
    await db.admin('delete from auth.users where id = $1', [author.id]);
    const d = await detail(mod, id);
    expect(d.snapshot).toEqual({ scrubbed: true, note: 'Author deleted their account' });
    expect(JSON.stringify(d)).not.toContain('mean comment');
  });

  it('allows one active report per person per target, and validates the target', async () => {
    const postId = await db.createPost(author.id);
    await report(reporter, 'post', postId);
    await expectDbError(report(reporter, 'post', postId), /duplicate key/);
    await report(other, 'post', postId);
    await expectDbError(
      db.query(
        reporter.id,
        `insert into public.reports (reporter_id, target_type, target_post_id, target_user_id, reason)
         values ($1, 'post', $2, $3, 'spam')`,
        [reporter.id, postId, author.id],
      ),
      /reports_target_matches_type/,
    );
    await expectDbError(
      db.query(
        reporter.id,
        `insert into public.reports (reporter_id, target_type, target_post_id, reason, status)
         values ($1, 'post', $2, 'spam', 'dismissed')`,
        [reporter.id, postId],
      ),
      /permission denied/,
    );
  });
});

describe('queue', () => {
  it('counts, prioritises urgent first then oldest, and filters', async () => {
    const spamPost = await db.createPost(author.id, { title: 'Spammy' });
    const harassPost = await db.createPost(author.id, { title: 'Mean' });
    const spam = await report(reporter, 'post', spamPost, 'spam');
    const harass = await report(reporter, 'post', harassPost, 'harassment');
    const profile = await report(reporter, 'user', author.id, 'other', 'fake account');

    const rows = await list(mod);
    expect(rows.map((r) => r.id)).toEqual([harass, spam, profile]);
    expect(rows.map((r) => r.priority)).toEqual(['urgent', 'low', 'normal']);
    expect(rows[1]!.preview).toBe('Spammy');

    const counts = (await db.query<Record<string, number>>(mod.id, 'select * from public.admin_report_counts()'))[0]!;
    expect(Number(counts.pending)).toBe(3);
    expect(Number(counts.urgent)).toBe(1);

    expect(
      (await db.query<ReportRow>(mod.id, "select * from public.admin_reports('active', 'user')")).map((r) => r.id),
    ).toEqual([profile]);
    expect(
      (await db.query<ReportRow>(mod.id, "select * from public.admin_reports('all', null, null, null, null, null, 'spam')")).map(
        (r) => r.id,
      ),
    ).toEqual([spam]);
    // A second reporter makes the spam report urgent.
    await report(other, 'post', spamPost, 'spam');
    expect((await list(mod)).find((r) => r.id === spam)!.priority).toBe('urgent');
  });

  it('flags reports pending more than 24 hours as overdue', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId, 'spam');
    await db.admin("update public.reports set created_at = now() - interval '25 hours' where id = $1", [id]);
    const row = (await db.query<{ overdue: boolean }>(mod.id, "select overdue from public.admin_reports('active')"))[0]!;
    expect(row.overdue).toBe(true);
  });
});

describe('review workflow', () => {
  it('moves a report through review, records who and when, and logs each step', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    await setStatus(mod, id, 'reviewed', 'open');
    await db.query(mod.id, 'select public.admin_add_report_note($1, $2)', [id, 'checking with the author']);
    await setStatus(mod, id, 'dismissed', 'reviewed', 'not against the guidelines');

    const row = (
      await db.admin<{ status: string; reviewed_by: string; reviewed_at: string; resolution_note: string }>(
        'select status, reviewed_by, reviewed_at, resolution_note from public.reports where id = $1',
        [id],
      )
    )[0]!;
    expect(row).toMatchObject({ status: 'dismissed', reviewed_by: mod.id, resolution_note: 'not against the guidelines' });
    expect(row.reviewed_at).not.toBeNull();

    const history = (await detail(mod, id)).history as { action: string; moderator: string }[];
    expect(history.map((h) => h.action)).toEqual(['review', 'note', 'dismiss']);
    expect(history.every((h) => h.moderator === 'moddy')).toBe(true);
  });

  it('is idempotent and refuses to overwrite another moderator’s change', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    await setStatus(mod, id, 'reviewed', 'open');
    await setStatus(mod, id, 'reviewed', 'open'); // same change again: no-op
    await expectDbError(setStatus(mod, id, 'dismissed', 'open'), /changed by someone else/);
    await expectDbError(setStatus(mod, id, 'closed', 'reviewed'), /invalid status/);
    const actions = await db.admin('select 1 from public.moderation_actions where report_id = $1', [id]);
    expect(actions).toHaveLength(1);
  });

  it('needs a note to reopen a closed report', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    await setStatus(mod, id, 'dismissed', 'open');
    await expectDbError(setStatus(mod, id, 'open', 'dismissed'), /add a note/);
    await setStatus(mod, id, 'open', 'dismissed', 'second look');
    expect(await statusOf(id)).toBe('open');
  });

  it('removes and restores content from a report without deleting it', async () => {
    const postId = await db.createPost(author.id, {}, { images: 2 });
    const id = await report(reporter, 'post', postId);
    const second = await report(other, 'post', postId);
    await db.query(mod.id, 'select public.admin_moderate_report($1, $2, $3, $4)', [id, 'remove', 'open', 'gore']);
    const post = (await db.admin<{ status: string; removed_reason: string }>(
      'select status, removed_reason from public.posts where id = $1', [postId],
    ))[0]!;
    expect(post).toEqual({ status: 'removed', removed_reason: 'gore' });
    // Photos and the post row are kept (reversible); both reports resolved.
    expect(await db.admin('select 1 from public.post_images where post_id = $1', [postId])).toHaveLength(2);
    expect(await statusOf(id)).toBe('actioned');
    expect(await statusOf(second)).toBe('actioned');
    // Hidden from everyone else.
    expect(await db.query(other.id, 'select 1 from public.posts where id = $1', [postId])).toEqual([]);

    await db.query(mod.id, 'select public.admin_moderate_report($1, $2, $3, $4)', [id, 'restore', 'actioned', 'appeal ok']);
    expect((await db.admin<{ status: string }>('select status from public.posts where id = $1', [postId]))[0]!.status).toBe(
      'published',
    );
    const log = await db.admin<{ action: string; report_id: string }>(
      'select action, report_id from public.moderation_actions where target_id = $1 order by created_at', [postId],
    );
    expect(log).toEqual([
      { action: 'remove', report_id: id },
      { action: 'restore', report_id: id },
    ]);
  });

  it('hides a reported comment and refuses to suspend a moderator', async () => {
    const postId = await db.createPost(other.id);
    const commentId = (
      await db.query<{ id: string }>(
        author.id,
        'insert into public.comments (post_id, author_id, body) values ($1, $2, $3) returning id',
        [postId, author.id, 'rude'],
      )
    )[0]!.id;
    const id = await report(reporter, 'comment', commentId, 'harassment');
    await db.query(mod.id, 'select public.admin_moderate_report($1, $2, $3, $4)', [id, 'remove', 'open', '']);
    expect(await db.query(other.id, 'select 1 from public.comments where id = $1', [commentId])).toEqual([]);

    const modReport = await report(reporter, 'user', mod.id, 'other');
    const mod2 = await db.createUser('moddy2');
    await db.admin('insert into public.moderators (user_id) values ($1)', [mod2.id]);
    await expectDbError(
      db.query(mod2.id, 'select public.admin_moderate_report($1, $2, $3, $4)', [modReport, 'suspend', 'open', '']),
      /moderators can't be suspended/,
    );
  });
});

describe('audit trail', () => {
  it('cannot be edited or deleted, even by the database owner', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    await setStatus(mod, id, 'dismissed', 'open', 'fine');
    await expectDbError(db.admin("update public.moderation_actions set note = 'changed'"), /can't be changed/);
    await expectDbError(db.admin('delete from public.moderation_actions'), /can't be changed/);
    // A moderator deleting their account only clears the moderator column.
    await db.admin('delete from public.moderators where user_id = $1', [mod.id]);
    await db.admin('delete from auth.users where id = $1', [mod.id]);
    const log = await db.admin<{ moderator_id: string | null; note: string }>(
      'select moderator_id, note from public.moderation_actions where report_id = $1', [id],
    );
    expect(log).toEqual([{ moderator_id: null, note: 'fine' }]);
  });
});

describe('alerts', () => {
  it('claims each report once for alerting', async () => {
    const postId = await db.createPost(author.id);
    const id = await report(reporter, 'post', postId);
    const claim = () =>
      db.admin<{ claimed: boolean; pending: number }>('select * from public.claim_report_alert($1)', [id]);
    expect((await claim())[0]).toMatchObject({ claimed: true, pending: 1 });
    expect((await claim())[0]!.claimed).toBe(false);
    await db.admin('select public.release_report_alert($1)', [id]);
    expect((await claim())[0]!.claimed).toBe(true);
    expect(await db.admin('select * from public.moderator_emails()')).toEqual([{ email: 'moddy@example.test' }]);
  });
});

describe('moderator photo access', () => {
  it('lets moderators read photos of removed posts; others still cannot', async () => {
    const postId = await db.createPost(author.id, {}, { images: 1 });
    const path = (await db.admin<{ storage_path: string }>(
      'select storage_path from public.post_images where post_id = $1', [postId],
    ))[0]!.storage_path;
    await db.admin("insert into storage.objects (bucket_id, name) values ('post-images', $1)", [path]);
    const id = await report(reporter, 'post', postId);
    await db.query(mod.id, 'select public.admin_moderate_report($1, $2, $3, $4)', [id, 'remove', 'open', '']);
    const canRead = async (user: TestUser) =>
      (await db.query(user.id, "select 1 from storage.objects where bucket_id = 'post-images' and name = $1", [path]))
        .length === 1;
    expect(await canRead(mod)).toBe(true);
    expect(await canRead(other)).toBe(false);
  });
});
