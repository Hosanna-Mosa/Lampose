import React from "react";
import { Platform, Switch } from "react-native";

import { ui } from "@/theme/ui";

interface Props {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}

/** The platform switch, in the Lampose green when on. */
export function ToggleSwitch({ value, onValueChange, disabled, accessibilityLabel }: Props) {
  return (
    <Switch
      value={value}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      onValueChange={onValueChange}
      trackColor={{ false: ui.borderStrong, true: ui.brand }}
      thumbColor={Platform.OS === "android" ? ui.surface : undefined}
      ios_backgroundColor={ui.borderStrong}
    />
  );
}
