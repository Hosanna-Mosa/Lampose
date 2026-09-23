import { router } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text as RNText, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Chip, Icon, Sheet, Toast } from "@/components/ui";
import { PROFILE_ROWS } from "@/constants/lampose";
import { useSheet } from "@/hooks/useSheet";
import { useFlowStore } from "@/store/flowStore";
import { useDriverStore } from "@/store/driverStore";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

/** The account's verdict, as a word and a tone. Never a colour alone. */
const STATUS: Record<string, { label: string; tone: ToneName }> = {
  approved: { label: "Verified Partner", tone: "success" },
  pending: { label: "Under Review", tone: "warning" },
  rejected: { label: "Not Approved", tone: "danger" },
  suspended: { label: "On Hold", tone: "danger" },
};

/** Stat item with green icon badge and title-case label. */
function ProfileStatItem({
  iconName,
  value,
  label,
}: {
  iconName: "rupee" | "orders" | "documents";
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statItem}>
      <View style={styles.statIconCircle}>
        <Icon name={iconName} size={18} color="#059669" />
      </View>
      <RNText style={styles.statValueText}>{value}</RNText>
      <RNText style={styles.statLabelText}>{label}</RNText>
    </View>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { toast, setOverlay } = useFlowStore();
  const sheet = useSheet();

  const profile = useDriverStore((s) => s.profile);
  const earnings = useDriverStore((s) => s.earnings);
  const history = useDriverStore((s) => s.history);
  const refreshProfile = useDriverStore((s) => s.refreshProfile);

  React.useEffect(() => {
    refreshProfile().catch(() => {});
  }, [refreshProfile]);

  const status = STATUS[profile?.status ?? "pending"] ?? STATUS.pending;
  const documents = profile?.documents ?? [];
  const rejected = documents.filter((d) => d.status === "rejected").length;
  const verified = documents.filter((d) => d.status === "verified").length;

  const metaFor: Record<string, string | undefined> = {
    "/profile-details": profile?.name || "Add your name",
    "/vehicle": profile?.vehicle?.plate || "Add your vehicle",
    "/documents": rejected
      ? `${rejected} need${rejected === 1 ? "s" : ""} attention`
      : `${verified} of ${documents.length || 5} verified`,
    "/bank-details": profile?.payout?.accountLast4
      ? `${profile.payout.bankName || "Bank"} ••••${profile.payout.accountLast4}`
      : profile?.payout?.upiId || "Add a payout method",
    "/earnings": earnings.week ? `₹${earnings.week.toLocaleString("en-IN")} this week` : "",
    "/orders": history.length ? `${history.length} delivered` : "",
  };

  const toneFor = (route: string): ToneName | undefined =>
    route === "/documents" && rejected ? "danger" : undefined;

  const driverName = profile?.name || "Partner Rider";
  const driverId = profile?.driverId || "DR-285792FE";

  return (
    <View style={styles.root}>
      {/* ── Mint Top Header Card ─────────────────────────────────────── */}
      <View style={[styles.headerContainer, { paddingTop: Math.max(insets.top + 8, 20) }]}>
        <RNText style={styles.pageHeaderTitle}>Profile</RNText>
        <View style={styles.profileCard}>
          <Avatar name={driverName} size={68} />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <RNText style={styles.driverNameText} numberOfLines={1}>
              {driverName}
            </RNText>
            <RNText style={styles.driverIdText} numberOfLines={1}>
              {driverId}
            </RNText>
            <View style={styles.statusChipWrap}>
              <Chip label={status.label} tone={status.tone} glyph="shield" />
            </View>
          </View>
        </View>

        {/* Transparent Stat Bar */}
        <View style={styles.statGrid}>
          <ProfileStatItem
            iconName="rupee"
            value={`₹${earnings.week.toLocaleString("en-IN")}`}
            label="This week"
          />
          <ProfileStatItem
            iconName="orders"
            value={String(earnings.weekTrips)}
            label="Trips"
          />
          <ProfileStatItem
            iconName="documents"
            value={`${verified}/${documents.length || 5}`}
            label="Documents"
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Seamless Account List (No Bulky Cards) ──────────────────── */}
        <View style={styles.listContainer}>
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
                  styles.seamlessRow,
                  i > 0 && styles.rowDivided,
                  pressed && styles.pressedRow,
                ]}
              >
                {/* Icon circle — neutral by default, tinted only when the
                    row itself carries a real status (e.g. a rejected
                    document), never mint as a decoration. */}
                <View
                  style={[
                    styles.rowGlyphCircle,
                    { backgroundColor: ink ? ink.tint : "#f3f4f6" },
                  ]}
                >
                  <Icon name={row.icon} size={18} color={ink ? ink.ink : "#059669"} />
                </View>

                {/* Title */}
                <RNText
                  style={[styles.rowTitleText, ink ? { color: ink.ink } : null]}
                  numberOfLines={1}
                >
                  {row.t}
                </RNText>

                {/* Meta Detail (Clean Sans-Serif) */}
                {!!meta && (
                  <RNText
                    style={[styles.rowMetaText, ink ? { color: ink.ink } : null]}
                    numberOfLines={1}
                  >
                    {meta}
                  </RNText>
                )}
                <Icon name="chevronRight" size={16} color="#9ca3af" />
              </Pressable>
            );
          })}
        </View>

        {/* ── Logout Button ────────────────────────────────────────── */}
        <Btn
          label="Log out"
          variant="danger"
          glyph="logout"
          onPress={() => setOverlay("logout")}
          style={styles.logoutBtn}
        />

        {/* Below Log out and quieter than it: the one row here whose effect
            cannot be undone with another tap, so it is a door to a screen
            that explains and asks, never an action on the tap itself. */}
        <Btn
          label="Delete account"
          variant="quiet"
          onPress={() => router.push("/delete-account")}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  content: {
    paddingHorizontal: layout.gutter,
    paddingTop: space[3],
    paddingBottom: space[8],
    gap: space[4],
  },

  /* Top header — no fill of its own now, so it reads as part of the same
     page as everything below it rather than a separate mint panel. */
  headerContainer: {
    paddingHorizontal: layout.gutter,
    paddingBottom: space[4],
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  pageHeaderTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#064e3b",
    marginBottom: space[3],
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    marginBottom: space[3],
  },
  driverNameText: {
    fontSize: 20,
    fontWeight: "800",
    color: "#064e3b",
  },
  driverIdText: {
    fontSize: 13,
    color: "#6b7280",
    marginTop: 1,
  },
  statusChipWrap: {
    alignSelf: "flex-start",
    marginTop: 4,
  },

  /* Transparent Stat Grid */
  statGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: space[2],
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  statItem: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  statIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  statValueText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#064e3b",
  },
  statLabelText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#047857",
    marginTop: 2,
  },

  /* Seamless Account List */
  listContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderWidth: 1,
    borderColor: "#e5e7eb",
    ...elevation.card,
  },
  seamlessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: 14,
    paddingHorizontal: space[2],
    borderRadius: 12,
  },
  rowDivided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f3f4f6",
  },
  rowGlyphCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitleText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: "600",
    color: "#1f2937",
  },
  rowMetaText: {
    fontSize: 12.5,
    color: "#6b7280",
    marginRight: 4,
  },
  pressedRow: {
    backgroundColor: "#f9fafb",
  },

  logoutBtn: {
    marginTop: space[2],
  },
});
