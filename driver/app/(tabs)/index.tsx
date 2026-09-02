import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Btn, Chip, Icon, Notice, Sheet, TestLocation, Text, Toast, TopBar } from "@/components/ui";
import { STAGES, STATUS, STATUS_ONLINE_IDLE } from "@/constants/lampose";
import { useDriverLocation } from "@/hooks/useDriverLocation";
import { useSheet } from "@/hooks/useSheet";
import { LOCATION_HEARTBEAT_MS, selectStage, useDriverStore } from "@/store/driverStore";
import { useFlowStore } from "@/store/flowStore";
import { colors, elevation, layout, radius, space, tone as resolveTone, type ToneName } from "@/theme";

/** Expanding ring used by the status dot and the "waiting for orders" radar. */
export function PulseRing({
  size,
  color,
  delay = 0,
  duration = 2400,
  style,
}: {
  size: number;
  color: string;
  delay?: number;
  duration?: number;
  style?: object;
}) {
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay, duration]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: color,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
          transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.6] }) }],
        },
        style,
      ]}
    />
  );
}

/** "6h 24m" from a count of minutes. Zero reads as "0m", not as blank. */
export function formatOnline(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}

/** White card with an eyebrow and a figure. The one shape a tally takes. */
export function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text variant="eyebrow" color="tertiary" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="priceHero" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {value}
      </Text>
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { toast, say, clearToast } = useFlowStore();
  const sheet = useSheet();

  const profile = useDriverStore((s) => s.profile);
  const online = useDriverStore((s) => s.isOnline);
  const togglingDuty = useDriverStore((s) => s.togglingDuty);
  const dutyNote = useDriverStore((s) => s.dutyNote);
  const setOnline = useDriverStore((s) => s.setOnline);
  const offer = useDriverStore((s) => s.offer);
  const currentJob = useDriverStore((s) => s.currentJob);
  const earnings = useDriverStore((s) => s.earnings);
  const earningsLoaded = useDriverStore((s) => s.earningsLoaded);
  const fetchEarnings = useDriverStore((s) => s.fetchEarnings);
  const pushLocation = useDriverStore((s) => s.pushLocation);
  const locationStale = useDriverStore((s) => s.locationStale);
  const jobEndedNote = useDriverStore((s) => s.jobEndedNote);
  const clearJobEndedNote = useDriverStore((s) => s.clearJobEndedNote);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
    The position feed. Started HERE rather than on the active-job screen,
    because the dispatcher will not offer to a rider whose last fix is more
    than five minutes old — so the app has to be reporting while the rider is
    waiting for work, not only once they have some.
  */
  const { location, heading, permissionDenied, setSimulated } = useDriverLocation();

  /* Read, never depended on — the compass fires several times a second on a
     moving scooter, and listing it below would re-run this effect that often:
     an immediate report of a position that has not moved, and the heartbeat
     cleared before it can fire. The bearing is worth SENDING; it is not worth
     sending FOR. Same reasoning, and the same shape, as `active.tsx`. */
  const headingRef = useRef<number | null>(null);
  headingRef.current = heading ?? null;

  useEffect(() => {
    if (!online || !location) return;
    pushLocation(location.lat, location.lng, headingRef.current ?? undefined);

    /* …and again every fifteen seconds, whether or not it has changed.

       `watchPositionAsync` only fires after five metres of movement, so a
       rider waiting at a junction produces no updates at all — and a fix older
       than five minutes is treated by the dispatcher as no fix, which takes
       them out of every search without telling them. The heartbeat is what
       makes "stationary" different from "gone". */
    const beat = setInterval(
      () => pushLocation(location.lat, location.lng, headingRef.current ?? undefined),
      LOCATION_HEARTBEAT_MS,
    );
    return () => clearInterval(beat);
  }, [online, location, pushLocation]);

  /* A simulated position, for testing on an emulator — see `TestLocation`.
     It is fed through `setSimulated`, so it reaches the server down the same
     effect above as a real fix and there is no test-only path to keep working. */
  const [simulated, setSimulatedCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    fetchEarnings().catch(() => {});
  }, [fetchEarnings]);

  /*
    An offer arriving takes the rider to it, from wherever they are.

    The offer itself lives in the store and reaches it over the socket or the
    poll; this only decides that a live one is worth interrupting for. Fifteen
    seconds is not long enough to expect somebody to notice a badge.
  */
  useEffect(() => {
    if (offer) router.push("/request");
  }, [offer]);

  const hasActive = !!currentJob;
  const searching = online && !offer && !hasActive;
  const stage = selectStage(currentJob);
  /* Derived from what is actually true rather than stepped through by a timer,
     so the status card's existing copy table still works. */
  const phase = hasActive ? "active" : online ? "searching" : "idle";

  useEffect(() => {
    if (!toast) return;
    toastTimer.current = setTimeout(clearToast, 2600);
    return () => clearTimeout(toastTimer.current ?? undefined);
  }, [toast, clearToast]);

  const status = online && !hasActive && !searching ? STATUS_ONLINE_IDLE : STATUS[phase];
  const statusInk = resolveTone(status.tone);
  const statusLabel = online ? "Online" : "Offline";

  /*
    The job ending under the rider, said rather than performed silently.

    A cancellation reaches the store wherever the rider happens to be looking,
    so this is here as well as on the active screen: the "Active delivery" card
    simply vanishing off the home screen is the same unexplained disappearance,
    and whichever screen is mounted takes the sentence and clears it so it is
    read once.
  */
  useEffect(() => {
    if (!jobEndedNote) return;
    say(jobEndedNote);
    clearJobEndedNote();
  }, [jobEndedNote, say, clearJobEndedNote]);

  /*
    Whether this rider may work at all, and why not.

    Both are the SERVER'S, computed together in `selfView`: `canGoOnline` is
    approval plus a finished sign-up, and `blockedReason` is the sentence that
    goes with it, deliberately ordered so the thing the rider can act on right
    now is the thing they are told — "Driving licence needs to be sent again."
    rather than a bare "not approved". Neither was read here, so the button
    said "Go online" to a suspended rider, sent a request that was always going
    to be refused, and put the refusal in a toast that vanished in two seconds.

    A missing profile is not treated as blocked: it means `GET /me` has not
    answered yet, and refusing to let somebody work because the app has not
    finished loading is a worse failure than letting the request be refused.
  */
  const blocked = !!profile && !profile.canGoOnline;
  const blockedReason = profile?.blockedReason ?? "";
  /* The one blocked state with a screen to send them to. Read off the same
     rows the approver wrote, rather than guessed at from the sentence. */
  const hasRejectedDocument = !!profile?.documents?.some((doc) => doc.status === "rejected");

  /*
    What the dispatcher can see of this rider's position, in the order the
    rider can do something about it.

    Three different faults, and treating them as one would put the wrong
    instruction in front of two of them:

      · the permission was refused, so the handset measures nothing at all.
        Nothing else on this screen matters until it is granted, so it is said
        whether or not they are on duty;
      · the permission is granted and the first fix has not landed. Ordinary,
        and worth a word only while they are online waiting for work;
      · fixes are being taken and are not REACHING us. Timed, not inferred:
        `locationStale` is set once reports have been failing without a break
        for five minutes, which is exactly the window after which
        `hasFreshLocation` stops returning this rider to the dispatcher, so
        nothing is said before then.

        It was a COUNT of failed heartbeats until this pass, and the sentence
        below still claimed the five minutes that count was calibrated for.
        Reports are no longer attempted on the fifteen-second cadence that made
        twenty of them five minutes — the effect above re-fires on every GPS
        fix and every compass reading, so a rider going round a bend attempts
        several a second and twenty consecutive failures could be two seconds
        of one dropped tower. The threshold and the sentence had drifted apart,
        and the sentence was the one telling a rider something untrue; see
        `LOCATION_MAX_SILENCE_MS`, where the drift is written out.

    That last one used to read `profile.locationFresh`, and it accused riders
    who had done nothing wrong. Its commonest cause is not a fault at all: a
    rider off duty for more than five minutes has an expired server-side fix by
    definition, so the answer to "go online" carries `locationFresh: false`,
    and the screen painted "We cannot see where you are" over a handset holding
    a perfect GPS lock that was about to report it a second later. A rider whose
    first sight of every shift is a red notice about a fault that is not there
    learns to ignore red notices.
  */
  const locationFault: { tone: ToneName; title: string; body: string; settings?: boolean } | null =
    permissionDenied
      ? {
          tone: "danger",
          title: "Location is off",
          body: "We match you to restaurants by where you are, so no delivery can be offered to you until you allow location — however long you stay online.",
          settings: true,
        }
      : online && !location
        ? {
            tone: "info",
            title: "Finding your position",
            body: "Your first GPS fix has not arrived yet. Offers start reaching you once it does.",
          }
        : /* The five minutes this sentence names is `LOCATION_MAX_SILENCE_MS`,
             which is `LOCATION_MAX_AGE_MS` in `driver.model.js`. One number in
             three places, and the rider reads the third: whoever changes any
             of them has to change all three, because the whole point of the
             notice is that by the time it appears the thing it describes has
             already happened. */
          online && locationStale
          ? {
              tone: "warning",
              title: "We cannot see where you are",
              body: "Your position has not reached us for five minutes, and a rider we cannot place is left out of every search. Check your signal.",
            }
          : null;

  const openLocationSettings = () => {
    Linking.openSettings().catch(() =>
      say("Open your phone's Settings, find Lampose Driver, and allow location."),
    );
  };

  /*
    Going on or off duty is a request, and its refusal is the server's own
    sentence — "your documents are still being reviewed", "you are still
    carrying LO482913". Those are the two things a rider most needs to be told
    and neither of them is knowable on this screen.
  */
  const toggleDuty = async () => {
    try {
      await setOnline(!online);
      const note = useDriverStore.getState().dutyNote;
      if (note) say(note);
    } catch (err) {
      const payload = (err as { payload?: { message?: string } } | null)?.payload;
      say(payload?.message || (err as Error)?.message || "We could not change your status.");
    }
  };

  return (
    <View style={styles.root}>
      {/*
        Home has no title — who you are IS the header.

        There is no bell any more. It carried a red unread dot drawn
        unconditionally — every rider, every launch, for ever — over a screen
        of seven fixed strings led by "Your driving licence expired. Upload a
        renewed copy to keep receiving orders." Nothing in this product stores
        a notification or sends one: no model, no endpoint, no row anywhere
        that could ever have made that sentence true or false for the person
        reading it. A rider who believes it stops working a shift they were
        entitled to work, and the permanent dot is what made sure they opened
        it. Both are gone rather than emptied — an alerts screen with nothing
        behind it is a promise to tell them things we have no way of telling
        them.
      */}
      <TopBar
        left={
          <View style={styles.identity}>
            <Avatar name={profile?.name || "Rider"} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title2" numberOfLines={1}>
                {profile?.name || "Rider"}
              </Text>
              <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                {profile?.vehicle?.plate || profile?.driverId || ""}
              </Text>
            </View>
          </View>
        }
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Duty ───────────────────────────────────────────────────── */}
        <View
          style={[
            styles.statusCard,
            online
              ? { borderColor: colors.brandOnDark, backgroundColor: colors.brandTint }
              : { borderColor: colors.border, backgroundColor: colors.surface },
          ]}
        >
          <View style={styles.statusRow}>
            <View style={styles.dotWrap}>
              {online && <PulseRing size={9} color={statusInk.base} duration={1800} />}
              <View style={[styles.dot, { backgroundColor: statusInk.base }]} />
            </View>
            <Text variant="label" style={{ color: statusInk.ink }}>
              {statusLabel}
            </Text>
          </View>

          <Text variant="display1" style={{ marginTop: space[2] }}>
            {status.head}
          </Text>
          <Text variant="bodyLg" color="secondary" style={{ marginTop: space[1], maxWidth: 260 }}>
            {status.sub}
          </Text>

          {searching && (
            <View style={styles.radar}>
              <View style={styles.radarCore} />
              <PulseRing size={120} color={colors.brand} style={styles.radarRing} />
              <PulseRing size={120} color={colors.brand} delay={1200} style={styles.radarRing} />
              <Text variant="label" color="brand" style={styles.radarLabel}>
                Waiting for orders…
              </Text>
            </View>
          )}

          {/* Why the switch below is dead, in the server's own sentence. Above
              the button rather than below it, because it is the answer to the
              question a rider asks by reaching for it. */}
          {blocked && !online && (
            <Notice
              tone="warning"
              glyph="lock"
              title="You cannot go online yet"
              body={blockedReason || undefined}
              style={{ marginTop: space[4] }}
            />
          )}

          {!!locationFault && (
            <Notice
              tone={locationFault.tone}
              glyph={locationFault.tone === "info" ? "mapPin" : "alert"}
              title={locationFault.title}
              body={locationFault.body}
              style={{ marginTop: space[3] }}
            />
          )}

          {locationFault?.settings && (
            <Btn
              label="Open location settings"
              variant="accent"
              glyph="settings"
              onPress={openLocationSettings}
              style={{ marginTop: space[2] }}
            />
          )}

          <Btn
            label={
              togglingDuty
                ? "One moment…"
                : online
                  ? "Go offline"
                  : blocked
                    ? "Not able to go online"
                    : "Go online"
            }
            variant={online ? "ghost" : "ink"}
            large={!online}
            glyph="power"
            /* Going OFF duty is never blocked. A rider suspended mid-shift
               still has to be able to stop being offered work, and a switch
               that traps them on duty is the one version of this worth
               avoiding. */
            disabled={togglingDuty || (blocked && !online)}
            onPress={toggleDuty}
            style={{ marginTop: space[5] }}
          />

          {blocked && !online && hasRejectedDocument && (
            <Btn
              label="Retake your documents"
              variant="quiet"
              glyph="documents"
              onPress={() => router.push("/documents")}
              style={{ marginTop: space[2] }}
            />
          )}

          {/* The honest caveat: duty is on, but the server cannot see where
              this rider is, so no offer can reach them. Said plainly rather
              than left as a switch that appears to be working. */}
          {online && (
            <Text variant="numMeta" color="tertiary" style={styles.onlineFor}>
              {dutyNote ||
                (earningsLoaded
                  ? `${formatOnline(earnings.onlineMinutes)} · you can go offline any time`
                  : "You can go offline any time")}
            </Text>
          )}
        </View>

        {/* ── Active delivery ────────────────────────────────────────── */}
        {hasActive && (
          <Pressable
            onPress={() => router.push("/active")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.activeCard,
              pressed && { backgroundColor: colors.surfaceSunken },
            ]}
          >
            <View style={styles.activeHead}>
              <Chip label="Active delivery" tone="brand" glyph="navigate" />
              <Text variant="numMeta" color="tertiary">
                {currentJob?.orderNumber}
              </Text>
            </View>
            <View style={styles.activeBody}>
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text variant="label" color="brand">
                  {STAGES[stage]}
                </Text>
                <Text variant="title1" numberOfLines={1}>
                  {currentJob?.drop.address || "Delivery"}
                </Text>
                <Text variant="numMeta" color="tertiary" numberOfLines={1}>
                  {currentJob?.itemCount} item{currentJob?.itemCount === 1 ? "" : "s"} · ₹
                  {currentJob?.earnings}
                  {currentJob && currentJob.collectAmount > 0
                    ? ` · collect ₹${currentJob.collectAmount}`
                    : " · prepaid"}
                </Text>
              </View>
              <Icon name="chevronRight" size={18} color={colors.textTertiary} />
            </View>
          </Pressable>
        )}

        {/*
          ── Today ────────────────────────────────────────────────────

          Three real figures, and only shown once `GET /me/earnings` has
          actually answered. Before that they are the zeroes the store starts
          at, which on a rider's home screen is not "nothing yet" but "you have
          earned nothing today".

          What used to sit directly beneath them was an incentive card reading
          "Complete 10 deliveries today · earn ₹300 extra", a bar filled to 80%
          and "8 of 10 done · 2 more deliveries" — every character of it a
          literal in the JSX, under stat cards showing ₹0 and 0 orders. There
          are no incentives in this product: nothing in the backend defines a
          scheme, tracks progress towards one or pays one out. So a rider was
          told on their own home screen that they had done eight deliveries
          they had not done, and were two away from ₹300 that did not exist,
          beside the true figures contradicting it. It is deleted, along with
          the screen behind it.
        */}
        {earningsLoaded && (
          <View style={styles.statGrid}>
            <StatCard label="Earnings" value={`₹${earnings.today}`} />
            <StatCard label="Orders" value={String(earnings.todayTrips)} />
            <StatCard label="Online" value={formatOnline(earnings.onlineMinutes)} />
          </View>
        )}

        {/* ── Shortcuts ──────────────────────────────────────────────── */}
        <View style={styles.quickGrid}>
          <Btn
            label="Earnings"
            variant="accent"
            glyph="earnings"
            onPress={() => router.push("/earnings")}
            style={{ flex: 1 }}
          />
          <Btn
            label="Get help"
            variant="accent"
            glyph="support"
            onPress={() => router.push("/support")}
            style={{ flex: 1 }}
          />
        </View>

        {/* Development only, and it renders nothing otherwise. Last on the
            screen because it is a tool, not part of a shift. */}
        <TestLocation
          active={simulated}
          onUse={(coords) => {
            setSimulatedCoords(coords);
            setSimulated(coords);
            say(
              online
                ? `Reporting ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)} to the dispatcher.`
                : "Saved. Go online and the dispatcher will see you here.",
            );
          }}
          onClear={() => {
            setSimulatedCoords(null);
            setSimulated(null);
            say("Back to the handset's own GPS.");
          }}
        />
      </ScrollView>

      <Toast message={toast} top={insets.top + space[2]} />
      <Sheet {...sheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.gutter, paddingTop: space[4], paddingBottom: space[6], gap: space[4] },

  identity: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: space[2] },

  statusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.card,
    padding: space[4],
    overflow: "hidden",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  dotWrap: { width: 9, height: 9, alignItems: "center", justifyContent: "center" },
  dot: { width: 9, height: 9, borderRadius: radius.pill },

  radar: {
    marginTop: space[4],
    height: 76,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.brandOnDark,
    alignItems: "center",
    justifyContent: "center",
  },
  radarCore: {
    position: "absolute",
    top: 24,
    width: 9,
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
  radarRing: { top: -32 },
  radarLabel: { position: "absolute", bottom: 2 },
  onlineFor: { textAlign: "center", marginTop: space[2] },

  activeCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    backgroundColor: colors.surface,
    padding: space[4],
    gap: space[3],
    ...elevation.raised,
  },
  activeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space[2] },
  activeBody: { flexDirection: "row", gap: space[3], alignItems: "center" },

  statGrid: { flexDirection: "row", gap: space[2] },
  statCard: {
    flex: 1,
    gap: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.card,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    backgroundColor: colors.surface,
  },

  quickGrid: { flexDirection: "row", gap: space[2] },
});
