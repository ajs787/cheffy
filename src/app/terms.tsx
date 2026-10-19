import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, AppText } from '@/components/ui';
import { SUPPORT_EMAIL, TERMS_VERSION } from '@/constants/app';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'Community Guidelines',
    body: [
      'Cheffy is for sharing food and drinks you made yourself. Be kind — a bad bake is still worth logging, and so is honest feedback delivered respectfully.',
      'There is zero tolerance for objectionable content or abusive users. Do not post or comment anything hateful, harassing, sexual, violent, illegal, or spam. Do not post photos you don’t have the right to share.',
      'Accounts that break these rules may have content removed or be banned without notice.',
    ],
  },
  {
    title: 'Reporting and blocking',
    body: [
      'Use “Report” on any post, comment or profile to flag it. Reports are reviewed and objectionable content is removed, typically within 24 hours, and the users who posted it may be removed.',
      'Use “Block” to stop seeing someone. Blocking hides your content from each other, removes follows between you, and prevents them from interacting with you.',
    ],
  },
  {
    title: 'Your content',
    body: [
      'You own what you post. By posting, you give Cheffy permission to store and display it to the audience you choose (Public, Followers, or Only me).',
      'You can edit or delete any post at any time, and you can delete your account — with all of your posts, photos, comments and likes — from Settings.',
    ],
  },
  {
    title: 'Privacy',
    body: [
      'We store your email address, profile, posts, photos and interactions in order to run the service. Photos are stored privately and are only shown to people allowed to see the post. Location metadata is removed from photos before upload.',
      'We don’t sell your data or show ads.',
    ],
  },
];

export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <AppHeader title="Terms & Guidelines" leading="close" safeTop={false} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <AppText variant="title2" accessibilityRole="header">
              {section.title}
            </AppText>
            {section.body.map((paragraph) => (
              <AppText key={paragraph.slice(0, 24)} variant="body" color="textSecondary">
                {paragraph}
              </AppText>
            ))}
          </View>
        ))}
        <AppText variant="caption" color="textTertiary">
          {SUPPORT_EMAIL ? `Questions? Contact ${SUPPORT_EMAIL}. ` : ''}Version {TERMS_VERSION}.
        </AppText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: SCREEN_GUTTER, gap: spacing.xxl, paddingTop: spacing.md },
  section: { gap: spacing.sm },
});
