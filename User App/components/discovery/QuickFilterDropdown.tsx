import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Text, type IconName } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { facetsFor, filterSpecFor, type SearchQuery } from '@/types/filters';
import { genderMeta, type Gender, type Listing } from '@/types/listing';
import type { StayCategory } from '@/constants/tokens';
import { formatRupees } from '@/utils/money';

export type QuickFilterDropdownProps = {
  visible: boolean;
  filterId: string | null;
  query: SearchQuery;
  inventory: readonly Listing[];
  category: StayCategory | null;
  onApply: (patch: Partial<SearchQuery>) => void;
  onClose: () => void;
};

type OptionItem = {
  id: string;
  label: string;
  sublabel?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
};

export function QuickFilterDropdown({
  visible,
  filterId,
  query,
  inventory,
  category,
  onApply,
  onClose,
}: QuickFilterDropdownProps) {
  const { colors, radius, mode } = useTheme();
  const insets = useSafeAreaInsets();

  const spec = useMemo(() => filterSpecFor(category), [category]);
  const facets = useMemo(() => facetsFor(inventory), [inventory]);

  const selectOption = (patch: Partial<SearchQuery>) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onApply(patch);
    onClose();
  };

  // Build options based on which filter is active
  const { title, icon, options, clearAction } = useMemo(() => {
    if (!filterId) {
      return { title: '', icon: undefined, options: [], clearAction: undefined };
    }

    if (filterId === 'sort') {
      const current = query.sort;
      const opts: OptionItem[] = [
        {
          id: 'recommended',
          label: 'Relevance / Recommended',
          sublabel: 'Curated places matching your vibe and search',
          selected: current === 'recommended',
          onPress: () => selectOption({ sort: 'recommended' }),
        },
        {
          id: 'rentLow',
          label: 'Price: Low to High',
          sublabel: 'Cheapest rent per month shown first',
          selected: current === 'rentLow',
          onPress: () => selectOption({ sort: 'rentLow' }),
        },
        {
          id: 'depositLow',
          label: 'Deposit: Low to High',
          sublabel: 'Lowest security deposit required upfront',
          selected: current === 'depositLow',
          onPress: () => selectOption({ sort: 'depositLow' }),
        },
      ];
      return {
        title: 'Sort Stays By',
        icon: 'filters' as IconName,
        options: opts,
        clearAction: current !== 'recommended' ? () => selectOption({ sort: 'recommended' }) : undefined,
      };
    }

    if (filterId === 'gender') {
      const isAny = query.gender === null;
      const opts: OptionItem[] = [
        {
          id: 'any',
          label: 'All / Any Gender',
          selected: isAny,
          onPress: () => selectOption({ gender: null }),
        },
        {
          id: 'BOYS',
          label: genderMeta.BOYS.label,
          sublabel: 'Hostels & rooms open to boys/men',
          selected: query.gender === 'BOYS',
          onPress: () => selectOption({ gender: 'BOYS' }),
        },
        {
          id: 'GIRLS',
          label: genderMeta.GIRLS.label,
          sublabel: 'Hostels & rooms open to girls/women',
          selected: query.gender === 'GIRLS',
          onPress: () => selectOption({ gender: 'GIRLS' }),
        },
      ];
      return {
        title: 'Select Gender',
        icon: 'visitors' as IconName,
        options: opts,
        clearAction: !isAny ? () => selectOption({ gender: null }) : undefined,
      };
    }

    if (filterId === 'rent') {
      const current = query.rentCeiling;
      // Generate reasonable presets based on inventory rents
      const presets = [8000, 12000, 16000, 20000, 25000, 30000];
      const opts: OptionItem[] = [
        {
          id: 'any',
          label: 'Any budget / No ceiling',
          selected: current === null,
          onPress: () => selectOption({ rentCeiling: null }),
        },
        ...presets.map((preset) => ({
          id: `rent-${preset}`,
          label: `Up to ${formatRupees(preset)}`,
          sublabel: `Show places ${formatRupees(preset)} or less`,
          selected: current === preset,
          onPress: () => selectOption({ rentCeiling: preset }),
        })),
      ];
      return {
        title: 'Price Budget',
        icon: 'rupee' as IconName,
        options: opts,
        clearAction: current !== null ? () => selectOption({ rentCeiling: null }) : undefined,
      };
    }

    if (filterId === 'sharing') {
      const selected = query.sharing;
      const titleLabel = spec.sharingLabel?.replace(/\?$/, '') || 'Room Sharing';

      // Options from inventory facets, plus fallback standard options if inventory is sparse
      const availableSharing = facets.sharing.length > 0
        ? facets.sharing
        : ['Single Occupancy', '2 Sharing', '3 Sharing', '4+ Sharing'];

      const opts: OptionItem[] = [
        {
          id: 'any',
          label: 'Any room / sharing type',
          selected: selected.length === 0,
          onPress: () => selectOption({ sharing: [] }),
        },
        ...availableSharing.map((item) => {
          const isItemActive = selected.includes(item);
          return {
            id: item,
            label: item,
            selected: isItemActive,
            onPress: () => {
              // Toggle item
              const next = isItemActive
                ? selected.filter((s) => s !== item)
                : [...selected, item];
              selectOption({ sharing: next });
            },
          };
        }),
      ];
      return {
        title: titleLabel,
        icon: 'sharing' as IconName,
        options: opts,
        clearAction: selected.length > 0 ? () => selectOption({ sharing: [] }) : undefined,
      };
    }

    if (filterId === 'meals') {
      const current = query.meals;
      const opts: OptionItem[] = [
        {
          id: 'any',
          label: 'Any (Doesn’t matter)',
          selected: current === null,
          onPress: () => selectOption({ meals: null }),
        },
        {
          id: 'with-meals',
          label: 'With meals included',
          sublabel: 'Breakfast, lunch or dinner provided',
          selected: current === true,
          onPress: () => selectOption({ meals: true }),
        },
        {
          id: 'no-meals',
          label: 'Without meals (Self cooking)',
          sublabel: 'No mess charges included',
          selected: current === false,
          onPress: () => selectOption({ meals: false }),
        },
      ];
      return {
        title: 'Meals & Food',
        icon: 'mess' as IconName,
        options: opts,
        clearAction: current !== null ? () => selectOption({ meals: null }) : undefined,
      };
    }

    if (filterId === 'furnishing') {
      const selected = query.furnishing;
      const availableFurnishing = facets.furnishing.length > 0
        ? facets.furnishing
        : ['Fully furnished', 'Semi-furnished', 'Unfurnished'];

      const opts: OptionItem[] = [
        {
          id: 'any',
          label: 'Any furnishing',
          selected: selected.length === 0,
          onPress: () => selectOption({ furnishing: [] }),
        },
        ...availableFurnishing.map((item) => {
          const isItemActive = selected.includes(item);
          return {
            id: item,
            label: item,
            selected: isItemActive,
            onPress: () => {
              const next = isItemActive
                ? selected.filter((f) => f !== item)
                : [...selected, item];
              selectOption({ furnishing: next });
            },
          };
        }),
      ];
      return {
        title: 'Furnishing Type',
        icon: 'furnished' as IconName,
        options: opts,
        clearAction: selected.length > 0 ? () => selectOption({ furnishing: [] }) : undefined,
      };
    }

    return { title: '', icon: undefined, options: [], clearAction: undefined };
  }, [filterId, query, spec, facets]);

  if (!visible || !filterId) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Prevent taps inside card from closing modal */}
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: mode === 'dark' ? colors.borderSubtle : '#E2E8F0',
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Top Drag Indicator */}
          <View
            style={[
              styles.dragHandle,
              { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.2)' : '#CBD5E1' },
            ]}
          />

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: mode === 'dark' ? colors.borderSubtle : '#F1F5F9' }]}>
            <View style={styles.headerTitleRow}>
              {icon ? (
                <View
                  style={[
                    styles.iconCircle,
                    { backgroundColor: mode === 'dark' ? '#0F3E30' : '#E8F5E9' },
                  ]}
                >
                  <Icon name={icon} size={16} color={mode === 'dark' ? '#34D399' : '#0F4C3A'} />
                </View>
              ) : null}
              <Text variant="title3" style={{ fontSize: 16, fontWeight: '700' }}>
                {title}
              </Text>
            </View>

            <View style={styles.headerActions}>
              {clearAction ? (
                <Pressable
                  onPress={clearAction}
                  hitSlop={8}
                  style={styles.clearButton}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.brand }}>
                    Clear
                  </Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={[
                  styles.closeCircle,
                  { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : '#F1F5F9' },
                ]}
              >
                <Icon name="close" size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Options List */}
          <ScrollView
            style={styles.optionsScroll}
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) }}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {options.map((option, index) => {
              const isLast = index === options.length - 1;

              return (
                <Pressable
                  key={option.id}
                  onPress={option.onPress}
                  style={({ pressed }) => [
                    styles.optionRow,
                    {
                      backgroundColor: option.selected
                        ? (mode === 'dark' ? 'rgba(52, 211, 153, 0.12)' : '#F0FDF4')
                        : pressed
                          ? (mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#F8FAFC')
                          : 'transparent',
                      borderBottomColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
                      borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  {/* Left Radio / Check indicator */}
                  <View
                    style={[
                      styles.indicatorCircle,
                      {
                        borderColor: option.selected
                          ? (mode === 'dark' ? '#34D399' : '#0F4C3A')
                          : '#CBD5E1',
                        backgroundColor: option.selected
                          ? (mode === 'dark' ? '#34D399' : '#0F4C3A')
                          : 'transparent',
                      },
                    ]}
                  >
                    {option.selected ? (
                      <Icon name="check" size={12} color="#FFFFFF" />
                    ) : null}
                  </View>

                  <View style={styles.optionTextContainer}>
                    <Text
                      variant="bodyStrong"
                      style={{
                        fontSize: 14,
                        fontWeight: option.selected ? '700' : '500',
                        color: option.selected
                          ? (mode === 'dark' ? '#34D399' : '#0F4C3A')
                          : colors.textPrimary,
                      }}
                    >
                      {option.label}
                    </Text>
                    {option.sublabel ? (
                      <Text
                        variant="caption"
                        color="secondary"
                        style={{ fontSize: 11, marginTop: 1 }}
                      >
                        {option.sublabel}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
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
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '82%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
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
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clearButton: {
    paddingVertical: 2,
    paddingHorizontal: 4,
  },
  closeCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsScroll: {
    maxHeight: 340,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  indicatorCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextContainer: {
    flex: 1,
  },
});
