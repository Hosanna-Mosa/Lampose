import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/client';
import { API_BASE_URL_CONFIGURED } from '@/services/api/config';
import {
  createSupportTicket,
  fetchSupportCategories,
  fetchSupportTicket,
  fetchSupportTickets,
  markSupportTicketRead,
  replyToSupportTicket,
  type CreateSupportTicketInput,
} from '@/services/api/support.api';
import { useAuth } from '@/context/AuthContext';
import { queryKeys } from './keys';

function useReady() {
  const { status } = useAuth();
  return API_BASE_URL_CONFIGURED && status === 'signedIn';
}

/**
 * The owner's support inbox — their own tickets AND every guest ticket
 * about one of their properties, already merged server-side (see `ownedBy`
 * in `ticket.controller.js`). Polled rather than pushed: a support thread is
 * not on a three-minute clock the way a stay request is, so a slower,
 * cheaper refresh is the right default — the socket connection in
 * `services/supportSocket.ts` is what makes an OPEN thread feel live.
 */
export function useSupportTickets() {
  const enabled = useReady();
  return useQuery({
    queryKey: queryKeys.supportTickets,
    queryFn: async ({ signal }) => fetchSupportTickets(signal),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 30000,
    staleTime: 10000,
  });
}

export function useSupportCategories() {
  const enabled = useReady();
  return useQuery({
    queryKey: queryKeys.supportCategories,
    queryFn: async ({ signal }) => fetchSupportCategories(signal),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSupportTicket(reference?: string | null) {
  const enabled = useReady() && Boolean(reference);
  return useQuery({
    queryKey: queryKeys.supportTicket(reference ?? ''),
    queryFn: async ({ signal }) => fetchSupportTicket(reference as string, signal),
    enabled,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  });
}

export function useSupportActions() {
  const queryClient = useQueryClient();

  const settleList = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.supportTickets });
  };

  const create = useMutation({
    mutationFn: (input: CreateSupportTicketInput) => createSupportTicket(input),
    retry: false,
    onSuccess: settleList,
  });

  const reply = useMutation({
    mutationFn: (input: { reference: string; body: string }) =>
      replyToSupportTicket(input.reference, input.body),
    retry: false,
    onSuccess: (thread) => {
      queryClient.setQueryData(queryKeys.supportTicket(thread.reference), thread);
      settleList();
    },
  });

  const markRead = useMutation({
    mutationFn: (reference: string) => markSupportTicketRead(reference),
    retry: false,
    onSettled: settleList,
  });

  return {
    create,
    reply,
    markRead,
    error: (create.error ?? reply.error) as ApiError | null,
  };
}
