import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ui } from "@/theme/ui";

interface Props {
  children: React.ReactNode;
  /** Merged over the default frame. */
  style?: StyleProp<ViewStyle>;
  /** Lift content above the keyboard, as forms and the chat do. */
  keyboardAvoiding?: boolean;
  /** Wrap the children in a ScrollView. */
  scroll?: boolean;
  scrollProps?: ScrollViewProps;
  scrollRef?: React.Ref<ScrollView>;
  /** Style of the scroll content (padding, gaps). */
  contentStyle?: StyleProp<ViewStyle>;
  /** Pull-to-refresh in the brand colour. Needs `scroll`. */
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Pinned above the scroll area — usually a ui/Header. */
  header?: React.ReactNode;
  /** Pinned below the scroll area, in a surface bar above the home indicator. */
  footer?: React.ReactNode;
}

/**
 * The outer frame every signed-in screen repeats: the grey ground, an optional
 * header and footer bar, an optional scroll with pull-to-refresh.
 *
 * The keyboard behaviour is the one these screens already had — padding on
 * iOS, the platform's own resize on Android.
 */
export function ScreenShell({
  children,
  style,
  keyboardAvoiding = false,
  scroll = false,
  scrollProps,
  scrollRef,
  contentStyle,
  refreshing,
  onRefresh,
  header,
  footer,
}: Props) {
  const insets = useSafeAreaInsets();
  const frame: StyleProp<ViewStyle> = [styles.frame, style];

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={styles.flex}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={contentStyle}
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={ui.brand} colors={[ui.brand]} />
        ) : undefined
      }
      {...scrollProps}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  const content = keyboardAvoiding ? (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  ) : (
    <>
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </>
  );

  return (
    <View style={frame}>
      {header}
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: ui.bg },
  flex: { flex: 1 },
  footer: {
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: ui.surface,
    borderTopWidth: 1,
    borderTopColor: ui.border,
  },
});
