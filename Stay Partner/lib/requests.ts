/**
 * Aadhar formatting — shared by every screen that collects or displays one:
 * Add Customer, the manual customer record, and (previously) the fixture
 * Requests screens.
 *
 * This file used to also hold `REQUESTS`, an in-memory array of five invented
 * guests with invented Aadhar numbers, plus `acceptRequest`/`declineRequest`/
 * `saveKyc` fixture mutations and an "Accept booking" price model. The real
 * requests screens (`app/requests/index.tsx`, `app/requests/[id].tsx`) now
 * read `GET /partners/requests` — real `VisitRequest` data — instead, and
 * `app/requests/add-customer.tsx` has saved to the real `createBooking` API
 * for a while. Nothing reads the fixture anymore, so it's gone rather than
 * left as dead code that looks like a second source of truth.
 */

export const AADHAR_LENGTH = 12;

/** "1234 5678 9012" — grouped in 4s, the way an Aadhar card itself prints it. */
export function formatAadhar(digits: string): string {
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}
