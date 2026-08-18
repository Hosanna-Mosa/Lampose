import { router, Stack } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Btn, Icon, Text, TopBar } from "@/components/ui";
import { colors, layout, radius, space } from "@/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.root}>
        <TopBar title="Not found" />
        <View style={styles.body}>
          <View style={styles.mark}>
            <Icon name="search" size={26} color={colors.textTertiary} />
        </View>
        <Text variant="display1" style={styles.centered}>
          This screen doesn&apos;t exist
        </Text>
        <Text variant="bodyLg" color="secondary" style={styles.centered}>
          The link you followed points somewhere the app doesn&apos;t have. Let&apos;s get you back.
        </Text>
        <Btn label="Back to home" glyph="home" onPress={() => router.replace("/")} style={{ marginTop: space[3] }} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: layout.gutter + space[2],
    gap: space[3],
  },
  centered: { textAlign: "center" },
  mark: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: space[2],
  },
});
