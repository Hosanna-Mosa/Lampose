import Constants from "expo-constants";

/** Base URL for the Driver backend, without a trailing slash. */
export const API_URL = String(
  process.env.EXPO_PUBLIC_API_URL ?? Constants.expoConfig?.extra?.apiUrl ?? "",
).replace(/\/+$/, "");

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
      const message =
        (payload as { message?: string; error?: string } | null)?.message ??
        (payload as { error?: string } | null)?.error ??
        `Request failed (${res.status})`;
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
