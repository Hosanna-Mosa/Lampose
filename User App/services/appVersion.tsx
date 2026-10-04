/**
 * The forced-update check.
 *
 * Asks the server for the oldest build it still serves
 * (`GET /api/v2/app-version?app=user`) and, when this build is older, sends
 * the app to the update screen — which has no way past it. The screen
 * existed with nothing ever routing to it.
 *
 * Silent on every failure: no network, an older server without the route, or
 * no minimum configured all leave the app running. A check that could lock
 * people out over a flaky connection would be far worse than none.
 */
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { API_BASE_URL } from '@/services/api/config';

/** Where "Update" sends them — from the server, else the Play listing. */
let storeUrl: string | null = null;
export const updateStoreUrl = (): string =>
  storeUrl || 'https://play.google.com/store/apps/details?id=com.lampose.users.com';

/** `1.4.10` vs `1.4.9`, numerically, part by part. Negative when a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Renders nothing; mounted once at the root. */
export function ForcedUpdateWatcher() {
  const router = useRouter();

  useEffect(() => {
    const current = Constants.expoConfig?.version;
    if (!API_BASE_URL || !current) return undefined;
    let live = true;
    fetch(`${API_BASE_URL}/api/v2/app-version?app=user`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: { minVersion?: string | null; storeUrl?: string | null } } | null) => {
        if (!live || !body?.data) return;
        storeUrl = body.data.storeUrl ?? null;
        const min = body.data.minVersion;
        if (min && compareVersions(current, min) < 0) router.replace('/update' as never);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [router]);

  return null;
}
