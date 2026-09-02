/* ══════════════════════════════════════════════════════════════════════════
   The delivery-rider queue.

   Reads `/v1/admin/drivers` — the v1 admin surface, behind the same admin
   token every other service here uses. Riders themselves sign in through
   `/api/v2/drivers`, the sixth identity system in the backend; the console
   never touches that one, and nothing on it can approve its own accounts.

   Versioned in the path for the same reason `foodAdminService` is:
   `axiosInstance` is based at `.../api`, older services here call unversioned
   paths that the alias table in `routes/index.js` still answers, and that table
   exists for callers written before versioning rather than to give new ones a
   second spelling to drift onto. This endpoint is new, so it names its version.

   ## Nothing is defaulted into existence

   A rider with no date of birth comes back as `null` and the page renders a
   dash. Substituting a zero or an empty object here would be the console
   showing a measurement nobody took — and on this screen the reader is
   deciding whether to put a stranger on the road.

   The one thing normalised rather than passed through is `documents`: the
   backend already sends a complete five-row checklist, and this coerces it to
   that shape so a page mid-deploy against an older server still renders five
   rows instead of throwing on `.map`.
   ══════════════════════════════════════════════════════════════════════════ */
import { api, unwrapList } from '../apiCaller';
import type {
  ApiResponse,
  DriverDetail,
  DriverDocument,
  DriverDocumentKind,
  DriverDocumentStatus,
  DriverQueueCounts,
  DriverRow,
  DriverStatus,
} from '../types';

/* The versioned path, spelled once. `axiosInstance` supplies the `/api` base. */
const BASE = '/v1/admin/drivers';

/** The five kinds and their names, mirrored so a short response still renders. */
const DOCUMENT_LABELS: Record<DriverDocumentKind, string> = {
  licence: 'Driving licence',
  rc: 'Vehicle registration (RC)',
  aadhaar: 'Aadhaar card',
  pan: 'PAN card',
  insurance: 'Vehicle insurance',
};

const REQUIRED: DriverDocumentKind[] = ['licence', 'rc', 'aadhaar'];
const KINDS = Object.keys(DOCUMENT_LABELS) as DriverDocumentKind[];

const num = (value: unknown, fallback = 0): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * A complete checklist, whatever the server sent.
 *
 * The backend builds all five rows itself, so this normally just types what
 * arrives. It fills a gap rather than trusting the length because a console
 * deployed ahead of the API would otherwise render four rows and quietly hide
 * the document an approver was looking for.
 */
const normalizeDocuments = (raw: unknown): DriverDocument[] => {
  const sent = new Map<string, any>(
    (Array.isArray(raw) ? raw : []).filter(Boolean).map((doc: any) => [doc.kind, doc]),
  );

  return KINDS.map((kind) => {
    const doc = sent.get(kind);
    return {
      kind,
      label: str(doc?.label) || DOCUMENT_LABELS[kind],
      required: typeof doc?.required === 'boolean' ? doc.required : REQUIRED.includes(kind),
      number: str(doc?.number),
      frontUrl: str(doc?.frontUrl),
      backUrl: str(doc?.backUrl),
      expiresAt: doc?.expiresAt ?? null,
      status: (str(doc?.status) || 'missing') as DriverDocumentStatus,
      reason: str(doc?.reason),
      submittedAt: doc?.submittedAt ?? null,
      reviewedAt: doc?.reviewedAt ?? null,
    };
  });
};

