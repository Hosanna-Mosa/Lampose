import React, { useEffect } from "react";
import { Pitch } from "@/components/index";
import { usePartnerStore } from "@/store/partnerStore";
import { router } from "expo-router";

export default function IndexScreen() {
  const session = usePartnerStore((s) => s.session);
  const hydrated = usePartnerStore((s) => s.hydrated);
  const status = usePartnerStore((s) => s.status);

  useEffect(() => {
    if (!hydrated || !session?.token) return;
    /* The cached status, not a blind trip to the dashboard — see `SignIn.tsx`,
       which makes exactly this choice the moment it signs somebody in. A
       relaunch with a cached "approved" that has since been withdrawn is
       still caught: the account-rejected handler in `app/_layout.tsx` fires
       the moment `/(dash)`'s own `getMe()` runs and corrects it from there. */
    router.replace(status === "approved" ? "/(dash)" : "/status");
  }, [hydrated, session, status]);

  /*
   * A signed-in session is handled above, before anyone sees this screen at
   * all — the effect fires on the first render and replaces this route
   * before the next paint. What renders here is everyone else: a brand-new
   * visitor, someone mid-application who never finished, or someone who
   * applied and hasn't set a password yet — none of whom `hydrated &&
   * session?.token` is true for. `SignIn` used to be this screen and could
   * not tell any of those three apart, or offer a way into onboarding at
   * all; `Pitch` is what this app already built to do exactly that (see its
   * own header comment) and had simply never been wired to this route.
   */
  return <Pitch />;
}
