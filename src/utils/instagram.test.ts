import { instagramProfileUrl, parseInstagram } from './instagram';

const ok = (input: string) => {
  const r = parseInstagram(input);
  return r.ok ? r.username : `ERR ${r.error}`;
};

describe('parseInstagram', () => {
  it('accepts usernames with or without @, lowercased', () => {
    expect(ok('chefshin')).toBe('chefshin');
    expect(ok('@Chef.Shin_')).toBe('chef.shin_');
    expect(ok('  @aud  ')).toBe('aud');
  });

  it('treats empty input as removing the link', () => {
    expect(ok('')).toBeNull();
    expect(ok('   ')).toBeNull();
  });

  it('reads the username from profile links', () => {
    expect(ok('https://www.instagram.com/chefshin/')).toBe('chefshin');
    expect(ok('instagram.com/chefshin?igsh=abc')).toBe('chefshin');
    expect(ok('http://m.instagram.com/Chef.Shin')).toBe('chef.shin');
    expect(ok('instagr.am/aud')).toBe('aud');
  });

  it('rejects other sites, schemes, posts and malformed names', () => {
    for (const bad of [
      'https://evil.com/chefshin',
      'javascript:alert(1)',
      'instagram://user?username=x',
      'https://instagram.com.evil.com/x',
      'https://www.instagram.com/p/ABC123/',
      'https://www.instagram.com/',
      'chef shin',
      '.chef',
      'chef.',
      'chef..shin',
      'a'.repeat(31),
      'chef!',
    ]) {
      expect(parseInstagram(bad).ok).toBe(false);
    }
  });
});

describe('instagramProfileUrl', () => {
  it('builds the URL only for valid usernames', () => {
    expect(instagramProfileUrl('chef.shin')).toBe('https://www.instagram.com/chef.shin/');
    expect(instagramProfileUrl('../x')).toBeNull();
  });
});