const normalizeRow = (raw: any): DriverRow => {
  const documents = normalizeDocuments(raw?.documents);

  return {
    driverId: str(raw?.driverId),
    name: str(raw?.name),
    phone: str(raw?.phone),
    email: str(raw?.email),
    dateOfBirth: raw?.dateOfBirth ?? null,
    city: str(raw?.city),
    profilePhotoUrl: str(raw?.profilePhotoUrl),

    status: (str(raw?.status) || 'pending') as DriverStatus,
    statusReason: str(raw?.statusReason),

    vehicle: raw?.vehicle && typeof raw.vehicle === 'object' ? raw.vehicle : {},
    documents,
    documentCounts: raw?.documentCounts && typeof raw.documentCounts === 'object'
      ? raw.documentCounts
      /* Recomputed only when the server did not send it, so the two can never
         disagree about the same rows in the same response. */
      : documents.reduce(
        (acc, doc) => ({ ...acc, [doc.status]: (acc[doc.status] ?? 0) + 1 }),
        {} as Record<string, number>,
      ),
    documentsReady: typeof raw?.documentsReady === 'boolean'
      ? raw.documentsReady
      : documents.filter((d) => d.required).every((d) => d.status === 'verified' || d.status === 'pending'),

    payout: {
      accountHolderName: str(raw?.payout?.accountHolderName),
      accountLast4: str(raw?.payout?.accountLast4),
      ifscCode: str(raw?.payout?.ifscCode),
      bankName: str(raw?.payout?.bankName),
      accountType: str(raw?.payout?.accountType),
      upiId: str(raw?.payout?.upiId),
    },

    hasCompletedOnboarding: Boolean(raw?.hasCompletedOnboarding),
    onboardingStep: str(raw?.onboardingStep) || 'personal',
    onboardingMissing: Array.isArray(raw?.onboardingMissing) ? raw.onboardingMissing : [],

    isOnline: Boolean(raw?.isOnline),
    isAvailable: raw?.isAvailable !== false,
    currentOrderNumber: raw?.currentOrderNumber ?? null,
    locationFresh: Boolean(raw?.locationFresh),
    locationUpdatedAt: raw?.locationUpdatedAt ?? null,
    /* `[longitude, latitude]`, and it stays that way all the way to the map
       link — swapping it here would put every rider in the Arctic Ocean
       without throwing. */
    currentLocation: Array.isArray(raw?.currentLocation) && raw.currentLocation.length === 2
      ? [num(raw.currentLocation[0]), num(raw.currentLocation[1])]
      : null,
    heading: typeof raw?.heading === 'number' ? raw.heading : null,
    onlineSince: raw?.onlineSince ?? null,
    deviceCount: num(raw?.deviceCount),

    phoneVerifiedAt: raw?.phoneVerifiedAt ?? null,
    lastLoginAt: raw?.lastLoginAt ?? null,
    createdAt: raw?.createdAt ?? null,
    updatedAt: raw?.updatedAt ?? null,
  };
};

export const driverAdminService = {
  /** The queue and the roster. `status: 'all'` or omitted returns everybody. */
  async getDrivers(params?: {
    status?: DriverStatus | 'all';
    search?: string;
    /** `pending` / `rejected` / `incomplete` — filtered server-side over the page. */
    documents?: 'pending' | 'rejected' | 'incomplete';
    online?: boolean;
    limit?: number;
  }): Promise<ApiResponse<DriverRow[]> & { counts?: DriverQueueCounts }> {
    const query = { ...params };
    /* `status: 'all'` is this console's word for "no filter", and the backend
       reads an absent parameter the same way. Sending the literal string would
       match no rider, because it is not one of the four statuses. */
    if (query.status === 'all') delete query.status;

    const res = await api.get<any>(BASE, query);
    if (!res.success) return { ...res, data: [] };
    return {
      ...res,
      data: unwrapList(res.data).map(normalizeRow),
      counts: res.data?.counts as DriverQueueCounts | undefined,
    };
  },

  /** One rider in full, with what they have carried and what it paid. */
  async getDriver(driverId: string): Promise<ApiResponse<DriverDetail | null>> {
    const res = await api.get<any>(`${BASE}/${driverId}`);
    if (!res.success || !res.data?.data) return { ...res, data: null };
    const payload = res.data.data;
    return {
      ...res,
      data: {
        ...normalizeRow(payload),
        lifetime: {
          assigned: num(payload?.lifetime?.assigned),
          delivered: num(payload?.lifetime?.delivered),
          cancelled: num(payload?.lifetime?.cancelled),
          earnings: num(payload?.lifetime?.earnings),
        },
        recentDeliveries: Array.isArray(payload?.recentDeliveries)
          ? payload.recentDeliveries
          : [],
      },
    };
  },

  /**
   * Verify or refuse ONE document.
   *
   * The decision this queue exists for. A refusal does not touch the account —
   * the rider stays pending, their app names this document and this reason, and
   * resubmitting puts it straight back here. The backend refuses a rejection
   * with no reason, because the rider is shown the string verbatim.
   */
  async decideDocument(
    driverId: string,
    kind: DriverDocumentKind,
    status: 'verified' | 'rejected',
    reason?: string,
  ): Promise<ApiResponse<DriverRow | null>> {
    const res = await api.patch<any>(`${BASE}/${driverId}/documents/${kind}`, { status, reason });
    return res.success && res.data?.data
      ? { ...res, data: normalizeRow(res.data.data) }
      : { ...res, data: null };
  },

  /**
   * Approve, reject, suspend, or lift a suspension.
   *
   * The heavier of the two verdicts: this is what puts somebody on the road or
   * takes them off it. The backend refuses `pending` (a rider cannot be sent
   * back to the start — suspend them, with a reason) and refuses any non-
   * approval with no reason. It returns a `warning` when the decision has a
   * consequence the operator has to act on — a suspended rider still carrying
   * an order, or an approval granted over incomplete paperwork.
   */
  async decide(
    driverId: string,
    status: DriverStatus,
    reason?: string,
  ): Promise<ApiResponse<DriverRow | null> & { warning?: string }> {
    const res = await api.patch<any>(`${BASE}/${driverId}/decision`, { status, reason });
    return res.success && res.data?.data
      ? { ...res, data: normalizeRow(res.data.data), warning: str(res.data.warning) }
      : { ...res, data: null };
  },
};
