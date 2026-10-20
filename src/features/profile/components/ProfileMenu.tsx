import { Ban, Flag, Share2 } from 'lucide-react-native';
import { useState } from 'react';

import { ActionSheet, ConfirmationDialog } from '@/components/ui';
import { ReportSheet } from '@/features/social/components/ReportSheet';
import { useBlockUser, useUnblockUser } from '@/features/social/hooks';
import { shareProfile } from '@/lib/share';
import type { ProfileWithViewer, ReportTarget } from '@/types/models';

export interface ProfileMenuProps {
  profile: ProfileWithViewer;
  visible: boolean;
  onClose: () => void;
}

/** The "•••" menu on someone else's profile: share, report, block/unblock. */
export function ProfileMenu({ profile, visible, onClose }: ProfileMenuProps) {
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const block = useBlockUser();
  const unblock = useUnblockUser();

  return (
    <>
      <ActionSheet
        visible={visible}
        onClose={onClose}
        actions={[
          {
            key: 'share',
            label: 'Share profile',
            icon: Share2,
            onPress: () => void shareProfile(profile).catch(() => undefined),
          },
          {
            key: 'report',
            label: 'Report account',
            icon: Flag,
            destructive: true,
            onPress: () => setReportTarget({ type: 'user', userId: profile.id }),
          },
          profile.viewerHasBlocked
            ? {
                key: 'unblock',
                label: `Unblock @${profile.username}`,
                icon: Ban,
                onPress: () => unblock.mutate(profile.id),
              }
            : {
                key: 'block',
                label: `Block @${profile.username}`,
                icon: Ban,
                destructive: true,
                onPress: () => setConfirmBlock(true),
              },
        ]}
      />
      <ConfirmationDialog
        visible={confirmBlock}
        title={`Block @${profile.username}?`}
        message="You won’t see each other’s posts, comments or profiles, and any follows between you are removed. They won’t be notified."
        confirmLabel="Block"
        destructive
        onCancel={() => setConfirmBlock(false)}
        onConfirm={async () => {
          await block.mutateAsync(profile.id).catch(() => undefined);
          setConfirmBlock(false);
        }}
      />
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </>
  );
}
