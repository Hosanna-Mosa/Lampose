/* ══════════════════════════════════════════════════════════════════════════
   Where the money is sent. That question and no other.

   This screen is the surviving half of `app/payouts.tsx`, which was deleted
   whole in the last pass. The half that deserved to go was the fiction: a
   balance card reading "Available for payout ₹3,240", a ledger of four
   settlements with transaction ids, and a Withdraw button that opened a sheet,
   closed it, and said money had been sent without making a single request —
   there is no payout route, no ledger and no transfer anywhere in this
   product, so none of it could ever have been true.

   The half that should not have gone is this one. `PATCH /api/v2/drivers/me`
   accepts a `payout` object and has always accepted it — see
   `driver.controller.js`, which validates the IFSC against the RBI's shape,
   the UPI id against `name@bank`, and the account number as 9 to 18 digits —
   and `driver.model.js` stores it. Onboarding collects it once. Until this
   screen came back there was no second time: a rider who closed their bank
   account, or changed banks, had no way to say so from the app, and the next
   settlement would have gone to an account that no longer existed. That is a
   live feature with a working endpoint behind it, and losing it cost a rider
   their money rather than a screen full of invented numbers.

   ## The account number is write-only, and that is the server's decision

   `payout.bankAccountNumber` is `select: false` and is deleted by `toJSON`
   even if something selects it back, so `GET /me` returns `accountLast4` and
   never the number. This screen therefore CANNOT pre-fill that box and does
   not pretend to: what is on file is shown as `•••• 8841`, the box is empty
   every time it is opened, and an empty box is left alone rather than sent as
   an empty string — sending one would clear both the number and the last four
   and quietly detach the account from the rider.

   That write-only rule is also why this is the one form in the app with a
   confirmation box. Everywhere else a transposed digit can be found by
   re-reading the field afterwards; here the rider will never see those digits
   again, and the first sign of a wrong one is a settlement that lands in a
   stranger's account. The confirmation is checked here and sent nowhere.

   ## What is deliberately absent

   No balance, no withdrawal, no history of anything. This screen answers
   "where should my money be sent" and stops, and the sentence at the foot of
   it says so, because a screen called Bank details is exactly where a rider
   goes looking for a button that moves money.

   ## Validation belongs to the server, and is quoted from it

   The only rules checked here are the ones the screen can actually know: a
   box left blank, and the two account numbers not matching. The shape of an
   IFSC code, of a UPI id and of an account number are the server's, and its
   refusals are shown word for word — "That IFSC code does not look right. It
   is 11 characters, like HDFC0001432." was written for this screen, and a
   second copy of that regex here would be a copy that drifts.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Btn,
  ChoiceField,
  DataRow,
  Icon,
  Input,
  Notice,
  Text,
  Toast,
  TopBar,
  type Choice,
} from "@/components/ui";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore } from "@/store/driverStore";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space } from "@/theme";

type AccountType = "savings" | "current";

const ACCOUNT_TYPES: Choice<AccountType>[] = [
  { value: "savings", label: "Savings" },
  { value: "current", label: "Current" },
];

const TYPE_LABEL: Record<AccountType, string> = {
  savings: "Savings account",
  current: "Current account",
};

export default function BankDetailsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();

  const profile = useDriverStore((s) => s.profile);
  const updateProfile = useDriverStore((s) => s.updateProfile);

  const stored = profile?.payout;

  const [holder, setHolder] = useState(stored?.accountHolderName ?? "");
  const [bankName, setBankName] = useState(stored?.bankName ?? "");
  const [ifsc, setIfsc] = useState(stored?.ifscCode ?? "");
  const [upi, setUpi] = useState(stored?.upiId ?? "");
  const [accountType, setAccountType] = useState<AccountType | null>(
    stored?.accountType ?? null,
  );
  /* Both blank on every open, and neither is ever seeded from the account —
     see the header. `confirm` never leaves this file. */
  const [account, setAccount] = useState("");
  const [confirm, setConfirm] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /* Re-seed only the boxes the rider has not started typing in. A profile
     refresh landing mid-edit — the Profile tab re-reads the account on every
     open — must not overwrite a half-typed IFSC code. */
  useEffect(() => {
    if (!profile?.payout) return;
    const payout = profile.payout;
    setHolder((v) => v || payout.accountHolderName || "");
    setBankName((v) => v || payout.bankName || "");
    setIfsc((v) => v || payout.ifscCode || "");
    setUpi((v) => v || payout.upiId || "");
    setAccountType((v) => v || payout.accountType || null);
  }, [profile]);

  const typedAccount = account.replace(/\s/g, "");
  /* An account is "on file" when the server sent back a last four. It is the
     only evidence this app is given that a number exists at all. */
  const onFile = !!stored?.accountLast4;

  const dirty =
    holder.trim() !== (stored?.accountHolderName ?? "")
    || bankName.trim() !== (stored?.bankName ?? "")
    || ifsc.replace(/\s/g, "").toUpperCase() !== (stored?.ifscCode ?? "")
    || upi.trim().toLowerCase() !== (stored?.upiId ?? "")
    || (!!accountType && accountType !== (stored?.accountType ?? "savings"))
    || !!typedAccount;

  const save = async () => {
    /*
     * The three things this screen can know are wrong.
     *
     * The first two are the same rule sign-up applies, worded the same way, so
     * a rider who met it once is not told something different the second time.
     * The third exists only here, because only here is the number already gone
     * from view before the rider could check it.
     */
    const errors: Record<string, string> = {};
    const willHaveBank = !!typedAccount || onFile;

    if (!willHaveBank && !upi.trim()) {
      errors.account = "Add a bank account or a UPI id — either one is enough.";
    }
    if (willHaveBank) {
      if (!holder.trim()) errors.holder = "Whose account is it?";
      if (!ifsc.trim()) errors.ifsc = "The IFSC code is on your cheque book and passbook.";
    }
    if (typedAccount && confirm.replace(/\s/g, "") !== typedAccount) {
      errors.confirm = "The two account numbers are not the same. Check both.";
    }

    /*
     * Moving banks without re-typing the number.
     *
     * The IFSC code names the branch the money is sent to, and the account
     * number names the account inside it. They only mean anything together.
     * A rider who switches banks will naturally edit the bank name and the
     * IFSC — and the account box says "leave this empty to keep the account
     * above", which is true and, in this one case, is exactly the wrong thing
     * to do: it would send the NEW bank's branch code with the OLD bank's
     * account number. That pair usually bounces, and occasionally does not,
     * which is worse.
     *
     * So the rule is narrow on purpose. It only fires when a number is already
     * on file, none has been typed, and the branch has actually changed —
     * correcting a spelling in the account holder's name asks for nothing.
     */
    const ifscChanged = ifsc.replace(/\s/g, "").toUpperCase() !== (stored?.ifscCode ?? "");
    if (onFile && !typedAccount && ifscChanged) {
      errors.account =
        "You changed the IFSC code, so type the account number for the new branch. "
        + "The old number belongs to the old bank.";
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setError("");
    setSaving(true);
    try {
      await updateProfile({
        payout: {
          /*
           * Sent as they stand, empty included, because clearing a UPI id or a
           * bank name is a thing a rider is entitled to do and the server
           * treats an empty string as exactly that. The ONE exception is the
           * account number: an untouched box means "leave it alone", and
           * sending "" for it would wipe the stored number and the last four
           * with it. So it goes only when something was typed.
           */
          accountHolderName: holder.trim(),
          bankName: bankName.trim(),
          ifscCode: ifsc.replace(/\s/g, "").toUpperCase(),
          upiId: upi.trim(),
          ...(accountType ? { accountType } : null),
          ...(typedAccount ? { bankAccountNumber: typedAccount } : null),
        },
      });
      /* Emptied on success, not left sitting there: the number is saved, the
         card above now shows its last four, and a filled box on a screen that
         cannot read that box back is an invitation to save it twice. */
      setAccount("");
      setConfirm("");
      say("Bank details saved.");
    } catch (err) {
      setError(readError(err, "That did not save."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Bank details" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="caption" color="tertiary">
          Where Lampose sends what your deliveries have earned. Keep it current — a
          settlement sent to a closed account is a settlement you have to chase.
        </Text>

        {/* What the account actually holds, drawn from the SAVED values rather
            than from the boxes below, so it keeps saying where money would go
            today while the rider is halfway through changing it. */}
        <View style={styles.onFile}>
          <View style={styles.glyph}>
            <Icon name="bank" size={20} color={colors.brandInk} />
          </View>
          <Text variant="eyebrow" color="tertiary">
            {onFile
              ? TYPE_LABEL[stored?.accountType ?? "savings"]
              : stored?.upiId
                ? "UPI only"
                : "Nothing on file"}
          </Text>
          <Text variant="priceHero" style={{ marginTop: space[2] }}>
            {onFile ? `•••• ${stored?.accountLast4}` : "—"}
          </Text>
          {!!stored?.bankName && (
            <Text variant="caption" color="tertiary" style={{ marginTop: space[1] }}>
              {stored.bankName}
            </Text>
          )}
        </View>

        <View style={styles.card}>
          <DataRow
            label="Account holder"
            value={stored?.accountHolderName || "—"}
            tabular={false}
            first
          />
          <DataRow label="IFSC code" value={stored?.ifscCode || "—"} />
          <DataRow label="UPI id" value={stored?.upiId || "—"} tabular={false} />
        </View>

        {!!error && <Notice tone="danger" glyph="alert" title={error} />}

        <View style={{ gap: space[4] }}>
          <Input
            label="Account holder"
            value={holder}
            onChangeText={setHolder}
            error={fieldErrors.holder}
            required={false}
            placeholder="The name on the account"
            autoCapitalize="words"
            maxLength={60}
            hint="As the bank has it, not as it is on your licence, if the two differ."
          />
          <Input
            label="Bank"
            value={bankName}
            onChangeText={setBankName}
            required={false}
            placeholder="HDFC Bank"
            autoCapitalize="words"
            maxLength={60}
          />
          <Input
            label="Account number"
            value={account}
            onChangeText={setAccount}
            error={fieldErrors.account}
            required={false}
            placeholder={onFile ? `•••• ${stored?.accountLast4} — type to replace` : "9 to 18 digits"}
            keyboardType="number-pad"
            maxLength={18}
            mono
            /* Not `secureTextEntry`, for the reason sign-up gives: a rider
               copying digits off a passbook has to be able to read back what
               they typed, and a masked box is how a transposed digit reaches a
               settlement run. */
            hint={
              onFile
                ? "Leave this empty to keep the account above. We only ever show its last four digits."
                : "We only ever show you the last four digits after this."
            }
          />
          {/* Only asked for when there is something to confirm. A second empty
              box under an empty box is noise. */}
          {!!typedAccount && (
            <Input
              label="Account number again"
              value={confirm}
              onChangeText={setConfirm}
              error={fieldErrors.confirm}
              required={false}
              placeholder="Type it a second time"
              keyboardType="number-pad"
              maxLength={18}
              mono
              hint="You will not be shown these digits again, so they are checked now."
            />
          )}
          <Input
            label="IFSC code"
            value={ifsc}
            onChangeText={setIfsc}
            error={fieldErrors.ifsc}
            required={false}
            placeholder="HDFC0001432"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={11}
            mono
          />
          <ChoiceField
            label="Account type"
            options={ACCOUNT_TYPES}
            value={accountType}
            onChange={setAccountType}
            required={false}
          />
          <Input
            label="UPI id"
            value={upi}
            onChangeText={setUpi}
            required={false}
            placeholder="name@bank"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            maxLength={64}
          />
        </View>

        <Btn
          label={saving ? "Saving…" : "Save changes"}
          disabled={!dirty || saving}
          loading={saving}
          onPress={save}
        />

        {/* Said plainly, because this is the screen a rider opens looking for
            a button that moves money. There is no such button anywhere in this
            app and there is nothing behind one to press. */}
        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          This is only where your earnings are sent. The app does not hold a balance and
          cannot move money. If a settlement has not arrived, raise it in Help under
          &ldquo;Payout&rdquo;.
        </Text>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
    </View>
  );
}

/** The server's sentence when it has one — it is the instruction. */
function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: string } | null;
    return payload?.message || err.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  onFile: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[5],
    alignItems: "center",
  },
  glyph: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[3],
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    paddingHorizontal: space[4],
    paddingVertical: space[1],
  },
});
