import {
  API_BASE_URL,
  API_BASE_URL_CONFIGURED,
  API_BASE_URL_IS_LOOPBACK,
  API_CONFIG_HINT,
  API_GET_RETRIES,
  API_RETRY_DELAY_MS,
  API_TIMEOUT_MS,
  CLIENT_NAME,
  CLIENT_VERSION,
} from './config';
import { DEBUG_LOGS } from '@/constants/env';

/**
 * The one place in this app that calls `fetch`.
 *
 * Everything else — every screen, every hook, every resource module — goes
 * through `apiRequest`. That is not a style preference; five things can only be
 * done once if there is only one door:
 *
 *  1. **One base URL.** It comes from `EXPO_PUBLIC_API_URL` and nothing else,
 *     so the environment a build talks to is a reviewable fact rather than
 *     something scattered across call sites. See `config.ts`.
 *  2. **Errors mean something.** A 404 and a 503 from a disconnected database
 *     are different facts and screens branch on them. `ApiError` carries the
 *     status and the server's own `code`, so a caller never re-parses a body.
 *  3. **Nothing hangs forever.** A phone that walks into a lift keeps a socket
 *     open until the OS gives up. Every request carries its own deadline.
 *  4. **The two consoles pair up.** Each request generates an id, sends it as
 *     `X-Request-Id`, and prints it. The backend logs the same id on arrival
 *     and departure, so a call can be followed from handset to database by
 *     matching four characters.
 *  5. **Retries are safe.** Only network failures, and only on GET — this app
 *     moves money, and a repeated POST is a repeated payout.
 *
 * ## Why the envelope is not unwrapped here
 *
 * The backend answers `{ success, data }` on success and `{ success: false,
 * code, message }` on failure. `apiRequest` returns the whole envelope and the
 * resource modules unwrap it, because several endpoints carry siblings of
 * `data` that matter — `count` on the feed, `unread` on support — and a client
 * that reflexively returned `body.data` would throw those away.
 */

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got an answer at all. */
  readonly status: number;
  /**
   * The server's own machine-readable reason: `NOT_FOUND`, `DB_DISCONNECTED`,
   * `UNAUTHORIZED`, `RATE_LIMITED`. Screens branch on this, never on the
   * message text — the text is written for a person and will be rewritten.
   *
   * `API_NOT_CONFIGURED` is the one code this client authors itself.
   */
  readonly code: string | null;
  /** The parsed body, for fields specific to one endpoint. */
  readonly payload: unknown;
  /** Matches the id in the backend console. Worth putting in a bug report. */
  readonly requestId: string;
  /** True when nothing was reached: no signal, wrong host, server down. */
  readonly isNetwork: boolean;

  constructor(
    message: string,
    init: {
      status: number;
      code?: string | null;
      payload?: unknown;
      requestId: string;
      isNetwork?: boolean;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? null;
    this.payload = init.payload ?? null;
    this.requestId = init.requestId;
    this.isNetwork = init.isNetwork ?? false;
  }

  /**
   * A sentence to put on screen.
   *
   * The server writes these for the endpoints a person can trip, and those are
   * better than anything the client could invent. The fallbacks are for the
   * cases where the server never spoke.
   */
  get displayMessage(): string {
    if (this.code === 'API_NOT_CONFIGURED') {
      /* Deliberately not the developer hint. An owner reading this cannot set
         an environment variable; what they need is to know it is not their
         phone and not their fault. The hint goes to the console. */
      return 'This app has not been set up to reach Lampose. Please contact support.';
    }
    if (this.isNetwork) {
      return 'We could not reach Lampose. Check your connection and try again.';
    }
    if (this.status === 503) {
      return this.message || 'Lampose is up but not reachable right now. Please try again shortly.';
    }
    if (this.status >= 500) {
      return 'Something went wrong at our end. Please try again.';
    }
    return this.message || 'Something went wrong. Please try again.';
  }
}

/* ------------------------------------------------------------------ *
 * The session
 * ------------------------------------------------------------------ */

/**
 * The bearer token, held here so no caller has to remember to send it.
 *
 * A module-level variable rather than React state on purpose: `apiRequest` is
 * called from mutations, from React Query's cache and from effects that
 * outlive the component that started them, none of which can read a context.
 * The alternative was threading a token through every resource function, where
 * the failure mode is one call site that forgets and a screen that 401s for no
 * visible reason.
 *
 * Nothing sets this yet. The backend has no partner identity system — see the
 * note at the top of `endpoints.ts` — so there is no token to hold. The plumbing
 * is here because it is where a session belongs the moment one exists, and
 * because putting it in later means revisiting every call site.
 */
let authToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

