import { router } from 'expo-router';
import { Check, ChevronRight, Lock } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader, AppText, Avatar, ErrorState, RowSkeleton } from '@/components/ui';
import { useMyProfile } from '@/features/profile/hooks';
import type { ProfileFrame, ProfileTheme } from '@/features/unlocks/api';
import { useSetProfileStyle, useUnlocks } from '@/features/unlocks/hooks';
import { UNLOCKS } from '@/features/unlocks/rules';
import { colors, HAIRLINE, iconSizes, profileThemes, radii, SCREEN_GUTTER, spacing, strokes } from '@/theme';

/**
 * A small place for the few things you've unlocked. Everything here is
 * optional; nothing in Cheffy is gated behind it.
 */
export default function PersonalizeScreen() {
  const insets = useSafeAreaInsets();
  const unlocks = useUnlocks();
  const profile = useMyProfile();
  const setStyle = useSetProfileStyle();
  const state = unlocks.data;
  const p = profile.data;
  const has = (id: string) => state?.unlocked.includes(id as never) ?? false;
  const apply = (theme: ProfileTheme, frame: ProfileFrame) => setStyle.mutate({ theme, frame });

  return (
    <View style={styles.screen}>
      <AppHeader title="Personalize profile" />
      {unlocks.isPending || profile.isPending ? (
        <RowSkeleton />
      ) : unlocks.isError || !state || !p ? (
        <ErrorState error={unlocks.error} onRetry={() => void unlocks.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
          <Section title="Theme">
            <Option
              label="Classic"
              hint="Oxblood"
              selected={!p.theme}
              swatch={profileThemes.default.accent}
              onPress={() => apply(null, p.frame)}
            />
            <Option
              label="Saffron"
              hint={UNLOCKS[0]!.progress(state) ?? 'Warm gold'}
              locked={!has('theme_saffron')}
              selected={p.theme === 'saffron'}
              swatch={profileThemes.saffron.accent}
              onPress={() => apply('saffron', p.frame)}
            />
          </Section>

          <Section title="Photo frame">
            <Option label="Simple ring" selected={!p.frame} onPress={() => apply(p.theme, null)}>
              <View
                style={[styles.framePreview, { borderColor: profileThemes[p.theme ?? 'default'].accent }]}
              >
                <Avatar uri={p.avatarUrl} name={p.displayName} size="xs" />
              </View>
            </Option>
            <Option
              label="Host’s frame"
              hint={UNLOCKS[1]!.progress(state) ?? 'For bringing friends to the table'}
              locked={!has('frame_host')}
              selected={p.frame === 'host'}
              onPress={() => apply(p.theme, 'host')}
            >
              <View style={[styles.framePreview, styles.hostPreview]}>
                <Avatar uri={p.avatarUrl} name={p.displayName} size="xs" />
              </View>
            </Option>
            {!has('frame_host') ? (
              <Pressable onPress={() => router.push('/invite')} style={styles.link} accessibilityRole="link">
                <AppText variant="caption" color="accent">
                  Share your invite code
                </AppText>
              </Pressable>
            ) : null}
          </Section>

          <Section title="Distinctions">
            <Option
              label="Made Together"
              hint={UNLOCKS[2]!.progress(state) ?? 'Shown on your profile'}
              locked={!has('made_together')}
              selected={has('made_together')}
              static
            />
          </Section>

          <Section title="Look back">
            <Pressable
              disabled={!has('recap')}
              onPress={() => router.push('/recap')}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              accessibilityRole={has('recap') ? 'link' : 'text'}
            >
              <View style={styles.flex}>
                <AppText variant="bodyStrong">Your cooking recap</AppText>
                <AppText variant="caption" color="textSecondary">
                  {UNLOCKS[3]!.progress(state) ?? 'What you’ve made, from your own entries'}
                </AppText>
              </View>
              {has('recap') ? (
                <ChevronRight size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
              ) : (
                <Lock size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
              )}
            </Pressable>
          </Section>
        </ScrollView>
      )}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="overline" color="textSecondary">
        {title}
      </AppText>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Option({
  label,
  hint,
  selected,
  locked = false,
  swatch,
  onPress,
  children,
  static: isStatic = false,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  locked?: boolean;
  swatch?: string;
  onPress?: () => void;
  children?: React.ReactNode;
  static?: boolean;
}) {
  return (
    <Pressable
      disabled={locked || isStatic || !onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, locked && styles.locked]}
      accessibilityRole={isStatic ? 'text' : 'radio'}
      accessibilityState={{ selected, disabled: locked }}
      accessibilityLabel={`${label}${locked ? ', locked' : ''}${hint ? `, ${hint}` : ''}`}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      {children}
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{label}</AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {locked ? (
        <Lock size={iconSizes.sm} color={colors.textTertiary} strokeWidth={strokes.bold} />
      ) : selected ? (
        <Check size={iconSizes.md} color={colors.accent} strokeWidth={strokes.bold} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: SCREEN_GUTTER, gap: spacing.xl },
  section: { gap: spacing.sm },
  card: {
    borderRadius: radii.md,
    borderWidth: HAIRLINE,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  pressed: { backgroundColor: colors.tint },
  locked: { opacity: 0.6 },
  flex: { flex: 1, gap: 2 },
  swatch: { width: 24, height: 24, borderRadius: 12 },
  framePreview: { padding: 2, borderRadius: 999, borderWidth: 1.5 },
  hostPreview: {
    borderColor: colors.oxblood,
    outlineColor: '#B8892E',
    outlineWidth: 1.5,
    outlineOffset: 1.5,
    outlineStyle: 'solid',
  },
  link: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
