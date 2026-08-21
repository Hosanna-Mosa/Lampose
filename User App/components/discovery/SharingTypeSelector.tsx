import React from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionCard, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { SharingOption } from '@/types/listing';

/**
 * What gets pre-selected when a listing opens.
 *
 * The order is: the only option, then the median one, then simply the first
 * one that has a bed.
 *
 * ## The rule this replaced, and what it cost
 *
 * This used to pre-select ONLY the median option, and leave the listing with
 * nothing chosen otherwise — on the reasoning that a sharing type the student
 * did not pick is a price they did not agree to, and that price travels on the
 * request the owner receives.
 *
 * That reasoning is still right, and it is why the third case below is a
 * FIRST-AVAILABLE rather than a cheapest or a best. What it got wrong is how
 * often it fired: `median` is set by the panel and most listings from the live
 * API do not carry it, so the common outcome was a detail screen with two
 * priced options, neither selected, and a greyed-out "Send confirmation" with
 * nothing on screen explaining what was missing. A student who has scrolled
 * past the price twice reads that button as broken, not as a question.
 *
 * The safeguard that actually does the work is elsewhere and is unchanged: the
 * chosen option is shown, priced per person, directly above the button, and it
 * is re-derived server-side when the request is sent. Nothing is committed by
 * opening a page — the tap on "Send confirmation" is still the agreement, and
 * it is still one tap away from a visible price.
 */
export function defaultSharingSelection(options: readonly SharingOption[]): string | null {
  /*
   * One option is not a choice, so it is simply the answer.
   *
   * The control below already renders a single option as a read-only fact
   * rather than a selector — there is nothing to tap. Leaving it unselected
   * meant the CTA stayed disabled forever on every listing that offers one
   * room type, with no visible reason: the student had ticked consent, the
   * bed was on screen, and the button was grey.
   *
   * This is not the pre-selection the rule below guards against. That one is
   * about picking a price on somebody's behalf when alternatives exist; here
   * there is no alternative to pick instead.
   */
  if (options.length === 1) return options[0].id;

  /* An unknown bed count does not disqualify the median choice — only a
     known zero does. Reading `undefined > 0` as false would have meant no
     listing from the live API ever pre-selects anything, because none of
     them carry occupancy at all. */
  const available = (option: SharingOption) => option.bedsLeft !== 0;

  const median = options.find((option) => option.median && available(option));
  if (median) return median.id;

  /*
   * Whatever this listing actually offers first.
   *
   * Deliberately the first in the panel's own order rather than the cheapest:
   * the order is how the owner described their property, and re-sorting it to
   * put the cheapest bed under the student's thumb would be us making a
   * recommendation while looking like we are just showing a list.
   *
   * Sold-out options are skipped — pre-selecting one would arm the CTA for a
   * bed that does not exist, which is worse than selecting nothing. If every
   * option is full, nothing is selected and the button stays down, which is
   * the honest answer.
   */
  return options.find(available)?.id ?? null;
}

/**
 * What an option with no recorded price says instead of a number.
 *
 * Not "₹0" and not a blank. The panel prices sharing options separately from
 * the listing and frequently leaves them empty, and this control's whole job
 * is a price comparison — so an option it cannot price has to say which of
 * the two it is, rather than looking like a free bed or a failed render.
 */
const PRICE_UNKNOWN = 'Price on request';

/** What a screen reader says for the price. Never reads out a missing one. */
function priceSpoken(option: SharingOption): string {
  return option.pricePerPerson === undefined
    ? PRICE_UNKNOWN
    : `${formatRupees(option.pricePerPerson)} per person per month`;
}

/** "3 beds free", or nothing at all when occupancy was never recorded. */
function bedsLine(option: SharingOption): string | null {
  if (option.bedsLeft === undefined) return null;
  if (option.bedsLeft === 0) return 'none free';
  return `${option.bedsLeft} ${option.bedsLeft === 1 ? 'bed' : 'beds'} free`;
}

export type SharingTypeSelectorProps = {
  options: readonly SharingOption[];
  value: string | null;
  onChange: (id: string) => void;
  /** Shown under the rows: the note that explains the deposit or the unit. */
  note?: string;
};

/**
 * Choosing how many people share the room.
 *
 * Every price here is per person, per month. The single biggest source of
 * confusion in this market is a room price quoted where a bed price is
 * expected, so the column header says it out loud and every row repeats the
 * unit rather than trusting the header to be remembered.
 *
 * A dormitory has one option and no choice to make, so the selector collapses
 * to a static line instead of offering a radio group with one button in it.
 */
