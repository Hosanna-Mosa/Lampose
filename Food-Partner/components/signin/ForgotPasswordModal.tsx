import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Btn, Field, Icon, Note, Scroller, Text, TextField, Tappable } from "@/components/common";
import { resetPassword, startPhoneOtp, verifyPhoneOtp } from "@/services/foodPartner";
import { colors, layout, radius, space, touch } from "@/theme";

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: (phone: string) => void;
};

export function ForgotPasswordModal({ visible, onDismiss, onSuccess }: Props) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (visible) {
      setStep(1);
      setPhone("");
      setOtp("");
      setVerificationToken("");
      setNewPassword("");
      setConfirmPassword("");
      setError("");
      setMessage("");
      setCooldown(0);
    }
  }, [visible]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((c) => (c > 1 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSendOtp = async () => {
    const raw = phone.replace(/\D/g, "");
    if (raw.length < 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await startPhoneOtp(raw);
      setStep(2);
      setCooldown(60);
      setMessage(`OTP sent to +91 ${raw.slice(0, 3)}••••${raw.slice(-3)}`);
    } catch (err) {
      setError((err as Error)?.message || "Failed to send OTP. Check number and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    const cleanOtp = otp.trim();
    if (!cleanOtp) {
      setError("Enter the 6-digit OTP received on your mobile.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await verifyPhoneOtp(phone.replace(/\D/g, ""), cleanOtp);
      setVerificationToken(res.verificationToken);
      setStep(3);
    } catch (err) {
      setError((err as Error)?.message || "Invalid or expired OTP.");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const raw = phone.replace(/\D/g, "");
      await resetPassword(raw, newPassword, verificationToken, otp.trim());
      onSuccess(raw);
    } catch (err) {
      setError((err as Error)?.message || "Failed to reset password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss}>
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[5]) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <Text variant="display2">Forgot Password</Text>
            <Pressable onPress={onDismiss} hitSlop={touch.iconButtonHitSlop}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Stepper Progress Badges */}
          <View style={styles.stepBadges}>
            <View style={[styles.badge, step >= 1 && styles.badgeActive]}>
              <Text style={[styles.badgeText, step >= 1 && styles.badgeTextActive]}>1. Phone</Text>
            </View>
            <View style={[styles.badge, step >= 2 && styles.badgeActive]}>
              <Text style={[styles.badgeText, step >= 2 && styles.badgeTextActive]}>2. OTP</Text>
            </View>
            <View style={[styles.badge, step >= 3 && styles.badgeActive]}>
              <Text style={[styles.badgeText, step >= 3 && styles.badgeTextActive]}>3. New Password</Text>
            </View>
          </View>

          {!!error && <Note tone="bad">{error}</Note>}
          {!!message && <Note tone="ok">{message}</Note>}

          <Scroller keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContainer}>
            {step === 1 && (
              <Box style={styles.stepBox}>
                <Text variant="body" color="secondary">
                  Enter your registered mobile number to receive a verification OTP.
                </Text>
                <Field label="Mobile Number" required>
                  <TextField
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
                    placeholder="9876543210"
                    keyboardType="number-pad"
                    prefix="+91"
                  />
                </Field>
                <Btn
                  label="Send OTP"
                  onPress={handleSendOtp}
                  loading={busy}
                  disabled={phone.replace(/\D/g, "").length < 10}
                />
              </Box>
            )}

            {step === 2 && (
              <Box style={styles.stepBox}>
                <Text variant="body" color="secondary">
                  Enter the OTP code sent to +91 {phone}.
                </Text>
                <Field label="OTP Code" required>
                  <TextField
                    value={otp}
                    onChangeText={(v) => setOtp(v.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Enter 6-digit OTP"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </Field>
                <Btn
                  label="Verify OTP"
                  onPress={handleVerifyOtp}
                  loading={busy}
                  disabled={otp.trim().length < 4}
                />
                <Tappable
                  disabled={cooldown > 0 || busy}
                  onPress={handleSendOtp}
                  style={styles.resendRow}
                >
                  <Text variant="body" color={cooldown > 0 ? "tertiary" : "brand"}>
                    {cooldown > 0 ? `Resend OTP in ${cooldown}s` : "Resend OTP"}
                  </Text>
                </Tappable>
              </Box>
            )}

            {step === 3 && (
              <Box style={styles.stepBox}>
                <Text variant="body" color="secondary">
                  Set a new password for your kitchen partner account.
                </Text>
                <Field label="New Password" required>
                  <TextField
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="At least 6 characters"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    right={
                      <Tappable onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                        <Icon name={showPassword ? "eyeOff" : "eye"} size={18} color={colors.textTertiary} />
                      </Tappable>
                    }
                  />
                </Field>
                <Field label="Confirm New Password" required>
                  <TextField
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter new password"
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                </Field>
                <Btn
                  label="Update Password"
                  onPress={handleResetPassword}
                  loading={busy}
                  disabled={!newPassword || newPassword !== confirmPassword}
                />
              </Box>
            )}
          </Scroller>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: layout.gutter,
    maxHeight: "85%",
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: space[3],
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space[3],
  },
  stepBadges: {
    flexDirection: "row",
    gap: space[2],
    marginBottom: space[4],
  },
  badge: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceSunken,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeActive: {
    backgroundColor: colors.brandTint,
    borderColor: colors.brandInk,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textTertiary,
  },
  badgeTextActive: {
    color: colors.brandInk,
  },
  formContainer: {
    gap: space[4],
  },
  stepBox: {
    gap: space[4],
  },
  resendRow: {
    alignItems: "center",
    paddingVertical: space[2],
  },
});
