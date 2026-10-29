import { MissingPhotoError, savePost } from './save';
import { emptyPostForm } from './schemas';

const mockRpc = jest.fn();
const mockUpload = jest.fn();
jest.mock('@/lib/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
jest.mock('@/lib/supabase/storage', () => ({
  BUCKETS: { postImages: 'post-images' },
  uploadImageFile: (...args: unknown[]) => mockUpload(...args),
  removeFiles: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/images', () => ({
  preparePostImage: jest.fn(async (uri: string) => ({
    full: { uri, width: 100, height: 100 },
    thumb: { uri, width: 10, height: 10 },
  })),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@react-native-async-storage/async-storage', () => ({}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const taxonomy = { byId: { cooking: { id: 'cooking', slug: 'cooking', parentId: null } } } as never;
const values = {
  ...emptyPostForm(),
  title: 'Draft',
  primaryCategoryId: 'cooking',
  images: [
    { key: 'a', kind: 'local' as const, uri: 'file:///a.jpg', width: 1, height: 1 },
    { key: 'b', kind: 'local' as const, uri: 'file:///b.jpg', width: 1, height: 1 },
  ],
};

beforeEach(() => {
  mockRpc.mockReset().mockResolvedValue({ data: 'post-1', error: null });
  mockUpload.mockReset().mockResolvedValue(undefined);
});

describe('savePost', () => {
  it('stops before uploading anything when a picked photo is gone', async () => {
    const error = await savePost({
      userId: 'u',
      postId: 'post-1',
      values,
      status: 'draft',
      taxonomy,
      uploadCache: new Map(),
      photoExists: (uri) => uri !== 'file:///b.jpg',
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MissingPhotoError);
    expect((error as MissingPhotoError).keys).toEqual(['b']);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('saves a draft with its photos, tags and categories in one call', async () => {
    await savePost({
      userId: 'u',
      postId: 'post-1',
      values: { ...values, tags: ['Late Night'], rating: null },
      status: 'draft',
      taxonomy,
      uploadCache: new Map(),
      photoExists: () => true,
    });
    expect(mockUpload).toHaveBeenCalledTimes(4);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [name, args] = mockRpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe('save_post');
    expect(args.p_post).toMatchObject({ id: 'post-1', status: 'draft', title: 'Draft', rating: null });
    expect(args.p_images).toHaveLength(2);
    expect(args.p_tags).toEqual(['late night']);
  });

  it('a failed save keeps finished uploads for the retry', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('network down') });
    const cache = new Map();
    const args = {
      userId: 'u',
      postId: 'post-1',
      values,
      status: 'draft' as const,
      taxonomy,
      uploadCache: cache,
      photoExists: () => true,
    };
    await expect(savePost(args)).rejects.toThrow('network down');
    expect(cache.size).toBe(2);
    mockUpload.mockClear();
    await savePost(args);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});
