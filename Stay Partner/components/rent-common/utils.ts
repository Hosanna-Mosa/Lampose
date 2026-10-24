import { Linking, Platform } from 'react-native';

import { formatINR } from '@/lib/format';
import type {
  PaymentMode, ReminderChannel, RentMonth, RentMonthStatus, ResidentRentStatus,
} from '@/services/api/rent.api';

/**
 * Shared by every Rent screen. The server sends India-calendar strings
 * (`YYYY-MM-DD`, `YYYY-MM`); these turn them into words without going through
 * `Date` parsing, which would read a bare date as UTC midnight and show the
 * day before on some phones.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-03" → "Mar 2026" */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${y}` : period;
}

/** "2026-03-10" → "Mar 10" */
export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split('-').map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1]} ${d}` : ymd;
}

/** "2026-03-10" → "10 Mar 2026" */
export function fullDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return MONTHS[m - 1] ? `${d} ${MONTHS[m - 1]} ${y}` : ymd;
}

/** Today in India as `YYYY-MM-DD` — the same calendar the server uses. */
export function todayYmd(now = new Date()): string {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${ist.getFullYear()}-${pad(ist.getMonth() + 1)}-${pad(ist.getDate())}`;
}

/** `period` shifted by whole months — for the history month picker. */
export function shiftPeriod(period: string, by: number): string {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

export function ordinal(n: number): string {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${tail}`;
}

export const STATUS_TONE: Record<ResidentRentStatus, 'success' | 'warning' | 'error' | 'accent' | 'neutral'> = {
  paid: 'success',
  upcoming: 'neutral',
  due: 'warning',
  overdue: 'error',
  none: 'neutral',
};

export const STATUS_LABEL: Record<ResidentRentStatus, string> = {
  paid: 'Paid',
  upcoming: 'Upcoming',
  due: 'Due today',
  overdue: 'Overdue',
  none: 'No rent set',
};

/** One month in words: "₹3,000 of ₹6,000 paid · 4 days late". */
export function monthLine(month: RentMonth): string {
  const parts: string[] = [];
  if (month.isPartial) parts.push(`${formatINR(month.paid)} of ${formatINR(month.amount)} paid`);
  else parts.push(formatINR(month.amount));
  if (month.status === 'overdue') parts.push(`${month.daysLate} day${month.daysLate === 1 ? '' : 's'} late`);
  if (month.status === 'due') parts.push('due today');
  if (month.status === 'upcoming') {
    parts.push(month.daysUntil === 1 ? 'due tomorrow' : `due ${dayLabel(month.dueDate)}`);
  }
  return parts.join(' · ');
}

export const MODE_LABEL: Record<PaymentMode, string> = {
  cash: 'Cash',
  upi: 'UPI',
  bank: 'Bank transfer',
  other: 'Other',
};

export const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  call: 'Call',
};

/** The number in the international form WhatsApp and the dialler want. */
function dialable(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

/** The message a reminder carries, in the owner's voice. */
export function reminderMessage(args: {
  guestName: string;
  propertyName: string;
  amount: number;
  status: RentMonthStatus | 'none';
  period?: string;
  dueDate?: string;
}): string {
  const first = args.guestName.trim().split(/\s+/)[0] || 'there';
  const forMonth = args.period ? ` for ${monthLabel(args.period)}` : '';
  let when = '';
  if (args.status === 'overdue' && args.dueDate) when = ` was due on ${dayLabel(args.dueDate)}`;
  else if (args.status === 'due') when = ' is due today';
  else if (args.dueDate) when = ` is due on ${dayLabel(args.dueDate)}`;
  const place = args.propertyName ? ` — ${args.propertyName}` : '';
  return `Hi ${first}, a friendly reminder that your rent of ${formatINR(args.amount)}${forMonth}${when}. `
    + `Please pay at the earliest. Thank you${place}`;
}

/**
 * Opens WhatsApp, Messages or the dialler with the reminder ready to send.
 * Resolves false when the phone has nothing that can open it.
 */
export async function openReminder(channel: ReminderChannel, phone: string, message: string): Promise<boolean> {
  const number = dialable(phone);
  if (!number) return false;
  const text = encodeURIComponent(message);
  const url = channel === 'whatsapp'
    ? `https://wa.me/${number}?text=${text}`
    : channel === 'sms'
      ? `sms:+${number}${Platform.OS === 'ios' ? '&' : '?'}body=${text}`
      : `tel:+${number}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
