import { router } from "expo-router";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Btn, Icon, Sheet, Text, TopBar } from "@/components/ui";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/** Blocking state — no bottom navigation, only one way out. */
export default function SuspendedScreen() {
  const setOverlay = useFlowStore((s) => s.setOverlay);
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar title="Account status" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.mark}>
          <Icon name="alert" size={28} color={colors.danger.on} strokeWidth={2} />
        </View>

        <Text variant="display1" style={styles.centered}>
          Account temporarily suspended
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centered}>
          Three customer complaints were raised on 12 Aug. Your account is under review and you
          cannot go online until it closes.
        </Text>

        <View style={styles.card}>
          <Text variant="eyebrow" color="tertiary">
            Review reference
          </Text>
          <Text variant="priceLg" style={{ marginTop: space[2] }}>
            SUS-20826
          </Text>
          <Text variant="caption" color="secondary" style={{ marginTop: space[2] }}>
            Expected decision within 48 hours. Pending earnings of ₹1,180 are safe and will be paid
            out.
          </Text>
        </View>

        <Btn label="Talk to support" glyph="support" onPress={() => router.push("/support")} />
        <Btn label="Log out" variant="ghost" glyph="logout" onPress={() => setOverlay("logout")} />
      </ScrollView>

      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter + space[2], paddingTop: space[8], paddingBottom: space[8], gap: space[3] },
  centered: { textAlign: "center" },
  mark: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.danger.base,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space[2],
  },
  card: {
    marginTop: space[2],
    marginBottom: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
  },
});
