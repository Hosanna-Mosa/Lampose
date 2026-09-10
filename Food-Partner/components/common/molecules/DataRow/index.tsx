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


/** Label on the left, value on the right, hairline above. */
export function DataRow({
  label,
  value,
  valueTone,
  tabular = true,
  first,
}: {
  label: string;
  value: string;
  valueTone?: string;
  tabular?: boolean;
  first?: boolean;
}) {
  return (
    <View style={[styles.dataRow, !first && styles.dataRowDivided]}>
      <Text variant="body" color="secondary" style={{ flex: 1 }}>
        {label}
      </Text>
      <Text
        variant={tabular ? "priceMd" : "bodyStrong"}
        color={valueTone ? "inherit" : "primary"}
        style={[{ flexShrink: 1, textAlign: "right" }, valueTone ? { color: valueTone } : null]}
      >
        {value}
      </Text>
    </View>
  );
}
