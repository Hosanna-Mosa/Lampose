import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { MessChoice, StayRate, StayTypeId } from '@/types/listing';

/**
 * "Are you looking for" — the PG and hostel replacement for sharing selection.
 *
 * Three decisions in one block: how long a stay, how many of them, and whether
 * meals are included. Together they produce the number the student is actually
 * shopping on, so they belong on one screen and above the money — not spread
 * across a flow where the price changes after each step.
 *
 * ## Chips rather than dropdowns
 *
 * The source design used HTML selects reading "--Stay Type--". Those are wrong
 * here for one reason: **a closed dropdown hides the prices.** Choosing between
 * daily, weekly and monthly is choosing between three rates, and a control that
 * makes you open it, read, close it and open it again to compare is a control
 * that gets guessed at instead. Every rate is on screen, next to its label.
 *
 * ## The three rates are separate prices, never one divided
 *
 * A place charging ₹450 a night is not charging ₹13,500 a month. Deriving one
 * from another would invent a number the owner never agreed to, so each rate
 * carries its own `pricePerUnit` and its own deposit.
 *
 * ## The total is not here — it is in the action bar
 *
 * This block asks the questions; the bar answers with the price. Putting a
 * total inside the block too would mean two money figures on one screen that
 * must always agree, which is the setup for them one day not agreeing.
 *
 * The bar is also where the number belongs: it is pinned in thumb reach, so the
 * figure stays visible while the student is still changing their mind about
 * days and meals. A total that scrolls away is a total they re-derive by
 * scrolling back.
 *
 * The deposit rides the bar with it — including a ₹0 deposit on short stays,
 * shown rather than hidden. Seeing "no deposit" is what tells a student a
 * two-night stay does not carry a two-month deposit; otherwise they assume it
 * does, and that assumption is why they do not book.
 */

/**
 * The unit as it appears inside a rate chip.
 *
 * A chip is roughly a third of the gutter width, and Martian Mono has a wide
 * advance — "₹8,500/month" is about 96dp against 97dp of room, so it wraps and
 * that one chip becomes three lines tall while its neighbours are two. The
 * price is what forces it, not the label.
 *
 * The long form is kept everywhere with room for it; only the chip abbreviates.
 */
const UNIT_SHORT: Record<string, string> = { day: 'day', week: 'wk', month: 'mo' };

export type StayIntent = {
  stayType: StayTypeId;
  /** In units of the chosen rate — 3 weeks, 2 months, 5 days. */
  units: number;
  withMess: boolean;
};

export type StayIntentSelectorProps = {
  rates: readonly StayRate[];
  mess?: MessChoice;
  value: StayIntent;
  onChange: (next: StayIntent) => void;
};

/** Days, base, mess and total — one place, so nothing computes it twice. */
export function stayTotals(
  rates: readonly StayRate[],
  mess: MessChoice | undefined,
  intent: StayIntent,
) {
  const rate = rates.find((item) => item.id === intent.stayType) ?? rates[0];
  const days = rate.daysPerUnit * intent.units;
  const base = rate.pricePerUnit * intent.units;
  const messTotal = intent.withMess && mess?.available ? mess.pricePerDay * days : 0;
  return { rate, days, base, messTotal, total: base + messTotal, deposit: rate.deposit };
}

