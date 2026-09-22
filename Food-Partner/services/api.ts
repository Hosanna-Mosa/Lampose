/*
 * services/api.ts — the one fetch wrapper every network call in this app goes
 * through.
 *
 * Ported from `driver/utils/api.ts`, which has already survived a production
 * app, with two additions this app needs:
 *
 *   1. X-Client / X-Client-Version on every request. A React Native app sends
 *      no Origin header, so in the backend console its calls are otherwise
 *      indistinguishable from curl. `requestLogger` (and the food-partner
 *      module's own logger) read exactly these two headers to name a caller,
 *      so setting them here — once, for every request — is what makes this
 *      app visible on the server while it is being built.
 *
 *   2. `isOffline()`. With EXPO_PUBLIC_API_URL unset there is no server to talk
 *      to, and `services/foodPartner.ts` switches to a simulated backend rather
 *      than throwing. This is the single switch that decides it; see the header
 *      of that file for what the simulation covers and why it exists.
 *
 * The wrapper itself never simulates anything. It is the honest network path:
 * if it is called with no API_URL configured, that is a caller that forgot to
 * check `isOffline()`, and it says so rather than inventing an answer.
 */

import Constants from "expo-constants";
import { demoRespond, isDemoActive } from "./demoMode";

/** Base URL for the Lampose backend, without a trailing slash. */
export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? "",
).replace(/\/+$/, "");

/**
 * True when no backend is configured, which is the app's offline test mode.
 *
 * A function rather than a constant so a call site reads as a question about
 * the current run, and so the check is impossible to accidentally freeze into
 * a module-level value captured before `extra.apiUrl` resolves.
 */
export const isOffline = () => !API_URL;

/** How this app names itself to the server's request log. */
const CLIENT_NAME = "food-partner";
const CLIENT_VERSION = String(Constants.expoConfig?.version ?? "1.0.0");

/**
 * Told when ANY call comes back refused because the restaurant was rejected.
 *
 * `requireFoodPartner` answers 403 `ACCOUNT_REJECTED` on every route behind a
 * session the moment `verificationStatus` is `rejected` — not just `/me`. A
 * screen that swallowed that as a generic error banner would leave a rejected
 * partner staring at an otherwise-empty dashboard with no idea why nothing on
 * it works, when `/status` is the screen already built to explain it. Reported
 * once, centrally, the same way `client.ts` in the User App reports a dead
 * session — so no screen has to recognise this code for itself.
 */
let onAccountRejected: ((verificationNote: string) => void) | null = null;

export function setAccountRejectedHandler(handler: ((verificationNote: string) => void) | null): void {
  onAccountRejected = handler;
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
  /*
   * DEMO MODE — before the API-URL check and before any fetch, because in
   * demo mode none of that should happen.
   *
   * Off unless somebody signed in with the demo credentials this launch, so a
   * real partner's session never touches it. `/auth/login` is the exception:
   * it is inspected even while off, since it is the call that turns demo mode
   * on — and only the exact demo pair is claimed, so a genuine restaurant
   * signing in on this build reaches the real route untouched.
   *
   * See `services/demoMode.ts`; delete it when the demo build is done with.
   */
  const demo = demoRespond(method, path, body);
  if (demo.handled) return demo.payload as T;

  if (!API_URL) {
    throw new ApiError("API URL is not configured. Set EXPO_PUBLIC_API_URL.", 0);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });

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
      const shape = payload as {
        message?: string; error?: string; code?: string;
        data?: { verificationStatus?: string; verificationNote?: string };
      } | null;
      const message = shape?.message ?? shape?.error ?? `Request failed (${res.status})`;

      if (res.status === 403 && shape?.code === "ACCOUNT_REJECTED") {
        onAccountRejected?.(shape.data?.verificationNote ?? "");
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

/**
 * A multipart POST, for the image upload route.
 *
 * Deliberately separate from `api()` rather than a flag on it: `api()` sets
 * `Content-Type: application/json` and JSON-stringifies the body, and both are
 * wrong here. Note what is NOT set below — the Content-Type header. React
 * Native fills it in from the FormData, boundary included, and setting it by
 * hand produces a body the server cannot parse because the boundary will not
 * match. That is the classic multipart-in-RN bug and it fails as a 400 with no
 * obvious cause, so it is worth the comment.
 */
export async function apiUpload<T = unknown>(
  path: string,
  form: FormData,
  { token, timeoutMs = 60000 }: { token?: string | null; timeoutMs?: number } = {},
): Promise<T> {
  /* An upload in demo mode is accepted and dropped — there is nowhere to put
     it, and a screen that waits forever on a file read as a broken app. */
  if (isDemoActive()) {
    return { success: true, data: null } as T;
  }

  if (!API_URL) {
    throw new ApiError("API URL is not configured. Set EXPO_PUBLIC_API_URL.", 0);
  }

  const controller = new AbortController();
  /* Longer than the JSON default: this is a photograph off a phone camera on
     a mobile connection, and 15 seconds fails a perfectly good upload. */
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Client": CLIENT_NAME,
        "X-Client-Version": CLIENT_VERSION,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
      signal: controller.signal,
    });

    const text = await res.text();
    const payload = text ? safeParse(text) : null;

    if (!res.ok) {
      const message =
        (payload as { message?: string } | null)?.message ?? `Upload failed (${res.status})`;
      throw new ApiError(message, res.status, payload);
    }

    return payload as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new ApiError("The upload timed out. Check your connection and try again.", 0);
    }
    throw new ApiError((err as Error)?.message || "The upload failed", 0);
  } finally {
    clearTimeout(timer);
  }
}
