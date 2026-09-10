import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { Card, Chip, Icon, Seg, Text, TopBar } from "@/components/common";
import { colors, layout, radius, space, touch } from "@/theme";

const styles = StyleSheet.create({
  tile: { flexBasis: "47%", flexGrow: 1, gap: space[1], padding: space[3], borderRadius: radius.card },
});

export function Tile({
  glyph,
  label,
  value,
  tone,
  onPress,
}: {
  glyph: Parameters<typeof Icon>[0]["name"];
  label: string;
  value: string;
  tone?: string;
  onPress?: () => void;
}) {
  const body = (
    <Card style={styles.tile}>
      <Icon name={glyph} size={16} color={tone ?? colors.brandInk} />
      <Text variant="priceLg" style={tone ? { color: tone } : undefined}>
        {value}
      </Text>
      <Text variant="caption" color="tertiary">
        {label}
      </Text>
    </Card>
  );

  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ flexBasis: "47%", flexGrow: 1 }}>
      {body}
    </Pressable>
  );
}
