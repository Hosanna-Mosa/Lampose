import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Text, TextField } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';

export type NearbyRadiusDialogProps = {
  visible: boolean;
  onClose: () => void;
  /** A whole number of kilometres, already bounded. */
  onSelect: (radiusKm: number) => void;
};

const PRESETS_KM = [2, 5, 10, 15] as const;
const MAX_RADIUS_KM = 50;

/**
 * "How far from you" — asked before `CurrentLocationRow` takes a fix, rather
 * than baking in one fixed radius nobody chose.
 *
 * Visually mirrors `QuickFilterDropdown`'s card (same drag handle, same
 * slide-up sheet, same radio rows) so this reads as the same kind of control
 * as every other filter on the entry screens, not a one-off dialog. The one
 * addition is the custom row: four presets cannot cover "I'm near a college,
 * three km is too tight" — see the request that added this screen.
 */
export function NearbyRadiusDialog({ visible, onClose, onSelect }: NearbyRadiusDialogProps) {
  const { colors, space, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();

  const [selected, setSelected] = useState<number | 'custom'>(5);
  const [customText, setCustomText] = useState('');

  const customValue = Number(customText);
  const customValid = customText.trim().length > 0 && Number.isFinite(customValue) && customValue > 0;

  const chosenRadius = selected === 'custom'
    ? (customValid ? Math.min(Math.round(customValue), MAX_RADIUS_KM) : null)
    : selected;

  /* Reset to the default preset each time the sheet is reopened, rather than
     remembering a half-typed custom value from a search that was cancelled. */
  const handleClose = () => {
    setSelected(5);
    setCustomText('');
    onClose();
  };

  const confirm = () => {
    if (!chosenRadius) return;
    onSelect(chosenRadius);
  };

  const activeTint = mode === 'dark' ? '#34D399' : '#0F4C3A';
  const activeFill = mode === 'dark' ? 'rgba(52, 211, 153, 0.12)' : '#F0FDF4';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: mode === 'dark' ? colors.borderSubtle : '#E2E8F0',
              paddingBottom: Math.max(insets.bottom, space[4]),
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View
            style={[styles.dragHandle, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : '#CBD5E1' }]}
          />

          <View style={[styles.header, { paddingHorizontal: space[4] }]}>
            <Text variant="title3" style={styles.headerTitle}>
              How far should we look?
            </Text>
            <Pressable
              onPress={handleClose}
              hitSlop={8}
              style={[styles.closeCircle, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#F1F5F9' }]}
            >
              <Icon name="close" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>

          <Text
            variant="caption"
            color="secondary"
            style={{ paddingHorizontal: space[4], paddingBottom: space[3] }}
          >
            We will show places within this distance of where you are right now.
          </Text>

          <View style={{ paddingHorizontal: space[4], gap: space[2] }}>
            {PRESETS_KM.map((km) => {
              const isSelected = selected === km;
              return (
                <Pressable
                  key={km}
                  onPress={() => setSelected(km)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  style={[
                    styles.optionRow,
                    {
                      borderRadius: radius.chip,
                      borderColor: isSelected ? activeTint : colors.border,
                      backgroundColor: isSelected ? activeFill : 'transparent',
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.indicatorCircle,
                      {
                        borderColor: isSelected ? activeTint : '#CBD5E1',
                        backgroundColor: isSelected ? activeTint : 'transparent',
                      },
                    ]}
                  >
                    {isSelected ? <Icon name="check" size={12} color="#FFFFFF" /> : null}
                  </View>
                  <Text variant="bodyStrong" style={{ color: isSelected ? activeTint : colors.textPrimary }}>
                    Within {km} km
                  </Text>
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setSelected('custom')}
              accessibilityRole="radio"
              accessibilityState={{ selected: selected === 'custom' }}
              style={[
                styles.optionRow,
                styles.customRow,
                {
                  borderRadius: radius.chip,
                  borderColor: selected === 'custom' ? activeTint : colors.border,
                  backgroundColor: selected === 'custom' ? activeFill : 'transparent',
                },
              ]}
            >
              <View
                style={[
                  styles.indicatorCircle,
                  {
                    borderColor: selected === 'custom' ? activeTint : '#CBD5E1',
                    backgroundColor: selected === 'custom' ? activeTint : 'transparent',
                  },
                ]}
              >
                {selected === 'custom' ? <Icon name="check" size={12} color="#FFFFFF" /> : null}
              </View>
              <View style={styles.flex}>
                {selected === 'custom' ? (
                  <TextField
                    label="Custom distance (km)"
                    placeholder="e.g. 7"
                    value={customText}
                    onChangeText={(text) => setCustomText(text.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    maxLength={2}
                    autoFocus
                  />
                ) : (
                  <Text variant="bodyStrong" color="secondary">
                    Custom distance
                  </Text>
                )}
              </View>
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: space[4], paddingTop: space[4] }}>
            <Button
              label={chosenRadius ? `Search within ${chosenRadius} km` : 'Choose a distance'}
              onPress={confirm}
              disabled={!chosenRadius}
              fullWidth
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 20,
  },
  dragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { fontWeight: '700' },
  closeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  customRow: { alignItems: 'flex-start' },
  indicatorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  flex: { flex: 1 },
});
