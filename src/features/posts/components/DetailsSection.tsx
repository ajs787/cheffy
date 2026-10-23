import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { ListPlus } from 'lucide-react-native';
import { Controller, useController, useWatch, type Control } from 'react-hook-form';
import { Platform, StyleSheet, View } from 'react-native';

import { ControlledInput } from '@/components/shared/ControlledInput';
import { AppInput, AppText, Chip, Collapsible } from '@/components/ui';
import { detailFieldsFor } from '@/features/taxonomy/taxonomy';
import { colors, SCREEN_GUTTER, spacing } from '@/theme';
import type { Taxonomy } from '@/types/models';
import { formatCalendarDate, parseLocalDate, toLocalISODate } from '@/utils/dates';

import type { PostFormValues } from '../schemas';
import { ClassificationField } from './ClassificationField';
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
export function DetailsSection({
  control,
  taxonomy,
  showCuisine,
  initiallyOpen = false,
}: DetailsSectionProps) {
  const primaryId = useWatch({ control, name: 'primaryCategoryId' });
  const custom = useController({ control, name: 'customLabels' });
  const primarySlug = taxonomy.byId[primaryId]?.slug;
  const fields = detailFieldsFor(primarySlug);

  return (
    <Collapsible
      title="More details"
      summary={
        fields.drink
          ? 'Date, hot or iced, milk, sweetener, ingredients'
          : 'Date, meal, cook time, recipe, ingredients'
      }
      icon={ListPlus}
      initiallyOpen={initiallyOpen}
      testID="compose-more-details"
    >
      <View style={styles.body}>
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
                <Chip
                  label="Yes"
                  selected={field.value === true}
                  onPress={() => field.onChange(field.value === true ? null : true)}
                />
                <Chip
                  label="No"
                  selected={field.value === false}
                  onPress={() => field.onChange(field.value === false ? null : false)}
                />
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
                    <Chip
                      label="Hot"
                      selected={field.value === 'hot'}
                      onPress={() => field.onChange(field.value === 'hot' ? null : 'hot')}
                    />
                    <Chip
                      label="Iced"
                      selected={field.value === 'iced'}
                      onPress={() => field.onChange(field.value === 'iced' ? null : 'iced')}
                    />
                  </View>
                </View>
              )}
            />
            <Controller
              control={control}
              name="milk"
              render={({ field }) => (
                <View style={styles.padded}>
                  <AppInput
                    label="Milk"
                    placeholder="Oat, whole, none…"
                    value={field.value}
                    onChangeText={field.onChange}
                    maxLength={40}
                  />
                  <View style={styles.suggestions}>
                    {MILK_SUGGESTIONS.map((milk) => (
                      <Chip
                        key={milk}
                        label={milk}
                        size="sm"
                        selected={field.value.toLowerCase() === milk.toLowerCase()}
                        onPress={() =>
                          field.onChange(field.value.toLowerCase() === milk.toLowerCase() ? '' : milk)
                        }
                      />
                    ))}
                  </View>
                </View>
              )}
            />
            <View style={styles.padded}>
              <ControlledInput
                control={control}
                name="sweetener"
                label="Sweetener"
                placeholder="Honey, simple syrup, none…"
                maxLength={40}
              />
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
            name="dishTypeIds"
            render={({ field }) => (
              <ClassificationField
                label="Dish types"
                kind="dish_type"
                taxonomy={taxonomy}
                value={field.value}
                onChange={field.onChange}
                customLabels={custom.field.value}
                onCustomLabelsChange={custom.field.onChange}
              />
            )}
          />
        ) : null}

        {showCuisine ? (
          <Controller
            control={control}
            name="cuisineIds"
            render={({ field }) => (
              <ClassificationField
                label="Cuisines"
                kind="cuisine"
                taxonomy={taxonomy}
                value={field.value}
                onChange={field.onChange}
                customLabels={custom.field.value}
                onCustomLabelsChange={custom.field.onChange}
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
      </View>
    </Collapsible>
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
  body: { gap: spacing.lg },
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
});
