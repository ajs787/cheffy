import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppInput, AppText, Chip, Divider } from '@/components/ui';
import { detailFieldsFor } from '@/features/taxonomy/taxonomy';
import { colors, iconSizes, SCREEN_GUTTER, spacing, strokes } from '@/theme';
import type { Taxonomy } from '@/types/models';
import { formatCalendarDate, parseLocalDate, toLocalISODate } from '@/utils/dates';

import type { PostFormValues } from '../schemas';
import { OptionChips } from './OptionChips';

export interface DetailsSectionProps {
  control: Control<PostFormValues>;
  taxonomy: Taxonomy;
  /** Show cuisine here when the quick pick above is a subcategory. */
  showCuisine: boolean;
  initiallyOpen?: boolean;
}

const MILK_SUGGESTIONS = ['Whole', 'Oat', 'Almond', 'Soy', 'Coconut', 'None'];

/** Optional fields, collapsed by default so the quick path stays short. */
export function DetailsSection({ control, taxonomy, showCuisine, initiallyOpen = false }: DetailsSectionProps) {
  const [open, setOpen] = useState(initiallyOpen);
  const primaryId = useWatch({ control, name: 'primaryCategoryId' });
  const primarySlug = taxonomy.byId[primaryId]?.slug;
  const fields = detailFieldsFor(primarySlug);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="More details"
      >
        <View style={styles.toggleText}>
          <AppText variant="bodyStrong">More details</AppText>
          <AppText variant="caption" color="textSecondary">
            {fields.drink
              ? 'Date, hot or iced, milk, sweetener, notes'
              : 'Date, meal, cook time, recipe, ingredients, notes'}
          </AppText>
        </View>
        <ChevronDown
          size={iconSizes.md}
          color={colors.textSecondary}
          strokeWidth={strokes.bold}
          style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
        />
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={styles.body}>
          <Controller
            control={control}
            name="madeOn"
            render={({ field }) => <MadeOnField value={field.value} onChange={field.onChange} />}
          />

          <Controller
            control={control}
            name="wouldMakeAgain"
            render={({ field }) => (
              <View style={styles.inlineField}>
                <AppText variant="overline" color="textSecondary">
                  Would make again?
                </AppText>
                <View style={styles.inlineChips}>
                  <Chip label="Yes" selected={field.value === true} onPress={() => field.onChange(field.value === true ? null : true)} />
                  <Chip label="No" selected={field.value === false} onPress={() => field.onChange(field.value === false ? null : false)} />
                </View>
              </View>
            )}
          />

          {fields.drink ? (
            <>
              <Controller
                control={control}
                name="temperature"
                render={({ field }) => (
                  <View style={styles.inlineField}>
                    <AppText variant="overline" color="textSecondary">
                      Served
                    </AppText>
                    <View style={styles.inlineChips}>
                      <Chip label="Hot" selected={field.value === 'hot'} onPress={() => field.onChange(field.value === 'hot' ? null : 'hot')} />
                      <Chip label="Iced" selected={field.value === 'iced'} onPress={() => field.onChange(field.value === 'iced' ? null : 'iced')} />
                    </View>
                  </View>
                )}
              />
              <Controller
                control={control}
                name="milk"
                render={({ field }) => (
                  <View style={styles.padded}>
                    <AppInput label="Milk" placeholder="Oat, whole, none…" value={field.value} onChangeText={field.onChange} maxLength={40} />
                    <View style={styles.suggestions}>
                      {MILK_SUGGESTIONS.map((milk) => (
                        <Chip
                          key={milk}
                          label={milk}
                          size="sm"
                          selected={field.value.toLowerCase() === milk.toLowerCase()}
                          onPress={() => field.onChange(field.value.toLowerCase() === milk.toLowerCase() ? '' : milk)}
                        />
                      ))}
                    </View>
                  </View>
                )}
              />
              <View style={styles.padded}>
                <ControlledInput control={control} name="sweetener" label="Sweetener" placeholder="Honey, simple syrup, none…" maxLength={40} />
              </View>
            </>
          ) : null}

          <Controller
            control={control}
            name="mealTypeId"
            render={({ field }) => (
              <OptionChips
                label="Meal"
                options={taxonomy.mealTypes.map((c) => ({ id: c.id, label: c.name }))}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />

          {fields.dishType ? (
            <Controller
              control={control}
              name="dishTypeId"
              render={({ field }) => (
                <OptionChips
                  label="Dish type"
                  options={taxonomy.dishTypes.map((c) => ({ id: c.id, label: c.name }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          ) : null}

          {showCuisine ? (
            <Controller
              control={control}
              name="cuisineId"
              render={({ field }) => (
                <OptionChips
                  label="Cuisine"
                  options={taxonomy.cuisines.map((c) => ({ id: c.id, label: c.name }))}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
          ) : null}

          {fields.cookTime ? (
            <Controller
              control={control}
              name="cookTimeMinutes"
              render={({ field, fieldState }) => (
                <View style={styles.padded}>
                  <AppInput
                    label="Total time (minutes)"
                    placeholder="45"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={field.value === null ? '' : String(field.value)}
                    onChangeText={(text) => {
                      const digits = text.replace(/\D/g, '');
                      field.onChange(digits === '' ? null : Number(digits));
                    }}
                    error={fieldState.error?.message}
                  />
                </View>
              )}
            />
          ) : null}

          <View style={styles.padded}>
            <ControlledInput
              control={control}
              name="recipeUrl"
              label="Recipe link"
              placeholder="https://"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <View style={styles.padded}>
            <ControlledInput
              control={control}
              name="ingredients"
              label="Ingredients"
              placeholder={fields.drink ? '2 tsp matcha, oat milk, strawberry purée…' : 'One per line'}
              multiline
              maxLength={2000}
            />
          </View>
          <View style={styles.padded}>
            <ControlledInput
              control={control}
              name="prepNotes"
              label="How you made it"
              placeholder="Steps, tweaks, what you’d tell a friend"
              multiline
              maxLength={2000}
            />
          </View>
          {!fields.drink ? (
            <View style={styles.padded}>
              <ControlledInput
                control={control}
                name="nextTimeNotes"
                label="Notes for next time"
                placeholder="Less sugar, bake 2 min longer…"
                multiline
                maxLength={1000}
              />
            </View>
          ) : null}
        </Animated.View>
      ) : null}
      <Divider style={styles.divider} />
    </View>
  );
}

function MadeOnField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const date = parseLocalDate(value);
  const today = new Date();

  return (
    <View style={styles.inlineField}>
      <AppText variant="overline" color="textSecondary">
        Made on
      </AppText>
      {Platform.OS === 'ios' ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          maximumDate={today}
          accentColor={colors.accentStrong}
          onChange={(_event, picked) => picked && onChange(toLocalISODate(picked))}
        />
      ) : (
        <Chip
          label={formatCalendarDate(value)}
          onPress={() =>
            DateTimePickerAndroid.open({
              value: date,
              mode: 'date',
              maximumDate: today,
              onChange: (_event, picked) => picked && onChange(toLocalISODate(picked)),
            })
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: SCREEN_GUTTER,
    paddingVertical: spacing.md,
  },
  toggleText: { flex: 1, gap: 2 },
  body: { gap: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  inlineField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SCREEN_GUTTER,
    minHeight: 40,
  },
  inlineChips: { flexDirection: 'row', gap: spacing.sm },
  padded: { paddingHorizontal: SCREEN_GUTTER },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.sm },
  divider: { marginHorizontal: SCREEN_GUTTER },
});
