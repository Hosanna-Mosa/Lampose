/* Route file. The screen itself lives in components/home/ — this file
   exists to BE the route, and with file-based routing its path is its
   route, so it never moves and never gets renamed.

   No redirect effect and no session guard here on purpose — this screen is
   only ever reachable while `app/_layout.tsx`'s `Stack.Protected
   guard={signedIn}` is active, which is also what swaps back to "index" the
   instant `session` goes null (signing out, or the session-expired flow). */
import React from "react";
import { ToggleScreen } from "@/components/home/ToggleScreen";

export default function HomeScreen() {
  return <ToggleScreen />;
}
