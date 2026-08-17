import { router, Stack } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Btn } from "@/components/ui";
import { colors, font, ms, radius } from "@/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.root}>
        <View style={styles.mark}>
          <Text style={styles.markGlyph}>?</Text>
        </View>
        <Text style={styles.title}>This screen doesn't exist</Text>
        <Text style={styles.body}>
          The link you followed points somewhere the app doesn't have. Let's get you back.
        </Text>
        <Btn label="Back to home" onPress={() => router.replace("/")} style={{ marginTop: ms(20) }} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    paddingHorizontal: ms(24),
  },
  mark: {
    width: ms(60),
    height: ms(60),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  markGlyph: { ...font.headingBold, fontSize: ms(30), color: colors.neutral600 },
  title: {
    ...font.headingBold,
    fontSize: ms(28),
    lineHeight: ms(32),
    color: colors.text,
    marginTop: ms(20),
    textAlign: "center",
  },
  body: {
    ...font.body,
    fontSize: ms(14),
    lineHeight: ms(21),
    color: colors.neutral700,
    marginTop: ms(10),
    textAlign: "center",
  },
});
