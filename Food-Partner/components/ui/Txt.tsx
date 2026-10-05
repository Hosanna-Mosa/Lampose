import React from "react";
import { Text, type TextProps } from "react-native";

import { MAX_FONT_SCALE } from "@/theme/ui";

/**
 * React Native's Text with the app's one cap on OS font scaling. Every string
 * in the signed-in screens goes through it, so an accessibility font size
 * enlarges the type without letting a body line overtake its heading.
 */
export function Txt(props: TextProps) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} {...props} />;
}
