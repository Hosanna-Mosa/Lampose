import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, font, ms, radius, shadow, space, typography as t } from "@/theme";
import { Btn, Rule } from "./primitives";

export type SheetAction = { label: string; onPress: () => void };

export type SheetSpec = {
  kicker: string;
  tone: string;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  /** Optional pick-list rendered between the body and the buttons. */
  list?: { label: string; onPress: () => void }[];
};

/**
 * The bottom sheet every blocking decision uses — GPS off, permission,
 * poor network, cancel, log out, withdraw. Scrim, grabber, toned kicker,
 * heavy title, ink primary, ghost dismiss.
 */
export function Sheet({
  spec,
  visible,
  onPrimary,
  onDismiss,
}: {
  spec: SheetSpec | null;
  visible: boolean;
  onPrimary: () => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  if (!spec) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss}>
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[5]) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <Text style={[t.kicker, { color: spec.tone, letterSpacing: ms(10) * 0.16 }]}>
            {spec.kicker}
          </Text>
          <Text style={styles.title}>{spec.title}</Text>
          <Text style={styles.body}>{spec.body}</Text>

          {!!spec.list?.length && (
            <View style={styles.list}>
              <Rule />
              <ScrollView style={{ maxHeight: ms(240) }}>
                {spec.list.map((row) => (
                  <Pressable
                    key={row.label}
                    onPress={row.onPress}
                    style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.listLabel}>{row.label}</Text>
                    <Text style={styles.listChevron}>›</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Btn label={spec.primary} onPress={onPrimary} style={{ marginTop: space[4] }} />
          <Btn
            label={spec.secondary}
            variant="ghost"
            onPress={onDismiss}
            style={{ marginTop: space[2] }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Ink pill that drops in under the status bar to confirm an action. */
export function Toast({ message, top }: { message: string | null; top: number }) {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { top }]}>
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: "rgba(32, 31, 29, 0.46)",
    justifyContent: "flex-end",
  },
  panel: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: ms(20),
    borderTopRightRadius: ms(20),
    paddingHorizontal: space[4],
    paddingTop: space[5],
  },
  grabber: {
    width: ms(38),
    height: ms(4),
    borderRadius: radius.sm,
    backgroundColor: colors.neutral400,
    alignSelf: "center",
    marginBottom: space[4],
  },
  title: {
    ...font.headingBold,
    fontSize: ms(25),
    lineHeight: ms(29),
    color: colors.text,
    marginTop: space[2],
  },
  body: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(22),
    color: colors.neutral700,
    marginTop: space[2],
  },
  list: { marginTop: space[3] },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: ms(14),
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  listLabel: {
    ...font.body,
    fontSize: ms(14.5),
    lineHeight: ms(19),
    color: colors.text,
    flex: 1,
  },
  listChevron: { color: colors.accent, fontSize: ms(18), ...font.body },
  toast: {
    position: "absolute",
    left: space[4],
    right: space[4],
    zIndex: 9,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: ms(14),
    paddingVertical: ms(12),
    ...shadow.md,
  },
  toastText: {
    ...font.body,
    fontSize: ms(13),
    lineHeight: ms(18),
    color: colors.bg,
  },
});
