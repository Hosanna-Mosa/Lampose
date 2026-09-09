import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';

import { Button, CeilingSlider, Chip, Icon, Radio, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useReduceMotion, useTheme } from '@/context/ThemeContext';
import { CATEGORY_LABEL } from './CategoryTabs';
import { AMENITY_LABEL } from './AmenityIcon';
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
 * Only two things block Apply: gender — where the category actually has a rule
 * about it — and a rent ceiling below the cheapest place in the area, an empty
 * result we can predict that should never be reachable. Everything else is
 * advisory, and the button stays live.
 *
 * ## The sheet belongs to ONE category, and asks that category's questions
 *
 * It used to ask all five questions of every category, including a "Kind of
 * place" control that fought the tab row above the feed. Three of the five
 * were wrong somewhere: sharing is meaningless for a whole bachelor unit,
 * furnishing is a non-question for a PG bed, and gender is not a fact about a
 * hotel — where, being REQUIRED, it blocked Apply until somebody answered a
 * question about nothing.
 *
 * `filterSpecFor` decides which controls appear and what they are called;
 * `facetsFor` fills them from the listings actually on screen. So the shape of
 * the sheet is a decision in one place and its contents are the database's,
 * and neither is a list of strings kept in this file.
 *
 * "Kind of place" is gone entirely. The tab row above the feed already answers
 * it, the sheet is opened from within one tab, and a category chip in here
 * could only contradict the tab it was opened from.
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

/* `SHARING_CHOICES` used to sit here: "1-sharing" … "4-sharing", "Others".
   Not one of those strings appears in the collection — the panel records
   "2 Sharing", "Single Occupancy", "1 BHK", "Deluxe Double" — so four of the
   five chips matched nothing and the fifth matched nothing either. The options
   come from `facetsFor(inventory)` now, which is the only way this control can
   offer a value that will actually select something. */

export type FilterSheetProps = {
  query: SearchQuery;
  /** The inventory the count, the options and the validation are computed
      against — the listings currently on screen behind the sheet. */
  inventory: readonly Listing[];
  /** Which tab this was opened from. Decides which controls are drawn. */
  category: StayCategory | null;
  onApply: (query: SearchQuery) => void;
  onClose: () => void;
};

