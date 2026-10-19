// jest.mock calls are hoisted above imports, so the module sees the mocks.
import { BUCKETS, signPostImagePaths, uploadImageFile } from './storage';

const mockUpload = jest.fn();
const mockCreateSignedUrls = jest.fn();

jest.mock('./client', () => ({
  supabase: { storage: { from: () => ({ upload: mockUpload, createSignedUrls: mockCreateSignedUrls }) } },
}));
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ arrayBuffer: async () => new ArrayBuffer(4) })),
}));

describe('uploadImageFile', () => {
  beforeEach(() => mockUpload.mockReset());

  it('treats "already exists" as success (an earlier attempt landed)', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'The resource already exists', statusCode: '409' } });
    await expect(uploadImageFile(BUCKETS.postImages, 'u/p/i.jpg', 'file:///x.jpg')).resolves.toBeUndefined();
  });

  it('throws other errors', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'new row violates row-level security policy', statusCode: '403' } });
    await expect(uploadImageFile(BUCKETS.postImages, 'u/p/i.jpg', 'file:///x.jpg')).rejects.toMatchObject({
      statusCode: '403',
    });
  });
});

describe('signPostImagePaths', () => {
  it('signs only paths it has not cached', async () => {
    mockCreateSignedUrls.mockImplementation(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://cdn.test/${path}?token=1`, error: null })),
      error: null,
    }));
    const first = await signPostImagePaths(['a.jpg', 'b.jpg', 'a.jpg']);
    expect(first).toEqual({ 'a.jpg': 'https://cdn.test/a.jpg?token=1', 'b.jpg': 'https://cdn.test/b.jpg?token=1' });
    expect(mockCreateSignedUrls).toHaveBeenLastCalledWith(['a.jpg', 'b.jpg'], expect.any(Number));

    mockCreateSignedUrls.mockClear();
    await signPostImagePaths(['a.jpg', 'c.jpg']);
    expect(mockCreateSignedUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateSignedUrls).toHaveBeenLastCalledWith(['c.jpg'], expect.any(Number));
  });
});
