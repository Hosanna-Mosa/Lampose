/**
 * The backend, as the rest of the app sees it.
 *
 * Screens import from here. Nothing above this folder should reach into
 * `services/api/` for a path or a fetch — the layers below exist so that a
 * change of host, of version, or of response shape is a change in one place.
 *
 *   api/       the transport: one fetch, one error type, one route table
 *   adapters/  the boundary: server shapes in, app types out
 *   hooks/     the cache: React Query, keyed so two screens share one fetch
 */

export {
  api,
  apiRequest,
  ApiError,
  unwrap,
  getAuthToken,
  setAuthToken,
  setSessionExpiredHandler,
  type ApiEnvelope,
  type ApiRequestOptions,
} from './api/client';

export {
  fetchMe,
  resendAuthCode,
  startAuth,
  updateMe,
  verifyAuth,
  type StartAuthInput,
  type UpdateMeInput,
  type VerifyAuthInput,
} from './api/auth.api';

export {
  API_BASE_URL,
  API_BASE_URL_IS_GUESSED,
  API_VERSION,
  APP_API_VERSION,
  CLIENT_NAME,
  CLIENT_VERSION,
} from './api/config';

export { endpoints } from './api/endpoints';

export {
  fetchListing,
  fetchListingMeta,
  fetchListings,
  type ListingQuery,
  type ListingsResult,
} from './api/listings.api';

/**
 * The stay request: ask an owner for a bed, watch the clock, pull it back.
 *
 * Real, and the mock that stood in for it is gone. Three calls where the
 * website's guest flow needed four — no code, because the phone was proved at
 * sign-in, and no WhatsApp, because the owner has an app.
 */
export {
  createStayRequest,
  fetchStayRequest,
  fetchStayRequests,
  withdrawStayRequest,
  confirmMovedIn,
  type CreateStayRequestInput,
  type StayIntent,
  type StayRequestsResult,
} from './api/stayRequests.api';

export { fetchHealth } from './api/health.api';

export {
  fetchNotifications,
  markNotificationsRead,
  type NotificationsResult,
} from './api/notifications.api';

export {
  addSaved,
  fetchSaved,
  removeSaved,
  type SavedListing,
} from './api/saved.api';

export {
  createReport,
  createTicket,
  fetchTicket,
  fetchTickets,
  markTicketRead,
  replyToTicket,
  type CreateReportInput,
  type CreateTicketInput,
  type TicketsResult,
} from './api/support.api';

export type {
  BackendCategory,
  BackendCustomer,
  BackendHealth,
  BackendListing,
  BackendListingMeta,
  BackendNotification,
  BackendOtpChallenge,
  BackendSession,
  BackendTicket,
  BackendTicketDetail,
  BackendTicketMessage,
  BackendTicketStatus,
  BackendVisitRequest,
  BackendStayRequest,
  StayRequestStatus,
  StayDecisionReason,
  VisitRequestStatus,
} from './api/types';

export {
  BACKEND_CATEGORIES,
  toListing,
  toListings,
  toStayCategory,
} from './adapters/listing.adapter';

export { guessLocality, toLocalities } from './adapters/places.adapter';

export {
  relativeWhen,
  toTicket,
  toTicketMessage,
  toTickets,
  toTicketThread,
} from './adapters/support.adapter';

export { queryKeys } from './hooks/keys';
export { useListing, useListingMeta, useListings, type ListingMeta } from './hooks/useListings';
export { useStayRequest, isTerminalPhase, type StayPhase } from './hooks/useStayRequest';
export { useNotifications, type NotificationDay } from './hooks/useNotifications';
export { useSaved } from './hooks/useSaved';
export { useCreateSupportRequest, useTicket, useTickets } from './hooks/useTickets';
export { useHealth } from './hooks/useHealth';
