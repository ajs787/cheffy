import { likedBySummary } from './likedBy';

const p = (id: string) => ({ id, username: id, displayName: id, avatarUrl: null });

describe('likedBySummary', () => {
  it('is empty with no likes', () => {
    expect(likedBySummary([], 0, false, 'me')).toBeNull();
  });

  it('leads with someone other than the viewer', () => {
    expect(likedBySummary([p('me'), p('ines')], 3, true, 'me')).toEqual({ lead: 'ines', others: 2 });
    expect(likedBySummary([p('ines')], 1, false, 'me')).toEqual({ lead: 'ines', others: 0 });
  });

  it('falls back to "you", then to a count', () => {
    expect(likedBySummary([p('me')], 1, true, 'me')).toEqual({ lead: 'you', others: 0 });
    expect(likedBySummary([], 4, false, 'me')).toEqual({ lead: null, others: 4 });
  });
});
