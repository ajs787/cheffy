import { isLongStory } from './StorySection';

describe('isLongStory', () => {
  it('keeps short single-paragraph stories open', () => {
    expect(isLongStory('My grandmother made this every Sunday.')).toBe(false);
  });

  it('collapses long stories and stories with several paragraphs', () => {
    expect(isLongStory('a'.repeat(241))).toBe(true);
    expect(isLongStory('First summer in Seoul.\n\nBack home, I tried it again.')).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(isLongStory(`  ${'a'.repeat(240)}  \n`)).toBe(false);
  });
});
