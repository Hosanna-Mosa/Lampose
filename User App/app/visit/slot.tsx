import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { Button, Text, TimeField, minutesOf, prettyTime } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { VisitCalendar } from '@/components/booking';
import { useTheme } from '@/context/ThemeContext';
import { setVisitSlot } from '@/services/api/stayRequests.api';
import { ongoingQueryKey } from '@/hooks/useOngoing';
import { ApiError } from '@/services/api/client';

/**
 * When the visit happens — the step the ₹199 just bought.
 *
 * ## Where this sits in the flow
 *
 * The owner accepted, the payment verified, and THEN this screen asks for a
 * day and a time. That order is the product: a slot picked before paying is
 * a guess about a viewing that may never be agreed to; picked after, it is a
 * commitment a Lampose representative plans their day around. The web
 * channel does exactly this inside WhatsApp — same nine days, same eight
 * times — so an app student and a WhatsApp customer are choosing from the
 * same shelf.
 *
 * ## What submitting releases
 *
 * Everything. The server records the slot, releases the address, and tells
 * the owner and the Lampose team in the same breath — so the booked screen
 * this navigates to can finally show a place rather than a promise. Until
 * this screen is submitted, nothing has been released and nobody has been
 * told to expect anyone.
 *
 * ## The calendar is the screen, and the time is the student's
 *
 * This asked its two questions with chips: nine day pills, then eight time
 * pills, with the real calendar hidden behind an "or pick another day" field
 * underneath. Both were our shelf rather than their answer. A student moving
 * in on the 14th had to notice a secondary control to reach it, and one who
 * wanted 4pm had to take 3:30 or 5:00.
 *
 * Neither shelf was ever a rule. `setVisitSlot` validates a DATE inside
 * `[today, MAX_DAYS_AHEAD]` and an HOUR inside `VISIT_HOURS` — it accepts any
 * `HH:MM` between them. The eight times are the WhatsApp flow's menu, because
 * a list message has to have rows; nothing required the app to copy them.
 *
 * So the month grid is open on the screen, bounded by the server's own window,
 * and the time comes from the OS clock clamped to the opening hours. The only
 * thing still ours is the window itself, which is a fact about when
 * representatives work.
 */

/**
 * How far ahead a visit may be booked.
 *
 * `MAX_DAYS_AHEAD` in `assistedSlot.controller.js`. Kept in step by hand —
 * the server refuses anything past it with `DATE_TOO_FAR`, so being wrong
 * here costs a rejected submit rather than a bad booking, but it should not
 * be wrong.
 */
const MAX_DAYS_AHEAD = 30;

/**
 * When a representative can be sent.
 *
 * `VISIT_HOURS` in `assistedSlot.controller.js`. The server refuses anything
 * outside with `TIME_OUT_OF_HOURS`, so being wrong here costs a rejected
 * submit rather than a bad booking — but it should not be wrong.
 */
const VISIT_HOURS = { from: 8, to: 20 };

/** Local date, not `toISOString()` — that hands back yesterday for most of an
    Indian evening. */
