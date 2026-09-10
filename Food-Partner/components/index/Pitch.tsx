/* ══════════════════════════════════════════════════════════════════════════
   The pitch.

   This app's answer to the website's food-partner landing page, in the same
   words, laid out for a 390pt phone instead of a two-column hero. The copy is
   transcribed rather than rewritten — see `constants/partner.ts`.

   It is also the app's junction: a partner with an application in flight is
   offered the status screen, one mid-form is offered their draft back, and a
   returning partner can sign in. Nothing is redirected automatically, because
   a redirect out of the first screen is a screen nobody can reach.
   ══════════════════════════════════════════════════════════════════════════ */
import { centredLinkRow, iconBadge } from "@/components/common/utils/sharedStyles";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Box, Btn, Card, Chip, Dot, Icon, Notice, Rule, Scroller, Tappable, Text } from "@/components/common";
import { BENEFITS, COMMERCIALS, FAQS, HOW_STEPS, STATS } from "@/constants/partner";
import { usePartnerStore } from "@/store/partnerStore";
import { colors, layout, radius, space, touch } from "@/theme";

const TICKET = [
  { qty: "1", name: "Chicken biryani", price: "320" },
  { qty: "2", name: "Butter naan", price: "80" },
  { qty: "1", name: "Gulab jamun", price: "60" },
];

