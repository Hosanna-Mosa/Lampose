import React from "react";
import { View, type ViewProps } from "react-native";

/** A `<div>` — passes every prop straight through. */
export function Box(props: ViewProps) {
  return <View {...props} />;
}
