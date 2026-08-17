import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Sheet } from "@/components/ui";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, typography as t } from "@/theme";

/** Blocking state — no bottom navigation, only one way out. */
export default function SuspendedScreen() {
  const insets = useSafeAreaInsets();
  const setOverlay = useFlowStore((s) => s.setOverlay);
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + ms(60) }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>!</Text>
        </View>

        <Text style={styles.title}>Account temporarily suspended</Text>
        <Text style={styles.body}>
          Three customer complaints were raised on 12 Aug. Your account is under review and you
          cannot go online until it closes.
        </Text>

        <View style={styles.card}>
          <Text style={t.kicker}>Review reference</Text>
          <Text style={styles.ref}>SUS-20826</Text>
          <Text style={styles.refBody}>
            Expected decision within 48 hours. Pending earnings of ₹1,180 are safe and will be paid
            out.
          </Text>
        </View>

        <Btn
          label="Talk to support"
          onPress={() => router.push("/support")}
          style={{ marginTop: ms(16) }}
        />
        <Btn
          label="Log out"
          variant="ghost"
          onPress={() => setOverlay("logout")}
          style={{ marginTop: ms(9) }}
        />
      </ScrollView>

      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: ms(24), paddingBottom: ms(60) },
  mark: {
    width: ms(60),
    height: ms(60),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.err,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  markGlyph: { ...font.headingBold, fontSize: ms(30), lineHeight: ms(34), color: colors.err },
  title: {
    ...font.headingBold,
    fontSize: ms(30),
    lineHeight: ms(34),
    color: colors.text,
    marginTop: ms(20),
    textAlign: "center",
  },
  body: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(22),
    color: colors.neutral700,
    marginTop: ms(10),
    textAlign: "center",
  },
  card: {
    marginTop: ms(20),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: ms(16),
  },
  ref: {
    ...font.heading,
    fontSize: ms(17),
    lineHeight: ms(20),
    color: colors.text,
    marginTop: ms(5),
    fontVariant: ["tabular-nums"],
  },
  refBody: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(6),
  },
});
