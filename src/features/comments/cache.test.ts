import { QueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/lib/query/keys';
import type { Comment } from '@/types/models';

import { appendComment, cacheKeyFor, removeComment, updateCommentInCaches, type CommentPages } from './cache';

const author = { id: 'u', username: 'u', displayName: 'U', avatarUrl: null };
const comment = (id: string, parentId: string | null = null): Comment => ({
  id,
  postId: 'p',
  parentId,
  replyTo: null,
  body: id,
  createdAt: '2026-10-20T00:00:00Z',
  author,
  likeCount: 0,
  replyCount: 0,
  viewerHasLiked: false,
});

describe('comment caches', () => {
  it('routes top-level comments and replies to their own lists', () => {
    expect(cacheKeyFor(comment('a'))).toEqual(queryKeys.comments('p'));
    expect(cacheKeyFor(comment('r', 'a'))).toEqual(queryKeys.replies('a'));
  });

  it('appends to the last page and removes by id', () => {
    const data: CommentPages = { pages: [[comment('a')], [comment('b')]], pageParams: [null, null] };
    const added = appendComment(data, comment('c'));
    expect(added.pages[1]!.map((c) => c.id)).toEqual(['b', 'c']);
    expect(appendComment(undefined, comment('x')).pages).toEqual([[comment('x')]]);
    expect(removeComment(added, 'b')!.pages[1]!.map((c) => c.id)).toEqual(['c']);
  });

  it('updates a comment wherever it is cached', () => {
    const qc = new QueryClient();
    qc.setQueryData<CommentPages>(queryKeys.comments('p'), { pages: [[comment('a')]], pageParams: [null] });
    qc.setQueryData<CommentPages>(queryKeys.replies('a'), { pages: [[comment('r', 'a')]], pageParams: [null] });
    updateCommentInCaches(qc, 'r', (c) => ({ ...c, likeCount: 3, viewerHasLiked: true }));
    updateCommentInCaches(qc, 'a', (c) => ({ ...c, replyCount: 1 }));
    expect(qc.getQueryData<CommentPages>(queryKeys.replies('a'))!.pages[0]![0]).toMatchObject({
      likeCount: 3,
      viewerHasLiked: true,
    });
    expect(qc.getQueryData<CommentPages>(queryKeys.comments('p'))!.pages[0]![0]!.replyCount).toBe(1);
  });
});
