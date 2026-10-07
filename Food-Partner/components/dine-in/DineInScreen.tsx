/* ══════════════════════════════════════════════════════════════════════════
   Dine-in — the restaurant's floor, and the days it is not taking tables.

   Reads `GET /me/dine-in`. Three things live on this screen, and each is
   saved on its own because each is a different kind of decision:

     the floor     table types, seating, parking     PUT  /me/dine-in
     the pause     one switch, saved as it moves     PATCH /me/dine-in/paused
     closed days   a whole day, or one time full     POST /me/dine-in/blocks

   ## What is required, and when

   The server lets a half-finished form be saved with dine-in OFF: the
   required fields are only required to switch it ON, because that is the
   moment a diner would see them. The asterisks say which, and the server's
   own refusal (`INVALID_SETTINGS`) lists what is missing, one line each.
   With no opening hours there are no slots to book, which is its own refusal
   (`NO_HOURS`) and points back at the Profile tab, where hours are set.

   ## Seating Capacity and Number of Tables are worked out, never typed

   From the table types, live, with the sums the server does. A capacity typed
   beside a list of tables that already implies one is a second answer to the
   same question, and the first time they disagree a booking would be refused
   against one and accepted against the other.

   ## Every table has a number

   Each table type has a letter (A, B, C… in the order listed, editable) and
   its tables are numbered from it — 4 seats × 10 is A1–A10, 3 seats × 5 is
   B1–B5. Tap a number to rename that table ("Window 2"); every number must be
   unique. Diners may pick a table by its number, or take any free one.

   ## Closing a day cancels its bookings

   Every booking on that day is cancelled and each diner is told — so it asks
   first, and says how many it cancelled afterwards. Marking one time full
   only stops NEW bookings; the guests already booked then are still coming.
   ══════════════════════════════════════════════════════════════════════════ */
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  AlertDialog,
  Badge,
  BottomSheet,
  Button,
  Card,
  CardSkeleton,
  Field,
  Header,
  IconButton,
  InfoNote,
  ListGroup,
  ListRow,
  ScreenShell,
  SegmentedControl,
  TextField,
  ToggleSwitch,
  Txt,
} from "@/components/ui";
import { uid } from "@/lib/uid";
import { dayKey, dayWords, fromDayKey, slotWords } from "@/lib/when";
import {
  blockDineIn,
  getDineInSettings,
  readDineInError,
  saveDineInSettings,
  setDineInPaused,
  unblockDineIn,
  type DineInForm,
  type DineInProblem,
  type DineInSettings,
  type TableType,
} from "@/services/dineIn";
import { setDineInOn } from "@/services/tablePump";
import { usePartnerStore } from "@/store/partnerStore";
import { font, line, ms, radius, size, ui } from "@/theme/ui";

/** The server's limits on one table type — `dineIn.rules.js`. */
const MAX_SEATS = 20;
const MAX_TABLES = 100;

/** How far ahead a day can be closed — the server refuses later. */
const BLOCK_DAYS_AHEAD = 60;

/**
 * A table-type row as typed: strings, so a half-typed number stays on screen.
 * `prefix` is the letter typed (blank = the default for the row's place), and
 * `renamed` the tables given a name of their own, by position — every other
 * table is `<letter><n>`.
 */
type Row = { key: string; seats: string; count: string; prefix: string; renamed: Record<number, string> };

type Form = Omit<DineInForm, "tableTypes"> & { rows: Row[] };

const emptyRow = (): Row => ({ key: uid(), seats: "", count: "", prefix: "", renamed: {} });

