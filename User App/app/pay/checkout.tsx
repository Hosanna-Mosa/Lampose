import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Button, Spinner, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { API_BASE_URL } from '@/services/api/config';
import { useTheme } from '@/context/ThemeContext';

/**
 * Razorpay checkout, inside the app.
 *
 * ## Why this screen exists
 *
 * This used to be `WebBrowser.openAuthSessionAsync`, which hands the URL to
 * Chrome Custom Tabs on Android and `ASWebAuthenticationSession` on iOS. Both
 * are meant to be in-app, and on a handset with no Custom Tabs provider
 * installed the Android one quietly falls back to launching the BROWSER APP —
 * the student watches Lampose disappear and a browser open on their payment.
 * Paying is the least reassuring moment in the product to leave the app.
 *
 * A `WebView` cannot fall back to anywhere. The checkout is rendered by this
 * screen, inside this navigator, under the app's own header.
 *
 * ## What is still the server's job
 *
 * Everything that matters. The page loaded here is rendered by the backend and
 * loads Razorpay's own `checkout.js`; on success it POSTs to the server, which
 * verifies the HMAC where the secret lives and only then bounces to a
 * `lampose://` deep link. This screen never sees a payment id or a signature —
 * it shows a page and watches for the bounce.
 */
export default function PaymentCheckout() {
  const { colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { requestId, returnTo } = useLocalSearchParams<{
    requestId?: string;
    returnTo?: string;
  }>();

  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /* Guards the pop. The bounce can fire on both `onShouldStartLoadWithRequest`
     and `onNavigationStateChange` for one redirect, and popping twice takes
     the student a screen further back than they came from. */
  const done = useRef(false);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;
    /* Back rather than replace: the screen underneath is the request the
       student is paying for, and it is the screen they expect to land on. It
       re-checks the payment with the SERVER when it regains focus — closing
       this view is not evidence of anything either way. */
    if (router.canGoBack()) router.back();
    else router.replace((returnTo as never) ?? ('/home' as never));
  }, [router, returnTo]);

  /**
   * Which URLs this view is allowed to load.
   *
   * Three cases, and the third is the one that makes UPI work at all:
   *
   *   `lampose://`   the server is handing control back. Never loaded — the
   *                  WebView cannot render it, and it is the finish line.
   *   http/https     the checkout itself. Loaded here.
   *   anything else  `upi://`, `phonepe://`, `tez://`, `paytmmp://` — a UPI
   *                  intent. These are SUPPOSED to leave: the whole point is
   *                  to open the payment app. A WebView that tries to load
   *                  them shows a blank error page and the payment dies, so
   *                  they are handed to the OS and the student comes back here
   *                  when their bank app is done.
   */
  const allow = useCallback(
    (request: { url: string }) => {
      const url = request.url || '';

      if (url.startsWith('lampose://')) {
        leave();
        return false;
      }

      if (/^https?:/i.test(url) || url === 'about:blank') return true;

      Linking.openURL(url).catch(() => {
        /* No app installed for that scheme. Staying put is right — the
           checkout is still on screen and another method can be picked. */
      });
      return false;
    },
    [leave],
  );

  /* Android does not always consult `onShouldStartLoadWithRequest` for a
     scheme redirect, so the bounce is watched for here as well. `done` makes
     the duplicate harmless. */
  const onNavigate = useCallback(
    (nav: WebViewNavigation) => {
      if ((nav.url || '').startsWith('lampose://')) leave();
    },
    [leave],
  );

  if (!requestId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style="auto" />
        <StandardHeader title="Payment" onBack={leave} />
        <View style={[styles.centre, { padding: layout.gutter, gap: space[3] }]}>
          <Text variant="title2" style={styles.centred}>
            Nothing to pay for
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            This payment link is missing its request. Go back and try again from your booking.
          </Text>
          <Button label="Go back" onPress={leave} />
        </View>
      </View>
    );
  }

  /* Built here rather than passed in, so a URL this screen loads can only ever
     point at our own API with our own redirect. `API_BASE_URL` rather than the
     raw env value: it is the same resolved origin every other call uses, with
     the dev fallback to the Metro host — the raw value is undefined in
     development, and `undefined/api/v2/…` was this screen's one way to break
     while the rest of the app worked. */
  const back = 'lampose://payment-done';
  const source = {
    uri:
      `${API_BASE_URL}/api/v2/visit-requests/${encodeURIComponent(String(requestId))}` +
      `/payment/checkout?redirect=${encodeURIComponent(back)}`,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style="auto" />
      {/*
        A real header with a way out.

        A payment page with no visible exit is the one screen people force-quit
        the app to escape, and a force-quit during checkout is how a paid token
        goes unrecorded on the device. Leaving is safe: the server is the
        authority on whether this was paid.
      */}
      <StandardHeader title="Pay for your visit" onBack={leave} />

      {failed ? (
        <View style={[styles.centre, { padding: layout.gutter, gap: space[3] }]}>
          <Text variant="title2" style={styles.centred}>
            The payment page did not load
          </Text>
          <Text variant="bodyLg" color="secondary" style={styles.centred}>
            Nothing has been charged. Check your connection and try again.
          </Text>
          <View style={{ gap: space[2] }}>
            <Button
              label="Try again"
              onPress={() => {
                setFailed(false);
                setLoading(true);
              }}
            />
            <Button label="Go back" variant="secondary" onPress={leave} />
          </View>
        </View>
      ) : (
        <View style={styles.flex}>
          <WebView
            source={source}
            /* Razorpay's checkout is a script that writes a modal, and it keeps
               state in storage between steps. Both of these are required for it
               to run at all. */
            javaScriptEnabled
            domStorageEnabled
            /* The checkout opens its own overlay in a new context on some
               methods; without this the tap does nothing. */
            setSupportMultipleWindows={false}
            javaScriptCanOpenWindowsAutomatically
            originWhitelist={['*']}
            /*
             * Cookies, and why a payment works in a browser and fails here.
             *
             * A card or netbanking payment is not one page — it is a bounce
             * between Razorpay, the bank's 3-D Secure page and back, and the
             * session that ties those together lives in a cookie set by a
             * domain that is not the one in the address bar. A browser keeps
             * those. An Android WebView blocks third-party cookies by default,
             * and an iOS one keeps its own jar separate from Safari's — so the
             * bank hands back a result that Razorpay no longer recognises, and
             * the student sees "payment could not be completed" for a card
             * that is perfectly good.
             *
             * This is the single most likely reason an in-app checkout behaves
             * differently from the same URL in a browser.
             */
            thirdPartyCookiesEnabled
            sharedCookiesEnabled
            /*
             * Some bank 3-D Secure pages still pull a subresource over http.
             * A browser handles that on its own terms; a WebView's default is
             * stricter and silently drops it, so the page never finishes
             * loading and the payment dies with no error.
             *
             * `compatibility`, not `always`. `always` permits any mixed content
             * on any page, which is not a thing to switch on for a checkout —
             * this mode is documented as behaving the way a modern browser
             * does, which is exactly the behaviour being matched here.
             */
            mixedContentMode="compatibility"
            /*
             * A real mobile-browser user agent.
             *
             * Gateways and banks branch on this, and the default WebView string
             * is what several of them use to decide a device cannot handle a
             * method — which is how UPI quietly disappears from the list. This
             * is not spoofing anything about the payment; it is telling them
             * the truth, that this is a Chrome-based mobile browser view.
             */
            userAgent="Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            onShouldStartLoadWithRequest={allow}
            onNavigationStateChange={onNavigate}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setFailed(true);
            }}
            onHttpError={({ nativeEvent }) => {
              /* A 4xx/5xx from our own checkout route is a real failure. The
                 page the server renders for "not confirmed yet" is a 409 and
                 says so in words, so it is left on screen rather than replaced
                 by this screen's generic message. */
              if (nativeEvent.statusCode >= 500) {
                setLoading(false);
                setFailed(true);
              }
            }}
            style={{ backgroundColor: colors.bg }}
          />

          {loading ? (
            <View
              style={[
                StyleSheet.absoluteFillObject,
                styles.centre,
                { backgroundColor: colors.bg, gap: space[3] },
              ]}
              pointerEvents="none"
            >
              <Spinner />
              <Text variant="bodyLg" color="secondary">
                Opening the payment window…
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
