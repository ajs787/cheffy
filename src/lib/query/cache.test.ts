import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { Page, Post } from '@/types/models';

import { removeAuthorFromCaches, removePostFromCaches, restorePostCaches, snapshotPostCaches, updatePostInCaches } from './cache';
import { queryKeys } from './keys';

const post = (id: string, authorId = 'a'): Post =>
  ({
    id,
    title: id,
    author: { id: authorId, username: authorId, displayName: authorId, avatarUrl: null },
    likeCount: 0,
    viewerHasLiked: false,
  }) as Post;

function seed() {
  const qc = new QueryClient();
  const feed: InfiniteData<Page<Post>> = {
    pages: [{ items: [post('p1'), post('p2', 'b')], nextCursor: null }],
    pageParams: [null],
  };
  qc.setQueryData(queryKeys.feed, feed);
  qc.setQueryData(queryKeys.post('p1'), post('p1'));
  qc.setQueryData([...queryKeys.discover({ sort: 'top' }), 'section'], [post('p1'), post('p3', 'b')]);
  qc.setQueryData(queryKeys.comments('p1'), [[]]); // not a post cache; must be untouched
  return qc;
}

const feedItems = (qc: QueryClient) =>
  qc.getQueryData<InfiniteData<Page<Post>>>(queryKeys.feed)!.pages.flatMap((p) => p.items);

describe('post cache helpers', () => {
  it('updates a post everywhere it is cached', () => {
    const qc = seed();
    updatePostInCaches(qc, 'p1', (p) => ({ ...p, likeCount: 1, viewerHasLiked: true }));
    expect(feedItems(qc)[0]).toMatchObject({ likeCount: 1, viewerHasLiked: true });
    expect(qc.getQueryData<Post>(queryKeys.post('p1'))).toMatchObject({ likeCount: 1 });
    expect(qc.getQueryData<Post[]>([...queryKeys.discover({ sort: 'top' }), 'section'])![0]).toMatchObject({ likeCount: 1 });
    expect(feedItems(qc)[1]).toMatchObject({ likeCount: 0 });
  });

  it('rolls back from a snapshot', () => {
    const qc = seed();
    const snapshot = snapshotPostCaches(qc);
    updatePostInCaches(qc, 'p1', (p) => ({ ...p, likeCount: 99 }));
    restorePostCaches(qc, snapshot);
    expect(feedItems(qc)[0]?.likeCount).toBe(0);
  });

  it('removes a deleted post from lists and drops its detail query', () => {
    const qc = seed();
    removePostFromCaches(qc, 'p1');
    expect(feedItems(qc).map((p) => p.id)).toEqual(['p2']);
    expect(qc.getQueryData(queryKeys.post('p1'))).toBeUndefined();
  });

  it('removes all posts by a blocked author', () => {
    const qc = seed();
    removeAuthorFromCaches(qc, 'b');
    expect(feedItems(qc).map((p) => p.id)).toEqual(['p1']);
    expect(qc.getQueryData<Post[]>([...queryKeys.discover({ sort: 'top' }), 'section'])!.map((p) => p.id)).toEqual(['p1']);
  });
});
