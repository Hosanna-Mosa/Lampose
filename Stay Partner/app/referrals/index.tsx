import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar, Divider } from '@/components/ui';
import { POINTS_PER_REFERRAL, MIN_WITHDRAW_POINTS, shareMessage } from '@/lib/referrals';
import { initials, formatShortDate } from '@/lib/format';
import { fetchReferralsApi, fetchInvitesApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';

/**
 * One row of `PartnerReferral.history` — an owner who joined through the
 * refer-a-partner code, or a customer who joined through one of this
 * partner's invite codes (see `app/referrals/invite.tsx`). Local to this
 * screen rather than `lib/referrals.ts`'s fixture `Referral` type, which has
 * no `type`/`propertyName`/`rewardPoints` because it predates the real
 * backend history this screen now actually reads.
 */
type ReferralEntry = {
  id: string;
  name: string;
  propertyName: string;
  /* 'invited' — code generated, not yet used. 'expired' — the 7-day window
     closed unused. 'joined' — redeemed, and the ONLY status that ever earned
     points; an invited or expired row is worth 0 until (if ever) it flips. */
  status: 'invited' | 'expired' | 'joined';
  date: Date;
  rewardPoints: number;
  kind: 'owner' | 'customer';
};

export default function ReferAndEarnScreen() {
  const c = useColors();
  const router = useRouter();
  const [refInfo, setRefInfo] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);

  const loadReferrals = async () => {
    try {
      const data = await fetchReferralsApi();
      setRefInfo(data);
    } catch (err) {
      logWarn('Failed to fetch referrals:', err);
    }
    try {
      setInvites(await fetchInvitesApi());
    } catch (err) {
      logWarn('Failed to fetch invites:', err);
    }
  };

  useEffect(() => {
    loadReferrals();
  }, []);

  const referralCode = refInfo?.code || 'PAR-9600';
  const available = typeof refInfo?.points === 'number' ? refInfo.points : 0;

  /* Every point on this screen comes from `history` — an invite only lands
     here once `redeemCustomerReferralCode` has actually credited it, never
     the moment it is generated. */
  const historyList: ReferralEntry[] = (refInfo?.history || []).map((h: any, idx: number) => ({
    id: `ref_${idx}`,
    name: h.name || (h.type === 'customer' ? 'A new customer' : 'Property Owner'),
    propertyName: h.propertyName || '',
    status: 'joined' as const,
    date: new Date(h.date || Date.now()),
    rewardPoints: typeof h.rewardPoints === 'number' ? h.rewardPoints : POINTS_PER_REFERRAL,
    kind: h.type === 'customer' ? 'customer' : 'owner',
  }));

  /* Codes generated but not yet redeemed — worth nothing until the exact
     phone they were issued to actually signs up on them. Redeemed ones are
     dropped here on purpose: they already have a row above, from `history`,
     and showing both would double the same join. */
  const pendingList: ReferralEntry[] = invites
    .filter((inv: any) => inv.status !== 'redeemed')
    .map((inv: any) => ({
      id: `inv_${inv.id}`,
      name: inv.guestName || 'A guest',
      propertyName: inv.propertyName || '',
      status: (inv.status === 'expired' ? 'expired' : 'invited') as 'invited' | 'expired',
      date: new Date(inv.createdAt || Date.now()),
      rewardPoints: 0,
      kind: 'customer' as const,
    }));

  const combinedList: ReferralEntry[] = [...historyList, ...pendingList].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );

  const unlocked = available >= MIN_WITHDRAW_POINTS;
  const pointsToGo = Math.max(0, MIN_WITHDRAW_POINTS - available);
  const referralsToGo = Math.ceil(pointsToGo / POINTS_PER_REFERRAL);
  const progress = Math.min(1, available / MIN_WITHDRAW_POINTS);

  const share = () => {
    Share.share({ message: shareMessage() }).catch(() => {});
  };

  return (
    <Screen
      contentStyle={styles.stack}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>

          <Text variant="screenTitle">Refer &amp; earn</Text>
        </>
      }
    >
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Invite another property owner. Once they join, you get {POINTS_PER_REFERRAL} points — ₹
        {POINTS_PER_REFERRAL}.
      </Text>

      {/* ── Balance ─────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.hero,
          { backgroundColor: unlocked ? c.successTint : c.accentTint },
        ]}
      >
        <Text variant="badge" style={{ color: unlocked ? c.successOnTint : c.accentInk }}>
          {unlocked ? 'Ready to withdraw' : 'Points earned'}
        </Text>
        <Text tabular style={[styles.heroValue, { color: unlocked ? c.successInkDeep : c.accentInkDeep }]}>
          {available} pts <Text style={[styles.heroRupees, { color: unlocked ? c.successInkDeep : c.accentInkDeep }]}>· ₹{available}</Text>
        </Text>

        <View style={[styles.track, { backgroundColor: c.surface }]}>
          <View
            style={[
              styles.trackFill,
              { width: `${progress * 100}%`, backgroundColor: unlocked ? c.success : c.accent },
            ]}
          />
        </View>

        {unlocked ? (
          <Button label="Withdraw" onPress={() => router.push('/referrals/withdraw')} style={styles.heroButton} />
        ) : (
          <Text variant="caption" style={{ color: c.accentMuted }}>
            {referralsToGo} more successful {referralsToGo === 1 ? 'referral' : 'referrals'} unlocks withdrawal
            ({MIN_WITHDRAW_POINTS} pts minimum).
          </Text>
        )}
      </View>

      {/* ── Your code ───────────────────────────────────────────────────── */}
      <View style={[styles.codeCard, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <View>
          <Text variant="badge" color="textTertiary">
            Your owner referral code
          </Text>
          <Text variant="cardTitle" tabular style={styles.code}>
            {referralCode}
          </Text>
        </View>
        <Button label="Share invite" onPress={share} variant="secondary" icon="send" />
      </View>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <View style={styles.howRow}>
        <HowStep n={1} text="Share your code with another hostel, PG, or room owner." />
        <HowStep n={2} text={`They sign up — you get ${POINTS_PER_REFERRAL} points, no limit on how many times.`} />
        <HowStep n={3} text={`At ${MIN_WITHDRAW_POINTS} points, withdraw to your payout method.`} />
      </View>

      {/* Inviting a customer now happens where an owner is already entering a
          guest's details — Add Customer, and a confirmed request — not as a
          separate action here. See requests/add-customer.tsx. */}

      {/* ── History ─────────────────────────────────────────────────────── */}
      <Text variant="link" style={styles.sectionTitle}>
        Your referrals
      </Text>
      <View style={[styles.list, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        {combinedList.map((r, i) => (
          <View key={r.id}>
            {i > 0 ? <Divider /> : null}
            <ReferralRow referral={r} />
          </View>
        ))}
      </View>
    </Screen>
  );
}

function HowStep({ n, text }: { n: number; text: string }) {
  const c = useColors();
  return (
    <View style={styles.howStep}>
      <View style={[styles.howNum, { backgroundColor: c.accentTint }]}>
        <Text variant="badge" style={{ color: c.accentInk, fontFamily: fonts.bold }}>
          {n}
        </Text>
      </View>
      <Text variant="bodySm" color="textSecondary" style={styles.howText}>
        {text}
      </Text>
    </View>
  );
}

const STATUS_META: Record<ReferralEntry['status'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  joined: { label: 'Joined', tone: 'success' },
  invited: { label: 'Invited', tone: 'warning' },
  expired: { label: 'Expired', tone: 'neutral' },
};

function ReferralRow({ referral }: { referral: ReferralEntry }) {
  const c = useColors();
  const joined = referral.status === 'joined';
  const meta = STATUS_META[referral.status];

  /* "Priya · via Sunrise PG · 12 Aug" for a customer invite, "Vikram Oberoi ·
     18 Aug" for an owner referral — `propertyName` is only ever set on the
     former, see the `history` sub-schema in partnerDomains.model.js. */
  const subtitle = [referral.propertyName ? `via ${referral.propertyName}` : null, formatShortDate(referral.date)]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.row, { opacity: joined ? 1 : 0.85 }]}>
      <Avatar label={initials(referral.name)} size={36} tone={joined ? 'accent' : 'neutral'} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{referral.name}</Text>
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Badge label={meta.label} tone={meta.tone} />
        {joined ? (
          <Text tabular variant="badge" color="textSecondary" style={styles.rowPoints}>
            +{referral.rewardPoints} pts
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 18 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -10 },
  subtitle: { lineHeight: 20, marginTop: -4 },

  hero: { borderRadius: radius.card, padding: 18, gap: 4 },
  heroValue: { ...type.metric, marginTop: 2 },
  heroRupees: { fontFamily: fonts.semibold, fontSize: 15 },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, marginBottom: 4 },
  trackFill: { height: '100%', borderRadius: 4 },
  heroButton: { marginTop: 8 },

  codeCard: { borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12 },
  code: { letterSpacing: 1, marginTop: 2 },

  howRow: { gap: 12 },
  howStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  howNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  howText: { flex: 1, lineHeight: 19 },

  sectionTitle: { fontSize: 13, marginBottom: -6 },
  list: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  rowBody: { flex: 1, gap: 2 },
  rowName: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18 },
  rowEnd: { alignItems: 'flex-end', gap: 4 },
  rowPoints: { fontSize: 11 },
});
