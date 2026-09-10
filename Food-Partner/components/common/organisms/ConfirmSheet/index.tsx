import { styles } from "@/components/common/utils/sheetStyles";
import type { SheetSpec } from "@/components/common/utils/sheet";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";
import { Icon, type IconName } from "@/components/common/atoms/Icon";
import { Btn, IconBtn } from "@/components/common";
import { Text } from "@/components/common/atoms/Text";

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
