import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { cancellationPolicy, cancellationReasons } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useDepositMark } from '@/components/ui/DepositMark';

/**
 * Screen 56 — cancelling.
 *
 * **Policy before reason.** The cost of cancelling is on screen before the
 * student is asked anything. A reason picker shown first reads as a survey
 * standing between someone and their money, and it produces garbage data
 * besides — people pick whatever clears the screen fastest.
 *
 * So the order is: what you paid → what is kept and why → what comes back and
 * when → then, optionally, why you are leaving. The reason is genuinely
 * skippable; the confirm button never depends on it.
 *
 * The non-refundable fee is named on this screen rather than in the
 * confirmation, so nobody can say they were not told before they tapped.
 */
export default function CancelBooking() {
  const { colors, space, layout, mode, radius, touch } = useTheme();
  const depositMark = useDepositMark();
  const router = useRouter();

  const [reasonId, setReasonId] = useState<string | null>(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Cancel your booking"
        actionIcon="close"
        onAction={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
      >
        {/* The money, first and unprompted. */}
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
                  {line.detail}
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
                {cancellationPolicy.destination} · by {cancellationPolicy.arrivesByLabel}
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

        {/* Only now. And skippable. */}
        <View style={{ gap: space[3] }}>
          <View style={[styles.headRow, { gap: space[3] }]}>
            <Text variant="title3">Why are you leaving?</Text>
            <Text variant="caption" color="tertiary">
              optional
            </Text>
          </View>
          <Text variant="caption" color="secondary">
            It goes to us, not to the owner, and it does not change anything above.
          </Text>

          <View style={{ gap: space[2] }}>
            {cancellationReasons.map((reason) => {
              const active = reason.id === reasonId;
              return (
                <Pressable
                  key={reason.id}
                  onPress={() => setReasonId(active ? null : reason.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [
                    styles.reason,
                    {
                      minHeight: touch.min,
                      borderRadius: radius.button,
                      paddingHorizontal: space[4],
                      gap: space[3],
                      backgroundColor: active ? colors.surfaceSunken : colors.surface,
                      borderColor: active ? colors.brand : colors.border,
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                >
                  <Text variant="body" style={styles.flex}>
                    {reason.label}
                  </Text>
                  {active ? <Icon name="check" size={20} color={colors.brandInk} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <Button
            label="Cancel this booking"
            variant="destructive"
            fullWidth
            onPress={() => router.replace('/bookings/cancelled')}
          />
          <Text variant="caption" color="tertiary" style={styles.centred}>
            The bed goes back on the market straight away. You would have to request it again.
          </Text>
          <View style={{ marginTop: space[2] }}>
            <Button label="Keep my booking" variant="ghost" fullWidth onPress={() => router.back()} />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  lineRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1 },
  centred: { textAlign: 'center' },
});
