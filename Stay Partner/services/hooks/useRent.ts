import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  fetchDues,
  fetchReceipt,
  fetchReminders,
  fetchRentOverview,
  fetchRentPayments,
  fetchResident,
  fetchResidents,
  fetchUpcoming,
  fetchVacancy,
  logRentReminder,
  recordRentPayment,
  updateRentSettings,
  updateRentTerms,
  voidRentPayment,
  type RecordPaymentInput,
  type ReminderChannel,
  type RentSettings,
} from '@/services/api/rent.api';
import { queryKeys } from './keys';

/**
 * The Rent tab's data.
 *
 * Every write invalidates the whole `['partner', 'rent']` tree rather than
 * guessing which screens a payment touched: one payment moves a tile count,
 * a due row, an upcoming row, a resident's months and the history total.
 */
function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

const READ = { refetchOnWindowFocus: true, staleTime: 15_000 } as const;

export function useRentOverview() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentOverview,
    queryFn: ({ signal }) => fetchRentOverview(signal),
    enabled,
    ...READ,
  });
  return { ...query, overview: query.data ?? null, error: query.error as ApiError | null };
}

export function useResidents() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentResidents,
    queryFn: ({ signal }) => fetchResidents(signal),
    enabled,
    ...READ,
  });
  return { ...query, residents: query.data ?? [], error: query.error as ApiError | null };
}

export function useResident(id: string | undefined) {
  const enabled = useReady() && Boolean(id);
  const query = useQuery({
    queryKey: queryKeys.rentResident(id ?? ''),
    queryFn: ({ signal }) => fetchResident(id as string, signal),
    enabled,
    ...READ,
  });
  return { ...query, resident: query.data ?? null, error: query.error as ApiError | null };
}

export function useDues() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentDues,
    queryFn: ({ signal }) => fetchDues(signal),
    enabled,
    ...READ,
  });
  return { ...query, rows: query.data?.rows ?? [], total: query.data?.total ?? 0, error: query.error as ApiError | null };
}

export function useUpcomingRent(days: number) {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentUpcoming(days),
    queryFn: ({ signal }) => fetchUpcoming(days, signal),
    enabled,
    ...READ,
  });
  return { ...query, rows: query.data?.rows ?? [], total: query.data?.total ?? 0, error: query.error as ApiError | null };
}

export function useRentPayments(month: string | null, bookingId: string | null = null) {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentPayments(month, bookingId),
    queryFn: ({ signal }) => fetchRentPayments({ month, bookingId }, signal),
    enabled,
    ...READ,
  });
  return { ...query, rows: query.data?.rows ?? [], total: query.data?.total ?? 0, error: query.error as ApiError | null };
}

export function useReceipt(id: string | undefined) {
  const enabled = useReady() && Boolean(id);
  const query = useQuery({
    queryKey: queryKeys.rentReceipt(id ?? ''),
    queryFn: ({ signal }) => fetchReceipt(id as string, signal),
    enabled,
    staleTime: 60_000,
  });
  return { ...query, receipt: query.data ?? null, error: query.error as ApiError | null };
}

export function useVacancy() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentVacancy,
    queryFn: ({ signal }) => fetchVacancy(signal),
    enabled,
    ...READ,
  });
  return { ...query, vacancy: query.data ?? null, error: query.error as ApiError | null };
}

export function useRentReminders() {
  const enabled = useReady();
  const query = useQuery({
    queryKey: queryKeys.rentReminders,
    queryFn: ({ signal }) => fetchReminders(signal),
    enabled,
    ...READ,
  });
  return { ...query, data: query.data ?? null, error: query.error as ApiError | null };
}

function useRentMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: fn,
    retry: false,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rent });
    },
  });
  return { run: mutation.mutateAsync, isPending: mutation.isPending, error: mutation.error as ApiError | null };
}

export function useRecordPayment() {
  return useRentMutation((vars: { id: string; input: RecordPaymentInput }) =>
    recordRentPayment(vars.id, vars.input));
}

export function useUpdateRentTerms() {
  return useRentMutation((vars: { id: string; monthly?: number; dueDay?: number | null }) =>
    updateRentTerms(vars.id, { monthly: vars.monthly, dueDay: vars.dueDay }));
}

export function useVoidPayment() {
  return useRentMutation((vars: { id: string; reason: string }) => voidRentPayment(vars.id, vars.reason));
}

export function useLogReminder() {
  return useRentMutation((vars: { id: string; channel: ReminderChannel; period?: string }) =>
    logRentReminder(vars.id, { channel: vars.channel, period: vars.period }));
}

export function useUpdateRentSettings() {
  return useRentMutation((input: Partial<RentSettings>) => updateRentSettings(input));
}
