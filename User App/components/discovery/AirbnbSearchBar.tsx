import React, { useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { Icon, Text } from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { withAlpha } from '@/utils/color';

export type AirbnbSearchBarProps = {
  locality?: string;
  city?: string;
  categoryLabel?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  onClear?: () => void;
  onPressLocality?: () => void;
  onPressFilters?: () => void;
  activeFilterCount?: number;
  placeholder?: string;
  style?: ViewStyle;
};

export function AirbnbSearchBar({
  locality,
  city,
  categoryLabel,
  value,
  onChangeText,
  onSubmitEditing,
  onClear,
  onPressLocality,
  onPressFilters,
  activeFilterCount = 0,
  placeholder = 'Search by locality, PG or hotel…',
  style,
}: AirbnbSearchBarProps) {
  const { colors, radius, mode } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const scale = useSharedValue(1);

  const animatedCapsuleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.985, { damping: 14, stiffness: 200 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 200 });
  };

  const handlePillPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // no-op if unsupported
    }
    inputRef.current?.focus();
    setIsFocused(true);
  };

  const handleClear = () => {
    onChangeText('');
    onClear?.();
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
  };

  const handleFilterPress = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onPressFilters?.();
  };

  const hasSearchText = value.trim().length > 0;
  const isEditing = isFocused || hasSearchText;

  const displayLocality = locality && locality !== 'Choose an area' ? locality : 'Where to?';
  const subtitle = city
    ? `${city} · ${categoryLabel || 'Any stay'}`
    : `${categoryLabel || 'Any stay'} · Verified`;

  return (
    <Animated.View style={[styles.wrapper, animatedCapsuleStyle, style]}>
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.surface,
            borderColor: isFocused ? '#0F4C3A' : '#E2E8F0',
            borderRadius: radius.pill,
            shadowColor: '#000000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: mode === 'dark' ? 0.35 : 0.08,
            shadowRadius: 12,
            elevation: 4,
          },
        ]}
      >
        {/* Left Magnifier Icon / Action */}
        <Pressable
          onPress={onPressLocality || handlePillPress}
          hitSlop={8}
          style={[
            styles.iconButton,
            {
              backgroundColor: mode === 'dark' ? 'rgba(15,76,58,0.3)' : '#E2F1EA',
              borderRadius: radius.pill,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Search destination"
        >
          <Icon name="search" size={20} color={mode === 'dark' ? '#34D399' : '#0F4C3A'} />
        </Pressable>

        {/* Center Content: Stacked label or active TextInput */}
        {isEditing ? (
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              onSubmitEditing={() => {
                setIsFocused(false);
                Keyboard.dismiss();
                onSubmitEditing?.();
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              placeholderTextColor={colors.textTertiary}
              returnKeyType="search"
              autoCorrect={false}
              style={[
                styles.textInput,
                {
                  color: colors.textPrimary,
                },
              ]}
            />
            {hasSearchText ? (
              <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(150)}>
                <Pressable
                  onPress={handleClear}
                  hitSlop={10}
                  style={[
                    styles.clearButton,
                    { backgroundColor: colors.surfaceSunken, borderRadius: radius.pill },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Icon name="close" size={16} color={colors.textSecondary} />
                </Pressable>
              </Animated.View>
            ) : null}
          </View>
        ) : (
          <Pressable
            onPress={handlePillPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
            style={styles.labelContainer}
            accessibilityRole="search"
            accessibilityLabel={`${displayLocality}, ${subtitle}. Tap to search.`}
          >
            <Text
              variant="title3"
              style={[styles.primaryText, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {displayLocality}
            </Text>
            <Text
              variant="caption"
              style={[styles.secondaryText, { color: colors.textSecondary }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </Pressable>
        )}

        {/* Right Divider & Filter Button */}
        <View
          style={[
            styles.divider,
            { backgroundColor: colors.borderSubtle },
          ]}
        />

        <Pressable
          onPress={handleFilterPress}
          hitSlop={8}
          style={({ pressed }) => [
            styles.filterButton,
            {
              backgroundColor: mode === 'dark' ? 'rgba(15,76,58,0.3)' : '#E2F1EA',
              borderColor: 'transparent',
              borderRadius: radius.pill,
              opacity: pressed ? 0.75 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Filter stays. ${activeFilterCount} active filters.`}
        >
          <Icon
            name="filters"
            size={18}
            color={mode === 'dark' ? '#34D399' : '#0F4C3A'}
          />
          {activeFilterCount > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: '#0F4C3A', borderRadius: radius.pill },
              ]}
            >
              <Text variant="numMeta" style={styles.badgeText}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    flex: 1,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  primaryText: {
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  secondaryText: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: 0,
  },
  inputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    marginRight: 6,
  },
  clearButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    marginHorizontal: 4,
  },
  filterButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 12,
  },
});
