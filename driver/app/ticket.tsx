import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Chip, Icon, Toast, TopBar } from "@/components/ui";
import { CHAT } from "@/constants/lampose";
import { useFlowStore } from "@/store/flowStore";
import { colors, font, ms, radius, space } from "@/theme";

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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top }}>
        <TopBar back="Support" center="TCK-3391" />
      </View>

      <View style={styles.subject}>
        <Text style={styles.subjectTitle}>Payment missing for #LP48102</Text>
        <Chip label="Open" tone={colors.warn} style={{ marginTop: ms(8) }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.thread}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m, i) => (
          <View
            key={`${m.at}-${i}`}
            style={[styles.row, { alignItems: m.me ? "flex-end" : "flex-start" }]}
          >
            <View style={[styles.bubble, m.me ? styles.bubbleMe : styles.bubbleThem]}>
              <Text style={[styles.bubbleText, m.me && { color: colors.bg }]}>{m.t}</Text>
            </View>
            <Text style={styles.at}>{m.at}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, ms(12)) }]}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a reply…"
          placeholderTextColor={colors.neutral500}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim()}
          accessibilityRole="button"
          accessibilityLabel="Send reply"
          style={({ pressed }) => [
            styles.send,
            !draft.trim() && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Icon name="arrowRight" size={ms(18)} color={colors.bg} strokeWidth={1.8} />
        </Pressable>
      </View>

      <Toast message={toast} top={insets.top + ms(8)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  subject: {
    paddingHorizontal: space[4],
    paddingBottom: ms(14),
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  subjectTitle: {
    ...font.heading,
    fontSize: ms(22),
    lineHeight: ms(26),
    color: colors.text,
  },
  thread: { padding: space[4], gap: ms(14) },
  row: { gap: ms(4) },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    borderRadius: radius.lg,
  },
  bubbleMe: { backgroundColor: colors.ink },
  bubbleThem: {
    backgroundColor: colors.neutral100,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  bubbleText: {
    ...font.body,
    fontSize: ms(13.5),
    lineHeight: ms(20),
    color: colors.text,
  },
  at: {
    ...font.body,
    fontSize: ms(10.5),
    color: colors.neutral500,
    fontVariant: ["tabular-nums"],
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: ms(9),
    paddingHorizontal: space[4],
    paddingTop: ms(12),
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    minHeight: ms(42),
    maxHeight: ms(110),
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: ms(12),
    paddingVertical: ms(10),
    ...font.body,
    fontSize: ms(14),
    color: colors.text,
  },
  send: {
    width: ms(42),
    height: ms(42),
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
});
