/* ══════════════════════════════════════════════════════════════════════════
   Bottom sheets.

   Two of them, because they answer different questions:

     ConfirmSheet   a blocking decision with a fixed shape — a kicker, a
                    title, a body and two buttons. Discarding an application,
                    signing out, deleting an item.
     ModalSheet     arbitrary children. The partner-type picker, the add-item
                    form, the add-category prompt.

   A sheet meets the screen edge, so it takes `radius.sheet` and nothing else
   in this app does. The kicker is a tinted chip rather than bare coloured
   text: "Cannot be undone" in red type alone leans on colour to carry the
   severity, and a glyph beside a word does not.

   Both cap their body height. A tall form inside a sheet that grows without
   limit pushes its own grabber and its buttons off the top of the screen.
   ══════════════════════════════════════════════════════════════════════════ */
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";
import { Icon, type IconName } from "./Icon";
import { Btn, IconBtn } from "./primitives";
import { Text } from "./Text";

export type SheetSpec = {
  kicker: string;
  tone: ToneName;
  title: string;
  body: string;
  primary: string;
  secondary: string;
};

export function ConfirmSheet({
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

  const t = resolveTone(spec.tone);
  const glyph: IconName = spec.tone === "danger" || spec.tone === "warning" ? "alert" : "info";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel="Dismiss">
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[5]) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <View style={[styles.kicker, { backgroundColor: t.tint, borderColor: t.border }]}>
            <Icon name={glyph} size={13} color={t.ink} />
            <Text variant="label" style={{ color: t.ink }}>
              {spec.kicker}
            </Text>
          </View>

          <Text variant="display1" style={{ marginTop: space[3] }}>
            {spec.title}
          </Text>
          <Text variant="bodyLg" color="secondary" style={{ marginTop: space[2] }}>
            {spec.body}
          </Text>

          <Btn label={spec.primary} onPress={onPrimary} style={{ marginTop: space[5] }} />
          <Btn label={spec.secondary} variant="ghost" onPress={onDismiss} style={{ marginTop: space[2] }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function ModalSheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Dismiss">
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[4]) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <View style={styles.head}>
            <Text variant="display2" style={{ flex: 1 }} numberOfLines={1}>
              {title}
            </Text>
            <IconBtn glyph="close" accessibilityLabel="Close" onPress={onClose} />
          </View>

          <ScrollView
            style={{ maxHeight: height * 0.62 }}
            contentContainerStyle={{ paddingBottom: space[3], gap: space[3] }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>

          {footer ? <View style={styles.foot}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.gutter + space[1],
    paddingTop: space[2],
    ...elevation.sheet,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    marginBottom: space[3],
  },
  head: { flexDirection: "row", alignItems: "center", gap: space[2], marginBottom: space[3] },
  foot: { paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  kicker: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.chip,
    paddingHorizontal: space[2],
    paddingVertical: 4,
  },
});
