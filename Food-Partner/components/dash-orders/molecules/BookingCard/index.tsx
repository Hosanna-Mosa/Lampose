/* One table booking, as the counter reads it: who, how many, when, and the
   buttons the server says are open right now.

   Laid out like an order card on the same tab — icon tile, name, status pill —
   so the two lists read as one queue. The buttons are drawn from
   `booking.actions` and nothing else: the windows ("arrived" from an hour
   before, "no-show" from fifteen minutes after) are the server's, and a card
   that guessed them would offer a button the server then refuses. */
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Badge, Button, Card, InfoNote, InfoRow, Txt } from "@/components/ui";
import { clockWords } from "@/lib/when";
import {
  BOOKING_STATUS,
  preferenceWords,
  type TableAction,
  type TableBooking,
} from "@/services/dineIn";
import { font, fromToneName, line, ms, radius, size, ui } from "@/theme/ui";

const guests = (n: number) => `${n} guest${n === 1 ? "" : "s"}`;

/* No buttons, for a row that somehow arrived without the server's verdict. */
const NO_ACTIONS: TableBooking["actions"] = { accept: false, decline: false, cancel: false, arrived: false, noShow: false };

/** "12:04" — minutes and seconds left to answer. */
const countdown = (ms_: number) => {
  const total = Math.max(0, Math.floor(ms_ / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** What happened to a booking that is over, in a sentence. Empty while it is live. */
const outcome = (b: TableBooking): string => {
  switch (b.status) {
    case "declined":
      return b.reason ? `You declined: ${b.reason}` : "You declined this request.";
    case "expired":
      return "Nobody answered in time, so the request expired.";
    case "no_show":
      return "Marked as a no-show.";
    case "arrived":
      return b.arrivedAt ? `Arrived at ${clockWords(b.arrivedAt)}.` : "The guests arrived.";
    case "cancelled":
      if (b.cancelledBy === "customer") return b.reason ? `The guest cancelled: ${b.reason}` : "The guest cancelled.";
      if (b.cancelledBy === "restaurant") return b.reason ? `You cancelled: ${b.reason}` : "You cancelled.";
      return b.reason || "Cancelled by Lampose.";
    default:
      return "";
  }
};

interface Props {
  booking: TableBooking;
  /** The clock the countdown reads — ticked by the list, not by every card. */
  now: number;
  busy: boolean;
  /** The server's refusal of this card's last button, shown under it. */
  error?: string;
  onAction: (action: TableAction) => void;
}

export function BookingCard({ booking: b, now, busy, error, onAction }: Props) {
  const status = BOOKING_STATUS[b.status] ?? { label: b.status, tone: "muted" as const };
  const actions = b.actions ?? NO_ACTIONS;
  const msLeft = Date.parse(b.respondBy) - now;
  /* The server's flag, AND the clock: a card loaded thirty seconds before the
     window shut still says `accept: true` until the list reloads. */
  const answerable = b.status === "requested" && msLeft > 0;
  const waiting = answerable && (actions.accept || actions.decline);
  const preference = preferenceWords(b.preference);
  const said = outcome(b);
  const confirmed = b.status === "confirmed";

  return (
    <Card bordered elevationLevel="none" padding={14} style={[styles.card, waiting && styles.cardAction]}>
      {/* ── Who ───────────────────────────────────────────────────────── */}
      <View style={styles.topRow}>
        <View style={[styles.iconTile, { backgroundColor: waiting ? ui.brandSkin : ui.sunken }]}>
          <Ionicons name="restaurant" size={ms(18)} color={waiting ? ui.brandInk : ui.sec} />
        </View>
        <View style={styles.headTexts}>
          <Txt style={styles.guest} numberOfLines={1}>
            {b.guestName || "Guest"}
          </Txt>
          <Txt style={styles.meta} numberOfLines={1} selectable>
            {[b.reference, b.forSomeoneElse ? "Booked on their behalf" : ""].filter(Boolean).join(" · ")}
          </Txt>
        </View>
        <Badge label={status.label} tone={fromToneName(status.tone)} dot />
      </View>

      {/* ── When, and how many ───────────────────────────────────────── */}
      <View style={styles.when}>
        <Txt style={styles.whenText}>
          {b.dayLabel} · {b.timeLabel}
        </Txt>
        <Txt style={styles.party}>
          {b.tableNumber
            ? `${guests(b.partySize)} · Table ${b.tableNumber} (${b.tableSeats} seats)${b.tableChosen ? " · picked by diner" : ""}`
            : `${guests(b.partySize)} · table for ${b.tableSeats}`}
        </Txt>
      </View>

      {!!b.guestPhone && (
        <InfoRow
          icon="call-outline"
          text={b.guestPhone}
          onPress={() => Linking.openURL(`tel:${b.guestPhone.replace(/\s+/g, "")}`).catch(() => {})}
        />
      )}
      {/* A wish the diner was told is not guaranteed — said the same way here. */}
      {!!preference && <InfoRow icon="options-outline" text={`${preference} (on request)`} />}
      {!!b.note && <Txt style={styles.note}>Note: {b.note}</Txt>}
      {!!said && <Txt style={styles.outcome}>{said}</Txt>}

      {/* ── The answer window ─────────────────────────────────────────── */}
      {b.status === "requested" && (
        <View style={[styles.timer, msLeft < 3 * 60_000 && styles.timerUrgent]}>
          <Ionicons name="timer-outline" size={ms(18)} color={msLeft < 3 * 60_000 ? ui.error : ui.warning} />
          <Txt style={[styles.timerText, msLeft < 3 * 60_000 && { color: ui.error }]}>
            {answerable ? `Answer in ${countdown(msLeft)}` : "Time is up"}
          </Txt>
        </View>
      )}

      {!!error && <InfoNote tone="danger" text={error} />}

      {/* ── What the counter can do now ───────────────────────────────── */}
      {waiting && (
        <View style={styles.actions}>
          {actions.accept && (
            <Button title="Accept booking" loading={busy} fullWidth onPress={() => onAction("accept")} />
          )}
          {actions.decline && (
            <Button
              title="Decline"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => onAction("decline")}
              icon={<Ionicons name="close-circle-outline" size={18} color={ui.error} />}
            />
          )}
        </View>
      )}

      {confirmed && (actions.arrived || actions.noShow || actions.cancel) && (
        <View style={styles.actions}>
          {actions.arrived && (
            <Button title="Guests arrived" loading={busy} fullWidth onPress={() => onAction("arrived")} />
          )}
          {actions.noShow && (
            <Button
              title="No-show"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => onAction("no-show")}
            />
          )}
          {actions.cancel && (
            <Button
              title="Cancel booking"
              variant="secondary"
              fullWidth
              disabled={busy}
              onPress={() => onAction("cancel")}
              icon={<Ionicons name="close-circle-outline" size={18} color={ui.error} />}
            />
          )}
        </View>
      )}

      {confirmed && !actions.arrived && !actions.noShow && (
        <Txt style={styles.caption}>You can mark them arrived from an hour before.</Txt>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  cardAction: { borderLeftColor: ui.brand, borderLeftWidth: 3 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconTile: { width: ms(40), height: ms(40), borderRadius: 12, alignItems: "center", justifyContent: "center" },
  headTexts: { flex: 1, minWidth: 0 },
  guest: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  meta: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec, marginTop: 2 },

  when: {
    gap: 2,
    borderTopWidth: 1,
    borderTopColor: ui.borderStrong,
    borderStyle: "dashed",
    paddingTop: 12,
  },
  whenText: { fontFamily: font.heading.bold, fontSize: size.large, lineHeight: line.large, color: ui.text },
  party: { fontFamily: font.body.semibold, fontSize: size.medium, lineHeight: line.medium, color: ui.brandInk },

  note: { fontFamily: font.body.semibold, fontSize: size.small, lineHeight: line.small, color: ui.warning },
  outcome: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  caption: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.muted },

  timer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: ui.warningSkin,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  timerUrgent: { backgroundColor: ui.errorSkin },
  timerText: { fontFamily: font.body.bold, fontSize: size.medium, color: ui.warning },

  actions: { gap: 10, marginTop: 2 },
});
