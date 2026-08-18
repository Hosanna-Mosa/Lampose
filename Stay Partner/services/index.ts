/**
 * The backend, as the rest of this app sees it.
 *
 * Screens import from here. Nothing above this folder should reach into
 * `services/api/` for a path or a fetch — the layers below exist so that a
 * change of host, of version, or of response shape is a change in one place.
 *
 *   api/     the transport: one fetch, one error type, one route table, and
 *            one base URL that comes from `EXPO_PUBLIC_API_URL` alone
 *   hooks/   the cache: React Query, keyed so two screens share one fetch
 *
 * The session itself lives in `context/AuthContext.tsx`, because it is React
 * state with a lifecycle; `services/session.ts` is only its disk half.
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
  API_BASE_URL,
  API_BASE_URL_CONFIGURED,
  API_BASE_URL_IS_LOOPBACK,
  API_CONFIG_HINT,
  API_VERSION,
  APP_API_VERSION,
  CLIENT_NAME,
  CLIENT_VERSION,
  describeApiTarget,
} from './api/config';

export { endpoints, FIXTURE_BACKED_SCREENS } from './api/endpoints';

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
  fetchMyProperties,
  fetchMyProperty,
  fetchMyRequest,
  fetchMyRequests,
  fetchSummary,
  markRequestsRead,
  updateMyProperty,
  uploadPropertyImages,
  type PartnerRequestsResult,
  type PropertyImage,
  type UpdatePropertyInput,
} from './api/portfolio.api';

export { fetchHealth } from './api/health.api';

export {
  fetchListing,
  fetchListings,
  type ListingsQuery,
  type ListingsResult,
} from './api/listings.api';

export type {
  BackendHealth,
  BackendListing,
  BackendOtpChallenge,
  BackendPartner,
  BackendPartnerRequest,
  BackendPartnerSession,
  BackendPartnerSummary,
  BackendRequestStatus,
} from './api/types';

export { clearSession, loadSession, savePartner, saveSession } from './session';

export { queryKeys } from './hooks/keys';
export { useHealth } from './hooks/useHealth';
export { useListing, useListings } from './hooks/useListings';
export {
  useMarkRequestsRead,
  useMyProperties,
  useMyRequest,
  useMyRequests,
  useSummary,
} from './hooks/usePortfolio';