export function FilterSheet({ query, inventory, category, onApply, onClose }: FilterSheetProps) {
  const { colors, space, radius, layout } = useTheme();
  const bottomInset = useBottomEdgeInset();
  const reduceMotion = useReduceMotion();

  /** Every control writes to a draft. Nothing is committed until Apply. */
  const [draft, setDraft] = useState<SearchQuery>(query);
  const [count, setCount] = useState(() => applyQuery(inventory, query).length);
  const [counting, setCounting] = useState(false);

  const spec = filterSpecFor(category);
  /* Derived from the inventory rather than held in state: the feed behind this
     sheet can refetch while it is open, and an option list frozen at mount
     would start offering room types that are no longer there. */
  const facets = useMemo(() => facetsFor(inventory), [inventory]);

  const issues = useMemo(
    () => validateQuery(draft, inventory, category),
    [draft, inventory, category],
  );
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

  /*
   * The rent track, scaled to what this category actually costs.
   *
   * It was a fixed 0–30,000 with 500-rupee steps and five presets, which is a
   * sensible monthly ladder and a useless nightly one: a hotel at ₹1,200 a
   * night sat in the first four percent of the slider, where no thumb can
   * separate ₹800 from ₹1,500. The ceiling is read off the priciest listing on
   * screen, rounded up to a round number, with a floor so a category with two
   * cheap listings still gets a usable track.
   */
  const { rentMax, rentStep, rentPresets } = useMemo(() => {
    const rents = inventory.map((l) => l.rent).filter((r): r is number => r !== null && r > 0);
    const dearest = rents.length ? Math.max(...rents) : 0;

    /* Round the top up to a step, so the highest listing is inside the track
       rather than exactly on its end. */
    const step = dearest > 20000 ? 1000 : dearest > 5000 ? 500 : 100;
    const max = Math.max(step * 10, Math.ceil((dearest * 1.1) / step) * step);

    /* Four marks along the track. Quarter points rather than remembered
       figures, because the figures that mean something depend on the market
       this category is in. */
    const presets = [0.25, 0.5, 0.75, 1]
      .map((fraction) => Math.round((max * fraction) / step) * step)
      .filter((value, index, all) => value > 0 && all.indexOf(value) === index);

    return { rentMax: max, rentStep: step, rentPresets: presets };
  }, [inventory]);

  const patch = (next: Partial<SearchQuery>) => setDraft((current) => ({ ...current, ...next }));

  const toggle = <T,>(list: readonly T[], value: T): readonly T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const issueFor = (field: FilterIssue['field']) => issues.find((issue) => issue.field === field);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StandardHeader
        title="Filters"
        /* Which category these filters belong to, said out loud. The sheet's
           controls change by category, so a student who opens it from a
           different tab and finds different questions should be able to see
           why without going back to check. */
        subtitle={category ? CATEGORY_LABEL[category] : undefined}
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
        {/* Gender first, because it is the only one that can block — and only
            where the category has a rule about it.

            Co-ed is not offered as a CHOICE, but co-ed places are not hidden:
            `matchesQuerySpec` already passes a COED listing through whichever
            of the two is picked. So the filter asks who the student is, and
            co-ed inventory reaches both of them. */}
        {spec.gender ? (
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
        ) : null}

        {/* "Kind of place" used to sit here, offering all four categories
            inside a sheet opened from one of them. The tab row above the feed
            is where that question is asked and answered. */}

        <Group title={spec.rentLabel}>
          <CeilingSlider
            label="Rent"
            value={draft.rentCeiling ?? rentMax}
            onChange={(value) => patch({ rentCeiling: value })}
            min={0}
            /* The ceiling is scaled to what this category actually costs. A
               fixed 0–30,000 put every hotel night in the leftmost eighth of
               the track, where a 500-rupee step cannot be aimed at. */
            max={rentMax}
            step={rentStep}
            presets={rentPresets}
            accent={colors.brand}
          />
          <IssueLine issue={issueFor('rent')} onFix={patch} />
        </Group>

        {/* The bed, the unit or the room — whichever this category sells, in
            the owner's own words. Absent when the listings on screen offer no
            choice at all: a control with one chip is not a filter. */}
        {spec.sharingLabel && facets.sharing.length > 1 ? (
          <Group title={spec.sharingLabel}>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {facets.sharing.map((sharing) => (
                <Chip
                  key={sharing}
                  label={sharing}
                  selected={draft.sharing.includes(sharing)}
                  onPress={() => patch({ sharing: toggle(draft.sharing, sharing) })}
                />
              ))}
            </View>
          </Group>
        ) : null}

        {/* Furnishing, on the categories where an empty room is a real
            possibility. Same rule: only when the inventory offers a choice. */}
        {spec.furnishing && facets.furnishing.length > 1 ? (
          <Group title="Furnishing">
            <View style={[styles.wrap, { gap: space[2] }]}>
              {facets.furnishing.map((furnishing) => (
                <Chip
                  key={furnishing}
                  label={furnishing}
                  selected={draft.furnishing.includes(furnishing)}
                  onPress={() => patch({ furnishing: toggle(draft.furnishing, furnishing) })}
                />
              ))}
            </View>
          </Group>
        ) : null}

        {/*
          Meals — three states, not a switch.

          "Any" is the resting state and it has to be reachable, because a
          two-state control forces somebody who does not care into answering
          anyway and then hides half the feed from them. `null` is Any.

          Only drawn when at least one listing here states a meal plan; on a
          feed where none do, "With meals" is a chip that empties the screen.
        */}
        {spec.meals && facets.hasMeals ? (
          <Group title="Meals">
            <View style={[styles.wrap, { gap: space[2] }]}>
              <Chip
                label="Any"
                selected={draft.meals === null}
                onPress={() => patch({ meals: null })}
              />
              <Chip
                label="With meals"
                selected={draft.meals === true}
                onPress={() => patch({ meals: draft.meals === true ? null : true })}
              />
              <Chip
                label="Without meals"
                selected={draft.meals === false}
                onPress={() => patch({ meals: draft.meals === false ? null : false })}
              />
            </View>
          </Group>
        ) : null}

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
            /* The sheet's footer owns the bottom edge, and on Android
               `insets.bottom` is often 0 — see `useBottomEdgeInset`. Without
               the floor, Apply sat on the gesture handle. */
            paddingBottom: bottomInset + layout.gutter,
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
  furnishing: [],
  meals: null,
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
