/*
 * The duty switch and the heartbeat it turns on.
 * `/api/v2/sales/me/duty`, `/api/v2/sales/me/location`. See
 * `Backend/src/modules/sales/sales.controller.js` for why these are two
 * routes rather than one — the shapes here must not drift from it.
 */
import { api } from "./api";
import type { SalesRep } from "./auth";

const BASE = "/api/v2/sales";

type DutyResponse = { success: true; data: { salesRep: SalesRep } };

/** Turning ON requires a starting fix; turning OFF does not. */
export async function setDuty(token: string, onDuty: boolean, coords?: { lat: number; lng: number }) {
  const res = await api<DutyResponse>(`${BASE}/me/duty`, {
    method: "PATCH",
    token,
    body: onDuty ? { onDuty: true, lat: coords?.lat, lng: coords?.lng } : { onDuty: false },
  });
  return res.data.salesRep;
}

/** Refused by the server with a 409 while off duty — see the controller. */
export async function sendLocation(token: string, lat: number, lng: number) {
  await api(`${BASE}/me/location`, {
    method: "PATCH",
    token,
    body: { lat, lng },
  });
}
