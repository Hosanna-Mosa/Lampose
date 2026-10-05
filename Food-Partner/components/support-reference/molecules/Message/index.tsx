import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { Txt, fadeInUp } from "@/components/ui";
import { clockWords } from "@/lib/when";
import { type SupportMessage } from "@/services/support";
import { font, line, size, ui } from "@/theme/ui";

export function Message({ message }: { message: SupportMessage }) {
  const at = clockWords(message.at);

  /*
   * A system line is what the queue DID, not what anybody said. It gets the
   * shape of a divider — rules either side, centred, no bubble, no side —
   * because a bubble is the shape of a promise.
   */
  if (message.author === "system") {
    return (
      <View style={styles.systemRow}>
        <View style={styles.rule} />
        <Txt style={styles.systemText}>
          {message.body}
          {at ? ` · ${at}` : ""}
        </Txt>
        <View style={styles.rule} />
      </View>
    );
  }

  /* `customer` is whoever FILED the ticket — this restaurant, in this app. */
  const mine = message.author === "customer";

  return (
    <Animated.View entering={fadeInUp(0)} style={[styles.row, { justifyContent: mine ? "flex-end" : "flex-start" }]}>
      {!mine ? (
        <View style={styles.avatar}>
          <Ionicons name="headset" size={13} color={ui.brandInk} />
        </View>
      ) : null}
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Txt style={[styles.author, { color: mine ? ui.onBrand : ui.muted }]}>
          {mine ? "You" : message.authorName || "Lampose support"}
        </Txt>
        <Txt style={[styles.text, { color: mine ? ui.onBrand : ui.text }]}>{message.body}</Txt>
        {!!at && <Txt style={[styles.time, { color: mine ? ui.onBrand : ui.sec }]}>{at}</Txt>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  systemRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 6 },
  rule: { flex: 1, height: 1, backgroundColor: ui.border },
  systemText: {
    flexShrink: 1,
    fontFamily: font.body.semibold,
    fontSize: size.small,
    lineHeight: line.small,
    letterSpacing: 0.4,
    color: ui.muted,
    textAlign: "center",
  },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: ui.brandSkin,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  mine: { backgroundColor: ui.brand, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: ui.surface, borderWidth: 1, borderColor: ui.border, borderBottomLeftRadius: 4 },
  author: { fontFamily: font.body.bold, fontSize: size.small, letterSpacing: 0.6, textTransform: "uppercase", opacity: 0.85 },
  text: { fontFamily: font.body.regular, fontSize: size.medium, lineHeight: line.medium },
  time: { fontFamily: font.body.medium, fontSize: size.small, alignSelf: "flex-end", opacity: 0.75 },
});
