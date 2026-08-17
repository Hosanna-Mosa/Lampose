import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Sheet, Toast, TopBar } from "@/components/ui";
import { DOCS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space } from "@/theme";

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Profile" />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Documents</Text>
        <Text style={styles.sub}>
          Keep all five valid to stay online. We verify uploads within 24 hours.
        </Text>

        <View style={{ marginTop: ms(16), gap: ms(10) }}>
          {DOCS.map((d) => {
            const failing = d.tone === colors.err;
            return (
              <View
                key={d.t}
                style={[styles.card, { borderColor: failing ? colors.err : colors.divider }]}
              >
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.docTitle}>{d.t}</Text>
                    <Text style={styles.docMeta}>{d.meta}</Text>
                  </View>
                  <Chip label={d.status} tone={d.tone} />
                </View>

                {"reason" in d && !!d.reason && (
                  <Text style={styles.reason}>{d.reason}</Text>
                )}

                <View style={styles.actions}>
                  <Btn
                    label="View"
                    variant="quiet"
                    onPress={() => say("Opening document viewer…")}
                    style={{ flex: 1 }}
                  />
                  <Btn
                    label={d.act}
                    variant={failing ? "danger" : "accent"}
                    onPress={() => say("Camera opened — capture the document.")}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + ms(8)} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space[4], paddingBottom: ms(26) },
  title: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(31),
    color: colors.text,
    marginTop: ms(12),
  },
  sub: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(19),
    color: colors.neutral700,
    marginTop: ms(4),
  },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: ms(14) },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: ms(10) },
  docTitle: { ...font.heading, fontSize: ms(17), lineHeight: ms(20), color: colors.text },
  docMeta: {
    ...font.body,
    fontSize: ms(12),
    lineHeight: ms(17),
    color: colors.neutral700,
    marginTop: ms(4),
    fontVariant: ["tabular-nums"],
  },
  reason: {
    ...font.body,
    fontSize: ms(12.5),
    lineHeight: ms(18),
    color: colors.err,
    marginTop: ms(9),
    borderLeftWidth: 2,
    borderLeftColor: colors.err,
    paddingLeft: ms(10),
  },
  actions: { flexDirection: "row", gap: ms(8), marginTop: ms(12) },
});
