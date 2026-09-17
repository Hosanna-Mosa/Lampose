import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { AMENITY_LABEL, type Amenity, type AmenityName } from '@/types/listing';
import type { StayCategory, TypeVariant } from '@/constants/tokens';

/**
 * The 22-icon amenity set.
 *
 * Sixteen are Lucide, six are drawn for this market — mess, power backup,
 * water supply, warden, curfew and attached bathroom — because they are the
 * fields students actually decide on and no icon library carries them. They
 * ship with the identical prop signature, so replacing a placeholder with a
 * final drawing is one import line.
 *
 * An amenity is never rendered without its text label. Colour comes from a
 * text token, never a raw hex, so nothing here breaks in dark mode.
 */

export const AMENITY_ICON: Record<AmenityName, IconName> = {
  wifi: 'wifi',
  powerBackup: 'powerBackup',
  waterSupply: 'waterSupply',
  laundry: 'laundry',
  mess: 'mess',
  ac: 'ac',
  attachedBath: 'attachedBath',
  studyTable: 'studyTable',
  cupboard: 'cupboard',
  parking: 'parking',
  cctv: 'cctv',
  housekeeping: 'housekeeping',
  hotWater: 'hotWater',
  lift: 'lift',
  tv: 'tv',
  fridge: 'fridge',
  gym: 'gym',
  warden: 'warden',
  visitors: 'visitors',
  curfew: 'curfew',
  drinkingWater: 'drinkingWater',
  bicycle: 'bicycle',
  /* A plain tick, because "this is here" is the whole of what we can claim
     about a string we do not recognise. Reaching for a near-match glyph
     would put a wifi symbol beside "3-tier security". */
  other: 'check',
};

/**
 * Re-exported from `types/listing`, where it now lives.
 *
 * It moved because the adapter that maps an owner's free text onto these
 * names has to read it, and importing a React component from the data layer
 * pulled React Native in with it. Every existing import of
 * `AMENITY_LABEL` from this module keeps working.
 */
export { AMENITY_LABEL } from '@/types/listing';

/**
 * Which amenities a card is allowed to promote, per category.
 *
 * A card shows at most three, taken from this list in order — never the first
 * three the owner happened to type. An owner who lists "Gym" first does not
 * get to bury the fact that there is no attached bathroom.
 */
export const CATEGORY_AMENITY_PRIORITY: Record<StayCategory, readonly AmenityName[]> = {
  // Merged from the old PG and HOSTEL lists — mess and warden lead both, and
  // the rest is the union in the order each appeared.
  PG_HOSTEL: ['mess', 'attachedBath', 'curfew', 'warden', 'wifi', 'laundry', 'cctv', 'powerBackup'],
  BACHELOR: ['ac', 'parking', 'powerBackup', 'waterSupply', 'lift', 'cupboard', 'cctv', 'gym'],
  // Co-live sells the shared parts, so those lead rather than the room's.
  COLIVE: ['wifi', 'housekeeping', 'ac', 'laundry', 'powerBackup', 'tv', 'gym', 'parking'],
  HOTEL: ['attachedBath', 'hotWater', 'ac', 'wifi', 'cctv', 'housekeeping', 'tv', 'drinkingWater'],
};

export type AmenityIconSize = 18 | 20 | 24 | 28;

export type AmenityIconProps = {
  name: AmenityName;
  size?: AmenityIconSize;
  state?: Amenity['state'];
  /** The qualifier is the whole value — "40 Mbps" turns a claim into a fact. */
  qualifier?: string;
  /**
   * The owner's own words, in place of the standard label. Carried by every
   * `other` amenity, since there is no standard label to fall back to.
   */
  label?: string;
  /** Stacks the label under the glyph instead of beside it. */
  stacked?: boolean;
  /**
   * Overrides the label's type step. Defaults to `numMeta` when stacked,
   * `body` otherwise — pass `caption` for a denser layout, e.g. the full
   * amenities grid, where eighteen-plus rows at `body` size read heavier
   * than every other section on the screen.
   */
  textVariant?: TypeVariant;
  /**
   * How many lines the label may take.
   *
   * One in a full-width row, where nothing realistic overflows. Two in the
   * two-column grid, where the width is halved and "Water · timed 6-9am" would
   * otherwise truncate to "Water · timed..." — losing exactly the half that
   * matters. The qualifier is the whole value; it may wrap, it may not be cut.
   */
  maxLines?: number;
};

