import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Aside, Box, FieldSet, Heading, Inline, Input, Label, Legend, PlainButton, Region, Strong, Text,
} from '../components/common/atoms';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { ActiveOrder } from '../components/food/organisms/ActiveOrder';
import { useCart } from '../food/CartProvider';
import { useFoodCatalogue } from '../food/FoodCatalogue';
import { useAuth } from '../auth/AuthProvider';
import { useReveals } from '../hooks/useSite';
import { LocationRefused, locateMe } from '../food/locateMe';
import {
  addAddress, fetchAddressBook, removeAddress, setDefaultAddress, updateAddress,
} from '../api/customerAddressApi';

/* ══ Deliver to ═══════════════════════════════════════════════════════════
   Where is this going?

   The page behind every "Change" on the food surface. It used to point at
   the checkout, which meant that changing an address from the feed — where
   there is no cart yet — landed on "There is nothing to pay for": the right
   refusal to the wrong question, and a control that read as broken.

   ## Choosing here changes the FEED, not just the order

   The address carries a pin, the pin becomes the catalogue's point, and the
   point is what decides which kitchens can reach this door and how far away
   each one is. That is why this page exists away from the checkout at all: a
   diner picks where they are BEFORE they pick what to eat.

   ## One screen adds and corrects

   `editing` is the whole difference — with an id the form loads what is there
   and PATCHes, without one it POSTs. Two forms would be two copies of the same
   eight fields, and the first divergence is always the field somebody added to
   one and forgot on the other. The mobile app's editor is built the same way,
   against these same five routes.

   ## `line1` is the only required field

   Not the pincode, not the city, not a pin. "Block C, Room 214" is a complete
   address to the person who lives there and to the rider who delivers to it,
   and a form that refuses it is a form that loses the order. The server holds
   the same line — see `shared/utils/address.js`.

   ## A door we cannot reach stays in the list, disabled

   With the reason in a sentence. The verdict is per kitchen and only exists
   once there is a cart to judge against; without one, every row is simply a
   row. A hidden address reads as a deleted address.
   ════════════════════════════════════════════════════════════════════════ */

/* What the person calls the place. The server's enum, in the app's order. */
const KINDS = [
  { id: 'room', label: 'Room' },
  { id: 'hostel', label: 'Hostel' },
  { id: 'home', label: 'Home' },
  { id: 'work', label: 'Work' },
  { id: 'gate', label: 'Gate' },
  { id: 'other', label: 'Other' },
];

const BLANK = {
  kind: 'room', label: '', line1: '', line2: '', landmark: '', city: '', pincode: '', instructions: '',
};

/*
 * Two strings that name the same thing. Case and spacing are noise — "block c"
 * and "Block C " are one address — and punctuation is left alone, because
 * "Flat 3-B" and "Flat 3B" are close enough that folding them would start
 * refusing addresses that are genuinely different.
 */
const norm = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

/*
 * Is this the same PLACE as one already in the book?
 *
 * Compared on the four fields that identify a location and deliberately not on
 * `label`, `kind`, `landmark` or `instructions` — those are how somebody
 * DESCRIBES a place, and two rows differing only in their nickname are still
 * one address. Saving twice is what somebody does when they click Save, do not
 * see the list update, and click again.
 */
const samePlace = (a, b) => norm(a.line1) === norm(b.line1)
  && norm(a.line2) === norm(b.line2)
  && norm(a.city) === norm(b.city)
  && norm(a.pincode) === norm(b.pincode);

/* Where "Back" and "Use this address" go. A `next` that does not name a food
   page is ignored rather than followed — the parameter is in the URL, and the
   URL is typed by anybody. */
const safeNext = value => (value && /^\/food(\/|$)/.test(value) ? value : '/food');

/* ── The form, for one address ──────────────────────────────────────────── */

