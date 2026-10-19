import { router } from 'expo-router';
import { Ban, Flag, FolderPlus, Pencil, Share2, Trash2 } from 'lucide-react-native';
import { useState } from 'react';

import { ActionSheet, ConfirmationDialog, type SheetAction } from '@/components/ui';
import { useUserId } from '@/features/auth/store';
import { CollectionPickerSheet } from '@/features/collections/components/CollectionPickerSheet';
import { ReportSheet } from '@/features/social/components/ReportSheet';
import { useBlockUser } from '@/features/social/hooks';
import { toUserMessage } from '@/lib/errors';
import { sharePost } from '@/lib/share';
import { toast } from '@/stores/toast';
import type { Post, ProfileSummary, ReportTarget } from '@/types/models';

import { useDeletePost } from '../hooks';

/**
 * The "•••" menu for a post: edit/delete for your own, report/block for
 * others, share and collections for everyone. Render `element` once.
 */
export function usePostMenu(options: { onDeleted?: () => void } = {}) {
  const me = useUserId();
  const [menuPost, setMenuPost] = useState<Post | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Post | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [blockTarget, setBlockTarget] = useState<ProfileSummary | null>(null);
  const [collectionPostId, setCollectionPostId] = useState<string | null>(null);
  const deletePost = useDeletePost();
  const blockUser = useBlockUser();

  const actions: SheetAction[] = [];
  if (menuPost) {
    const post = menuPost;
    const own = post.author.id === me;
    if (own) {
      actions.push({
        key: 'edit',
        label: 'Edit post',
        icon: Pencil,
        onPress: () => router.push({ pathname: '/compose', params: { postId: post.id } }),
      });
    }
    if (post.status === 'published') {
      actions.push({
        key: 'collection',
        label: 'Add to collection',
        icon: FolderPlus,
        onPress: () => setCollectionPostId(post.id),
      });
      actions.push({
        key: 'share',
        label: 'Share',
        icon: Share2,
        onPress: () => void sharePost(post).catch(() => undefined),
      });
    }
    if (own) {
      actions.push({ key: 'delete', label: 'Delete post', icon: Trash2, destructive: true, onPress: () => setDeleteTarget(post) });
    } else {
      actions.push({
        key: 'report',
        label: 'Report post',
        icon: Flag,
        destructive: true,
        onPress: () => setReportTarget({ type: 'post', postId: post.id }),
      });
      actions.push({
        key: 'block',
        label: `Block @${post.author.username}`,
        icon: Ban,
        destructive: true,
        onPress: () => setBlockTarget(post.author),
      });
    }
  }

  const element = (
    <>
      <ActionSheet visible={!!menuPost} onClose={() => setMenuPost(null)} actions={actions} />
      <ConfirmationDialog
        visible={!!deleteTarget}
        title="Delete this post?"
        message="It will be removed from your diary and rankings, along with its likes and comments. This can’t be undone."
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deletePost.mutateAsync(deleteTarget);
            setDeleteTarget(null);
            toast.show('Post deleted');
            options.onDeleted?.();
          } catch (error) {
            toast.error(toUserMessage(error, 'Couldn’t delete the post.'));
          }
        }}
      />
      <ConfirmationDialog
        visible={!!blockTarget}
        title={`Block @${blockTarget?.username ?? ''}?`}
        message="You won’t see each other’s posts, comments or profiles, and any follows between you are removed. They won’t be notified."
        confirmLabel="Block"
        destructive
        onCancel={() => setBlockTarget(null)}
        onConfirm={async () => {
          if (!blockTarget) return;
          await blockUser.mutateAsync(blockTarget.id).catch(() => undefined);
          setBlockTarget(null);
          options.onDeleted?.();
        }}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
      <CollectionPickerSheet postId={collectionPostId} onClose={() => setCollectionPostId(null)} />
    </>
  );

  return { open: setMenuPost, element };
}