/** The codes the backend's auth middleware answers 401 with. */
const SESSION_DEAD = new Set(['TOKEN_EXPIRED', 'BAD_TOKEN', 'ACCOUNT_GONE', 'WRONG_TOKEN_TYPE']);

/* ------------------------------------------------------------------ *
 * Request ids
 * ------------------------------------------------------------------ */

/* Four hex characters. Long enough that two calls in the same second do not
   collide, short enough to be matched by eye against the backend console —
   which is the only thing it is for. */
const newRequestId = () => Math.random().toString(16).slice(2, 6);

/* ------------------------------------------------------------------ *
 * The request
 * ------------------------------------------------------------------ */

export type QueryValue = string | number | boolean | null | undefined;

export type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serialised as JSON. Omitted entirely when undefined. */
  body?: unknown;
  /** Empty, null and undefined values are dropped rather than sent blank. */
  query?: Record<string, QueryValue>;
  /**
   * Overrides the stored session for this one call. An explicit `null` sends
   * no Authorization header at all, which is what auth endpoints themselves
   * want — proving a number while a dead token is still in memory should not
   * carry it.
   */
  token?: string | null;
  /** From react-query, so a screen that unmounts cancels its own request. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Overrides the default: 2 for GET, 0 for everything else. */
  retries?: number;
  headers?: Record<string, string>;
};

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  if (!parts.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${parts.join('&')}`;
}

function parse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    /* An HTML error page from a proxy, or a plain-text 502. Wrapped so the
       caller sees a body of the shape it expects rather than a parse error
       thrown from inside the client. */
    return { message: text.slice(0, 300) };
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * One HTTP call, with the base URL, timeout, headers, logging and error shape
 * applied.
 *
 * @returns the parsed response body — the whole `{ success, data, … }`
 * envelope, not just `data`. See the note at the top of the file.
 */
export async function apiRequest<T = unknown>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = 'GET',
    body,
    query,
    token,
    signal,
    timeoutMs = API_TIMEOUT_MS,
    retries = method === 'GET' ? API_GET_RETRIES : 0,
    headers: extraHeaders,
  } = options;

  const requestId = newRequestId();

  /*
   * No base URL, no request.
   *
   * Refused here rather than allowed to become a fetch of "/api/v2/listings"
   * with no origin, which on some platforms resolves against the bundler and
   * comes back as an HTML 404 — a failure that looks like a broken endpoint
   * rather than a missing variable, and that has cost people whole days.
   */
  if (!API_BASE_URL_CONFIGURED) {
    if (DEBUG_LOGS) console.warn(`📡 ✕ #${requestId} ${method} ${path} — ${API_CONFIG_HINT}`);
    throw new ApiError(API_CONFIG_HINT, {
      status: 0,
      code: 'API_NOT_CONFIGURED',
      requestId,
    });
  }

  const url = buildUrl(path, query);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    /* Identifies this app in the backend's request log. Without them every
       line from a phone reads as a bare IP address — see config.ts. */
    'X-Client': CLIENT_NAME,
    'X-Client-Version': CLIENT_VERSION,
    'X-Request-Id': requestId,
    ...extraHeaders,
  };

  /*
   * `FormData` goes through untouched.
   *
   * Everything else is JSON, but a multipart upload must not be: stringifying
   * a FormData yields "[object Object]", and setting the Content-Type by hand
   * omits the `boundary` that `fetch` generates — the server then cannot split
   * the parts and reports an empty body. So the header is deliberately left
   * unset here and `fetch` writes it.
   */
  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';

  /* An explicit `token: null` means "send none"; omitting the option entirely
     falls back to the stored session. `undefined` and `null` therefore mean
     different things here, which is unusual enough to say out loud. */
  const bearer = 'token' in options ? token : authToken;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const startedAt = Date.now();

    /* Two things can end this request: our own deadline, and the caller going
       away (react-query aborts on unmount). Both are funnelled into one
       controller so `fetch` only ever sees a single signal. */
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onCallerAbort = () => controller.abort();
    signal?.addEventListener('abort', onCallerAbort);

    if (DEBUG_LOGS) {
      console.log(`📡 → #${requestId} ${method} ${url}${body !== undefined ? ` ${preview(body)}` : ''}`);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : isMultipart ? (body as FormData) : JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = parse(await response.text());
      const ms = Date.now() - startedAt;

      if (!response.ok) {
        const shape = (payload ?? {}) as { message?: string; error?: string; code?: string };
        const message = shape.message || shape.error || `Request failed (${response.status})`;

        if (DEBUG_LOGS) {
          console.log(`📡 ← #${requestId} ${response.status} ${method} ${url} (${ms}ms) ${message}`);
        }

        /* A session the server no longer accepts is reported once, centrally.
           Only for a token we actually sent — a 401 from an endpoint called
           without one is that endpoint saying "sign in", not "your session
           died", and clearing state on it would sign out a browsing user. */
        if (response.status === 401 && bearer && SESSION_DEAD.has(String(shape.code))) {
          onSessionExpired?.();
        }

        throw new ApiError(message, {
          status: response.status,
          code: shape.code ?? null,
          payload,
          requestId,
        });
      }

      if (DEBUG_LOGS) {
        /* The response body, trimmed and redacted, on the same line as the
           status. Without it a 200 tells you the call worked and nothing about
           whether it returned the three properties you expected or an empty
           array — which is the actual question when a screen looks empty.
           `preview` is the same redactor used on request bodies, so a token in
           a sign-in reply never reaches a console that gets screen-shared. */
        console.log(
          `📡 ← #${requestId} ${response.status} ${method} ${url} (${ms}ms) ${preview(payload)}`,
        );
      }

      return payload as T;
    } catch (error) {
      /* A rejection the server authored is final — a 404 does not become a 200
         by asking again — so it is rethrown before the retry logic. */
      if (error instanceof ApiError) throw error;

      const aborted = (error as Error)?.name === 'AbortError';

      /* The caller cancelled: a screen unmounted, or react-query superseded
         this query. Not a failure, and not something to retry or report. */
      if (aborted && signal?.aborted) {
        throw new ApiError('Request cancelled', { status: 0, requestId, isNetwork: false });
      }

      const timedOut = aborted;
      const message = timedOut
        ? 'The request timed out.'
        : (error as Error)?.message || 'Network request failed';

      if (attempt < retries) {
        attempt += 1;
        if (DEBUG_LOGS) {
          console.log(`📡 ↻ #${requestId} ${method} ${url} — ${message} (retry ${attempt}/${retries})`);
        }
        /* Backs off linearly. A phone coming out of a tunnel recovers in a
           second or two, and hammering the socket in that window is what
           drains the battery rather than what fixes it. */
        await sleep(API_RETRY_DELAY_MS * attempt);
        continue;
      }

      if (DEBUG_LOGS) {
        console.log(`📡 ✕ #${requestId} ${method} ${url} — ${message}`);
        /*
         * The one diagnosis worth spelling out at the moment it happens.
         *
         * A loopback base URL and a backend that is genuinely down produce the
         * identical "Network request failed", and telling them apart has cost
         * this project an evening already. If the URL is the device's own
         * loopback, that is almost certainly the answer — say so here rather
         * than leaving it to be rediscovered.
         */
        if (API_BASE_URL_IS_LOOPBACK) {
          console.warn(
            `📡    ↳ ${API_BASE_URL} is the DEVICE, not your computer. Use the machine's LAN address in Stay Partner/.env and restart the bundler.`,
          );
        }
      }

      throw new ApiError(message, { status: 0, requestId, isNetwork: true });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }
}

