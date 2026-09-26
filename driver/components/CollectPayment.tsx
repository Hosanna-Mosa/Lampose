import { Image } from "expo-image";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Btn, Icon, Notice, Text } from "@/components/ui";
import type { IconName } from "@/components/ui";
import type { CollectionMethod, DoorCollection } from "@/store/driverStore";
import { colors, radius, space } from "@/theme";

/**
 * Collecting a cash-on-delivery order at the door: cash, or UPI on a QR.
 *
 * The rider picks how the diner is paying. Cash is a tick — "I have the money
 * in my hand" — because only the rider can say so. UPI is a Razorpay QR the
 * diner scans; it turns to "Paid" on its own when Razorpay tells the server,
 * and the rider never has to judge a payment screen held up on somebody
 * else's phone.
 *
 * The parent owns the choice and the tick, because the Delivered button reads
 * them. This component owns only the QR's own coming and going.
 */

/** How often to ask whether the QR has been paid while it is on screen. The
    socket normally answers first; this is the floor under it. */
const POLL_MS = 3000;

export type CollectState = {
  method: CollectionMethod | null;
  cashConfirmed: boolean;
};

/** Whether "Delivered" may be pressed, and what to send with it. */
export const collectReady = (
  state: CollectState,
  paidByUpi: boolean,
): { ready: boolean; send?: CollectionMethod } => {
  if (paidByUpi) return { ready: true, send: "upi" };
  if (state.method === "cash" && state.cashConfirmed) return { ready: true, send: "cash" };
  return { ready: false };
};

