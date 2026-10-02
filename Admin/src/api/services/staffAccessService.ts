/* ══════════════════════════════════════════════════════════════════════════
   Lampose staff sign-ins to restaurant accounts — read-only.

   Reads `/v1/admin/food-staff-access` (Super Admin and Admin). Each session is
   one use of the staff password, with every change and every blocked attempt
   made while it was open. Rows are written by the backend's `staffAccess.js`;
   nothing here can create or remove one.
   ══════════════════════════════════════════════════════════════════════════ */
import { api } from '../apiCaller';
import type { ApiResponse } from '../types';

const BASE = '/v1/admin/food-staff-access';

export interface StaffAccessEvent {
  kind: 'change' | 'blocked';
  at: string;
  method: string;
  path: string;
  /** A sentence: "Edited dish FPI-…", "Order 123 → accepted". */
  action: string;
  /** What was sent, with passwords, bank numbers and images removed. */
  changes: unknown;
  statusCode: number | null;
  ok: boolean;
}

export interface StaffAccessSession {
  sessionId: string;
  restaurantId: string;
  restaurantName: string;
  surface: 'app' | 'console';
  identifier: string;
  ip: string;
  userAgent: string;
  at: string;
  changeCount: number;
  blockedCount: number;
  events: StaffAccessEvent[];
}

export interface StaffAccessLog {
  /** False when FOOD_STAFF_PASSWORD_HASH is not set on the server. */
  enabled: boolean;
  sessions: StaffAccessSession[];
}

export const staffAccessService = {
  async list(params: { q?: string; limit?: number } = {}): Promise<ApiResponse<StaffAccessLog>> {
    const res = await api.get<{ data: StaffAccessLog }>(BASE, params);
    return res.success
      ? { ...res, data: res.data?.data ?? { enabled: false, sessions: [] } }
      : { ...res, data: { enabled: false, sessions: [] } };
  },
};
