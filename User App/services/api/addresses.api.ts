/**
 * The diner's address book.
 *
 * A LIST, because an address is a property of the ORDER — a room today, the
 * gate tonight, a friend's block on Saturday. The rider and the property owner
 * each hold ONE, for the reason `Backend/src/shared/utils/address.js` gives;
 * the shape and every validation rule are shared between all three so they
 * cannot drift.
 *
 * ## `[longitude, latitude]` out, `{lat, lng}` in
 *
 * `location` comes back as the GeoJSON pair this codebase keeps unswapped
 * everywhere. It is SENT as `{lat, lng}`, because that is what a device's
 * location API hands an app and asking every client to flip it is asking for
 * the flip to be forgotten. The server does the conversion once.
 */
import { api } from './client';
import { endpoints } from './endpoints';

export type AddressKind = 'room' | 'hostel' | 'home' | 'work' | 'gate' | 'other';

export interface SavedAddress {
  addressId: string;
  kind: AddressKind;
  label: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  instructions: string;
  /** `[longitude, latitude]`, or null when no pin was captured. */
  location: [number, number] | null;
  isDefault: boolean;
}

/** What a form sends. Every field optional on an edit; `line1` required to add. */
export interface AddressInput {
  kind?: AddressKind;
  label?: string;
  line1?: string;
  line2?: string;
  landmark?: string;
  city?: string;
  state?: string;
  pincode?: string;
  instructions?: string;
  /** `null` clears a stale pin. Omit to leave it alone. */
  location?: { lat: number; lng: number } | null;
}

const list = (res: unknown): SavedAddress[] => {
  const data = (res as { data?: SavedAddress[]; addresses?: SavedAddress[] }) ?? {};
  const rows = data.addresses ?? data.data;
  return Array.isArray(rows) ? rows : [];
};

/** The book, default first — the order a picker should offer them in. */
export async function fetchAddresses(): Promise<SavedAddress[]> {
  return list(await api.get(endpoints.addresses));
}

export async function addAddress(input: AddressInput): Promise<SavedAddress[]> {
  return list(await api.post(endpoints.addresses, input));
}

export async function updateAddress(
  addressId: string,
  input: AddressInput,
): Promise<SavedAddress[]> {
  return list(await api.patch(endpoints.address(addressId), input));
}

export async function removeAddress(addressId: string): Promise<SavedAddress[]> {
  return list(await api.delete(endpoints.address(addressId)));
}

/** Its own call: choosing a default is one tap, not an address edit. */
export async function setDefaultAddress(addressId: string): Promise<SavedAddress[]> {
  return list(await api.post(endpoints.addressDefault(addressId)));
}

/** The one line a rider reads at the door. Mirrors the server's `addressLine`. */
export const addressLine = (address: SavedAddress): string =>
  [address.line1, address.line2, address.landmark, address.city, address.pincode]
    .map((part) => (part || '').trim())
    .filter(Boolean)
    .join(', ');

/** What to call it in a list, when the person did not label it. */
export const addressTitle = (address: SavedAddress): string =>
  address.label?.trim() || address.line1 || 'Saved address';
