/* The done screen. `replace`, never `push`, everywhere it is reached from: no
   back gesture may land a partner inside an application they have already
   sent. */
import { router } from "expo-router";
import React from "react";
import {
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Btn, Icon, Text } from "@/components/common";
import { COPY } from "@/constants/partner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space } from "@/theme";

export function Submitted() {
  const insets = useSafeAreaInsets();
  const data = usePartnerStore((s) => s.data);
  const restaurantId = usePartnerStore((s) => s.restaurantId);

  return (
    <Box style={[styles.root, { paddingTop: insets.top + space[10], paddingBottom: insets.bottom + space[5] }]}>
      <Box style={{ flex: 1, alignItems: "center", gap: space[3] }}>
        <Box style={styles.badge}>
          <Icon name="check" size={30} color={colors.onBrand} strokeWidth={2.5} />
        </Box>

        <Text variant="display1" style={{ textAlign: "center" }}>
          Application submitted
        </Text>
        <Text variant="bodyLg" color="secondary" style={{ textAlign: "center" }}>
          Thanks for partnering with Lampose. Someone from the team reviews your {COPY.noun} and comes
          back within 24 hours to help you go live.
        </Text>

        {!!restaurantId && (
          <Box style={styles.ref}>
            <Text variant="eyebrow" color="tertiary">
              Reference
            </Text>
            <Text variant="priceLg">{restaurantId}</Text>
          </Box>
        )}

        <Text variant="caption" color="tertiary" style={{ textAlign: "center" }}>
          Once you are approved, sign in with{" "}
          <Text variant="bodyStrong">{data.ownerEmail || "your owner email"}</Text> and the password you
          set here.
        </Text>
      </Box>

      <Box style={{ gap: space[2] }}>
        <Btn label="Track the application" glyph="arrowRight" onPress={() => router.replace("/status")} />
        <Btn label="Back to the start" variant="ghost" onPress={() => router.replace("/")} />
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: layout.gutter + space[1] },
  badge: {
    width: 68,
    height: 68,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space[2],
  },
  ref: {
    alignItems: "center",
    gap: 2,
    backgroundColor: colors.brandTint,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.brandOnDark,
    borderRadius: radius.card,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
    marginVertical: space[2],
  },
});
