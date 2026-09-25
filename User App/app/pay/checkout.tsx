import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Spinner, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { API_BASE_URL } from '@/services/api/config';
import { useTheme } from '@/context/ThemeContext';

/**
 * The return link the checkout page redirects to when it is done. The server
 * adds `?paid=1|0`; `+native-intent.tsx` stops the router from treating it as
 * a route, because this screen is the one that decides where to go next.
 */
const PAYMENT_RETURN_URL = 'lampose://payment-done';

/**
 * Razorpay checkout, in the browser.
 *
 * The page is rendered by the backend and loads Razorpay's own `checkout.js`.
 * It is opened with `WebBrowser.openAuthSessionAsync`: Chrome Custom Tabs on
 * Android, `ASWebAuthenticationSession` on iOS. The student pays there, with
 * the browser's own cookies, 3-D Secure pages and UPI app hand-offs, and the
 * server verifies the signature and then redirects to `lampose://payment-done`,
 * which closes the browser and brings them back here.
 *
 * This screen never sees a payment id or a signature. Closing the browser is
 * not evidence either way, so on return it leaves, and the screen it goes to
 * re-reads the payment from the SERVER.
 */
export default function PaymentCheckout() {
  const { mode, colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * Two flows land here, told apart by which id arrives.
   *
   *   requestId   an assisted visit or hotel stay (`/visit-requests/:id/payment/checkout`)
   *   foodToken   a food order (`/food-partners/checkout?t=…`)
   *
   * The food link carries a short-lived TOKEN rather than an order number,
   * because the browser sends no Authorization header, so the link itself has
   * to be the proof.
   */
  const { requestId, foodToken, orderNumber, returnTo } = useLocalSearchParams<{
    requestId?: string;
    foodToken?: string;
    orderNumber?: string;
    returnTo?: string;
  }>();

  const [failed, setFailed] = useState(false);
  /* Bumped by "Try again" to open the browser once more. */
  const [attempt, setAttempt] = useState(0);
  /* Guards the navigation away, so it happens once. */
  const done = useRef(false);

  const leave = useCallback(() => {
    if (done.current) return;
    done.current = true;

    /*
      A food order gets REPLACED onto its tracking screen rather than popped.
      The screen underneath is the payment screen, whose cart is now an order
      that already exists; going back there would offer to place it again. The
      tracking screen re-reads the order from the server on open.
    */
    if (foodToken && orderNumber) {
      router.replace(`/food/order/${encodeURIComponent(String(orderNumber))}` as never);
      return;
    }

    /* Back rather than replace: underneath is the request being paid for, and
       it re-checks the payment with the server when it regains focus. */
    if (router.canGoBack()) router.back();
    else router.replace((returnTo as never) ?? ('/home' as never));
  }, [router, returnTo, foodToken, orderNumber]);

  /* Built here rather than passed in, so this screen can only ever open our
     own API with our own redirect. */
  const url = foodToken
    ? `${API_BASE_URL}/api/v2/food-partners/checkout` +
      `?t=${encodeURIComponent(String(foodToken))}` +
      `&redirect=${encodeURIComponent(PAYMENT_RETURN_URL)}`
    : requestId
      ? `${API_BASE_URL}/api/v2/visit-requests/${encodeURIComponent(String(requestId))}` +
        `/payment/checkout?redirect=${encodeURIComponent(PAYMENT_RETURN_URL)}`
      : null;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    (async () => {
      try {
        /* Resolves when the server redirects to the return link (success), or
           when the student closes the browser (cancel/dismiss). Either way the
           server is the one that knows whether it was paid. */
        await WebBrowser.openAuthSessionAsync(url, PAYMENT_RETURN_URL);
        if (!cancelled) leave();
      } catch {
        /* No browser could be opened at all. Nothing has been charged. */
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, attempt, leave]);

  const heading = foodToken ? 'Pay for your order' : 'Pay for your visit';

  if (!url) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title={heading} onBack={leave} />

      <View style={[styles.centre, { padding: layout.gutter, gap: space[3] }]}>
        {failed ? (
          <>
            <Text variant="title2" style={styles.centred}>
              The payment page did not open
            </Text>
            <Text variant="bodyLg" color="secondary" style={styles.centred}>
              Nothing has been charged. Check your connection and try again.
            </Text>
            <View style={{ gap: space[2], alignSelf: 'stretch' }}>
              <Button
                label="Try again"
                onPress={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              />
              <Button label="Go back" variant="secondary" onPress={leave} />
            </View>
          </>
        ) : (
          <>
            <Spinner />
            <Text variant="title2" style={styles.centred}>
              Complete your payment in the browser
            </Text>
            <Text variant="bodyLg" color="secondary" style={styles.centred}>
              Razorpay has opened in your browser. You will come back here as soon as the
              payment is done.
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centred: { textAlign: 'center' },
});
