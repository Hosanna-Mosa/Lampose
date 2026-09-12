import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomSheet, Button, Icon, Text } from '@/components/ui';
// Crossing from discovery into booking, deliberately: there is one calendar in
// this app and a second one drawn here would drift from it within a release.
import { MoveInDatePicker } from '@/components/booking';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { MessChoice, SharingOption, StayRate, StayTypeId } from '@/types/listing';

/**
 * "Are you looking for" — the PG and hostel replacement for sharing selection.
 *
 * Three decisions: how long a stay, how many of them, and whether meals are
 * included. Together they produce the number the student is shopping on, so
 * they belong on one screen and above the money — not spread across a flow
 * where the price changes after each step.
 *
 * ## Two dropdowns, and the second depends on the first
 *
 * Stay type is the question that changes what the other question even means:
 * "3" is three nights or three months depending on the answer above it, and
 * those are different orders of magnitude of money. So the length dropdown is
 * dead until a stay type is picked, and picking a different stay type clears
 * the length rather than reinterpreting it.
 *
 * Short stay reads 1–7 days; long stay reads whole months. Weekly rates still
 * exist in the data — a listing that quotes one keeps it — but the student is
 * asked the question in the two shapes they actually arrive with: passing
 * through, or moving in.
 *
 * ## The prices are inside the options
 *
 * A closed dropdown hides its prices, which is the standing objection to
 * dropdowns on this screen. It is answered by putting the rate on every row of
 * the open list and on the closed field once chosen, so the control is never a
 * thing you have to open twice to compare.
 *
 * ## Nothing is preselected
 *
 * The action bar's button stays disabled until both dropdowns are answered.
 * A default stay type would mean the student sends a request for a length they
 * never chose — and the owner receives it as though they had.
 *
 * ## The total is not here — it is in the action bar
 *
 * This block asks the questions; the bar answers with the price. Two money
 * figures on one screen that must always agree is the setup for them one day
 * not agreeing, and the bar is where the figure stays in thumb reach while the
 * student is still changing their mind.
 */

/* ------------------------------------------------------------------ *
 * The two tracks
 * ------------------------------------------------------------------ */

export type StayTrack = 'SHORT' | 'LONG';

export const STAY_TRACK_LABEL: Record<StayTrack, string> = {
  SHORT: 'Short stay',
  LONG: 'Long stay',
};

/** Which rate backs each track. A track with no rate is not offered. */
const TRACK_RATE: Record<StayTrack, StayTypeId> = { SHORT: 'DAILY', LONG: 'MONTHLY' };

/** Short stay is 1–7 days. Beyond a week is the other question. */
const SHORT_DAY_OPTIONS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export function trackOf(stayType: StayTypeId | null): StayTrack | null {
  if (stayType === 'DAILY') return 'SHORT';
  if (stayType === 'MONTHLY') return 'LONG';
  return null;
}

export type StayIntent = {
  /**
   * `null` until the student picks. Nothing here is preselected, because the
   * request that goes to the owner carries this number.
   */
  stayType: StayTypeId | null;
  /** In units of the chosen rate — 3 days, 2 months. `null` until picked. */
  units: number | null;
  /**
   * Which sharing, on listings that offer a choice. `null` until picked, and
   * left `null` on listings that quote one price for the whole place.
   */
  sharingId: string | null;
  /**
   * The day they want to move in, as `YYYY-MM-DD`. `null` until picked.
   *
   * A string rather than a `Date`, because it is a calendar day and not an
   * instant — a `Date` carries a time and a zone, and a student in Hyderabad
   * picking "5 September" must not become the 4th for a server in UTC.
   */
  joinDate: string | null;
  /**
   * "A day or two either way".
   *
   * An owner holding a bed for a fixed date turns away everyone else for it.
   * Saying the date can move is what lets them say yes to a student whose train
   * has not been booked — so it travels with the request rather than being a
   * conversation after it.
   */
  flexibleJoin: boolean;
};

export type StayIntentSelectorProps = {
  rates: readonly StayRate[];
  /**
   * The sharing choices, from the server. Each carries its own price at each
   * stay rate — a single room and a four-sharing bed are different products,
   * not one number scaled.
   */
  sharingOptions?: readonly SharingOption[];
  mess?: MessChoice;
  value: StayIntent;
  onChange: (next: StayIntent) => void;
};

