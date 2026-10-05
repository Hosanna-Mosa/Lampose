import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { elevation, font, line, ms, radius, size, ui } from "@/theme/ui";
import { fadeIn, modalSlideUp } from "./motion";
import { Txt } from "./Txt";

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Trailing element in the title row, e.g. "Mark all read". */
  titleRight?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the scrolling body — the sheet's buttons. */
  footer?: React.ReactNode;
  /** Shows a close button in the title row. */
  closeButton?: boolean;
  /** Blocks backdrop / back-button dismissal while something is in flight. */
  dismissible?: boolean;
}

/** A sheet that slides up from the bottom over a dimmed backdrop. */
export function BottomSheet({
  visible,
  onClose,
  title,
  subtitle,
  titleRight,
  children,
  footer,
  closeButton,
  dismissible = true,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const close = () => (dismissible ? onClose() : undefined);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
        <Animated.View entering={fadeIn(0)} style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
        </Animated.View>
        <Animated.View entering={modalSlideUp} style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.handle} />
          {title || closeButton || titleRight ? (
            <View style={styles.titleRow}>
              {title ? (
                <Txt style={styles.title} accessibilityRole="header">
                  {title}
                </Txt>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {titleRight}
              {closeButton ? (
                <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                  <Ionicons name="close" size={ms(22)} color={ui.sec} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {subtitle ? <Txt style={styles.subtitle}>{subtitle}</Txt> : null}
          <ScrollView
            style={{ maxHeight: height * 0.62 }}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: ui.overlay },
  sheet: {
    backgroundColor: ui.surface,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    paddingHorizontal: 20,
    paddingTop: 10,
    ...elevation.lg,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: ui.border,
    marginBottom: 16,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: {
    flex: 1,
    fontFamily: font.heading.semibold,
    fontSize: size.extraLarge,
    lineHeight: line.extraLarge,
    color: ui.text,
  },
  subtitle: {
    fontFamily: font.body.regular,
    fontSize: size.medium,
    lineHeight: line.medium,
    color: ui.sec,
    marginTop: 6,
  },
  body: { gap: 14, paddingTop: 16, paddingBottom: 8 },
  footer: { gap: 8, paddingTop: 12 },
});