export function Pitch() {
  const insets = useSafeAreaInsets();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
        contentContainerStyle={[styles.body, { paddingTop: insets.top + space[5] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Wordmark ─────────────────────────────────────────────────── */}
        <Box style={{ alignItems: "center", gap: space[2] }}>
          <Box style={styles.mark}>
            <Text variant="display1" style={{ color: colors.onBrand }}>
              L
            </Text>
          </Box>
          <Text variant="display1">Lampose</Text>
          <Text variant="eyebrow" color="brand">
            Food partner
          </Text>
        </Box>

        {/* ── Anything already in flight ───────────────────────────────── */}
        {signedIn && (
          <Tappable accessibilityRole="button" onPress={() => router.replace("/(dash)")}>
            <Notice
              tone="success"
              glyph="check"
              title={`${session?.restaurantName} is live`}
              body="Tap to open your dashboard."
            />
          </Tappable>
        )}
        {inFlight && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/status")}>
            <Notice
              tone="success"
              glyph="check"
              title="Your application is with us"
              body="Tap to see where it has got to."
            />
          </Tappable>
        )}
        {hasDraft && (
          <Tappable accessibilityRole="button" onPress={() => router.push("/onboarding/restaurant")}>
            <Notice
              tone="warning"
              glyph="edit"
              title={`${data.restaurantName} is half finished`}
              body="Tap to pick the application back up where you left it."
            />
          </Tappable>
        )}

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <Box style={{ gap: space[3] }}>
          <Text variant="display1">Your kitchen, on the street</Text>
          <Text variant="display1" color="brand" style={{ marginTop: -space[2] }}>
            it already feeds.
          </Text>
          <Text variant="bodyLg" color="secondary">
            Lampose lists verified stays and the kitchens beside them. Put yours on the map and take
            orders from the residents who live a walk away — no listing fee, no brokerage, and a person
            from our team who turns up in the first week.
          </Text>
        </Box>

        {/* ── The ticket. Decorative, so screen readers skip the lot. ──── */}
        <Card
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.ticket}
        >
          <Box style={styles.ticketHead}>
            <Box style={styles.live}>
              <Dot tone={colors.brand} size={6} />
              <Text variant="label" color="brand">
                Live order
              </Text>
            </Box>
            <Text variant="numMeta" color="tertiary">
              #ORD-2481
            </Text>
          </Box>
          <Text variant="caption" color="tertiary">
            Table of one · MVP Colony · 600 m away
          </Text>
          <Rule subtle />
          {TICKET.map((line) => (
            <Box key={line.name} style={styles.ticketLine}>
              <Text variant="priceSm" color="tertiary">
                {line.qty}×
              </Text>
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {line.name}
              </Text>
              <Text variant="priceSm">₹{line.price}</Text>
            </Box>
          ))}
          <Rule subtle />
          <Box style={styles.ticketFoot}>
            <Box>
              <Text variant="caption" color="tertiary">
                Order total
              </Text>
              <Text variant="priceLg">₹460</Text>
            </Box>
            <Chip label="Accept" tone="brand" glyph="check" />
          </Box>
        </Card>

        <Box style={{ flexDirection: "row", gap: space[3] }}>
          <Card style={styles.float}>
            <Icon name="wallet" size={16} color={colors.brandInk} />
            <Text variant="priceMd">₹8,240</Text>
            <Text variant="caption" color="tertiary">
              settled Monday
            </Text>
          </Card>
          <Card style={styles.float}>
            <Icon name="star" size={16} color={colors.warning.base} />
            <Text variant="priceMd">4.8 / 214</Text>
            <Text variant="caption" color="tertiary">
              all within a walk
            </Text>
          </Card>
        </Box>

        <Btn label="Start onboarding" glyph="arrowRight" onPress={start} />

        {/* ── Stats ────────────────────────────────────────────────────── */}
        <Box style={styles.statGrid}>
          {STATS.map(([value, label]) => (
            <Card key={label} style={styles.stat}>
              <Text variant="priceLg">{value}</Text>
              <Text variant="caption" color="tertiary">
                {label}
              </Text>
            </Card>
          ))}
        </Box>

        {/* ── Benefits ─────────────────────────────────────────────────── */}
        <Box style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="tertiary">
            Why partner
          </Text>
          <Text variant="display2">What you get, in plain terms.</Text>
          {BENEFITS.map((b) => (
            <Card key={b.title} style={{ gap: space[2] }}>
              <Box style={styles.benefitIco}>
                <Icon name={b.glyph} size={18} color={colors.brandInk} />
              </Box>
              <Text variant="title1">{b.title}</Text>
              <Text variant="body" color="secondary">
                {b.desc}
              </Text>
            </Card>
          ))}
        </Box>

        {/* ── How it works ─────────────────────────────────────────────── */}
        <Box style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="tertiary">
            How it works
          </Text>
          <Text variant="display2">Five steps, about ten minutes.</Text>
          <Text variant="body" color="secondary">
            You can save a half-finished application and come back to it — nothing here has to be done
            in one sitting.
          </Text>
          {HOW_STEPS.map((s) => (
            <Box key={s.step} style={styles.howRow}>
              <Box style={styles.howNum}>
                <Text variant="priceSm" color="brand">
                  {s.step}
                </Text>
              </Box>
              <Box style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="title2">{s.title}</Text>
                <Text variant="caption" color="tertiary">
                  {s.desc}
                </Text>
              </Box>
            </Box>
          ))}
        </Box>

        <Card style={{ gap: space[2] }}>
          <Text variant="title1">Have these to hand</Text>
          <Text variant="body" color="secondary">
            PAN · FSSAI licence · GST registration (unless exempt) · a cancelled cheque · your bank
            account
          </Text>
        </Card>

        {/* ── Commercials ──────────────────────────────────────────────── */}
        <Box style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="tertiary">
            What it costs
          </Text>
          <Card style={{ gap: space[3] }}>
            {COMMERCIALS.slice(0, 3).map((c) => (
              <Box key={c.label} style={{ gap: 2 }}>
                <Text variant="title3">{c.label}</Text>
                <Text variant="caption" color="tertiary">
                  {c.value}
                </Text>
              </Box>
            ))}
          </Card>
        </Box>

        {/* ── FAQs ─────────────────────────────────────────────────────── */}
        <Box style={{ gap: space[3] }}>
          <Text variant="eyebrow" color="tertiary">
            Questions
          </Text>
          <Text variant="display2">Asked before, answered here.</Text>
          {FAQS.map((faq, i) => {
            const open = openFaq === i;
            return (
              <Card key={faq.q} style={{ gap: open ? space[2] : 0 }}>
                <Tappable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                  onPress={() => setOpenFaq(open ? null : i)}
                  style={styles.faqRow}
                >
                  <Text variant="title2" style={{ flex: 1 }}>
                    {faq.q}
                  </Text>
                  <Icon name={open ? "minus" : "plus"} size={16} color={colors.textSecondary} />
                </Tappable>
                {open && (
                  <Text variant="body" color="secondary">
                    {faq.a}
                  </Text>
                )}
              </Card>
            );
          })}
        </Box>

        {/* ── Closing band ─────────────────────────────────────────────── */}
        <Box style={styles.band}>
          <Text variant="display2" style={{ color: colors.onGraphite }}>
            Ready to cook for the street?
          </Text>
          <Text variant="body" style={{ color: colors.onGraphiteMuted }}>
            Fill the application in today and someone from the team will be in touch within 24 hours.
          </Text>
          <Btn label="Start onboarding" onPress={start} />
        </Box>

        <Tappable
          accessibilityRole="button"
          onPress={() => router.push("/signin")}
          style={styles.signinRow}
        >
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
  body: { paddingHorizontal: layout.gutter, paddingBottom: space[10], gap: space[6] },
  mark: {
    width: 56,
    height: 56,
    borderRadius: radius.card,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },

  ticket: { gap: space[3] },
  ticketHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  live: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    backgroundColor: colors.brandTint,
    borderRadius: radius.chip,
    paddingHorizontal: space[2],
    paddingVertical: 4,
  },
  ticketLine: { flexDirection: "row", alignItems: "center", gap: space[2] },
  ticketFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  float: { flex: 1, gap: space[1], padding: space[3] },

  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  stat: { flexBasis: "47%", flexGrow: 1, gap: space[1], padding: space[3] },

  benefitIco: iconBadge,

  howRow: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  howNum: {
    width: 40,
    height: 28,
    borderRadius: radius.chip,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },

  faqRow: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: touch.min },

  band: {
    backgroundColor: colors.graphite,
    borderRadius: radius.card,
    padding: space[5],
    gap: space[3],
  },

  signinRow: centredLinkRow,

  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: space[3],
  },
});
