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
 * A tinted notice — the one way of saying something that is not a row of
 * content. Always a glyph and a word, never colour alone.
 */
export function Notice({
  tone = "info",
  title,
  body,
  glyph,
  style,
}: {
  tone?: ToneName;
  title: string;
  body?: string;
  glyph?: IconName;
  style?: ViewStyle;
}) {
  const t = resolveTone(tone);
  const fallback: IconName = tone === "danger" || tone === "warning" ? "alert" : "info";

  return (
    <View style={[styles.notice, { backgroundColor: t.tint, borderColor: t.border }, style]}>
      <Icon name={glyph ?? fallback} size={18} color={t.ink} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="title3" style={{ color: t.ink }}>
          {title}
        </Text>
        {!!body && (
          <Text variant="caption" style={{ color: t.ink, opacity: 0.85 }}>
            {body}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Label on the left, value on the right, hairline above. */