/**
 * The per-unit price for a stay rate and a sharing choice.
 *
 * The sharing's own price wins where the owner recorded one; the listing-level
 * rate is the fallback for listings priced by stay length alone.
 *
 * ## It reads `pricePerPerson`, and that is the fix
 *
 * This used to read `sharing.ratePerUnit[rate.id]` — a field that does not
 * exist on a `SharingOption` and never has. It is a leftover from the fixture
 * shape in `data/listings.ts`; the adapter that turns a server listing into
 * one of these writes `pricePerPerson` (see `toSharingOptions`). An undefined
 * lookup falls through the `??`, so EVERY sharing option was priced at the
 * listing's headline rate — Single, 2 Sharing and 3 Sharing all quoting the
 * same ₹6,000, which is exactly the bug reported against this control.
 *
 * `pricePerPerson` is per person, per MONTH — the adapter says so and the
 * onboarding panel stores it that way. So it is applied on the monthly track
 * only. A per-sharing NIGHTLY figure exists for hotels alone (`rates`), and a
 * PG quoting a daily rate has one number for the building; using a monthly
 * figure there would misprice a short stay by a factor of thirty.
 */
export function unitPrice(rate: StayRate, sharing: SharingOption | null): number {
  if (rate.id === 'MONTHLY' && sharing?.pricePerPerson !== undefined) {
    return sharing.pricePerPerson;
  }
  return rate.pricePerUnit;
}

/**
 * Which sharing options this listing offers at a given stay rate.
 *
 * Every option the listing carries, at every track it quotes. The previous
 * version filtered on `ratePerUnit`, the same non-existent field as above, so
 * the filter matched nothing and fell through to its own fallback on every
 * call — it has never once narrowed this list. Returning them plainly is what
 * it actually did, now said honestly: where a sharing has no price of its own
 * `unitPrice` falls back to the listing rate rather than hiding the option.
 */
export function sharingAtRate(
  options: readonly SharingOption[] | undefined,
  _rate: StayRate | null,
): readonly SharingOption[] {
  return options?.length ? options : [];
}

/**
 * True when every dropdown the listing shows has been answered — the bar's gate.
 *
 * `hasSharing` is passed rather than inferred, because a listing with no
 * sharing choice must not be held behind a control it never rendered.
 *
 * ## The date is checked, not just counted
 *
 * `joinDate !== null` was the whole test, which is enough while the only way
 * to set one is the calendar below — it cannot offer a past day. It is not
 * enough for a date that ARRIVED here: a request re-sent from a notification,
 * a screen left open across a night, or any future path that seeds an intent
 * from something stored. A past joining date is not a slightly wrong request,
 * it is one the owner cannot act on, and by the time anybody notices they have
 * already been notified.
 *
 * So the gate asks the question the picker's bounds only imply.
 */
export function stayIntentComplete(intent: StayIntent, hasSharing = false): boolean {
  if (intent.stayType === null || intent.units === null) return false;
  if (intent.joinDate === null || !isFutureDay(intent.joinDate)) return false;
  return !hasSharing || intent.sharingId !== null;
}

/**
 * Is this `YYYY-MM-DD` today or later, read in local time?
 *
 * Compared as strings against a locally-built today, which works because the
 * format sorts lexicographically and both sides are built the same way.
 * Parsing to a `Date` and comparing instants is what puts an evening in India
 * on the wrong side of the line.
 */
export function isFutureDay(iso: string): boolean {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso >= today;
}

/**
 * Days, base and total — one place, so nothing computes it twice.
 *
 * Returns `null` while the intent is incomplete rather than falling back to a
 * first rate. A total derived from a stay length nobody chose is the one number
 * on this screen that must never be invented.
 */
