import { apiClient } from './apiClient';

/* ══════════════════════════════════════════════════════════════════════════
   The diner's address book — the WRITE half.

   `foodApi.fetchAddresses` reads `/food-web/addresses`, which answers a
   different question: "can this kitchen reach this door right now". That list
   is judged, per kitchen, and read-only. This module is the book itself —
   `/api/v2/customers/me/addresses`, the same five routes the Lampose app
   calls, behind the same customer session the website already signs in with.

   Two lists of the same addresses is not a duplication: one is where they
   live, the other is a verdict about them, and only the first can be written
   to. The address page reads the judged list for what to SHOW and this one
   for what to EDIT.

   ## Every write answers with the whole book

   `{ success, data, addresses }` — `data` is the row that was written and
   `addresses` is the book after the write, default first. The book is what
   callers want: a screen that added an address needs the list, not the row,
   and re-reading it would be a second round trip for something the server
   just had in its hand.

   ## The errors are the server's sentences

   "You can save up to 10 addresses.", "That pincode does not look right. It is
   six digits." — written for the diner, carried through untouched. `apiClient`
   puts the message and the code on the Error it throws; see the form.
   ══════════════════════════════════════════════════════════════════════════ */

const BASE = '/v2/customers/me/addresses';

const path = id => `${BASE}/${encodeURIComponent(id)}`;

/** The book, default first. Every field an editor needs, `location` as [lng, lat]. */
export const fetchAddressBook = () => apiClient.get(BASE).then(res => res.data || []);

/**
 * Save a new one.
 *
 * `location` is sent as `{lat, lng}` — the shape a browser's geolocation hands
 * back — and the server stores it as [lng, lat]. The website never handles the
 * pair and so cannot reverse it.
 */
export const addAddress = body => apiClient.post(BASE, body).then(res => ({
  address: res.data || null,
  addresses: res.addresses || [],
}));

/** A partial edit: an absent key means "leave it alone", `location: null` clears the pin. */
export const updateAddress = (addressId, body) => apiClient.patch(path(addressId), body).then(res => ({
  address: res.data || null,
  addresses: res.addresses || [],
}));

export const removeAddress = addressId => apiClient.delete(path(addressId))
  .then(res => res.addresses || []);

/* Its own route rather than a field on the edit: choosing a default is one
   click in a list, and routing it through PATCH would send a whole address
   body — a chance to overwrite a field this screen never loaded. */
export const setDefaultAddress = addressId => apiClient.post(`${path(addressId)}/default`)
  .then(res => res.addresses || []);

export default {
  fetchAddressBook, addAddress, updateAddress, removeAddress, setDefaultAddress,
};
