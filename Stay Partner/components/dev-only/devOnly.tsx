import { Redirect } from 'expo-router';
import React from 'react';

/**
 * A design or fixture screen, for developers only.
 *
 * Every file under `app/` is a deep link, so these shipped to owners: a
 * seasonal-pricing editor with no server behind it, a settings stub, the
 * design-system sheet and a standalone splash. In a release build the link
 * goes home instead.
 */
export function devOnly<P extends object>(Screen: React.ComponentType<P>) {
  function DevOnly(props: P) {
    if (!__DEV__) return <Redirect href="/" />;
    return <Screen {...props} />;
  }
  DevOnly.displayName = `devOnly(${Screen.displayName || Screen.name || 'Screen'})`;
  return DevOnly;
}
