import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { Button, CeilingSlider, Icon, Text, type IconName } from '@/components/ui';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { CATEGORY_LABEL } from './CategoryTabs';
import { AMENITY_ICON, AMENITY_LABEL } from './AmenityIcon';
import type { StayCategory } from '@/constants/tokens';
import { genderMeta, type AmenityName, type Gender, type Listing } from '@/types/listing';
import {
  activeFilterCount,
  applyQuery,
  facetsFor,
  filterSpecFor,
  hasBlockingIssue,
  validateQuery,
  type FilterIssue,
  type SearchQuery,
} from '@/types/filters';

const COUNT_DEBOUNCE = 280;

const AMENITY_CHOICES: readonly AmenityName[] = [
  'powerBackup',
  'waterSupply',
  'wifi',
  'mess',
  'attachedBath',
  'laundry',
  'ac',
  'parking',
];

const GENDER_CHOICES: readonly Gender[] = ['BOYS', 'GIRLS'];

const MEAL_CHOICES: readonly { value: boolean | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: true, label: 'With food' },
  { value: false, label: 'Without food' },
];

const clearedFilters: Partial<SearchQuery> = {
  categories: [],
  rentCeiling: null,
  sharing: [],
  furnishing: [],
  meals: null,
  amenities: [],
};

export type FilterSheetProps = {
  query: SearchQuery;
  inventory: readonly Listing[];
  category: StayCategory | null;
  onApply: (query: SearchQuery) => void;
  onClose: () => void;
};

const tap = (style = Haptics.ImpactFeedbackStyle.Light) => {
  try {
    Haptics.impactAsync(style);
  } catch {}
};

/**
 * One column of plain sections, each a title and its choices, divided by a
 * hairline. Every colour comes from the theme, so dark mode is the same sheet
 * in the other palette rather than a second set of hand-picked hexes.
 *
 * The budget is shown once: `CeilingSlider` already carries the readout and
 * the presets, so there is no separate price card above it.
 */
