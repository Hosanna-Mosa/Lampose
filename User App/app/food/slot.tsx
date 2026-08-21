import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { FoodEmptyState, FoodNotice, FulfilmentToggle, RoomTargetRow, SlotPicker } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { findKitchen } from '@/data/food';
import { clockLabel, findWindow, focusWindow, minuteOfDay, readyLabel } from '@/types/food';
import { formatRupees } from '@/utils/money';

/**
 * How you get it, and when.
 *
 * Both questions on one screen because they answer each other: pickup at 1:45
 * and delivery at 1:45 are not the same commitment, and choosing a slot before
 * choosing a mode makes the slot mean nothing. Switching the mode therefore
 * clears the slot rather than carrying a time that has quietly changed meaning.
 */
export default function SlotScreen() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { kitchenId, window, fulfilment, setFulfilment, slot, setSlot, address, toPay, count, deliveryFee } = useFood();

  const [now] = useState(() => new Date());

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;
  const windowId = window ?? focusWindow(now).id;
  const activeWindow = findWindow(windowId);

  if (!kitchen || count === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Slot and mode" onBack={() => router.back()} />
        <FoodEmptyState
          title="There is nothing to schedule"
          body="Your cart emptied while you were here. Pick a dish and this screen comes back."
          primaryLabel="Back to food"
          onPrimary={() => router.back()}
        />
      </View>
    );
  }

  const gateClosed = minuteOfDay(now) >= 23 * 60 + 30 || minuteOfDay(now) < 5 * 60;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Slot and mode"
        subtitle={`${kitchen.name} · ${activeWindow.label}`}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
      >
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            How you get it
          </Text>
          <FulfilmentToggle
            value={fulfilment}
            onChange={setFulfilment}
            kitchen={kitchen}
            readyAt={readyLabel(now, kitchen.prepMinutes)}
            arrivesAt={readyLabel(now, kitchen.deliveryMinutes)}
            deliveryFee={deliveryFee || kitchen.deliveryFee}
            deliveryDisabled={gateClosed}
            deliveryDisabledNote={gateClosed ? 'The gate is shut — after 11:30 pm it is pickup at the gate only.' : undefined}
          />
        </View>

        {fulfilment === 'delivery' ? (
          <RoomTargetRow address={address} onPress={() => {}} />
        ) : (
          <View
            style={[
              styles.counter,
              { backgroundColor: colors.brandTint, borderColor: colors.success.border, borderRadius: 16, padding: space[3], gap: space[1] },
            ]}
          >
            <Text variant="title3" style={{ color: colors.brandInk }}>
              {kitchen.name} counter · {kitchen.landmark}
            </Text>
            <Text variant="caption" style={{ color: colors.brandInk }}>
              Show the pickup code at the counter. It is held for 20 minutes after it is ready.
            </Text>
          </View>
        )}

        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            When do you want it
          </Text>
          <Text variant="caption" color="tertiary">
            Kitchens cook to the window, so slots stop at {clockLabel(activeWindow.endMinute)}.
          </Text>
          <SlotPicker
            window={activeWindow}
            now={now}
            value={slot}
            onChange={setSlot}
            asapLabel={`about ${readyLabel(now, fulfilment === 'pickup' ? kitchen.prepMinutes : kitchen.deliveryMinutes)}`}
          />
        </View>

        {slot ? (
          <FoodNotice
            tone="info"
            title={`Scheduled for ${slot}`}
            body="The kitchen starts cooking to hit that time, not when you pay. You can change it until they plate it."
          />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6],
          },
        ]}
      >
        <Button
          label={`Choose payment · ${formatRupees(toPay)}`}
          fullWidth
          onPress={() => router.push(foodHref.payment)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: { borderWidth: StyleSheet.hairlineWidth },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
});
