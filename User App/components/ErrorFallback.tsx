import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { reloadAppAsync } from 'expo';

import { Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { usePreviewControls } from '@/hooks/useAppEnv';

export type ErrorFallbackProps = {
  error: Error;
  resetError: () => void;
};

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  const previewControls = usePreviewControls();
  const { colors, space, radius, touch, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleRestart = async () => {
    try {
      await reloadAppAsync();
    } catch (restartError) {
      console.error('Failed to restart app:', restartError);
      resetError();
    }
  };

  const formatErrorDetails = (): string => {
    let details = `Error: ${error.message}\n\n`;
    if (error.stack) {
      details += `Stack Trace:\n${error.stack}`;
    }
    return details;
  };

  // A raw stack trace uses the platform monospace face rather than the design
  // system's numeric face: this screen renders when something has already gone
  // wrong, which may include the font load itself.
  const monoFont = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, padding: space[6] }]}>
      {previewControls ? (
        <Pressable
          onPress={() => setIsModalVisible(true)}
          accessibilityLabel="View error details"
          accessibilityRole="button"
          hitSlop={touch.iconButtonHitSlop}
          style={({ pressed }) => [
            styles.topButton,
            {
              top: insets.top + space[4],
              right: layout.gutter,
              width: touch.min,
              height: touch.min,
              borderRadius: radius.chip,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Feather name="alert-circle" size={20} color={colors.textPrimary} />
        </Pressable>
      ) : null}

      <View style={[styles.content, { gap: space[4] }]}>
        <Text variant="title1" style={styles.centered}>
          Something went wrong
        </Text>

        <Text variant="body" color="secondary" style={styles.centered}>
          Reload the app to continue. Nothing you have paid for is affected.
        </Text>

        <Pressable
          onPress={handleRestart}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            {
              backgroundColor: pressed ? colors.brandPressed : colors.brand,
              borderRadius: radius.button,
              minHeight: touch.primaryCta,
              paddingHorizontal: space[6],
            },
          ]}
        >
          {/* `onBrand`, not white — the same fix as `+not-found`. Both were
              hand-rolled rather than using `Button`, and both drifted. */}
          <Text variant="bodyStrong" style={{ color: colors.onBrand }}>
            Reload
          </Text>
        </Pressable>
      </View>

      {previewControls ? (
        <Modal
          visible={isModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setIsModalVisible(false)}
        >
          <View style={[styles.modalOverlay, { backgroundColor: colors.scrim }]}>
            <View
              style={[
                styles.modalContainer,
                {
                  backgroundColor: colors.bg,
                  borderTopLeftRadius: radius.sheet,
                  borderTopRightRadius: radius.sheet,
                },
              ]}
            >
              <View
                style={[
                  styles.modalHeader,
                  {
                    borderBottomColor: colors.border,
                    paddingHorizontal: layout.gutter,
                    paddingTop: space[4],
                    paddingBottom: space[3],
                  },
                ]}
              >
                <Text variant="title2">Error details</Text>
                <Pressable
                  onPress={() => setIsModalVisible(false)}
                  accessibilityLabel="Close error details"
                  accessibilityRole="button"
                  hitSlop={touch.iconButtonHitSlop}
                  style={({ pressed }) => [
                    { width: touch.min, height: touch.min },
                    styles.closeButton,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Feather name="x" size={24} color={colors.textPrimary} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScrollView}
                contentContainerStyle={{ padding: layout.gutter, paddingBottom: insets.bottom + space[4] }}
                showsVerticalScrollIndicator
              >
                <View
                  style={{
                    backgroundColor: colors.surfaceSunken,
                    borderRadius: radius.chip,
                    padding: space[4],
                  }}
                >
                  <Text
                    variant="caption"
                    style={{ color: colors.textPrimary, fontFamily: monoFont }}
                    selectable
                  >
                    {formatErrorDetails()}
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 600,
  },
  centered: {
    textAlign: 'center',
  },
  topButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 200,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    width: '100%',
    height: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  closeButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollView: {
    flex: 1,
  },
});
