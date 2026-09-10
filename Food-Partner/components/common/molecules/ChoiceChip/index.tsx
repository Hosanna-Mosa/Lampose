import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextStyle,
  View,
  type ViewProps,
  type ViewStyle,
} from "react-native";
import { colors, elevation, radius, space, tone as resolveTone, touch, type ToneName } from "@/theme";
import { Icon, type IconName } from "@/components/common/atoms/Icon";
import { Text } from "@/components/common/atoms/Text";
import { styles } from "@/components/common/utils/primitiveStyles";


/**
 * A TAPPABLE multi-select chip — cuisines, days, tags, allergens.
 *
 * Separate from `Chip` because they look similar and behave nothing alike:
 * one reports a state, the other changes it. Merging them is how a status
 * chip ends up with an onPress nobody expected.
 */
export function ChoiceChip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        selected
          ? { backgroundColor: colors.brandTint, borderColor: colors.brandOnDark }
          : { backgroundColor: pressed ? colors.surfaceSunken : colors.surface, borderColor: colors.border },
        style,
      ]}
    >
      {selected ? <Icon name="check" size={13} color={colors.brandInk} /> : null}
      <Text variant="title3" style={{ color: selected ? colors.brandInk : colors.textSecondary }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}