/** The default letter for the row at `index`: A … Z, then AA … — the server's `prefixFor`. */
const letterFor = (index: number) => {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const LETTER = /^[A-Za-z]{1,3}$/;
const TABLE_NUMBER = /^[A-Za-z0-9][A-Za-z0-9 -]{0,11}$/;

const rowLetter = (row: Row, index: number) => row.prefix.trim().toUpperCase() || letterFor(index);

/** Every table's number on a row, as the server will store it. */
const numbersOf = (row: Row, index: number): string[] => {
  const count = Number(row.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_TABLES) return [];
  const letter = rowLetter(row, index);
  return Array.from({ length: count }, (_, i) => row.renamed[i]?.trim() || `${letter}${i + 1}`);
};

const toForm = (s: DineInSettings): Form => ({
  enabled: s.enabled,
  rows: s.tableTypes.length
    ? s.tableTypes.map((t) => ({
      key: uid(),
      seats: String(t.seats),
      count: String(t.count),
      prefix: t.prefix ?? "",
      renamed: Object.fromEntries(
        (t.numbers ?? [])
          .map((number, i) => [i, number] as const)
          .filter(([i, number]) => number !== `${t.prefix}${i + 1}`),
      ),
    }))
    : [emptyRow()],
  acSeating: s.acSeating,
  indoorSeating: s.indoorSeating,
  outdoorSeating: s.outdoorSeating,
  familySeating: s.familySeating,
  coupleSeating: s.coupleSeating,
  smoking: s.smoking,
  wheelchairAccessible: s.wheelchairAccessible,
  parkingAvailable: s.parkingAvailable,
  valetParking: s.valetParking,
  kidsFriendly: s.kidsFriendly,
  petFriendly: s.petFriendly,
});

/**
 * The rows as numbers, and what is wrong with each.
 *
 * A row left completely empty is skipped rather than refused — the form
 * always offers one, and an untouched one is not a table type. A table
 * number used twice anywhere on the floor is an error on every row that
 * carries it.
 */
const readRows = (rows: Row[]) => {
  const types: TableType[] = [];
  const errors: Record<string, string> = {};
  const owners = new Map<string, { number: string; rows: string[] }>();
  rows.forEach((row, index) => {
    if (!row.seats.trim() && !row.count.trim()) return;
    const seats = Number(row.seats);
    const count = Number(row.count);
    if (!Number.isInteger(seats) || seats < 1 || seats > MAX_SEATS) {
      errors[row.key] = `Seats per table must be 1 to ${MAX_SEATS}.`;
      return;
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_TABLES) {
      errors[row.key] = `Number of tables must be 1 to ${MAX_TABLES}.`;
      return;
    }
    if (row.prefix.trim() && !LETTER.test(row.prefix.trim())) {
      errors[row.key] = "The letter must be 1 to 3 letters, like A or VIP.";
      return;
    }
    const numbers = numbersOf(row, index);
    const bad = numbers.find((number) => !TABLE_NUMBER.test(number));
    if (bad) {
      errors[row.key] = `"${bad}" — a table number is up to 12 letters, digits, spaces or hyphens.`;
      return;
    }
    numbers.forEach((number) => {
      const key = number.toLowerCase();
      const seen = owners.get(key) ?? { number, rows: [] };
      seen.rows.push(row.key);
      owners.set(key, seen);
    });
    types.push({ seats, count, prefix: rowLetter(row, index), numbers });
  });
  /* Every row carrying a number that appears more than once — on two rows,
     or twice on one. */
  for (const { number, rows: holders } of owners.values()) {
    if (holders.length < 2) continue;
    holders.forEach((key) => {
      errors[key] ??= `Table ${number} is used twice — every table needs its own number.`;
    });
  }
  return { types, errors };
};

const yesNo = (value: boolean | null): "yes" | "no" | null => (value === null ? null : value ? "yes" : "no");

const YES_NO = [
  { key: "yes", label: "Yes" },
  { key: "no", label: "No" },
] as const;

const AC_OPTIONS = [
  { key: "ac", label: "AC" },
  { key: "non_ac", label: "Non-AC" },
  { key: "both", label: "Both" },
] as const;

const SMOKING_OPTIONS = [
  { key: "none", label: "Not specified" },
  { key: "non_smoking", label: "Non-smoking" },
  { key: "smoking_area", label: "Smoking area" },
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** The server's sentence fragments ("whether parking is available") as lines. */
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function DineInScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);

  /* What the server holds, and the form being edited. Kept apart so the
     pause switch and the closed days — which save on their own — never
     overwrite a form somebody is halfway through. */
  const [saved, setSaved] = useState<DineInSettings | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  /* Row errors are shown once a save has been tried — not while somebody is
     still typing the second digit. */
  const [tried, setTried] = useState(false);
  const [saveProblem, setSaveProblem] = useState<DineInProblem | null>(null);
  const [saveNote, setSaveNote] = useState("");

  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState("");

  const [blockDate, setBlockDate] = useState<string | null>(null);
  const [blockTime, setBlockTime] = useState<string | null>(null);
  const [picking, setPicking] = useState<"date" | "time" | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [blockBusy, setBlockBusy] = useState<string | null>(null);
  const [blockError, setBlockError] = useState("");
  const [blockNote, setBlockNote] = useState("");

  const load = useCallback(async () => {
    if (!session?.token) {
      setLoading(false);
      setLoadError("You are signed out. Sign in again to continue.");
      return;
    }
    setLoadError("");
    try {
      const next = await getDineInSettings(session.token);
      setSaved(next);
      setForm(toForm(next));
      setTried(false);
      setDineInOn(next.enabled);
    } catch (err) {
      setLoadError((err as Error)?.message || "We could not load your dine-in settings.");
    } finally {
      setLoading(false);
    }
  }, [session?.token]);

  /* On mount, not on every focus: a refocus that re-read the form would throw
     away an edit in progress. Pull to refresh asks again on purpose. */
  useEffect(() => {
    void load();
  }, [load]);

  const [refreshing, setRefreshing] = useState(false);
  const pull = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /* ── The form ─────────────────────────────────────────────────────────── */

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setSaveNote("");
  };

  const setRows = (next: (rows: Row[]) => Row[]) => {
    setForm((f) => (f ? { ...f, rows: next(f.rows) } : f));
    setSaveNote("");
  };

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  /* Renaming one table: which row, which table on it, and the name typed. */
  const [renaming, setRenaming] = useState<{ key: string; index: number; fallback: string } | null>(null);
  const [renameText, setRenameText] = useState("");

  const startRename = (row: Row, rowIndex: number, index: number) => {
    setRenaming({ key: row.key, index, fallback: `${rowLetter(row, rowIndex)}${index + 1}` });
    setRenameText(numbersOf(row, rowIndex)[index] ?? "");
  };

  const finishRename = (name: string | null) => {
    if (!renaming) return;
    const { key, index, fallback } = renaming;
    setRows((rows) => rows.map((row) => {
      if (row.key !== key) return row;
      const renamed = { ...row.renamed };
      const clean = (name ?? "").trim().replace(/\s+/g, " ");
      if (!clean || clean === fallback) delete renamed[index];
      else renamed[index] = clean;
      return { ...row, renamed };
    }));
    setRenaming(null);
  };

  /* The last row is emptied rather than removed: the form always offers one. */
  const removeRow = (key: string) =>
    setRows((rows) => {
      const rest = rows.filter((row) => row.key !== key);
      return rest.length ? rest : [emptyRow()];
    });

  const { types, errors: rowErrors } = readRows(form?.rows ?? []);
  const tableCount = types.reduce((sum, t) => sum + t.count, 0);
  const seatingCapacity = types.reduce((sum, t) => sum + t.seats * t.count, 0);

  const save = async () => {
    if (!session?.token || !form) return;
    setTried(true);
    setSaveProblem(null);
    setSaveNote("");
    if (Object.keys(rowErrors).length) {
      setSaveProblem({ code: "", message: "Fix the table types marked above.", problems: [] });
      return;
    }
    setSaving(true);
    try {
      const next = await saveDineInSettings(session.token, {
        enabled: form.enabled,
        tableTypes: types,
        acSeating: form.acSeating,
        indoorSeating: form.indoorSeating,
        outdoorSeating: form.outdoorSeating,
        familySeating: form.familySeating,
        coupleSeating: form.coupleSeating,
        smoking: form.smoking,
        wheelchairAccessible: form.wheelchairAccessible,
        parkingAvailable: form.parkingAvailable,
        /* Valet means nothing without parking, and the server refuses it. */
        valetParking: form.parkingAvailable === true && form.valetParking,
        kidsFriendly: form.kidsFriendly,
        petFriendly: form.petFriendly,
      });
      setSaved(next);
      setForm(toForm(next));
      setTried(false);
      setDineInOn(next.enabled);
      setSaveNote(
        !next.enabled
          ? "Saved. Dine-in is off, so diners can't book."
          : next.paused
            ? "Saved. Bookings are paused — switch the pause off to take them."
            : "Saved. Diners can book a table with you now.",
      );
    } catch (err) {
      setSaveProblem(readDineInError(err, "Your dine-in settings did not save."));
    } finally {
      setSaving(false);
    }
  };

  /* ── The pause ────────────────────────────────────────────────────────── */

  const togglePause = async (paused: boolean) => {
    if (!session?.token || !saved) return;
    setPauseBusy(true);
    setPauseError("");
    /* Moved at once, put back if the server says no — a switch that waits for
       a round trip reads as a switch that did not work. */
    setSaved((s) => (s ? { ...s, paused } : s));
    try {
      setSaved(await setDineInPaused(session.token, paused));
    } catch (err) {
      setSaved((s) => (s ? { ...s, paused: !paused } : s));
      setPauseError((err as Error)?.message || "That did not save.");
    } finally {
      setPauseBusy(false);
    }
  };

  /* ── Closed days and full times ───────────────────────────────────────── */

  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const lastDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + BLOCK_DAYS_AHEAD);

  /*
   * Android's picker is a one-shot dialog that must be unmounted once it
   * fires, and reports a cancel as `dismissed` — handled as `TimeRange` does.
   *
   * A time is taken to the half hour it falls in, because that is all a slot
   * can start on. iOS offers only those (`minuteInterval`); Android's clock
   * face does not, so a 7:45 becomes 7:30 — and the button shows it.
   */
  const onPicked = (event: DateTimePickerEvent, picked?: Date) => {
    const which = picking;
    setPicking(null);
    if (event.type === "dismissed" || !picked || !which) return;
    setBlockNote("");
    setBlockError("");
    if (which === "date") {
      setBlockDate(dayKey(picked));
    } else {
      const halfHours = Math.floor((picked.getHours() * 60 + picked.getMinutes()) / 30) * 30;
      setBlockTime(`${pad(Math.floor(halfHours / 60))}:${pad(halfHours % 60)}`);
    }
  };

  const block = async (time?: string) => {
    if (!session?.token || !blockDate) return;
    const day = dayWords(blockDate);
    setBlockBusy(time ? "full" : "close");
    setBlockError("");
    setBlockNote("");
    try {
      const { settings, cancelled } = await blockDineIn(session.token, time ? { date: blockDate, time } : { date: blockDate });
      setSaved(settings);
      setBlockNote(
        time
          ? `${slotWords(time)} on ${day} is marked full. Guests already booked then are still coming.`
          : cancelled
            ? `${day} is closed for tables. ${cancelled} booking${cancelled === 1 ? " was" : "s were"} cancelled and the guests told.`
            : `${day} is closed for tables.`,
      );
      setBlockDate(null);
      setBlockTime(null);
    } catch (err) {
      setBlockError(readDineInError(err, "That did not save.").message);
    } finally {
      setBlockBusy(null);
    }
  };

  const unblock = async (date: string, time?: string) => {
    if (!session?.token) return;
    setBlockBusy(`${date} ${time ?? ""}`);
    setBlockError("");
    setBlockNote("");
    try {
      setSaved(await unblockDineIn(session.token, time ? { date, time } : { date }));
    } catch (err) {
      setBlockError(readDineInError(err, "That did not save.").message);
    } finally {
      setBlockBusy(null);
    }
  };

  /* Days and times together, in date order — a full time sits under its day. */
  const blocks = saved
    ? [
        ...saved.blockedDates.map((date) => ({ date, time: undefined as string | undefined })),
        ...saved.blockedSlots.map((s) => ({ date: s.date, time: s.time as string | undefined })),
      ].sort((a, b) => `${a.date}${a.time ?? ""}`.localeCompare(`${b.date}${b.time ?? ""}`))
    : [];

  const status = !saved?.enabled
    ? { label: "Off", tone: "neutral" as const }
    : saved.paused
      ? { label: "Paused", tone: "warning" as const }
      : { label: "Taking bookings", tone: "success" as const };

  return (
    <ScreenShell
      header={<Header title="Dine-in · Table bookings" onBack={() => router.back()} />}
      scroll
      keyboardAvoiding
      refreshing={refreshing}
      onRefresh={pull}
      contentStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
    >
      {!!loadError && <InfoNote tone="danger" text={loadError} />}
      {loading && !saved && <CardSkeleton count={2} />}

      {saved && form && (
        <>
          {/* ── Now: on, off or paused ────────────────────────────────────── */}
          <Card bordered elevationLevel="none" style={styles.statusCard}>
            <View style={styles.statusRow}>
              <Txt style={styles.statusTitle}>Table bookings</Txt>
              <Badge label={status.label} tone={status.tone} dot />
            </View>
            {saved.enabled && (
              <ListRow
                icon="pause-circle-outline"
                iconColor={ui.warning}
                iconBackground={ui.warningSkin}
                label="Pause table bookings"
                description="Stops new bookings now. Tables already booked stay booked, and delivery is not affected."
                descriptionLines={3}
                right={
                  <ToggleSwitch
                    value={saved.paused}
                    onValueChange={togglePause}
                    disabled={pauseBusy}
                    accessibilityLabel="Pause table bookings"
                  />
                }
                style={styles.flatRow}
              />
            )}
            {!!pauseError && <InfoNote tone="danger" text={pauseError} />}
          </Card>

          {/* ── The switch ────────────────────────────────────────────────── */}
          <ListGroup title="Dine-in" grouped={false}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <ListRow
                icon="restaurant-outline"
                iconColor={ui.brandInk}
                iconBackground={ui.brandSkin}
                label="Dine-in available"
                description="Let diners book a table with you. Saved with the button below."
                right={
                  <ToggleSwitch
                    value={form.enabled}
                    onValueChange={(v) => set("enabled", v)}
                    accessibilityLabel="Dine-in available"
                  />
                }
                style={styles.flatRow}
              />
              <Txt style={styles.caption}>
                <Txt style={styles.required}>*</Txt> Needed to turn dine-in on.
              </Txt>
            </Card>
          </ListGroup>

          {/* ── Tables ────────────────────────────────────────────────────── */}
          <ListGroup title="Tables" grouped={false}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <Field
                label="Table types"
                required
                hint="A letter, seats per table × how many tables. Tables are numbered from the letter (A1, A2…) — tap a number to rename it. Diners can pick a table by its number, or take any free one."
              >
                <View style={styles.rows}>
                  {form.rows.map((row, i) => (
                    <View key={row.key} style={styles.rowBlock}>
                      <View style={styles.typeRow}>
                        <TextField
                          containerStyle={styles.letterField}
                          label={i === 0 ? "Letter" : undefined}
                          value={row.prefix}
                          onChangeText={(v) => setRow(row.key, { prefix: v.replace(/[^A-Za-z]/g, "").toUpperCase() })}
                          placeholder={letterFor(i)}
                          autoCapitalize="characters"
                          maxLength={3}
                        />
                        <TextField
                          containerStyle={styles.typeField}
                          label={i === 0 ? "Seats per table" : undefined}
                          value={row.seats}
                          onChangeText={(v) => setRow(row.key, { seats: v.replace(/\D/g, "") })}
                          keyboardType="number-pad"
                          placeholder="4"
                          maxLength={2}
                        />
                        <Txt style={styles.times}>×</Txt>
                        <TextField
                          containerStyle={styles.typeField}
                          label={i === 0 ? "Tables" : undefined}
                          value={row.count}
                          onChangeText={(v) => setRow(row.key, { count: v.replace(/\D/g, "") })}
                          keyboardType="number-pad"
                          placeholder="6"
                          maxLength={3}
                        />
                        <IconButton
                          icon="trash-outline"
                          accessibilityLabel="Remove this table type"
                          onPress={() => removeRow(row.key)}
                          style={styles.trash}
                        />
                      </View>
                      {numbersOf(row, i).length ? (
                        <View style={styles.numbers}>
                          {numbersOf(row, i).map((number, n) => (
                            <TouchableOpacity
                              key={`${row.key}-${n}`}
                              onPress={() => startRename(row, i, n)}
                              activeOpacity={0.75}
                              accessibilityRole="button"
                              accessibilityLabel={`Table ${number}, ${row.seats} seats. Rename`}
                              style={[styles.number, row.renamed[n] ? styles.numberRenamed : null]}
                            >
                              <Txt style={[styles.numberText, row.renamed[n] ? styles.numberTextRenamed : null]}>
                                {number}
                              </Txt>
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : null}
                      {!!rowErrors[row.key] && (tried || /used twice|letter|table number/.test(rowErrors[row.key])) && (
                        <Txt style={styles.rowError}>{rowErrors[row.key]}</Txt>
                      )}
                    </View>
                  ))}
                </View>
              </Field>
              <Button
                title="+ Add a table type"
                variant="link"
                onPress={() => setRows((rows) => [...rows, emptyRow()])}
              />

              {/* Worked out, never typed — see the header. */}
              <View style={styles.totals}>
                <View style={styles.total}>
                  <Txt style={styles.totalValue}>{seatingCapacity}</Txt>
                  <Txt style={styles.totalLabel}>Seating capacity</Txt>
                </View>
                <View style={styles.total}>
                  <Txt style={styles.totalValue}>{tableCount}</Txt>
                  <Txt style={styles.totalLabel}>Number of tables</Txt>
                </View>
              </View>
              <Txt style={styles.caption}>Worked out from your table types.</Txt>
            </Card>
          </ListGroup>

          {/* ── Seating ───────────────────────────────────────────────────── */}
          <ListGroup title="Seating" grouped={false}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <Field label="AC / Non-AC" required>
                <SegmentedControl
                  segments={AC_OPTIONS}
                  value={form.acSeating}
                  onChange={(key) => set("acSeating", key)}
                />
              </Field>
              <Field label="Indoor seating" required>
                <SegmentedControl
                  segments={YES_NO}
                  value={yesNo(form.indoorSeating)}
                  onChange={(key) => set("indoorSeating", key === "yes")}
                />
              </Field>

              <Field label="Also on offer" optional>
                <View style={styles.switches}>
                  <ToggleRow
                    icon="sunny-outline"
                    label="Outdoor seating"
                    value={form.outdoorSeating}
                    onChange={(v) => set("outdoorSeating", v)}
                  />
                  <ToggleRow
                    icon="people-outline"
                    label="Family seating"
                    value={form.familySeating}
                    onChange={(v) => set("familySeating", v)}
                  />
                  <ToggleRow
                    icon="heart-outline"
                    label="Couple seating"
                    value={form.coupleSeating}
                    onChange={(v) => set("coupleSeating", v)}
                  />
                  <ToggleRow
                    icon="accessibility-outline"
                    label="Wheelchair accessible"
                    value={form.wheelchairAccessible}
                    onChange={(v) => set("wheelchairAccessible", v)}
                    last
                  />
                </View>
              </Field>

              <Field label="Smoking / Non-smoking" optional>
                <SegmentedControl
                  segments={SMOKING_OPTIONS}
                  value={form.smoking ?? "none"}
                  onChange={(key) => set("smoking", key === "none" ? null : key)}
                />
              </Field>
            </Card>
          </ListGroup>

          {/* ── Parking ───────────────────────────────────────────────────── */}
          <ListGroup title="Parking" grouped={false}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <Field label="Parking available" required>
                <SegmentedControl
                  segments={YES_NO}
                  value={yesNo(form.parkingAvailable)}
                  onChange={(key) => {
                    set("parkingAvailable", key === "yes");
                    if (key === "no") set("valetParking", false);
                  }}
                />
              </Field>
              <Field label="Valet" optional>
                <View style={styles.switches}>
                  <ToggleRow
                    icon="car-sport-outline"
                    label="Valet parking"
                    description={form.parkingAvailable === true ? undefined : "Only with parking available."}
                    value={form.parkingAvailable === true && form.valetParking}
                    onChange={(v) => set("valetParking", v)}
                    disabled={form.parkingAvailable !== true}
                    last
                  />
                </View>
              </Field>
            </Card>
          </ListGroup>

          {/* ── Good to know ──────────────────────────────────────────────── */}
          <ListGroup title="Good to know" grouped={false}>
            <Card bordered elevationLevel="none" style={styles.form}>
              <Field label="Shown to diners" optional>
                <View style={styles.switches}>
                  <ToggleRow
                    icon="happy-outline"
                    label="Kids friendly"
                    value={form.kidsFriendly}
                    onChange={(v) => set("kidsFriendly", v)}
                  />
                  <ToggleRow
                    icon="paw-outline"
                    label="Pet friendly"
                    value={form.petFriendly}
                    onChange={(v) => set("petFriendly", v)}
                    last
                  />
                </View>
              </Field>
            </Card>
          </ListGroup>

          {/* ── Save ──────────────────────────────────────────────────────── */}
          <View style={styles.saveBlock}>
            {saveProblem?.code === "NO_HOURS" ? (
              <InfoNote
                tone="danger"
                text={`${saveProblem.message} Tap to set them on your Profile.`}
                onPress={() => router.navigate("/(dash)/profile")}
              />
            ) : saveProblem?.problems.length ? (
              <InfoNote
                tone="danger"
                text={["Please fix:", ...saveProblem.problems.map((p) => `• ${capitalise(p)}`)].join("\n")}
              />
            ) : saveProblem ? (
              <InfoNote tone="danger" text={saveProblem.message} />
            ) : null}
            {!!saveNote && <InfoNote tone="success" text={saveNote} />}
            <Button title="Save dine-in settings" onPress={save} loading={saving} fullWidth />
          </View>

          {/* ── Closed days and full times ────────────────────────────────── */}
          {saved.enabled && (
            <ListGroup title="Closed days & full times" grouped={false}>
              <Card bordered elevationLevel="none" style={styles.form}>
                <Txt style={styles.caption}>
                  Close a whole day, or mark one time full. Closing a day cancels its bookings.
                </Txt>

                {blocks.length > 0 ? (
                  <View style={styles.switches}>
                    {blocks.map((b, i) => {
                      const key = `${b.date} ${b.time ?? ""}`;
                      return (
                        <ListRow
                          key={key}
                          icon={b.time ? "time-outline" : "lock-closed-outline"}
                          label={dayWords(b.date)}
                          description={b.time ? `${slotWords(b.time)} marked full` : "Whole day closed"}
                          right={
                            <IconButton
                              icon="close"
                              size={34}
                              accessibilityLabel={`Open ${dayWords(b.date)}${b.time ? ` at ${slotWords(b.time)}` : ""} again`}
                              onPress={() => void unblock(b.date, b.time)}
                              disabled={blockBusy === key}
                            />
                          }
                          divider={i < blocks.length - 1}
                          style={styles.listRow}
                        />
                      );
                    })}
                  </View>
                ) : (
                  <Txt style={styles.nothing}>Nothing closed or marked full.</Txt>
                )}

                <Field label="Day">
                  <PickButton
                    icon="calendar-outline"
                    text={blockDate ? dayWords(blockDate) : "Pick a day"}
                    chosen={!!blockDate}
                    onPress={() => setPicking("date")}
                  />
                </Field>
                <Field label="Time" optional hint="Only to mark one time full.">
                  <PickButton
                    icon="time-outline"
                    text={blockTime ? slotWords(blockTime) : "Pick a time"}
                    chosen={!!blockTime}
                    onPress={() => setPicking("time")}
                  />
                </Field>

                {picking !== null && (
                  <DateTimePicker
                    value={
                      picking === "date"
                        ? blockDate
                          ? fromDayKey(blockDate)
                          : firstDay
                        : new Date(2000, 0, 1, Number((blockTime ?? "19:00").slice(0, 2)), Number((blockTime ?? "19:00").slice(3)))
                    }
                    mode={picking}
                    minimumDate={picking === "date" ? firstDay : undefined}
                    maximumDate={picking === "date" ? lastDay : undefined}
                    minuteInterval={30}
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={onPicked}
                  />
                )}

                {!!blockError && <InfoNote tone="danger" text={blockError} />}
                {!!blockNote && <InfoNote tone="success" text={blockNote} />}

                <Button
                  title="Close the whole day"
                  variant="secondary"
                  fullWidth
                  disabled={!blockDate || !!blockBusy}
                  loading={blockBusy === "close"}
                  onPress={() => setConfirmClose(true)}
                  icon={<Ionicons name="lock-closed-outline" size={18} color={ui.error} />}
                />
                <Button
                  title={blockTime ? `Mark ${slotWords(blockTime)} full` : "Mark a time full"}
                  variant="secondary"
                  fullWidth
                  disabled={!blockDate || !blockTime || !!blockBusy}
                  loading={blockBusy === "full"}
                  onPress={() => blockTime && void block(blockTime)}
                />
              </Card>
            </ListGroup>
          )}
        </>
      )}

      <AlertDialog
        visible={confirmClose}
        tone="danger"
        title={blockDate ? `Close ${dayWords(blockDate)}?` : "Close this day?"}
        message="Diners can't book that day. Bookings already made for it are cancelled, and the guests are told."
        onDismiss={() => setConfirmClose(false)}
        actions={[
          {
            text: "Close the day",
            style: "destructive",
            onPress: () => {
              setConfirmClose(false);
              void block();
            },
          },
          { text: "Keep it open", style: "cancel", onPress: () => setConfirmClose(false) },
        ]}
      />
      <BottomSheet
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        title={renaming ? `Rename table ${renameText || renaming.fallback}` : "Rename table"}
        subtitle="Diners see this number when they pick a table, and on their booking."
        closeButton
        footer={
          <View style={styles.renameButtons}>
            <Button
              title="Save"
              fullWidth
              disabled={!!renameText.trim() && !TABLE_NUMBER.test(renameText.trim())}
              onPress={() => finishRename(renameText)}
            />
            {renaming ? (
              <Button
                title={`Use ${renaming.fallback}`}
                variant="secondary"
                fullWidth
                onPress={() => finishRename(null)}
              />
            ) : null}
          </View>
        }
      >
        <TextField
          label="Table number"
          value={renameText}
          onChangeText={setRenameText}
          placeholder={renaming?.fallback}
          maxLength={12}
          autoCapitalize="characters"
          autoFocus
        />
        {!!renameText.trim() && !TABLE_NUMBER.test(renameText.trim()) && (
          <Txt style={styles.rowError}>Letters, digits, spaces or hyphens — up to 12.</Txt>
        )}
      </BottomSheet>
    </ScreenShell>
  );
}

/** One optional yes/no, as a switch row — the Profile tab's payment rows. */
function ToggleRow({
  icon,
  label,
  description,
  value,
  onChange,
  disabled,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  last?: boolean;
}) {
  return (
    <ListRow
      icon={icon}
      label={label}
      description={description}
      right={<ToggleSwitch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />}
      divider={!last}
      style={styles.listRow}
    />
  );
}

/** A field-shaped button that opens the OS date or time picker. */
function PickButton({
  icon,
  text,
  chosen,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  chosen: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.pick} onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      <Ionicons name={icon} size={18} color={chosen ? ui.brandInk : ui.muted} />
      <Txt style={[styles.pickText, !chosen && { color: ui.muted }]}>{text}</Txt>
      <Ionicons name="chevron-down" size={16} color={ui.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8 },

  statusCard: { gap: 10 },
  statusRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  statusTitle: { fontFamily: font.heading.semibold, fontSize: size.large, lineHeight: line.large, color: ui.text },

  form: { gap: 16 },
  flatRow: { paddingHorizontal: 0, paddingVertical: 4 },
  listRow: { paddingHorizontal: 12 },
  switches: {
    borderWidth: 1,
    borderColor: ui.border,
    borderRadius: radius.md,
    overflow: "hidden",
  },

  caption: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.muted },
  required: { fontFamily: font.body.bold, color: ui.errorSolid },
  nothing: { fontFamily: font.body.medium, fontSize: size.medium, color: ui.sec },

  rows: { gap: 10 },
  rowBlock: { gap: 4 },
  typeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  typeField: { flex: 1 },
  letterField: { width: ms(64) },
  numbers: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 4 },
  number: {
    minWidth: ms(44),
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surface,
    alignItems: "center",
  },
  numberRenamed: { borderColor: ui.brand, backgroundColor: ui.brandSkin },
  numberText: { fontFamily: font.body.semibold, fontSize: size.small, lineHeight: line.small, color: ui.text },
  numberTextRenamed: { color: ui.brandInk },
  renameButtons: { gap: 8 },
  times: {
    fontFamily: font.body.bold,
    fontSize: size.large,
    color: ui.muted,
    height: ms(50),
    lineHeight: ms(50),
  },
  trash: { marginBottom: (ms(50) - ms(40)) / 2 },
  rowError: { fontFamily: font.body.medium, fontSize: size.small, lineHeight: line.small, color: ui.error },

  totals: { flexDirection: "row", gap: 10 },
  total: {
    flex: 1,
    backgroundColor: ui.sunken,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  totalValue: { fontFamily: font.heading.bold, fontSize: size.extraLarge, lineHeight: line.extraLarge, color: ui.text },
  totalLabel: { fontFamily: font.body.medium, fontSize: size.small, color: ui.sec },

  saveBlock: { gap: 12, marginTop: 24 },

  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: ms(50),
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: ui.border,
    backgroundColor: ui.surface,
    paddingHorizontal: ms(14),
  },
  pickText: { flex: 1, fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
});
