import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button, Checkbox, DateField, Skeleton, Stepper, Text, TextField, TimeField, useAlert,
} from '@/components/ui';
import { StandardHeader } from '@/components/shell';
import { DineInFacilities, FoodEmptyState, FoodMenuSkeleton, FoodNotice, FoodPhotoStrip } from '@/components/food';
import { foodHref } from '@/components/food/routes';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useAuth } from '@/context/AuthContext';
import { useFoodCatalogue } from '@/context/FoodCatalogueContext';
import { useTheme } from '@/context/ThemeContext';
import { useBottomEdgeInset } from '@/hooks/useActionBarInset';
import { ApiError } from '@/services/api/client';
import { bookTable, type BookTableRequest } from '@/services/api/tableBookings.api';
import { useKitchen } from '@/services/hooks/useFood';
import { useRememberTableBooking, useTableChoices, useTableSlots } from '@/services/hooks/useTableBookings';
import {
  AREA_LABEL,
  SEATING_LABEL,
  type AreaPreference,
  type SeatingPreference,
  type TableSlot,
  type TableSlotsReason,
} from '@/types/food';

/** The server's own ceiling, used only until the floor has said its own. */
const DEFAULT_MAX_PARTY = 10;
const DEFAULT_GUESTS = 2;
const NOTE_MAX = 300;
/** The server's slot step — a sitting starts on the hour or the half hour. */
const SLOT_STEP = 30;
/** How many nearby free times to offer when the one picked is not free. */
const NEAREST_SHOWN = 3;

const minutesOfTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60) + m;
};
const timeOfMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/** "7:30 pm" — the server's own wording, for a time it did not label. */
const clockLabel = (hhmm: string) => {
  const total = minutesOfTime(hhmm);
  const h = Math.floor(total / 60);
  return `${((h + 11) % 12) + 1}:${String(total % 60).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
};

/**
 * When tables can be booked that day, as runs of consecutive slots —
 * "11:00 am – 2:00 pm and 6:00 pm – 10:00 pm" for a restaurant that closes
 * between lunch and dinner.
 */
function bookingWindows(slots: readonly TableSlot[]): string {
  const runs: [TableSlot, TableSlot][] = [];
  for (const slot of slots) {
    const last = runs[runs.length - 1];
    if (last && minutesOfTime(slot.time) - minutesOfTime(last[1].time) === SLOT_STEP) last[1] = slot;
    else runs.push([slot, slot]);
  }
  const words = runs.map(([from, to]) => (from === to ? from.label : `${from.label} – ${to.label}`));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '';
}

/** The free slots closest to a time, nearest first. */
function nearestFree(slots: readonly TableSlot[], asked: string): TableSlot[] {
  const at = minutesOfTime(asked);
  return slots
    .filter((slot) => slot.available)
    .sort((a, b) => Math.abs(minutesOfTime(a.time) - at) - Math.abs(minutesOfTime(b.time) - at)
      || minutesOfTime(a.time) - minutesOfTime(b.time))
    .slice(0, NEAREST_SHOWN)
    .sort((a, b) => minutesOfTime(a.time) - minutesOfTime(b.time));
}

/** A 10-digit Indian mobile, as the server checks it. */
const MOBILE = /^[6-9]\d{9}$/;

/**
 * Why a day has nothing to pick, in one sentence.
 *
 * The server sends a code and this says it; the code is never shown. `FULL` is
 * the one case with a grid under it — every slot there, every one taken.
 */
function reasonSentence(reason: TableSlotsReason, guests: number, maxParty: number): string {
  switch (reason) {
    case 'NOT_OFFERED':
      return 'This restaurant does not take table bookings.';
    case 'PAUSED':
      return 'Not taking table bookings right now. Try again later.';
    case 'OUT_OF_RANGE':
      return 'That day cannot be booked. Pick one of the days above.';
    case 'BAD_PARTY':
      return 'Choose how many guests are coming.';
    case 'PARTY_TOO_LARGE':
      return `Bookings here are for up to ${maxParty} guests.`;
    case 'CLOSED_THAT_DAY':
      return 'The restaurant is not taking bookings that day. Try another day.';
    case 'NO_SLOTS':
      return 'No times left to book that day. Try another day.';
    case 'FULL':
      return `Every table for ${guests} is booked that day. Try another day, or fewer guests.`;
  }
}

/** The dialog title for each refusal the booking can meet. The message is the server's. */
const REFUSAL_TITLE: Record<string, string> = {
  SLOT_FULL: 'That time has just gone',
  PARTY_TOO_LARGE: 'Too many guests for one booking',
  CLOSED_THAT_DAY: 'Closed for bookings that day',
  BAD_TIME: 'Pick another time',
  BAD_DATE: 'Pick another day',
  BAD_PARTY: 'How many guests?',
  PAUSED: 'Not taking bookings right now',
  NOT_OFFERED: 'No table bookings here',
  NOT_FOUND: 'We could not find this restaurant',
  ALREADY_BOOKED: 'You already have a table here',
  TOO_MANY: 'Too many bookings at once',
  BUSY: 'Lots of people are booking',
  TABLE_TAKEN: 'That table has just gone',
  BAD_TABLE: 'Pick another table',
};

/** Refusals after which the grid on screen is out of date and the pick is void. */
const STALE_GRID = new Set(['SLOT_FULL', 'BAD_TIME', 'BAD_DATE', 'CLOSED_THAT_DAY', 'PAUSED', 'NOT_OFFERED', 'PARTY_TOO_LARGE']);

/**
 * Book a table — how many, which day, what time, and who for.
 *
 * ## The slots are the server's, every time
 *
 * Nothing on this screen works out a slot. The calendar allows only the
 * server's `dates`; the clock's pick is snapped to the half hour and checked
 * against its `slots`, re-read whenever the day or the party size changes,
 * because a table that seats two at 8 pm may not seat six. A time that is
 * taken or outside the hours is said so, with the nearest free times to tap.
 * A slot somebody else takes while this screen is open is refused at submit
 * (`SLOT_FULL`) — the slots are then read again and the pick cleared, rather
 * than the diner being left on a time that no longer exists.
 *
 * ## A table number is optional
 *
 * Once a time is picked, the tables the party may sit at then — those seating
 * it with at most two seats to spare — are offered by number, booked ones
 * shown and not tappable. "Any table" is the default, and gives the smallest
 * free table. A table taken between seeing it and sending is refused
 * (`TABLE_TAKEN`), the list read again and the pick put back to any table.
 *
 * ## A preference is a wish
 *
 * AC / Non-AC and Indoor / Outdoor are offered only where the restaurant has
 * BOTH, and labelled as a request. The server drops any preference the floor
 * cannot meet; promising one here would be promising for the restaurant.
 *
 * ## Signing in waits for the button
 *
 * Browsing slots needs no account. "Request table" goes through
 * `requireSignIn`, which comes back to this screen with every choice still on
 * it and sends the request then.
 */
export default function BookTableScreen() {
  const { colors, space, layout, radius, touch, mode } = useTheme();
  const router = useRouter();
  const actionInset = useBottomEdgeInset();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, requireSignIn } = useAuth();
  const { alert } = useAlert();
  const { findKitchen } = useFoodCatalogue();
  const remember = useRememberTableBooking();

  const [date, setDate] = useState<string | null>(null);
  const [guests, setGuests] = useState(DEFAULT_GUESTS);
  const [time, setTime] = useState<string | null>(null);
  /* A time the clock landed on that cannot be booked — taken, or outside the
     hours — kept so the screen can say which and offer the nearest free ones. */
  const [miss, setMiss] = useState<{ asked: string; outside: boolean } | null>(null);
  const [seating, setSeating] = useState<SeatingPreference | null>(null);
  const [area, setArea] = useState<AreaPreference | null>(null);
  const [forSomeoneElse, setForSomeoneElse] = useState(false);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  /* The diner's own name, asked only when the account has none — or when the
     server says so (`NAME_REQUIRED`), which is the authority on it. */
  const [ownName, setOwnName] = useState('');
  const [askOwnName, setAskOwnName] = useState(false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{ ownName?: string; guestName?: string; guestPhone?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  /* One request at a time. State alone lets two taps in the same frame both
     through, and the second is refused ALREADY_BOOKED by the first. */
  const inFlight = useRef(false);

  const grid = useTableSlots(id, date, guests);
  /* A table number, or null for any table. */
  const [table, setTable] = useState<string | null>(null);
  /* The restaurant's own photos, so a diner choosing a table can see the room.
     Same cache entry as the kitchen's page, so one already opened costs nothing. */
  const kitchenRead = useKitchen(id);
  const photos = kitchenRead.data?.kitchen.gallery ?? (id ? findKitchen(id)?.gallery : undefined) ?? [];
  const data = grid.data;
  const floor = data?.dineIn ?? null;
  const maxParty = floor && floor.maxPartySize > 0 ? floor.maxPartySize : DEFAULT_MAX_PARTY;
  /* The day on screen: the one picked, or the one the server started on. */
  const pickedDate = date ?? data?.date ?? null;
  /* While the next day's slots load the clock is shut — the slots still in
     hand belong to a day or a party size that is no longer chosen. */
  const stale = grid.isPlaceholderData;
  const slots = data?.slots ?? [];
  const reason = stale ? null : data?.reason ?? null;

  const offerSeating = floor?.acSeating === 'both';
  const offerArea = !!floor?.indoorSeating && !!floor?.outdoorSeating;
  const needOwnName = !forSomeoneElse && (askOwnName || (!!user && !user.name?.trim()));
  const bookable = !!floor && floor.available && !floor.paused;

  /* A floor smaller than the party already chosen: come down to what it seats
     rather than asking for a grid the server will answer PARTY_TOO_LARGE. */
  useEffect(() => {
    if (floor && floor.maxPartySize > 0 && guests > floor.maxPartySize) setGuests(floor.maxPartySize);
  }, [floor, guests]);

  /* A picked time the fresh grid no longer offers is no longer a pick. */
  useEffect(() => {
    if (!time || stale || !data) return;
    if (!data.slots.some((slot) => slot.time === time && slot.available)) setTime(null);
  }, [data, stale, time]);

  /* A different day or party is a different set of free times. */
  useEffect(() => {
    setMiss(null);
  }, [pickedDate, guests]);

  /* The tables at the picked time — and a picked table that is no longer
     free there, or no longer offered, goes back to any table. */
  const choices = useTableChoices(id, pickedDate, guests, time);
  const tableOptions = choices.data ?? [];
  useEffect(() => {
    setTable(null);
  }, [pickedDate, guests, time]);
  useEffect(() => {
    if (!table || !choices.data) return;
    if (!choices.data.some((option) => option.number === table && option.available)) setTable(null);
  }, [choices.data, table]);

  const pickDate = (next: string) => {
    if (next === pickedDate) return;
    setDate(next);
    setTime(null);
  };

  /*
   * What the clock said, made a booking time.
   *
   * Snapped to the nearest half hour (Android's clock face cannot step), then
   * held against the day's slots: a free one is the pick; anything else is a
   * miss, said with the nearest free times beside it.
   */
  const pickTime = (raw: string) => {
    const asked = timeOfMinutes(Math.round(minutesOfTime(raw) / SLOT_STEP) * SLOT_STEP);
    const slot = slots.find((entry) => entry.time === asked);
    if (slot?.available) {
      setTime(asked);
      setMiss(null);
      return;
    }
    setTime(null);
    setMiss({ asked, outside: !slot });
  };

  /* The clock's bounds are the day's first and last slot — a time outside
     them is pulled to the nearer end. A gap between lunch and dinner is
     inside them, and is the miss check's to say. */
  const firstSlot = slots[0]?.time ?? null;
  const lastSlot = slots[slots.length - 1]?.time ?? null;
  const nearest = miss ? nearestFree(slots, miss.asked) : [];
  const firstDay = data?.dates[0]?.date ?? null;
  const lastDay = data?.dates[data.dates.length - 1] ?? null;

  const slotLabel = slots.find((slot) => slot.time === time)?.label;
  const dayLabel = data?.dates.find((entry) => entry.date === pickedDate)?.label;

  /** What the form can catch before the server has to. */
  const check = (): boolean => {
    const next: typeof errors = {};
    if (forSomeoneElse) {
      if (guestName.trim().length < 2) next.guestName = 'Whose name should the table be under?';
      if (!MOBILE.test(guestPhone)) next.guestPhone = 'Enter their 10-digit mobile number.';
    } else if (needOwnName && ownName.trim().length < 2) {
      next.ownName = 'Whose name should the table be under?';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** A refusal, handled by its code and told in the server's own words. */
  const refused = async (err: unknown) => {
    const apiError = err instanceof ApiError ? err : null;
    const code = apiError?.code ?? '';
    const message = apiError ? apiError.displayMessage : (err as Error)?.message || 'The booking did not go through.';

    if (code === 'NAME_REQUIRED') {
      setAskOwnName(true);
      setErrors({ ownName: message });
      return;
    }
    if (code === 'BAD_PHONE') {
      setErrors({ guestPhone: message });
      return;
    }

    if (STALE_GRID.has(code)) {
      setTime(null);
      void grid.refetch();
    }
    if (code === 'TABLE_TAKEN' || code === 'BAD_TABLE') {
      setTable(null);
      void choices.refetch();
    }

    void alert({
      title: REFUSAL_TITLE[code] ?? 'The booking did not go through',
      message,
      tone: code === 'BUSY' || !apiError || apiError.isNetwork ? 'warning' : 'error',
    });
  };

  const send = async (request: BookTableRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const booking = await bookTable(request);
      remember(booking);
      /* `replace`: Back from the booking returns to the kitchen, not to a
         form for a table that has already been asked for. */
      router.replace(foodHref.tableBooking(booking.reference));
    } catch (err) {
      await refused(err);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  const submit = () => {
    if (!id || !pickedDate || !time || !check()) return;
    const request: BookTableRequest = {
      restaurantId: id,
      date: pickedDate,
      time,
      guests,
      ...(table ? { table } : null),
      ...((offerSeating && seating) || (offerArea && area)
        ? {
          preference: {
            ...(offerSeating && seating ? { seating } : null),
            ...(offerArea && area ? { area } : null),
          },
        }
        : null),
      ...(note.trim() ? { note: note.trim() } : null),
      ...(forSomeoneElse
        ? { forSomeoneElse: true, guestName: guestName.trim(), guestPhone }
        : needOwnName && ownName.trim()
          ? { guestName: ownName.trim() }
          : null),
    };
    requireSignIn(() => { void send(request); });
  };

  const title = data?.restaurantName || (id ? findKitchen(id)?.name : undefined) || '';

  /* ── Before there is a grid ─────────────────────────────────────────── */

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Book a table" subtitle={title || undefined} onBack={() => router.back()} />
        {grid.isPending && !grid.error ? (
          <FoodMenuSkeleton />
        ) : grid.error instanceof ApiError && grid.error.status === 404 ? (
          <FoodEmptyState
            glyph="dining"
            title="This restaurant is not on LAMPOSE"
            body="It may have been removed while you were looking at it."
            primaryLabel="Back"
            onPrimary={() => router.back()}
          />
        ) : (
          <FoodEmptyState
            glyph="dining"
            tone="problem"
            title="Could not load the tables"
            body="The restaurant is probably fine — this is usually the connection."
            primaryLabel="Try again"
            onPrimary={() => { void grid.refetch(); }}
            secondaryLabel="Back"
            onSecondary={() => router.back()}
            footnote={grid.error instanceof ApiError ? grid.error.displayMessage : undefined}
          />
        )}
      </View>
    );
  }

  /* No floor, or a paused one: there is nothing to pick, so there is no form
     — only the reason, and the way back to the menu. */
  if (!floor || !bookable) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <StandardHeader title="Book a table" subtitle={title || undefined} onBack={() => router.back()} />
        <FoodEmptyState
          glyph="dining"
          title={floor ? 'Not taking table bookings right now' : 'No table bookings here'}
          body={floor
            ? 'Try again later. You can still order from the menu.'
            : `${title || 'This restaurant'} does not take table bookings. You can still order from its menu.`}
          primaryLabel="Back"
          onPrimary={() => router.back()}
          secondaryLabel={floor ? 'Check again' : undefined}
          onSecondary={floor ? () => { void grid.refetch(); } : undefined}
        />
      </View>
    );
  }


  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <StandardHeader title="Book a table" subtitle={title || undefined} onBack={() => router.back()} />

      <KeyboardAwareScrollViewCompat
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: layout.gutter, paddingBottom: space[8], gap: space[5] }}
      >
        {photos.length ? (
          <View style={{ marginHorizontal: -layout.gutter }}>
            <FoodPhotoStrip
              title="The restaurant"
              uris={photos}
              gutter={layout.gutter}
              provenance={`Photos from ${title || 'the restaurant'}`}
            />
          </View>
        ) : null}

        {/* ── How many ─────────────────────────────────────────────────── */}
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Guests
          </Text>
          <View style={styles.guestRow}>
            <View style={{ flex: 1 }}>
              <Text variant="title3">
                {guests} {guests === 1 ? 'guest' : 'guests'}
              </Text>
              <Text variant="caption" color="tertiary">
                Up to {maxParty} per booking
              </Text>
            </View>
            <Stepper value={guests} onChange={setGuests} min={1} max={maxParty} accessibilityLabel="guests" />
          </View>
        </View>

        {/* ── Which day ────────────────────────────────────────────────── */}
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Day
          </Text>
          <DateField
            value={pickedDate}
            onChange={pickDate}
            placeholder="Pick a day"
            minimumDate={firstDay}
            maximumDate={lastDay?.date ?? null}
            accessibilityLabel="Day of your booking"
          />
          {lastDay ? (
            <Text variant="caption" color="tertiary">
              {dayLabel && dayLabel !== lastDay.label ? `${dayLabel} · ` : ''}Tables can be booked up to {lastDay.label}.
            </Text>
          ) : null}
        </View>

        {/* ── What time ────────────────────────────────────────────────── */}
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Time
          </Text>

          {reason ? (
            <FoodNotice tone="info" title={reasonSentence(reason, guests, maxParty)} />
          ) : slots.length === 0 ? (
            stale ? <Skeleton height={touch.min} radius={radius.card} /> : null
          ) : (
            <>
              <TimeField
                value={time}
                onChange={pickTime}
                placeholder="Pick a time"
                minHour={Math.floor(minutesOfTime(firstSlot ?? '00:00') / 60)}
                maxHour={Math.floor(minutesOfTime(lastSlot ?? '23:00') / 60)}
                minTime={firstSlot}
                maxTime={lastSlot}
                minuteInterval={SLOT_STEP}
                disabled={stale}
                accessibilityLabel="Time of your booking"
              />
              {miss && !stale ? (
                <FoodNotice
                  tone="deadline"
                  title={miss.outside
                    ? `${clockLabel(miss.asked)} is outside booking hours`
                    : `${clockLabel(miss.asked)} is fully booked for ${guests}`}
                  body={nearest.length ? 'Nearest free times:' : 'Nothing else is free that day. Try another day, or fewer guests.'}
                />
              ) : null}
              {miss && !stale && nearest.length ? (
                <View style={[styles.wrap, { gap: space[2] }]}>
                  {nearest.map((slot) => (
                    <PreferenceChip
                      key={slot.time}
                      label={slot.label}
                      on={false}
                      role="button"
                      onPress={() => pickTime(slot.time)}
                    />
                  ))}
                </View>
              ) : null}
              <Text variant="caption" color="tertiary">
                Bookable {bookingWindows(slots)}, on the hour and half hour. A table is held for 90 minutes from your time.
              </Text>
            </>
          )}
        </View>

        {/* ── Which table, once there is a time ────────────────────────── */}
        {time && !reason ? (
          <View style={{ gap: space[2] }}>
            <Text variant="eyebrow" color="tertiary">
              Table
            </Text>
            {choices.isPending ? (
              <Skeleton height={44} radius={radius.pill} />
            ) : (
              <View style={[styles.wrap, { gap: space[2] }]}>
                <TableChip label="Any table" detail="Best fit" on={table === null} onPress={() => setTable(null)} />
                {tableOptions.map((option) => (
                  <TableChip
                    key={option.number}
                    label={option.number}
                    detail={option.available ? `${option.seats} seats` : 'Booked'}
                    on={table === option.number}
                    disabled={!option.available}
                    onPress={() => setTable(option.number)}
                  />
                ))}
              </View>
            )}
            <Text variant="caption" color="tertiary">
              {table
                ? `You are asking for table ${table}. The restaurant confirms it with your booking.`
                : 'Pick a table by its number, or leave it to us — you get the smallest free table that seats your party.'}
            </Text>
          </View>
        ) : null}

        {/* ── Seating, where there is a choice ─────────────────────────── */}
        {offerSeating || offerArea ? (
          <View style={{ gap: space[2] }}>
            <View>
              <Text variant="eyebrow" color="tertiary">
                Seating preference
              </Text>
              <Text variant="caption" color="tertiary">
                On request — not guaranteed
              </Text>
            </View>
            {offerSeating ? (
              <View style={[styles.wrap, { gap: space[2] }]}>
                {(['ac', 'non_ac'] as const).map((value) => (
                  <PreferenceChip
                    key={value}
                    label={SEATING_LABEL[value]}
                    on={seating === value}
                    onPress={() => setSeating((current) => (current === value ? null : value))}
                  />
                ))}
              </View>
            ) : null}
            {offerArea ? (
              <View style={[styles.wrap, { gap: space[2] }]}>
                {(['indoor', 'outdoor'] as const).map((value) => (
                  <PreferenceChip
                    key={value}
                    label={AREA_LABEL[value]}
                    on={area === value}
                    onPress={() => setArea((current) => (current === value ? null : value))}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Who the table is for ─────────────────────────────────────── */}
        <View style={{ gap: space[2] }}>
          <Text variant="eyebrow" color="tertiary">
            Who is it for
          </Text>
          <Checkbox
            label="Booking for someone else"
            checked={forSomeoneElse}
            onChange={(next) => {
              setForSomeoneElse(next);
              setErrors({});
            }}
            accent="link"
          />
          {forSomeoneElse ? (
            <View style={{ gap: space[3] }}>
              <TextField
                label="Guest's name"
                value={guestName}
                onChangeText={(value) => {
                  setGuestName(value);
                  if (errors.guestName) setErrors((current) => ({ ...current, guestName: undefined }));
                }}
                error={errors.guestName}
                autoCapitalize="words"
                maxLength={60}
                returnKeyType="next"
              />
              <TextField
                label="Guest's mobile"
                value={guestPhone}
                onChangeText={(value) => {
                  setGuestPhone(value.replace(/\D/g, '').slice(0, 10));
                  if (errors.guestPhone) setErrors((current) => ({ ...current, guestPhone: undefined }));
                }}
                error={errors.guestPhone}
                helper="The restaurant may call them about the table."
                prefix="+91"
                keyboardType="phone-pad"
                maxLength={10}
              />
            </View>
          ) : needOwnName ? (
            <TextField
              label="Name for the table"
              value={ownName}
              onChangeText={(value) => {
                setOwnName(value);
                if (errors.ownName) setErrors((current) => ({ ...current, ownName: undefined }));
              }}
              error={errors.ownName}
              helper="Your account has no name yet. The restaurant asks for this one."
              autoCapitalize="words"
              maxLength={60}
            />
          ) : user?.name ? (
            <Text variant="caption" color="tertiary">
              The table will be under {user.name}.
            </Text>
          ) : null}
        </View>

        {/* ── Anything else ────────────────────────────────────────────── */}
        <TextField
          label="Note for the restaurant"
          value={note}
          onChangeText={setNote}
          placeholder="A birthday, a high chair, anything else"
          multiline
          maxLength={NOTE_MAX}
          showCount
          optional
        />

        <DineInFacilities floor={floor} />
      </KeyboardAwareScrollViewCompat>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: layout.gutter,
            paddingTop: space[3],
            paddingBottom: space[6] + actionInset,
            gap: space[1],
          },
        ]}
      >
        <Button
          label={time && slotLabel ? `Request ${table ? `table ${table}` : 'table'} · ${[dayLabel, slotLabel].filter(Boolean).join(', ')}` : 'Pick a time'}
          fullWidth
          loading={submitting}
          loadingLabel="Sending…"
          disabled={!time || stale || submitting}
          onPress={submit}
        />
        <Text variant="caption" color="tertiary" style={styles.center}>
          The restaurant has 15 minutes to confirm. Nothing to pay now.
        </Text>
      </View>
    </View>
  );
}

/** One table on offer: its number, and its seats or that it is booked. */
function TableChip({
  label,
  detail,
  on,
  disabled = false,
  onPress,
}: {
  label: string;
  detail: string;
  on: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled }}
      accessibilityLabel={`${label}, ${detail}`}
      style={[
        styles.tableChip,
        {
          borderRadius: radius.button,
          paddingHorizontal: space[3],
          backgroundColor: disabled ? colors.surfaceSunken : on ? colors.link.tint : colors.surface,
          borderColor: disabled ? colors.borderSubtle : on ? colors.link.base : colors.border,
          borderWidth: on ? 1.5 : 1,
        },
      ]}
    >
      <Text
        variant={on ? 'bodyStrong' : 'body'}
        style={{
          color: disabled ? colors.textTertiary : on ? colors.link.ink : colors.textPrimary,
          textDecorationLine: disabled ? 'line-through' : 'none',
        }}
      >
        {label}
      </Text>
      <Text variant="numMeta" style={{ color: disabled ? colors.textTertiary : on ? colors.link.ink : colors.textSecondary }}>
        {detail}
      </Text>
    </Pressable>
  );
}

/**
 * One preference option. Tapping the picked one again un-picks it — a wish is
 * optional. As a `button` it is a suggested time instead: one tap, the pick.
 */
function PreferenceChip({
  label,
  on,
  onPress,
  role = 'checkbox',
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  role?: 'checkbox' | 'button';
}) {
  const { colors, space, radius } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={role === 'checkbox' ? { checked: on } : undefined}
      accessibilityLabel={role === 'checkbox' ? `${label}, on request` : `Book ${label}`}
      style={[
        styles.dateChip,
        {
          borderRadius: radius.pill,
          paddingHorizontal: space[4],
          backgroundColor: on ? colors.link.tint : colors.surface,
          borderColor: on ? colors.link.base : colors.border,
          borderWidth: on ? 1.5 : 1,
        },
      ]}
    >
      <Text variant={on ? 'bodyStrong' : 'body'} style={{ color: on ? colors.link.ink : colors.textPrimary }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  guestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dateChip: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tableChip: { minHeight: 48, minWidth: 72, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  center: { textAlign: 'center' },
});
