import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Rule, StepBars } from "@/components/ui";
import { DRIVER, ONB, ONB_TOTAL_STEPS, type OnbStep } from "@/constants/lampose";
import { useDriverStore } from "@/store/driverStore";
import { colors, font, ms, radius, typography as t } from "@/theme";

/** Partially-entered code, exactly as the design shows it. */
const OTP_ENTERED = "4926";
const OTP_LENGTH = 6;

/**
 * The full ten-screen partner sign-up, driven by the ONB table: welcome,
 * number, OTP, personal details, vehicle, documents, bank, pending review,
 * a rejection, and approval.
 */
export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const setAuthenticated = useDriverStore((s) => s.setAuthenticated);
  const setHasCompletedOnboarding = useDriverStore((s) => s.setHasCompletedOnboarding);

  const [step, setStep] = useState<OnbStep>("welcome");
  const spec = ONB[step];

  const advance = () => {
    if (spec.next) {
      setStep(spec.next);
      return;
    }
    // "Start driving" — mint the demo session and hand over to the tabs.
    setAuthenticated(DRIVER.name, DRIVER.phone, `lampose.${DRIVER.partnerId}`, DRIVER.partnerId, {
      hasCompletedOnboarding: true,
      identityVerified: true,
    });
    setHasCompletedOnboarding(true);
  };

  const onAlt = () => {
    if (spec.altRoute) router.push(spec.altRoute as never);
    else if (spec.altStep) setStep(spec.altStep);
  };

  const centered = spec.centered ? ({ textAlign: "center" } as const) : undefined;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(6) }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Progress ─────────────────────────────────────────────── */}
        {!!spec.step && (
          <View>
            <View style={styles.progressHead}>
              <Text style={t.kicker}>
                Step {spec.step} of {ONB_TOTAL_STEPS}
              </Text>
              <Pressable onPress={() => setStep("welcome")} hitSlop={8}>
                <Text style={styles.saveExit}>Save &amp; exit</Text>
              </Pressable>
            </View>
            <StepBars
              total={ONB_TOTAL_STEPS}
              current={spec.step - 1}
              height={ms(4)}
              style={{ marginTop: ms(10) }}
            />
          </View>
        )}

        <View style={{ marginTop: ms(26), flex: 1 }}>
          {/* ── Wordmark ───────────────────────────────────────────── */}
          {spec.logo && (
            <View style={styles.logoBlock}>
              <Text style={styles.wordmark}>Lampose</Text>
              <Text style={styles.wordmarkSub}>Driver partner</Text>
              <Rule style={styles.wordmarkRule} />
            </View>
          )}

          <Text style={[styles.title, centered]}>{spec.title}</Text>
          <Text style={[styles.body, centered]}>{spec.body}</Text>

          {/* ── Prefilled fields ───────────────────────────────────── */}
          {!!spec.fields && (
            <View style={{ marginTop: ms(22), gap: ms(14) }}>
              {spec.fields.map((f) => (
                <View key={f.l}>
                  <Text style={styles.fieldLabel}>{f.l}</Text>
                  <View style={styles.field}>
                    <Text style={[styles.fieldValue, f.tone ? { color: f.tone } : null]}>
                      {f.v}
                    </Text>
                    {!!f.hint && <Text style={styles.fieldHint}>{f.hint}</Text>}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── OTP ────────────────────────────────────────────────── */}
          {spec.otp && (
            <>
              <View style={styles.otpRow}>
                {Array.from({ length: OTP_LENGTH }, (_, i) => {
                  const filled = i < OTP_ENTERED.length;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.otpBox,
                        { borderColor: filled ? colors.ink : colors.divider },
                      ]}
                    >
                      <Text style={styles.otpDigit}>{filled ? OTP_ENTERED[i] : ""}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={styles.resend}>Resend code in 0:24</Text>
            </>
          )}

          {/* ── Document checklist ─────────────────────────────────── */}
          {!!spec.list && (
            <View style={{ marginTop: ms(22), gap: ms(10) }}>
              {spec.list.map((item) => (
                <View
                  key={item.t}
                  style={[
                    styles.listCard,
                    { borderColor: item.tone === colors.err ? colors.err : colors.divider },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listTitle}>{item.t}</Text>
                    <Text style={styles.listSub}>{item.sub}</Text>
                  </View>
                  <Chip label={item.status} tone={item.tone} />
                </View>
              ))}
            </View>
          )}

          {/* ── Status badge ───────────────────────────────────────── */}
          {!!spec.badge && (
            <View style={{ marginTop: ms(26), alignItems: "center" }}>
              <View
                style={[
                  styles.badge,
                  {
                    width: ms(spec.badgeSize ?? 64),
                    height: ms(spec.badgeSize ?? 64),
                    borderColor: spec.badgeTone ?? colors.divider,
                  },
                ]}
              >
                <Text style={[styles.badgeGlyph, { color: spec.badgeTone ?? colors.text }]}>
                  {spec.badge}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <View style={{ marginTop: ms(26) }}>
          <Btn label={spec.cta} onPress={advance} />
          {!!spec.alt && (
            <Btn label={spec.alt} variant="ghost" onPress={onAlt} style={{ marginTop: ms(9) }} />
          )}
          {!!spec.fine && <Text style={styles.fine}>{spec.fine}</Text>}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: ms(22), paddingBottom: ms(26) },

  progressHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  saveExit: { ...font.body, fontSize: ms(12.5), color: colors.neutral600 },

  logoBlock: { alignItems: "center", paddingTop: ms(40), paddingBottom: ms(10) },
  wordmark: {
    ...font.headingBold,
    fontSize: ms(46),
    lineHeight: ms(50),
    letterSpacing: -0.7,
    color: colors.text,
  },
  wordmarkSub: {
    ...font.bodySemi,
    fontSize: ms(10),
    letterSpacing: ms(10) * 0.3,
    textTransform: "uppercase",
    color: colors.accent,
    marginTop: ms(12),
  },
  wordmarkRule: { marginTop: ms(26), marginHorizontal: ms(40), alignSelf: "stretch" },

  title: {
    ...font.headingBold,
    fontSize: ms(30),
    lineHeight: ms(34),
    letterSpacing: -0.3,
    color: colors.text,
  },
  body: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(22),
    color: colors.neutral700,
    marginTop: ms(10),
  },

  fieldLabel: {
    ...font.bodySemi,
    fontSize: ms(9.5),
    letterSpacing: ms(9.5) * 0.14,
    textTransform: "uppercase",
    color: colors.neutral600,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: ms(10),
    marginTop: ms(7),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: ms(13),
    paddingVertical: ms(14),
    backgroundColor: colors.neutral100,
  },
  fieldValue: { ...font.body, fontSize: ms(15), color: colors.text, flex: 1 },
  fieldHint: { ...font.body, fontSize: ms(12), color: colors.accent },

  otpRow: { flexDirection: "row", gap: ms(10), marginTop: ms(24) },
  otpBox: {
    flex: 1,
    height: ms(56),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.neutral100,
  },
  otpDigit: {
    ...font.headingBold,
    fontSize: ms(24),
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  resend: {
    ...font.body,
    fontSize: ms(12.5),
    color: colors.neutral600,
    marginTop: ms(14),
    fontVariant: ["tabular-nums"],
  },

  listCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: ms(14),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: ms(10),
  },
  listTitle: { ...font.heading, fontSize: ms(16), lineHeight: ms(19), color: colors.text },
  listSub: {
    ...font.body,
    fontSize: ms(11.5),
    lineHeight: ms(16),
    color: colors.neutral700,
    marginTop: ms(4),
  },

  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeGlyph: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(34) },

  fine: {
    textAlign: "center",
    ...font.body,
    fontSize: ms(11.5),
    lineHeight: ms(17),
    color: colors.neutral500,
    marginTop: ms(14),
  },
});