export function FilterSheet({ query, inventory, category, onApply, onClose }: FilterSheetProps) {
  const { colors, space, layout } = useTheme();
  const topInset = useSafeAreaInsets().top;
  const bottomInset = useBottomEdgeInset();

  const [draft, setDraft] = useState<SearchQuery>(query);
  const [count, setCount] = useState(() => applyQuery(inventory, query).length);
  const [counting, setCounting] = useState(false);

  const spec = filterSpecFor(category);
  const facets = useMemo(() => facetsFor(inventory), [inventory]);

  const issues = useMemo(
    () => validateQuery(draft, inventory, category),
    [draft, inventory, category],
  );
  const blocked = hasBlockingIssue(issues);
  const totalActive = activeFilterCount(draft);

  useEffect(() => {
    setCounting(true);
    const timer = setTimeout(() => {
      setCount(applyQuery(inventory, draft).length);
      setCounting(false);
    }, COUNT_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [draft, inventory]);

  // The rent ladder scales to the dearest place actually in the inventory.
  const { rentMax, rentStep, rentPresets } = useMemo(() => {
    const rents = inventory.map((l) => l.rent).filter((r): r is number => r !== null && r > 0);
    const dearest = rents.length ? Math.max(...rents) : 0;
    const step = dearest > 20000 ? 1000 : dearest > 5000 ? 500 : 100;
    const max = Math.max(step * 10, Math.ceil((dearest * 1.1) / step) * step);
    const presets = [0.25, 0.5, 0.75, 1]
      .map((fraction) => Math.round((max * fraction) / step) * step)
      .filter((value, index, all) => value > 0 && all.indexOf(value) === index);
    return { rentMax: max, rentStep: step, rentPresets: presets };
  }, [inventory]);

  const patch = (next: Partial<SearchQuery>) => {
    tap();
    setDraft((current) => ({ ...current, ...next }));
  };

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const issueFor = (field: FilterIssue['field']) => issues.find((issue) => issue.field === field);

  const handleClearAll = () => {
    tap(Haptics.ImpactFeedbackStyle.Medium);
    setDraft({ ...draft, ...clearedFilters });
  };

  const applyLabel = blocked
    ? 'Choose who this is for'
    : count === 0
      ? 'No places match'
      : `Show ${count} ${count === 1 ? 'place' : 'places'}`;

  return (
    /* A `Modal` renders outside the app's root `GestureHandlerRootView`, so
       without one of its own the budget slider's drag never fires here. */
    <GestureHandlerRootView style={[styles.flex, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: topInset + space[2],
            paddingHorizontal: layout.gutter,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close filters"
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconButton,
            { backgroundColor: colors.surfaceRaised, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Icon name="close" size={18} color={colors.textPrimary} />
        </Pressable>

        <View style={styles.headerTitle}>
          <Text variant="title2">Filters</Text>
          {category ? (
            <Text variant="caption" color="secondary">
              {CATEGORY_LABEL[category]}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={handleClearAll}
          disabled={totalActive === 0}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          hitSlop={8}
          style={({ pressed }) => [styles.clearButton, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text
            variant="bodyStrong"
            style={{ color: totalActive > 0 ? colors.brandInk : colors.textTertiary }}
          >
            Clear all
          </Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: space[6] }}
      >
        {spec.gender ? (
          <Section title="Who is this for?" required first>
            <Segmented
              options={GENDER_CHOICES.map((gender) => ({
                key: gender,
                label: genderMeta[gender].label,
                selected: draft.gender === gender,
                onPress: () => patch({ gender }),
              }))}
            />
            <IssueLine issue={issueFor('gender')} onFix={patch} />
          </Section>
        ) : null}

        <Section title="Budget" first={!spec.gender}>
          <CeilingSlider
            label={spec.rentLabel}
            value={draft.rentCeiling ?? rentMax}
            onChange={(value) => patch({ rentCeiling: value })}
            min={0}
            max={rentMax}
            step={rentStep}
            presets={rentPresets}
            accent={colors.brand}
          />
          <IssueLine issue={issueFor('rent')} onFix={patch} />
        </Section>

        {spec.sharingLabel && facets.sharing.length > 1 ? (
          <Section title={spec.sharingLabel}>
            <ChipWrap>
              {facets.sharing.map((sharing) => (
                <Chip
                  key={sharing}
                  label={sharing}
                  selected={draft.sharing.includes(sharing)}
                  onPress={() => patch({ sharing: toggle(draft.sharing, sharing) })}
                />
              ))}
            </ChipWrap>
          </Section>
        ) : null}

        {spec.meals && facets.hasMeals ? (
          <Section title="Meals">
            <Segmented
              options={MEAL_CHOICES.map((choice) => ({
                key: String(choice.value),
                label: choice.label,
                selected: draft.meals === choice.value,
                onPress: () => patch({ meals: choice.value }),
              }))}
            />
          </Section>
        ) : null}

        {spec.furnishing && facets.furnishing.length > 1 ? (
          <Section title="Furnishing">
            <ChipWrap>
              {facets.furnishing.map((furnishing) => (
                <Chip
                  key={furnishing}
                  label={furnishing}
                  selected={draft.furnishing.includes(furnishing)}
                  onPress={() => patch({ furnishing: toggle(draft.furnishing, furnishing) })}
                />
              ))}
            </ChipWrap>
          </Section>
        ) : null}

        <Section title="Amenities" hint="Only places that have all of these">
          <ChipWrap>
            {AMENITY_CHOICES.map((amenity) => (
              <Chip
                key={amenity}
                label={AMENITY_LABEL[amenity]}
                icon={AMENITY_ICON[amenity] ?? 'star'}
                selected={draft.amenities.includes(amenity)}
                onPress={() => patch({ amenities: toggle(draft.amenities, amenity) })}
              />
            ))}
          </ChipWrap>
        </Section>

        <IssueLine issue={issueFor('combination')} onFix={patch} />
      </ScrollView>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: bottomInset + space[3],
            gap: space[3],
          },
        ]}
      >
        {count === 0 && !blocked ? (
          <View
            style={[
              styles.advisory,
              {
                backgroundColor: colors.warning.tint,
                borderColor: colors.warning.border,
                gap: space[2],
              },
            ]}
          >
            <Icon name="alert" size={14} color={colors.warning.ink} />
            <Text variant="caption" style={[styles.flex, { color: colors.warning.ink }]}>
              Nothing matches all of these.
            </Text>
            <Pressable
              onPress={() => patch({ rentCeiling: null, amenities: [] })}
              accessibilityRole="button"
              hitSlop={8}
            >
              <Text variant="bodyStrong" style={{ color: colors.warning.ink, textDecorationLine: 'underline' }}>
                Loosen
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Button
          label={applyLabel}
          disabled={blocked || count === 0}
          onPress={() => onApply(draft)}
          fullWidth
          style={counting ? { opacity: 0.6 } : undefined}
        />
      </View>
    </GestureHandlerRootView>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

function Section({
  title,
  hint,
  required,
  first,
  children,
}: {
  title: string;
  hint?: string;
  required?: boolean;
  first?: boolean;
  children: React.ReactNode;
}) {
  const { colors, space } = useTheme();
  return (
    <View
      style={{
        paddingVertical: space[5],
        gap: space[3],
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ gap: 2 }}>
        <View style={styles.titleRow}>
          <Text variant="title3" style={styles.flex}>
            {title}
          </Text>
          {required ? (
            <Text variant="caption" style={{ color: colors.danger.ink }}>
              Required
            </Text>
          ) : null}
        </View>
        {hint ? (
          <Text variant="caption" color="secondary">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ChipWrap({ children }: { children: React.ReactNode }) {
  const { space } = useTheme();
  return <View style={[styles.chipWrap, { gap: space[2] }]}>{children}</View>;
}

function Chip({
  label,
  icon,
  selected,
  onPress,
}: {
  label: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  const ink = selected ? colors.brandInk : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.chip,
        {
          borderRadius: radius.pill,
          paddingHorizontal: space[3] + 2,
          gap: 6,
          backgroundColor: selected ? colors.brandTint : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {selected ? (
        <Icon name="check" size={14} color={ink} />
      ) : icon ? (
        <Icon name={icon} size={14} color={colors.textSecondary} />
      ) : null}
      <Text variant="bodyStrong" style={{ color: ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Segmented({
  options,
}: {
  options: { key: string; label: string; selected: boolean; onPress: () => void }[];
}) {
  const { colors, radius } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      style={[
        styles.segmented,
        {
          borderRadius: radius.button,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {options.map((option) => (
        <Pressable
          key={option.key}
          onPress={option.onPress}
          accessibilityRole="radio"
          accessibilityState={{ selected: option.selected }}
          accessibilityLabel={option.label}
          style={({ pressed }) => [
            styles.segment,
            {
              borderRadius: radius.chip,
              backgroundColor: option.selected ? colors.brand : 'transparent',
              opacity: pressed && !option.selected ? 0.7 : 1,
            },
          ]}
        >
          <Text
            variant="bodyStrong"
            numberOfLines={1}
            style={{ color: option.selected ? colors.onBrand : colors.textPrimary }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

function IssueLine({
  issue,
  onFix,
}: {
  issue?: FilterIssue;
  onFix: (patch: Partial<SearchQuery>) => void;
}) {
  const { colors, space, radius } = useTheme();
  const reduceMotion = useReduceMotion();

  if (!issue) return null;

  const blocking = issue.level === 'blocking';
  const set = blocking ? colors.danger : colors.warning;

  return (
    <Animated.View
      entering={FadeIn.duration(reduceMotion ? 120 : 200)}
      accessibilityRole="alert"
      style={[
        styles.issue,
        {
          backgroundColor: set.tint,
          borderColor: set.border,
          borderRadius: radius.chip,
          padding: space[3],
          gap: space[2],
        },
      ]}
    >
      <Icon name={blocking ? 'alert' : 'clock'} size={16} color={set.ink} />
      <View style={styles.flex}>
        <Text variant="caption" style={{ color: set.ink }}>
          {issue.message}
        </Text>
        {issue.fix ? (
          <Pressable
            onPress={() => onFix(issue.fix!.patch)}
            accessibilityRole="button"
            accessibilityLabel={issue.fix.label}
            style={{ minHeight: 40, justifyContent: 'center' }}
          >
            <Text variant="bodyStrong" style={{ color: set.ink, textDecorationLine: 'underline' }}>
              {issue.fix.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  clearButton: {
    minWidth: 36,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderWidth: 1,
  },
  segmented: {
    flexDirection: 'row',
    padding: 3,
    borderWidth: 1,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  advisory: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  issue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
