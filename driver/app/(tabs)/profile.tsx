import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatCard } from "@/app/(tabs)/index";
import { Avatar, Btn, Chip, Icon, Sheet, Text, Toast, TopBar } from "@/components/ui";
import { PROFILE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore } from "@/store/driverStore";
import { colors, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

/** The account's verdict, as a word and a tone. Never a colour alone. */
const STATUS: Record<string, { label: string; tone: ToneName }> = {
  approved: { label: "Verified partner", tone: "success" },
  pending: { label: "Under review", tone: "warning" },
  rejected: { label: "Not approved", tone: "danger" },
  suspended: { label: "On hold", tone: "danger" },
};

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  const profile = useDriverStore((s) => s.profile);
  const earnings = useDriverStore((s) => s.earnings);
  const history = useDriverStore((s) => s.history);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  /* Re-read on open: an approval or a document decision made in the console
     while this app was backgrounded is exactly what a rider comes here to
     find out about. */
  React.useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const status = STATUS[profile?.status ?? "pending"] ?? STATUS.pending;
  const documents = profile?.documents ?? [];
  const rejected = documents.filter((d) => d.status === "rejected").length;
  const verified = documents.filter((d) => d.status === "verified").length;

  /*
    The meta line under each row, from the account rather than from a table of
    examples. `undefined` leaves the row's own default in place; an empty
    string is a row that deliberately shows nothing.
  */
  const metaFor: Record<string, string | undefined> = {
    "/profile-details": profile?.name || "Add your name",
    "/vehicle": profile?.vehicle?.plate || "Add your vehicle",
    "/documents": rejected
      ? `${rejected} need${rejected === 1 ? "s" : ""} attention`
      : `${verified} of ${documents.length || 5} verified`,
    /* The last four digits, because they are all the server will ever send
       back — `bankAccountNumber` is `select: false` and stripped by `toJSON`.
       This key used to read `/payouts`, a route that no longer exists, so the
       row it was meant to annotate had been showing nothing at all. */
    "/bank-details": profile?.payout?.accountLast4
      ? `${profile.payout.bankName || "Bank"} ••••${profile.payout.accountLast4}`
      : profile?.payout?.upiId || "Add a payout method",
    "/earnings": earnings.week ? `₹${earnings.week.toLocaleString("en-IN")} this week` : "",
    "/orders": history.length ? `${history.length} delivered` : "",
  };

  /* A rejected document turns its row red wherever it appears in the list —
     the one thing on this screen a rider has to act on. */
  const toneFor = (route: string): ToneName | undefined =>
    route === "/documents" && rejected ? "danger" : undefined;

  return (
    <View style={styles.root}>
      <TopBar title="Profile" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Avatar name={profile?.name || "Partner"} size={64} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text variant="display2" numberOfLines={1}>
              {profile?.name || "Your name"}
            </Text>
            <Text variant="numMeta" color="tertiary" numberOfLines={1}>
              {profile?.driverId ?? "—"}
            </Text>
            <Chip label={status.label} tone={status.tone} glyph="shield" style={{ marginTop: space[1] }} />
          </View>
        </View>

        {/* Every figure here is derived from what this rider has actually
            carried. There is no rating in the product yet, so there is no
            rating tile — an invented 4.8 is worse than an absent one. */}
        <View style={styles.statGrid}>
          <StatCard label="This week" value={`₹${earnings.week.toLocaleString("en-IN")}`} />
          <StatCard label="Trips" value={String(earnings.weekTrips)} />
          <StatCard
            label="Documents"
            value={`${verified}/${documents.length || 5}`}
          />
        </View>

        {/* The account list — one card, hairlines between rows. */}
        <View style={styles.list}>
          {PROFILE_ROWS.map((row, i) => {
            const rowTone = toneFor(row.route) ?? row.tone;
            const meta = metaFor[row.route] ?? row.meta;
            const ink = rowTone ? resolveTone(rowTone) : null;
            return (
              <Pressable
                key={row.t}
                onPress={() => router.push(row.route as never)}
                accessibilityRole="button"
                accessibilityLabel={meta ? `${row.t}, ${meta}` : row.t}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && styles.rowDivided,
                  pressed && { backgroundColor: colors.surfaceSunken },
                ]}
              >
                <View
                  style={[
                    styles.rowGlyph,
                    { backgroundColor: ink ? ink.tint : colors.surfaceSunken },
                  ]}
                >
                  <Icon name={row.icon} size={17} color={ink ? ink.ink : colors.textSecondary} />
                </View>

                <Text
                  variant="bodyLg"
                  style={[{ flex: 1 }, ink ? { color: ink.ink } : null]}
                  numberOfLines={1}
                >
                  {row.t}
                </Text>

                {!!meta && (
                  <Text
                    variant="numMeta"
                    color={ink ? "inherit" : "tertiary"}
                    style={[{ flexShrink: 1, maxWidth: "42%" }, ink ? { color: ink.ink } : null]}
                    numberOfLines={1}
                  >
                    {meta}
                  </Text>
                )}
                <Icon name="chevronRight" size={15} color={colors.textTertiary} />
              </Pressable>
            );
          })}
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
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  head: { flexDirection: "row", gap: space[3], alignItems: "center" },
  statGrid: { flexDirection: "row", gap: space[2] },

  list: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  rowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  rowGlyph: {
    width: 32,
    height: 32,
    borderRadius: radius.chip,
    alignItems: "center",
    justifyContent: "center",
  },
});
