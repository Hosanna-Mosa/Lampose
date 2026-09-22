/* ══════════════════════════════════════════════════════════════════════════
   The one screen a signed-in rep sees: their name, and the switch.

   Real now, end to end: turning it on asks for location permission, takes
   one fix, and sends it to `/api/v2/sales/me/duty` — that call is what
   `useAuthStore`'s `setDuty` does. `useDutyLocationHeartbeat` is what keeps
   sending fixes for as long as the switch stays on.
   ══════════════════════════════════════════════════════════════════════════ */
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Box, Note, Text } from "@/components/common";
import { useDutyLocationHeartbeat } from "@/hooks/useDutyLocationHeartbeat";
import { useAuthStore } from "@/store/authStore";
import { colors, layout, radius, space } from "@/theme";

export function ToggleScreen() {
  const insets = useSafeAreaInsets();
  const rep = useAuthStore((s) => s.session?.salesRep);
  const dutyBusy = useAuthStore((s) => s.dutyBusy);
  const setDuty = useAuthStore((s) => s.setDuty);
  const refreshMe = useAuthStore((s) => s.refreshMe);

  const [error, setError] = useState("");
  const onDuty = rep?.onDuty ?? false;

  /* Re-checks the token against the server once, at launch — see the note on
     `refreshMe`. Also the only way this screen learns the rep was already on
     duty from an earlier session. */
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  /* Sends a fix to the server for as long as `onDuty` reads true — see the
     hook's own header for why this is foreground-only. */
  useDutyLocationHeartbeat();

  const toggle = async (value: boolean) => {
    setError("");
    try {
      await setDuty(value);
    } catch (err) {
      setError((err as Error)?.message || "Something went wrong. Please try again.");
    }
  };

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <Box style={[styles.header, { paddingTop: insets.top + space[3] }]}>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Text variant="title" numberOfLines={1}>
            {rep?.name || "—"}
          </Text>
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {rep?.email || ""}
          </Text>
        </Box>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log out"
          onPress={() => router.push("/logout")}
          style={styles.logoutBtn}
        >
          <Text variant="bodyStrong" color="brand">
            Log out
          </Text>
        </Pressable>
      </Box>

      <Box style={styles.center}>
        <Box style={[styles.ring, { borderColor: onDuty ? colors.online : colors.border }]}>
          <Box
            style={[
              styles.dot,
              { backgroundColor: onDuty ? colors.online : colors.offline },
            ]}
          />
        </Box>

        <Text variant="display" style={{ marginTop: space[5] }}>
          {onDuty ? "You're online" : "You're offline"}
        </Text>
        <Text variant="body" color="secondary" style={{ marginTop: space[2], textAlign: "center" }}>
          {dutyBusy
            ? "Getting your location…"
            : onDuty
              ? "Lampose can see where you're visiting clients."
              : "Turn this on when you head out to visit a client."}
        </Text>

        {!!error && (
          <Box style={{ marginTop: space[4], width: "100%" }}>
            <Note tone="bad">{error}</Note>
          </Box>
        )}

        <Box style={styles.switchRow}>
          <Text variant="bodyStrong">{onDuty ? "Online" : "Offline"}</Text>
          {dutyBusy ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Switch
              value={onDuty}
              onValueChange={toggle}
              disabled={dutyBusy}
              trackColor={{ false: colors.border, true: colors.brandTint }}
              thumbColor={onDuty ? colors.brand : colors.surface}
            />
          )}
        </Box>
      </Box>
    </Box>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: layout.gutter,
    paddingBottom: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logoutBtn: { minHeight: 32, justifyContent: "center" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.gutter,
  },
  ring: {
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    borderWidth: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 28, height: 28, borderRadius: radius.pill },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    marginTop: space[7],
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },
});
