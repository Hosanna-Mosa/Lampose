/*
 * Sales rep account calls — the ONLY backend surface this app has today.
 * `/api/v2/sales/auth/login`, `/api/v2/sales/me`. There is no register call:
 * an account is created by an administrator in the Admin console, who hands
 * the rep the exact credentials they typed in there — see
 * `Backend/src/modules/sales/sales.controller.js`'s header. See
 * `Backend/src/modules/sales/` for the server side of every shape here; the
 * two must not drift.
 */
import { api } from "./api";

const BASE = "/api/v2/sales";

export type SalesRep = {
  id: string;
  name: string;
  email: string;
  status: "active" | "inactive";
  onDuty: boolean;
  dutyStartedAt: string | null;
  createdAt: string;
};

type AuthResponse = { success: true; data: { token: string; salesRep: SalesRep } };
type MeResponse = { success: true; data: { salesRep: SalesRep } };

export async function login(email: string, password: string) {
  const res = await api<AuthResponse>(`${BASE}/auth/login`, {
    method: "POST",
    body: { email, password },
  });
  return res.data;
}

export async function getMe(token: string) {
  const res = await api<MeResponse>(`${BASE}/me`, { token });
  return res.data.salesRep;
}
