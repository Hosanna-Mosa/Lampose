import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import {
  AgreementSummaryCard,
  BookingStatusChip,
  BookingTimeline,
  CostBreakdown,
  CostSummary,
  CountdownTimer,
  MoveInDatePicker,
  RefundStatusStepper,
  VerificationCodeDisplay,
  VerificationCodeProblem,
  VisitScheduler,
  VisitStatusCard,
} from '@/components/booking';
import { useTheme } from '@/context/ThemeContext';
import type { BookingStatus } from '@/constants/tokens';
import {
  HOUSE_RULES_NOTE,
  inSeconds,
  refundInProgress,
  saiKrishnaAgreement,
  saiKrishnaCost,
  saiKrishnaHouseRules,
  timelineSteps,
  visitCompleted,
  visitConfirmed,
  visitDays,
  visitMissed,
  visitRequested,
} from '@/data/bookings';
import type { RefundStageId } from '@/types/booking';

/**
 * Batch 4 — booking preview.
 *
 * Not a product screen. The timers, the timeline and the refund stepper are
 * live so the tier transitions and the sequenced advance can be watched on a
 * device before the real payment and lifecycle screens are built on them.
 */

const ALL_STATUSES: readonly BookingStatus[] = [
  'REQUESTED',
  'ACCEPTED',
  'PAYMENT_PENDING',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_CUSTOMER',
  'CANCELLED_BY_OWNER',
  'PAYMENT_FAILED',
  'DISPUTED',
];

const TIMELINE_CYCLE: readonly BookingStatus[] = [
  'REQUESTED',
  'ACCEPTED',
  'CONFIRMED',
  'CHECKED_IN',
];

const REFUND_STAGES: readonly RefundStageId[] = ['requested', 'inspected', 'processing', 'sent'];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  const { space } = useTheme();
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
      {children}
    </View>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  const { colors, space, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.card,
        padding: space[4],
        gap: space[4],
      }}
    >
      {children}
    </View>
  );
}

