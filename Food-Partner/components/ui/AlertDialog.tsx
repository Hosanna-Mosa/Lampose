import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Modal, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";

import { elevation, font, line, ms, radius, size, ui } from "@/theme/ui";
import { Txt } from "./Txt";

export type AlertTone = "info" | "success" | "danger" | "warning";

export interface AlertAction {
  text: string;
  onPress: () => void;
  style?: "default" | "cancel" | "destructive";
}

const ICON: Record<AlertTone, { name: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  info: { name: "information-circle", fg: ui.brandInk, bg: ui.brandSkin },
  success: { name: "checkmark-circle", fg: ui.success, bg: ui.successSkin },
  danger: { name: "alert-circle", fg: ui.error, bg: ui.errorSkin },
  warning: { name: "warning", fg: ui.warning, bg: ui.warningSkin },
};

interface Props {
  visible: boolean;
  tone?: AlertTone;
  /** A short uppercase line over the title, e.g. "Cannot be undone". */
  kicker?: string;
  title: string;
  message?: string;
  actions: AlertAction[];
  /** Back and tapping outside — usually the cancel action. */
  onDismiss: () => void;
}

/** The centred confirmation dialog — Adios's in-app alert, driven by props. */
export function AlertDialog({ visible, tone = "info", kicker, title, message, actions, onDismiss }: Props) {
  const icon = ICON[tone];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Dismiss" />
        <View style={styles.card}>
          <View style={[styles.iconCircle, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name} size={ms(22)} color={icon.fg} />
          </View>
          {kicker ? <Txt style={[styles.kicker, { color: icon.fg }]}>{kicker}</Txt> : null}
          <Txt style={styles.title} accessibilityRole="header">
            {title}
          </Txt>
          {message ? <Txt style={styles.message}>{message}</Txt> : null}

          <View style={styles.buttons}>
            {actions.map((action, index) => (
              <TouchableOpacity
                key={`${action.text}-${index}`}
                style={[
                  styles.button,
                  action.style === "cancel" && styles.buttonCancel,
                  action.style === "destructive" && styles.buttonDestructive,
                ]}
                activeOpacity={0.85}
                onPress={action.onPress}
                accessibilityRole="button"
              >
                <Txt
                  style={[
                    styles.buttonText,
                    action.style === "cancel" && styles.buttonTextCancel,
                    action.style === "destructive" && styles.buttonTextDestructive,
                  ]}
                >
                  {action.text}
                </Txt>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: ui.overlay, justifyContent: "center", alignItems: "center", padding: 24 },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: ui.surface,
    borderRadius: radius.lg,
    padding: 22,
    alignItems: "center",
    ...elevation.lg,
  },
  iconCircle: {
    width: ms(44),
    height: ms(44),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  kicker: {
    fontFamily: font.body.bold,
    fontSize: size.small,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  title: {
    fontFamily: font.body.semibold,
    fontSize: size.large,
    lineHeight: line.large,
    color: ui.text,
    textAlign: "center",
  },
  message: {
    fontFamily: font.body.regular,
    fontSize: size.medium,
    lineHeight: line.medium,
    color: ui.sec,
    textAlign: "center",
    marginTop: 8,
  },
  buttons: { width: "100%", marginTop: 18, gap: 8 },
  button: {
    width: "100%",
    minHeight: ms(48),
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ui.brand,
  },
  buttonCancel: { backgroundColor: "transparent", minHeight: ms(44) },
  buttonDestructive: { backgroundColor: ui.errorSolid },
  buttonText: { fontFamily: font.body.bold, fontSize: size.medium, color: ui.onBrand },
  buttonTextCancel: { fontFamily: font.body.semibold, color: ui.sec },
  buttonTextDestructive: { color: ui.white },
});
