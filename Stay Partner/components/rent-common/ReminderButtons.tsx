import { useState } from 'react';

import { Box, Chip, Text, useAlert } from '@/components/common';
import { useLogReminder } from '@/services/hooks/useRent';
import type { ReminderChannel, RentMonthStatus } from '@/services/api/rent.api';
import { styles } from './styles';
import { CHANNEL_LABEL, openReminder, reminderMessage } from './utils';

const CHANNELS: ReminderChannel[] = ['whatsapp', 'sms', 'call'];

/**
 * WhatsApp · SMS · Call, with the message already written.
 *
 * The owner sends it from their own phone — Lampose texts nobody about rent.
 * The reminder is logged only once the app actually opened, so "reminded 2h
 * ago" on the follow-up list is something that happened.
 */
export function ReminderButtons({
  residentId, guestName, guestPhone, propertyName, amount, status, period, dueDate,
}: {
  residentId: string;
  guestName: string;
  guestPhone: string;
  propertyName: string;
  amount: number;
  status: RentMonthStatus | 'none';
  period?: string;
  dueDate?: string;
}) {
  const { run } = useLogReminder();
  const { alert } = useAlert();
  const [sent, setSent] = useState<ReminderChannel | null>(null);

  const send = async (channel: ReminderChannel) => {
    const message = reminderMessage({ guestName, propertyName, amount, status, period, dueDate });
    const opened = await openReminder(channel, guestPhone, message);
    if (!opened) {
      await alert({
        title: `Could not open ${CHANNEL_LABEL[channel]}`,
        message: guestPhone ? 'Check that the app is installed on this phone.' : 'This resident has no phone number saved.',
      });
      return;
    }
    setSent(channel);
    run({ id: residentId, channel, period }).catch(() => {});
  };

  return (
    <Box>
      <Box style={styles.chips}>
        {CHANNELS.map((channel) => (
          <Chip
            key={channel}
            size="sm"
            label={CHANNEL_LABEL[channel]}
            selected={sent === channel}
            onPress={() => send(channel)}
          />
        ))}
      </Box>
      {sent ? (
        <Text variant="caption" color="success" style={styles.message}>
          Reminder opened in {CHANNEL_LABEL[sent]} and logged.
        </Text>
      ) : null}
    </Box>
  );
}
