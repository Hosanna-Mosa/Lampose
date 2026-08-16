import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Icon,
  Card,
  DetailRow,
  Divider,
  EmptyState,
  Input,
  Badge,
  AadharUploadTile,
  VerificationCodeField,
  formatLeft,
  urgencyOf,
} from '@/components/ui';
import { formatDateTime, formatDayDate, formatINR, initials, nightsBetween } from '@/lib/format';
import {
  AADHAR_LENGTH,
  acceptRequest,
  categoryOf,
  feeOf,
  formatAadhar,
  getRequest,
  grossOf,
  maskAadhar,
  maskPhone,
  netOf,
  saveKyc,
  subscribeRequests,
  type KYC,
  type RequestDetail,
} from '@/lib/requests';
import { PLATFORM_FEE_RATE } from '@/lib/fees';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export default function RequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Accept/decline/save all mutate the same record this screen reads — needs
  // to re-render on any of them, not just the one this screen itself fires.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeRequests(() => setRevision((r) => r + 1)), []);

  const request = getRequest(id);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!request) {
    return (
      <Screen scroll={false} padX={22} background="bg">
        <EmptyState
          icon="search"
          title="Request not found"
          body="It may have been withdrawn by the guest."
          actionLabel="Back to requests"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const category = categoryOf(request);

  if (category === 'approved') {
    return <ApprovedDetail key={revision} request={request} onBack={() => router.back()} />;
  }

  // Distinct from "declined": this ran out on its own clock while still
  // pending. `request.status === 'declined'` is a real rejection even if its
  // `expiresAt` also happens to be in the past — the two can't be told apart
  // by timestamp alone, only by what actually happened to the record.
  const expired = request.status === 'pending' && urgencyOf(request.expiresAt - now) === 'expired';

  return expired ? (
    <ExpiredDetail request={request} onBack={() => router.back()} />
  ) : category === 'rejected' ? (
    <DeclinedDetail request={request} onBack={() => router.back()} />
  ) : (
    <ActiveDetail
      key={revision}
      request={request}
      msLeft={request.expiresAt - now}
      onBack={() => router.back()}
    />
  );
}

// ── Active ────────────────────────────────────────────────────────────────

function ActiveDetail({
  request,
  msLeft,
  onBack,
}: {
  request: RequestDetail;
  msLeft: number;
  onBack: () => void;
}) {
  const c = useColors();
  const router = useRouter();

  const gross = grossOf(request);
  const fee = feeOf(request);
  const net = netOf(request);

  const accept = () => {
    // No navigation — the parent screen already re-renders on any request
    // mutation (including this one) and re-derives which detail to show.
    // Once `status` flips to `confirmed`, that's the KYC screen for this
    // same request, in place, not a trip back to the list.
    acceptRequest(request.id);
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      footer={
        <View style={styles.actions}>
          <Button
            label="Reject"
            variant="dangerOutline"
            onPress={() => router.push({ pathname: '/requests/reject', params: { id: request.id } })}
            style={styles.reject}
          />
          <Button label="Accept booking" variant="success" onPress={accept} style={styles.accept} />
        </View>
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={onBack} />
      </View>

      <CountdownBanner msLeft={msLeft} />

      <View style={styles.guestRow}>
        <View style={[styles.avatar, { backgroundColor: c.accentTint }]}>
          <Text style={[styles.avatarText, { color: c.accentInk }]}>{initials(request.guest)}</Text>
        </View>
        <View style={styles.guestBody}>
          <Text variant="h3" style={styles.guestName}>
            {request.guest}
          </Text>
          <Text variant="badge" color="textSecondary" style={styles.guestSummary}>
            {request.guestSummary}
          </Text>
        </View>
        {/* No message thread is designed anywhere in the set — see the manifest. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Message ${request.guest}`}
          onPress={() => {}}
          style={({ pressed }) => [
            styles.messageButton,
            { borderColor: c.borderCard, opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Icon name="message" size={15} color={c.accent} />
        </Pressable>
      </View>

      <Card>
        <DetailRow label="Check-in" value={formatDayDate(request.checkIn)} />
        <DetailRow label="Check-out" value={formatDayDate(request.checkOut)} />
        <DetailRow label="Room" value={request.roomType} />
        <DetailRow label="Guests" value={request.guests} last />
      </Card>

      <Card>
        {request.lines.map((line) => (
          <View key={line.label} style={styles.priceRow}>
            <Text variant="caption" color="textSecondary">
              {line.label}
            </Text>
            <Text variant="caption" tabular style={styles.priceValue}>
              {formatINR(line.amount)}
            </Text>
          </View>
        ))}

        <Divider style={styles.priceRule} />

        {/*
          DEVIATION — the design labels this gross total "You'll receive", with no
          commission deducted, while the Earnings screen deducts ~6% from every
          booking. Accepting on the promise of the larger figure and banking the
          smaller one is the kind of surprise that costs trust, so the fee is
          itemised here and the final line is what actually arrives.
        */}
        <View style={styles.priceRow}>
          <Text variant="caption" color="textSecondary">
            Guest pays
          </Text>
          <Text variant="caption" tabular style={styles.priceValue}>
            {formatINR(gross)}
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text variant="caption" color="textSecondary">
            Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
          </Text>
          <Text variant="caption" tabular style={styles.priceValue}>
            {formatINR(-fee)}
          </Text>
        </View>

        <Divider style={styles.priceRule} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>You&apos;ll receive</Text>
          <Text tabular style={styles.totalValue}>
            {formatINR(net)}
          </Text>
        </View>
      </Card>
    </Screen>
  );
}

// ── Approved — KYC ───────────────────────────────────────────────────────────

/**
 * Reached by opening a request from the Approved tab. A guest who already has
 * a LAMPOSE account has this on file — shown, not re-collected. Everyone else
 * gets the form: address, Aadhar number, an Aadhar photo, and a code texted
 * to the guest's phone and read back to confirm it's really them — matching
 * what a PG/hostel is expected to keep on record for a guest.
 */
function ApprovedDetail({ request, onBack }: { request: RequestDetail; onBack: () => void }) {
  const c = useColors();
  const nights = nightsBetween(request.checkIn, request.checkOut);

  const [address, setAddress] = useState(request.kyc?.address ?? '');
  const [aadhar, setAadhar] = useState(request.kyc?.aadharNumber ?? '');
  const [uploaded, setUploaded] = useState(request.kyc?.aadharUploaded ?? false);
  const [verified, setVerified] = useState(request.kyc?.verified ?? false);

  const canSave = address.trim().length > 0 && aadhar.length === AADHAR_LENGTH && uploaded && verified;

  const save = () => {
    if (!canSave) return;
    const kyc: KYC = { address: address.trim(), aadharNumber: aadhar, aadharUploaded: uploaded, verified };
    saveKyc(request.id, kyc);
    onBack();
  };

  return (
    <Screen
      padX={22}
      contentStyle={styles.stack}
      footer={
        request.fromApp ? undefined : (
          <View style={styles.actions}>
            <Button label="Cancel" variant="secondary" onPress={onBack} style={styles.reject} />
            <Button label="Save" onPress={save} disabled={!canSave} style={styles.accept} />
          </View>
        )
      }
    >
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={onBack} />
      </View>

      <View style={styles.guestRow}>
        <View style={[styles.avatar, { backgroundColor: c.successTint }]}>
          <Text style={[styles.avatarText, { color: c.successOnTint }]}>{initials(request.guest)}</Text>
        </View>
        <View style={styles.guestBody}>
          <Text variant="h3" style={styles.guestName}>
            {request.guest}
          </Text>
          <Badge label="Approved" tone="success" style={styles.approvedBadge} />
        </View>
      </View>

      <Card>
        <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
          Personal information
        </Text>
        <DetailRow label="Full name" value={request.guest} />
        <DetailRow label="Phone number" value={maskPhone(request.phone)} />
        <DetailRow label="Check-in" value={formatDayDate(request.checkIn)} />
        <DetailRow label="Check-out" value={formatDayDate(request.checkOut)} />
        <DetailRow label="Room type" value={request.roomType} />
        <DetailRow label="Duration" value={`${nights} ${nights === 1 ? 'night' : 'nights'}`} />
        <DetailRow label="Guests" value={request.guests} last />
      </Card>

      {request.fromApp ? (
        <Card>
          <View style={styles.cardHead}>
            <Text variant="overline" color="textTertiary">
              KYC
            </Text>
            <Badge label="On file · LAMPOSE app" tone="accent" />
          </View>
          <DetailRow label="Address" value={request.kyc?.address ?? '—'} />
          <DetailRow label="Aadhar number" value={maskAadhar(request.kyc?.aadharNumber ?? '')} />
          <DetailRow label="Aadhar card" value={request.kyc?.aadharUploaded ? 'Uploaded' : 'Missing'} last />
        </Card>
      ) : (
        <>
          <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
            KYC — not on file, enter manually
          </Text>

          <Input
            label="Address"
            value={address}
            onChangeText={setAddress}
            placeholder="House no., street, area, city, state"
            multiline
            minHeight={80}
            containerStyle={styles.field}
          />

          <Input
            label="Aadhar number"
            value={formatAadhar(aadhar)}
            onChangeText={(t) => setAadhar(t.replace(/\D/g, '').slice(0, AADHAR_LENGTH))}
            placeholder="1234 5678 9012"
            keyboardType="number-pad"
            maxLength={14}
            containerStyle={styles.field}
          />

          <View style={styles.field}>
            <AadharUploadTile uploaded={uploaded} onToggle={() => setUploaded((u) => !u)} />
          </View>

          <VerificationCodeField phone={request.phone} verified={verified} onVerifiedChange={setVerified} />
        </>
      )}
    </Screen>
  );
}

// ── Declined ─────────────────────────────────────────────────────────────

function DeclinedDetail({ request, onBack }: { request: RequestDetail; onBack: () => void }) {
  const c = useColors();
  return (
    <Screen padX={22} contentStyle={styles.stack}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={onBack} />
      </View>

      <View style={[styles.banner, { backgroundColor: c.errorTint }]}>
        <Icon name="close" size={18} color={c.error} strokeWidth={2} />
        <Text style={[styles.bannerText, { color: c.error, fontSize: 16 }]}>Declined</Text>
      </View>

      <View style={styles.readOnly} pointerEvents="none">
        <View style={styles.guestRow}>
          <View style={[styles.avatar, { backgroundColor: c.borderSubtle }]}>
            <Text style={[styles.avatarText, { color: c.textTertiary }]}>{initials(request.guest)}</Text>
          </View>
          <View style={styles.guestBody}>
            <Text variant="h3" style={styles.guestName}>
              {request.guest}
            </Text>
            <Text variant="badge" color="textCaption" style={styles.guestSummary}>
              Requested {formatDateTime(request.requestedAt)}
            </Text>
          </View>
        </View>

        <Card style={styles.readOnlyCard}>
          <DetailRow label="Check-in" value={formatDayDate(request.checkIn)} />
          <DetailRow label="Check-out" value={formatDayDate(request.checkOut)} />
          <DetailRow label="Room" value={request.roomType} last />
        </Card>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Amount</Text>
          <Text tabular style={styles.totalValue}>
            {formatINR(grossOf(request))}
          </Text>
        </View>
      </View>
    </Screen>
  );
}

// ── Expired ───────────────────────────────────────────────────────────────

function ExpiredDetail({ request, onBack }: { request: RequestDetail; onBack: () => void }) {
  const c = useColors();

  return (
    <Screen padX={22} contentStyle={styles.stack}>
      <View style={styles.backRow}>
        <IconButton name="chevron-left" label="Go back" onPress={onBack} />
      </View>

      <View style={[styles.banner, { backgroundColor: c.surfaceSunken }]}>
        <Icon name="close" size={18} color={c.textTertiary} strokeWidth={2} />
        <Text style={[styles.bannerText, { color: c.textTertiary, fontSize: 16 }]}>
          Expired · auto-declined
        </Text>
      </View>

      {/* Read-only: dimmed and inert, so there's no ambiguity about why. */}
      <View style={styles.readOnly} pointerEvents="none">
        <View style={styles.guestRow}>
          <View style={[styles.avatar, { backgroundColor: c.borderSubtle }]}>
            <Text style={[styles.avatarText, { color: c.textTertiary }]}>
              {initials(request.guest)}
            </Text>
          </View>
          <View style={styles.guestBody}>
            <Text variant="h3" style={styles.guestName}>
              {request.guest}
            </Text>
            <Text variant="badge" color="textCaption" style={styles.guestSummary}>
              Requested {formatDateTime(request.requestedAt)}
            </Text>
          </View>
        </View>

        <Card style={styles.readOnlyCard}>
          <DetailRow label="Check-in" value={formatDayDate(request.checkIn)} />
          <DetailRow label="Check-out" value={formatDayDate(request.checkOut)} />
          <DetailRow label="Room" value={request.roomType} last />
        </Card>

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Amount</Text>
          <Text tabular style={styles.totalValue}>
            {formatINR(grossOf(request))}
          </Text>
        </View>
      </View>

      <View style={styles.spacer} />

      <Text variant="badge" color="textCaption" center style={styles.expiredNote}>
        This request timed out and was automatically declined. The guest has been notified.
      </Text>
    </Screen>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

/** The single most important thing on screen, so it sits directly under the header. */
function CountdownBanner({ msLeft }: { msLeft: number }) {
  const c = useColors();
  const urgency = urgencyOf(msLeft);
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  const critical = urgency === 'critical';

  useEffect(() => {
    if (!critical || reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.ease) }), -1, false);
    return () => cancelAnimation(pulse);
  }, [critical, reduced, pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: (1 - pulse.value) * 0.3,
    transform: [{ scale: 1 + pulse.value * 0.06 }],
  }));

  const skin = critical
    ? { bg: c.errorTint, fg: c.error }
    : urgency === 'warning'
      ? { bg: c.warningTint, fg: c.warningOnTint }
      : { bg: c.surfaceSunken, fg: c.textSecondary };

  return (
    <View style={[styles.banner, { backgroundColor: skin.bg }]}>
      {critical && !reduced ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 14, backgroundColor: c.error }, halo]}
        />
      ) : null}
      <Icon name="clock" size={18} color={skin.fg} strokeWidth={2} />
      <Text style={[styles.bannerText, { color: skin.fg }]}>
        Expires in {formatLeft(msLeft).replace(' left', '')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: -4 },

  banner: {
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  bannerText: { fontFamily: fonts.extrabold, fontSize: 18, lineHeight: 24 },

  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  guestBody: { flex: 1, gap: 3 },
  guestName: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  guestSummary: { fontSize: 12, marginTop: 1 },
  approvedBadge: { alignSelf: 'flex-start' },
  messageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionLabel: { marginBottom: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  field: { marginBottom: 4 },

  priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  priceValue: { fontFamily: fonts.medium },
  priceRule: { marginTop: 4, marginBottom: 12 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  totalLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  totalValue: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 21 },

  actions: { flexDirection: 'row', gap: 10 },
  reject: { flex: 1 },
  accept: { flex: 1.4 },

  readOnly: { opacity: 0.55, gap: 14 },
  readOnlyCard: { marginTop: 4 },
  spacer: { flex: 1, minHeight: 24 },
  expiredNote: { fontSize: 12.5, lineHeight: 19 },
});
