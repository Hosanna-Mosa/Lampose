import { useRouter } from 'expo-router';
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

import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Icon } from '@/components/common/atoms/Icon';
import { OTPInput } from '@/components/common/molecules/OTPInput';
import { useAuth } from '@/context/AuthContext';
import { isValidIndianMobile, phoneError, sendFailureCopy } from './authHelpers';

/**
 * 3D Flip Authentication Screen for Stay Partner App
 * Matched directly to the reference design with authentic brand logo,
 * soft pastel background SVG shapes, 3D card flip transitions, and emerald styling.
 * Front side: Phone Number Entry
 * Back side: OTP Verification
 */
export function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();

  const {
    pendingPhone,
    pendingPhoneMasked,
    otpLength,
    resendIn,
    isSubmitting,
    sendFailure,
    failureMessage,
    sendCode,
    resendCode,
    verifyCode,
    changeNumber,
    signInWithPassword,
  } = useAuth();

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

  /*
   * Which door the front of the card is showing.
   *
   * Phone stays the default: it is how every owner who has not been handed a
   * password signs in, and the server cannot sign the rest of them in that way
   * at all. The password form is the second door, not the front one — and it
   * lives on this same face, so a flip to the back is still only ever
   * something a sent code does.
   */
  const [mode, setMode] = useState<'phone' | 'password'>('phone');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState<string | undefined>(undefined);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  const canSubmitPassword = email.trim().length > 0 && password.length > 0;

  // Back Form State (OTP)
  const [code, setCode] = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [lockedLabel, setLockedLabel] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [invalidOtp, setInvalidOtp] = useState(false);

  // 3D Flip State (0 = Front/Phone, 180 = Back/OTP)
  const flipValue = useSharedValue(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Sync flip state with pendingPhone
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

  const signIn = async () => {
    if (!canSubmitPassword || isSubmitting) return;
    setPwError(undefined);

    Keyboard.dismiss();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await signInWithPassword(email, password);
    if (!result.ok) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setPwError(result.message);
      return;
    }

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}

    /* The same fork `verifyCode`'s caller takes. An account provisioned
       without a name has never filled the profile in, and the dashboard reads
       fields that setup writes — so it goes there first, exactly as a new
       owner does after a code. */
    router.replace(result.profileComplete ? '/' : '/profile-setup');
  };

  const switchMode = (next: 'phone' | 'password') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    Keyboard.dismiss();
    setMode(next);
    setPwError(undefined);
    setTouched(false);
  };

  const submitOtp = async (value: string) => {
    if (value.length !== otpLength || isSubmitting) return;
    setProblem(null);
    setInvalidOtp(false);

    Keyboard.dismiss();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const result = await verifyCode(value);
    if (result.ok) {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}
      router.replace(result.profileComplete ? '/' : '/profile-setup');
    } else {
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } catch {}
      setInvalidOtp(true);
      if (result.reason === 'wrong') setAttemptsLeft(result.attemptsLeft);
      else if (result.reason === 'locked') setLockedLabel(result.unlocksAtLabel);
      else if (result.reason === 'expired') setProblem('Code has expired. Request a new one below.');
      else setProblem(result.message);
    }
  };

  const handleResend = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    setCode('');
    setInvalidOtp(false);
    setAttemptsLeft(null);
    setLockedLabel(null);
    setProblem(null);
    await resendCode();
  };

  const handleUseAnotherNumber = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    setCode('');
    setInvalidOtp(false);
    setAttemptsLeft(null);
    setLockedLabel(null);
    setProblem(null);
    changeNumber();
  };

  const failure = sendFailure
    ? sendFailureCopy(sendFailure, {
        retryAfterLabel: resendIn > 0 ? `${resendIn} seconds` : 'a few minutes',
      })
    : null;

  const codeError = lockedLabel
    ? `Too many tries. Ask for a new code after ${lockedLabel}.`
    : problem ??
      (attemptsLeft !== null
        ? `That code is wrong — ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : undefined);

  // The one CTA drives both doors, so its disabled state has to read both.
  const ctaDisabled = mode === 'phone'
    ? isSubmitting
    : isSubmitting || !canSubmitPassword;

  const displayPhone = pendingPhoneMasked ?? (pendingPhone ? `+91 ${pendingPhone.replace(/\D/g, '').slice(-10)}` : 'your phone');

  return (
    <View style={styles.rootContainer}>
      <StatusBar style="dark" />

      {/* Decorative background SVG shapes */}
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
          <Path
            d={`M 0 70 C ${screenWidth * 0.12} 85, ${screenWidth * 0.26} 125, ${screenWidth * 0.40} 170 L 0 170 Z`}
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
        <View style={styles.centerWrapper}>
          {/* Authentic Logo Header */}
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
                <Text style={styles.textGreenLight}> </Text>
                <Text style={styles.textGreen}>Partner</Text>
              </Text>
              <Text style={styles.headline}>All in One Place</Text>

              {/* Subtitle */}
              <Text style={styles.subtitle}>
                Manage rooms, hostels, hotels and more.
              </Text>
              <Text style={[styles.subtitle, styles.subtitleTight]}>
                Simple. Fast. Trusted.
              </Text>

              {/* Form Area */}
              <View style={styles.formArea}>
                {mode === 'phone' ? (
                  <>
                    <Pressable
                      onPress={() => inputRef.current?.focus()}
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
                        style={[styles.phoneInput, digits.length === 0 && styles.phoneInputEmpty]}
                        selectionColor="#0A5A41"
                      />
                    </Pressable>

                    {numberError ? (
                      <Text style={styles.errorText}>{numberError}</Text>
                    ) : null}

                    {failure ? (
                      <View style={styles.alertBanner}>
                        <Text style={styles.alertTitle}>{failure.headline}</Text>
                        <Text style={styles.alertBody}>{failureMessage ?? failure.body}</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <View
                      style={[
                        styles.phoneInputContainer,
                        emailFocused && styles.phoneInputFocused,
                        Boolean(pwError) && styles.phoneInputError,
                      ]}
                    >
                      <Icon name="user" size={18} color="#0A5A41" />
                      <View style={styles.divider} />
                      <TextInput
                        value={email}
                        onChangeText={(next) => {
                          setEmail(next);
                          if (pwError) setPwError(undefined);
                        }}
                        onFocus={() => setEmailFocused(true)}
                        onBlur={() => setEmailFocused(false)}
                        placeholder="you@email.com"
                        placeholderTextColor="#94A3B8"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        textContentType="emailAddress"
                        autoComplete="email"
                        returnKeyType="next"
                        onSubmitEditing={() => passwordRef.current?.focus()}
                        editable={!isSubmitting}
                        style={[styles.phoneInput, email.length === 0 && styles.phoneInputEmpty]}
                        selectionColor="#0A5A41"
                      />
                    </View>

                    <View
                      style={[
                        styles.phoneInputContainer,
                        styles.fieldSpacing,
                        passwordFocused && styles.phoneInputFocused,
                        Boolean(pwError) && styles.phoneInputError,
                      ]}
                    >
                      <Icon name="lock" size={18} color="#0A5A41" />
                      <View style={styles.divider} />
                      <TextInput
                        ref={passwordRef}
                        value={password}
                        onChangeText={(next) => {
                          setPassword(next);
                          if (pwError) setPwError(undefined);
                        }}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        placeholder="Your password"
                        placeholderTextColor="#94A3B8"
                        secureTextEntry
                        autoCapitalize="none"
                        textContentType="password"
                        autoComplete="current-password"
                        returnKeyType="go"
                        onSubmitEditing={signIn}
                        editable={!isSubmitting}
                        style={[styles.phoneInput, password.length === 0 && styles.phoneInputEmpty]}
                        selectionColor="#0A5A41"
                      />
                    </View>

                    {/* The server's sentence, and it is the same one for a wrong
                        address as for a wrong password — on purpose, so this
                        screen cannot be used to find out which owners Lampose
                        has. */}
                    {pwError ? (
                      <Text style={styles.errorText}>{pwError}</Text>
                    ) : null}
                  </>
                )}

                {/* Continue Button: Rich vibrant emerald gradient */}
                <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap]}>
                  <Pressable
                    onPress={mode === 'phone' ? submitPhone : signIn}
                    disabled={ctaDisabled}
                    style={({ pressed }) => [
                      styles.primaryButtonPress,
                      ctaDisabled && { opacity: 0.6 },
                      pressed && !ctaDisabled ? { opacity: 0.92 } : null,
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'phone' ? 'Continue' : 'Log in'}
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
                          <Text style={styles.primaryButtonText}>
                            {mode === 'phone' ? 'Continue' : 'Log in'}
                          </Text>
                          <Icon name="arrow-right" size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </LinearGradient>
                  </Pressable>
                </Animated.View>

                {/* The second door. Phone is still the way in; this is the
                    way in for the owners who were handed a password instead. */}
                <Pressable
                  onPress={() => switchMode(mode === 'phone' ? 'password' : 'phone')}
                  disabled={isSubmitting}
                  style={[styles.ghostButton, styles.switchModeButton]}
                  accessibilityRole="button"
                >
                  <Text style={styles.ghostButtonText}>
                    {mode === 'phone'
                      ? 'Log in with email and password'
                      : 'Use my mobile number instead'}
                  </Text>
                </Pressable>

                {/* Terms and Privacy Policy */}
                <Text style={styles.termsText}>
                  By continuing, you agree to our{'\n'}
                  <Text style={styles.termsLink}>Partner Terms</Text> and{' '}
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
              <Text style={styles.headline}>Enter the code</Text>
              <Text style={styles.subtitle}>
                We sent {otpLength} digits to{'\n'}
                <Text style={{ fontWeight: '700', color: '#141A24' }}>
                  {displayPhone}
                </Text>.
              </Text>

              <View style={styles.formArea}>
                <OTPInput
                  value={code}
                  onChangeText={(nextCode) => {
                    setCode(nextCode);
                    if (invalidOtp) {
                      setInvalidOtp(false);
                      setProblem(null);
                    }
                  }}
                  length={otpLength}
                  invalid={invalidOtp}
                  disabled={isSubmitting}
                  autoFocus
                />

                {codeError ? (
                  <Text style={styles.errorTextCenter}>{codeError}</Text>
                ) : null}

                <View style={{ marginTop: 24, gap: 14, width: '100%' }}>
                  <Animated.View style={[buttonAnimatedStyle, styles.primaryButtonWrap, { marginTop: 0 }]}>
                    <Pressable
                      onPress={() => submitOtp(code)}
                      disabled={code.length !== otpLength || isSubmitting}
                      style={({ pressed }) => [
                        styles.primaryButtonPress,
                        (code.length !== otpLength || isSubmitting) && { opacity: 0.6 },
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
                            <Icon name="arrow-right" size={20} color="#FFFFFF" />
                          </View>
                        )}
                      </LinearGradient>
                    </Pressable>
                  </Animated.View>

                  {resendIn > 0 ? (
                    <Text style={styles.resendCountdownText}>
                      Ask for another code in {resendIn}s
                    </Text>
                  ) : (
                    <Pressable onPress={handleResend} style={styles.ghostButton}>
                      <Text style={styles.ghostButtonText}>Send a new code</Text>
                    </Pressable>
                  )}

                  <Pressable onPress={handleUseAnotherNumber} style={styles.ghostButton}>
                    <Text style={styles.ghostButtonText}>Use a different number</Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>
      </KeyboardAwareScrollViewCompat>

      {/* Footer Text */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 12, 22) }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={styles.footerScriptText}
        >
          Better Stays  <Text style={styles.footerPipe}>|</Text>  Better Hosts  <Text style={styles.footerPipe}>|</Text>  Brighter Days
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingVertical: 6,
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
  fieldSpacing: {
    marginTop: 12,
  },
  switchModeButton: {
    marginTop: 14,
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
    paddingVertical: 0,
  },
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
  errorTextCenter: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
  alertBanner: {
    marginTop: 14,
    width: '100%',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  alertBody: {
    fontSize: 12,
    color: '#B91C1C',
    marginTop: 2,
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
  ghostButton: {
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  ghostButtonText: {
    color: '#0A5A41',
    fontSize: 14,
    fontWeight: '600',
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
    fontSize: 15,
    lineHeight: 22,
    color: '#18583E',
    textAlign: 'center',
    letterSpacing: 0.2,
    fontWeight: '600',
  },
  footerPipe: {
    color: '#CBD5E1',
    fontSize: 13,
    marginHorizontal: 8,
  },
});
