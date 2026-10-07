import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import { Btn, Icon, Notice, Sheet, type SheetSpec } from "@/components/ui";
import {
  checkRepayment,
  paiseToRupees,
  requestWithdrawal,
  startRepayment,
  walletErrorText,
  type WalletStatement,
} from "@/services/wallet";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { radius, space } from "@/theme";

/** From this share of the cash limit, the rider is warned it is coming. */
const WARN_AT = 0.8;

/** After the UPI page closes: how often, and how many times, to ask. */
const CHECK_EVERY_MS = 2500;
const CHECK_TIMES = 8;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The two balances, and the two things a rider can do about them.
 *
 *   Wallet       what Lampose owes the rider — earnings from orders paid
 *                online or by UPI at the door. "Withdraw" asks for it.
 *   Outstanding  what the rider owes Lampose — cash taken at doors, less the
 *                earning they kept out of it. "Pay" opens a UPI payment.
 *
 * Every figure is the server's; this only draws them. After a UPI payment the
 * server is asked whether it came through — the rider's word is never what
 * clears the balance.
 */
export function WalletPanel({
  wallet,
  onChange,
}: {
  wallet: WalletStatement;
  onChange: (next: WalletStatement) => void;
}) {
  const token = useDriverStore((s) => s.token);
  const say = useFlowStore((s) => s.say);
  const [paying, setPaying] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const owes = wallet.outstandingPaise;
  const share = wallet.codLimitPaise > 0 ? owes / wallet.codLimitPaise : 0;
  const open = (wallet.withdrawals ?? []).find((w) => w.status === "requested");
  const lastRefused = (wallet.withdrawals ?? [])[0]?.status === "rejected" ? wallet.withdrawals![0] : null;
  const canWithdraw = !open && owes === 0 && wallet.walletPaise >= wallet.minWithdrawalPaise;

  const pay = async () => {
    if (!token || paying) return;
    setPaying(true);
    try {
      const repayment = await startRepayment(token);
      await WebBrowser.openBrowserAsync(repayment.linkUrl);
      /* Back from the UPI page. Ask the server — it asks Razorpay. */
      for (let i = 0; i < CHECK_TIMES; i += 1) {
        const { repayment: now, wallet: next } = await checkRepayment(token, repayment.repaymentId);
        if (now.status === "paid") {
          onChange({ ...wallet, ...next });
          say(`${paiseToRupees(now.paidPaise)} received. Thank you!`);
          return;
        }
        await wait(CHECK_EVERY_MS);
      }
      say("We have not seen the payment yet. If you paid, it will show here in a few minutes.");
    } catch (err) {
      say(walletErrorText(err, "We could not start the payment. Try again."));
    } finally {
      setPaying(false);
    }
  };

  const withdraw = async () => {
    setConfirm(false);
    if (!token || withdrawing) return;
    setWithdrawing(true);
    try {
      const { withdrawal, wallet: next } = await requestWithdrawal(token);
      onChange({ ...wallet, ...next, withdrawals: [withdrawal, ...(wallet.withdrawals ?? [])] });
      say(`Withdrawal of ${paiseToRupees(withdrawal.amountPaise)} requested.`);
    } catch (err) {
      say(walletErrorText(err, "We could not request the withdrawal. Try again."));
    } finally {
      setWithdrawing(false);
    }
  };

  const confirmSpec: SheetSpec = {
    kicker: "Withdraw",
    tone: "brand",
    title: `Withdraw ${paiseToRupees(wallet.walletPaise)}?`,
    body:
      "Lampose sends it to the bank account or UPI id in your Bank details, and you will see it marked paid here.",
    primary: `Withdraw ${paiseToRupees(wallet.walletPaise)}`,
    secondary: "Not now",
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.cards}>
        <View style={[styles.card, styles.walletCard]}>
          <View style={styles.cardHead}>
            <Icon name="earnings" size={15} color="#047857" />
            <RNText style={styles.cardLabel}>Wallet</RNText>
          </View>
          <RNText style={styles.amount}>{paiseToRupees(wallet.walletPaise)}</RNText>
          <RNText style={styles.cardHint}>Lampose owes you</RNText>
        </View>

        <View style={[styles.card, wallet.codBlocked ? styles.blockedCard : owes > 0 ? styles.owedCard : styles.clearCard]}>
          <View style={styles.cardHead}>
            <Icon name="rupee" size={15} color={wallet.codBlocked ? "#b91c1c" : "#b45309"} />
            <RNText style={styles.cardLabel}>Outstanding</RNText>
          </View>
          <RNText style={[styles.amount, owes > 0 && { color: wallet.codBlocked ? "#b91c1c" : "#92400e" }]}>
            {paiseToRupees(owes)}
          </RNText>
          <RNText style={styles.cardHint}>You owe Lampose</RNText>
          {wallet.codLimitPaise > 0 && (
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(100, Math.round(share * 100))}%`,
                    backgroundColor: wallet.codBlocked ? "#dc2626" : share >= WARN_AT ? "#f59e0b" : "#10b981",
                  },
                ]}
              />
            </View>
          )}
        </View>
      </View>

      {wallet.codBlocked ? (
        <Notice
          tone="danger"
          glyph="alert"
          title="Cash orders are paused"
          body={`You owe ${paiseToRupees(owes)}. Pay it below to get cash orders again — online orders still come to you.`}
        />
      ) : share >= WARN_AT ? (
        <Notice
          tone="warning"
          glyph="alert"
          title={`Cash orders stop at ${paiseToRupees(wallet.codLimitPaise)}`}
          body={`You owe ${paiseToRupees(owes)}. Pay some of it now to keep getting cash orders.`}
        />
      ) : null}

      {open && (
        <Notice
          tone="info"
          glyph="bank"
          title={`${paiseToRupees(open.amountPaise)} withdrawal on its way`}
          body={`Requested ${new Date(open.requestedAt).toLocaleDateString()}. Lampose will mark it paid here once it is sent.`}
        />
      )}
      {!open && lastRefused && (
        <Notice
          tone="warning"
          glyph="alert"
          title="Your last withdrawal was not paid"
          body={`${lastRefused.rejectionReason} The money is back in your wallet.`}
        />
      )}

      <View style={styles.actions}>
        {owes > 0 && (
          <Btn
            label={paying ? "Waiting for payment…" : `Pay ${paiseToRupees(owes)} by UPI`}
            glyph="rupee"
            loading={paying}
            onPress={pay}
            style={styles.action}
          />
        )}
        {owes === 0 && (
          <Btn
            label="Withdraw"
            glyph="bank"
            variant={canWithdraw ? "ink" : "ghost"}
            disabled={!canWithdraw}
            loading={withdrawing}
            onPress={() => setConfirm(true)}
            style={styles.action}
          />
        )}
      </View>
      {owes === 0 && !open && wallet.walletPaise > 0 && wallet.walletPaise < wallet.minWithdrawalPaise && (
        <RNText style={styles.small}>You can withdraw once your wallet reaches {paiseToRupees(wallet.minWithdrawalPaise)}.</RNText>
      )}

      <Pressable onPress={() => router.push("/wallet")} style={styles.historyLink} hitSlop={8}>
        <RNText style={styles.historyText}>See wallet history</RNText>
        <Icon name="chevronRight" size={16} color="#059669" />
      </Pressable>

      <Sheet spec={confirmSpec} visible={confirm} onPrimary={withdraw} onDismiss={() => setConfirm(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[3] },
  cards: { flexDirection: "row", gap: space[2] },
  card: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  walletCard: { backgroundColor: "#ecfdf5", borderColor: "#a7f3d0" },
  clearCard: { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
  owedCard: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  blockedCard: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardLabel: { fontSize: 12, fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 },
  amount: { fontSize: 24, fontWeight: "900", color: "#064e3b", marginTop: 6 },
  cardHint: { fontSize: 11.5, color: "#6b7280", marginTop: 2 },
  track: {
    height: 6,
    backgroundColor: "#e5e7eb",
    borderRadius: radius.pill,
    marginTop: 10,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: radius.pill },
  actions: { flexDirection: "row", gap: space[2] },
  action: { flex: 1 },
  small: { fontSize: 12, color: "#6b7280", textAlign: "center" },
  historyLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 4 },
  historyText: { fontSize: 13.5, fontWeight: "700", color: "#059669" },
});
