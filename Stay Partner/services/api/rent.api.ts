import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

/**
 * Rent the owner collects from residents — recorded here, never collected
 * through Lampose. See `Backend/src/modules/rent/`.
 *
 * Amounts are whole RUPEES. Dates are `YYYY-MM-DD` and rent months are
 * `YYYY-MM`, both in India's calendar, exactly as the server sends them.
 */

export type RentMonthStatus = 'paid' | 'upcoming' | 'due' | 'overdue';
export type ResidentRentStatus = RentMonthStatus | 'none';
export type RentSource = 'set' | 'booking' | 'listing' | 'none';
export type PaymentMode = 'cash' | 'upi' | 'bank' | 'other';
export type ReminderChannel = 'whatsapp' | 'sms' | 'call';

export type RentMonth = {
  period: string;
  dueDate: string;
  amount: number;
  paid: number;
  balance: number;
  status: RentMonthStatus;
  isPartial: boolean;
  daysLate: number;
  daysUntil: number;
};

export type RentSummary = {
  status: ResidentRentStatus;
  outstanding: number;
  overdueAmount: number;
  overdueMonths: number;
  maxDaysLate: number;
  hasPartial: boolean;
  nextDue: { period: string; dueDate: string; balance: number; daysUntil: number } | null;
  oldestOwing: string | null;
};

export type ReminderLog = { channel: ReminderChannel; period: string; at: string };

export type Resident = {
  id: string;
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  shareType: string;
  propertyId: string;
  propertyName: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  source: 'request' | 'manual';
  rent: { monthly: number; source: RentSource; dueDay: number | null; effectiveDueDay: number };
  summary: RentSummary;
  lastReminder: ReminderLog | null;
};

export type RentPayment = {
  id: string;
  bookingId: string;
  guestName: string;
  guestPhone: string;
  roomNumber: string;
  propertyName: string;
  period: string;
  amount: number;
  paidOn: string;
  mode: PaymentMode;
  note: string;
  receiptNo: string;
  voidedAt: string | null;
  voidReason: string;
  createdAt: string;
};

export type ResidentDetail = Resident & {
  monthlyStay: boolean;
  /** Newest first. */
  periods: RentMonth[];
  payments: RentPayment[];
  reminders: ReminderLog[];
};

export type RentOverview = {
  today: string;
  counts: {
    residents: number;
    needsRent: number;
    dueToday: number;
    dueTodayAmount: number;
    overdue: number;
    overdueAmount: number;
    upcoming: number;
    upcomingAmount: number;
  };
  collectedThisMonth: { amount: number; count: number; month: string };
  beds: { total: number; free: number; occupied: number };
};

export type DueRow = Resident & { owing: RentMonth[] };

export type UpcomingRow = RentMonth & {
  resident: Pick<Resident, 'id' | 'guestName' | 'guestPhone' | 'roomNumber' | 'propertyName'>;
};

export type Receipt = RentPayment & {
  periodLabel: string;
  receivedBy: { name: string; businessName: string; phone: string };
};

export type VacancyResident = { id: string; guestName: string; roomNumber: string; checkInDate: string };

export type Vacancy = {
  totals: { totalBeds: number; freeBeds: number; occupiedBeds: number; residents: number };
  properties: {
    propertyId: string;
    propertyName: string;
    totalBeds: number;
    freeBeds: number;
    roomTypes: {
      shareTypeId: string;
      name: string;
      monthlyPrice: number;
      totalBeds: number;
      freeBeds: number;
      occupiedBeds: number;
      isAvailable: boolean;
      residents: VacancyResident[];
    }[];
    others: VacancyResident[];
  }[];
};

export type RentSettings = { ownerAlerts: boolean; daysBefore: number };

export type RemindersData = {
  settings: RentSettings;
  followUps: Resident[];
  recent: (ReminderLog & { bookingId: string; guestName: string })[];
};

type Listed<T> = ApiEnvelope<T> & { total?: number };

export async function fetchRentOverview(signal?: AbortSignal): Promise<RentOverview> {
  return unwrap(await api.get<ApiEnvelope<RentOverview>>(endpoints.rentOverview, { signal }));
}

export async function fetchResidents(signal?: AbortSignal): Promise<Resident[]> {
  return unwrap(await api.get<ApiEnvelope<Resident[]>>(endpoints.rentResidents, { signal })) ?? [];
}

export async function fetchResident(id: string, signal?: AbortSignal): Promise<ResidentDetail> {
  return unwrap(await api.get<ApiEnvelope<ResidentDetail>>(endpoints.rentResident(id), { signal }));
}

export async function fetchDues(signal?: AbortSignal): Promise<{ rows: DueRow[]; total: number }> {
  const res = await api.get<Listed<DueRow[]>>(endpoints.rentDues, { signal });
  return { rows: unwrap(res) ?? [], total: Number(res.total) || 0 };
}

export async function fetchUpcoming(
  days: number,
  signal?: AbortSignal,
): Promise<{ rows: UpcomingRow[]; total: number }> {
  const res = await api.get<Listed<UpcomingRow[]>>(endpoints.rentUpcoming, { signal, query: { days } });
  return { rows: unwrap(res) ?? [], total: Number(res.total) || 0 };
}

export async function fetchRentPayments(
  filters: { month?: string | null; bookingId?: string | null },
  signal?: AbortSignal,
): Promise<{ rows: RentPayment[]; total: number }> {
  const query: Record<string, string> = {};
  if (filters.month) query.month = filters.month;
  if (filters.bookingId) query.bookingId = filters.bookingId;
  const res = await api.get<Listed<RentPayment[]>>(endpoints.rentPayments, { signal, query });
  return { rows: unwrap(res) ?? [], total: Number(res.total) || 0 };
}

export async function fetchReceipt(id: string, signal?: AbortSignal): Promise<Receipt> {
  return unwrap(await api.get<ApiEnvelope<Receipt>>(endpoints.rentPayment(id), { signal }));
}

export async function fetchVacancy(signal?: AbortSignal): Promise<Vacancy> {
  return unwrap(await api.get<ApiEnvelope<Vacancy>>(endpoints.rentVacancy, { signal }));
}

export async function fetchReminders(signal?: AbortSignal): Promise<RemindersData> {
  return unwrap(await api.get<ApiEnvelope<RemindersData>>(endpoints.rentReminders, { signal }));
}

export async function updateRentTerms(
  id: string,
  input: { monthly?: number; dueDay?: number | null },
): Promise<Resident> {
  return unwrap(await api.patch<ApiEnvelope<Resident>>(endpoints.rentResidentTerms(id), input));
}

export type RecordPaymentInput = {
  period: string;
  amount: number;
  paidOn: string;
  mode: PaymentMode;
  note?: string;
};

export async function recordRentPayment(id: string, input: RecordPaymentInput): Promise<RentPayment> {
  return unwrap(await api.post<ApiEnvelope<RentPayment>>(endpoints.rentResidentPayments(id), input));
}

export async function voidRentPayment(id: string, reason: string): Promise<RentPayment> {
  return unwrap(await api.post<ApiEnvelope<RentPayment>>(endpoints.rentPaymentVoid(id), { reason }));
}

export async function logRentReminder(
  id: string,
  input: { channel: ReminderChannel; period?: string },
): Promise<ReminderLog> {
  return unwrap(await api.post<ApiEnvelope<ReminderLog>>(endpoints.rentResidentReminders(id), input));
}

export async function updateRentSettings(input: Partial<RentSettings>): Promise<RentSettings> {
  return unwrap(await api.patch<ApiEnvelope<RentSettings>>(endpoints.rentSettings, input));
}
