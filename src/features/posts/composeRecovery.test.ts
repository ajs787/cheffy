import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearComposeRecovery,
  hasContent,
  readComposeRecovery,
  readDraftMadeWith,
  refreshRemoteImages,
  withoutMissingLocalPhotos,
  writeComposeRecovery,
  writeDraftMadeWith,
  type ComposeRecovery,
} from './composeRecovery';
import { emptyPostForm, type ComposeImage } from './schemas';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- the package's own mock
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('@/lib/supabase/client', () => ({ supabase: {} }));

const local: ComposeImage = { key: 'l1', kind: 'local', uri: 'file:///tmp/a.jpg', width: 10, height: 10 };
const remote: ComposeImage = {
  key: 'r1',
  kind: 'remote',
  id: 'img-1',
  storagePath: 'u/p/img-1.jpg',
  thumbPath: 'u/p/img-1_thumb.jpg',
  width: 10,
  height: 10,
  uri: 'https://signed.example/expiring',
};

function entry(overrides: Partial<ComposeRecovery> = {}): ComposeRecovery {
  return {
    postId: 'post-1',
    mode: 'new',
    values: {
      ...emptyPostForm(),
      title: 'Midnight ramen',
      primaryCategoryId: 'cooking',
      rating: 8,
      review: 'Rich',
      story: 'Long day',
      tags: ['noodles'],
      subcategoryIds: ['soup'],
      cuisineIds: ['japanese'],
      isBudget: true,
      budgetCost: '3.20',
      images: [local, remote],
    },
    madeWith: [{ id: 'f1', username: 'pal', displayName: 'Pal', avatarUrl: null }],
    savedAt: 1_700_000_000_000,
    ...overrides,
  };
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('compose safety copy', () => {
  it('round-trips every field, and drops expiring photo URLs', async () => {
    await writeComposeRecovery('alice', entry());
    const saved = await readComposeRecovery('alice');
    expect(saved).toEqual({
      ...entry(),
      values: { ...entry().values, images: [local, { ...remote, uri: null }] },
    });
  });

  it('is kept per account', async () => {
    await writeComposeRecovery('alice', entry());
    expect(await readComposeRecovery('bob')).toBeNull();
  });

  it('ignores corrupt or unrelated data', async () => {
    await AsyncStorage.setItem('cheffy-compose-recovery:alice', '{not json');
    expect(await readComposeRecovery('alice')).toBeNull();
    await AsyncStorage.setItem('cheffy-compose-recovery:alice', JSON.stringify({ hello: 1 }));
    expect(await readComposeRecovery('alice')).toBeNull();
  });

  it('only clears the copy for the entry that was saved', async () => {
    await writeComposeRecovery('alice', entry());
    await clearComposeRecovery('alice', 'some-other-post');
    expect(await readComposeRecovery('alice')).not.toBeNull();
    await clearComposeRecovery('alice', 'post-1');
    expect(await readComposeRecovery('alice')).toBeNull();
  });

  it('knows an empty form has nothing worth restoring', () => {
    expect(hasContent(emptyPostForm())).toBe(false);
    expect(hasContent({ ...emptyPostForm(), title: 'x' })).toBe(true);
    expect(hasContent({ ...emptyPostForm(), images: [local] })).toBe(true);
  });
});

describe('missing photos', () => {
  it('drops picked photos whose files are gone and counts them', () => {
    const other = { ...local, key: 'l2', uri: 'file:///tmp/gone.jpg' };
    const result = withoutMissingLocalPhotos([local, remote, other], (uri) => uri !== other.uri);
    expect(result.images).toEqual([local, remote]);
    expect(result.missing).toBe(1);
  });

  it('re-signs uploaded photos and leaves ones the post lost without a URL', () => {
    const lost = { ...remote, key: 'r2', id: 'img-2' };
    const images = refreshRemoteImages([local, remote, lost], [{ id: 'img-1', url: 'https://fresh' }]);
    expect(images).toEqual([local, { ...remote, uri: 'https://fresh' }, { ...lost, uri: null }]);
  });
});

describe('draft “Made with” people', () => {
  it('are remembered per account and draft, and cleared when empty', async () => {
    const people = entry().madeWith;
    await writeDraftMadeWith('alice', 'post-1', people);
    expect(await readDraftMadeWith('alice', 'post-1')).toEqual(people);
    expect(await readDraftMadeWith('bob', 'post-1')).toEqual([]);
    await writeDraftMadeWith('alice', 'post-1', []);
    expect(await readDraftMadeWith('alice', 'post-1')).toEqual([]);
  });
});
