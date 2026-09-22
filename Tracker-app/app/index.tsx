/* Route file. The screen itself lives in components/auth/ — this file
   exists to BE the route, and with file-based routing its path is its
   route, so it never moves and never gets renamed.

   No redirect effect here on purpose — `app/_layout.tsx`'s
   `Stack.Protected guard={!signedIn}` is what keeps this screen reachable
   only while signed out, and swaps to "home" the moment a session exists.
   See that file's own comment on why a `router.replace` here used to throw. */
import React from "react";
import { AuthScreen } from "@/components/auth/AuthScreen";

export default function IndexScreen() {
  return <AuthScreen />;
}
