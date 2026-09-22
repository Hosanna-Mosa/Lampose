import React from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, space, tone as resolveTone } from "@/theme";
import { Icon } from "./Icon";
import { Btn } from "./primitives";
import { Text } from "./Text";

/**
 * The one-button sheet shown the moment any authenticated request comes back
 * with a dead token — see `SESSION_DEAD_CODES` in `utils/api.ts`, which
 * fires the handler this sheet's `visible` flag is wired to.
 *
 * Deliberately not `Sheet` (this folder's two-button primitive, `primary` +
 * `secondary`): a dead session has no second option to offer, so drawing a
 * "cancel" beside "Logout" would imply a rider could dismiss their way back
 * into a session that no longer exists. Every way of leaving this sheet — the
 * button, the scrim, the hardware back gesture (`onRequestClose`) — calls the
 * SAME handler, because there is nothing else for any of them to mean.
 */
export function SessionExpiredSheet({
  visible,
  onLogout,
}: {
  visible: boolean;
  onLogout: () => void;
}) {
  const insets = useSafeAreaInsets();
  const t = resolveTone("warning");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onLogout}>
      <Pressable style={styles.scrim} onPress={onLogout} accessibilityLabel="Dismiss">
        <Pressable
          style={[styles.panel, { paddingBottom: Math.max(insets.bottom, space[5]) }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grabber} />

          <View style={[styles.kicker, { backgroundColor: t.tint, borderColor: t.border }]}>
            <Icon name="alert" size={13} color={t.ink} />
            <Text variant="label" style={{ color: t.ink }}>
              Session expired
            </Text>
          </View>

          <Text variant="display1" style={{ marginTop: space[3] }}>
            Your session has ended
          </Text>
          <Text variant="bodyLg" color="secondary" style={{ marginTop: space[2] }}>
            Please log out and sign in again.
          </Text>

          <Btn label="Logout" onPress={onLogout} style={{ marginTop: space[5] }} />
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
});
