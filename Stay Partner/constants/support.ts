/**
 * How an owner reaches Lampose support from outside the app's own Help screen.
 *
 * The in-app support desk sits behind sign-in, and a paused owner is refused
 * at every sign-in door — so the login screen and the "Account paused" alert
 * need a way out that does not need a session. Email is the one real contact
 * the platform publishes: the public site's Contact page writes to it, and the
 * backend's account-deletion policy returns it as `supportEmail` (its
 * `SUPPORT_EMAIL` default). There is no published support phone or WhatsApp
 * number, so none is offered here.
 */

import { Linking } from 'react-native';

export const SUPPORT_EMAIL = 'contact@lampose.com';

/**
 * Opens the mail app on a message to support. Resolves false when nothing
 * could take it, so the caller can show the address instead.
 *
 * `canOpenURL` is a hint, not a gate: without a `<queries>` /
 * `LSApplicationQueriesSchemes` entry for `mailto` it answers false on phones
 * that DO have a mail app. So the open is always tried, and only its
 * rejection counts as no mail app.
 */
export async function openSupportEmail(subject = 'Stay Partner — help signing in'): Promise<boolean> {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
