import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Icon, Text, Toast, TopBar } from "@/components/ui";
import { CHAT } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, resolveFontFamily, space, type as typeScale } from "@/theme";

type Message = { me: boolean; t: string; at: string };

export default function TicketScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say } = useFlowStore();
  const [messages, setMessages] = useState<Message[]>([...CHAT]);
  const [draft, setDraft] = useState("");

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { me: true, t: text, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) },
    ]);
    setDraft("");
    say("Message sent to support.");
  };

  const canSend = !!draft.trim();

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <TopBar back="Support" title="TCK-3391" />

      <View style={styles.subject}>
        <Text variant="display2">Payment missing for #LP48102</Text>
        <Chip label="Open" tone="warning" glyph="clock" style={{ marginTop: space[2] }} />
      </View>

      <ScrollView contentContainerStyle={styles.thread} showsVerticalScrollIndicator={false}>
        {messages.map((m, i) => (
          <View key={`${m.at}-${i}`} style={[styles.row, { alignItems: m.me ? "flex-end" : "flex-start" }]}>
            <View style={[styles.bubble, m.me ? styles.bubbleMe : styles.bubbleThem]}>
              <Text variant="bodyLg" color={m.me ? "onGraphite" : "primary"}>
                {m.t}
              </Text>
            </View>
            <Text variant="numMeta" color="tertiary">
              {m.at}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, space[3]) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a reply…"
          placeholderTextColor={colors.textTertiary}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: canSend ? (pressed ? colors.brandPressed : colors.brand) : colors.surfaceSunken },
          ]}
        >
          <Icon name="arrowRight" size={18} color={canSend ? colors.onBrand : colors.textTertiary} />
        </Pressable>
      </View>

      <Toast message={toast} top={insets.top + space[2]} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subject: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thread: { padding: layout.gutter, gap: space[3] },
  row: { gap: space[1] },
  bubble: { maxWidth: "82%", paddingHorizontal: space[3], paddingVertical: space[3], borderRadius: radius.card },
  bubbleMe: { backgroundColor: colors.graphite },
  bubbleThem: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[2],
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 112,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    paddingVertical: space[2] + 2,
    backgroundColor: colors.surface,
    // The composer is a raw TextInput, so it cannot go through `Text` — the
    // one place in the app that names a family and a size by hand.
    fontFamily: resolveFontFamily("body", 400),
    fontSize: typeScale.bodyLg.size,
    lineHeight: typeScale.bodyLg.lineHeight,
    color: colors.textPrimary,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.button,
    alignItems: "center",
    justifyContent: "center",
  },
});
