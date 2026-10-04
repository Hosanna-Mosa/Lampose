import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, View, type ImageStyle, type StyleProp, type TextStyle } from "react-native";

import { font, size as sizes, ui } from "@/theme/ui";
import { Txt } from "./Txt";

interface Props {
  name?: string | null;
  imageUri?: string | null;
  /** Final diameter. */
  size: number;
  style?: StyleProp<ImageStyle>;
  initialStyle?: StyleProp<TextStyle>;
}

/** The uploaded photo, else the first letter of the name, else a person glyph. */
export function Avatar({ name, imageUri, size, style, initialStyle }: Props) {
  const circle = { width: size, height: size, borderRadius: size / 2 };

  if (imageUri) {
    return <Image source={{ uri: imageUri }} style={[circle, styles.image, style]} resizeMode="cover" />;
  }

  const initial = (name || "").trim().charAt(0).toUpperCase();
  return (
    <View style={[styles.placeholder, circle, style as never]}>
      {initial ? (
        <Txt style={[styles.initial, { fontSize: Math.max(sizes.large, size * 0.4) }, initialStyle]}>{initial}</Txt>
      ) : (
        <Ionicons name="person-outline" size={size * 0.42} color={ui.sec} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: ui.sunken },
  placeholder: { alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: ui.brandSkin },
  initial: { fontFamily: font.heading.semibold, color: ui.brandInk },
});
