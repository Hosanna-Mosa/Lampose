import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { pendingCount, soonestPendingHours, subscribeRequests } from '@/lib/requests';
import { radius, shadow } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

// ── Static content, as shown in the design ────────────────────────────────

const OWNER = 'Anjali';
const PROPERTY = 'Sea View Villa';
/** More than one, so the switcher pill keeps its chevron. */
const PROPERTY_COUNT = 2;

const TODAY = { arrivals: 3, departures: 2, inHouse: 5 };
const EARNINGS = { today: '₹9,600', week: '₹58,400' };

type DashboardState = 'loading' | 'ready' | 'empty' | 'error';

function greeting(hour: number) {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayTab() {
  const c = useColors();
  const router = useRouter();
  // `?state=` forces a state for review; without it the screen simulates a fetch.
  const { state: forced } = useLocalSearchParams<{ state?: DashboardState }>();

  const [state, setState] = useState<DashboardState>('loading');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The Requests, Complaints, and Share types banners all read live counts on
  // every render — without this, accepting a request or resolving a
  // complaint elsewhere would leave a stale number here until something
  // unrelated happened to re-render.
  const [, setRevision] = useState(0);
  // The availability toggle gets its own local mirror, on top of that. A
  // banner re-reading a fresh value on the next render is fine when nothing
  // on this screen changed it — but this toggle is pressed *on this screen*,
  // and waiting on a subscription round trip through the same module it just
  // wrote to is exactly the failure mode that made Share types miss its own
  // taps. Local state guarantees the switch reflects its own press instantly;
  // the subscription below still keeps it in sync when something *else*
  // changes it (Share types saving down to zero, forcing this offline).
  const [available, setAvailableLocal] = useState(() => isAvailable());

  useEffect(() => {
    const unsubRequests = subscribeRequests(() => setRevision((r) => r + 1));
    const unsubComplaints = subscribeComplaints(() => setRevision((r) => r + 1));
    const unsubShareTypes = subscribeShareTypes(() => {
      setRevision((r) => r + 1);
      setAvailableLocal(isAvailable());
    });
    return () => {
      unsubRequests();
      unsubComplaints();
      unsubShareTypes();
    };
  }, []);

  const load = useCallback(() => {
    if (forced && forced !== 'loading') {
      setState(forced);
      return;
    }
    setState('loading');
    timer.current = setTimeout(() => setState('ready'), 1200);
  }, [forced]);

  useEffect(() => {
    load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const hasData = state === 'ready';
  // Real count, not a hardcoded "1" — the bell was wired to nothing until
  // checkpoint 30 gave it a screen to open.
  const unread = unreadCount();

  const toggleAvailable = (next: boolean) => {
    if (next) {
      // Every attempt to go online routes through Share types to confirm
      // what's actually being offered — not only when nothing's selected
      // yet. The switch stays off here; Share types is what turns it on.
      router.push({ pathname: '/share-types', params: { reason: 'accepting' } });
      return;
    }
    // Going offline needs no confirmation — always allowed, immediate.
    if (setAvailable(false)) setAvailableLocal(false);
  };

  return (
    <Screen tabBarSpacing background="bg" contentStyle={styles.stack}>
      {/* Header stays put in every state — only the body below it changes. */}
      <View style={styles.headerRow}>
        {state === 'loading' ? (
          <>
            <Skeleton width={150} height={36} radius={18} />
            <Skeleton width={36} height={36} radius={18} />
          </>
        ) : (
          <>
            <HeaderPill
              label={PROPERTY}
              swatch
              onPress={PROPERTY_COUNT > 1 ? () => {} : undefined}
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

      {state === 'loading' ? (
        <LoadingBody />
      ) : state === 'error' ? (
        <ErrorBody onRetry={load} />
      ) : (
        <>
          <HeroCard greetingText={greeting(new Date().getHours())} owner={OWNER} available={available} />

          <View style={styles.halfRow}>
            <BookingCard
              arrivals={hasData ? TODAY.arrivals : 0}
              departures={hasData ? TODAY.departures : 0}
              inHouse={hasData ? TODAY.inHouse : 0}
              onPress={() => router.push('/bookings')}
            />
            <EarningsMiniCard
              today={hasData ? EARNINGS.today : '₹0'}
              week={hasData ? EARNINGS.week : '₹0'}
              onPress={() => router.push('/payouts')}
            />
          </View>

          {hasData ? (
            <RequestsBanner onPress={() => router.push('/requests')} />
          ) : (
            <Card variant="elevated" style={styles.emptyCard}>
              <View style={[styles.emptyIcon, { backgroundColor: c.accentTint }]}>
                <Icon name="calendar" size={20} color={c.accent} />
              </View>
              <Text variant="cardTitle" center>
                No bookings yet
              </Text>
              <Text variant="caption" color="textSecondary" center style={styles.emptyBody}>
                Once your listing is live, requests and earnings will show up here.
              </Text>
            </Card>
          )}

          <ReferEarnBanner onPress={() => router.push('/referrals')} />
          <ComplaintsBanner onPress={() => router.push('/complaints')} />
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

/**
 * Replaces the old bare greeting line + floating availability pill with one
 * anchored surface — a gradient wash of the brand green, the one place on
 * this screen allowed to be loud, since everything below it goes back to the
 * neutral surface. The oversized bed glyph is decoration only, clipped by the
 * card's own corners; VoiceOver never sees it (the whole card reads as one
 * label). The availability chip is read-only here on purpose — the switch
 * that actually controls it lives in the header above, where the tap started.
 */
function HeroCard({
  greetingText,
  owner,
  available,
}: {
  greetingText: string;
  owner: string;
  available: boolean;
}) {
  const c = useColors();
  return (
    <LinearGradient
      colors={[c.accent, c.accentHover]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroGlyph} pointerEvents="none">
        <Icon name="bed" size={168} color="rgba(255,255,255,0.07)" strokeWidth={1.1} />
      </View>

      <View accessible accessibilityLabel={`${greetingText}, ${owner}. ${available ? 'Rooms available, accepting bookings' : 'Not accepting new bookings'}.`}>
        <Text style={styles.heroGreeting}>
          {greetingText}, {owner}
        </Text>
        <Text style={styles.heroSubtitle}>Here&apos;s what&apos;s happening today</Text>

        <View
          style={[
            styles.heroChip,
            {
              backgroundColor: available ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)',
              borderColor: available ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.16)',
            },
          ]}
        >
          <View style={[styles.heroDot, { backgroundColor: available ? c.brandYellow : 'rgba(255,255,255,0.5)' }]} />
          <Text style={styles.heroChipText}>
            {available ? 'Rooms available — accepting bookings' : 'Not accepting new bookings'}
          </Text>
        </View>
      </View>
    </LinearGradient>
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

function EarningsMiniCard({ today, week, onPress }: { today: string; week: string; onPress: () => void }) {
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

/** Count and soonest-expiry are both live from `lib/requests.ts` — accepting or rejecting one updates this immediately. */
function RequestsBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const count = pendingCount();
  const soonest = soonestPendingHours();

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
function ComplaintsBanner({ onPress }: { onPress: () => void }) {
  const c = useColors();
  const open = openComplaintsCount();
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    padding: 20,
    paddingVertical: 22,
    overflow: 'hidden',
  },
  heroGlyph: {
    position: 'absolute',
    right: -34,
    bottom: -30,
  },
  heroGreeting: {
    fontFamily: fonts.extrabold,
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: fonts.medium,
    fontSize: 13,
    lineHeight: 18,
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
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#FFFFFF',
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
  bannerTitle: { fontSize: 14.5, marginBottom: 2 },
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
