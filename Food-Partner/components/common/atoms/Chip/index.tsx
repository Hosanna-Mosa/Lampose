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


// ─── Chips ────────────────────────────────────────────────────────────────────

/** A STATUS chip: tint fill, ink label, hairline in the same family. Not tappable. */
export function Chip({
  label,
  tone = "muted",
  glyph,
  style,
}: {
  label: string;
  tone?: ToneName;
  glyph?: IconName;
  style?: ViewStyle;
}) {
  const t = resolveTone(tone);
  return (
    <View style={[styles.chip, { backgroundColor: t.tint, borderColor: t.border }, style]}>
      {glyph ? <Icon name={glyph} size={12} color={t.ink} /> : null}
      <Text variant="label" style={{ color: t.ink }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/**
 * A TAPPABLE multi-select chip — cuisines, days, tags, allergens.
 *
 * Separate from `Chip` because they look similar and behave nothing alike:
 * one reports a state, the other changes it. Merging them is how a status
 * chip ends up with an onPress nobody expected.
 */
