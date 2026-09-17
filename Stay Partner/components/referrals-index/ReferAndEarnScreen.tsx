import { useEffect, useState } from 'react';
import { Share, StyleSheet } from 'react-native';
import { Box } from '@/components/common';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar, Divider } from '@/components/common';
import { POINTS_PER_REFERRAL, MIN_WITHDRAW_POINTS, shareMessage } from '@/lib/referrals';
import { initials, formatShortDate } from '@/lib/format';
import { fetchReferralsApi, fetchInvitesApi } from '@/services/api/domain.api';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { logWarn } from '@/lib/log';
import { HowStep } from '@/components/referrals-index/molecules/HowStep/HowStep';
import { ReferralRow } from '@/components/referrals-index/molecules/ReferralRow/ReferralRow';
import { ReferralEntry } from '@/components/referrals-index/utils';
import { styles } from '@/components/referrals-index/styles';

/**
 * One row of `PartnerReferral.history` — an owner who joined through the
 * refer-a-partner code, or a customer who joined through one of this
 * partner's invite codes (see `app/referrals/invite.tsx`). Local to this
 * screen rather than `lib/referrals.ts`'s fixture `Referral` type, which has
 * no `type`/`propertyName`/`rewardPoints` because it predates the real
 * backend history this screen now actually reads.
 */
export function ReferAndEarnScreen() {
  const c = useColors();
  const router = useRouter();
  const [refInfo, setRefInfo] = useState<any>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadReferrals();
    } finally {
      setRefreshing(false);
    }
  };

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
      refreshing={refreshing}
      onRefresh={onRefresh}
      stickyHeader={
        <>
          <Box style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </Box>

          <Text variant="screenTitle">Refer &amp; earn</Text>
        </>
      }
    >
      <Text variant="bodySm" color="textSecondary" style={styles.subtitle}>
        Invite another property owner. Once they join, you get {POINTS_PER_REFERRAL} points — ₹
        {POINTS_PER_REFERRAL}.
      </Text>

      {/* ── Balance ─────────────────────────────────────────────────────── */}
      <Box
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

        <Box style={[styles.track, { backgroundColor: c.surface }]}>
          <Box
            style={[
              styles.trackFill,
              { width: `${progress * 100}%`, backgroundColor: unlocked ? c.success : c.accent },
            ]}
          />
        </Box>

        {unlocked ? (
          <Button label="Withdraw" onPress={() => router.push('/referrals/withdraw')} style={styles.heroButton} />
        ) : (
          <Text variant="caption" style={{ color: c.accentMuted }}>
            {referralsToGo} more successful {referralsToGo === 1 ? 'referral' : 'referrals'} unlocks withdrawal
            ({MIN_WITHDRAW_POINTS} pts minimum).
          </Text>
        )}
      </Box>

      {/* ── Your code ───────────────────────────────────────────────────── */}
      <Box style={[styles.codeCard, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        <Box>
          <Text variant="badge" color="textTertiary">
            Your owner referral code
          </Text>
          <Text variant="cardTitle" tabular style={styles.code}>
            {referralCode}
          </Text>
        </Box>
        <Button label="Share invite" onPress={share} variant="secondary" icon="send" />
      </Box>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <Box style={styles.howRow}>
        <HowStep n={1} text="Share your code with another hostel, PG, or room owner." />
        <HowStep n={2} text={`They sign up — you get ${POINTS_PER_REFERRAL} points, no limit on how many times.`} />
        <HowStep n={3} text={`At ${MIN_WITHDRAW_POINTS} points, withdraw to your payout method.`} />
      </Box>

      {/* Inviting a customer now happens where an owner is already entering a
          guest's details — Add Customer, and a confirmed request — not as a
          separate action here. See requests/add-customer.tsx. */}

      {/* ── History ─────────────────────────────────────────────────────── */}
      <Text variant="link" style={styles.sectionTitle}>
        Your referrals
      </Text>
      <Box style={[styles.list, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        {combinedList.map((r, i) => (
          <Box key={r.id}>
            {i > 0 ? <Divider /> : null}
            <ReferralRow referral={r} />
          </Box>
        ))}
      </Box>
    </Screen>
  );
}

