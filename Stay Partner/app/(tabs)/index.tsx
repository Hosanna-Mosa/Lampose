import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Text, Button, Card, Icon, Skeleton, HeaderPill, Switch } from '@/components/ui';
import { unreadCount } from '@/lib/notifications';
import { POINTS_PER_REFERRAL, POINT_VALUE_RUPEES } from '@/lib/referrals';
import { openCount as openComplaintsCount, subscribeComplaints } from '@/lib/complaints';
import {
  SHARE_TYPES,
  visibleCount as visibleShareTypes,
  subscribeShareTypes,
  isAvailable,
  setAvailable,
} from '@/lib/shareTypes';
import { radius, shadow } from '@/constants/layout';
import { type } from '@/constants/typography';
import colors from '@/constants/colors';
import { useColors } from '@/hooks/useColors';

// ── Static content, as shown in the design ────────────────────────────────

const OWNER = 'Anjali';
const PROPERTY = 'Sea View Villa';
/** More than one, so the switcher pill keeps its chevron. */
const PROPERTY_COUNT = 2;

const TODAY = { arrivals: 3, departures: 2, inHouse: 5 };
const EARNINGS = { today: '₹9,600', week: '₹58,400' };

import { fetchSummary } from '@/services/api/portfolio.api';
import { fetchNotificationsApi, toggleShareTypesAvailabilityApi } from '@/services/api/domain.api';
import { useAuth } from '@/context/AuthContext';

