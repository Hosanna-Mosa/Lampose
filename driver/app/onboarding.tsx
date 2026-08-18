import { router } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Rule, StepBars, Text, TopBar } from "@/components/ui";
import { DRIVER, ONB, ONB_TOTAL_STEPS, type OnbStep } from "@/constants/lampose";
import { useDriverStore } from "@/store/driverStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

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
  const badgeTone = spec.badgeTone ? resolveTone(spec.badgeTone) : null;

  return (
    <View style={styles.root}>
      {/*
        The step counter and its rail are pinned. Sign-up is the one flow where
        a partner is filling in long fields with a keyboard up — "how much of
        this is left" has to stay answerable without dismissing the keyboard
        and scrolling back.

        Welcome is the exception: it carries no step, and a bar over the
        wordmark would turn a brand moment into a form.
      */}
      {!!spec.step && (
        <>
          <TopBar
            title={`Step ${spec.step} of ${ONB_TOTAL_STEPS}`}
            action="Save & exit"
            onAction={() => setStep("welcome")}
          />
          <View style={styles.progressRail}>
            <StepBars total={ONB_TOTAL_STEPS} current={spec.step - 1} height={4} />
          </View>
        </>
      )}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: spec.step ? space[5] : insets.top + space[6] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flex: 1 }}>
          {/* ── Wordmark ───────────────────────────────────────────── */}
          {spec.logo && (
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
              <Rule style={styles.wordmarkRule} />
            </View>
          )}

          <Text variant="display1" style={centered}>
            {spec.title}
          </Text>
          <Text variant="bodyLg" color="secondary" style={[{ marginTop: space[2] }, centered]}>
            {spec.body}
          </Text>

          {/* ── Prefilled fields ───────────────────────────────────── */}
          {!!spec.fields && (
            <View style={{ marginTop: space[5], gap: space[3] }}>
              {spec.fields.map((f) => {
                const t = f.tone ? resolveTone(f.tone) : null;
                return (
                  <View key={f.l} style={{ gap: space[1] }}>
                    <Text variant="eyebrow" color="tertiary">
                      {f.l}
                    </Text>
                    <View style={styles.field}>
                      <Text
                        variant="bodyLg"
                        style={[{ flex: 1 }, t ? { color: t.ink } : null]}
                        numberOfLines={1}
                      >
                        {f.v}
                      </Text>
                      {!!f.hint && (
                        <Text variant="bodyStrong" color="brand">
                          {f.hint}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
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
                        filled
                          ? { borderColor: colors.brand, backgroundColor: colors.brandTint }
                          : { borderColor: colors.borderInput, backgroundColor: colors.surface },
                      ]}
                    >
                      <Text variant="priceHero">{filled ? OTP_ENTERED[i] : ""}</Text>
                    </View>
                  );
                })}
              </View>
              <Text variant="numMeta" color="tertiary" style={{ marginTop: space[3] }}>
                Resend code in 0:24
              </Text>
            </>
          )}

          {/* ── Document checklist ─────────────────────────────────── */}
          {!!spec.list && (
            <View style={{ marginTop: space[5], gap: space[2] }}>
              {spec.list.map((item) => {
                const t = resolveTone(item.tone);
                const failing = item.tone === "danger";
                return (
                  <View
                    key={item.t}
                    style={[
                      styles.listCard,
                      failing && { borderColor: t.border, backgroundColor: t.tint },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text variant="title2" numberOfLines={1}>
                        {item.t}
                      </Text>
                      <Text variant="caption" color="tertiary" numberOfLines={2}>
                        {item.sub}
                      </Text>
                    </View>
                    <Chip label={item.status} tone={item.tone} />
                  </View>
                );
              })}
            </View>
          )}

          {/* ── Status badge ───────────────────────────────────────── */}
          {!!spec.badge && (
            <View style={{ marginTop: space[6], alignItems: "center" }}>
              <View
                style={[
                  styles.badge,
                  {
                    width: spec.badgeSize ?? 64,
                    height: spec.badgeSize ?? 64,
                    backgroundColor: badgeTone ? badgeTone.tint : colors.surfaceSunken,
                    borderColor: badgeTone ? badgeTone.border : colors.border,
                  },
                ]}
              >
                <Text
                  variant="display1"
                  style={{ color: badgeTone ? badgeTone.ink : colors.textPrimary }}
                >
                  {spec.badge}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <View style={{ marginTop: space[6], gap: space[2] }}>
          <Btn label={spec.cta} onPress={advance} />
          {!!spec.alt && <Btn label={spec.alt} variant="ghost" onPress={onAlt} />}
          {!!spec.fine && (
            <Text variant="numMeta" color="tertiary" style={styles.fine}>
              {spec.fine}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, paddingHorizontal: layout.gutter + space[1], paddingBottom: space[6] },

  progressRail: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  logoBlock: { alignItems: "center", paddingTop: space[8], paddingBottom: space[2] },
  logoMark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkRule: { marginTop: space[6], marginHorizontal: space[8], alignSelf: "stretch" },

  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    paddingVertical: space[3] + 2,
    backgroundColor: colors.surface,
  },

  otpRow: { flexDirection: "row", gap: space[2], marginTop: space[6] },
  otpBox: {
    flex: 1,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: radius.button,
  },

  listCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space[3],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },

  badge: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },

  fine: { textAlign: "center", marginTop: space[2] },
});