export default function BookingPreview() {
  const { colors, space, layout, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [timelineStatus, setTimelineStatus] = useState<BookingStatus>('REQUESTED');
  const [costExpanded, setCostExpanded] = useState(false);
  const [dayId, setDayId] = useState(visitDays[1].id);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [moveInDay, setMoveInDay] = useState<number | null>(5);
  const [flexible, setFlexible] = useState(false);
  const [refundStage, setRefundStage] = useState<RefundStageId>('processing');
  const [refundFailed, setRefundFailed] = useState(false);
  const [clockEpoch, setClockEpoch] = useState(0);

  const advanceTimeline = () => {
    const index = TIMELINE_CYCLE.indexOf(timelineStatus);
    setTimelineStatus(TIMELINE_CYCLE[Math.min(index + 1, TIMELINE_CYCLE.length - 1)]);
  };

  const advanceRefund = () => {
    const index = REFUND_STAGES.indexOf(refundStage);
    setRefundStage(REFUND_STAGES[Math.min(index + 1, REFUND_STAGES.length - 1)]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingBottom: insets.bottom }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader
        title="Booking"
        subtitle="Batch 4 · 13 statuses · three clocks · the trust components"
        onBack={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{
          paddingTop: space[4],
          paddingBottom: space[8],
          paddingHorizontal: layout.gutter,
          gap: space[6],
        }}
      >
        <Section
          title="01 · BookingStatusChip"
          note="Thirteen statuses, one shape. Carriers in priority order: glyph, label, actor, then colour — so the chip survives greyscale and sunlight."
        >
          <Panel>
            <View style={[styles.wrap, { gap: space[2] }]}>
              {ALL_STATUSES.map((status) => (
                <BookingStatusChip
                  key={status}
                  status={status}
                  deadline={inSeconds(2820)}
                  timerSuppressed={status === 'REQUESTED'}
                />
              ))}
            </View>
            <Text variant="caption" color="secondary">
              Confirmed is the only filled chip in the app. The 1.5px border marks the two statuses that need
              something from you. Both cancelled states carry their actor, because “Cancelled” alone leaves
              the user guessing whether they did it.
            </Text>
          </Panel>
        </Section>

        <Section
          title="02 · CountdownTimer"
          note="Three contexts, three tiers. Every deadline is an absolute server timestamp — a fast device clock cannot close a payment window early."
        >
          <View style={{ gap: space[3] }} key={clockEpoch}>
            <CountdownTimer context="quote" deadline={inSeconds(150)} />
            <CountdownTimer context="ownerResponse" deadline={inSeconds(2820)} alternativesCount={6} />
            <CountdownTimer context="payment" deadline={inSeconds(45)} totalSeconds={7200} />
          </View>
          <Button
            label="Restart the clocks"
            variant="secondary"
            size="sm"
            onPress={() => setClockEpoch((value) => value + 1)}
          />
          <Text variant="caption" color="secondary">
            The payment clock above starts at 45 seconds, so the critical tier — colour, the one-shot pop, the
            breath and the haptic — happens straight away. At zero the component emits onExpire and says it is
            checking; it never decides the outcome itself.
          </Text>
        </Section>

        <Section
          title="03 · CostBreakdown"
          note="Collapsed on a listing, expanded on the payment screen. Nobody pays from a summary."
        >
          {costExpanded ? (
            <CostBreakdown data={saiKrishnaCost} onCollapse={() => setCostExpanded(false)} />
          ) : (
            <CostSummary data={saiKrishnaCost} onExpand={() => setCostExpanded(true)} />
          )}
        </Section>

        <Section
          title="04 · VisitScheduler"
          note="Full slots stay visible with the reason. An empty grid with no explanation reads as a broken app."
        >
          <Panel>
            <VisitScheduler
              days={visitDays}
              dayId={dayId}
              onSelectDay={(next) => {
                setDayId(next);
                setSlotId(null);
              }}
              slotId={slotId}
              onSelectSlot={setSlotId}
              onConfirm={() => {}}
            />
          </Panel>
        </Section>

        <Section title="05 · VisitStatusCard" note="Four states. Missed carries no blame.">
          <View style={{ gap: space[3] }}>
            <VisitStatusCard visit={visitRequested} onCancel={() => {}} />
            <VisitStatusCard visit={visitConfirmed} onDirections={() => {}} onCallOwner={() => {}} />
            <VisitStatusCard visit={visitCompleted} onRequestBed={() => {}} onNotForMe={() => {}} />
            <VisitStatusCard visit={visitMissed} onPickNewSlot={() => {}} />
          </View>
        </Section>

        <Section
          title="06 · MoveInDatePicker"
          note="One date, not a range — the stay is open-ended, so there is no move-out date to pick."
        >
          <Panel>
            <MoveInDatePicker
              year={2026}
              month={8}
              value={moveInDay}
              onChange={setMoveInDay}
              rent={8500}
              earliestDay={3}
              flexible={flexible}
              onFlexibleChange={setFlexible}
            />
          </Panel>
        </Section>

        <Section
          title="07 · BookingTimeline"
          note="A failure terminates the line where it happened and dashes the rest. The path is never erased."
        >
          <Panel>
            <BookingTimeline status={timelineStatus} steps={timelineSteps} />
            <View style={[styles.wrap, { gap: space[2] }]}>
              <Button label="Advance" size="sm" onPress={advanceTimeline} />
              <Button label="Owner rejects" size="sm" variant="secondary" onPress={() => setTimelineStatus('REJECTED')} />
              <Button label="Payment fails" size="sm" variant="secondary" onPress={() => setTimelineStatus('PAYMENT_FAILED')} />
              <Button label="Expires" size="sm" variant="secondary" onPress={() => setTimelineStatus('EXPIRED')} />
              <Button label="Reset" size="sm" variant="ghost" onPress={() => setTimelineStatus('REQUESTED')} />
            </View>
          </Panel>
        </Section>

        <Section
          title="08 · VerificationCodeDisplay"
          note="Generated when the payment settles and cached then, because PG stairwells have no signal. Four digits — it is read aloud and typed by someone else."
        >
          <Panel>
            <VerificationCodeDisplay
              code="4192"
              bookingReference="LAM-4192"
              ownerName="Ramesh"
              validLabel="Valid on 5 Sep, until 11:59 pm"
              onCodeNotWorking={() => {}}
            />
          </Panel>
          <View style={{ gap: space[3] }}>
            <VerificationCodeProblem kind="mistyped" code="4192" triesLeft={2} />
            <VerificationCodeProblem kind="locked" code="4192" onCallSupport={() => {}} />
            <VerificationCodeProblem kind="wrongDay" code="4192" validOn="5 September" onChangeDate={() => {}} />
          </View>
          <Text variant="caption" color="secondary">
            Every failure says the same load-bearing thing first: a code problem is never a booking problem.
            The rent and deposit are paid and the room is still theirs.
          </Text>
        </Section>

        <Section
          title="09 · RefundStatusStepper"
          note="Processing states a date and names who is holding the money. It never says “soon”."
        >
          <Panel>
            <RefundStatusStepper refund={{ ...refundInProgress, stage: refundStage, failed: refundFailed }} />
            <View style={[styles.wrap, { gap: space[2] }]}>
              <Button label="Advance" size="sm" onPress={advanceRefund} />
              <Button
                label="Transfer fails"
                size="sm"
                variant="secondary"
                onPress={() => {
                  setRefundStage('sent');
                  setRefundFailed(true);
                }}
              />
              <Button
                label="Reset"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setRefundStage('requested');
                  setRefundFailed(false);
                }}
              />
            </View>
          </Panel>
        </Section>

        <Section
          title="10 · AgreementSummaryCard"
          note="Every heading is a sentence about the user. The market term rides alongside so it is learned, not required."
        >
          <AgreementSummaryCard
            propertyLine="Sai Krishna Boys PG · two-sharing · from 5 Sep 2026"
            clauses={saiKrishnaAgreement}
            houseRules={saiKrishnaHouseRules}
            houseRulesNote={HOUSE_RULES_NOTE}
            onSendToParent={() => {}}
            onOpenPdf={() => {}}
          />
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
