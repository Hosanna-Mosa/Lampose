import React from "react";
import { ScrollView, StyleSheet } from "react-native";

import { Chip } from "./Badge";

export interface ChipOption<K extends string = string> {
  key: K;
  label: string;
  count?: number;
}

interface Props<K extends string> {
  options: ChipOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Space above the row — 0 when it sits right under a title. */
  topGap?: number;
}

/** A horizontally scrolling row of single-choice filter chips. */
export function ChipRow<K extends string>({ options, value, onChange, topGap = 0 }: Props<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.row}
      contentContainerStyle={[styles.content, { paddingTop: topGap }]}
      keyboardShouldPersistTaps="handled"
    >
      {options.map((option) => (
        <Chip
          key={option.key}
          label={option.label}
          count={option.count}
          selected={value === option.key}
          onPress={() => onChange(option.key)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // A horizontal ScrollView in a column grows vertically unless told not to.
  row: { flexGrow: 0, flexShrink: 0 },
  content: { gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
});
