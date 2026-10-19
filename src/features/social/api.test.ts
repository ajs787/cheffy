import { sanitizeSearch } from './api';

jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

describe('sanitizeSearch', () => {
  it('removes PostgREST and LIKE control characters', () => {
    expect(sanitizeSearch(' %Audrey,(x)* ')).toBe('audreyx');
    expect(sanitizeSearch('@chef.audrey')).toBe('chef.audrey');
    expect(sanitizeSearch('a'.repeat(60))).toHaveLength(40);
  });
});