export function CollectPayment({
  amount,
  paid,
  collection,
  state,
  onChange,
  openUpiQr,
  checkCollection,
}: {
  /** The order total in rupees. */
  amount: number;
  /** True once the order is paid, whichever way. */
  paid: boolean;
  collection: DoorCollection | null | undefined;
  state: CollectState;
  onChange: (next: CollectState) => void;
  openUpiQr: () => Promise<void>;
  checkCollection: () => Promise<void>;
}) {
  const paidByUpi = paid && collection?.method === "upi_qr";
  const qr = collection?.qr ?? null;

  const [loadingQr, setLoadingQr] = useState(false);
  const [qrError, setQrError] = useState("");
  const now = useNow(state.method === "upi" && !!qr && !paid);

  const expiresAt = qr ? new Date(qr.expiresAt).getTime() : 0;
  const secondsLeft = qr ? Math.max(0, Math.round((expiresAt - now) / 1000)) : 0;
  const expired = !!qr && secondsLeft === 0;

  /* The poll, while a live QR is on screen and nothing has been paid. */
  useEffect(() => {
    if (state.method !== "upi" || !qr || paid || expired) return;
    const timer = setInterval(() => {
      checkCollection().catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [state.method, qr, paid, expired, checkCollection]);

  const showQr = async () => {
    setQrError("");
    setLoadingQr(true);
    try {
      await openUpiQr();
    } catch (err) {
      const payload = (err as { payload?: { message?: string } } | null)?.payload;
      setQrError(payload?.message || (err as Error)?.message || "We could not make a QR just now.");
    } finally {
      setLoadingQr(false);
    }
  };

  const choose = (method: CollectionMethod) => {
    if (method === state.method) return;
    onChange({ method, cashConfirmed: false });
    /* Asked for the moment UPI is chosen: a diner holding their phone up
       should not wait on a second tap. An open QR comes back as it is. */
    if (method === "upi" && !qr) showQr();
  };

  // ── Paid on the QR: nothing left to decide ──────────────────────────────
  if (paidByUpi) {
    return (
      <View style={[styles.card, styles.paidCard]}>
        <View style={styles.row}>
          <View style={styles.paidMark}>
            <Icon name="check" size={18} color={colors.success.on} />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="title1">Paid by UPI</Text>
            <Text variant="caption" color="secondary">
              ₹{amount} received. Do not take cash — enter the PIN and deliver.
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text variant="eyebrow" color="tertiary">
        Collect payment
      </Text>
      <Text variant="display1" style={{ marginTop: space[1] }}>
        ₹{amount}
      </Text>
      <Text variant="caption" color="secondary" style={{ marginTop: space[1] }}>
        Ask the customer how they want to pay.
      </Text>

      <View style={[styles.row, { marginTop: space[3] }]}>
        <Option label="Cash" glyph="rupee" active={state.method === "cash"} onPress={() => choose("cash")} />
        <Option label="UPI" glyph="phone" active={state.method === "upi"} onPress={() => choose("upi")} />
      </View>

      {state.method === "cash" && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state.cashConfirmed }}
          onPress={() => onChange({ ...state, cashConfirmed: !state.cashConfirmed })}
          style={[styles.row, styles.tick]}
        >
          <View style={[styles.box, state.cashConfirmed && styles.boxOn]}>
            {state.cashConfirmed && <Icon name="check" size={16} color={colors.success.on} />}
          </View>
          <Text variant="body" style={{ flex: 1 }}>
            I have received ₹{amount} in cash
          </Text>
        </Pressable>
      )}

      {state.method === "upi" && (
        <View style={styles.qrWrap}>
          {loadingQr && (
            <View style={styles.qrPlaceholder}>
              <ActivityIndicator color={colors.brand} />
              <Text variant="caption" color="secondary" style={{ marginTop: space[2] }}>
                Making the QR…
              </Text>
            </View>
          )}

          {!loadingQr && !!qrError && (
            <>
              <Notice tone="danger" title="No QR" body={qrError} />
              <Btn label="Try again" variant="ghost" onPress={showQr} style={{ marginTop: space[2] }} />
            </>
          )}

          {!loadingQr && !qrError && qr && !expired && (
            <>
              <Image
                source={{ uri: qr.imageUrl }}
                style={styles.qr}
                contentFit="contain"
                accessibilityLabel={`UPI QR code for ₹${amount}`}
              />
              <View style={[styles.row, { justifyContent: "center", marginTop: space[2] }]}>
                <ActivityIndicator size="small" color={colors.brand} />
                <Text variant="caption" color="secondary">
                  Waiting for payment · {formatClock(secondsLeft)}
                </Text>
              </View>
              <Text variant="caption" color="tertiary" style={{ textAlign: "center", marginTop: space[1] }}>
                Ask the customer to scan with any UPI app. This turns to Paid by itself.
              </Text>
            </>
          )}

          {!loadingQr && !qrError && (expired || !qr) && (
            <>
              <Notice
                tone="warning"
                title={expired ? "This QR has expired" : "No QR yet"}
                body="Show a new one for the customer to scan."
              />
              <Btn label="Show new QR" variant="ghost" onPress={showQr} style={{ marginTop: space[2] }} />
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Option({
  label,
  glyph,
  active,
  onPress,
}: {
  label: string;
  glyph: IconName;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.option, active && styles.optionOn]}
    >
      <Icon name={glyph} size={18} color={active ? colors.brandInk : colors.textSecondary} />
      <Text variant="title3" color={active ? "primary" : "secondary"}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Ticks once a second while `on` — for the QR's countdown. */
function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  return now;
}

const formatClock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
  paidCard: {
    backgroundColor: colors.success.tint,
    borderColor: colors.success.border,
  },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  paidMark: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.success.base,
    alignItems: "center",
    justifyContent: "center",
  },
  option: {
    flex: 1,
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
  },
  optionOn: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTint,
  },
  tick: {
    marginTop: space[3],
    paddingVertical: space[2],
    gap: space[3],
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderInput,
    alignItems: "center",
    justifyContent: "center",
  },
  boxOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  qrWrap: { marginTop: space[3] },
  qr: {
    width: "100%",
    aspectRatio: 0.72,
    borderRadius: radius.button,
    backgroundColor: "#FFFFFF",
  },
  qrPlaceholder: {
    height: 220,
    alignItems: "center",
    justifyContent: "center",
  },
});