/** A short, safe rendering of a request body for the dev console. */
function preview(body: unknown): string {
  /* A FormData holds file buffers; serialising one would dump megabytes of
     binary into the console and tell nobody anything. */
  if (typeof FormData !== 'undefined' && body instanceof FormData) return '<multipart>';
  try {
    const json = JSON.stringify(body, (key, value) =>
      /pass(word)?|token|secret|otp|account|ifsc|upi/i.test(key) ? '***' : value,
    );
    return json.length > 200 ? `${json.slice(0, 200)}…` : json;
  } catch {
    return '<unserialisable>';
  }
}

/* ------------------------------------------------------------------ *
 * Envelope
 * ------------------------------------------------------------------ */

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  /** Present on list endpoints. */
  count?: number;
  message?: string;
  code?: string;
};

/**
 * Pulls `data` out, and refuses an envelope that says it failed with a 200.
 *
 * That combination should not happen and does not in this backend, but a proxy
 * or a captive portal answering 200 with its own JSON is a real thing on
 * public wifi, and it must not be handed to a screen as a booking.
 */
export function unwrap<T>(envelope: ApiEnvelope<T>, requestId = '—'): T {
  if (!envelope || typeof envelope !== 'object') {
    throw new ApiError('The server sent something we could not read.', {
      status: 0,
      requestId,
    });
  }
  if (envelope.success === false) {
    throw new ApiError(envelope.message || 'The request was refused.', {
      status: 0,
      code: envelope.code ?? null,
      payload: envelope,
      requestId,
    });
  }
  return envelope.data;
}

export const api = {
  baseUrl: API_BASE_URL,

  get: <T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options: Omit<ApiRequestOptions, 'method'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options: Omit<ApiRequestOptions, 'method' | 'body'> = {}) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

export default api;