function AddressForm({ addressId, onSaved, onCancel }) {
  const editing = Boolean(addressId);
  const [fields, setFields] = useState(BLANK);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  /*
   * The pin, held apart from the text.
   *
   * `undefined` means "leave whatever is stored alone": an edit that never
   * touches the crosshair must not clear a pin captured last week. `null` is a
   * deliberate clear, which the server reads as "this pin is now wrong".
   */
  const [pin, setPin] = useState(undefined);
  const [hadPin, setHadPin] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');

  const set = (key, value) => setFields(f => ({ ...f, [key]: value }));

  /* The book is fetched and the row picked out of it rather than a read-one
     endpoint: the list call is already cheap, and a second way to get the same
     object is a second thing to keep correct. */
  useEffect(() => {
    if (!editing) return undefined;
    let live = true;
    fetchAddressBook()
      .then(rows => {
        if (!live) return;
        const found = rows.find(a => a.addressId === addressId);
        if (!found) { setError('That address is no longer saved.'); return; }
        setFields({
          kind: found.kind || 'room',
          label: found.label || '',
          line1: found.line1 || '',
          line2: found.line2 || '',
          landmark: found.landmark || '',
          city: found.city || '',
          pincode: found.pincode || '',
          instructions: found.instructions || '',
        });
        setHadPin(Array.isArray(found.location) && found.location.length === 2);
      })
      .catch(err => { if (live) setError(err?.message || 'We could not load that address.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [editing, addressId]);

  const useMyLocation = async () => {
    setError('');
    setNotice('');
    setLocating(true);
    try {
      const found = await locateMe();
      setPin(found.location);

      /* Only a box the geocoder named, and only one that is still empty: a
         person who has typed their flat number does not want it replaced by
         the street the browser thinks they are on. */
      setFields(current => {
        const fill = (have, next) => (String(have || '').trim() ? have : next);
        return {
          ...current,
          line1: fill(current.line1, found.fields.line1),
          landmark: fill(current.landmark, found.fields.landmark),
          city: fill(current.city, found.fields.city),
          pincode: fill(current.pincode, found.fields.pincode),
        };
      });

      setNotice(found.namedNothing
        ? 'Pin dropped. We could not name this spot — type the address and the pin will still guide the rider.'
        : 'Filled from your location. Check it, and add your flat or room number.');
    } catch (err) {
      setError(err instanceof LocationRefused
        ? err.message
        : (err?.message || 'We could not get your location.'));
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    if (!fields.line1.trim()) {
      setError('The first line of the address is needed.');
      return;
    }
    setError('');
    setSaving(true);

    const body = {
      kind: fields.kind,
      label: fields.label.trim(),
      line1: fields.line1.trim(),
      line2: fields.line2.trim(),
      landmark: fields.landmark.trim(),
      city: fields.city.trim(),
      pincode: fields.pincode.trim(),
      instructions: fields.instructions.trim(),
      /* Omitted when the crosshair was not used, so an edit cannot silently
         drop a pin captured earlier. */
      ...(pin === undefined ? null : { location: pin }),
    };

    try {
      /*
       * The book as it is NOW, not as it was when this form opened. The
       * duplicate being guarded against is often one this same person added
       * seconds ago — on another device, or here by clicking Save twice, and a
       * list read at mount cannot see either.
       *
       * A failed check does not block the save: refusing to store somebody's
       * address because a GET failed is a worse outcome than a duplicate row,
       * and the server owns the book anyway.
       */
      let book = [];
      try { book = await fetchAddressBook(); } catch { book = []; }

      const clash = book.find(row => row.addressId !== addressId && samePlace(body, row));
      if (clash) {
        setError(`You have already saved this address as “${(clash.label || '').trim() || clash.line1}”. `
          + 'Edit that one instead, or change something here to tell them apart.');
        setSaving(false);
        return;
      }

      const result = editing
        ? await updateAddress(addressId, body)
        : await addAddress(body);
      await onSaved(result.address);
    } catch (err) {
      /* The SERVER's sentence: it knows things this form does not — that the
         book is full, that a pincode is not a real one — and flattening those
         into "something went wrong" throws away the line that says what to do
         next. */
      setError(err?.message || 'That did not save.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box className="fd-panel fd-panel--lift">
        <Text className="fd-panel__body">Loading that address…</Text>
      </Box>
    );
  }

  const pinState = pin === undefined
    ? (hadPin ? 'Pin saved earlier — a rider can be searched for around this door.' : 'No pin yet. The address alone still works.')
    : (pin === null ? 'Pin removed. The rider gets the address in words.' : 'Pin dropped from your location.');

  return (
    <Box className="fd-panel fd-panel--lift reveal">
      <Box className="fd-panel__head">
        <Heading level={2} className="fd-panel__title">
          {editing ? 'Edit this address' : 'Add an address'}
        </Heading>
        <PlainButton
          type="button"
          className="fd-btn fd-btn--ghost fd-btn--sm"
          onClick={useMyLocation}
          disabled={locating}
        >
          <Icon name="track" className="fd-ico" />
          {locating ? 'Locating…' : 'Use my location'}
        </PlainButton>
      </Box>

      <Box className="fd-pinRow">
        <Icon name="pin" className="fd-ico" />
        <Text className="fd-pinRow__state">{pinState}</Text>
        {(pin || (hadPin && pin === undefined)) && (
          <PlainButton type="button" className="fd-link fd-link--bad" onClick={() => setPin(null)}>
            Remove the pin
          </PlainButton>
        )}
      </Box>

      {notice && <Text className="fd-note" role="status">{notice}</Text>}

      <FieldSet className="fd-field">
        <Legend>What kind of place</Legend>
        <Box className="fd-kinds">
          {KINDS.map(option => (
            <PlainButton
              key={option.id}
              type="button"
              className={`fd-chipBtn fd-chipBtn--sm${fields.kind === option.id ? ' is-on' : ''}`}
              onClick={() => set('kind', option.id)}
            >
              {option.label}
            </PlainButton>
          ))}
        </Box>
      </FieldSet>

      <Box className="fd-fieldRow">
        <Box className="fd-field">
          <Label htmlFor="ad-label">Name it <Inline className="fd-field__opt">optional</Inline></Label>
          <Input
            id="ad-label" type="text" maxLength={40} value={fields.label}
            placeholder="Home, Block C, Mum’s place"
            onChange={e => set('label', e.target.value)}
          />
        </Box>
      </Box>

      <Box className="fd-field">
        <Label htmlFor="ad-line1">Address line 1</Label>
        <Input
          id="ad-line1" type="text" maxLength={120} value={fields.line1}
          placeholder="Block C, Room 214"
          onChange={e => set('line1', e.target.value)}
        />
      </Box>

      <Box className="fd-field">
        <Label htmlFor="ad-line2">Address line 2 <Inline className="fd-field__opt">optional</Inline></Label>
        <Input
          id="ad-line2" type="text" maxLength={120} value={fields.line2}
          placeholder="Building, street"
          onChange={e => set('line2', e.target.value)}
        />
      </Box>

      <Box className="fd-fieldRow">
        <Box className="fd-field">
          <Label htmlFor="ad-landmark">Landmark <Inline className="fd-field__opt">optional</Inline></Label>
          <Input
            id="ad-landmark" type="text" maxLength={80} value={fields.landmark}
            placeholder="Opposite the mess"
            onChange={e => set('landmark', e.target.value)}
          />
        </Box>
        <Box className="fd-field">
          <Label htmlFor="ad-city">City <Inline className="fd-field__opt">optional</Inline></Label>
          <Input
            id="ad-city" type="text" maxLength={60} value={fields.city}
            placeholder="Rajahmundry"
            onChange={e => set('city', e.target.value)}
          />
        </Box>
        <Box className="fd-field fd-field--narrow">
          <Label htmlFor="ad-pincode">Pincode <Inline className="fd-field__opt">optional</Inline></Label>
          <Input
            id="ad-pincode" type="text" inputMode="numeric" maxLength={6} value={fields.pincode}
            placeholder="533101"
            onChange={e => set('pincode', e.target.value)}
          />
        </Box>
      </Box>

      <Box className="fd-field">
        {/* Its own label rather than folded into line 2: it is the single most
            useful thing on a delivery and the field most forms leave out. */}
        <Label htmlFor="ad-inst">Directions for the rider <Inline className="fd-field__opt">optional</Inline></Label>
        <Input
          id="ad-inst" type="text" maxLength={200} value={fields.instructions}
          placeholder="Ring the bell twice, door left of the stairs"
          onChange={e => set('instructions', e.target.value)}
        />
      </Box>

      {error && (
        <Box className="fd-callout fd-callout--bad" role="alert">
          <Icon name="alert" className="fd-ico" />
          <Text>{error}</Text>
        </Box>
      )}

      <Box className="fd-formActions">
        <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : (editing ? 'Save changes' : 'Save address')}
        </PlainButton>
        <PlainButton type="button" className="fd-btn fd-btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </PlainButton>
      </Box>
    </Box>
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

export function FoodAddress() {
  const {
    addresses, addressId, setAddressId, refreshAddresses, kitchen, fulfilment,
  } = useCart();
  const { located, serviceable, kitchensReaching } = useFoodCatalogue();
  const { status, isSignedIn, openSignIn } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  /* Chosen here, committed on the way out: a radio that reordered the feed
     under the page as it was clicked would move what somebody is reading. */
  const [picked, setPicked] = useState(addressId);
  /* `null` is the list; a string is the address being edited; `'new'` is the
     form with nothing in it.

     Read from the URL once, at the first render, so the checkout's "Edit" and
     "Add a new address" can land ON the form rather than on a list the visitor
     has to find their way through a second time. Once, and not on every change
     to the parameters: after that the page owns the state, and re-reading it
     would reopen the form somebody just closed. */
  const [editing, setEditing] = useState(
    () => params.get('edit') || (params.get('new') !== null ? 'new' : null),
  );
  const [busyId, setBusyId] = useState(null);
  /* Removing is asked twice, in the row itself — the app puts the same
     question in a dialog. An address is somebody's home typed out once, and a
     misclick on a link that sits next to "Edit" should not be the end of it. */
  const [confirmId, setConfirmId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setPicked(current => current || addressId); }, [addressId]);
  useReveals([addresses.length, editing]);

  const chosen = useMemo(
    () => addresses.find(a => a.id === picked) || null,
    [addresses, picked],
  );

  /* A radius only means something when a rider has to ride it. On pickup there
     is no delivery area to be outside of, and greying the row out would refuse
     an address for a collection the diner is making themselves. */
  const unreachable = row => fulfilment === 'delivery' && !row.serviceable;

  /* Nothing saved yet: the form IS the page. An empty list with a button under
     it is a screen asking somebody to click the only thing on it. */
  const empty = isSignedIn && !addresses.length;
  const showForm = editing !== null || empty;

  /*
   * `commit` is what tells an ADD from a CORRECTION.
   *
   * Somebody who just typed where they are meant it, so a new address is
   * chosen straight away and the feed behind this page re-measures from it
   * while they are still looking at the list. Fixing the pincode on an address
   * they are not using must not quietly move the order to it.
   */
  const afterWrite = async (savedId, commit) => {
    const rows = await refreshAddresses();
    if (savedId && commit) {
      setPicked(savedId);
      setAddressId(savedId);
    }
    setEditing(null);
    return rows;
  };

  const act = async (id, run) => {
    setError('');
    setBusyId(id);
    try {
      await run();
      await refreshAddresses();
    } catch (err) {
      setError(err?.message || 'That did not work. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (row) => act(row.id, async () => {
    setConfirmId(null);
    await removeAddress(row.id);
    /* The cart picks a new one on its own when the chosen address disappears
       (see CartProvider); this only stops the page pointing at a row that is
       no longer there. */
    if (picked === row.id) setPicked(null);
  });

  const makeDefault = row => act(row.id, () => setDefaultAddress(row.id));

  const use = () => {
    if (!picked) return;
    setAddressId(picked);
    navigate(next);
  };

  /* Still reading the stored session. Not "signed out" — that answer arrives a
     frame later, and printing it here flashes a sign-in panel at somebody who
     is signed in. */
  if (status === 'hydrating') {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Text className="fd-empty__body">Loading your addresses…</Text>
          </Box>
        </Box>
      </Region>
    );
  }

  if (!isSignedIn) {
    return (
      <Region id="food">
        <Box className="sec-inner">
          <Box className="fd-empty fd-empty--page">
            <Heading level={1} className="fd-empty__title">Sign in to save an address</Heading>
            <Text className="fd-empty__body">
              An address belongs to an account — it is what a rider is sent to. Browsing kitchens and
              menus stays open to everyone.
            </Text>
            <PlainButton type="button" className="fd-btn fd-btn--dark" onClick={openSignIn}>Sign in</PlainButton>
            <Link to="/food" className="fd-btn fd-btn--ghost">Browse kitchens</Link>
          </Box>
        </Box>
      </Region>
    );
  }

  return (
    <Region id="food">
      <Box className="sec-inner">

        <ActiveOrder />

        <Box className="fd-pageHead">
          <Box>
            <Link to={next} className="fd-back">
              <Icon name="arrowL" className="fd-ico" />
              Back
            </Link>
            <Heading level={1} className="fd-h1">Deliver to</Heading>
          </Box>
          <Text className="fd-pageHead__note">
            <Icon name="pin" className="fd-ico" />
            {kitchen
              ? `Checked against ${kitchen.name}, which has its own delivery area.`
              : 'The kitchens that can reach it are counted from here.'}
          </Text>
        </Box>

        <Box className="fd-two">
          <Box className="fd-two__main">

            {showForm ? (
              <>
                {empty && editing === null && (
                  <Box className="fd-callout">
                    <Icon name="info" className="fd-ico" />
                    <Text>
                      You have no saved addresses yet. Add one here and it is the same address book the
                      Lampose app uses.
                    </Text>
                  </Box>
                )}
                <AddressForm
                  addressId={editing && editing !== 'new' ? editing : null}
                  onSaved={saved => afterWrite(saved?.addressId, editing !== null ? editing === 'new' : true)}
                  onCancel={() => (empty ? navigate(next) : setEditing(null))}
                />
              </>
            ) : (
              <Box className="fd-panel fd-panel--lift reveal">
                <Box className="fd-panel__head">
                  <Heading level={2} className="fd-panel__title">Your saved addresses</Heading>
                </Box>

                {error && (
                  <Box className="fd-callout fd-callout--bad" role="alert">
                    <Icon name="alert" className="fd-ico" />
                    <Text>{error}</Text>
                  </Box>
                )}

                <FieldSet className="fd-field">
                  <Legend className="fd-sr">Saved addresses</Legend>
                  {addresses.map(row => (
                    <Box key={row.id} className="fd-addrRow">
                      <Label
                        className={`fd-choice fd-choice--block${picked === row.id ? ' is-on' : ''}${unreachable(row) ? ' is-off' : ''}`}
                      >
                        <Input
                          type="radio"
                          name="address"
                          checked={picked === row.id}
                          disabled={unreachable(row) || busyId === row.id}
                          onChange={() => setPicked(row.id)}
                        />
                        <Box className="fd-choice__text">
                          <Inline className="fd-choice__title">
                            {row.title}
                            {row.isDefault && <Inline className="fd-tag">DEFAULT</Inline>}
                          </Inline>
                          {/* The address itself, always. The checkout replaces
                              it with the refusal because it is choosing where
                              to send one order; this page is the book, and a
                              row somebody came here to CORRECT has to show
                              what it currently says. */}
                          <Inline className="fd-choice__detail">{row.detail}</Inline>
                          {row.instructions && (
                            <Inline className="fd-choice__hint">{row.instructions}</Inline>
                          )}
                          <Inline className="fd-choice__hint">
                            {row.hasPin
                              ? 'Pin dropped · a rider can be searched for around this door'
                              : 'No pin · add one so the feed can measure the kitchens near it'}
                          </Inline>
                          {unreachable(row) && (
                            <Inline className="fd-choice__warn">{row.unserviceableNote}</Inline>
                          )}
                        </Box>
                      </Label>

                      {/* Outside the label on purpose: a button inside one
                          fires the radio it is nested in, so "Remove" would
                          select the address it is deleting. */}
                      <Box className="fd-addrRow__acts">
                        {confirmId === row.id ? (
                          <>
                            <Inline className="fd-addrRow__ask">Remove this address?</Inline>
                            <PlainButton
                              type="button" className="fd-link fd-link--bad"
                              onClick={() => remove(row)}
                              disabled={busyId === row.id}
                            >
                              <Icon name="trash" className="fd-ico" />
                              {busyId === row.id ? 'Removing…' : 'Remove'}
                            </PlainButton>
                            <PlainButton
                              type="button" className="fd-link"
                              onClick={() => setConfirmId(null)}
                              disabled={busyId === row.id}
                            >
                              Keep it
                            </PlainButton>
                          </>
                        ) : (
                          <>
                            <PlainButton
                              type="button" className="fd-link"
                              onClick={() => setEditing(row.id)}
                              disabled={busyId === row.id}
                            >
                              <Icon name="edit" className="fd-ico" />
                              Edit
                            </PlainButton>
                            {!row.isDefault && (
                              <PlainButton
                                type="button" className="fd-link"
                                onClick={() => makeDefault(row)}
                                disabled={busyId === row.id}
                              >
                                <Icon name="check" className="fd-ico" />
                                {busyId === row.id ? 'Working…' : 'Make default'}
                              </PlainButton>
                            )}
                            <PlainButton
                              type="button" className="fd-link fd-link--bad"
                              onClick={() => setConfirmId(row.id)}
                              disabled={busyId === row.id}
                            >
                              <Icon name="trash" className="fd-ico" />
                              Remove
                            </PlainButton>
                          </>
                        )}
                      </Box>
                    </Box>
                  ))}
                </FieldSet>

                <PlainButton
                  type="button"
                  className="fd-btn fd-btn--dashed fd-btn--full"
                  onClick={() => setEditing('new')}
                >
                  <Icon name="plus" className="fd-ico" />
                  Add a new address
                </PlainButton>

                {/* Unreachable is a hard stop only where it means something:
                    for pickup there is no rider and no radius to be outside. */}
                {chosen && unreachable(chosen) && (
                  <Box className="fd-callout fd-callout--warn">
                    <Icon name="info" className="fd-ico" />
                    <Text>{chosen.unserviceableNote}</Text>
                  </Box>
                )}

                <PlainButton
                  type="button"
                  className="fd-btn fd-btn--dark fd-btn--full fd-btn--lg"
                  onClick={use}
                  disabled={!picked || Boolean(chosen && unreachable(chosen))}
                >
                  Use this address
                  <Icon name="arrowR" className="fd-ico" />
                </PlainButton>
              </Box>
            )}
          </Box>

          <Box className="fd-two__side">
            {/* The same count the feed prints, from the same place: the point
                behind it is the address chosen on this page. */}
            <Aside className="fd-reach fd-reach--side reveal">
              <Text className="fd-lbl">{serviceable ? 'Serviceable' : 'Delivery area'}</Text>
              <Text className="fd-reach__body">
                {located && serviceable && (
                  <>
                    <Strong>{kitchensReaching}</Strong>
                    {kitchensReaching === 1 ? ' kitchen delivers' : ' kitchens deliver'} to the address
                    you are using.
                  </>
                )}
                {located && !serviceable
                  && 'No kitchen delivers this far yet. Pickup still works, and the feed shows how far each one is.'}
                {!located
                  && 'Choose an address with a pin — or drop one with “Use my location” — and the kitchens that reach it are counted.'}
              </Text>
              <Link to="/food" className="fd-link">See the kitchens →</Link>
            </Aside>

            <Box className="fd-panel fd-panel--row">
              <Icon name="info" className="fd-ico" />
              <Text className="fd-panel__body">
                This is the same address book as the Lampose app. What you save here is there, and the
                delivery instructions travel with the order to the rider.
              </Text>
            </Box>
          </Box>
        </Box>
      </Box>
    </Region>
  );
}

export default FoodAddress;