export function SharingTypeSelector({ options, value, onChange, note }: SharingTypeSelectorProps) {
  const { colors, space, radius } = useTheme();

  if (options.length === 0) return null;

  // One option is not a choice. Rendering it as one would imply an alternative
  // that does not exist.
  if (options.length === 1) {
    const only = options[0];
    return (
      <View style={{ gap: space[2] }}>
        <Text variant="title3">Your bed</Text>
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderRadius: radius.chip,
            padding: space[3],
            gap: space[1],
          }}
        >
          <Text variant="bodyStrong">{only.label}</Text>
          <Text variant="numMeta" color="secondary">
            {only.pricePerPerson === undefined
              ? PRICE_UNKNOWN
              : `${formatRupees(only.pricePerPerson)} per person, per month`}
            {bedsLine(only) ? ` · ${bedsLine(only)}` : ''}
          </Text>
        </View>
        {note ? (
          <Text variant="caption" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
    );
  }

  const reference =
    options.find((option) => option.id === value) ??
    options.find((option) => option.median) ??
    options[0];

  return (
    <View style={{ gap: space[2] }}>
      <View style={styles.headRow}>
        <Text variant="title3">Choose your sharing</Text>
        {/* Said out loud, once, above the column it governs. */}
        <Text variant="label" color="tertiary">
          price per person
        </Text>
      </View>

      {/* A gap, not a divider. These are separate objects now — see the note
          on `SharingRow`. */}
      <View accessibilityRole="radiogroup" accessibilityLabel="Sharing type" style={{ gap: space[2] }}>
        {options.map((option) => (
          <SharingRow
            key={option.id}
            option={option}
            selected={option.id === value}
            /* Only comparable when both sides carry a price. Treating an
               unpriced option as zero produced a "−₹14,500 cheaper" line
               against a bed whose price nobody has told us. */
            delta={
              option.pricePerPerson !== undefined && reference.pricePerPerson !== undefined
                ? option.pricePerPerson - reference.pricePerPerson
                : null
            }
            onSelect={() => onChange(option.id)}
          />
        ))}
      </View>

      {note ? (
        <Text variant="caption" color="secondary">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * One sharing option, as a card rather than a row in a divided list.
 *
 * Changed with the Dock repaint. The old treatment was hairline-separated rows
 * with a radio ring down the left, and the selected one differed from its
 * neighbours by a filled dot and a bolder label — about two millimetres of
 * difference in a stack of four near-identical lines of text and money.
 *
 * `OptionCard` gives the reference's treatment: the chosen sharing is a tinted,
 * accent-edged card and the others are plain white ones, so which bed you are
 * about to request for how much is legible from across the room. That matters
 * more here than anywhere else in the app, because this control is the one that
 * sets the number in the action bar.
 *
 * The sold-out option stays in the list and takes the `unavailable` treatment.
 * It is not a choice, but it is the reason the option above it costs what it
 * does, and removing it makes the remaining prices look arbitrary.
 */
/**
 * One sharing option, as a card rather than a row in a divided list.
 *
 * Changed with the Dock repaint. The old treatment was hairline-separated rows
 * with a radio ring down the left, and the selected one differed from its
 * neighbours by a filled dot and a bolder label — about two millimetres of
 * difference in a stack of four near-identical lines of text and money.
 *
 * `OptionCard` gives the reference's treatment: the chosen sharing is a tinted,
 * accent-edged card and the others are plain white ones, so which bed you are
 * about to request for how much is legible from across the room. That matters
 * more here than anywhere else in the app, because this control is the one that
 * sets the number in the action bar.
 *
 * The sold-out option stays in the list and takes the `unavailable` treatment.
 * It is not a choice, but it is the reason the option above it costs what it
 * does, and removing it makes the remaining prices look arbitrary.
 */
function SharingRow({
  option,
  selected,
  delta,
  onSelect,
}: {
  option: SharingOption;
  selected: boolean;
  /** `null` when either side of the comparison has no price. */
  delta: number | null;
  onSelect: () => void;
}) {
  const { colors } = useTheme();
  /* Strictly zero. `undefined` is "never recorded", and treating that as sold
     out would grey out every row of every listing the live API returns. */
  const soldOut = option.bedsLeft === 0;
  const beds = bedsLine(option);

  /* The sub-line disappears when there is neither a bed count nor a deposit to
     state. An empty line under every card is worse than a tighter one: it reads
     as a value that failed to load. */
  const facts = [beds, option.depositMonths ? `${option.depositMonths} mo deposit` : null]
    .filter(Boolean)
    .join(' · ');
  /* "full" is said in words as well as being drawn in the muted treatment —
     the standing rule that a state is never carried by colour alone. */
  const description = soldOut ? [facts, 'full'].filter(Boolean).join(' · ') : facts || undefined;

  return (
    <OptionCard
      label={option.label}
      description={description}
      selected={selected}
      unavailable={soldOut}
      onSelect={onSelect}
      accessibilityLabel={
        soldOut
          ? `${option.label}, none free, ${priceSpoken(option)}`
          : `${option.label}, ${priceSpoken(option)}${beds ? `, ${beds}` : ''}`
      }
      trailing={
        option.pricePerPerson === undefined ? (
          /* Smaller and quieter than a price, because it is not one. Reusing
             the price type here would make an unpriced card the loudest thing
             in the column. */
          <Text variant="numMeta" color="tertiary">
            {PRICE_UNKNOWN}
          </Text>
        ) : (
          <>
            <Text variant="priceSm" color={soldOut ? 'tertiary' : 'primary'}>
              {formatRupees(option.pricePerPerson)}
            </Text>
            {/* The unit is repeated on every card. The header is not enough — a
                user scrolling a list reads one row, not the column head. */}
            <Text variant="numMeta" color="tertiary">
              per person / mo
            </Text>
            {/* The decision is comparative, so a cheaper option says how much
                cheaper rather than leaving the reader to subtract. */}
            {!soldOut && delta !== null && delta < 0 ? (
              <Text variant="numMeta" style={{ color: colors.success.ink }}>
                −{formatRupees(Math.abs(delta))}
              </Text>
            ) : null}
          </>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
});
