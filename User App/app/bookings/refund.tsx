import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { RefundStatusStepper } from '@/components/booking';
import { RefundChaseNote } from '@/components/lifecycle';
import { refundInProgress } from '@/data/bookings';
import { useTheme } from '@/context/ThemeContext';
import type { RefundStageId, RefundState } from '@/types/booking';
import { usePreviewControls } from '@/hooks/useAppEnv';

/**
 * Screen 58 — tracking the deposit.
 *
 * The stepper carries the deductions and their evidence; this screen adds the
 * thing a stepper cannot: a date, and permission to chase us past it. Between
 * "Room checked" and "Sent" there can be a week of silence, and a week of
 * silence about ₹17,000 is where trust in a rental product actually dies.
 *
 * The failure state is deliberately not an error screen. A bounced transfer is
 * a normal banking outcome, not the student's mistake — so it stays on this
 * screen, keeps the money visible, and offers the two real fixes.
 */
export default function DepositRefund() {
  const previewControls = usePreviewControls();
  const { colors, space, layout, mode } = useTheme();
  const router = useRouter();

  /** Dev-only, so the four stages and the bounce are all reachable. */
  const [stage, setStage] = useState<RefundStageId>(refundInProgress.stage);
  const [failed, setFailed] = useState(false);

  const refund: RefundState = { ...refundInProgress, stage, failed };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Your deposit"
        subtitle="LAM-4192 · Sai Krishna Boys PG"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: layout.gutter, gap: space[6], paddingBottom: space[8] }}
      >
        <RefundStatusStepper refund={refund} />

        <RefundChaseNote
          arrivesByLabel={refundInProgress.expectedBy ?? '19 September'}
          timingNote="3–5 working days once it leaves our payments partner — the bank’s timing, not ours."
          reference="RFD-4192-A"
        />

        {failed ? (
          <Button label="Use a different UPI ID" fullWidth />
        ) : (
          <Button label="Get help with this refund" variant="secondary" fullWidth />
        )}

        {previewControls ? (
          <View style={{ gap: space[2], paddingTop: space[4] }}>
            <Text variant="numMeta" color="tertiary">
              stage — preview only · the server owns this
            </Text>
            {(['requested', 'inspected', 'processing', 'sent'] as const).map((id) => (
              <Button
                key={id}
                label={id}
                size="sm"
                variant={stage === id ? 'primary' : 'secondary'}
                onPress={() => setStage(id)}
              />
            ))}
            <Button
              label={failed ? 'transfer bounced ✓' : 'transfer bounced'}
              size="sm"
              variant={failed ? 'primary' : 'secondary'}
              onPress={() => {
                setStage('sent');
                setFailed((value) => !value);
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
