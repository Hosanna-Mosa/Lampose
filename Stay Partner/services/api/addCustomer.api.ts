import { api, apiRequest, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';

/**
 * The Add Customer form: the guest's code, their documents, and the record.
 *
 * ## The verified tick is not something this app decides
 *
 * `verifyGuestOtp` returns only that the server accepted the code. The saved
 * record's `verified` flag is written by the SERVER, which looks the
 * verification up rather than reading a boolean off the request — the owner
 * logging a walk-in is the one party with a reason to skip the step, and a
 * flag they can set is not a check. Nothing here sends one.
 */

export type GuestOtpChallenge = {
  /** "•••••43210" — the server's own masking of the number it messaged. */
  phoneMasked: string;
  otpLength: number;
  resendInSeconds: number;
  maxAttempts: number;
};

export async function startGuestOtp(
  phone: string,
  signal?: AbortSignal,
): Promise<GuestOtpChallenge> {
  const envelope = await api.post<ApiEnvelope<GuestOtpChallenge>>(
    endpoints.partnerGuestOtpStart,
    { phone },
    { signal },
  );
  return unwrap(envelope);
}

export async function verifyGuestOtp(
  phone: string,
  otp: string,
  signal?: AbortSignal,
): Promise<{ phone: string; verifiedAt: string }> {
  const envelope = await api.post<ApiEnvelope<{ phone: string; verifiedAt: string }>>(
    endpoints.partnerGuestOtpVerify,
    { phone, otp },
    { signal },
  );
  return unwrap(envelope);
}

/** What Cloudinary gave back. `publicId` travels because a delete needs it. */
export type KycImage = { url: string; publicId: string };

/**
 * Uploads the identity photographs.
 *
 * Sent as `multipart/form-data` rather than base64 JSON: a phone photograph is
 * two or three megabytes, and base64 inflates it by a third before it even
 * leaves the handset. `FormData` streams the bytes.
 *
 * `apiRequest` is used directly rather than `api.post` because the client sets
 * `Content-Type: application/json` whenever a body is present, and multipart
 * needs the boundary that `fetch` writes itself — so the header is explicitly
 * cleared below.
 */
export async function uploadKycImages(
  images: { uri: string; name?: string; mimeType?: string }[],
  signal?: AbortSignal,
): Promise<KycImage[]> {
  const form = new FormData();

  images.forEach((image, index) => {
    form.append('images', {
      uri: image.uri,
      name: image.name ?? `aadhar-${index + 1}.jpg`,
      type: image.mimeType ?? 'image/jpeg',
      // React Native's FormData takes this shape; the DOM typings do not.
    } as unknown as Blob);
  });

  const envelope = await apiRequest<ApiEnvelope<KycImage[]>>(endpoints.partnerKycUpload, {
    method: 'POST',
    body: form,
    signal,
    /* Photographs over a phone connection. The default 15s deadline fails a
       three-image upload on anything short of good wifi. */
    timeoutMs: 90_000,
  });

  const data = unwrap(envelope);
  return Array.isArray(data) ? data : [];
}

/**
 * A physical document the owner has noted and, once ticked, confirmed they
 * have actually seen — see `components/DocumentsChecklist.tsx`. Replaces an
 * Aadhar number plus a Cloudinary photograph: nothing here is an upload.
 */
export type DocumentEntry = { name: string; collected: boolean };

export type CreateBookingInput = {
  guestName: string;
  guestPhone: string;
  /** The property's own category (PG_HOSTEL / BACHELOR / …) for most
      properties — for a PG with sharing types configured at onboarding, the
      specific sharing type the owner picked (e.g. "2 Sharing") instead, since
      that is the more useful fact once one exists. See
      requests/add-customer.tsx. */
  shareType: string;
  /** `YYYY-MM-DD`. A date-only string, so no timezone can move it. */
  checkInDate: string;
  /** Absent means open-ended — the ordinary case for a PG/hostel stay at
      move-in. The real end of a stay is `checkOutBookingApi`, an owner
      action, not a date declared up front. */
  checkOutDate?: string;
  guestsLabel?: string;
  address: string;
  documents: DocumentEntry[];
  propertyId?: string;
  propertyName?: string;
  roomNumber?: string;
  notes?: string;
  /** Pre-filled from the property's configured sharing-type rent when one is
      picked, but always owner-editable — a walk-in rate can differ from the
      listed one. Zero (unset) is a real, ordinary state: a walk-in logged
      before money changes hands, not a placeholder. */
  totalAmount?: number;
};

/**
 * Saves the record.
 *
 * Refused with `GUEST_NOT_VERIFIED` unless the server holds its own proof that
 * a code it generated came back correct for this owner and this number, and
 * with `DOCUMENT_REQUIRED` unless at least one document is ticked collected.
 */
export async function createBooking(
  input: CreateBookingInput,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  const envelope = await api.post<ApiEnvelope<{ id: string }>>(
    endpoints.partnerBookings,
    input,
    { signal },
  );
  return unwrap(envelope);
}

/** A record as the Customers screen renders it. */
export type ManualCustomer = {
  id: string;
  guestName: string;
  guestPhone: string;
  shareType: string;
  roomNumber: string;
  checkInDate: string;
  checkOutDate: string;
  guestsLabel: string;
  status: string;
  createdAt: string;
  kyc: {
    address: string;
    documents: DocumentEntry[];
    verifiedAt: string | null;
    verifiedPhone: string;
  };
};

/**
 * Only the walk-ins this owner logged by hand.
 *
 * `source=manual` is the filter, and it is the server that applies it — the
 * same endpoint with no filter returns everything, including records that came
 * from a customer's own visit request. Filtering here instead would put those
 * on the device first and hide them second.
 */
export async function fetchManualCustomers(signal?: AbortSignal): Promise<ManualCustomer[]> {
  const envelope = await api.get<ApiEnvelope<ManualCustomer[]>>(endpoints.partnerBookings, {
    signal,
    query: { source: 'manual' },
  });
  const data = unwrap(envelope);
  return Array.isArray(data) ? data : [];
}

export async function fetchCustomer(id: string, signal?: AbortSignal): Promise<ManualCustomer> {
  const envelope = await api.get<ApiEnvelope<ManualCustomer>>(endpoints.partnerBooking(id), {
    signal,
  });
  return unwrap(envelope);
}

/**
 * The fields a record may be corrected in.
 *
 * Note what is absent: `guestPhone` and the verification. The phone is the
 * number a code was sent to and answered — editing it would leave the record
 * claiming a verification it does not have, so a different number means a
 * new record rather than an edit. `documents` IS editable, unlike the old
 * Aadhar photograph it replaced — it is a checklist an owner keeps current,
 * not evidence like `verifiedAt` is, so correcting it later is expected.
 */
export type UpdateCustomerInput = {
  guestName?: string;
  shareType?: string;
  roomNumber?: string;
  guestsLabel?: string;
  notes?: string;
  address?: string;
  documents?: DocumentEntry[];
  /** `YYYY-MM-DD`. Re-checked against the same bounds the create uses. */
  checkInDate?: string;
  checkOutDate?: string;
};

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput,
  signal?: AbortSignal,
): Promise<ManualCustomer> {
  const envelope = await api.patch<ApiEnvelope<ManualCustomer>>(
    endpoints.partnerBooking(id),
    input,
    { signal },
  );
  return unwrap(envelope);
}

/**
 * Removes the record. A record from before documents moved to a physical
 * checklist may still carry an Aadhar photograph — the server deletes that
 * Cloudinary asset too, off the stored `publicId`, so nothing is left behind
 * on a public CDN. New records have no such asset to clean up.
 */
export async function deleteCustomer(id: string, signal?: AbortSignal): Promise<void> {
  await api.delete(endpoints.partnerBooking(id), { signal });
}
