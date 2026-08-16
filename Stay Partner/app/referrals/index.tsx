import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Text, Button, IconButton, Badge, Avatar, Divider } from '@/components/ui';
import {
  REFERRALS,
  REFERRAL_CODE,
  POINTS_PER_REFERRAL,
  MIN_WITHDRAW_POINTS,
  availablePoints,
  canWithdraw,
  shareMessage,
  subscribeReferrals,
  type Referral,
} from '@/lib/referrals';
import { initials, formatShortDate } from '@/lib/format';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function ReferAndEarnScreen() {
  const c = useColors();
  const router = useRouter();

  // Withdrawing changes the available balance — the hero card and the
  // "unlock" progress both have to reflect it the moment you're back here.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeReferrals(() => setRevision((r) => r + 1)), []);

  const available = availablePoints();
  const unlocked = canWithdraw();
  const pointsToGo = Math.max(0, MIN_WITHDRAW_POINTS - available);
  const referralsToGo = Math.ceil(pointsToGo / POINTS_PER_REFERRAL);
  const progress = Math.min(1, available / MIN_WITHDRAW_POINTS);

  const share = () => {
    Share.share({ message: shareMessage() }).catch(() => {});
  };

  return (
    <Screen contentStyle={styles.stack} key={revision}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
      </View>

      <Text variant="screenTitle">Refer &amp; earn</Text>
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
            Your referral code
          </Text>
          <Text variant="cardTitle" tabular style={styles.code}>
            {REFERRAL_CODE}
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

      {/* ── History ─────────────────────────────────────────────────────── */}
      <Text variant="link" style={styles.sectionTitle}>
        Your referrals
      </Text>
      <View style={[styles.list, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
        {REFERRALS.map((r, i) => (
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

function ReferralRow({ referral }: { referral: Referral }) {
  const c = useColors();
  const joined = referral.status === 'joined';

  return (
    <View style={[styles.row, { opacity: joined ? 1 : 0.85 }]}>
      <Avatar label={initials(referral.ownerName)} size={36} tone={joined ? 'accent' : 'neutral'} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{referral.ownerName}</Text>
        <Text variant="caption" color="textSecondary">
          {referral.propertyName} · {formatShortDate(joined ? referral.joinedAt! : referral.invitedAt)}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Badge label={joined ? 'Joined' : 'Invited'} tone={joined ? 'success' : 'warning'} />
        {joined ? (
          <Text tabular variant="badge" color="textSecondary" style={styles.rowPoints}>
            +{POINTS_PER_REFERRAL} pts
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
  heroValue: { fontFamily: fonts.extrabold, fontSize: 30, lineHeight: 36, marginTop: 2 },
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
