import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { RefundChaseNote } from '@/components/lifecycle';
import { cancellationPolicy } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * Screen 57 — cancellation confirmed.
 *
 * No celebration disc, no green tick the size of a fist. Someone has just lost
 * a place to live; the screen's job is to be calm and complete, not congratulatory.
 *
 * What it must carry: confirmation that the owner has been told, the money
 * broken down again (the same figures as the previous screen — a number that
 * changes between the two destroys the whole flow), and a named date with
 * permission to chase.
 *
 * The forward action is "Find another place", not "Done". A cancelled booking
 * still leaves someone needing a room.
 */
export default function CancellationConfirmed() {
  const { colors, space, layout, mode, radius } = useTheme();
  const depositMark = useDepositMark();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <ScrollView
        contentContainerStyle={{
          padding: layout.gutter,
          gap: space[6],
          paddingTop: space[8],
          paddingBottom: space[8],
        }}
      >
        <View style={{ gap: space[3] }}>
          <View
            style={[
              styles.disc,
              { borderRadius: radius.pill, backgroundColor: colors.surfaceSunken },
            ]}
          >
            <Icon name="check" size={24} color={colors.textSecondary} />
          </View>
          <Text variant="display1">Booking cancelled</Text>
          <Text variant="bodyLg" color="secondary">
            LAM-4192 at Bhavana Girls PG is cancelled. Padma has been told and the bed is back on
            the market.
          </Text>
        </View>

        {/* The same figures as the screen before. They may never disagree. */}
        <View
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
            borderWidth: StyleSheet.hairlineWidth,
            borderRadius: radius.card,
            padding: space[4],
            gap: space[3],
          }}
        >
          <Text variant="title3">Your money</Text>
          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.borderSubtle }} />

          <View style={[styles.lineRow, { gap: space[4] }]}>
            <Text variant="body" style={styles.flex}>
              You paid
            </Text>
            <Text variant="priceSm">{formatRupees(cancellationPolicy.paid)}</Text>
          </View>

          {cancellationPolicy.lines.map((line) => (
            <View key={line.label} style={[styles.lineRow, { gap: space[4] }]}>
              <View style={styles.flex}>
                <Text variant="body">{line.label} kept</Text>
                <Text variant="numMeta" color="tertiary">
                  Non-refundable, as shown before you cancelled
                </Text>
              </View>
              <Text variant="priceSm" color="secondary">
                −{formatRupees(line.amount)}
              </Text>
            </View>
          ))}

          <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />

          <View style={[styles.lineRow, { gap: space[4] }]}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Coming back</Text>
              <Text variant="numMeta" color="tertiary">
                {cancellationPolicy.destination}
              </Text>
            </View>
            <Text
              variant="priceLg"
              style={depositMark}
            >
              {formatRupees(cancellationPolicy.returning)}
            </Text>
          </View>
        </View>

        <RefundChaseNote
          arrivesByLabel={cancellationPolicy.arrivesByLabel}
          timingNote={cancellationPolicy.timingNote}
          reference={cancellationPolicy.reference}
          startedLabel="today 14 Aug, 9:41 am"
        />

        <View style={{ gap: space[2] }}>
          {/* Forward-looking. Someone still needs a room. */}
          <Button label="Find another place" fullWidth onPress={() => router.replace('/home')} />
          <Button
            label="Track this refund"
            variant="secondary"
            fullWidth
            onPress={() => router.push('/bookings/refund')}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  flex: { flex: 1 },
});
