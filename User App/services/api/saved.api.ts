import type { Listing } from '@/types/listing';
import { toListing } from '@/services/adapters/listing.adapter';
import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendListing } from './types';

/**
 * The shortlist, on the account rather than the device.
 *
 * Each entry carries the rent the listing had when it was saved, alongside
 * the listing as it is now. That pairing is the feature: a shortlist that
 * only remembers which places were kept is a list of links, and one that can
 * say "₹500 cheaper since you saved it" is the reason to keep places at all.
 * It cannot be reconstructed later — the old price is gone the moment the
 * panel edits it — so the server records it at the moment of saving.
 */

export type SavedListing = {
  listing: Listing;
  /** What it cost when it was saved. `null` when no rent was set then. */
  rentWhenSaved: number | null;
  savedAt: string;
};

type BackendSaved = {
  listing: BackendListing;
  rentWhenSaved: number | null;
  savedAt: string;
};

export async function fetchSaved(signal?: AbortSignal): Promise<SavedListing[]> {
  const envelope = await api.get<ApiEnvelope<BackendSaved[]>>(endpoints.customerSaved, { signal });
  const data = unwrap(envelope);
  if (!Array.isArray(data)) return [];

  return data.map((entry) => ({
    listing: toListing(entry.listing),
    rentWhenSaved: entry.rentWhenSaved,
    savedAt: entry.savedAt,
  }));
}

/**
 * Adds one. Saving something already saved is not an error and does NOT
 * refresh the recorded rent — a second tap must not erase the comparison.
 */
export async function addSaved(listingId: string, signal?: AbortSignal): Promise<void> {
  await api.post(endpoints.customerSaved, { listingId }, { signal });
}

export async function removeSaved(listingId: string, signal?: AbortSignal): Promise<void> {
  await api.delete(endpoints.customerSavedOne(listingId), { signal });
}
