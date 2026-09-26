import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { BillBreakdown, FoodEmptyState, FoodNotice, type BillLine } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { useFood } from '@/context/FoodContext';
import { useTheme } from '@/context/ThemeContext';
import { formatRupees } from '@/utils/money';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { useAuth } from '@/context/AuthContext';

type Method = { id: string; label: string; detail: string; disabled?: boolean };

/**
 * One online method, not four.
 *
 * The gateway's own sheet is what actually lists GPay, PhonePe, a UPI ID, cards
 * and netbanking — and it lists the ones this handset can really use, which is
 * something this screen cannot know. Offering a chooser here and then opening a
 * second chooser is two decisions for one payment, and the first one is a
 * guess: "GPay · installed on this phone" was never checked against the phone.
 */
const ONLINE: readonly Method[] = [
  { id: 'online', label: 'UPI, card or netbanking', detail: 'Pay securely through Razorpay' },
];

/**
 * Paying.
 *
 * UPI first and by app, because that is how this audience actually pays and a
 * card form is four minutes of typing they will abandon. Cash is offered for
 * pickup only — a rider carrying change to a hostel gate at midnight is a
 * different product with a different risk.
 *
 * The CTA carries the amount. "Continue" on a screen that is about to move ₹122
 * is how people come to feel tricked, and this is a student's food budget.
 */