export function stayTotals(
  rates: readonly StayRate[],
  intent: StayIntent,
  sharingOptions?: readonly SharingOption[],
) {
  if (intent.stayType === null || intent.units === null) return null;
  const rate = rates.find((item) => item.id === intent.stayType);
  if (!rate) return null;
  const sharing = sharingOptions?.find((option) => option.id === intent.sharingId) ?? null;
  // A listing that offers sharing has no price until one is chosen. Showing
  // the cheapest, or the first, would be quoting a bed nobody selected.
  if (sharingOptions?.length && !sharing) return null;
  const perUnit = unitPrice(rate, sharing);
  const days = rate.daysPerUnit * intent.units;
  const base = perUnit * intent.units;
  /*
   * No mess line.
   *
   * Meals stopped being something the student picks — the screen states whether
   * a place has a mess, and that is all. So there is nothing here to add: the
   * total is the rate times the length, and a mess charge that appeared in it
   * would be money nobody agreed to.
   */
  return { rate, sharing, perUnit, days, base, total: base, deposit: sharing?.deposit ?? rate.deposit };
}

/* ------------------------------------------------------------------ *
 * The joining date
 * ------------------------------------------------------------------ */

/**
 * How much warning an owner gets before somebody arrives.
 *
 * Zero: today is a joining date a student may pick.
 *
 * It was two days, on the reasoning that a bed has to be cleared and cleaned
 * and an owner who cannot deliver tomorrow is a cancellation that looks like
 * the app's fault. That is a real risk and it is the owner's to take: a
 * student standing at a station tonight is the case this product exists for,
 * and the owner still ANSWERS every request — nothing here books a bed, it
 * asks for one, and an owner who needs two days says so by declining. The
 * matching server bound (`JOIN_MIN_DAYS` in stayIntent.util.js) moved with
 * this; a picker that offers a day the server refuses is worse than either
 * rule on its own.
 */
const NOTICE_DAYS = 0;

/** How far ahead a date may be chosen. Beyond this the owner cannot commit. */
const MONTHS_AHEAD = 2;

