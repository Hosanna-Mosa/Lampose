import React, { useEffect } from "react";
import { SignIn } from "@/components/signin";
import { usePartnerStore } from "@/store/partnerStore";
import { router } from "expo-router";

export default function IndexScreen() {
  const session = usePartnerStore((s) => s.session);
  const hydrated = usePartnerStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && session?.token) {
      router.replace("/(dash)");
    }
  }, [hydrated, session]);

  return <SignIn />;
}
