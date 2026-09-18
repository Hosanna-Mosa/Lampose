import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";

import { Icon, Notice } from "@/components/ui";
import { useDriverStore } from "@/store/driverStore";
import { ApiError } from "@/utils/api";
import { colors } from "@/theme";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/**
 * 3D Flip Driver Authentication Screen
 * Precision-styled to match the User App login design with 3D card flip,
 * authentic brand logo, background decorative SVGs, pill input field, and gradient buttons.
 */
export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();

  const startSignIn = useDriverStore((s) => s.startSignIn);
  const resendCode = useDriverStore((s) => s.resendCode);
  const verifyCode = useDriverStore((s) => s.verifyCode);
  const otpSending = useDriverStore((s) => s.otpSending);

  // Phone Step State
  const [digits, setDigits] = useState("");
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);

  const tenDigits = digits.replace(/\D/g, "").slice(-10);
  const numberValid = tenDigits.length === 10 && /^[6-9]/.test(tenDigits);
  const numberError = touched
    ? tenDigits.length === 0
      ? "Please enter your 10-digit mobile number."
      : tenDigits.length < 10
      ? "Please enter a valid 10-digit mobile number."
      : !/^[6-9]/.test(tenDigits)
      ? "Indian mobile numbers must start with 6, 7, 8, or 9."
      : undefined
    : undefined;

  // OTP Step State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // OTP Box Inputs
  const otpBoxRefs = useRef<Array<TextInput | null>>([]);

  // 3D Flip Shared Value (0 = Phone, 180 = OTP)
  const flipValue = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // CTA Button Scale
  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  // Resend Cooldown Timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Flip Animation Styles
  const frontAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${flipValue.value}deg` },
    ],
    backfaceVisibility: "hidden",
    opacity: interpolate(flipValue.value, [89, 90], [1, 0]),
    position: "absolute",
    width: "100%",
  }));

  const backAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1200 },
      { rotateY: `${flipValue.value - 180}deg` },
    ],
    backfaceVisibility: "hidden",
    opacity: interpolate(flipValue.value, [89, 90], [0, 1]),
    position: "absolute",
    width: "100%",
  }));

  const handlePhoneChange = (v: string) => {
    const cleaned = v.replace(/\D/g, "").slice(0, 10);
    setDigits(cleaned);
    setError("");

    if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      buttonScale.value = withSequence(
        withSpring(1.04, { damping: 8, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 220 })
      );
    }
  };

  const submitPhone = async () => {
    setTouched(true);
    if (!numberValid) {
      phoneInputRef.current?.focus();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      buttonScale.value = withSequence(
        withSpring(0.96, { damping: 8, stiffness: 260 }),
        withSpring(1, { damping: 12, stiffness: 260 })
      );
      return;
    }

    if (busy || otpSending) return;

    Keyboard.dismiss();
    setError("");
    setBusy(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    try {
      await startSignIn(tenDigits);
      setCooldown(RESEND_SECONDS);

      // Trigger 3D Flip to OTP side
      setIsFlipped(true);
      flipValue.value = withSpring(180, { damping: 18, stiffness: 120 });

      setTimeout(() => otpBoxRefs.current[0]?.focus(), 400);
    } catch (err) {
      setError(readError(err, "We could not send a verification code to that number."));
    } finally {
      setBusy(false);
    }
  };

  const handleOtpDigitChange = (text: string, index: number) => {
    setError("");
    const char = text.replace(/\D/g, "").slice(-1);
    const newCodeArr = code.split("");

    if (char) {
      newCodeArr[index] = char;
      const newCode = newCodeArr.join("").slice(0, OTP_LENGTH);
      setCode(newCode);

      // Auto-advance to next box
      if (index < OTP_LENGTH - 1) {
        otpBoxRefs.current[index + 1]?.focus();
      }
    } else {
      // Deleting character
      newCodeArr[index] = "";
      setCode(newCodeArr.join(""));
    }
  };

  const handleOtpKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === "Backspace" && !code[index] && index > 0) {
      otpBoxRefs.current[index - 1]?.focus();
    }
  };

  const submitOtp = async () => {
    if (code.length !== OTP_LENGTH || busy) return;

    Keyboard.dismiss();
    setError("");
    setBusy(true);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    try {
      await verifyCode(code, name.trim() || undefined);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      router.replace("/(tabs)");
    } catch (err) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setError(readError(err, "That verification code is incorrect or expired."));
      setCode("");
      setTimeout(() => otpBoxRefs.current[0]?.focus(), 100);
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || otpSending) return;
    setError("");
    setCode("");
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    try {
      await resendCode();
      setCooldown(RESEND_SECONDS);
      setTimeout(() => otpBoxRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(readError(err, "We could not send another code right now."));
    }
  };

  const handleUseAnotherNumber = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setError("");
    setCode("");
    setIsFlipped(false);
    flipValue.value = withSpring(0, { damping: 18, stiffness: 120 });
    setTimeout(() => phoneInputRef.current?.focus(), 400);
  };

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="dark" />

      {/* Decorative Background SVG Shapes matching reference design */}
      <View style={styles.backgroundBlobs} pointerEvents="none">
        {/* Top left soft pastel green blob and accent circle */}
        <Svg
          width={260}
          height={220}
          viewBox="0 0 260 220"
          style={{ position: "absolute", top: -40, left: -40 }}
        >
          <Path
            d="M 0 0 C 90 0, 180 40, 210 110 C 240 170, 160 210, 100 200 C 40 190, 0 150, 0 80 Z"
            fill="#EAF5EE"
            opacity="0.8"
          />
          <Circle cx="175" cy="85" r="14" fill="#CDE9D5" opacity="0.85" />
        </Svg>

        {/* Right side floating circles */}
        <Svg
          width={70}
          height={70}
          viewBox="0 0 70 70"
          style={{ position: "absolute", top: "38%", right: 18 }}
        >
          <Circle cx="35" cy="35" r="14" fill="#CDE9D5" opacity="0.85" />
        </Svg>
        <Svg
          width={80}
          height={80}
          viewBox="0 0 80 80"
          style={{ position: "absolute", top: "45%", right: -28 }}
        >
          <Circle cx="40" cy="40" r="28" fill="#EAF5EE" opacity="0.7" />
        </Svg>

        {/* Bottom corner flowing waves */}
        <Svg
          width={screenWidth}
          height={170}
          viewBox={`0 0 ${screenWidth} 170`}
          style={{ position: "absolute", bottom: -15, left: 0 }}
        >
          <Path
            d={`M 0 70 C ${screenWidth * 0.12} 85, ${screenWidth * 0.26} 125, ${screenWidth * 0.4} 170 L 0 170 Z`}
            fill="#EBF5EF"
            opacity="0.85"
          />
          <Path
            d={`M ${screenWidth * 0.64} 170 C ${screenWidth * 0.76} 130, ${screenWidth * 0.88} 85, ${screenWidth} 40 L ${screenWidth} 170 Z`}
            fill="#EAF5EE"
            opacity="0.85"
          />
          <Path
            d={`M 0 95 C ${screenWidth * 0.22} 120, ${screenWidth * 0.38} 162, ${screenWidth * 0.52} 162 C ${screenWidth * 0.68} 162, ${screenWidth * 0.84} 95, ${screenWidth} 28`}
            fill="none"
            stroke="#0A5A41"
            strokeWidth="1.2"
            opacity="0.22"
          />
        </Svg>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1, zIndex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + 16,
              paddingBottom: Math.max(insets.bottom + 12, 24),
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.centerWrapper}>
            {/* Authentic Brand Logo Header */}
            <View style={styles.logoHeader}>
              <Image
                source={require("@/assets/images/lampose-logo-badge.png")}
                style={styles.logoBadge}
                resizeMode="contain"
              />
              <View style={styles.partnerPill}>
                <Icon name="vehicle" size={13} color="#059669" />
                <Text style={styles.partnerPillText}>Driver Partner</Text>
              </View>
            </View>

            {/* 3D Flip Card Container */}
            <View style={styles.flipContainer}>
              {/* ============================================================ */}
              {/* FRONT SIDE: Phone Input Form                                 */}
              {/* ============================================================ */}
              <Animated.View
                style={[styles.cardSide, frontAnimatedStyle]}
                pointerEvents={isFlipped ? "none" : "auto"}
              >
                {/* Headlines */}
                <Text style={styles.headline}>
                  Deliver <Text style={styles.textGreen}>&</Text>{" "}
                  <Text style={styles.textGreen}>Earn</Text>
                </Text>
                <Text style={styles.headline}>With Lampose</Text>

                <Text style={styles.subtitle}>
                  Flexible shifts. Instant weekly payouts.
                </Text>
                <Text style={[styles.subtitle, styles.subtitleTight]}>
                  Simple. Fast. Trusted.
                </Text>

                {/* Form Area */}
                <View style={styles.formArea}>
                  <Pressable
                    onPress={() => phoneInputRef.current?.focus()}
                    style={[
                      styles.phoneInputContainer,
                      isFocused && styles.phoneInputFocused,
                      Boolean(numberError) && styles.phoneInputError,
                    ]}
                  >
                    <Icon name="phone" size={18} color="#0A5A41" />
                    <Text style={styles.countryCodeText}>+91</Text>
                    <View style={styles.divider} />
                    <TextInput
                      ref={phoneInputRef}
                      value={digits}
                      onChangeText={handlePhoneChange}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => {
                        setIsFocused(false);
                        setTouched(true);
                      }}
                      placeholder="Enter mobile number"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      maxLength={10}
                      style={[styles.phoneInput, digits.length === 0 && styles.phoneInputEmpty]}
                      selectionColor="#0A5A41"
                      returnKeyType="done"
                      onSubmitEditing={() => numberValid && submitPhone()}
                    />
                  </Pressable>

                  {numberError ? <Text style={styles.errorText}>{numberError}</Text> : null}

                  {!!error && (
                    <View style={{ marginTop: 12, width: "100%" }}>
                      <Notice tone="danger" title={error} glyph="alert" />
                    </View>
                  )}

                  {/* Gradient Primary Button */}
                  <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap]}>
                    <Pressable
                      onPress={submitPhone}
                      disabled={!numberValid || busy || otpSending}
                      style={({ pressed }) => [
                        styles.primaryButtonPress,
                        pressed && !busy ? { opacity: 0.92 } : null,
                        (!numberValid || busy) && { opacity: 0.65 },
                      ]}
                      accessibilityRole="button"
                    >
                      <LinearGradient
                        colors={["#1E7B4C", "#0E6342", "#0A563A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.primaryButton}
                      >
                        {busy || otpSending ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <View style={styles.primaryButtonRow}>
                            <Text style={styles.primaryButtonText}>Send OTP Code</Text>
                            <Icon name="arrowRight" size={20} color="#FFFFFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {/* Terms & Conditions */}
                  <Text style={styles.termsText}>
                    By continuing, you agree to our{"\n"}
                    <Text style={styles.termsLink}>Terms & Conditions</Text> and{" "}
                    <Text style={styles.termsLink}>Privacy Policy</Text>
                  </Text>
                </View>
              </Animated.View>

              {/* ============================================================ */}
              {/* BACK SIDE: OTP Verification Form                             */}
              {/* ============================================================ */}
              <Animated.View
                style={[styles.cardSide, backAnimatedStyle]}
                pointerEvents={isFlipped ? "auto" : "none"}
              >
                <Text style={styles.headline}>Enter the code</Text>
                <Text style={styles.subtitle}>
                  We sent {OTP_LENGTH} digits to{"\n"}
                  <Text style={{ fontWeight: "700", color: "#141A24" }}>
                    +91 {tenDigits || "your phone"}
                  </Text>
                </Text>

                <View style={styles.formArea}>
                  {/* 6 OTP Boxes */}
                  <View style={styles.otpGrid}>
                    {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                      <TextInput
                        key={i}
                        ref={(r) => {
                          otpBoxRefs.current[i] = r;
                        }}
                        style={[
                          styles.otpBox,
                          Boolean(code[i]) && styles.otpBoxFilled,
                        ]}
                        value={code[i] || ""}
                        onChangeText={(t) => handleOtpDigitChange(t, i)}
                        onKeyPress={(e) => handleOtpKeyPress(e, i)}
                        keyboardType="number-pad"
                        maxLength={1}
                        selectTextOnFocus
                        selectionColor="#0A5A41"
                      />
                    ))}
                  </View>

                  {/* Optional Driver Name Field */}
                  <View style={styles.nameFieldContainer}>
                    <Icon name="profile" size={18} color="#0A5A41" />
                    <TextInput
                      style={styles.nameInput}
                      value={name}
                      onChangeText={setName}
                      placeholder="Your full name (optional)"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="words"
                      maxLength={60}
                    />
                  </View>

                  {!!error && (
                    <View style={{ marginTop: 12, width: "100%" }}>
                      <Notice tone="danger" title={error} glyph="alert" />
                    </View>
                  )}

                  {/* Verify & Continue Button */}
                  <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap]}>
                    <Pressable
                      onPress={submitOtp}
                      disabled={code.length !== OTP_LENGTH || busy}
                      style={({ pressed }) => [
                        styles.primaryButtonPress,
                        pressed && !busy ? { opacity: 0.92 } : null,
                        (code.length !== OTP_LENGTH || busy) && { opacity: 0.65 },
                      ]}
                    >
                      <LinearGradient
                        colors={["#1E7B4C", "#0E6342", "#0A563A"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.primaryButton}
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <View style={styles.primaryButtonRow}>
                            <Text style={styles.primaryButtonText}>Verify & Start Shifts</Text>
                            <Icon name="arrowRight" size={20} color="#FFFFFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {/* Actions: Resend & Use Another Number */}
                  <View style={styles.otpActions}>
                    <Pressable
                      disabled={cooldown > 0 || otpSending}
                      onPress={handleResend}
                      style={styles.actionBtn}
                    >
                      <Text style={[styles.actionBtnText, cooldown > 0 && { color: "#94A3B8" }]}>
                        {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                      </Text>
                    </Pressable>

                    <Pressable onPress={handleUseAnotherNumber} style={styles.actionBtn}>
                      <Text style={styles.actionBtnTextSecondary}>
                        Use another number
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer Slogan Scribe Line */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={styles.footerScriptText}
        >
          Faster Deliveries  <Text style={styles.footerPipe}>|</Text>  Higher Earnings  <Text style={styles.footerPipe}>|</Text>  Brighter Days
        </Text>
      </View>
    </View>
  );
}

function readError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const payload = err.payload as { message?: string; error?: string } | null;
    return payload?.message || payload?.error || err.message || fallback;
  }
  return (err as Error)?.message || fallback;
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  backgroundBlobs: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    zIndex: 1,
  },
  centerWrapper: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  /* Logo Header */
  logoHeader: {
    alignItems: "center",
    marginBottom: 24,
  },
  logoBadge: {
    width: 200,
    height: 56,
  },
  partnerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ecfdf5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1fae5",
    marginTop: 6,
  },
  partnerPillText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#047857",
    letterSpacing: 0.3,
  },

  /* 3D Flip Container */
  flipContainer: {
    width: "100%",
    position: "relative",
    minHeight: 400,
  },
  cardSide: {
    alignItems: "center",
    width: "100%",
  },

  /* Typography */
  headline: {
    fontSize: 28,
    fontWeight: "800",
    color: "#141A24",
    textAlign: "center",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  textGreen: {
    color: "#0A5E44",
    fontSize: 28,
    fontWeight: "800",
  },
  subtitle: {
    fontSize: 14.5,
    color: "#7C808C",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  subtitleTight: {
    marginTop: 2,
  },

  /* Form Elements */
  formArea: {
    width: "100%",
    marginTop: 28,
    alignItems: "center",
  },
  phoneInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.2,
    borderColor: "#E6EAE7",
    borderRadius: 30,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    width: "100%",
  },
  phoneInputFocused: {
    borderColor: "#0A5A41",
    shadowOpacity: 0.06,
  },
  phoneInputError: {
    borderColor: "#EF4444",
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#141A24",
    marginLeft: 8,
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 12,
  },
  phoneInput: {
    flex: 1,
    fontSize: 17,
    color: "#141A24",
    fontWeight: "600",
    paddingVertical: 0,
  },
  phoneInputEmpty: {
    fontSize: 15,
  },
  errorText: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 8,
    alignSelf: "flex-start",
    marginLeft: 16,
  },

  /* OTP Grid */
  otpGrid: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    width: "100%",
  },
  otpBox: {
    width: 46,
    height: 54,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    textAlign: "center",
    fontSize: 22,
    fontWeight: "700",
    color: "#064e3b",
  },
  otpBoxFilled: {
    borderColor: "#0A5A41",
    backgroundColor: "#ecfdf5",
  },

  /* Name Field */
  nameFieldContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.2,
    borderColor: "#E6EAE7",
    borderRadius: 30,
    paddingHorizontal: 16,
    height: 50,
    backgroundColor: "#FFFFFF",
    marginTop: 16,
    width: "100%",
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    color: "#141A24",
  },

  /* CTA Button */
  primaryButtonWrap: {
    width: "100%",
    marginTop: 20,
    borderRadius: 30,
    shadowColor: "#0A563A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryButtonPress: {
    borderRadius: 30,
    overflow: "hidden",
  },
  primaryButton: {
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
  },
  primaryButtonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16.5,
    fontWeight: "700",
  },

  /* Terms */
  termsText: {
    textAlign: "center",
    fontSize: 12,
    color: "#8E95A2",
    lineHeight: 19,
    marginTop: 20,
    width: "100%",
  },
  termsLink: {
    color: "#0A5A41",
    fontWeight: "700",
  },

  /* OTP Action Buttons */
  otpActions: {
    marginTop: 20,
    gap: 12,
    alignItems: "center",
    width: "100%",
  },
  actionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0A5A41",
  },
  actionBtnTextSecondary: {
    fontSize: 13.5,
    fontWeight: "600",
    color: "#64748B",
  },

  /* Footer */
  footer: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    backgroundColor: "transparent",
    zIndex: 1,
  },
  footerScriptText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#18583E",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  footerPipe: {
    color: "#CBD5E1",
    fontSize: 13,
    marginHorizontal: 6,
  },
});
