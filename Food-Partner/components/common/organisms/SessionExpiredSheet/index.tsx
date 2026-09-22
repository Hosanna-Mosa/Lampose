import { styles } from "@/components/common/utils/sheetStyles";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, tone as resolveTone } from "@/theme";
import { Icon } from "@/components/common/atoms/Icon";
import { Btn } from "@/components/common";
import { Text } from "@/components/common/atoms/Text";

/**
 * The one-button sheet for a dead session.
 *
 * Deliberately not `ConfirmSheet` — that always draws a primary AND a
 * secondary ("cancel") button, and there is no "cancel" here: the session is
 * already gone, so the only choice is acknowledging it. Dismissing any other
 * way (the scrim, the back gesture) does the same thing the button does —
 * there is nothing else for either to mean.
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
