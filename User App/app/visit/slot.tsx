import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { useTheme } from '@/context/ThemeContext';
import { setVisitSlot } from '@/services/api/stayRequests.api';
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
 * The choices mirror the backend's slot rules (assistedSlot.controller.js):
 * nine days starting today, eight times between 9:00 and 20:00. The server
 * re-validates both — this screen offering only valid choices is a courtesy,
 * not the gate.
 */

/** The same eight times the WhatsApp list offers, as the backend stores them. */
const TIMES: readonly { value: string; label: string }[] = [
  { value: '09:00', label: '9:00 AM' },
  { value: '10:30', label: '10:30 AM' },
  { value: '12:00', label: '12:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:30', label: '3:30 PM' },
  { value: '17:00', label: '5:00 PM' },
  { value: '18:30', label: '6:30 PM' },
  { value: '20:00', label: '8:00 PM' },
];

/** Local date, not `toISOString()` — that hands back yesterday for most of an
    Indian evening. */
const isoDay = (offsetDays: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const dayOption = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    value: isoDay(offsetDays),
    label,
    tag: offsetDays === 0 ? 'Today' : offsetDays === 1 ? 'Tomorrow' : null,
  };
};

export default function VisitSlot() {
  const { colors, space, layout, radius, touch } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

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

  /* Nine days, computed once — a screen left open across midnight keeps the
     list it showed rather than reshuffling under a thumb. The server refuses
     a date that has passed either way. */
  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => dayOption(i)), []);

  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Today's times that have already gone. Offering 9 AM at 3 PM is a visit
     nobody can keep — the server only checks the opening hours. */
  const times = useMemo(() => {
    if (date !== days[0].value) return TIMES;
    const now = new Date();
    const cutoff = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return TIMES.filter((t) => t.value > cutoff);
  }, [date, days]);

  const chosenDay = days.find((d) => d.value === date);
  const chosenTime = TIMES.find((t) => t.value === time);

  const confirm = async () => {
    if (!requestId || !date || !time) return;
    setError(null);
    setBusy(true);
    try {
      await setVisitSlot(String(requestId), { date, time });
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

  const chip = (selected: boolean) => ({
    minHeight: touch.min,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: selected ? colors.brand : colors.border,
    backgroundColor: selected ? colors.brand : colors.surface,
    justifyContent: 'center' as const,
  });

  return (
    <View style={[styles.flex, { backgroundColor: colors.bg, paddingBottom: insets.bottom }]}>
      <StatusBar style="auto" />
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
          <View style={[styles.wrap, { gap: space[2] }]}>
            {days.map((d) => {
              const selected = date === d.value;
              return (
                <Pressable
                  key={d.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => { setDate(d.value); setTime(null); }}
                  style={chip(selected)}
                >
                  <Text
                    variant="bodyStrong"
                    style={{ color: selected ? colors.onBrand : colors.textPrimary }}
                  >
                    {d.tag ? `${d.tag} · ${d.label}` : d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space[3] }}>
          <Text variant="title3">What time?</Text>
          {date && !times.length ? (
            <Text variant="body" color="secondary">
              No slots left today — pick tomorrow or later.
            </Text>
          ) : (
            <View style={[styles.wrap, { gap: space[2] }]}>
              {times.map((t) => {
                const selected = time === t.value;
                return (
                  <Pressable
                    key={t.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !date }}
                    disabled={!date}
                    onPress={() => setTime(t.value)}
                    style={[chip(selected), !date && styles.dim]}
                  >
                    <Text
                      variant="bodyStrong"
                      style={{ color: selected ? colors.onBrand : colors.textPrimary }}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {!date ? (
            <Text variant="caption" color="tertiary">Pick a day first.</Text>
          ) : null}
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
              : chosenDay && chosenTime
                ? `Confirm · ${chosenDay.label}, ${chosenTime.label}`
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  dim: { opacity: 0.4 },
  centred: { textAlign: 'center' },
});
