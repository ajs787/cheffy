import { activeMentionQuery, findMentionTokens, insertMention, mentionIdsFor, segmentBody } from './mentions';

describe('findMentionTokens', () => {
  it('matches the database: word-start @names, no emails, no trailing dots', () => {
    const text = 'hi @Ana and @ben. mail a@cook.com, @x, @cara_b. @toolongusername_toolongusername';
    expect(findMentionTokens(text).map((t) => t.username)).toEqual(['ana', 'ben', 'cara_b']);
    const [ana] = findMentionTokens('hi @Ana!');
    expect(ana).toEqual({ username: 'ana', start: 3, end: 7 });
  });
});

describe('activeMentionQuery', () => {
  it('finds the @query being typed', () => {
    expect(activeMentionQuery('hey @', 5)).toEqual({ start: 4, query: '' });
    expect(activeMentionQuery('hey @an', 7)).toEqual({ start: 4, query: 'an' });
    expect(activeMentionQuery('@an', 3)).toEqual({ start: 0, query: 'an' });
  });

  it('ignores emails, finished mentions and plain text', () => {
    expect(activeMentionQuery('a@b', 3)).toBeNull();
    expect(activeMentionQuery('hey @ana ', 9)).toBeNull();
    expect(activeMentionQuery('hello', 5)).toBeNull();
    expect(activeMentionQuery('', 0)).toBeNull();
  });
});

describe('insertMention', () => {
  it('replaces the query with @username and a space', () => {
    expect(insertMention('hey @an', 4, 7, 'ana')).toEqual({ text: 'hey @ana ', cursor: 9 });
  });

  it('replaces the rest of the word and reuses a following space', () => {
    expect(insertMention('hey @anx there', 4, 6, 'ana')).toEqual({ text: 'hey @ana there', cursor: 9 });
  });

  it('supports several mentions', () => {
    const first = insertMention('@a', 0, 2, 'ana');
    const typed = `${first.text}and @b`;
    const second = insertMention(typed, typed.length - 2, typed.length, 'ben');
    expect(second.text).toBe('@ana and @ben ');
  });
});

describe('mentionIdsFor', () => {
  const picked = new Map([
    ['ana', 'id-ana'],
    ['ben', 'id-ben'],
    ['me', 'id-me'],
  ]);

  it('keeps picked people still in the text, once, in order', () => {
    expect(mentionIdsFor('@ben and @ana and @ben', picked)).toEqual(['id-ben', 'id-ana']);
  });

  it('drops mentions edited or removed before sending, and yourself', () => {
    expect(mentionIdsFor('@anab hi', picked)).toEqual([]);
    expect(mentionIdsFor('@me @ana', picked, 'id-me')).toEqual(['id-ana']);
  });
});

describe('segmentBody', () => {
  it('links stored mentions with the current username', () => {
    const segments = segmentBody('thanks @ben, and @ghost', [
      { username: 'ben', userId: 'id-ben', currentUsername: 'benny' },
    ]);
    expect(segments).toEqual([
      { kind: 'text', text: 'thanks ' },
      { kind: 'mention', text: '@benny', userId: 'id-ben' },
      { kind: 'text', text: ', and @ghost' },
    ]);
  });

  it('leaves hidden people as text and handles empty bodies', () => {
    expect(segmentBody('@ben', [{ username: 'ben', userId: 'x', currentUsername: null }])).toEqual([
      { kind: 'text', text: '@ben' },
    ]);
    expect(segmentBody('', [])).toEqual([]);
  });
});
