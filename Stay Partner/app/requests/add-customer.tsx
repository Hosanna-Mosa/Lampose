import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Screen,
  Text,
  Button,
  IconButton,
  Input,
  PhoneField,
  PHONE_LENGTH,
  Select,
  Segmented,
  VerificationCodeField,
} from '@/components/ui';
import { DocumentsChecklist, type DocumentEntry } from '@/components/DocumentsChecklist';
import { formatDateInput, formatDateLong, parseDateInput } from '@/lib/format';
import { ApiError } from '@/services/api/client';
import { createBooking } from '@/services/api/addCustomer.api';
import { createInviteApi } from '@/services/api/domain.api';
import { fetchMyProperties, type BackendListing } from '@/services';
import { radius } from '@/constants/layout';
import { useColors } from '@/hooks/useColors';

/**
 * Reached from Requests → Confirmed, or from Home's "Add a customer" card,
 * for a guest the owner already knows — a walk-in, a phone booking, or a
 * visit request that was confirmed over WhatsApp and now needs logging.
 * Saving drops them into the same records list either way, so there's one
 * list, not two.
 *
 * `guestName`/`guestPhone` route params pre-fill the top two fields when
 * arriving from a confirmed request — that number is already proven (the
 * customer's own OTP, at request time), but this form still runs its own
 * verification below: that proof lives in a different system
 * (`VisitRequest` vs. `GuestVerification`), and `createBooking` only ever
 * accepts the latter. The owner can also correct a mis-heard name here same
 * as any other field.
 *
 * Always the manual-entry form: a record added by hand has no LAMPOSE
 * account to read KYC from, so `fromApp` is always false here.
 *
 * ## Category, not room type
 *
 * There used to be a "Room type" picker here backed by two invented options
 * ("Deluxe Double", "Family Suite") — not real inventory, since no sharing
 * or pricing model exists yet (see `lib/inventory.ts`). It is replaced by the
 * property's own category (Hostel / PG / Bachelor Room / …), read-only: that
 * is a fact about the property, set once at onboarding, not something that
 * changes guest to guest.
 *
 * PG is the one exception. Its onboarding form (`PropertyCategoryFields`)
 * records several sharing options with their own rent each — "Single" at one
 * price, "2 Sharing" at another — rather than a single fact, so that is a
 * real per-guest question the other categories don't have. When a PG has any
 * configured, a "Sharing type" picker appears, sourced from the property's
 * own `categoryDetails.sharingTypes` rather than a generic list, and picking
 * one pre-fills the rent field below from `categoryDetails.sharingPrices` —
 * still editable, since a walk-in rate can differ from the listed one. If
 * that sharing type also has AC configured as an option
 * (`categoryDetails.sharingAC`), an AC/non-AC toggle appears too, switching
 * the pre-fill between `sharingPrices` and `sharingAcPrices`.
 *
 * ## Check-in only
 *
 * There is no Check-out field. A PG/hostel stay is ordinarily open-ended at
 * move-in — declaring an end date here never drove anything real anyway,
 * since the actual end of a stay is `checkOutBookingApi`, an owner action
 * taken later, not a date arriving. `guests` is gone too — the Customers
 * list still shows it for records that already have one, but new ones simply
 * won't.
 *
 * ## Documents, not digital KYC
 *
 * An Aadhar number and a photograph used to be required here. Neither is
 * collected any more — the owner instead notes which physical documents they
 * have actually seen (Aadhar card, PAN, whatever fits the guest in front of
 * them) and ticks each one. See `components/DocumentsChecklist.tsx`. The
 * phone-OTP verification below is unrelated and unchanged: it proves the
 * guest's number is reachable, which is a different question from what
 * identity document they showed.
 *
 * ## The invite step after saving
 *
 * This used to route straight to Customers on save. Inviting this same guest
 * to the User App now happens right here, right after — not as a separate
 * action buried in Refer & earn — because their phone number is already
 * sitting right there, already proven, with no second OTP needed: see
 * `Backend/src/modules/partners/customerReferral.controller.js`'s
 * `bookingId` path.
 */
