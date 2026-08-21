import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { DepositEstimate, NoticeDatePicker } from '@/components/lifecycle';
import { noticeTerms } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';

/**
 * Screen 52 — giving notice.
 *
 * **The rule comes before the choice.** The first thing on the screen is what
 * the student owes and by when, in a sentence naming the owner and real dates.
 * Only then are they asked to pick a day. A date picker shown first invites
 * someone to choose the soonest date and discover the penalty afterwards —
 * which is the same as not telling them.
 *
 * The costly option is not disabled. Leaving early is a legitimate choice; it
 * just may not be a silent one. See `NoticeDatePicker`.
 */
export default function GiveNotice() {
  const { colors, space, layout, mode, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Defaults to the first option that costs nothing, not the soonest date.
  const [selectedId, setSelectedId] = useState(
    noticeTerms.options.find((option) => option.penalty === 0)?.id ?? noticeTerms.options[0].id,
  );
  const selected = noticeTerms.options.find((option) => option.id === selectedId)!;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Moving out" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
      >
        {/* The rule first. */}
        <View
          style={{
            backgroundColor: colors.surfaceSunken,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[2],
          }}
        >
          <Text variant="title3">The rule first</Text>
          <Text variant="bodyLg" color="secondary">
            You owe {noticeTerms.ownerName} {noticeTerms.noticeDays} days’ notice. Give notice
            today, {noticeTerms.todayLabel}, and your last day can be{' '}
            {noticeTerms.earliestFreeLabel} or later. {noticeTerms.lockInNote}
          </Text>
        </View>

        <NoticeDatePicker
          options={noticeTerms.options}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <DepositEstimate
          depositPaid={noticeTerms.depositPaid}
          lines={
            // The penalty line is the one thing that moves with the choice.
            noticeTerms.lines.map((line) =>
              line.label === 'Early-exit penalty'
                ? selected.penalty > 0
                  ? {
                      ...line,
                      detail: `Leaving ${selected.daysAway} days from today, short of ${noticeTerms.noticeDays}`,
                      amount: -selected.penalty,
                    }
                  : line
                : line,
            )
          }
          settlementWindowLabel={`Within 14 days of ${selected.label}`}
        />

        <View style={{ gap: space[2] }}>
          <Button label={`Give notice for ${selected.fullLabel.replace(' 2026', '')}`} fullWidth />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            {noticeTerms.ownerName} is told immediately. {noticeTerms.changeableUntilLabel}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  centred: { textAlign: 'center' },
});
