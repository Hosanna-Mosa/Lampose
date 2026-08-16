import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button, Icon, Text } from '@/components/ui';
import { usePressAnimation } from '@/hooks/usePressAnimation';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import type { Visit, VisitDay, VisitSlot } from '@/types/booking';
import { actions } from '@/constants/actions';

/* ------------------------------------------------------------------ *
 * VisitScheduler
 * ------------------------------------------------------------------ */

export type VisitSchedulerProps = {
  days: readonly VisitDay[];
  dayId: string;
  onSelectDay: (dayId: string) => void;
  slotId: string | null;
  onSelectSlot: (slotId: string) => void;
  onConfirm: () => void;
};

/**
 * Picking a day and a twenty-minute slot.
 *
 * Full slots stay visible and greyed with the reason — "2 visits booked" —
 * because an empty grid with no explanation reads as a broken app rather than
 * a busy owner. Past slots on today dim rather than disappear, so the day
 * keeps its shape and the user can see how much of it has gone.
 */
export function VisitScheduler({
  days,
  dayId,
  onSelectDay,
  slotId,
  onSelectSlot,
  onConfirm,
}: VisitSchedulerProps) {
  const { space, layout } = useTheme();

  const day = days.find((candidate) => candidate.id === dayId) ?? days[0];
  const slot = day?.slots.find((candidate) => candidate.id === slotId);

  return (
    <View style={{ gap: space[4] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="title3">When can you visit?</Text>
        <Text variant="caption" color="secondary">
          Owner shows the room between 10 am and 7 pm. It takes about 20 minutes.
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: space[2], paddingRight: layout.gutter }}
      >
        {days.map((candidate) => (
          <DayTile
            key={candidate.id}
            day={candidate}
            selected={candidate.id === dayId}
            onPress={() => onSelectDay(candidate.id)}
          />
        ))}
      </ScrollView>

      <View style={[styles.slotGrid, { gap: space[2] }]}>
        {day?.slots.map((candidate) => (
          <SlotTile
            key={candidate.id}
            slot={candidate}
            selected={candidate.id === slotId}
            onPress={() => onSelectSlot(candidate.id)}
          />
        ))}
      </View>

      <View style={{ gap: space[2] }}>
        <Button
          label={slot ? `Request ${day.weekday} ${day.date} ${day.month}, ${slot.label}` : 'Pick a time'}
          onPress={onConfirm}
          disabled={!slot}
          fullWidth
        />
        <Text variant="caption" color="secondary">
          Free. You can cancel until 2 hours before.
        </Text>
      </View>
    </View>
  );
}