const isoDay = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function VisitSlot() {
  const { mode, colors, space, layout, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { requestId, id, stayType, units, sharingId, joinDate, flexibleJoin } =
    useLocalSearchParams<{
      requestId: string;
      id: string;
      stayType?: string;
      units?: string;
      sharingId?: string;
      joinDate?: string;
      flexibleJoin?: string;
    }>();

  /* The window's two ends, computed once — a screen left open across midnight
     keeps the bounds it showed rather than shifting under a thumb. The server
     refuses a date that has passed either way. */
  const windowStart = useMemo(() => isoDay(0), []);
  const windowEnd = useMemo(() => isoDay(MAX_DAYS_AHEAD), []);

  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /*
   * On today, the clock cannot go backwards.
   *
   * Offering 9 AM at 3 PM is a visit nobody can keep, and the server only
   * checks the opening hours — so the floor is the app's to hold. Null on
   * every other day, where the whole window is open.
   */
  const earliestToday = useMemo(() => {
    if (date !== windowStart) return null;
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }, [date, windowStart]);

  /* Nothing left today: the clock's floor has passed its ceiling. Said in
     words rather than by handing somebody a picker that snaps every choice
     back to 8 PM. */
  const todayIsDone = Boolean(earliestToday)
    && (minutesOf(earliestToday) ?? 0) > VISIT_HOURS.to * 60;

  const chosenDayLabel = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
      weekday: 'short', day: 'numeric', month: 'short',
    })
    : null;

  const confirm = async () => {
    if (!requestId || !date || !time) return;
    setError(null);
    setBusy(true);
    try {
      await setVisitSlot(String(requestId), { date, time });
      /* "Pick your visit slot" is now answered — drop the strip's row rather
         than leaving it to go stale. */
      queryClient.invalidateQueries({ queryKey: ongoingQueryKey });
      router.replace({
        pathname: '/booked/[id]',
        params: {
          id: String(id ?? ''),
          ...(stayType ? { stayType } : null),
          ...(units ? { units } : null),
          ...(sharingId ? { sharingId } : null),
          ...(joinDate ? { joinDate } : null),
          ...(flexibleJoin ? { flexibleJoin } : null),
        },
      } as never);
    } catch (caught) {
      const failure = caught as ApiError;
      setError(failure?.displayMessage
        ?? 'Could not save that slot. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      {/* No back arrow on purpose: the payment behind this is settled, and
          "back" from here has no honest meaning. The only way forward is a
          slot — or closing the app, which the reminder flow catches. */}
      <StandardHeader title="Schedule your visit" subtitle="A Lampose representative will meet you there" />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          paddingBottom: space[8],
          gap: space[5],
        }}
      >
        <Text variant="body" color="secondary">
          Your payment is confirmed. Pick a day and time for the visit — the full
          address arrives the moment your slot is fixed, and the owner and our
          representative are told at the same time.
        </Text>

        <View style={{ gap: space[3] }}>
          <Text variant="title3">Which day?</Text>
          {/* Open on the screen, not behind a field. On this screen the date
              IS the question — see the note on `VisitCalendar`. Its bounds are
              the server's own, so a day it lets somebody tap is a day the
              submit will take. */}
          <VisitCalendar
            value={date}
            onChange={(picked) => {
              setDate(picked);
              /* A time belongs to a day: 9 AM has gone on today and has not on
                 tomorrow, so carrying the choice across would send a slot
                 nobody can keep. */
              setTime(null);
            }}
            min={windowStart}
            max={windowEnd}
          />
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="title3">What time?</Text>
          {todayIsDone ? (
            <Text variant="body" color="secondary">
              Today is finished — pick tomorrow or later.
            </Text>
          ) : (
            <>
              {/* Any minute inside the working window, not one of eight we
                  picked. The server validates the hour range and nothing
                  finer. */}
              <TimeField
                value={time}
                onChange={setTime}
                placeholder={date ? 'Pick a time' : 'Pick a day first'}
                minHour={VISIT_HOURS.from}
                maxHour={VISIT_HOURS.to}
                minTime={earliestToday}
                disabled={!date}
                accessibilityLabel="Pick a visit time"
              />
              <Text variant="caption" color="tertiary">
                {date && earliestToday
                  ? `Visits today run until ${prettyTime(`${VISIT_HOURS.to}:00`)}.`
                  : `Visits are arranged between ${prettyTime(`0${VISIT_HOURS.from}:00`)} `
                    + `and ${prettyTime(`${VISIT_HOURS.to}:00`)}.`}
              </Text>
            </>
          )}
        </View>

        {error ? (
          <View style={{
            backgroundColor: colors.warning.tint,
            borderRadius: radius.card,
            padding: space[4],
          }}
          >
            <Text variant="caption" style={{ color: colors.warning.ink }}>{error}</Text>
          </View>
        ) : null}

        <View style={{ gap: space[2] }}>
          {/* The slot is on the button, always — a tap that commits a
              representative's afternoon should say which afternoon. */}
          <Button
            label={busy
              ? 'Confirming your visit...'
              : chosenDayLabel && time
                ? `Confirm · ${chosenDayLabel}, ${prettyTime(time)}`
                : 'Pick a day and time'}
            disabled={!date || !time || busy}
            onPress={confirm}
            fullWidth
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            Need a different time? Confirm the closest slot and tell the
            representative when they call — they will move it.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
});