export default function PaymentScreen() {
  const { findKitchen } = useFoodCatalogue();
  const { colors, space, layout, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();
  /* Nothing on a handset that reports a real inset; the shortfall on one
     that reports none, so the action clears the navigation bar. */
  const actionInset = useBottomEdgeInset();
  const router = useRouter();
  const { requireSignIn } = useAuth();
  const {
    kitchenId,
    count,
    itemTotal,
    deliveryFee,
    packagingCharge,
    gst,
    gstRate,
    platformFee,
    toPay,
    address,
    placeOrder,
    startPayment,
  } = useFood();

  const [method, setMethod] = useState<string>('online');

  /* Every order needs somewhere to go. This used to be scoped to the mode,
     because a collection order has no address to want — collection is no
     longer offered. */
  const needsAddress = !address;
  const [state, setState] = useState<'idle' | 'paying' | 'failed'>('idle');
  const [error, setError] = useState<string | null>(null);

  const kitchen = kitchenId ? findKitchen(kitchenId) : undefined;

  if (!kitchen || count === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Payment" onBack={() => router.back()} />
        <FoodEmptyState
          title="There is nothing to pay for"
          body="The cart emptied while you were here. Nothing was charged."
          primaryLabel="Back to food"
          onPrimary={() => router.replace('/home')}
        />
      </View>
    );
  }

  /* Cash is offered for delivery as well as pickup, because the backend
     supports it and the rider's app tells them what to collect. What the
     restaurant will actually accept is the restaurant's decision, and the
     server refuses with `COD_UNAVAILABLE` in its own words if this kitchen
     does not take it — which is better than hiding the option and leaving a
     student with no way to pay at all when the gateway is down. */
  const others: readonly Method[] = [
    {
      id: 'cash',
      label: 'Cash on delivery',
      detail: 'Pay the rider at your door',
    },
  ];

  /*
    The same terms the cart printed, from the same source, because this
    is the screen where the number stops being a preview: the button under it
    moves money. Items, GST, the platform fee and delivery are what
    `foodCustomerOrder.controller.js` adds into `grandTotal`, and there is
    nothing else in it — no coupon, which is why the discount line that used to
    sit here is gone. The tax IS real now and comes from the kitchen shape; the
    invented 5% row that once stood here did not.
  */
  const bill: BillLine[] = [
    { id: 'items', label: `Item total · ${count} ${count === 1 ? 'item' : 'items'}`, amount: itemTotal },
    ...(packagingCharge ? [{ id: 'packaging', label: 'Packaging by the kitchen', amount: packagingCharge }] : []),
    ...(gst ? [{ id: 'gst', label: `GST${gstRate ? ` (${gstRate}%)` : ''}`, amount: gst }] : []),
    ...(platformFee ? [{ id: 'platform', label: 'Platform fee', amount: platformFee }] : []),
    { id: 'delivery', label: address ? `Delivery to ${address.title}` : 'Delivery', amount: deliveryFee },
  ];

  /*
   * The order is created by the SERVER, which prices it from the menu rows.
   * What happens next depends on how it is being paid for, and the server says
   * which — `nextStep` — rather than this screen inferring it:
   *
   *   cod     the kitchen is rung and a rider is sent for immediately. The
   *           student lands on the tracking screen.
   *   online  the order is HELD. Nobody is told and nobody is sent until a
   *           verified signature says the money arrived. The student lands on
   *           Razorpay's checkout, rendered by the backend inside the app's own
   *           WebView — see `app/pay/checkout.tsx`, which the visit flow
   *           already uses for the same reason.
   *
   * That ordering is the whole point. A kitchen that started cooking on an
   * unpaid order would be cooking on a promise, and the student who backed out
   * of the UPI screen is not coming back.
   *
   * A refusal is shown in the SERVER'S words. It knows things this screen
   * cannot — a dish sold out while the cart sat open, the kitchen closed at
   * 11pm, the order under the minimum — and paraphrasing them into "something
   * went wrong" throws away the one sentence that tells a student what to do.
   */
  const pay = async () => {
    setState('paying');
    setError(null);
    try {
      const isCash = method === 'cash';
      const { order, nextStep } = await placeOrder(new Date(), isCash ? 'cod' : 'online');

      if (nextStep === 'track') {
        router.replace(foodHref.order(order.id, true));
        return;
      }

      /* The order exists and is held. Opening the gateway is a second request,
         and a failure HERE is not a failed order — it is an order waiting to be
         paid for, which the tracking screen can resume. So the student is sent
         there either way and told what happened. */
      const intent = await startPayment(order.id);
      if (!intent.checkoutToken) {
        setError('Online payment is not available right now. Please choose cash instead.');
        setState('failed');
        return;
      }
      router.replace({
        pathname: '/pay/checkout',
        params: { foodToken: intent.checkoutToken, orderNumber: order.id },
      });
    } catch (err) {
      setError((err as Error)?.message || 'We could not reach the kitchen. Please try again.');
      setState('failed');
    }
  };

  /*
   * A guest reaches this screen for free — the pickup path never asked for an
   * account, unlike delivery's own address screen, which already gates on
   * sign-in. Placing the order is where it actually matters: `placeOrder`
   * hits an authenticated endpoint, and the cart itself (`FoodContext`)
   * outlives the trip through sign-in, so the same tap resumes here once
   * they are signed in rather than losing the order they built.
   */
  const attemptPay = () => requireSignIn(() => { void pay(); });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Payment"
        subtitle={`${kitchen.name} · delivery`}
        onBack={() => router.back()}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8] * 2, gap: space[4] }}
      >
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Pay now
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {ONLINE.map((entry, index) => (
              <MethodRow
                key={entry.id}
                method={entry}
                selected={method === entry.id}
                onSelect={() => setMethod(entry.id)}
                last={index === ONLINE.length - 1}
              />
            ))}
          </View>
        </View>

        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Other ways
          </Text>
          <View
            style={[
              styles.group,
              { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, paddingHorizontal: space[3] },
            ]}
          >
            {others.map((entry, index) => (
              <MethodRow
                key={entry.id}
                method={entry}
                selected={method === entry.id}
                onSelect={() => setMethod(entry.id)}
                last={index === others.length - 1}
              />
            ))}
          </View>
        </View>

        <BillBreakdown
          lines={bill}
          total={toPay}
          totalLabel="To pay"
          /* Only ever set in the one case where this total is knowingly
             incomplete — the kitchen's packing charge has not reached the
             device — because the alternative is a confident figure that the
             order will exceed by an amount nobody was shown. */
          footnote={
            packagingCharge === null
              ? 'This kitchen has not sent its packing charge yet, so the total is not final. The kitchen prices the order when you place it.'
              : undefined
          }
        />

        <FoodNotice
          tone="good"
          title="We never see your UPI PIN"
          body="Approving happens inside your bank's app. The kitchen starts as soon as the payment clears."
        />

        {/*
          ── The refusal, in the SERVER'S words ─────────────────────────────

          This used to be one hardcoded sentence — "Your bank declined the
          request", under a warning that money may have left the account —
          shown for every failure there is. A kitchen that closed at 11pm, a
          dish that sold out while the cart sat open, an order under the
          minimum and a delivery with no address all landed on it, and the one
          sentence that said what to do about any of them was thrown away
          without ever reaching a screen.

          There is also no bank in this. Nothing on this screen moves money:
          placing the order writes a row, and opening the payment mints a
          checkout link. The debit itself happens inside the gateway's own
          page, on `app/pay/checkout`, which owns what to say when a payment
          really does fail — and which replaces this screen rather than
          returning to it. So a failure HERE is always a failure before any
          money was asked for, and it says so instead of hinting at a
          disappearing ₹122 that has not moved.
        */}
        {state === 'failed' && error ? (
          <FoodNotice
            tone="problem"
            title="We could not do that"
            body={`${error} Nothing has been charged and your cart is untouched.`}
          />
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6] + actionInset,
            gap: space[2],
          },
        ]}
      >
        <View style={styles.footerLine}>
          <Text variant="caption" color="tertiary" style={{ flex: 1 }} numberOfLines={1}>
            {count} {count === 1 ? 'item' : 'items'} · delivery
          </Text>
          <Text variant="priceLg">{formatRupees(toPay)}</Text>
        </View>

        {/*
          The CTA carries the amount AND says which of the two things it does.
          "Pay ₹122" over a cash order is a lie the student finds out about at
          the door, and "Place the order" over an online one hides that a
          checkout is about to open.
        */}
        {/*
          THE GATE. A delivery with no address cannot be placed, and this is the
          last screen that can say so: after this the order is written and a
          rider is sent for it. Reachable only via the address picker in the
          normal flow, so
          this is a backstop rather than the primary ask: a deep link, a
          restored navigation state, or an address deleted in another tab all
          land here with nothing chosen.

          Disabled AND explained. This app never leaves a dead control without a
          sentence — an unexplained grey button is the one somebody taps four
          times before giving up.
        */}
        <Button
          label={
            method === 'cash'
              ? `Place the order · pay ${formatRupees(toPay)} on delivery`
              : `Pay ${formatRupees(toPay)}`
          }
          loading={state === 'paying'}
          loadingLabel={method === 'cash' ? 'Sending to the kitchen' : 'Opening your payment'}
          fullWidth
          disabled={needsAddress}
          onPress={pay}
        />

        {/* The dead state leads back to the address picker, because that is
            what fixes it. */}
        {needsAddress ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(foodHref.address)}
            style={{ paddingVertical: space[1] }}
          >
            <Text variant="caption" style={{ color: colors.brand, textAlign: 'center' }}>
              Choose a delivery address first
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function MethodRow({
  method,
  selected,
  onSelect,
  last,
}: {
  method: Method;
  selected: boolean;
  onSelect: () => void;
  last: boolean;
}) {
  const { colors, space } = useTheme();

  return (
    <Pressable
      onPress={method.disabled ? undefined : onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: !!method.disabled }}
      accessibilityLabel={`${method.label}. ${method.detail}`}
      style={[
        styles.methodRow,
        {
          paddingVertical: space[3],
          gap: space[3],
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.borderSubtle,
          opacity: method.disabled ? 0.55 : 1,
        },
      ]}
    >
      {/* The circle is drawn here rather than reusing the primitive, because the
          primitive puts the label on its own row and a payment method needs two
          lines — the method, and the account it will actually move money from. */}
      <View
        style={[
          styles.radio,
          {
            borderColor: selected ? colors.brand : colors.borderInput,
            borderWidth: selected ? 6 : 1.5,
          },
        ]}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="title3" numberOfLines={1}>
          {method.label}
        </Text>
        <Text variant="caption" color="tertiary" numberOfLines={1} style={{ marginTop: 2 }}>
          {method.detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: StyleSheet.hairlineWidth },
  methodRow: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 20, height: 20, borderRadius: 999 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  footerLine: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
});
