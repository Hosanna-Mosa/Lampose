import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, Chip, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { DOCS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space, tone as resolveTone } from "@/theme";

export default function DocumentsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const sheet = useSheet();

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Documents" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="caption" color="tertiary">
          Keep all five valid to stay online. We verify uploads within 24 hours.
        </Text>

        <View style={{ gap: space[3] }}>
          {DOCS.map((d) => {
            const failing = d.tone === "danger";
            const t = resolveTone(d.tone);

            return (
              <View
                key={d.t}
                style={[styles.card, failing && { borderColor: t.border, backgroundColor: t.tint }]}
              >
                <View style={styles.cardHead}>
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text variant="title1" numberOfLines={2}>
                      {d.t}
                    </Text>
                    <Text variant="numMeta" color="tertiary">
                      {d.meta}
                    </Text>
                  </View>
                  <Chip label={d.status} tone={d.tone} />
                </View>

                {/*
                  The reason is the whole point of a rejected document, so it
                  sits in its own tinted well rather than as a red line of text
                  — a rider who cannot see red still gets a distinct block.
                */}
                {"reason" in d && !!d.reason && (
                  <View style={[styles.reason, { backgroundColor: colors.surface, borderColor: t.border }]}>
                    <Text variant="caption" style={{ color: t.ink }}>
                      {d.reason}
                    </Text>
                  </View>
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
                    glyph="camera"
                    onPress={() => say("Camera opened — capture the document.")}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[4],
    backgroundColor: colors.surface,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space[3] },
  reason: {
    marginTop: space[3],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    padding: space[3],
  },
  actions: { flexDirection: "row", gap: space[2], marginTop: space[4] },
});
