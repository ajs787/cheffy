import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb } from './harness';

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create();
}, 60_000);

afterAll(async () => {
  await db.close();
});

/** Signs up the way the app does: terms version in the auth metadata. */
async function signUp(username: string, meta: Record<string, unknown>) {
  const id = randomUUID();
  await db.admin(
    `insert into auth.users (id, email, created_at, raw_user_meta_data)
     values ($1, $2, '2026-10-01T12:00:00Z', $3::jsonb)`,
    [id, `${username}@example.test`, JSON.stringify(meta)],
  );
  await db.query(id, 'insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [
    id,
    username,
  ]);
  return id;
}

const terms = async (id: string) =>
  (
    await db.admin<{ terms_version: string | null; terms_accepted_at: Date | null }>(
      'select terms_version, terms_accepted_at from public.profiles where id = $1',
      [id],
    )
  )[0]!;

describe('terms acceptance', () => {
  it('records the version accepted at sign-up, timed at account creation', async () => {
    const id = await signUp('agreer', { terms_version: '2026-10-18' });
    const row = await terms(id);
    expect(row.terms_version).toBe('2026-10-18');
    expect(row.terms_accepted_at?.toISOString()).toBe('2026-10-01T12:00:00.000Z');
  });

  it('cannot be faked when creating or editing the profile', async () => {
    const id = randomUUID();
    await db.admin('insert into auth.users (id, email) values ($1, $2)', [id, 'faker@example.test']);
    // Terms columns can't be written by the client at all.
    await expectDbError(
      db.query(
        id,
        `insert into public.profiles (id, username, display_name, terms_version, terms_accepted_at)
         values ($1, 'faker', 'faker', '2099-01-01', now())`,
        [id],
      ),
      /permission denied/,
    );
    await db.query(id, `insert into public.profiles (id, username, display_name) values ($1, 'faker', 'faker')`, [id]);
    expect((await terms(id)).terms_version).toBeNull();
    await expectDbError(
      db.query(id, `update public.profiles set terms_version = 'x' where id = $1`, [id]),
      /permission denied/,
    );
  });

  it('accept_terms records a newer version for the caller only', async () => {
    const id = await signUp('updater', { terms_version: '2026-10-18' });
    await db.query(id, `select public.accept_terms('2027-01-01')`);
    expect((await terms(id)).terms_version).toBe('2027-01-01');
    await expectDbError(db.query(id, `select public.accept_terms('')`), /invalid terms version/);
  });
});
