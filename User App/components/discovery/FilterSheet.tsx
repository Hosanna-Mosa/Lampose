import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CeilingSlider, Chip, Icon, Radio, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { CATEGORY_LABEL, CATEGORY_ORDER } from './CategoryTabs';
import { AMENITY_LABEL } from './AmenityIcon';
import { genderMeta, type AmenityName, type Gender, type Listing } from '@/types/listing';
import {
  activeFilterCount,
  applyQuery,
  hasBlockingIssue,
  validateQuery,
  type FilterIssue,
  type SearchQuery,
} from '@/types/filters';

/**
 * The full filter sheet.
 *
 * The whole design is one idea: the consequence of a filter is never hidden
 * until you close the sheet. The commit button owns the result count and
 * recomputes it on every change, so the number and the commitment are the same
 * gesture — you read "Show 14 places" and your thumb is already there.
 *
 * Validation appears BELOW the control that caused it, never as a banner and
 * never as a modal, and it never clears a value the user typed. The message
 * slot is reserved in the layout, so nothing jumps when one appears.
 *
 * Only two things block Apply: gender, which is a hard rule at every property,
 * and a rent ceiling below the cheapest place in the area — an empty result we
 * can predict should never be reachable. Everything else is advisory, and the
 * button stays live.
 */

/** The debounce the real count request would use. */
const COUNT_DEBOUNCE = 300;

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

/**
 * Co-ed is deliberately absent. It is a property of a building, not an answer
 * to "who is this for" — and the matcher lets co-ed places through for both
 * Boys and Girls, so excluding it here hides nothing.
 */
const GENDER_CHOICES: readonly Gender[] = ['BOYS', 'GIRLS'];

/** "Others" catches studios, whole units and anything an owner types freehand. */
const SHARING_CHOICES = ['1-sharing', '2-sharing', '3-sharing', '4-sharing', 'Others'] as const;

export type FilterSheetProps = {
  query: SearchQuery;
  /** The inventory the count and the validation are computed against. */
  inventory: readonly Listing[];
  onApply: (query: SearchQuery) => void;
  onClose: () => void;
};

export function FilterSheet({ query, inventory, onApply, onClose }: FilterSheetProps) {
  const { colors, space, radius, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  /** Every control writes to a draft. Nothing is committed until Apply. */
  const [draft, setDraft] = useState<SearchQuery>(query);
  const [count, setCount] = useState(() => applyQuery(inventory, query).length);
  const [counting, setCounting] = useState(false);

  const issues = useMemo(() => validateQuery(draft, inventory), [draft, inventory]);
  const blocked = hasBlockingIssue(issues);

  // Debounced, the way a real count request would be. While it is in flight the
  // button keeps the last number at 60% rather than replacing it with a
  // spinner — a disappearing count is exactly what makes filtering feel broken.
  useEffect(() => {
    setCounting(true);
    const timer = setTimeout(() => {
      setCount(applyQuery(inventory, draft).length);
      setCounting(false);
    }, COUNT_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [draft, inventory]);

  const patch = (next: Partial<SearchQuery>) => setDraft((current) => ({ ...current, ...next }));

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const issueFor = (field: FilterIssue['field']) => issues.find((issue) => issue.field === field);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StandardHeader
        title="Filters"
        onBack={onClose}
        actionLabel={activeFilterCount(draft) ? 'Clear all' : undefined}
        onAction={() => setDraft({ ...draft, ...clearedFilters })}
      />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: space[4],
          paddingBottom: space[8],
          gap: space[6],
        }}
      >
        {/* Gender first, because it is the only one that can block.

            Co-ed is not offered as a CHOICE, but co-ed places are not hidden:
            `matchesQuerySpec` already passes a COED listing through whichever
            of the two is picked. So the filter asks who the student is, and
            co-ed inventory reaches both of them. */}
        <Group title="Who is this for?" required>
          {GENDER_CHOICES.map((gender) => (
            <Radio
              key={gender}
              label={genderMeta[gender].label}
              selected={draft.gender === gender}
              onSelect={() => patch({ gender })}
            />
          ))}
          <IssueLine issue={issueFor('gender')} onFix={patch} />
        </Group>

        <Group title="Kind of place">
          <View style={[styles.wrap, { gap: space[2] }]}>
            {CATEGORY_ORDER.map((category) => (
              <Chip
                key={category}
                label={CATEGORY_LABEL[category]}
                selected={draft.categories.includes(category)}
                onPress={() => patch({ categories: toggle(draft.categories, category) })}
              />
            ))}
          </View>
        </Group>

        <Group title="Monthly rent — up to">
          <CeilingSlider
            label="Rent"
            value={draft.rentCeiling ?? 30000}
            onChange={(value) => patch({ rentCeiling: value })}
            min={0}
            max={30000}
            step={500}
            presets={[5000, 8000, 10000, 15000, 30000]}
            accent={colors.brand}
          />
          <IssueLine issue={issueFor('rent')} onFix={patch} />
        </Group>

        <Group title="Sharing">
          <View style={[styles.wrap, { gap: space[2] }]}>
            {SHARING_CHOICES.map((sharing) => (
              <Chip
                key={sharing}
                label={sharing}
                selected={draft.sharing.includes(sharing)}
                onPress={() => patch({ sharing: toggle(draft.sharing, sharing) })}
              />
            ))}
          </View>
        </Group>

        <Group title="Must have">
          <View style={[styles.wrap, { gap: space[2] }]}>
            {/* Power, water and wifi first — the deal-breakers on patchy infra. */}
            {AMENITY_CHOICES.map((amenity) => (
              <Chip
                key={amenity}
                label={AMENITY_LABEL[amenity]}
                selected={draft.amenities.includes(amenity)}
                onPress={() => patch({ amenities: toggle(draft.amenities, amenity) })}
              />
            ))}
          </View>
        </Group>

        <IssueLine issue={issueFor('combination')} onFix={patch} />
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.borderSubtle,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: insets.bottom + layout.gutter,
            gap: space[2],
          },
        ]}
      >
        {/* The count lives on the button, not in a header. The number and the
            commitment are the same gesture, and on a one-handed screen the
            most-watched number belongs under the thumb. */}
        <Button
          label={
            blocked
              ? 'Pick who this is for'
              : count === 0
                ? 'No places match'
                : `Show ${count} ${count === 1 ? 'place' : 'places'}`
          }
          disabled={blocked || count === 0}
          onPress={() => onApply(draft)}
          fullWidth
          style={counting ? { opacity: 0.6 } : undefined}
        />
        {count === 0 && !blocked ? (
          <Text variant="caption" color="secondary">
            Nothing fits all of this. Loosen the rent ceiling or drop an amenity — you never have to
            apply your way into an empty list.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const clearedFilters: Partial<SearchQuery> = {
  categories: [],
  rentCeiling: null,
  sharing: [],
  amenities: [],
};

function Group({
  title,
  required = false,
  children,
}: {
  title: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <View style={[styles.groupHead, { gap: space[2] }]}>
        <Text variant="title3">{title}</Text>
        {required ? (
          <Text variant="label" color="danger">
            Required
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * The message sits under the control that caused it, and the slot is reserved
 * so nothing below it jumps when one appears.
 */
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
            style={{ minHeight: 44, justifyContent: 'center' }}
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  groupHead: { flexDirection: 'row', alignItems: 'baseline' },
  issue: { flexDirection: 'row', alignItems: 'flex-start', borderWidth: StyleSheet.hairlineWidth },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
