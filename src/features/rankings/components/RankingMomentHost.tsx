import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AppButton, AppText, BottomSheet, FoodImage, RatingRing } from '@/components/ui';
import { toUserMessage } from '@/lib/errors';
import { haptics } from '@/lib/haptics';
import { useRankingMomentStore, type RankingMoment } from '@/stores/rankingMoment';
import { toast } from '@/stores/toast';
import { colors, fonts, iconSizes, radii, spacing, strokes } from '@/theme';

import { preferenceConflicts, recordComparison } from '../experience';

/** Mount once in the signed-in app: shows after a post is published. */
export function RankingMomentHost() {
  const current = useRankingMomentStore((s) => s.current);
  const close = useRankingMomentStore((s) => s.close);
  return (
    <BottomSheet visible={!!current} onClose={close} accessibilityLabel="Your rankings">
      {current ? <Moment key={current.postId} moment={current} onDone={close} /> : null}
    </BottomSheet>
  );
}

type Answer = { preferred: 'new' | 'old' | 'tie' } | null;

function Moment({ moment, onDone }: { moment: RankingMoment; onDone: () => void }) {
  const qc = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [answer, setAnswer] = useState<Answer>(null);
  const [saving, setSaving] = useState(false);
  const { celebration, candidate } = moment;

  // A brief, soft entrance for the celebration: a little lift and scale.
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (!celebration) return;
    haptics.success();
    if (!reduceMotion) pop.set(withDelay(80, withSpring(1, { damping: 12, stiffness: 160 })));
  }, [celebration, reduceMotion, pop]);
  const popStyle = useAnimatedStyle(() => ({
    opacity: withTiming(pop.get() > 0 ? 1 : 0, { duration: 200 }),
    transform: [{ scale: 0.92 + pop.get() * 0.08 }, { translateY: (1 - pop.get()) * 8 }],
  }));

  const choose = async (preferred: 'new' | 'old' | 'tie') => {
    if (!candidate) return;
    setSaving(true);
    try {
      if (preferred === 'tie') await recordComparison(moment.postId, candidate.postId, true);
      else if (preferred === 'new') await recordComparison(moment.postId, candidate.postId);
      else await recordComparison(candidate.postId, moment.postId);
      haptics.selection();
      void qc.invalidateQueries({ queryKey: ['rankings'] });
      const conflict =
        (preferred === 'new' && preferenceConflicts(moment.rating, candidate.rating)) ||
        (preferred === 'old' && preferenceConflicts(candidate.rating, moment.rating));
      if (conflict) setAnswer({ preferred });
      else onDone();
    } catch (error) {
      toast.error(toUserMessage(error, 'Couldn’t save that.'));
    } finally {
      setSaving(false);
    }
  };

  const preferredTitle = answer?.preferred === 'new' ? moment.title : candidate?.title;
  const lowerId = answer?.preferred === 'new' ? moment.postId : candidate?.postId;

  return (
    <View style={styles.body}>
      {celebration ? (
        <Animated.View style={[styles.celebration, popStyle]} accessible accessibilityLiveRegion="polite">
          <View style={[styles.trophy, celebration.kind === 'first' && styles.trophyFirst]}>
            <Trophy
              size={celebration.kind === 'first' ? iconSizes.xl : iconSizes.lg}
              color={celebration.kind === 'first' ? colors.ivory : colors.accent}
              strokeWidth={strokes.regular}
            />
          </View>
          <AppText
            variant={celebration.kind === 'first' ? 'title1' : 'title2'}
            align="center"
            accessibilityRole="header"
          >
            {celebration.headline}
          </AppText>
          {celebration.detail ? (
            <AppText variant="callout" color="textSecondary" align="center">
              {celebration.detail}
            </AppText>
          ) : null}
        </Animated.View>
      ) : null}

      {candidate && !answer ? (
        <View style={styles.compare}>
          <AppText variant="overline" color="textSecondary" align="center">
            Which did you enjoy more?
          </AppText>
          <View style={styles.pair}>
            <Option
              title={moment.title}
              rating={moment.rating}
              thumbUrl={moment.thumbUrl}
              onPress={() => void choose('new')}
              disabled={saving}
            />
            <AppText variant="caption" color="textTertiary">
              vs
            </AppText>
            <Option
              title={candidate.title}
              rating={candidate.rating}
              thumbUrl={candidate.thumbUrl}
              cacheKey={candidate.thumbPath ?? undefined}
              onPress={() => void choose('old')}
              disabled={saving}
            />
          </View>
          <View style={styles.row}>
            <AppButton
              label="About the same"
              variant="secondary"
              size="sm"
              style={styles.flex}
              onPress={() => void choose('tie')}
              disabled={saving}
            />
            <AppButton
              label="Skip"
              variant="ghost"
              size="sm"
              style={styles.flex}
              onPress={onDone}
              disabled={saving}
            />
          </View>
          <AppText variant="caption" color="textTertiary" align="center">
            Your ratings stay as you set them. This only orders creations you rated the same.
          </AppText>
        </View>
      ) : null}

      {answer ? (
        <View style={styles.compare}>
          <AppText variant="bodyStrong" align="center">
            Noted — you preferred {preferredTitle}.
          </AppText>
          <AppText variant="callout" color="textSecondary" align="center">
            You rated it lower, so it stays below in your rankings. Want to adjust its rating?
          </AppText>
          <View style={styles.row}>
            <AppButton
              label="Adjust rating"
              size="sm"
              style={styles.flex}
              onPress={() => {
                onDone();
                if (lowerId) router.push({ pathname: '/compose', params: { postId: lowerId } });
              }}
            />
            <AppButton label="Keep as is" variant="ghost" size="sm" style={styles.flex} onPress={onDone} />
          </View>
        </View>
      ) : null}

      {!candidate && celebration ? (
        <AppButton label="Lovely" variant="secondary" fullWidth onPress={onDone} />
      ) : null}
    </View>
  );
}

function Option({
  title,
  rating,
  thumbUrl,
  cacheKey,
  onPress,
  disabled,
}: {
  title: string;
  rating: number;
  thumbUrl: string | null;
  cacheKey?: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.option, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, rated ${rating}`}
    >
      <View>
        <FoodImage uri={thumbUrl} cacheKey={cacheKey} style={styles.thumb} radius="md" />
        <View style={styles.ring}>
          <RatingRing value={rating} size="sm" />
        </View>
      </View>
      <AppText variant="calloutStrong" numberOfLines={2} align="center" style={styles.optionTitle}>
        {title}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xl, paddingTop: spacing.sm },
  celebration: { alignItems: 'center', gap: spacing.sm },
  trophy: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.tint,
  },
  trophyFirst: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accent },
  compare: { gap: spacing.md },
  pair: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  option: { flex: 1, gap: spacing.sm, alignItems: 'center', padding: spacing.sm, borderRadius: radii.md },
  pressed: { backgroundColor: colors.tint },
  thumb: { width: '100%', aspectRatio: 1 },
  ring: { position: 'absolute', right: spacing.xs, bottom: spacing.xs },
  optionTitle: { fontFamily: fonts.textSemiBold },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
