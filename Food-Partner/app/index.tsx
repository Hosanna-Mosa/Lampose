import React, { useEffect } from "react";
import { SignIn } from "@/components/signin";
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

  return <SignIn />;
}