export function AmenityIcon({
  name,
  size = 24,
  state = 'present',
  qualifier,
  label: labelOverride,
  stacked = false,
  textVariant,
  maxLines,
}: AmenityIconProps) {
  const { colors, space } = useTheme();

  // An unreported amenity and an absent one are different facts. Only one of
  // them is safe to show, so `unknown` renders nothing at all rather than a
  // guess dressed up as data.
  if (state === 'unknown') return null;

  const absent = state === 'absent';
  const label = labelOverride?.trim() || AMENITY_LABEL[name];
  const text = qualifier && !absent ? `${label} · ${qualifier}` : label;

  return (
    <View
      accessible
      accessibilityLabel={absent ? `${label}: not available` : text}
      style={[
        stacked ? styles.stacked : styles.inline,
        {
          gap: stacked ? space[1] : space[2],
          opacity: absent ? 0.5 : 1,
          // A wrapping label needs the glyph pinned to the first line rather
          // than floating to the vertical middle of two.
          alignItems: !stacked && (maxLines ?? 1) > 1 ? 'flex-start' : 'center',
        },
      ]}
    >
      {/* Absent is a strike and a dim, never a red icon — red would read as a
          warning about the place rather than a missing facility. */}
      <Icon name={AMENITY_ICON[name]} size={size} color={colors.textPrimary} />
      <Text
        variant={textVariant ?? (stacked ? 'numMeta' : 'body')}
        color={absent ? 'tertiary' : 'primary'}
        numberOfLines={maxLines ?? (stacked ? 2 : 1)}
        style={absent ? { textDecorationLine: 'line-through' } : undefined}
      >
        {text}
      </Text>
    </View>
  );
}

export type AmenityRowProps = {
  amenities: readonly Amenity[];
  category: StayCategory;
  /** Cards show three. The detail screen passes the full set instead. */
  max?: number;
};

/**
 * The card row: at most three amenities, chosen by category priority.
 *
 * Absent and unknown amenities never appear here — a card has room for what a
 * place has, and the full picture including what it lacks belongs on detail.
 */
export function AmenityRow({ amenities, category, max = 3 }: AmenityRowProps) {
  const { space } = useTheme();
  const priority = CATEGORY_AMENITY_PRIORITY[category];

  const present = amenities.filter((amenity) => amenity.state === 'present');
  const ranked = [...present].sort((a, b) => {
    const ai = priority.indexOf(a.name);
    const bi = priority.indexOf(b.name);
    return (ai === -1 ? priority.length : ai) - (bi === -1 ? priority.length : bi);
  });

  const shown = ranked.slice(0, max);
  if (shown.length === 0) return null;

  return (
    <View style={[styles.wrapRow, { gap: space[3] }]}>
      {shown.map((amenity) => (
        <AmenityIcon
          key={amenity.label ?? amenity.name}
          name={amenity.name}
          size={20}
          qualifier={undefined}
          label={amenity.label}
        />
      ))}
    </View>
  );
}

export type AmenityGridProps = {
  amenities: readonly Amenity[];
  /**
   * Ranks the first six. Without it the grid keeps whatever order the owner
   * typed, which is the order that buries an absent attached bathroom under a
   * gym.
   */
  category?: StayCategory;
  /** How many to show before the button. */
  initial?: number;
};

/**
 * The detail-screen grid: everything known, including what is absent.
 *
 * One column, full width. This used to run two columns, halving the row's
 * width so a two-line qualifier — "Water · timed 6-9am" beside "Two-wheeler
 * parking · Covered Parking" — wrapped inside a cramped cell, and (before
 * that) the short cell's icon could land on top of the tall cell's wrapped
 * second line. A single column gives every row the full width to lay out in,
 * so the qualifier reads as one flowing line instead of a wrap fighting the
 * cell it was squeezed into.
 *
 * Labels are still allowed three lines, which now only matters for a genuinely
 * long free-text amenity at a large font scale rather than for the ordinary
 * case.
 */