type DashboardState = 'loading' | 'ready' | 'empty' | 'error';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayTab() {
  const c = useColors();
  const router = useRouter();
  const { partner } = useAuth();
  const { state: forced } = useLocalSearchParams<{ state?: DashboardState }>();

  const [state, setState] = useState<DashboardState>('loading');
  const [summaryData, setSummaryData] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [available, setAvailableLocal] = useState(true);

  const [, setRevision] = useState(0);

  useEffect(() => {
    const unsubComplaints = subscribeComplaints(() => setRevision((r) => r + 1));
    const unsubShareTypes = subscribeShareTypes(() => {
      setRevision((r) => r + 1);
    });
    return () => {
      unsubComplaints();
      unsubShareTypes();
    };
  }, []);

  const loadData = useCallback(async () => {
    if (forced && forced !== 'loading') {
      setState(forced);
      return;
    }
    setState('loading');
    try {
      const [sum, notifs] = await Promise.all([
        fetchSummary(),
        fetchNotificationsApi().catch(() => ({ items: [], unreadCount: 0 })),
      ]);
      setSummaryData(sum);
      setUnread(notifs.unreadCount);
      if (typeof sum.isAvailable === 'boolean') {
        setAvailableLocal(sum.isAvailable);
      }
      setState('ready');
    } catch (err) {
      /*
       * A failed load is an error state, not a ready one.
       *
       * This used to `setState('ready')` on failure, which painted the whole
       * dashboard from the fallbacks below — so a dropped connection showed an
       * owner a confident "₹9,600 today" instead of telling them nothing had
       * loaded. `ErrorBody` already exists and offers a retry; this is what
       * routes to it.
       */
      console.warn('Error fetching dashboard summary:', err);
      setState('error');
    }
  }, [forced]);

  /*
   * Refetched every time this tab comes back into focus, not just on mount —
   * same reasoning as `customers.tsx`. Share Types is a pushed screen that
   * `back()`s to here, and turning every share type off there takes the
   * property offline server-side (`getSummary` computes `isAvailable` from
   * whether ANY share type is still available). A plain mount effect would
   * never see that: this tab stays mounted underneath the pushed screen, so
   * it would keep showing the availability it had before the visit — online,
   * on a card that's actually just been saved with nothing left to book.
   */
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  /*
   * Real values only. There are no invented defaults here any more.
   *
   * Every line below used to end in `|| 'Anjali'`, `|| 'Sea View Villa'`,
   * `|| { arrivals: 3, … }`, `|| '₹9,600'`. Those are the numbers in the
   * screenshot that started this — the dashboard was showing fixture figures
   * whenever the server returned nothing, and an owner has no way to tell an
   * invented ₹9,600 from a real one.
   *
   * `??` rather than `||` where a default still exists, because `0` and `''`
   * are answers: `0 || 5` is 5, and that is the same bug one operator down.
   */
  const ownerName = partner?.name?.trim() || null;
  const propertyName = summaryData?.propertyName ?? null;
  const todayStats = summaryData?.today ?? { arrivals: 0, departures: 0, inHouse: 0 };
  const earningsData = summaryData?.earnings ?? { today: '₹0', week: '₹0' };

  const toggleAvailable = async (next: boolean) => {
    if (next) {
      /* Going online needs at least one visible share type — Share Types is
         where that's actually confirmed, so the switch does NOT flip yet.
         It used to call `setAvailableLocal(true)` right here, before the
         owner had picked anything: back out of that screen with nothing
         selected (or without saving at all) and the switch was already
         showing online for a state nobody had confirmed. Now nothing
         changes here — the switch only reflects what `useFocusEffect`
         reads back from the server once the owner actually returns. */
      router.push({ pathname: '/share-types', params: { reason: 'accepting' } });
      return;
    }
    setAvailableLocal(false);
    try {
      await toggleShareTypesAvailabilityApi(false);
      setAvailable(false);
    } catch (err) {
      console.warn('Failed to update availability:', err);
    }
  };

  return (
    <Screen
      tabBarSpacing
      background="bg"
      contentStyle={styles.stack}
      /* Pinned. The property switcher, the availability toggle and the bell are
         the screen's controls, not its content — losing them behind a scroll
         meant scrolling back up to change property or read an alert. */
      stickyHeader={
        // Header stays put in every state — only the body below it changes.
        <View style={styles.headerRow}>
        {state === 'loading' ? (
          <>
            <Skeleton width={150} height={36} radius={18} />
            <Skeleton width={36} height={36} radius={18} />
          </>
        ) : (
          <>
            {/* No property matched to this number is a real state, not a
                loading one — three of the properties in the catalogue have no
                owner mobile recorded at all, so their owner will land here and
                match nothing. Saying so beats naming a property that was never
                theirs. */}
            <HeaderPill
              label={propertyName ?? 'No property linked'}
              swatch
              onPress={() => router.push('/settings/property')}
            />
            <View style={styles.headerRight}>
              <Switch value={available} onChange={toggleAvailable} size="sm" accessibilityLabel="Rooms available for booking" />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'
                }
                onPress={() => router.push('/notifications')}
                style={({ pressed }) => [
                  styles.bell,
                  { backgroundColor: c.surface, borderColor: c.borderCard, opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <Icon name="bell" size={17} />
                {unread > 0 ? (
                  <View style={[styles.bellDot, { backgroundColor: c.error, borderColor: c.surface }]} />
                ) : null}
              </Pressable>
            </View>
          </>
          )}
        </View>
      }
    >
      {state === 'loading' ? (
        <LoadingBody />
      ) : state === 'error' ? (
        <ErrorBody onRetry={loadData} />
      ) : (
        <>
          <HeroCard greetingText={greeting(new Date().getHours())} owner={ownerName} available={available} />

          <View style={styles.halfRow}>
            <BookingCard
              arrivals={todayStats.arrivals}
              departures={todayStats.departures}
              inHouse={todayStats.inHouse}
              onPress={() => router.push('/bookings')}
            />
            {/* No `onPress`: the Payouts tab it used to open is gone. The tile
                stays as a read-only stat rather than being deleted — it is one
                half of a two-up row, and removing it would leave Bookings as a
                lone half-width card. A tile that looks tappable and goes
                nowhere is the worse of the two options. */}
            <EarningsMiniCard today={earningsData.today} week={earningsData.week} />
          </View>

          <RequestsBanner
            count={summaryData?.requests?.awaitingYou ?? 0}
            onPress={() => router.push('/requests')}
          />

          <AddCustomerBanner onPress={() => router.push('/requests/add-customer')} />

          <ReferEarnBanner onPress={() => router.push('/referrals')} />
          <ComplaintsBanner
            open={summaryData?.openComplaints ?? 0}
            onPress={() => router.push('/complaints')}
          />
          <ShareTypesBanner onPress={() => router.push('/share-types')} />
        </>
      )}
    </Screen>
  );
}

// ── Body variants ─────────────────────────────────────────────────────────

function LoadingBody() {
  const c = useColors();
  const card = { backgroundColor: c.surface, ...shadow.card };
  return (
    <>
      <View style={[styles.hero, { backgroundColor: c.surfaceSunken, height: 140 }]} />
      <View style={styles.halfRow}>
        <View style={[styles.halfCard, card, { height: 128 }]} />
        <View style={[styles.halfCard, card, { height: 128 }]} />
      </View>
      <View style={[styles.skelCard, card, { height: 72 }]} />
      <View style={[styles.skelCard, card, { height: 72 }]} />
    </>
  );
}

function ErrorBody({ onRetry }: { onRetry: () => void }) {
  const c = useColors();
  return (
    <View style={styles.errorBody}>
      <View style={[styles.errorIcon, { backgroundColor: c.errorTint }]}>
        <Icon name="alert-circle" size={24} color={c.error} />
      </View>
      <Text variant="h3" center>
        Couldn&apos;t load your dashboard
      </Text>
      <Text variant="caption" color="textSecondary" center>
        Check your connection and try again.
      </Text>
      <Button label="Retry" onPress={onRetry} size="sm" fullWidth={false} style={styles.retry} />
    </View>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** How long the crossfade takes. Slow enough to see, not sluggish. */
const HERO_WIPE_MS = 900;

/**
 * Replaces the old bare greeting line + floating availability pill with one
 * anchored surface. The gradient wash of the brand green is only earned while
 * the owner is actually accepting bookings — the one place on this screen
 * allowed to be loud, since everything below it goes back to the neutral
 * surface. While the switch in the header is off, the card goes back to that
 * same neutral surface too, rather than staying green and claiming an
 * availability that isn't true.
 *
 * Crossfades between the two rather than snapping — see the note inside the
 * function for why it's a fade and not the wipe originally asked for.
 */
function HeroCard({
  greetingText,
  owner,
  available,
}: {
  greetingText: string;
  /** Null until the profile carries a name. Greeted without one rather than
      greeted as somebody else — 'Anjali' was the fixture, and addressing an
      owner by a stranger's name is worse than addressing them by none. */
  owner: string | null;
  available: boolean;
}) {
  const c = useColors();

  const label = `${greetingText}${owner ? `, ${owner}` : ''}. ${available ? 'Rooms available, accepting bookings' : 'Not accepting new bookings'}.`;

  /*
   * FIFTH ATTEMPT, a different category this time. Four prior techniques for
   * a left-to-right WIPE all broke this card in different ways — reanimated
   * worklets, core `Animated` with a measured pixel translate, core
   * `Animated` with a percentage `left`, and a plain `requestAnimationFrame`
   * loop rewriting `LinearGradient`'s own `colors`/`locations` every frame.
   * Three of those never touched the gradient's own props; the fourth had no
   * nesting at all. What every one of them DID share is JS-thread work on
   * every single animation frame — a React re-render, or a `setNativeProps`
   * call, once per frame for the animation's whole duration.
   *
   * This is a plain opacity CROSSFADE instead of a wipe, using
   * `useNativeDriver: true`. That's not a smaller version of the same idea —
   * once `.start()` fires, the JS thread does nothing at all until the
   * animation finishes; the native side owns every frame on its own. It's
   * the one thing left that doesn't share the trait every failed attempt had
   * in common. If this ALSO breaks, that says something more fundamental
   * than "wrong animation technique" and is worth stopping to investigate
   * properly rather than trying a sixth approach blind.
   */
  const fade = useRef(new Animated.Value(available ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: available ? 1 : 0,
      duration: HERO_WIPE_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.hero} accessible accessibilityLabel={label}>
      {/* Bottom layer: white, normal flow — this is what actually sizes the
          card. Static props, never touched once mounted. */}
      <View style={[styles.heroLayer, { backgroundColor: c.surface, borderWidth: 1, borderColor: c.borderCard }]}>
        <HeroCardBody c={c} greetingText={greetingText} owner={owner} tone="off" />
      </View>

      {/* Top layer: green, laid exactly over the white one. Only its OWN
          opacity is animated — the LinearGradient inside it never has a
          prop touched during the animation, matching the one thing every
          working version so far has had in common. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { opacity: fade }]}
      >
        <LinearGradient colors={[c.accent, c.accentHover]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroLayer}>
          <HeroCardBody c={c} greetingText={greetingText} owner={owner} tone="on" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/** One tone's worth of the hero card's content — the glyph, greeting and chip. */
function HeroCardBody({
  c,
  greetingText,
  owner,
  tone,
}: {
  c: ReturnType<typeof useColors>;
  greetingText: string;
  owner: string | null;
  tone: 'on' | 'off';
}) {
  const on = tone === 'on';
  return (
    <>
      <View style={styles.heroGlyph} pointerEvents="none">
        <Icon name="bed" size={104} color={on ? 'rgba(255,255,255,0.1)' : c.borderSubtle} strokeWidth={1.1} />
      </View>

      <View>
        <Text style={[styles.heroGreeting, on ? null : { color: c.textPrimary }]}>
          {greetingText}
          {owner ? `, ${owner}` : ''}
        </Text>
        <Text style={[styles.heroSubtitle, on ? null : { color: c.textSecondary, opacity: 1 }]}>
          Here&apos;s what&apos;s happening today
        </Text>

        <View
          style={[
            styles.heroChip,
            on
              ? { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)' }
              : { backgroundColor: c.surfaceSunken, borderColor: c.borderCard },
          ]}
        >
          <View style={[styles.heroDot, { backgroundColor: on ? c.brandYellow : c.textTertiary }]} />
          <Text style={[styles.heroChipText, on ? null : { color: c.textSecondary }]}>
            {on ? 'Rooms available — accepting bookings' : 'Not accepting new bookings'}
          </Text>
        </View>
      </View>
    </>
  );
}

/**
 * The two side-by-side summary cards the dashboard opens with. Each is a
 * real shortcut, not decoration — tapping one lands on the tab that has the
 * full picture, the same "headline figure, then go deeper" shape the old
 * stat-tile row and earnings card had, just paired up instead of stacked.
 * Tinted to match what they open onto — green for bookings, the same green
 * as the hero above; a warmer success tone for earnings — rather than two
 * identical white tiles told apart only by their icon.
 */
function BookingCard({
  arrivals,
  departures,
  inHouse,
  onPress,
}: {
  arrivals: number;
  departures: number;
  inHouse: number;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={[styles.halfCard, { backgroundColor: c.accentTint }]}>
      <View style={[styles.halfIcon, { backgroundColor: c.accent }]}>
        <Icon name="bed" size={16} color={c.white} />
      </View>
      <Text variant="badge" color="accentMuted">
        Bookings
      </Text>
      <Text
        variant="h3"
        tabular
        style={[styles.halfValue, { color: inHouse === 0 ? c.textTertiary : c.accentInkDeep }]}
      >
        {inHouse}
      </Text>
      <Text variant="caption" color="accentMuted" style={styles.halfCaption}>
        in-house · {arrivals} in, {departures} out today
      </Text>
    </Card>
  );
}

/**
 * Read-only since the Payouts tab was removed.
 *
 * `onPress` is optional rather than deleted: `Card` renders a plain View
 * without one, so the tile stops offering a press it can no longer honour, and
 * the prop is still here for whenever a destination exists again.
 */
function EarningsMiniCard({ today, week, onPress }: { today: string; week: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={[styles.halfCard, { backgroundColor: c.successTint }]}>
      <View style={[styles.halfIcon, { backgroundColor: c.success }]}>
        <Icon name="rupee" size={16} color={c.white} />
      </View>
      <Text variant="badge" color="successOnTint">
        Earnings
      </Text>
      <Text variant="h3" tabular style={[styles.halfValue, { color: c.successInkDeep }]}>
        {today}
      </Text>
      <Text variant="caption" color="successOnTint" style={styles.halfCaption}>
        today · {week} this week
      </Text>
    </Card>
  );
}

/**
 * The count comes from the summary — the server counts `pending_owner` visit
 * requests against this owner's properties, and that is the number a tap
 * actually opens (`app/requests/index.tsx`, which reads the same real data).
 *
 * There's no expiry line: a visit request's 24-hour window is enforced
 * server-side but not currently projected to the client, so a countdown here
 * would have to be invented rather than read.
 */
function RequestsBanner({ count, onPress }: { count: number; onPress: () => void }) {
  const c = useColors();
  const soonest: number | null = null;

  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <View style={[styles.bannerIcon, { backgroundColor: c.warningTint }]}>
        <Icon name="upload" size={18} color={c.warningOnTint} />
      </View>
      <View style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          {count} pending {count === 1 ? 'request' : 'requests'}
        </Text>
        {soonest !== null ? (
          <View style={styles.urgencyRow}>
            <View style={[styles.dot, { backgroundColor: c.error }]} />
            <Text variant="badge" style={{ color: c.error }}>
              Soonest expires in {soonest}h
            </Text>
          </View>
        ) : (
          <Text variant="badge" color="textSecondary">
            Nothing waiting on you right now
          </Text>
        )}
      </View>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/** Same banner shape as pending requests — same width, same height, just a different card. */
/**
 * Where "Add customer" lives now — replaces separate "+" entry points that
 * used to sit on the Customers screen and the Requests screen header. One
 * clear place, matching every other action on this dashboard, rather than
 * the same button scattered across three screens.
 */
function AddCustomerBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <View style={[styles.bannerIcon, { backgroundColor: c.successTint }]}>
        <Icon name="plus" size={18} color={c.success} />
      </View>
      <View style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Add a customer
        </Text>
        <Text variant="badge" color="textSecondary">
          Log a walk-in and invite them to Lampose
        </Text>
      </View>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

function ReferEarnBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <View style={[styles.bannerIcon, { backgroundColor: c.accentTint }]}>
        <Icon name="users" size={18} color={c.accent} />
      </View>
      <View style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Refer &amp; earn
        </Text>
        <Text variant="badge" color="textSecondary">
          Invite an owner, get ₹{POINTS_PER_REFERRAL * POINT_VALUE_RUPEES} when they join
        </Text>
      </View>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/** Count is live from `lib/complaints.ts` — not a static figure like the requests banner's. */
/** `open` comes from the summary — `openComplaintsCount()` read a fixture that
    reported 2 open complaints on an account that had none. */
function ComplaintsBanner({ open, onPress }: { open: number; onPress: () => void }) {
  const c = useColors();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <View style={[styles.bannerIcon, { backgroundColor: c.errorTint }]}>
        <Icon name="message" size={18} color={c.error} />
      </View>
      <View style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Complaints
        </Text>
        <Text variant="badge" color="textSecondary">
          {open > 0 ? `${open} open · needs a look` : 'Nothing open right now'}
        </Text>
      </View>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

/** Count is live from `lib/shareTypes.ts` too — flips the moment a toggle changes. */
function ShareTypesBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const visible = visibleShareTypes();
  return (
    <Card variant="elevated" onPress={onPress} style={styles.banner}>
      <View style={[styles.bannerIcon, { backgroundColor: c.accentTint }]}>
        <Icon name="bed" size={18} color={c.accent} />
      </View>
      <View style={styles.bannerBody}>
        <Text variant="cardTitle" style={styles.bannerTitle}>
          Share types
        </Text>
        <Text variant="badge" color="textSecondary">
          {visible} of {SHARE_TYPES.length} visible to customers
        </Text>
      </View>
      <Icon name="chevron-right" size={14} color={c.textTertiary} strokeWidth={2} />
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  /*
   * The controls never give up width — the pill beside them does.
   *
   * `flexShrink: 0` is React Native's default, so this is written down rather
   * than relied on: it is the half of the arrangement that must not change.
   * A 36pt bell and a switch have no way to degrade gracefully; the pill's
   * label truncates to an ellipsis instead. See the note on `pill` in
   * `components/ui/HeaderPill.tsx`.
   */
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  bell: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
  },
  hero: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  /* Shared by both stacked copies (green + white) so a wipe mid-flight lines
     their text up exactly — any padding difference between the two would
     show up as a jump the instant the wipe boundary crosses it. */
  heroLayer: {
    padding: 20,
    paddingVertical: 22,
  },
  /* Fully inside the card's own bounds — deliberately not bleeding past the
     edge the way the original design called for. `overflow: hidden` +
     `borderRadius` on the card not reliably clipping an absolutely
     positioned child at the rounded corner is a known Android quirk, and
     the earlier negative offsets sat it exactly there; positive offsets
     keep it clear of that corner without depending on the clip at all. */
  heroGlyph: {
    position: 'absolute',
    right: 10,
    bottom: 6,
  },
  /*
   * The hero sits on the accent gradient, so its type is white rather than an
   * ink token — but white from the palette, not a literal. `#FFFFFF` typed into
   * a screen is the one that survives a theme change and turns invisible.
   *
   * The subtitle keeps an alpha it cannot get from a token; it is written
   * against `colors.white` so the two are visibly the same colour.
   */
  heroGreeting: {
    ...type.screenTitle,
    color: colors.light.white,
  },
  heroSubtitle: {
    ...type.caption,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 3,
    marginBottom: 16,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 20,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3 },
  heroChipText: {
    ...type.badge,
    color: colors.light.white,
  },

  halfRow: { flexDirection: 'row', gap: 10 },
  halfCard: { flex: 1, borderRadius: 14, gap: 4 },
  halfIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  halfValue: { fontSize: 22, lineHeight: 27, marginTop: 1 },
  halfCaption: { lineHeight: 15 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bannerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerBody: { flex: 1 },
  bannerTitle: { fontSize: 15, marginBottom: 2 },
  urgencyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },

  skelCard: { borderRadius: radius.card, padding: 16, gap: 8 },

  emptyCard: { alignItems: 'center', gap: 10, padding: 24 },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBody: { lineHeight: 18 },

  errorBody: {
    flex: 1,
    minHeight: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 12,
  },
  errorIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retry: { marginTop: 6 },
});
