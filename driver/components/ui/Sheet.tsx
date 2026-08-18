import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";
import { Icon } from "./Icon";
import { Btn } from "./primitives";
import { Text } from "./Text";

export type SheetSpec = {
  kicker: string;
  tone: ToneName;
  title: string;
  body: string;
  primary: string;
  secondary: string;
  /** Optional pick-list rendered between the body and the buttons. */
  list?: { label: string; onPress: () => void }[];
};

/**
 * The bottom sheet every blocking decision uses — GPS off, permission, poor
 * network, cancel, log out, withdraw.
 *
 * The sheet is a white surface meeting the screen edge, so it takes
 * `radius.sheet` and nothing else does. The kicker is a tinted chip rather
 * than bare coloured text: "Location off" in red type alone leans on colour to
 * carry the severity, and a glyph beside a word does not.
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

  const t = resolveTone(spec.tone);
  const glyph = spec.tone === "danger" || spec.tone === "warning" ? "alert" : "info";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <Pressable style={styles.scrim} onPress={onDismiss}>
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

          {!!spec.list?.length && (
            <View style={styles.list}>
              <ScrollView style={{ maxHeight: 260 }}>
                {spec.list.map((row, i) => (
                  <Pressable
                    key={row.label}
                    onPress={row.onPress}
                    style={({ pressed }) => [
                      styles.listRow,
                      i > 0 && styles.listRowDivided,
                      pressed && { backgroundColor: colors.surfaceSunken },
                    ]}
                  >
                    <Text variant="bodyLg" style={{ flex: 1 }}>
                      {row.label}
                    </Text>
                    <Icon name="chevronRight" size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          <Btn label={spec.primary} onPress={onPrimary} style={{ marginTop: space[5] }} />
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

/**
 * The confirmation toast that drops in under the status bar.
 *
 * Near-black rather than the page ground, because it sits over content and has
 * to be legible against whatever happens to be behind it.
 */
export function Toast({ message, top }: { message: string | null; top: number }) {
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.toast, { top }]}>
      <Icon name="check" size={16} color={colors.brandOnDark} />
      <Text variant="bodyStrong" color="onGraphite" style={{ flex: 1 }}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  panel: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    ...elevation.sheet,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: space[4],
  },
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

  list: { marginTop: space[4], borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[1],
  },
  listRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },

  toast: {
    position: "absolute",
    left: layout.gutter,
    right: layout.gutter,
    zIndex: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    backgroundColor: colors.graphite,
    borderRadius: radius.button,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    ...elevation.float,
  },
});
