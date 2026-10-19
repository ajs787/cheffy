/**
 * PGlite-based test harness for Cheffy's Postgres layer.
 *
 * Runs the real migrations against an in-process Postgres (WASM) with the
 * small slice of Supabase it depends on stubbed out: the anon/authenticated
 * roles, auth.users + auth.uid(), and storage.buckets/objects. Queries made
 * through `asUser` run as the `authenticated` role with a JWT `sub` claim,
 * exactly like PostgREST does, so RLS is enforced for real.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '../../supabase/migrations');

const SUPABASE_STUBS = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create schema extensions;
  create schema storage;

  create table auth.users (
    id uuid primary key,
    email text not null unique
  );

  create function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

  grant usage on schema auth, extensions, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;

  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets (id),
    name text not null,
    owner uuid,
    created_at timestamptz not null default now(),
    unique (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to authenticated;

  create function storage.foldername(name text) returns text[]
  language plpgsql immutable
  as $$
  declare parts text[];
  begin
    parts := string_to_array(name, '/');
    return parts[1:array_length(parts, 1) - 1];
  end
  $$;
  grant execute on function storage.foldername(text) to authenticated;
`;

export type Tx = Transaction;

export interface TestUser {
  id: string;
  username: string;
}

export class TestDb {
  private constructor(readonly pg: PGlite) {}

  static async create(): Promise<TestDb> {
    const pg = await PGlite.create({ extensions: { pg_trgm } });
    await pg.exec(SUPABASE_STUBS);
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      try {
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      } catch (error) {
        throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
      }
    }
    return new TestDb(pg);
  }

  async close(): Promise<void> {
    await this.pg.close();
  }

  /** Run as the database owner (bypasses RLS) — for fixtures and assertions only. */
  async admin<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pg.query<T>(sql, params);
    return result.rows;
  }

  /** Run `fn` as an authenticated user, the way PostgREST would. */
  async asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await tx.exec('set local role authenticated');
      return fn(tx);
    });
  }

  /** Convenience: one query as a user, returning rows. */
  async query<T = Record<string, unknown>>(userId: string, sql: string, params: unknown[] = []): Promise<T[]> {
    return this.asUser(userId, async (tx) => (await tx.query<T>(sql, params)).rows);
  }

  /** Creates an auth user and their profile (through RLS, like the app does). */
  async createUser(username: string): Promise<TestUser> {
    const id = randomUUID();
    await this.admin('insert into auth.users (id, email) values ($1, $2)', [id, `${username}@example.test`]);
    await this.query(id, 'insert into public.profiles (id, username, display_name) values ($1, $2, $3)', [
      id,
      username,
      username,
    ]);
    return { id, username };
  }

  async categoryId(kind: string, slug: string, parentSlug?: string): Promise<string> {
    const rows = await this.admin<{ id: string }>(
      `select c.id from public.categories c
       left join public.categories p on p.id = c.parent_id
       where c.kind = $1 and c.slug = $2 and ($3::text is null or p.slug = $3)`,
      [kind, slug, parentSlug ?? null],
    );
    if (!rows[0]) throw new Error(`No category ${kind}/${slug}`);
    return rows[0].id;
  }

  /** Publishes a post through the save_post RPC as `userId`. */
  async createPost(
    userId: string,
    overrides: Record<string, unknown> = {},
    options: { images?: number; tags?: string[] } = {},
  ): Promise<string> {
    const id = randomUUID();
    const post = {
      id,
      title: 'Iced Strawberry Matcha',
      primary_category_id: await this.categoryId('primary', 'drinks'),
      rating: 9.2,
      visibility: 'public',
      status: 'published',
      ...overrides,
    };
    const images = Array.from({ length: options.images ?? 0 }, () => {
      const imageId = randomUUID();
      return {
        id: imageId,
        storage_path: `${userId}/${id}/${imageId}.jpg`,
        thumb_path: `${userId}/${id}/${imageId}_thumb.jpg`,
        width: 1440,
        height: 1800,
      };
    });
    await this.query(userId, 'select public.save_post($1::jsonb, $2::jsonb, $3::text[])', [
      JSON.stringify(post),
      JSON.stringify(images),
      options.tags ?? [],
    ]);
    return id;
  }

  async follow(followerId: string, followingId: string): Promise<void> {
    await this.query(followerId, 'insert into public.follows (follower_id, following_id) values ($1, $2)', [
      followerId,
      followingId,
    ]);
  }
}

/** Asserts that a promise rejects (e.g. an RLS or constraint violation). */
export async function expectDbError(promise: Promise<unknown>, pattern?: RegExp): Promise<void> {
  let error: unknown;
  try {
    await promise;
  } catch (e) {
    error = e;
  }
  if (!error) throw new Error('Expected the database to reject the operation, but it succeeded');
  if (pattern && !pattern.test((error as Error).message)) {
    throw new Error(`Expected error matching ${pattern}, got: ${(error as Error).message}`);
  }
}
