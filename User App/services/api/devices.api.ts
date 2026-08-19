import { api, apiRequest } from './client';
import { endpoints } from './endpoints';
import { logInfo } from '@/lib/log';

/**
 * Telling the backend where to reach this handset.
 *
 * ## Why it runs on every sign-in rather than once
 *
 * An Expo push token identifies an app INSTALLATION, not a person. It is
 * reissued on reinstall, can be rotated by the OS, and is revoked when the app
 * is removed. Registering once and trusting it forever is how somebody stops
 * receiving notifications months later with nothing in the logs to say why.
 *
 * The backend upserts by token, so calling this on every launch is free.
 *
 * ## And why it runs on sign-out
 *
 * A shared handset. Without `unregisterDevice`, the next person to sign in
 * still has the previous account's alerts arriving on the lock screen — their
 * property name, their student's name — which is a privacy leak rather than a
 * cosmetic bug.
 *
 * Both calls swallow their own failures. Notifications are an enhancement to
 * the flow, not a precondition for it: an app that refused to sign somebody in
 * because a device could not be registered would be trading the whole product
 * for one of its features.
 */

export type DevicePlatform = 'ios' | 'android' | 'web';

export async function registerDevice(
  token: string,
  platform: DevicePlatform,
): Promise<boolean> {
  try {
    await api.post(endpoints.devices, { token, platform });
    return true;
  } catch (error) {
    logInfo('[push] could not register this device:', (error as Error).message);
    return false;
  }
}

/**
 * Forget this handset.
 *
 * Called BEFORE the session token is cleared — the endpoint is behind a
 * session, so doing it afterwards would be an unauthenticated call that
 * silently does nothing and leaves the device registered.
 */
export async function unregisterDevice(token: string): Promise<boolean> {
  try {
    /* `api.delete` deliberately takes no body — DELETE-with-a-body is unusual
       enough that the shared client does not offer it, and widening that
       helper for one call would make an odd shape look ordinary everywhere.
       The token has to be in the body rather than the path because a push
       token contains characters that do not survive a URL segment cleanly. */
    await apiRequest(endpoints.devices, { method: 'DELETE', body: { token } });
    return true;
  } catch (error) {
    logInfo('[push] could not remove this device:', (error as Error).message);
    return false;
  }
}