/** `YYYY-MM-DD` — a calendar day, with no time and no zone attached. */
function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function readIso(value: string | null): { year: number; month: number; day: number } | null {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return { year, month: month - 1, day };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function shortDate(value: string): string {
  const parsed = readIso(value);
  if (!parsed) return value;
  return `${parsed.day} ${MONTH_NAMES[parsed.month].slice(0, 3)} ${parsed.year}`;
}

/* ------------------------------------------------------------------ *
 * The dropdown field
 * ------------------------------------------------------------------ */

type Option = {
  id: string;
  label: string;
  price?: string;
  /** "2 beds left". Sits beside the price on the second line. */
  meta?: string;
  /** A sold-out sharing stays listed and stays unpickable. */
  disabled?: boolean;
};

type DropdownProps = {
  label: string;
  /** What the closed field says before anything is chosen. */
  placeholder: string;
  options: readonly Option[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The length dropdown is dead until a stay type is chosen. */
  disabled?: boolean;
  /** The sheet's own title, which is the question being answered. */
  sheetTitle?: string;
  isOpen?: boolean;
  onToggle?: () => void;
};

/**
 * An inline anchored dropdown field.
 *
 * Renders the options card directly beneath the field in the layout flow.
 * This guarantees zero misplacement, perfect alignment, and seamless scrolling
 * on all screen sizes and platforms (iOS, Android, Web).
 */
function Dropdown({
  label,
  placeholder,
  options,
  selectedId,
  onSelect,
  disabled = false,
  isOpen: controlledOpen,
  onToggle,
}: DropdownProps) {
  const { colors, space, radius, touch, elevation } = useTheme();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const toggleOpen = () => {
    if (disabled) return;
    if (onToggle) {
      onToggle();
    } else {
      setInternalOpen(!internalOpen);
    }
  };

  const selected = options.find((option) => option.id === selectedId) ?? null;

  return (
    <View style={styles.flex}>
      <View style={{ gap: space[1] }}>
        <Text variant="caption" color="secondary">
          {label}
        </Text>
        <Pressable
          onPress={toggleOpen}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled, expanded: open }}
          accessibilityLabel={
            selected
              ? `${label}: ${selected.label}${selected.price ? `, ${selected.price}` : ''}`
              : `${label}: ${placeholder}`
          }
          style={({ pressed }) => [
            styles.field,
            {
              minHeight: touch.min,
              borderRadius: radius.button,
              paddingHorizontal: space[3],
              gap: space[2],
              opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
              backgroundColor: colors.surface,
              borderColor: open ? colors.brand : selected ? colors.brand : colors.borderInput,
              borderWidth: open || selected ? 1.5 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          <View style={styles.flex}>
            <Text variant="bodyStrong" color={selected ? 'primary' : 'tertiary'} numberOfLines={1}>
              {selected ? selected.label : placeholder}
            </Text>
            {selected?.price ? (
              <Text variant="numMeta" color="secondary" numberOfLines={1}>
                {selected.price}
              </Text>
            ) : null}
          </View>
          <View style={open ? styles.chevronUp : styles.chevronDown}>
            <Icon name="chevronRight" size={20} color={open ? colors.brand : colors.textTertiary} />
          </View>
        </Pressable>

        {open ? (
          <View
            style={[
              elevation.float,
              styles.inlinePanel,
              {
                marginTop: 4,
                backgroundColor: colors.surface,
                borderColor: colors.borderSubtle,
                borderWidth: 1,
                borderRadius: radius.card,
                maxHeight: 220,
              },
            ]}
          >
            <ScrollView
              bounces={false}
              nestedScrollEnabled
              contentContainerStyle={{ padding: space[1] }}
              accessibilityRole="radiogroup"
            >
              {options.map((option) => {
                const active = option.id === selectedId;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      if (option.disabled) return;
                      onSelect(option.id);
                      if (onToggle) {
                        onToggle();
                      } else {
                        setInternalOpen(false);
                      }
                    }}
                    disabled={option.disabled}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled: option.disabled }}
                    accessibilityLabel={[option.label, option.price, option.meta]
                      .filter(Boolean)
                      .join(', ')}
                    style={({ pressed }) => [
                      styles.optionRow,
                      {
                        minHeight: touch.min,
                        borderRadius: radius.button,
                        paddingHorizontal: space[3],
                        paddingVertical: space[2],
                        gap: space[2],
                        opacity: option.disabled ? 0.45 : 1,
                        backgroundColor: active
                          ? colors.brandTint
                          : pressed
                            ? colors.surfaceSunken
                            : 'transparent',
                      },
                    ]}
                  >
                    <View style={styles.flex}>
                      <Text variant="bodyStrong" color={active ? 'brand' : 'primary'} numberOfLines={1}>
                        {option.label}
                      </Text>
                      {option.price || option.meta ? (
                        <Text variant="numMeta" color={active ? 'brand' : 'secondary'} numberOfLines={1}>
                          {[option.price, option.meta].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                    {active ? <Icon name="check" size={16} color={colors.brand} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The joining-date field, and the calendar behind it.
 *
 * The field is a `Dropdown` in everything but content — same height, same
 * border, same chevron — because it is the fourth answer in one set of
 * questions and a differently-shaped control would read as a different kind of
 * thing.
 *
 * What opens is a sheet rather than the drop panel the others use. A month grid
 * is 300 points tall and does not belong in a panel sized to a field; and
 * unlike the other three this control has its own navigation, which needs room
 * for a header.
 *
 * The calendar is the app's one `MoveInDatePicker`, so the pro-rated first
 * month appears here exactly as it does everywhere else.
 */
function JoinDateField({
  value,
  onChange,
  rent,
  flexible,
  onFlexibleChange,
}: {
  value: string | null;
  onChange: (iso: string) => void;
  rent: number;
  flexible: boolean;
  onFlexibleChange: (flexible: boolean) => void;
}) {
  const { colors, space, radius, touch } = useTheme();
  const [open, setOpen] = useState(false);

  /* Today, captured once per mount. Re-reading the clock on every render would
     move the earliest selectable day mid-session at midnight. */
  const [today] = useState(() => new Date());
  const selected = readIso(value);

  const [cursor, setCursor] = useState(() =>
    selected
      ? { year: selected.year, month: selected.month }
      : { year: today.getFullYear(), month: today.getMonth() },
  );

  /* The earliest day the owner can be expected to be ready for. Only binds in
     the current month — every later month is open from the 1st. */
  const inThisMonth =
    cursor.year === today.getFullYear() && cursor.month === today.getMonth();
  const earliestDay = inThisMonth ? today.getDate() + NOTICE_DAYS : 1;

  const monthIndex = cursor.year * 12 + cursor.month;
  const firstIndex = today.getFullYear() * 12 + today.getMonth();
  const canGoBack = monthIndex > firstIndex;
  const canGoForward = monthIndex < firstIndex + MONTHS_AHEAD;

  const step = (delta: number) => {
    const next = cursor.month + delta;
    setCursor({
      year: cursor.year + Math.floor(next / 12),
      month: ((next % 12) + 12) % 12,
    });
  };

  return (
    <View>
      <View style={{ gap: space[1] }}>
        <Text variant="caption" color="secondary">
          Joining date
        </Text>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={value ? `Joining date: ${shortDate(value)}` : 'Joining date: select'}
          style={({ pressed }) => [
            styles.field,
            {
              minHeight: touch.min,
              borderRadius: radius.button,
              paddingHorizontal: space[3],
              gap: space[2],
              opacity: pressed ? 0.7 : 1,
              backgroundColor: colors.surface,
              borderColor: value ? colors.brand : colors.borderInput,
              borderWidth: value ? 1.5 : StyleSheet.hairlineWidth,
            },
          ]}
        >
          <View style={styles.flex}>
            <Text variant="bodyStrong" color={value ? 'primary' : 'tertiary'} numberOfLines={1}>
              {value ? shortDate(value) : 'Select'}
            </Text>
            {value && flexible ? (
              <Text variant="numMeta" color="secondary" numberOfLines={1}>
                A day or two either way
              </Text>
            ) : null}
          </View>
          <Icon name="calendar" size={20} color={colors.textTertiary} />
        </Pressable>
      </View>

      <BottomSheet visible={open} onClose={() => setOpen(false)} title="When do you want to move in?">
        <View style={{ gap: space[4] }}>
          {/* Month navigation. Bounded at both ends: backwards stops at this
              month because the past cannot be moved into, forwards stops where
              an owner can no longer sensibly commit a bed. */}
          <View style={[styles.monthNav, { gap: space[3] }]}>
            <Button
              label="‹"
              variant="secondary"
              size="sm"
              disabled={!canGoBack}
              onPress={() => step(-1)}
            />
            <Text variant="bodyStrong" style={styles.centred}>
              {MONTH_NAMES[cursor.month]} {cursor.year}
            </Text>
            <Button
              label="›"
              variant="secondary"
              size="sm"
              disabled={!canGoForward}
              onPress={() => step(1)}
            />
          </View>

          <MoveInDatePicker
            year={cursor.year}
            month={cursor.month}
            value={selected && selected.month === cursor.month && selected.year === cursor.year ? selected.day : null}
            onChange={(day) => {
              onChange(isoDay(cursor.year, cursor.month, day));
              setOpen(false);
            }}
            rent={rent}
            earliestDay={earliestDay}
            noticeDays={NOTICE_DAYS}
            flexible={flexible}
            onFlexibleChange={onFlexibleChange}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * The selector
 * ------------------------------------------------------------------ */

export function StayIntentSelector({
  rates,
  sharingOptions,
  mess,
  value,
  onChange,
}: StayIntentSelectorProps) {
  const { colors, space, radius, touch } = useTheme();
  const [openDropdown, setOpenDropdown] = useState<'stayType' | 'units' | 'sharing' | null>(null);

  /* Only tracks this listing actually quotes a rate for. A place with no daily
     rate does not get a "Short stay" option it cannot honour. */
  const tracks = useMemo(
    () =>
      (['SHORT', 'LONG'] as const)
        .map((track) => ({ track, rate: rates.find((item) => item.id === TRACK_RATE[track]) }))
        .filter((entry): entry is { track: StayTrack; rate: StayRate } => entry.rate !== undefined),
    [rates],
  );

  const track = trackOf(value.stayType);
  const activeRate = tracks.find((entry) => entry.track === track)?.rate ?? null;

  /*
   * No price on these two, and that is deliberate.
   *
   * Both used to carry one — the listing's headline rate on the stay type,
   * and that rate times the count on the length. Neither survives the sharing
   * choice below them: the moment a student picks Single or 3 Sharing the real
   * per-person figure replaces it, so the number these quoted was the price of
   * a bed nobody had chosen yet. Two figures that disagree on one screen is
   * worse than one figure in the right place, and the right place is the
   * sharing row (which prices the actual bed) and the action bar (which
   * totals it).
   */
  const typeOptions: readonly Option[] = tracks.map(({ track: id }) => ({
    id,
    label: STAY_TRACK_LABEL[id],
  }));

  /* Short stay is 1–7 days; long stay is whatever months the owner quotes. */
  const lengthOptions: readonly Option[] = useMemo(() => {
    if (!activeRate) return [];
    const counts = track === 'SHORT' ? SHORT_DAY_OPTIONS : activeRate.unitOptions;
    return counts.map((count) => ({
      id: String(count),
      label: `${count} ${activeRate.unit}${count === 1 ? '' : 's'}`,
    }));
  }, [activeRate, track]);

  /*
   * Sharing, priced at whichever stay rate is on screen.
   *
   * The same bed is a different number by the night and by the month, so this
   * list is rebuilt when the stay type changes rather than showing one monthly
   * figure under a nightly stay. A sharing the owner does not offer at the
   * chosen rate is not listed at all.
   */
  const sharingChoices = useMemo(
    () => sharingAtRate(sharingOptions, activeRate),
    [sharingOptions, activeRate],
  );

  const sharingChoiceOptions: readonly Option[] = useMemo(() => {
    if (!activeRate) return [];
    return sharingChoices.map((option) => ({
      id: option.id,
      label: option.label,
      price: `${formatRupees(unitPrice(activeRate, option))}/${activeRate.unit}`,
      /*
       * Beds left, and the three states are not two.
       *
       * This read `option.bedsLeft` — the fixture field again, absent from
       * every real listing — so the row rendered the string "undefined left"
       * under every sharing type. The adapter's field is `availableBeds`, and
       * it keeps `undefined` and `0` deliberately apart: undefined means
       * nobody has recorded a count (true of every property onboarded before
       * the field existed), zero means every bed is taken. Saying "Full"
       * for an uncounted room turns a student away from a bed that is free.
       *
       * Sold out is stated rather than hidden. A student who sees only two of
       * the four sharing types assumes the place is small, not that the cheap
       * bed went — and the cheap bed going is the thing that decides.
       */
      meta: option.availableBeds === undefined
        ? undefined
        : option.availableBeds === 0
          ? 'Full'
          : `${option.availableBeds} left`,
      /* The server's own verdict, which folds in the two states a bed count
         cannot express on its own: the owner paused this room type, and no
         inventory was ever recorded. */
      disabled: option.requestable === false,
    }));
  }, [sharingChoices, activeRate]);

  return (
    <View style={{ gap: space[4] }}>
      {/* The one block on this page where the student ANSWERS rather than
          reads, so it wears the accent — the same signal the chosen fields
          below it carry, and the button at the bottom that acts on them. */}
      <View style={[styles.headingRow, { gap: space[2] }]}>
        <View
          style={[
            styles.headingChip,
            {
              width: 30, height: 30, borderRadius: radius.chip, backgroundColor: colors.brandTint,
            },
          ]}
        >
          <Icon name="search" size={16} color={colors.brandInk} />
        </View>
        <Text variant="title2" style={{ color: colors.brandInk }}>
          Are you looking for
        </Text>
      </View>

      {/* Side by side: two halves of one question, and putting them on one
          line is what makes the dependency between them legible. */}
      <View style={[styles.row, { gap: space[3], alignItems: 'flex-start' }]}>
        <Dropdown
          label="Stay type"
          sheetTitle="How long are you staying?"
          placeholder="Select"
          options={typeOptions}
          selectedId={track}
          isOpen={openDropdown === 'stayType'}
          onToggle={() => setOpenDropdown(openDropdown === 'stayType' ? null : 'stayType')}
          onSelect={(id) => {
            // Units belong to a rate — 3 days is not 3 months. Switching track
            // clears the length rather than carrying a number that now means
            // something else and a price nobody agreed to.
            const nextType = TRACK_RATE[id as StayTrack];
            const nextRate = rates.find((item) => item.id === nextType) ?? null;
            // The sharing survives if the new rate quotes it. Two-sharing is
            // still two-sharing by the night; it is only the price that moved.
            const stillOffered = sharingAtRate(sharingOptions, nextRate).some(
              (option) => option.id === value.sharingId,
            );
            onChange({
              ...value,
              stayType: nextType,
              units: null,
              sharingId: stillOffered ? value.sharingId : null,
            });
            setOpenDropdown(null);
          }}
        />
        <Dropdown
          label={track === 'SHORT' ? 'How many days' : track === 'LONG' ? 'How many months' : 'Duration'}
          sheetTitle={track === 'SHORT' ? 'How many days?' : 'How many months?'}
          placeholder={track ? 'Select' : 'Pick stay type'}
          options={lengthOptions}
          selectedId={value.units === null ? null : String(value.units)}
          isOpen={openDropdown === 'units'}
          onToggle={() => setOpenDropdown(openDropdown === 'units' ? null : 'units')}
          onSelect={(id) => {
            onChange({ ...value, units: Number(id) });
            setOpenDropdown(null);
          }}
          disabled={!track}
        />
      </View>

      {/* Sharing. Full width rather than a third of a row: the labels run to
          "Bed in 12-bed hall" and each option carries both a price and a bed
          count, which is two more things than a half-width field can hold.

          Dead until a stay type is chosen, for the same reason the length
          field is — the price on every row here depends on it. */}
      {sharingOptions?.length ? (
        <Dropdown
          label="Sharing"
          sheetTitle="Which sharing?"
          placeholder={track ? 'Select sharing type' : 'Pick stay type first'}
          options={sharingChoiceOptions}
          selectedId={value.sharingId}
          isOpen={openDropdown === 'sharing'}
          onToggle={() => setOpenDropdown(openDropdown === 'sharing' ? null : 'sharing')}
          onSelect={(id) => {
            onChange({ ...value, sharingId: id });
            setOpenDropdown(null);
          }}
          disabled={!track}
        />
      ) : null}

      {/* When. Last of the four questions, because it is the one that depends
          on nothing above it — a date is a date whether the stay is three
          nights or three months. */}
      <JoinDateField
        value={value.joinDate}
        onChange={(iso) => onChange({ ...value, joinDate: iso })}
        rent={activeRate ? unitPrice(activeRate, sharingChoices.find((o) => o.id === value.sharingId) ?? null) : 0}
        flexible={value.flexibleJoin}
        onFlexibleChange={(flexibleJoin) => onChange({ ...value, flexibleJoin })}
      />

      {/*
        Meals: stated, not chosen.

        This was a with/without pair. It is a fact about the building now — a
        student cannot opt out of a mess the owner runs, and offering the choice
        implied a discount for skipping it that no owner here actually gives.

        The absence is stated as plainly as the presence. A missing mess row
        reads as a missing feature of the app; "no mess, shared kitchen instead"
        is a fact about the place, and it is one people decide on.

        No price. Nothing on this screen adds a mess charge to anything, so a
        rupee figure sitting here would be a number the student has to work out
        the status of — included? extra? already counted? What the mess costs is
        the owner's to state when it is being arranged.
      */}
      {mess ? (
        <View style={{ gap: space[2] }}>
          <Text variant="caption" color="secondary">
            Meals
          </Text>
          <View
            style={[
              styles.messRow,
              {
                borderRadius: radius.card,
                paddingHorizontal: space[3],
                paddingVertical: space[2],
                gap: space[3],
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Icon
              name={mess.available ? 'mess' : 'close'}
              size={20}
              color={mess.available ? colors.brandInk : colors.textTertiary}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong" color={mess.available ? 'primary' : 'secondary'}>
                {mess.available ? 'Mess available' : 'No mess here'}
              </Text>
              <Text variant="caption" color="tertiary">
                {mess.available ? mess.summary : mess.unavailableNote}
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
   * Two halves of the gutter width, always.
   *
   * `flex: 1` on each child rather than a breakpoint: the pair splits whatever
   * room the screen gives it, so a 360dp phone gets narrower fields and a
   * 420dp one gets wider ones — the same layout, not a different one. Labels
   * inside truncate to one line, which is safe because the price sits on its
   * own line under them.
   */
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  headingRow: { flexDirection: 'row', alignItems: 'center' },
  headingChip: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  field: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chevronDown: { transform: [{ rotate: '90deg' }] },
  chevronUp: { transform: [{ rotate: '-90deg' }] },
  backdrop: { ...StyleSheet.absoluteFillObject },
  panel: { position: 'absolute', borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  inlinePanel: { overflow: 'hidden' },
  optionRow: { flexDirection: 'row', alignItems: 'center' },
  messRow: { flexDirection: 'row', alignItems: 'center' },
  /* The month name takes the middle and the two steppers hold their size, so
     "September" and "May" do not move the arrows. */
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  centred: { flex: 1, textAlign: 'center' },
});
