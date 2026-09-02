import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Notice, Rule, Text, TopBar } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import { ApiError } from "@/utils/api";
import { colors, layout, radius, space } from "@/theme";

const OTP_LENGTH = 6;
/** Matches the server's own cooldown, so the button and the API agree. */
const RESEND_SECONDS = 60;

/**
 * Signing in. A number, then a code.
 *
 * There is no password and there is not going to be one — the same decision
 * the customer app made, and a stronger one here: a rider signs in on a phone
 * they use with wet hands at a restaurant counter, and a forgotten password
 * reset over an email address we may not have is a shift they do not work.
 *
 * Sign-in and sign-up are the same two calls. The server never says which one
 * happened, so neither does this screen: an endpoint that reported whether a
 * number had an account would be a way to test a list of numbers against
 * Lampose's riders.
 *
 * ## Every refusal is shown in the SERVER'S words
 *
 * It knows things this screen cannot — the code expired, too many were sent,
 * the account is on hold — and paraphrasing those into "something went wrong"
 * throws away the one sentence that tells somebody what to do next.
 */
export default function AuthScreen() {
  const insets = useSafeAreaInsets();

  const startSignIn = useDriverStore((s) => s.startSignIn);
  const resendCode = useDriverStore((s) => s.resendCode);
  const verifyCode = useDriverStore((s) => s.verifyCode);
  const otpSending = useDriverStore((s) => s.otpSending);

  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const codeInput = useRef<TextInput>(null);

  const tenDigits = phone.replace(/\D/g, "").slice(-10);
  const phoneReady = tenDigits.length === 10 && /^[6-9]/.test(tenDigits);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const send = async () => {
    setError("");
    setBusy(true);
    try {
      await startSignIn(tenDigits);
      setStep("code");
      setCooldown(RESEND_SECONDS);
      // The keyboard has to land on the code box, not stay on the number —
      // a rider who has to tap twice at a traffic light usually taps once.
      setTimeout(() => codeInput.current?.focus(), 250);
    } catch (err) {
      setError(readError(err, "We could not send a code to that number."));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setError("");
    try {
      await resendCode();
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      setError(readError(err, "We could not send another code just now."));
    }
  };

  const verify = async () => {
    setError("");
    setBusy(true);
    try {
      const profile = await verifyCode(code, name.trim() || undefined);
      /* Where a rider lands is decided by what the SERVER says about them, not
         by which screen they came from. A returning approved rider goes to the
         tabs; anybody who has not finished setting up goes to onboarding,
         which is also where a pending or rejected account is explained. */
      router.replace(profile.hasCompletedOnboarding ? "/(tabs)" : "/onboarding");
    } catch (err) {
      setError(readError(err, "That code did not work."));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <TopBar
        title={step === "phone" ? "" : "Enter the code"}
        subtitle={step === "code" ? `Sent to +91 ${tenDigits}` : undefined}
        back={step === "code" ? "Your number" : null}
        onBack={step === "code" ? () => { setStep("phone"); setError(""); } : undefined}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: step === "phone" ? insets.top + space[4] : space[5] }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === "phone" ? (
          <>
            <View style={styles.logoBlock}>
              <View style={styles.logoMark}>
                <Text variant="display1" style={{ color: colors.onBrand }}>
                  L
                </Text>
              </View>
              <Text variant="display1" style={{ marginTop: space[4] }}>
                Lampose
              </Text>
              <Text variant="eyebrow" color="brand" style={{ marginTop: space[1] }}>
                Driver partner
              </Text>
              <Rule style={{ marginTop: space[5] }} />
            </View>

            <Text variant="display1" style={{ marginTop: space[6] }}>
              What is your number?
            </Text>
            <Text variant="bodyLg" color="secondary" style={{ marginTop: space[2] }}>
              We will text you a {OTP_LENGTH}-digit code. It is also the number restaurants
              and customers will call you on.
            </Text>

            <View style={styles.field}>
              <Text variant="bodyLg" color="tertiary">
                +91
              </Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(v) => { setPhone(v); setError(""); }}
                keyboardType="number-pad"
                textContentType="telephoneNumber"
                autoComplete="tel"
                maxLength={13}
                placeholder="98765 43210"
                placeholderTextColor={colors.textTertiary}
                returnKeyType="done"
                onSubmitEditing={() => phoneReady && send()}
              />
            </View>

            {!!error && <Notice tone="danger" title={error} glyph="alert" style={{ marginTop: space[4] }} />}

            <Btn
              label="Send the code"
              variant="ink"
              large
              disabled={!phoneReady || busy || otpSending}
              onPress={send}
              style={{ marginTop: space[5] }}
            />
            {(busy || otpSending) && <ActivityIndicator style={{ marginTop: space[3] }} />}
          </>
        ) : (
          <>
            <Text variant="display1">Enter the code</Text>
            <Text variant="bodyLg" color="secondary" style={{ marginTop: space[2] }}>
              It expires in ten minutes.
            </Text>

            <TextInput
              ref={codeInput}
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => {
                const digits = v.replace(/\D/g, "").slice(0, OTP_LENGTH);
                setCode(digits);
                setError("");
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
              placeholder="••••••"
              placeholderTextColor={colors.textTertiary}
            />

            {/* Asked here rather than on a screen of its own: a restaurant
                handing over food needs a name to call out, and one more screen
                between a rider and their first shift is a rider who does not
                finish signing up. Left blank is a real answer — the profile
                screen asks again. */}
            <View style={[styles.field, { marginTop: space[4] }]}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Your name (optional)"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="words"
                maxLength={60}
              />
            </View>

            {!!error && <Notice tone="danger" title={error} glyph="alert" style={{ marginTop: space[4] }} />}

            <Btn
              label="Verify and continue"
              variant="ink"
              large
              disabled={code.length !== OTP_LENGTH || busy}
              onPress={verify}
              style={{ marginTop: space[5] }}
            />

            <Pressable
              accessibilityRole="button"
              disabled={cooldown > 0 || otpSending}
              onPress={resend}
              style={{ marginTop: space[4], alignSelf: "center" }}
            >
              <Text variant="bodyStrong" color={cooldown > 0 ? "tertiary" : "brand"}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : "Send another code"}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The server's sentence when there is one, ours only when there is not. */
function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: string; error?: string } | null;
    return payload?.message || payload?.error || err.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[8] },
  logoBlock: { alignItems: "center" },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  field: {
    marginTop: space[5],
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    paddingHorizontal: space[4],
    height: 56,
  },
  input: { flex: 1, fontSize: 17, color: colors.textPrimary },
  /* Martian Mono carries every figure in this app, and a six-digit code read
     off an SMS is exactly the case the mono scale exists for: the digits stay
     column-aligned as they are typed. */
  codeInput: {
    marginTop: space[5],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    height: 64,
    textAlign: "center",
    fontSize: 28,
    letterSpacing: 8,
    color: colors.textPrimary,
  },
});