export default function AddCustomerScreen() {
  const router = useRouter();
  const c = useColors();
  const params = useLocalSearchParams<{ guestName?: string; guestPhone?: string }>();

  const [name, setName] = useState(() => params.guestName ?? '');
  const [phone, setPhone] = useState(() => String(params.guestPhone ?? '').replace(/\D/g, '').slice(-10));
  const [checkInDigits, setCheckInDigits] = useState('');
  const [address, setAddress] = useState('');
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Which property this booking belongs to, and its category. Auto-picked
     silently when there is only one — the common case — otherwise the owner
     chooses. Without this, every booking landed on `propertyId: 'unassigned'`
     server-side, which is exactly what an invite generated from it would
     have said too: "via Unassigned property" is not a reward message worth
     sending. */
  const [properties, setProperties] = useState<BackendListing[] | null>(null);
  const [propertiesError, setPropertiesError] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const list = await fetchMyProperties();
        if (!active) return;
        setProperties(list);
        if (list.length === 1) setPropertyName(list[0].name ?? null);
      } catch (err) {
        if (!active) return;
        setPropertiesError(err instanceof ApiError ? err.displayMessage : 'We could not load your properties.');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const propertyOptions = (properties ?? []).map((p) => p.name ?? '').filter(Boolean);
  const selectedProperty = (properties ?? []).find((p) => p.name === propertyName);
  const propertyId = selectedProperty?.id ?? selectedProperty?._id ?? null;
  const category = selectedProperty?.category ?? null;
  /* Only a real gate when there is something to choose from — zero properties
     is a genuine edge case, and the save should not be blocked on it. */
  const propertyReady = !properties || properties.length === 0 || Boolean(propertyId);

  /* PG's onboarding form is the one category where the property records
     several options rather than one fact — "Single" at one rent, "2 Sharing"
     at another. `details` is `categoryDetails`, the same free-shape object
     `PropertyCategoryFields` writes during onboarding; nothing here is
     validated beyond "is it there" for the same reason it isn't there either. */
  const propertyDetails = (selectedProperty?.details ?? {}) as Record<string, any>;
  const sharingTypes: string[] =
    category === 'PG' && Array.isArray(propertyDetails.sharingTypes) ? propertyDetails.sharingTypes : [];
  const sharingPrices: Record<string, number> =
    propertyDetails.sharingPrices && typeof propertyDetails.sharingPrices === 'object'
      ? propertyDetails.sharingPrices
      : {};
  /* Whether AC is even an option for a given sharing type, and its separate
     rent when it is — both set per-type during onboarding, same shape
     `PropertyCategoryFields` writes them in. */
  const sharingAC: Record<string, boolean> =
    propertyDetails.sharingAC && typeof propertyDetails.sharingAC === 'object' ? propertyDetails.sharingAC : {};
  const sharingAcPrices: Record<string, number> =
    propertyDetails.sharingAcPrices && typeof propertyDetails.sharingAcPrices === 'object'
      ? propertyDetails.sharingAcPrices
      : {};

  const [sharingType, setSharingType] = useState<string | null>(null);
  const [isAC, setIsAC] = useState(false);
  const [amount, setAmount] = useState('');

  const acOffered = Boolean(sharingType && sharingAC[sharingType]);

  const fillAmountFor = (type: string, ac: boolean) => {
    const price = ac ? sharingAcPrices[type] : sharingPrices[type];
    if (typeof price === 'number') setAmount(String(price));
  };

  const pickSharingType = (type: string) => {
    setSharingType(type);
    setIsAC(false);
    fillAmountFor(type, false);
  };

  const pickAC = (next: boolean) => {
    setIsAC(next);
    if (sharingType) fillAmountFor(sharingType, next);
  };

  /* Only required when there is actually something to pick — a PG that never
     configured sharing types at onboarding has nothing here to require. */
  const sharingTypeReady = sharingTypes.length === 0 || Boolean(sharingType);

  /* ── The invite step, after a save ─────────────────────────────────────── */
  const [savedBooking, setSavedBooking] = useState<{ id: string; guestName: string } | null>(null);
  const [invite, setInvite] = useState<{ code: string; expiresAt: string; propertyName: string } | null>(null);
  const [generatingInvite, setGeneratingInvite] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const checkIn = parseDateInput(checkInDigits);

  /*
   * A calendar-valid date is not the same as a plausible one.
   *
   * `parseDateInput` is already strict about the calendar — it rejects 31/02,
   * 29/02 in a non-leap year, month 13, day 00. What it cannot judge is the
   * YEAR, and that is where the typo people actually make lives: 2062 for
   * 2026 is an ordinary-looking date thirty-six years out, and it used to save
   * without a murmur.
   *
   * The same bounds are enforced server-side, which is the real check — these
   * exist so the owner is told while they are still looking at the field
   * rather than after pressing Save with a guest waiting.
   */
  const MAX_BACKDATE_DAYS = 365;
  const MAX_FUTURE_DAYS = 730;
  const DAY_MS = 24 * 60 * 60 * 1000;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const daysFromToday = (d: Date) => Math.round((d.getTime() - today.getTime()) / DAY_MS);

  const checkInError = (() => {
    if (checkInDigits.length !== 8) return undefined;
    if (!checkIn) return 'Not a real date.';
    const offset = daysFromToday(checkIn);
    /* Backdating is allowed a year: logging a walk-in late is ordinary. */
    if (offset < -MAX_BACKDATE_DAYS) return 'More than a year ago — check the year.';
    if (offset > MAX_FUTURE_DAYS) return 'More than two years away — check the year.';
    return undefined;
  })();

  const documentCollected = documents.some((d) => d.collected);

  const canSave =
    name.trim().length > 0 &&
    phone.length === PHONE_LENGTH &&
    Boolean(category) &&
    Boolean(checkIn) &&
    !checkInError &&
    address.trim().length > 0 &&
    documentCollected &&
    verified &&
    propertyReady &&
    sharingTypeReady &&
    !saving;

  /** `YYYY-MM-DD` — date-only, so no timezone can shift a check-in by a day. */
  const isoDay = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  /**
   * Saves to the database.
   *
   * This used to call `addCustomer` from `lib/requests`, which pushed onto a
   * fixture array in memory — the row appeared in the Approved list and was
   * gone on the next launch, along with the address somebody had just read
   * out.
   *
   * Nothing is optimistic. The record carries a documents checklist and a
   * verified phone number, and an owner who believes a walk-in is logged when
   * it is not is how a guest is turned away at the door.
   */
  const save = async () => {
    if (!canSave || !category || !checkIn) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createBooking({
        guestName: name.trim(),
        guestPhone: `+91${phone}`,
        /* The specific sharing type when the property has one configured and
           the owner picked it — with "(AC)" appended when that variant was
           chosen — otherwise the category itself, the most specific fact
           available. */
        shareType: sharingType ? `${sharingType}${acOffered && isAC ? ' (AC)' : ''}` : category,
        checkInDate: isoDay(checkIn),
        address: address.trim(),
        documents,
        ...(propertyId ? { propertyId, propertyName: propertyName ?? undefined } : {}),
        ...(amount.trim() ? { totalAmount: Number(amount) } : {}),
      });
      /* Offer the invite here rather than dropping straight into Customers —
         see the header note. `finish()` below is what actually leaves. */
      setSavedBooking({ id: result.id, guestName: name.trim() });
    } catch (err) {
      /* The server's own sentence: it is the only thing that knows whether the
         verification had expired or a document was missing. */
      setError(err instanceof ApiError ? err.displayMessage : 'We could not save that.');
    } finally {
      setSaving(false);
    }
  };

  const generateInvite = async () => {
    if (!savedBooking || generatingInvite) return;
    setGeneratingInvite(true);
    setInviteError(null);
    try {
      const data = await createInviteApi({ bookingId: savedBooking.id });
      setInvite({
        code: data.code,
        expiresAt: data.expiresAt,
        propertyName: data.propertyName ?? '',
      });
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.displayMessage : 'We could not generate that invite.');
    } finally {
      setGeneratingInvite(false);
    }
  };

  const shareInvite = () => {
    if (!invite) return;
    const expiry = formatDateLong(new Date(invite.expiresAt));
    Share.share({
      message:
        `You're invited to Lampose! Download the Lampose app and enter code ${invite.code} when you ` +
        `sign up — it's valid until ${expiry} and gets you a discount on your first food order.`,
    }).catch(() => {});
  };

  /*
   * Into Customers, not back where they came from.
   *
   * `back()` returned to the Requests inbox, which does not show this
   * record — so a form that had just succeeded looked like it had done
   * nothing. `replace` rather than `push` so Back from Customers does not
   * reopen a filled-in form that has already been saved.
   */
  const finish = () => router.replace('/customers');

  // ── The invite step, shown after a successful save ─────────────────────
  if (savedBooking) {
    return (
      <Screen
        padX={22}
        contentStyle={styles.stack}
        stickyHeader={
          <Text variant="pageTitleSm" style={styles.title}>
            Customer saved
          </Text>
        }
        footer={
          <Button
            label={invite ? 'Done' : 'Skip, go to Customers'}
            onPress={finish}
            variant={invite ? 'primary' : 'secondary'}
          />
        }
      >
        <Text variant="bodySm" color="textSecondary" style={styles.intro}>
          {savedBooking.guestName} is logged. Invite them to the Lampose app and you get 20 points the
          moment they sign up with the code — no extra verification needed, their number is already
          proven.
        </Text>

        {invite ? (
          <View style={[styles.codeCard, { borderColor: c.borderCard, backgroundColor: c.surface }]}>
            <Text variant="badge" color="textTertiary">
              Code for {savedBooking.guestName}
            </Text>
            <Text variant="cardTitle" tabular style={styles.code}>
              {invite.code}
            </Text>
            <Text variant="bodySm" color="textSecondary">
              {invite.propertyName ? `For ${invite.propertyName} · ` : ''}
              valid until {formatDateLong(new Date(invite.expiresAt))}
            </Text>
            <Button label="Share invite" onPress={shareInvite} icon="send" style={styles.shareButton} />
          </View>
        ) : (
          <Button
            label={generatingInvite ? 'Generating…' : 'Generate invite code'}
            onPress={generateInvite}
            loading={generatingInvite}
            variant="secondary"
          />
        )}

        {inviteError ? (
          <Text variant="badge" color="error" style={styles.saveError}>
            {inviteError}
          </Text>
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen
      padX={22}
            contentStyle={styles.stack}
            footer={<Button label={saving ? 'Saving…' : 'Save customer'} onPress={save} loading={saving} disabled={!canSave} />}
      stickyHeader={
        <>
          <View style={styles.backRow}>
            <IconButton name="chevron-left" label="Go back" onPress={() => router.back()} />
          </View>
        </>
      }
    >

      <Text variant="pageTitleSm" style={styles.title}>
        Add customer
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.intro}>
        Log a guest you already know — a walk-in, a phone booking, a confirmed request — straight into
        your records.
      </Text>

      {propertyOptions.length > 1 ? (
        <>
          <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
            Property
          </Text>
          <View style={styles.field}>
            <Select
              label="Which property is this for?"
              options={propertyOptions}
              value={propertyName}
              onChange={setPropertyName}
              placeholder="Select a property"
            />
          </View>
        </>
      ) : null}
      {propertiesError ? (
        <Text variant="badge" color="error" style={styles.saveError}>
          {propertiesError}
        </Text>
      ) : null}

      {/* Read-only — the category is the property's own, set at onboarding,
          not something that changes from one guest to the next. */}
      {category ? (
        <View style={[styles.categoryCard, { borderColor: c.borderCard, backgroundColor: c.surfaceSunken }]}>
          <Text variant="badge" color="textTertiary">
            Category
          </Text>
          <Text style={[styles.categoryValue, { color: c.textPrimary }]}>{category}</Text>
        </View>
      ) : null}

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Guest details
      </Text>
      <Input
        label="Full name"
        value={name}
        onChangeText={setName}
        placeholder="Guest's full name"
        autoCapitalize="words"
        textContentType="name"
        autoComplete="name"
        containerStyle={styles.field}
      />
      <View style={styles.field}>
        <PhoneField value={phone} onChangeText={setPhone} />
      </View>

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Stay details
      </Text>

      {/* Only for a PG that actually configured sharing types at onboarding —
          the one category where the property offers several priced options
          rather than a single fact. Picking one pre-fills the amount below
          from what was set up for it, still editable for a walk-in rate. */}
      {sharingTypes.length > 0 ? (
        <View style={styles.field}>
          <Select
            label="Sharing type"
            options={sharingTypes}
            value={sharingType}
            onChange={pickSharingType}
            placeholder="Which sharing type is this guest in?"
          />
        </View>
      ) : null}

      {/* Only when this specific sharing type has AC configured as an option
          at onboarding — most don't. */}
      {acOffered ? (
        <View style={styles.field}>
          <Text variant="badge" color="textTertiary" style={styles.acLabel}>
            AC or non-AC?
          </Text>
          <Segmented
            options={['Non-AC', 'AC'] as const}
            value={isAC ? 'AC' : 'Non-AC'}
            onChange={(v) => pickAC(v === 'AC')}
          />
        </View>
      ) : null}

      <Input
        label="Check-in"
        value={formatDateInput(checkInDigits)}
        onChangeText={(t) => setCheckInDigits(t.replace(/\D/g, '').slice(0, 8))}
        placeholder="DD/MM/YYYY"
        keyboardType="number-pad"
        maxLength={10}
        error={checkInError}
        containerStyle={styles.field}
      />
      <Input
        label="Rent / amount (₹)"
        optional
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/\D/g, ''))}
        keyboardType="number-pad"
        placeholder="e.g. 6000"
        containerStyle={styles.field}
      />

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Address
      </Text>
      <Input
        value={address}
        onChangeText={setAddress}
        placeholder="House no., street, area, city, state"
        multiline
        minHeight={80}
        containerStyle={styles.field}
      />

      <Text variant="overline" color="textTertiary" style={styles.sectionLabel}>
        Documents
      </Text>
      <Text variant="bodySm" color="textSecondary" style={styles.docsIntro}>
        Note what you've physically seen — no upload, just a checklist.
      </Text>
      <View style={styles.field}>
        <DocumentsChecklist documents={documents} onChange={setDocuments} />
      </View>

      <VerificationCodeField phone={phone} verified={verified} onVerifiedChange={setVerified} />

      {error ? (
        <Text variant="badge" color="error" style={styles.saveError}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { flex: 1 },
  backRow: { height: 44, justifyContent: 'center', marginLeft: -10, marginBottom: 2 },
  title: { marginBottom: 4 },
  intro: { marginBottom: 18, lineHeight: 19 },
  sectionLabel: { marginTop: 4, marginBottom: 10 },
  field: { marginBottom: 16 },
  saveError: { marginTop: 12 },

  categoryCard: { borderWidth: 1, borderRadius: radius.card, padding: 12, marginBottom: 16, gap: 2 },
  categoryValue: { fontSize: 15, fontWeight: '600' },
  acLabel: { marginBottom: 8 },
  docsIntro: { marginTop: -6, marginBottom: 12, lineHeight: 18 },

  codeCard: { borderWidth: 1, borderRadius: radius.card, padding: 18, gap: 6, marginTop: 8 },
  code: { letterSpacing: 2, marginTop: 2, fontSize: 26 },
  shareButton: { marginTop: 10, alignSelf: 'flex-start' },
});
