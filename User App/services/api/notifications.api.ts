import { api, unwrap, type ApiEnvelope } from './client';
import { endpoints } from './endpoints';
import type { BackendNotification } from './types';

/**
 * The alerts inbox.
 *
 * Server-derived from the signed-in customer's visit requests — see
 * `notification.controller.js` for why there is no notifications collection,
 * and what that costs.
 *
 * The response carries its own unread tally rather than leaving the client to
 * count. The count and the list have to agree, and a client that derived one
 * from the other would be recomputing it on every screen that shows the badge.
 */

export type NotificationsResult = {
  notifications: BackendNotification[];
  unread: number;
};

export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationsResult> {
  const envelope = await api.get<ApiEnvelope<BackendNotification[]> & { unread?: number }>(
    endpoints.customerNotifications,
    { signal },
  );
  const data = unwrap(envelope);
  const notifications = Array.isArray(data) ? data : [];

  return {
    notifications,
    unread: envelope.unread ?? notifications.filter((n) => n.unread).length,
  };
}

/**
 * Moves the read watermark to now.
 *
 * Everything older becomes read; anything that arrives while the request is
 * in flight stays unread, because the server stamps `now` rather than the
 * newest alert it can see. That is deliberate — an owner confirming a bed one
 * second before this button is pressed must not be the alert that gets
 * silently cleared.
 */
export async function markNotificationsRead(signal?: AbortSignal): Promise<void> {
  await api.post(endpoints.customerNotificationsRead, undefined, { signal });
}