export function AmenityGrid({ amenities, category, initial = 6 }: AmenityGridProps) {
  const { colors, space } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const known = amenities.filter((amenity) => amenity.state !== 'unknown');

  /*
   * Which six.
   *
   * Ranked by the same category priority the card row uses, and — importantly —
   * ranked across present AND absent together rather than showing six present
   * ones and hiding the absences behind the button.
   *
   * That ordering is the whole point of the section. Its own caption promises
   * "what is missing is listed as plainly as what is present", and a first six
   * that quietly contained only the good news would make that caption a lie.
   * If a PG has no attached bathroom, that fact is in the first six.
   */
  const ranked = useMemo(() => {
    if (!category) return known;
    const priority = CATEGORY_AMENITY_PRIORITY[category];
    return [...known].sort((a, b) => {
      const ai = priority.indexOf(a.name);
      const bi = priority.indexOf(b.name);
      return (ai === -1 ? priority.length : ai) - (bi === -1 ? priority.length : bi);
    });
  }, [known, category]);

  /*
   * One slot is reserved for an absence.
   *
   * Ranking alone is not enough. A place whose six highest-priority amenities
   * all happen to be present shows six ticks and hides every absence behind
   * the button — while the caption under the grid promises that "what is
   * missing is listed as plainly as what is present". That promise has to hold
   * in the collapsed state, which is the state most people will ever see.
   *
   * So if anything is absent and nothing absent made the cut, the last visible
   * slot goes to the highest-priority absence. A student learns there is no
   * attached bathroom without tapping anything.
   */
  const collapsed = useMemo(() => {
    const first = ranked.slice(0, initial);
    if (first.some((item) => item.state === 'absent')) return first;
    const topAbsent = ranked.find((item) => item.state === 'absent');
    if (!topAbsent) return first;
    return [...first.slice(0, initial - 1), topAbsent];
  }, [ranked, initial]);

  const shown = expanded ? ranked : collapsed;
  const hidden = ranked.length - shown.length;

  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[3] }}>
        {/* Keyed on the label rather than the name: every free-text amenity
            shares the name `other`, so a listing advertising both a gaming
            lounge and biometric security would otherwise render two cells
            under one key and React would drop one of them. */}
        {shown.map((amenity) => (
          <View key={amenity.label ?? amenity.name} style={styles.cell}>
            <AmenityIcon
              name={amenity.name}
              size={18}
              state={amenity.state}
              qualifier={amenity.qualifier}
              label={amenity.label}
              textVariant="caption"
              maxLines={3}
            />
          </View>
        ))}
      </View>

      {/*
        A text link, not a full-width button.

        A secondary button spanning the section reads as an action of equal
        weight to the grid above it — it is the widest thing in the block for
        something that only reveals rows already on the page. As text, aligned
        to the leading edge where every row above it starts — the same edge
        the icons and labels sit on — it reads as what it is: more of the
        same list, not a separate action pulled off to the side.

        The count stays in the label. "See more" makes someone tap to find out
        whether tapping was worth it; "See all 18" lets them decide first.

        `hitSlop` is what keeps it a 44pt target while the text itself stays
        the size of the caption under it.
      */}
      {hidden > 0 || expanded ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          hitSlop={{ top: space[3], bottom: space[3], left: space[4], right: space[3] }}
          style={({ pressed }) => [styles.moreLink, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text variant="bodyStrong" style={{ color: colors.brandInk }}>
            {expanded ? 'Show fewer' : `See all ${ranked.length}`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inline: { flexDirection: 'row', alignItems: 'center' },
  stacked: { alignItems: 'center', width: 76 },
  wrapRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  cell: { width: '100%' },
  moreLink: { alignSelf: 'flex-start' },
});
