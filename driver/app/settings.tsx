/* ══════════════════════════════════════════════════════════════════════════
   Settings, reduced to the rows that do something.

   This screen used to be fourteen rows, and thirteen of them were a toast.

   The four notification toggles wrote to `flowStore.switches` — in-memory
   state, reset on every launch, read by nothing. A rider who turned off
   "Lampose updates" got them anyway; a rider who saw "New order requests"
   switched on had no assurance whatever that offers would make a sound. There
   is no notification-preference field on the driver model and no route that
   accepts one, so the switches were not a setting that had not been wired up
   yet — they were a control panel attached to nothing. They are gone rather
   than disabled, because a greyed-out switch still says the feature exists.

   Under them, ten Preferences rows whose entire behaviour was `say(row.toast)`.
   "Security · PIN on" — this app has no PIN. "Location · Always allowed" —
   asserted regardless of what the rider had actually granted, on the same
   handset whose home screen may at that moment be saying location is off.
   "Account · LPD-11742" — a literal, not the driverId of the person reading
   it. "Help & support" toasted "Opening support." and opened nothing, which is
   the worst of them: the one row a rider in trouble presses, and it did
   nothing while telling them it had.

   What is left is what can be true. The partner id and the account's standing
   come from `profile`. The permissions row hands the rider to the OS, which is
   the only thing that can actually change a permission. Help opens the support
   screen that genuinely exists. The version is read from the build. Nothing
   here toasts a claim about something it did not do.
   ══════════════════════════════════════════════════════════════════════════ */
import Constants from "expo-constants";
import { router } from "expo-router";
import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn, DataRow, Icon, SectionHeader, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { useSheet } from "@/hooks/useSheet";
import { useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, layout, radius, space } from "@/theme";

/** The account's standing, in the same words the Profile tab uses for it. */
const STATUS_WORD: Record<string, string> = {
  approved: "Verified partner",
  pending: "Under review",
  rejected: "Not approved",
  suspended: "On hold",
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say, setOverlay } = useFlowStore();
  const sheet = useSheet();

  const profile = useDriverStore((s) => s.profile);

  /* Read from the build rather than typed into a table. The old row said
     "v4.2.1" against an app.config that has always said 1.0.0, so the one
     number support would ask a rider to read out was wrong. */
  const version = Constants.expoConfig?.version ?? "";

  /*
    The OS owns permissions, and this is the only honest thing an app can do
    about them: hand the rider to the page where they are actually changed.
    `openSettings` can be refused on some Android builds, so the fallback is
    the instruction, not a claim that something opened.
  */
  const openPhoneSettings = () => {
    Linking.openSettings().catch(() =>
      say("Open your phone's Settings, find Lampose Driver, and change it there."),
    );
  };

  return (
    <View style={styles.root}>
      <TopBar back="Profile" title="Settings" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={{ gap: space[2] }}>
          <SectionHeader title="Account" />
          {/* Facts, not controls. None of these is changed from this screen —
              an administrator decides the standing and the id is issued at
              sign-up — so none of them is dressed up as a row that can be
              pressed. */}
          <View style={styles.group}>
            <View style={styles.dataWrap}>
              <DataRow label="Partner ID" value={profile?.driverId || "—"} first />
              <DataRow label="Registered number" value={profile?.phone || "—"} />
              <DataRow
                label="Account status"
                value={STATUS_WORD[profile?.status ?? ""] ?? "Under review"}
              />
            </View>
          </View>
          {/* The approver's own sentence when there is one — the same string
              the home screen puts above the dead duty switch. */}
          {!!profile?.blockedReason && (
            <Text variant="caption" color="tertiary" style={{ paddingHorizontal: space[1] }}>
              {profile.blockedReason}
            </Text>
          )}
        </View>

        <View style={{ gap: space[2] }}>
          <SectionHeader title="App" />
          <View style={styles.group}>
            <Pressable
              onPress={openPhoneSettings}
              accessibilityRole="button"
              accessibilityLabel="Permissions, opens your phone settings"
              style={({ pressed }) => [
                styles.row,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text variant="bodyLg" style={{ flex: 1 }}>
                Permissions
              </Text>
              <Text variant="numMeta" color="tertiary" numberOfLines={1} style={{ flexShrink: 1 }}>
                Phone settings
              </Text>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>

            <Pressable
              onPress={() => router.push("/support")}
              accessibilityRole="button"
              accessibilityLabel="Help and support"
              style={({ pressed }) => [
                styles.row,
                styles.divided,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text variant="bodyLg" style={{ flex: 1 }}>
                Help &amp; support
              </Text>
              <Icon name="chevronRight" size={15} color={colors.textTertiary} />
            </Pressable>

            <View style={[styles.row, styles.divided]}>
              <Text variant="bodyLg" style={{ flex: 1 }}>
                Lampose Driver
              </Text>
              <Text variant="numMeta" color="tertiary">
                {version ? `v${version}` : "—"}
              </Text>
            </View>
          </View>
        </View>

        <Btn label="Log out" variant="danger" glyph="logout" onPress={() => setOverlay("logout")} />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingBottom: space[6], gap: space[4] },
  group: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  dataWrap: { paddingHorizontal: space[4], paddingVertical: space[1] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[3] + 2,
    paddingHorizontal: space[3],
  },
  divided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
});
