/* ══════════════════════════════════════════════════════════════════════════
   The pitch — kept deliberately short.

   This used to be the full website pitch transcribed onto a phone screen:
   hero paragraph, a demo order ticket, stat cards, a benefits list, a
   how-it-works walkthrough, a commercials section, an FAQ accordion, a
   closing band. All of that asked to be READ before the one thing this
   screen actually needs to do — get a new restaurant into onboarding, or get
   a returning one to their status/draft/dashboard — could happen, and it
   made the app's front door a page you had to scroll through on a phone.
   The full sales pitch lives on the website; this is a door, not a deck.

   It is still the app's junction: a partner with an application in flight is
   offered the status screen, one mid-form is offered their draft back, and a
   returning partner can sign in. Nothing is redirected automatically, because
   a redirect out of the first screen is a screen nobody can reach.
   ══════════════════════════════════════════════════════════════════════════ */
import { centredLinkRow } from "@/components/common/utils/sharedStyles";
import { router } from "expo-router";
import React from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Btn, Icon, Notice, Scroller, Tappable, Text } from "@/components/common";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, elevation, layout, radius, space } from "@/theme";

/** Three words each, glanceable rather than read — not the benefits list this
    screen used to carry. */
const TRUST = [
  { glyph: "check", label: "No listing fee" },
  { glyph: "shieldCheck", label: "Verified kitchens" },
  { glyph: "wallet", label: "Weekly payouts" },
] as const;

export function Pitch() {
  const insets = useSafeAreaInsets();

  const status = usePartnerStore((s) => s.status);
  const data = usePartnerStore((s) => s.data);
  const session = usePartnerStore((s) => s.session);

  const signedIn = !!session?.token && status === "approved";
  const inFlight = !signedIn && status !== "none" && status !== "draft";
  /* `!inFlight` alone is not "still a draft" — it is also true once approved,
     because approval never clears the onboarding `data` that carried the
     draft. Missing `!signedIn` here showed "is live" and "is half finished"
     for the same restaurant on the same screen at once. */
  const hasDraft = !signedIn && !inFlight && !!data.restaurantName.trim();

  const start = () => router.push("/onboarding/restaurant");

  return (
    <Box style={{ flex: 1, backgroundColor: colors.bg }}>
      <Scroller
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[5] },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Wordmark ─────────────────────────────────────────────────── */}
        <Box style={{ alignItems: "center", gap: space[2] }}>
          <Box style={styles.markHalo}>
            <Box style={styles.mark}>
              <Text variant="display1" style={{ color: colors.onBrand }}>
                L
              </Text>
            </Box>
          </Box>
          <Text variant="display1">Lampose</Text>
          <Text variant="eyebrow" color="brand">
            Food partner
          </Text>
        </Box>

        {/* ── Whichever of these is true is the one thing worth saying —
            ahead of anything else, not after a scroll past it. The chevron
            plus the raised shadow (`elevation.card`, the same weight the app
            gives a real card elsewhere) is what tells these three apart from
            `Notice`'s ordinary, static use on the Status screen: those never
            go anywhere when tapped, these always do. ──────────────────── */}
        {signedIn && (
          <Tappable accessibilityRole="button" onPress={() => router.replace("/(dash)")}>
            <Notice
              tone="success"
              glyph="check"
              chevron
              title={`${session?.restaurantName} is live`}
              body="Tap to open your dashboard."
              style={elevation.card}
            />
          </Tappable>
        )}
        {inFlight && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/status")}>
            <Notice
              tone="success"
              glyph="check"
              chevron
              title="Your application is with us"
              body="Tap to see where it has got to."
              style={elevation.card}
            />
          </Tappable>
        )}
        {hasDraft && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/onboarding/restaurant")}>
            <Notice
              tone="warning"
              glyph="edit"
              chevron
              title={`${data.restaurantName} is half finished`}
              body="Tap to pick the application back up where you left off."
              style={elevation.card}
            />
          </Tappable>
        )}

        <Text variant="display2" style={{ textAlign: "center" }}>
          List your kitchen on Lampose.
        </Text>

        {/* ── Three words each, not three sentences — enough to still look
            like a page rather than a form with a logo on it. ─────────────── */}
        <Box style={styles.trustRow}>
          {TRUST.map((t) => (
            <Box key={t.label} style={styles.trustItem}>
              <Box style={styles.trustIcon}>
                <Icon name={t.glyph} size={16} color={colors.brandInk} />
              </Box>
              <Text variant="caption" color="secondary" style={{ textAlign: "center" }}>
                {t.label}
              </Text>
            </Box>
          ))}
        </Box>

        <Btn label="Start onboarding" glyph="arrowRight" onPress={start} />

        <Tappable accessibilityRole="button" onPress={() => router.push("/signin")} style={styles.link}>
          <Text variant="body" color="secondary">
            Already applied?
          </Text>
          <Text variant="bodyStrong" color="brand">
            Sign in
          </Text>
        </Tappable>
      </Scroller>
    </Box>
  );
}

const styles = StyleSheet.create({
  /* `flexGrow: 1` + `justifyContent: "center"` is what keeps this vertically
     centred on an ordinary screen rather than pinned to the top with empty
     space below — there is deliberately little enough content left here that
     it would otherwise look like an unfinished page. The `Scroller` is kept
     rather than swapped for a bare `View` only so a very small device or a
     large system font size still has somewhere for the overflow to go. */
  body: { paddingHorizontal: layout.gutter, gap: space[5], flexGrow: 1, justifyContent: "center" },
  /* A soft tinted disc behind the mark — the one purely decorative touch on
     the screen, there so the logo does not sit directly on the bare
     background the way everything else here does. */
  markHalo: {
    width: 88,
    height: 88,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    ...elevation.card,
  },
  link: centredLinkRow,

  trustRow: { flexDirection: "row", justifyContent: "center", gap: space[5] },
  trustItem: { alignItems: "center", gap: space[1], width: 88 },
  trustIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
});
