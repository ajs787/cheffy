import { randomUUID } from 'node:crypto';

import { expectDbError, TestDb } from './harness';

// Each test gets its own database: OG slots are global and permanent.
let db: TestDb;

beforeEach(async () => {
  db = await TestDb.create();
}, 60_000);

afterEach(async () => {
  await db.close();
});

const slots = async () =>
  (
    await db.admin<{ slot: number; username: string | null }>(
      `select o.slot, p.username from public.og_chefs o left join public.profiles p on p.id = o.user_id order by o.slot`,
    )
  ).map((r) => `${r.slot}:${r.username ?? '(deleted)'}`);

async function signUp(username: string, createdAt: string, confirmed = true) {
  const id = randomUUID();
  await db.admin(
    'insert into auth.users (id, email, created_at, email_confirmed_at) values ($1, $2, $3, $4)',
    [id, `${username}@example.test`, createdAt, confirmed ? createdAt : null],
  );
  await db.query(id, 'insert into public.profiles (id, username, display_name) values ($1, $2, $2)', [
    id,
    username,
  ]);
  return id;
}

describe('OG Chef', () => {
  it('goes to the first ten confirmed accounts, in order, and stops', async () => {
    for (let i = 1; i <= 12; i++) await signUp(`cook${i}`, `2026-10-${String(i).padStart(2, '0')}T00:00:00Z`);
    expect(await slots()).toEqual(Array.from({ length: 10 }, (_, i) => `${i + 1}:cook${i + 1}`));
  });

  it('skips unconfirmed accounts', async () => {
    await signUp('ghost', '2026-10-01T00:00:00Z', false);
    await signUp('real', '2026-10-02T00:00:00Z');
    expect(await slots()).toEqual(['1:real']);
  });

  it('never redistributes a slot when an OG account is deleted', async () => {
    const first = await signUp('first', '2026-10-01T00:00:00Z');
    for (let i = 2; i <= 10; i++) await signUp(`cook${i}`, `2026-10-${String(i).padStart(2, '0')}T00:00:00Z`);
    await db.query(first, 'select public.delete_account()');
    await signUp('latecomer', '2026-10-20T00:00:00Z');
    const all = await slots();
    expect(all[0]).toBe('1:(deleted)');
    expect(all).toHaveLength(10);
    expect(all.join()).not.toContain('latecomer');
  });

  it('cannot be self-assigned or edited by clients', async () => {
    const me = await signUp('myself', '2026-10-01T00:00:00Z');
    const later = randomUUID();
    await expectDbError(
      db.query(me, 'insert into public.og_chefs (slot, user_id) values (2, $1)', [me]),
      /permission denied/,
    );
    await expectDbError(db.query(me, 'delete from public.og_chefs'), /permission denied/);
    await expectDbError(db.query(me, 'select public.award_og_chef($1)', [later]), /permission denied/);
    // Everyone signed in can see who the OG Chefs are.
    expect(await db.query(me, 'select slot from public.og_chefs')).toEqual([{ slot: 1 }]);
  });
});
