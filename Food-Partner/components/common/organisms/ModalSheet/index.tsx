import { styles } from "@/components/common/utils/sheetStyles";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";
import { Icon, type IconName } from "@/components/common/atoms/Icon";
import { Btn, IconBtn } from "@/components/common";
import { Text } from "@/components/common/atoms/Text";

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
