import { addComment } from './api';

type Result = { data: unknown; error: unknown };

/** Each `from()` call answers with the next result, and records its chain. */
const mockResults: Result[] = [];
const mockChains: string[][] = [];

jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: () => {
      const chain: string[] = [];
      mockChains.push(chain);
      const result = mockResults.shift() ?? { data: null, error: new Error('unexpected query') };
      const builder: Record<string, unknown> = {
        then: (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(result).then(resolve, reject),
      };
      for (const name of ['insert', 'select', 'eq', 'is', 'gte', 'gt', 'order', 'limit']) {
        builder[name] = (...args: unknown[]) => {
          chain.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`.slice(0, 80));
          return builder;
        };
      }
      builder.single = () => Promise.resolve(result);
      return builder;
    },
  },
}));

const row = {
  id: 'c-1',
  post_id: 'p',
  parent_id: null,
  body: 'Looks amazing',
  created_at: '2026-11-28T00:00:00Z',
  like_count: 0,
  reply_count: 0,
  author: { id: 'me', username: 'me', display_name: 'Me', avatar_path: null },
};

beforeEach(() => {
  mockResults.length = 0;
  mockChains.length = 0;
});

describe('addComment', () => {
  it('a first attempt just inserts (no extra lookup)', async () => {
    mockResults.push({ data: row, error: null });
    const comment = await addComment('me', 'p', { body: 'Looks amazing' });
    expect(comment.id).toBe('c-1');
    expect(mockChains).toHaveLength(1);
    expect(mockChains[0]![0]).toMatch(/^insert/);
  });

  it('a retry reuses the comment the failed attempt already saved', async () => {
    mockResults.push({ data: [row], error: null });
    const comment = await addComment('me', 'p', {
      body: '  Looks amazing ',
      retrySince: '2026-11-28T00:00:00Z',
    });
    expect(comment.id).toBe('c-1');
    expect(mockChains).toHaveLength(1);
    const lookup = mockChains[0]!.join(' ');
    // Only this author's own comment, same post, text, thread and attachment.
    expect(lookup).toContain('eq("author_id","me")');
    expect(lookup).toContain('eq("post_id","p")');
    expect(lookup).toContain('eq("body","Looks amazing")');
    expect(lookup).toContain('is("parent_id",null)');
    expect(lookup).toContain('is("media_upload_id",null)');
    // Looks a little before the first attempt (clock differences).
    expect(lookup).toContain('gte("created_at","2026-11-27T23:58:00.000Z")');
  });

  it('a retry inserts when nothing was saved before', async () => {
    mockResults.push({ data: [], error: null }, { data: row, error: null });
    const comment = await addComment('me', 'p', {
      body: 'Looks amazing',
      uploadId: 'u-1',
      reply: { parentId: 'top', commentId: 'top', user: null, anonNumber: null },
      retrySince: '2026-11-28T00:00:00Z',
    });
    expect(comment.id).toBe('c-1');
    expect(mockChains[0]!.join(' ')).toContain('eq("parent_id","top")');
    expect(mockChains[0]!.join(' ')).toContain('eq("media_upload_id","u-1")');
    expect(mockChains[1]![0]).toMatch(/^insert/);
  });

  it('passes insert errors through unchanged', async () => {
    const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };
    mockResults.push({ data: null, error: timeout });
    await expect(addComment('me', 'p', { body: 'x' })).rejects.toBe(timeout);
  });

  it('never reuses the last comment sent from this composer, or older ones', async () => {
    mockResults.push({ data: [], error: null }, { data: row, error: null });
    await addComment('me', 'p', {
      body: 'lol',
      retrySince: '2026-11-28T00:01:00Z',
      notBefore: '2026-11-28T00:00:30Z',
    });
    expect(mockChains[0]!.join(' ')).toContain('gt("created_at","2026-11-28T00:00:30Z")');
  });

  it('sends normally if the lookup itself fails', async () => {
    mockResults.push(
      { data: null, error: { code: '414', message: 'URI too long' } },
      { data: row, error: null },
    );
    const comment = await addComment('me', 'p', {
      body: 'x'.repeat(900),
      retrySince: '2026-11-28T00:00:00Z',
    });
    expect(comment.id).toBe('c-1');
    expect(mockChains[1]![0]).toMatch(/^insert/);
  });
});
