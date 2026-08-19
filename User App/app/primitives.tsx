import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  Card,
  CeilingFilter,
  Checkbox,
  Chip,
  ConfirmModal,
  CountdownRing,
  Divider,
  IconButton,
  InlineAlert,
  OfflineBanner,
  OtpInput,
  ProgressBar,
  Radio,
  SearchField,
  SegmentedControl,
  SkeletonCard,
  Snackbar,
  Spinner,
  Stepper,
  Switch,
  Text,
  TextField,
  Toast,
  Tooltip,
} from '@/components/ui';
import { useTheme } from '@/context/ThemeContext';
import { actions } from '@/constants/actions';

/**
 * Batch 1 — primitives preview.
 *
 * Not a product screen. Every primitive with its live states, so the system
 * can be exercised on a device before screens are built on it.
 */

const CHIPS = ['PG / Hostel', 'Bachelor', 'Co-live', 'Hotels', 'Under ₹10k', 'Veg mess'];
const GENDERS = ['Boys only', 'Girls only', 'Co-ed'];
const SORTS = ['Rent', 'Distance', 'Deposit'] as const;

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { colors, space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="eyebrow" color="tertiary">
          {title}
        </Text>
        {note ? (
          <Text variant="caption" color="secondary">
            {note}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderWidth: StyleSheet.hairlineWidth,
          borderRadius: 16,
          padding: space[4],
          gap: space[4],
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function PrimitivesPreview() {
  const { colors, space, layout } = useTheme();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('98490 12');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('Gachibowli');
  const [otp, setOtp] = useState('419');
  const [checks, setChecks] = useState<Record<string, boolean>>({ wifi: true, power: true });
  const [gender, setGender] = useState<string | null>(null);
  const [alerts, setAlerts] = useState(true);
  const [chips, setChips] = useState<Record<string, boolean>>({ PG: true });
  const [removable, setRemovable] = useState(['Gachibowli', 'Under ₹10k']);
  const [sort, setSort] = useState<(typeof SORTS)[number]>('Rent');
  const [sharing, setSharing] = useState(2);
  const [rent, setRent] = useState(10000);
  const [deposit, setDeposit] = useState(20000);
  const [toast, setToast] = useState(false);
  const [snack, setSnack] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [modal, setModal] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Primitives' }} />
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <OfflineBanner offline ageLabel="4 min old" />
        <ScrollView
          contentContainerStyle={{
            paddingTop: space[4],
            paddingBottom: insets.bottom + space[8] * 2,
            paddingHorizontal: layout.gutter,
            gap: space[6],
          }}
        >
          <View style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="brand">
              Batch 1 of 12
            </Text>
            <Text variant="display2">Primitives</Text>
            <Text variant="body" color="secondary">
              Every primitive, every state. Press values are specified once and referenced by name
              everywhere — nothing here re-types them.
            </Text>
          </View>

          <Section title="01 · Button" note="Only primary is ever filled. Destructive stays an outline.">
            <View style={{ gap: space[2] }}>
              <Button label="Send request" fullWidth onPress={() => setToast(true)} />
              <Button label={actions.bookVisit} variant="secondary" fullWidth />
              <Button label="See 12 similar" variant="ghost" fullWidth />
              <Button label="Cancel booking" variant="destructive" fullWidth onPress={() => setModal(true)} />
              <Button label="Sending…" loading fullWidth />
              <Button label="Unavailable" disabled fullWidth />
            </View>
            <Divider />
            <View style={[styles.row, { gap: space[2] }]}>
              <Button label="Large" size="lg" />
              <Button label="Medium" size="md" />
              <Button label="Small" size="sm" />
            </View>
            <View style={[styles.row, { gap: space[2] }]}>
              <Button label="Add to shortlist" icon="bookmark" variant="secondary" />
              <Button label="Call owner" icon="phone" variant="secondary" />
            </View>
            <View style={[styles.row, { gap: space[2] }]}>
              <IconButton name="bookmark" accessibilityLabel="Shortlist" />
              <IconButton name="phone" accessibilityLabel="Call" variant="brand" />
              <IconButton name="close" accessibilityLabel="Close" disabled />
            </View>
          </Section>

          <Section title="02 · Inputs" note="Pill radius is reserved for search — shape says which field queries.">
            <TextField
              label="Full name"
              placeholder="As on your ID"
              helper="Owners see this on your request."
              value={name}
              onChangeText={setName}
            />
            <TextField
              label="Mobile number"
              prefix="+91"
              keyboardType="number-pad"
              helper="We send one OTP. No calls."
              maxLength={10}
              showCount
              value={phone}
              onChangeText={setPhone}
            />
            <TextField
              label="Full name"
              value="A"
              error="Enter your full name as printed on your ID."
              onChangeText={() => {}}
            />
            <TextField label="Full name" value="Anjali Reddy" readOnly helper="Verified by KYC — contact support to change." />
            <SearchField
              placeholder="Area, college or PG name"
              value={search}
              onChangeText={setSearch}
              onClear={() => setSearch('')}
            />
            <TextField
              label="Message to owner"
              optional
              multiline
              maxLength={280}
              showCount
              helper="Keep it short — owners read on mobile."
              value={message}
              onChangeText={setMessage}
            />
          </Section>

          <Section title="03 · OtpInput" note="Box width derives from length. Digits are mono so 1 and 7 never blur.">
            <OtpInput value={otp} onChange={setOtp} length={6} />
            <Divider label="and at four" />
            <OtpInput value={otp.slice(0, 4)} onChange={() => {}} length={4} />
            <OtpInput value="419031" onChange={() => {}} length={6} state="error" errorMessage="Wrong code. 2 tries left." />
            <OtpInput value="419037" onChange={() => {}} length={6} state="autofilled" />
          </Section>

          <Section title="04 · Selection">
            <View>
              <Checkbox
                label="WiFi included"
                checked={!!checks.wifi}
                onChange={(next) => setChecks((c) => ({ ...c, wifi: next }))}
              />
              <Checkbox
                label="Power backup"
                checked={!!checks.power}
                onChange={(next) => setChecks((c) => ({ ...c, power: next }))}
              />
              <Checkbox label="AC rooms" checked indeterminate note="indeterminate" />
              <Checkbox label="Lift" checked={false} disabled note="not in this building" />
            </View>
            <Divider />
            <View>
              {GENDERS.map((option) => (
                <Radio key={option} label={option} selected={gender === option} onSelect={() => setGender(option)} />
              ))}
              <Text variant="numMeta" color={gender ? 'success' : 'warning'}>
                {gender ? `value = ${gender}` : 'value = null · required, never pre-selected'}
              </Text>
            </View>
            <Divider />
            <Switch label="Price drop alerts" value={alerts} onChange={setAlerts} />
            <Switch label="SMS updates (no signal)" value disabled />
            <Divider />
            <View style={[styles.wrap, { gap: space[2] }]}>
              {CHIPS.map((chip) => (
                <Chip
                  key={chip}
                  label={chip}
                  selected={!!chips[chip]}
                  onPress={() => setChips((c) => ({ ...c, [chip]: !c[chip] }))}
                />
              ))}
            </View>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {removable.length ? (
                removable.map((chip) => (
                  <Chip
                    key={chip}
                    label={chip}
                    onRemove={() => setRemovable((r) => r.filter((item) => item !== chip))}
                  />
                ))
              ) : (
                <Text variant="body" color="tertiary">
                  All filters cleared — an empty state is a sentence, not a blank row.
                </Text>
              )}
            </View>
            <Divider />
            <SegmentedControl options={SORTS} value={sort} onChange={setSort} accessibilityLabel="Sort by" />
            <Stepper value={sharing} onChange={setSharing} min={1} max={4} accessibilityLabel="sharing" unit="sharing" />
            <Divider />
            <CeilingFilter
              rent={rent}
              onRentChange={setRent}
              deposit={deposit}
              onDepositChange={setDeposit}
              matchCount={Math.max(3, Math.round(rent / 260 + deposit / 900))}
            />
          </Section>

          <Section title="05 · Feedback">
            <View style={[styles.row, { gap: space[2] }]}>
              <Button label="Show toast" variant="secondary" size="sm" onPress={() => setToast(true)} />
              <Button label="Show snackbar" variant="secondary" size="sm" onPress={() => setSnack(true)} />
            </View>
            <InlineAlert
              tone="warning"
              title="Deposit is 2 months here"
              body="₹17,000 on top of the first month's rent. Refundable when you leave with 30 days' notice."
            />
            <InlineAlert
              tone="error"
              title="This PG is for boys only"
              body="Your profile says girls' accommodation. Change the filter to see it anyway."
              actionLabel="Change filter"
              onAction={() => {}}
            />
            <InlineAlert
              tone="info"
              title="Two-sharing means two beds in one room"
              body="You get one bed, one cupboard and a roommate. Rent is per bed, not per room."
            />
          </Section>

          <Section title="06 · Loading" note="Skeletons wherever the layout is known. The shimmer was cut.">
            <View style={[styles.row, { gap: space[4] }]}>
              <Spinner />
              <Spinner size="large" />
            </View>
            <ProgressBar label="Uploading ID proof" progress={0.64} />
            <SkeletonCard />
            <CountdownRing secondsRemaining={180} totalSeconds={600} label="Owner replies within" />
            <CountdownRing secondsRemaining={47} totalSeconds={600} label="Pay within" />
          </Section>

          <Section title="07 · Display & containers">
            <View style={[styles.wrap, { gap: space[2] }]}>
              <Badge label="New" tone="brand" />
              <Badge label="Verified owner" tone="success" />
              <Badge label="2 beds left" tone="warning" />
              <Badge label="Boys only" />
              <Badge count={3} tone="danger" />
            </View>
            <View style={[styles.row, { gap: space[3] }]}>
              <Avatar name="Anjali Reddy" size={24} />
              <Avatar name="Anjali Reddy" size={32} />
              <Avatar name="Anjali Reddy" size={40} />
              <Avatar name="Anjali Reddy" size={56} verified />
            </View>
            <Divider label="or" />
            <Card style={{ padding: space[4] }} onPress={() => {}}>
              <Text variant="body">Flat — border only. The in-list default. Press me.</Text>
            </Card>
            <Card raised style={{ padding: space[4] }}>
              <Text variant="body">Raised — reserved for the one card carrying money or status.</Text>
            </Card>
            <Tooltip
              term="Notice period is 30 days"
              title="Notice period"
              body="Tell the owner 30 days before you leave, or they can keep one month's rent from your deposit."
            />
            <View style={[styles.row, { gap: space[2] }]}>
              <Button label="Open sheet" variant="secondary" size="sm" onPress={() => setSheet(true)} />
              <Button label="Open modal" variant="secondary" size="sm" onPress={() => setModal(true)} />
            </View>
          </Section>
        </ScrollView>

        <Toast message="Added to shortlist" visible={toast} onDismiss={() => setToast(false)} />
        <Snackbar
          message="Removed from shortlist"
          actionLabel="Undo"
          onAction={() => setSnack(false)}
          visible={snack}
          onDismiss={() => setSnack(false)}
        />

        <BottomSheet
          visible={sheet}
          onClose={() => setSheet(false)}
          title="Sharing type"
          footer={
            <View style={[styles.row, { gap: space[2] }]}>
              <Button label="Clear" variant="ghost" style={styles.flex} />
              <Button label="Apply" style={styles.flex} onPress={() => setSheet(false)} />
            </View>
          }
        >
          <View style={{ gap: space[2], paddingVertical: space[3] }}>
            <Radio label="Single occupancy · ₹14,000" selected={sharing === 1} onSelect={() => setSharing(1)} />
            <Radio label="Two-sharing · ₹8,500" selected={sharing === 2} onSelect={() => setSharing(2)} />
            <Radio label="Three-sharing · ₹6,800" selected={sharing === 3} onSelect={() => setSharing(3)} />
            <Radio label="Four-sharing · ₹5,500" selected={sharing === 4} onSelect={() => setSharing(4)} />
          </View>
        </BottomSheet>

        <ConfirmModal
          visible={modal}
          onClose={() => setModal(false)}
          title="Cancel this booking?"
          body="Your ₹17,000 deposit refund starts within 7 working days. The bed goes back on the market immediately."
          confirmLabel="Yes, cancel it"
          onConfirm={() => setModal(false)}
          cancelLabel="Keep my booking"
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  flex: { flex: 1 },
});