function DayTile({ day, selected, onPress }: { day: VisitDay; selected: boolean; onPress: () => void }) {
  const { colors, space, radius, touch } = useTheme();
  const { animatedStyle, onPressIn, onPressOut } = usePressAnimation('chip');

  const free = day.slots.filter((slot) => !slot.full && !slot.past).length;
  const disabled = day.unavailable || free === 0;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={`${day.weekday} ${day.date} ${day.month}, ${
        disabled ? 'no slots' : `${free} slots free`
      }`}
    >
      <Animated.View
        style={[
          styles.dayTile,
          animatedStyle,
          {
            minWidth: 60,
            minHeight: touch.min + 20,
            borderRadius: radius.chip,
            paddingHorizontal: space[2],
            paddingVertical: space[2],
            backgroundColor: selected ? colors.textPrimary : colors.surface,
            borderColor: selected ? colors.textPrimary : colors.border,
            borderWidth: 1,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <Text variant="numMeta" style={{ color: selected ? colors.bg : colors.textSecondary }}>
          {day.weekday}
        </Text>
        <Text variant="priceSm" style={{ color: selected ? colors.bg : colors.textPrimary }}>
          {day.date}
        </Text>
        <Text variant="numMeta" style={{ color: selected ? colors.bg : colors.textTertiary }}>
          {disabled ? 'none' : `${free} free`}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function SlotTile({ slot, selected, onPress }: { slot: VisitSlot; selected: boolean; onPress: () => void }) {
  const { colors, space, radius, touch } = useTheme();
  const unavailable = slot.full || slot.past;

  return (
    <Pressable
      onPress={unavailable ? undefined : onPress}
      disabled={unavailable}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: unavailable }}
      accessibilityLabel={
        slot.full
          ? `${slot.label}, unavailable, ${slot.fullReason ?? 'already booked'}`
          : slot.past
            ? `${slot.label}, already passed`
            : slot.label
      }
      style={[
        styles.slotTile,
        {
          minHeight: touch.min,
          borderRadius: radius.chip,
          paddingHorizontal: space[3],
          paddingVertical: space[2],
          backgroundColor: selected ? colors.brandTint : unavailable ? colors.surfaceSunken : colors.surface,
          borderColor: selected ? colors.brand : colors.border,
          borderWidth: selected ? 1.5 : 1,
          opacity: slot.past ? 0.5 : 1,
        },
      ]}
    >
      <Text
        variant={selected ? 'bodyStrong' : 'bodyLg'}
        color={unavailable ? 'tertiary' : selected ? 'info' : 'primary'}
      >
        {slot.label}
      </Text>
      {/* The reason is the point. "Unavailable" alone reads as a bug. */}
      {slot.full && slot.fullReason ? (
        <Text variant="numMeta" color="tertiary">
          {slot.fullReason}
        </Text>
      ) : null}
      {slot.past ? (
        <Text variant="numMeta" color="tertiary">
          passed
        </Text>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * VisitStatusCard
 * ------------------------------------------------------------------ */

export type VisitStatusCardProps = {
  visit: Visit;
  onCancel?: () => void;
  onDirections?: () => void;
  onCallOwner?: () => void;
  onRequestBed?: () => void;
  onNotForMe?: () => void;
  onPickNewSlot?: () => void;
};

/**
 * The four states a visit can be in.
 *
 * "Missed" carries no penalty language and no blame — the student may have
 * been stuck on a bus for two hours. And the completed card exists mainly to
 * restate the price quoted on the day, because a rent that moved between the
 * visit and the booking is the most common trust complaint in this category.
 */
export function VisitStatusCard({
  visit,
  onCancel,
  onDirections,
  onCallOwner,
  onRequestBed,
  onNotForMe,
  onPickNewSlot,
}: VisitStatusCardProps) {
  const { colors, space, radius } = useTheme();

  const set =
    visit.state === 'confirmed'
      ? { tint: colors.success.tint, ink: colors.success.ink, border: colors.success.border, glyph: 'check' as const }
      : visit.state === 'requested'
        ? { tint: colors.warning.tint, ink: colors.warning.ink, border: colors.warning.border, glyph: 'clock' as const }
        : visit.state === 'completed'
          ? { tint: colors.surfaceSunken, ink: colors.textSecondary, border: colors.border, glyph: 'completed' as const }
          : { tint: colors.surfaceSunken, ink: colors.textSecondary, border: colors.border, glyph: 'expired' as const };

  const headline =
    visit.state === 'requested'
      ? 'Visit requested'
      : visit.state === 'confirmed'
        ? 'Visit confirmed'
        : visit.state === 'completed'
          ? 'Visit completed'
          : 'This visit didn’t happen';

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        overflow: 'hidden',
      }}
    >
      <View
        style={[
          styles.row,
          { backgroundColor: set.tint, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] },
        ]}
      >
        <Icon name={set.glyph} size={20} color={set.ink} />
        <Text variant="bodyStrong" style={{ color: set.ink, flex: 1 }}>
          {headline}
        </Text>
        <Text variant="numMeta" style={{ color: set.ink }}>
          {visit.agoLabel}
        </Text>
      </View>

      <View style={{ padding: space[4], gap: space[3] }}>
        <View style={{ gap: 2 }}>
          <Text variant="title3">{visit.whenLabel}</Text>
          <Text variant="caption" color="secondary">
            {visit.propertyName}
          </Text>
        </View>

        {visit.state === 'requested' ? (
          <Text variant="body" color="secondary">
            Waiting for the owner to confirm this slot. If they can&apos;t, they&apos;ll offer another time and
            you can accept or pick again.
          </Text>
        ) : null}

        {visit.state === 'confirmed' ? (
          <View style={{ gap: space[2] }}>
            <Field label="Ask for" value={`${visit.ownerName ?? 'the owner'} (owner)`} />
            {visit.landmark ? <Field label="Landmark" value={visit.landmark} /> : null}
            <Field label="Take with you" value={visit.bring ?? 'Any photo ID'} />
          </View>
        ) : null}

        {visit.state === 'completed' ? (
          <View style={{ gap: space[2] }}>
            <Text variant="body" color="secondary">
              You saw this place {visit.daysAgo ?? 0} days ago.
            </Text>
            {/* The reason this card exists. */}
            {visit.quotedRent !== undefined ? (
              <View
                style={{
                  backgroundColor: colors.surfaceSunken,
                  borderRadius: radius.chip,
                  padding: space[3],
                }}
              >
                <Text variant="caption" color="secondary">
                  It was {formatRupees(visit.quotedRent)}
                  {visit.quotedDeposit !== undefined
                    ? ` with a ${formatRupees(visit.quotedDeposit)} deposit`
                    : ''}{' '}
                  when you visited.{' '}
                  {visit.priceUnchanged
                    ? 'The price is still the same today.'
                    : 'The price has changed since — check it before you request.'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {visit.state === 'missed' ? (
          <Text variant="body" color="secondary">
            Nothing is charged and it doesn&apos;t affect anything. Owners keep showing the room, so pick
            another slot whenever you&apos;re ready.
          </Text>
        ) : null}

        <View style={[styles.actions, { gap: space[2] }]}>
          {visit.state === 'requested' && onCancel ? (
            <Button label="Cancel request" variant="ghost" size="sm" onPress={onCancel} />
          ) : null}
          {visit.state === 'confirmed' ? (
            <>
              {onDirections ? <Button label="Directions" variant="secondary" size="sm" onPress={onDirections} /> : null}
              {onCallOwner ? <Button label="Call owner" variant="ghost" size="sm" onPress={onCallOwner} /> : null}
            </>
          ) : null}
          {visit.state === 'completed' ? (
            <>
              {onRequestBed ? <Button label={actions.requestBed} size="sm" onPress={onRequestBed} /> : null}
              {onNotForMe ? <Button label="Not for me" variant="ghost" size="sm" onPress={onNotForMe} /> : null}
            </>
          ) : null}
          {visit.state === 'missed' && onPickNewSlot ? (
            <Button label="Pick a new slot" variant="secondary" size="sm" onPress={onPickNewSlot} />
          ) : null}
        </View>
      </View>
    </View>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const { space } = useTheme();
  return (
    <View style={[styles.fieldRow, { gap: space[4] }]}>
      <Text variant="caption" color="secondary" style={styles.fieldLabel}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={styles.flex}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
  dayTile: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  slotTile: { alignItems: 'center', justifyContent: 'center', minWidth: 96 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  fieldRow: { flexDirection: 'row', alignItems: 'flex-start' },
  // Was a hard 104. A fixed column does not grow with scaled text, so the
  // label wrapped inside a box that stayed put. A floor plus flex lets it.
  fieldLabel: { minWidth: 88, flexShrink: 0 },
});