export function StayIntentSelector({ rates, mess, value, onChange }: StayIntentSelectorProps) {
  const { colors, space, radius, touch } = useTheme();
  const { rate } = stayTotals(rates, mess, value);

  return (
    <View style={{ gap: space[4] }}>
      <Text variant="title2">Are you looking for</Text>

      {/* 1 — how long. Each option carries its rate, so the three are
          comparable without opening anything. */}
      <View style={{ gap: space[2] }}>
        <Text variant="caption" color="secondary">
          Stay type
        </Text>
        <View style={[styles.row, { gap: space[2] }]} accessibilityRole="radiogroup">
          {rates.map((option) => {
            const active = option.id === value.stayType;
            return (
              <Pressable
                key={option.id}
                onPress={() =>
                  // Units belong to a rate — 3 weeks is not 3 months. Switching
                  // rate resets to that rate's first sensible count rather than
                  // carrying a number that now means something else.
                  onChange({ ...value, stayType: option.id, units: option.unitOptions[0] })
                }
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${option.label}, ${formatRupees(option.pricePerUnit)} per ${option.unit}`}
                style={[
                  styles.rateChip,
                  {
                    minHeight: touch.min,
                    borderRadius: radius.button,
                    paddingHorizontal: space[3],
                    backgroundColor: active ? colors.brand : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                  },
                ]}
              >
                <Text variant="bodyStrong" style={active ? { color: colors.onBrand } : {}}>
                  {option.label}
                </Text>
                <Text
                  variant="numMeta"
                  style={{ color: active ? colors.onBrand : colors.textTertiary, opacity: active ? 0.82 : 1 }}
                >
                  {formatRupees(option.pricePerUnit)}/{UNIT_SHORT[option.unit] ?? option.unit}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 2 — how many. Fixed counts rather than a stepper: a stepper invites
          137 days, and an owner cannot honour that. */}
      <View style={{ gap: space[2] }}>
        <Text variant="caption" color="secondary">
          How many {rate.unit}s
        </Text>
        <View style={[styles.wrap, { gap: space[2] }]} accessibilityRole="radiogroup">
          {rate.unitOptions.map((count) => {
            const active = count === value.units;
            return (
              <Pressable
                key={count}
                onPress={() => onChange({ ...value, units: count })}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${count} ${rate.unit}${count === 1 ? '' : 's'}`}
                style={[
                  styles.countChip,
                  {
                    minHeight: touch.min,
                    minWidth: touch.min,
                    borderRadius: radius.button,
                    paddingHorizontal: space[3],
                    backgroundColor: active ? colors.brand : colors.surface,
                    borderColor: active ? colors.brand : colors.border,
                  },
                ]}
              >
                <Text variant="priceSm" style={active ? { color: colors.onBrand } : {}}>
                  {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* 3 — meals. A choice, not a property of the building: the students
          counting rupees are exactly the ones who opt out. */}
      {mess?.available ? (
        <View style={{ gap: space[2] }}>
          <Text variant="caption" color="secondary">
            Mess facility
          </Text>
          <View style={{ gap: space[2] }} accessibilityRole="radiogroup">
            {[true, false].map((withMess) => {
              const active = value.withMess === withMess;
              return (
                <Pressable
                  key={String(withMess)}
                  onPress={() => onChange({ ...value, withMess })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.messRow,
                    {
                      minHeight: touch.min,
                      borderRadius: radius.button,
                      paddingHorizontal: space[3],
                      gap: space[3],
                      backgroundColor: active ? colors.surfaceSunken : colors.surface,
                      borderColor: active ? colors.brand : colors.border,
                      borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{withMess ? 'With mess' : 'Without mess'}</Text>
                    <Text variant="caption" color="secondary">
                      {withMess ? mess.summary : 'You arrange your own food.'}
                    </Text>
                  </View>
                  {/* The summary flexes, the price holds its size — the same
                      rule as every other label-and-value row. This one was
                      missed in that pass, and it shows: the description ran
                      into "+₹150/day". */}
                  <Text
                    variant="priceSm"
                    color={withMess ? 'primary' : 'tertiary'}
                    style={styles.noShrink}
                  >
                    {withMess ? `+${formatRupees(mess.pricePerDay)}/day` : formatRupees(0)}
                  </Text>
                  {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : mess?.unavailableNote ? (
        <Text variant="caption" color="secondary">
          {mess.unavailableNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Wraps rather than squeezing "₹2,600/week" out of its chip.
  // `alignContent: stretch` alongside `alignItems` — with flexWrap on, the
  // line box is what sizes the chips, and without it a chip whose text wraps
  // grows taller than the ones beside it.
  row: { flexDirection: 'row', alignItems: 'stretch', alignContent: 'stretch', flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  rateChip: {
    flexGrow: 1,
    flexBasis: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: StyleSheet.hairlineWidth,
  },
  countChip: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  messRow: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  noShrink: { flexShrink: 0 },
});
