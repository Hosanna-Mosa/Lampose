import { router } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";
import { Box, Btn, Text } from "@/components/common";
import { colors, layout, space } from "@/theme";

export default function NotFound() {
  return (
    <Box style={styles.root}>
      <Text variant="title">Screen not found</Text>
      <Text variant="body" color="secondary" style={{ textAlign: "center" }}>
        That route does not exist in this app.
      </Text>
      <Btn label="Back to the start" onPress={() => router.replace("/")} />
    </Box>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: space[3],
    paddingHorizontal: layout.gutter,
  },
});
