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
    /* The same branch `SignIn.tsx` takes at the moment of login — `status` is
       persisted (see `partialize` in `partnerStore.ts`), so it is already
       known on a cold start, before any network call. A rejected restaurant
       relaunching the app must land on `/status` (the screen built to explain
       it), not `/(dash)`, where `requireFoodPartner` 403s every `/me`-family
       call with `ACCOUNT_REJECTED` and nothing there recognised that code —
       see `DashHome.tsx`'s `load()` for the other half of this fix, which
       catches a status that went stale WHILE the app was open. */
    router.replace(status === "rejected" ? "/status" : "/(dash)");
  }, [hydrated, session, status]);

  return <SignIn />;
}
