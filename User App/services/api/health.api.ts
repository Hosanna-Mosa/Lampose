import { api } from './client';
import { endpoints } from './endpoints';
import type { BackendHealth } from './types';

/**
 * Is the backend up, and is it connected to the database?
 *
 * Worth having as its own call because the two failures look identical from
 * a screen that only ever asks for listings: an empty feed is what you get
 * both when the API is unreachable and when it is running fine against a
 * dropped Mongo connection. This endpoint tells them apart, and it is the
 * first thing to run when the app appears to have no data.
 *
 * The envelope is different here — health answers a flat object rather than
 * `{ success, data }`, because it is also what uptime probes read.
 */
export function fetchHealth(signal?: AbortSignal): Promise<BackendHealth> {
  return api.get<BackendHealth>(endpoints.health, {
    signal,
    /* A health check that takes eight seconds has answered the question. */
    timeoutMs: 8000,
    retries: 0,
  });
}
