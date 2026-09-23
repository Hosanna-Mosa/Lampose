import Constants from "expo-constants";

/** Base URL for the Driver backend, without a trailing slash. */
export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? "",
).replace(/\/+$/, "");

/**
 * Told when a call carrying a bearer token comes back 401 for one of the
 * reasons that mean the TOKEN is dead rather than the request being wrong —
 * expired, malformed, the account gone, or issued for a different session
 * type. Reported once, centrally, so no screen has to recognise these codes
 * for itself; `driverStore.ts`'s `refreshProfile` has its own narrower
 * handling for the SAME codes on cold start (see the comment there for how
 * the two are kept from fighting over the logout).
 *
 * Guarded on `token` being present in the request that failed — a 401 from
 * `/auth/login-otp` (wrong code) or `/auth/send-otp` carries no bearer at
 * all, and is not this.
 *
 * Exported so `driverStore.ts` can recognise the same set of codes rather
 * than keeping a second copy that could drift from this one.
 */
export const SESSION_DEAD_CODES = new Set([
  "TOKEN_EXPIRED", "BAD_TOKEN", "ACCOUNT_GONE", "WRONG_TOKEN_TYPE", "SESSION_REVOKED",
]);
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  /** Abort the request after this many ms. Defaults to 15s. */
  timeoutMs?: number;
};

/**
 * Thin JSON fetch wrapper. Throws `ApiError` on a non-2xx response so callers
 * can branch on `status` instead of re-parsing the body everywhere.
 */
export async function api<T = unknown>(
  path: string,
  { method = "GET", body, token, signal, timeoutMs = 15000 }: RequestOptions = {},
): Promise<T> {
  if (!API_URL) {
    throw new ApiError("API URL is not configured. Set EXPO_PUBLIC_API_URL.", 0);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await res.text();
    const payload = text ? safeParse(text) : null;

    if (!res.ok) {
      const shape = payload as { message?: string; error?: string; code?: string } | null;
      const message = shape?.message ?? shape?.error ?? `Request failed (${res.status})`;

      if (token && res.status === 401 && shape?.code && SESSION_DEAD_CODES.has(shape.code)) {
        onSessionExpired?.();
      }

      throw new ApiError(message, res.status, payload);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new ApiError("The request timed out. Check your connection.", 0);
    }
    throw new ApiError((err as Error)?.message || "Network request failed", 0);
  } finally {
    clearTimeout(timer);
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}
