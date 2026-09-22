/*
 * services/api.ts — the one fetch wrapper every network call in this app
 * goes through. Ported from `Food-Partner/services/api.ts`, trimmed to what
 * this app actually needs: no demo mode, no offline simulation — a tool
 * handed to a sales rep talks to a real server or says clearly that it
 * cannot.
 */
import Constants from "expo-constants";

/** Base URL for the Lampose backend, without a trailing slash. */
export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? "",
).replace(/\/+$/, "");

export const isOffline = () => !API_URL;

const CLIENT_NAME = "tracker";
const CLIENT_VERSION = String(Constants.expoConfig?.version ?? "1.0.0");

/**
 * Told when a call carrying a bearer token comes back 401 for a reason that
 * means the TOKEN is dead — expired, malformed, the account gone, or issued
 * for a different session type — rather than the request being wrong.
 * Reported once, centrally, matching the same pattern every other Lampose
 * app in this monorepo uses (see `Food-Partner/services/api.ts`), so no
 * screen has to recognise these codes for itself.
 */
const SESSION_DEAD_CODES = new Set([
  "TOKEN_EXPIRED", "BAD_TOKEN", "ACCOUNT_GONE", "WRONG_TOKEN_TYPE", "SESSION_REVOKED",
]);
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  payload: unknown;

  constructor(message: string, status: number, code?: string, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  token?: string | null;
  timeoutMs?: number;
};

/**
 * Thin JSON fetch wrapper. Throws `ApiError` on a non-2xx response so callers
 * can branch on `status`/`code` instead of re-parsing the body everywhere.
 */
export async function api<T = unknown>(
  path: string,
  { method = "GET", body, token, timeoutMs = 15000 }: RequestOptions = {},
): Promise<T> {
  if (!API_URL) {
    throw new ApiError("API URL is not configured. Set EXPO_PUBLIC_API_URL.", 0);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Client": CLIENT_NAME,
    "X-Client-Version": CLIENT_VERSION,
  };
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

      throw new ApiError(message, res.status, shape?.code, payload);
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
