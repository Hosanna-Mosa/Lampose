import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { Button, Icon, InlineAlert, OtpInput, type OtpState } from '@/components/ui';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAppState } from '@/context/AppStateContext';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from '@/types/auth';

/**
 * 3D Flip Authentication Screen
 * Precision-matched to reference design with authentic brand logo and centered layout.
 * Front side: Phone Number Entry
 * Back side: OTP Verification
 */
export default function AuthScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const {
    config,
    sendCode,
    verifyCode,
    resendCode,
    changeNumber,
    isSubmitting,
    resendIn,
    sendFailure,
    failureMessage,
    pendingPhone,
    pendingPhoneMasked,
    pendingCredential,
    resumePendingIntent,
    continueAsGuest,
  } = useAuth();

  const { next } = useLocalSearchParams<{ next?: string }>();
  const { completeOnboardingStep } = useAppState();

  /* Every way past this screen that is not a code. On a first run it ends the
     sign-in step of the walk-through, and `/` then sends the student on to the
     category grid; any other time it is just "browse without an account". */
  const leaveAsGuest = async () => {
    continueAsGuest();
    await completeOnboardingStep('auth');
    router.replace('/');
  };

  // Front Form State (Phone)
  const [digits, setDigits] = useState('');
  const [touched, setTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const numberValid = isValidIndianMobile(digits);
  const numberError = touched
    ? digits.length === 0
      ? 'Please enter your mobile number.'
      : digits.length < 10
      ? 'Please enter a 10-digit mobile number.'
      : phoneError(digits)
    : undefined;

  // Back Form State (OTP)
  const [code, setCode] = useState('');
  /* The store-review number gets no SMS, so its back side asks for a password
     (checked by the server exactly like a code) instead of six boxes. */
  const usesPassword = pendingCredential === 'password';
  const [passwordFocused, setPasswordFocused] = useState(false);
  const codeReady = usesPassword ? code.length > 0 : code.length === config.otpLength;
  const [otpState, setOtpState] = useState<OtpState>('idle');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  // 3D Flip State
  // 0 = Front (Phone), 180 = Back (OTP)
  const flipValue = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);


  // Sync flip state with pendingPhone if we load directly into OTP
  useEffect(() => {
    if (pendingPhone && !isFlipped) {
      setIsFlipped(true);
      flipValue.value = withSpring(180, { damping: 18, stiffness: 120 });
    } else if (!pendingPhone && isFlipped) {
      setIsFlipped(false);
      flipValue.value = withSpring(0, { damping: 18, stiffness: 120 });
    }
  }, [pendingPhone, isFlipped, flipValue]);

  // Front Animation Styles
  const frontAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${flipValue.value}deg` },
      ],
      backfaceVisibility: 'hidden',
      opacity: interpolate(flipValue.value, [89, 90], [1, 0]),
      position: 'absolute',
      width: '100%',
    };
  });

  // Back Animation Styles
  const backAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { perspective: 1200 },
        { rotateY: `${flipValue.value - 180}deg` },
      ],
      backfaceVisibility: 'hidden',
      opacity: interpolate(flipValue.value, [89, 90], [0, 1]),
      position: 'absolute',
      width: '100%',
    };
  });

  // CTA Button Scale
  const buttonScale = useSharedValue(1);
  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '').slice(0, 10);
    setDigits(cleaned);

    if (cleaned.length === 10 && isValidIndianMobile(cleaned)) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      buttonScale.value = withSequence(
        withSpring(1.04, { damping: 8, stiffness: 220 }),
        withSpring(1, { damping: 12, stiffness: 220 }),
      );
    }
  };

  const submitPhone = async () => {
    setTouched(true);
    if (!numberValid) {
      inputRef.current?.focus();
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } catch {}
      buttonScale.value = withSequence(
        withSpring(0.96, { damping: 8, stiffness: 260 }),
        withSpring(1, { damping: 12, stiffness: 260 }),
      );
      return;
    }

    if (isSubmitting) return;

    Keyboard.dismiss();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await sendCode(`+91${digits}`);
    if (result === 'failed') return;
  };

  const submitOtp = async (value: string) => {
    if (usesPassword ? value.length === 0 : value.length !== config.otpLength) return;
    setOtpState('verifying');
    setProblem(null);

    Keyboard.dismiss();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await verifyCode(value);
    if (result.ok) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      setOtpState('idle');
      await completeOnboardingStep('auth');

      /* A held action (from `requireSignIn`) wins over the ordinary
         destination — it already returned to the screen it was called from
         and re-ran whatever was waiting. Only when nothing was held does the
         `next` param, or Home, decide where this goes. */
      if (!resumePendingIntent()) {
        if (next) router.replace(next as never);
        else router.replace('/');
      }
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setOtpState('error');
      if (result.reason === 'wrong') setAttemptsLeft(result.attemptsLeft);
      else if (result.reason === 'locked') setLockedLabel(result.unlocksAtLabel);
      else if (result.reason === 'expired') setExpiredMessage(result.message);
      else setProblem(result.message);
    }
  };

  const handleResend = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setCode('');
    setOtpState('idle');
    setAttemptsLeft(null);
    setLockedLabel(null);
    setExpiredMessage(null);
    setProblem(null);
    await resendCode();
  };

  const handleUseAnotherNumber = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setCode('');
    setOtpState('idle');
    setAttemptsLeft(null);
    setLockedLabel(null);
    setExpiredMessage(null);
    setProblem(null);
    changeNumber();
  };

  const failure = sendFailure
    ? sendFailureCopy(sendFailure, {
        retryAfterLabel: resendIn > 0 ? `${resendIn} seconds` : 'a few minutes',
      })
    : null;

  const codeError = usesPassword
    ? lockedLabel
      ? 'Too many wrong tries. Go back and enter the number again.'
      : expiredMessage
        ? 'Please go back and enter the number again.'
        : attemptsLeft !== null
          ? `That password is wrong — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
          : problem ?? undefined
    : lockedLabel
      ? 'That code is spent. Ask for a new one below.'
      : expiredMessage
        ? 'That code expired. Ask for a new one below.'
        : problem ??
          (attemptsLeft !== null
            ? `That code is wrong — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
            : undefined);

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="dark" />

      {/*
        Browsing needs no account — only booking a bed, ordering food, saving
        something or filing a support ticket does, and each of those already
        asks for one at the moment it is tapped (`requireSignIn`). This is the
        way out of an otherwise account-first entry screen for everyone who
        just wants to look first.
      */}
      <Pressable
        onPress={() => {
          if (isFlipped) {
            changeNumber();
          } else if (router.canGoBack()) {
            router.back();
          } else {
            void leaveAsGuest();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={12}
        style={[styles.backButton, { top: insets.top + 12 }]}
      >
        <Icon name="chevronLeft" size={24} color="#3D4247" />
      </Pressable>

      <Pressable
        onPress={() => void leaveAsGuest()}
        accessibilityRole="button"
        accessibilityLabel="Skip sign-in and browse"
        hitSlop={12}
        style={[styles.skipButton, { top: insets.top + 12 }]}
      >
        <Icon name="close" size={16} color="#3D4247" />
        <Text style={styles.skipButtonText}>Skip</Text>
      </Pressable>

      {/* Decorative background SVG shapes matching the reference */}
      <View style={styles.backgroundBlobs} pointerEvents="none">
        {/* Top left soft pastel green blob and accent circle */}
        <Svg
          width={260}
          height={220}
          viewBox="0 0 260 220"
          style={{ position: 'absolute', top: -40, left: -40 }}
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
          style={{ position: 'absolute', top: '41%', right: 18 }}
        >
          <Circle cx="35" cy="35" r="14" fill="#CDE9D5" opacity="0.85" />
        </Svg>
        <Svg
          width={80}
          height={80}
          viewBox="0 0 80 80"
          style={{ position: 'absolute', top: '47%', right: -28 }}
        >
          <Circle cx="40" cy="40" r="28" fill="#EAF5EE" opacity="0.7" />
        </Svg>

        {/* Bottom corner flowing waves */}
        <Svg
          width={screenWidth}
          height={170}
          viewBox={`0 0 ${screenWidth} 170`}
          style={{ position: 'absolute', bottom: -15, left: 0 }}
        >
          {/* Bottom left flowing wave */}
          <Path
            d={`M 0 70 C ${screenWidth * 0.12} 85, ${screenWidth * 0.26} 125, ${screenWidth * 0.40} 170 L 0 170 Z`}
            fill="#EBF5EF"
            opacity="0.85"
          />
          {/* Bottom right flowing wave */}
          <Path
            d={`M ${screenWidth * 0.64} 170 C ${screenWidth * 0.76} 130, ${screenWidth * 0.88} 85, ${screenWidth} 40 L ${screenWidth} 170 Z`}
            fill="#EAF5EE"
            opacity="0.85"
          />
          {/* Subtle curved contour line */}
          <Path
            d={`M 0 95 C ${screenWidth * 0.22} 120, ${screenWidth * 0.38} 162, ${screenWidth * 0.52} 162 C ${screenWidth * 0.68} 162, ${screenWidth * 0.84} 95, ${screenWidth} 28`}
            fill="none"
            stroke="#0A5A41"
            strokeWidth="1.2"
            opacity="0.22"
          />
        </Svg>
      </View>

      <KeyboardAwareScrollViewCompat
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
        {/* Vertically Centered Main Content Wrapper */}
        <View style={styles.centerWrapper}>
          {/* Authentic Logo Header (zero cutting) */}
          <View style={styles.logoHeader}>
            <Image
              source={require('@/assets/images/lampose-logo-badge.png')}
              style={styles.logoBadge}
              resizeMode="contain"
            />
          </View>

          {/* 3D Flip Container */}
          <View style={styles.flipContainer}>
            {/* ============================================================ */}
            {/* FRONT SIDE: Phone Input Form                                 */}
            {/* ============================================================ */}
            <Animated.View
              style={[styles.cardSide, frontAnimatedStyle]}
              pointerEvents={isFlipped ? 'none' : 'auto'}
            >
              {/* Headline */}
              <Text style={styles.headline}>
                Your <Text style={styles.textGreen}>Stay</Text>
                <Text style={styles.textGreenLight}> & </Text>
                <Text style={styles.textGreen}>Food</Text>
              </Text>
              <Text style={styles.headline}>All in One Place</Text>

              {/* Subtitle */}
              <Text style={styles.subtitle}>
                Find rooms, hostels, hotels and more.
              </Text>
              <Text style={[styles.subtitle, styles.subtitleTight]}>
                Simple. Fast. Trusted.
              </Text>

              {/* Form Area */}
              <View style={styles.formArea}>
                <Pressable
                  onPress={() => inputRef.current?.focus()}
                  style={[
                    styles.phoneInputContainer,
                    isFocused && styles.phoneInputFocused,
                    Boolean(numberError) && styles.phoneInputError,
                  ]}
                >
                  {/* The prefix group sits tight against the left edge — it is
                      a fixed label, not content, and every point it takes is a
                      point the number and its placeholder do not get. */}
                  <Icon name="phone" size={18} color="#0A5A41" />
                  <Text style={styles.countryCodeText}>+91</Text>
                  <View style={styles.divider} />
                  <TextInput
                    ref={inputRef}
                    value={digits}
                    onChangeText={handlePhoneChange}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => {
                      setIsFocused(false);
                      setTouched(true);
                    }}
                    placeholder="Enter your mobile number"
                    placeholderTextColor="#94A3B8"
                    keyboardType="number-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    maxLength={10}
                    /*
                      Smaller WHILE EMPTY, so the placeholder fits on one line.

                      A `TextInput` draws its placeholder in its own font size,
                      and at 16 "Enter your mobile number" ran past the field
                      and clipped to "Enter your mobile" — which reads as the
                      app not knowing what it wants. Ten digits are far shorter
                      than that sentence, so the moment anything is typed the
                      size goes back up and the number is set at full size.
                    */
                    style={[styles.phoneInput, digits.length === 0 && styles.phoneInputEmpty]}
                    selectionColor="#0A5A41"
                  />
                </Pressable>

                {numberError ? (
                  <Text style={styles.errorText}>{numberError}</Text>
                ) : null}

                {failure ? (
                  <View style={{ marginTop: 12, width: '100%' }}>
                    <InlineAlert
                      tone={sendFailure === 'rateLimited' ? 'warning' : 'error'}
                      title={failure.headline}
                      body={failureMessage ?? failure.body}
                      actionLabel={failure.action}
                      onAction={failure.action ? () => submitPhone() : undefined}
                    />
                  </View>
                ) : null}

                {/* Continue Button: Always rich vibrant emerald gradient */}
                <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap]}>
                  <Pressable
                    onPress={submitPhone}
                    disabled={isSubmitting}
                    style={({ pressed }) => [
                      styles.primaryButtonPress,
                      pressed && !isSubmitting ? { opacity: 0.92 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Continue"
                    accessibilityState={{ busy: isSubmitting }}
                  >
                    <LinearGradient
                      colors={['#1E7B4C', '#0E6342', '#0A563A']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={styles.primaryButton}
                    >
                      {isSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={styles.primaryButtonRow}>
                          <Text style={styles.primaryButtonText}>Continue</Text>
                          <Icon name="arrowRight" size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* Browsing needs no account, so the way past sign-in is a real
                    button, not only the small Skip in the corner. No account,
                    fake or otherwise, is created — the app simply opens as a
                    guest, and anything that needs an account asks for one
                    when it is tapped (`requireSignIn`). */}
                <View style={{ marginTop: 12 }}>
                  <Button
                    label="Continue as guest"
                    variant="ghost"
                    fullWidth
                    onPress={() => void leaveAsGuest()}
                  />
                </View>

                {/* Terms and Privacy Policy (Exact 2 lines) */}
                <Text style={styles.termsText}>
                  By continuing, you agree to our{'\n'}
                  <Text style={styles.termsLink}>Terms & Conditions</Text> and{' '}
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </Text>
              </View>
            </Animated.View>

            {/* ============================================================ */}
            {/* BACK SIDE: OTP Verification Form                             */}
            {/* ============================================================ */}
            <Animated.View
              style={[styles.cardSide, backAnimatedStyle]}
              pointerEvents={isFlipped ? 'auto' : 'none'}
            >
              <Text style={styles.headline}>
                {usesPassword ? 'Enter your password' : 'Enter the code'}
              </Text>
              <Text style={styles.subtitle}>
                {usesPassword ? 'Signing in to' : `We sent ${config.otpLength} digits to`}{'\n'}
                <Text style={{ fontWeight: '700', color: '#141A24' }}>
                  {pendingPhoneMasked ?? pendingPhone ?? 'your phone'}
                </Text>.
              </Text>

              <View style={styles.formArea}>
                {usesPassword ? (
                  <>
                    <View
                      style={[
                        styles.phoneInputContainer,
                        passwordFocused && styles.phoneInputFocused,
                        otpState === 'error' && styles.phoneInputError,
                      ]}
                    >
                      <Icon name="security" size={18} color="#0A5A41" />
                      <View style={styles.divider} />
                      <TextInput
                        value={code}
                        onChangeText={(nextCode) => {
                          setCode(nextCode);
                          if (otpState === 'error' && !lockedLabel && !expiredMessage) {
                            setOtpState('idle');
                            setProblem(null);
                          }
                        }}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        onSubmitEditing={() => submitOtp(code)}
                        placeholder="Password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        autoCapitalize="none"
                        autoCorrect={false}
                        textContentType="password"
                        autoComplete="password"
                        returnKeyType="go"
                        style={styles.phoneInput}
                        selectionColor="#0A5A41"
                        accessibilityLabel="Password"
                      />
                    </View>
                    {otpState === 'error' && codeError ? (
                      <Text style={styles.errorText}>{codeError}</Text>
                    ) : null}
                  </>
                ) : (
                <OtpInput
                  value={code}
                  onChange={(nextCode) => {
                    setCode(nextCode);
                    if (otpState === 'error' && !lockedLabel && !expiredMessage) {
                      setOtpState('idle');
                      setProblem(null);
                    }
                  }}
                  length={config.otpLength}
                  state={otpState}
                  errorMessage={codeError}
                  onComplete={submitOtp}
                />
                )}

                {lockedLabel ? (
                  <View style={{ marginTop: 16, width: '100%' }}>
                    <InlineAlert
                      tone="warning"
                      title={usesPassword ? 'Sign-in locked' : 'Code locked'}
                      body={usesPassword
                        ? 'Too many wrong tries. Go back and enter the number again.'
                        : 'Too many wrong tries. Ask for a new one below.'}
                    />
                  </View>
                ) : null}

                {expiredMessage ? (
                  <View style={{ marginTop: 16, width: '100%' }}>
                    <InlineAlert
                      tone="warning"
                      title="Code expired"
                      body={expiredMessage}
                    />
                  </View>
                ) : null}

                <View style={{ marginTop: 24, gap: 16, width: '100%' }}>
                  <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap, { marginTop: 0 }]}>
                    <Pressable
                      onPress={() => submitOtp(code)}
                      disabled={!codeReady || isSubmitting}
                      style={({ pressed }) => [
                        styles.primaryButtonPress,
                        pressed && !isSubmitting ? { opacity: 0.92 } : null,
                      ]}
                    >
                      <LinearGradient
                        colors={['#1E7B4C', '#0E6342', '#0A563A']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                        style={styles.primaryButton}
                      >
                        {isSubmitting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <View style={styles.primaryButtonRow}>
                            <Text style={styles.primaryButtonText}>Verify & Continue</Text>
                            <Icon name="arrowRight" size={20} color="#FFFFFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {usesPassword ? null : resendIn > 0 ? (
                    <Text style={styles.resendCountdownText}>
                      Ask for another code in {resendIn}s
                    </Text>
                  ) : (
                    <Button label="Send a new code" variant="ghost" onPress={handleResend} fullWidth />
                  )}

                  <Button label="Use a different number" variant="ghost" onPress={handleUseAnotherNumber} fullWidth />
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>

      {/* Footer Text: Guaranteed single line across all screens */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={styles.footerScriptText}
        >
          Better Stays  <Text style={styles.footerPipe}>|</Text>  Fresher Bites  <Text style={styles.footerPipe}>|</Text>  Brighter Days
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  skipButton: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  skipButtonText: { fontSize: 13, fontWeight: '600', color: '#3D4247' },

  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backgroundBlobs: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 1,
  },
  centerWrapper: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoHeader: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logoBadge: {
    width: 216,
    height: 62,
  },
  flipContainer: {
    width: '100%',
    position: 'relative',
    minHeight: 380,
  },
  cardSide: {
    alignItems: 'center',
    width: '100%',
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: '#141A24',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  textGreen: {
    color: '#0A5E44',
    fontSize: 30,
    fontWeight: '800',
  },
  textGreenLight: {
    color: '#4FA97B',
    fontSize: 27,
    fontWeight: '600',
  },
  resendCountdownText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: '#7C808C',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 22,
  },
  subtitleTight: {
    marginTop: 2,
  },
  formArea: {
    width: '100%',
    marginTop: 32,
    alignItems: 'center',
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E6EAE7',
    borderRadius: 30,
    paddingHorizontal: 14,
    paddingVertical: 11,
    /* The field is shorter now, so the 44pt floor is stated rather than left
       to fall out of the padding — at a large OS font scale the padding grows
       with nothing, while the text inside grows the box past this anyway. */
    minHeight: 46,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    width: '100%',
  },
  phoneInputFocused: {
    borderColor: '#0A5A41',
    shadowOpacity: 0.06,
  },
  phoneInputError: {
    borderColor: '#EF4444',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#141A24',
    marginLeft: 6,
  },
  divider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 10,
  },
  phoneInput: {
    flex: 1,
    fontSize: 16,
    color: '#141A24',
    fontWeight: '500',
    /* Android gives a bare `TextInput` its own vertical padding on top of the
       container's. Left in, it is the reason this field measured taller than
       its padding said it should. */
    paddingVertical: 0,
  },
  /* The empty state only — see the note at the call site. */
  phoneInputEmpty: {
    fontSize: 14,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginTop: 8,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
  primaryButtonWrap: {
    width: '100%',
    marginTop: 20,
    borderRadius: 30,
    shadowColor: '#0A563A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryButtonPress: {
    borderRadius: 30,
    overflow: 'hidden',
  },
  primaryButton: {
    borderRadius: 30,
    paddingVertical: 17,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  termsText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8E95A2',
    lineHeight: 19,
    marginTop: 20,
    width: '100%',
  },
  termsLink: {
    color: '#0A5A41',
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
    zIndex: 1,
  },
  footerScriptText: {
    fontFamily: 'DancingScript_600SemiBold',
    fontSize: 15,
    lineHeight: 22,
    color: '#18583E',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  footerPipe: {
    color: '#CBD5E1',
    fontSize: 13,
    marginHorizontal: 8,
  },
});
