import React, { useState } from 'react';
import {
  AlertCircle, CheckCircle2, Crosshair, Loader2, MapPin, Store, User,
} from 'lucide-react';
import {
  Box, Inline, Input, Label, PlainButton, Text,
} from '../../../common/atoms';
import { Field, Note, SectionHead } from '../../molecules/Field/Field';
import { COPY, CUISINE_OPTIONS } from '../../utils/restaurantOptions';
import { formatPin, geoErrorMessage, readPin, splitAddress } from '../../../../services/mapLink';

/*
 * Step 1 — who the restaurant is, who owns it, and where it stands.
 *
 * ## No one-time code, and no password
 *
 * A Lampose employee fills this in beside the owner. Both of those steps
 * existed to prove the owner is who they say and to let them pick a
 * credential, and neither survives contact with that arrangement: the code
 * would go to a handset already in the room, and the password would be chosen
 * out loud by somebody who is not its owner. The account is created without a
 * credential and cannot be signed into until the owner sets one.
 *
 * ## The pin, without a Maps key
 *
 * Lampose has no Google Maps JavaScript key and deliberately does not want a
 * billed one on a public onboarding page, so the coordinates are taken the
 * way the rest of this app takes them (`services/mapLink.js`): one foreground
 * fix from the browser, or a pasted Google Maps link that the link parser
 * reads a pin out of. Both end in the same two read-only boxes, which are the
 * same two fields the form has always had.
 *
 * ## The problems are handed in, not worked out here
 *
 * `errors` arrives already filtered to what the agent should be seeing — a
 * field they have left, or anything at all once Continue has been pressed and
 * refused. The step neither decides that nor holds it, so the same rules
 * decide what greys the button out and what is printed under the box, and the
 * two can never say different things.
 */

export function RestaurantInfoStep({ form, set, errors = {}, touch = () => {} }) {
  const copy = COPY;

  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [accuracy, setAccuracy] = useState(null);

  const toggleCuisine = (value) => {
    set({
      cuisines: form.cuisines.includes(value)
        ? form.cuisines.filter((entry) => entry !== value)
        : [...form.cuisines, value],
    });
  };

  /*
   * One foreground fix, taken TWICE if it has to be.
   *
   * The pin and the words are separate answers: a fix always yields
   * coordinates, and that is all this asks for — the address boxes below stay
   * the agent's to type.
   *
   * ## Why there are two attempts
   *
   * `enableHighAccuracy: true` asks the device for GPS. A restaurant kitchen
   * is indoors, often at the back of a building, and indoors is precisely
   * where GPS does not get a fix — the request sits there until it times out
   * and the agent is told "location unavailable" while standing in a shop with
   * perfect wifi. So a timeout is not reported: it falls back to the coarse
   * network fix (`enableHighAccuracy: false`), which comes from wifi and cell
   * towers and answers indoors in about a second.
   *
   * The coarse fix is good to a few dozen metres. That is the right trade —
   * a rider needs the building, and the street address below names the door.
   * `accuracy` is shown so the agent can decide to step outside and retry
   * rather than having to guess how good the number is.
   *
   * Only a timeout falls back. A refused permission is reported immediately,
   * because retrying re-prompts nobody and the fix for it is in the browser's
   * own settings.
   */
  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('This browser cannot take a location fix. Paste a Google Maps link instead.');
      return;
    }

    /* Chrome, Firefox and Safari all refuse geolocation outside a secure
       context. `localhost` counts as one, so this only fires on a real
       deployment served over plain http — where the button would otherwise
       fail with a permission error that blames the agent. */
    if (window.isSecureContext === false) {
      setLocationError('Location needs a secure (https) connection. Paste a Google Maps link instead.');
      return;
    }

    setLocating(true);
    setLocationError('');

    const accept = (position) => {
      const pin = readPin({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setLocating(false);

      if (!pin) {
        setLocationError('That fix was outside the valid range. Please try again.');
        return;
      }

      set({ gpsLat: String(pin.lat), gpsLng: String(pin.lng) });
      setAccuracy(Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : null);
    };

    const coarse = () => navigator.geolocation.getCurrentPosition(
      accept,
      (error) => {
        setLocating(false);
        setLocationError(geoErrorMessage(error));
      },
      /* `maximumAge` is generous here on purpose: a fix the browser took a
         minute ago is the same building, and reusing it is instant. */
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 60000 },
    );

    navigator.geolocation.getCurrentPosition(
      accept,
      (error) => {
        if (error && error.code === error.TIMEOUT) {
          coarse();
          return;
        }
        setLocating(false);
        setLocationError(geoErrorMessage(error));
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  };

  /* A pasted Maps link. `splitAddress` is the same reader the property form
     uses, so a link that works there works here. */
  const readLink = (value) => {
    set({ mapLink: value });
    setLocationError('');
    if (!value.trim()) return;

    const { pin } = splitAddress(value);
    if (pin) {
      set({ gpsLat: String(pin.lat), gpsLng: String(pin.lng) });
      /* A pasted pin has no accuracy figure, and leaving the last fix's
         reading beside it would describe a number that is no longer there. */
      setAccuracy(null);
    }
    else setLocationError('No coordinates in that link. Open the place in Google Maps and use Share → Copy link.');
  };

  return (
    <Box className="animate-fade-in">
      <Box className="rst-step-head">
        <Text className="rst-step-title">{copy.infoTitle}</Text>
        <Text className="rst-step-sub">{copy.infoIntro}</Text>
      </Box>

      {/* ── 1.1 Restaurant details ──────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<Store size={16} color="#45855a" />} title={copy.detailsTitle} />

        <Box className="rst-card">
          <Field
            label={copy.businessLabel}
            hint="The public name displayed to customers"
            required
            htmlFor="rst-name"
            error={errors.restaurantName}
          >
            <Input
              id="rst-name"
              className={`rst-input${errors.restaurantName ? ' is-bad' : ''}`}
              type="text"
              value={form.restaurantName}
              onChange={(event) => set({ restaurantName: event.target.value })}
              onBlur={() => touch('restaurantName')}
              placeholder={copy.businessPlaceholder}
            />
          </Field>

          <Field label={copy.categoryLabel} hint={copy.categoryHelp} required error={errors.cuisines}>
            <Box className="rst-chips" id="rst-cuisines" tabIndex={-1}>
              {CUISINE_OPTIONS.map((option) => (
                <PlainButton
                  key={option}
                  type="button"
                  onClick={() => { toggleCuisine(option); touch('cuisines'); }}
                  className={`rst-chip${form.cuisines.includes(option) ? ' is-on' : ''}`}
                  aria-pressed={form.cuisines.includes(option)}
                >
                  {option}
                </PlainButton>
              ))}
            </Box>
            {form.cuisines.length > 0 && (
              <Text className="rst-hint" style={{ marginTop: '8px', marginBottom: 0 }}>
                Selected: {form.cuisines.join(', ')}
              </Text>
            )}
          </Field>
        </Box>
      </Box>

      {/* ── 1.2 Owner & communication ───────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<User size={16} color="#45855a" />} title="Owner & Communication Details" />

        <Box className="rst-card">
          <Box className="rst-grid-2">
            <Field label="Full Name" required htmlFor="rst-owner" error={errors.ownerName}>
              <Input
                id="rst-owner"
                className={`rst-input${errors.ownerName ? ' is-bad' : ''}`}
                type="text"
                value={form.ownerName}
                onChange={(event) => set({ ownerName: event.target.value })}
                onBlur={() => touch('ownerName')}
                placeholder="Owner's full name"
              />
            </Field>

            <Field label="Email Address" required htmlFor="rst-email" error={errors.ownerEmail}>
              <Input
                id="rst-email"
                className={`rst-input${errors.ownerEmail ? ' is-bad' : ''}`}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={form.ownerEmail}
                onChange={(event) => set({ ownerEmail: event.target.value })}
                onBlur={() => touch('ownerEmail')}
                placeholder="owner@business.com"
              />
            </Field>
          </Box>

          {/* The owner's mobile.

              No one-time code. This console is filled in by a Lampose employee
              standing with the owner, who reads the number off their own
              handset — a code sent to that handset and typed back in by the
              agent proves nothing that the agent being in the room does not
              already prove, and it costs an SMS and a wait.

              It is still the number a rider will ring from outside a closed
              shutter, so the shape is enforced: ten digits, and the backend
              refuses anything that is not an Indian mobile. */}
          <Box className="rst-divide">
            <Field
              label="Owner Mobile Number"
              hint="The number Lampose and the delivery riders will call. Ten digits."
              required
              htmlFor="rst-phone"
              error={errors.ownerPhone}
            >
              <Box className="rst-input-row">
                <Inline className="rst-prefix">+91</Inline>
                <Input
                  id="rst-phone"
                  className={`rst-input${errors.ownerPhone ? ' is-bad' : ''}`}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={form.ownerPhone}
                  onChange={(event) => set({
                    ownerPhone: event.target.value.replace(/\D/g, '').slice(0, 10),
                  })}
                  onBlur={() => touch('ownerPhone')}
                  placeholder="Enter phone number"
                />
              </Box>
            </Field>
          </Box>


          {/* Primary contact */}
          <Box className="rst-divide">
            <Field
              label="Primary Contact Number"
              hint="Used for customer/driver support"
              required={!form.sameAsOwner}
              htmlFor="rst-contact"
              error={errors.primaryContact}
            >
              <Label className="rst-check" style={{ marginBottom: '10px' }}>
                <Input
                  type="checkbox"
                  checked={form.sameAsOwner}
                  onChange={() => set({
                    sameAsOwner: !form.sameAsOwner,
                    primaryContact: form.sameAsOwner ? '' : form.ownerPhone,
                  })}
                />
                <Inline>Same as owner mobile number</Inline>
              </Label>
              <Input
                id="rst-contact"
                className={`rst-input${errors.primaryContact ? ' is-bad' : ''}`}
                type="tel"
                inputMode="numeric"
                value={form.sameAsOwner ? form.ownerPhone : form.primaryContact}
                onChange={(event) => set({
                  primaryContact: event.target.value.replace(/\D/g, '').slice(0, 10),
                })}
                onBlur={() => touch('primaryContact')}
                disabled={form.sameAsOwner}
                placeholder="Primary contact number"
              />
            </Field>
          </Box>
        </Box>
      </Box>

      {/* ── 1.3 Location & geocoding ────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<MapPin size={16} color="#45855a" />} title="Location & Geocoding" />

        <Box className="rst-card">
          <Field
            label="Pin the kitchen"
            hint="Stand at the door and take a fix, or paste the Google Maps link for the place. The rider's map starts from this pin."
          >
            <PlainButton
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="rst-btn rst-btn-ghost rst-btn-sm"
              style={{ width: '100%' }}
            >
              {locating ? <Loader2 size={15} /> : <Crosshair size={15} color="#45855a" />}
              {locating ? 'Taking a fix...' : 'Use current location'}
            </PlainButton>
          </Field>

          <Field label="Or paste a Google Maps link" optional htmlFor="rst-maplink" error={errors.mapLink}>
            <Input
              id="rst-maplink"
              className={`rst-input${errors.mapLink ? ' is-bad' : ''}`}
              type="url"
              inputMode="url"
              value={form.mapLink}
              onChange={(event) => readLink(event.target.value)}
              onBlur={() => touch('mapLink')}
              placeholder="https://maps.app.goo.gl/..."
            />
          </Field>

          {locationError && (
            <Box style={{ marginBottom: '14px' }}>
              <Note tone="warn" icon={<AlertCircle size={14} />}>{locationError}</Note>
            </Box>
          )}

          <Box className="rst-grid-2">
            <Field label="GPS Latitude" htmlFor="rst-lat">
              <Input
                id="rst-lat"
                className="rst-input"
                type="text"
                value={form.gpsLat}
                readOnly
                placeholder="Auto-filled"
              />
            </Field>
            <Field label="GPS Longitude" htmlFor="rst-lng">
              <Input
                id="rst-lng"
                className="rst-input"
                type="text"
                value={form.gpsLng}
                readOnly
                placeholder="Auto-filled"
              />
            </Field>
          </Box>

          {form.gpsLat && form.gpsLng && (
            <Box style={{ marginTop: '12px' }}>
              <Note tone="ok" icon={<CheckCircle2 size={14} />}>
                Pinned at {formatPin({ lat: form.gpsLat, lng: form.gpsLng })}
                {accuracy !== null && ` · accurate to about ${accuracy}m`}
                {accuracy !== null && accuracy > 100
                  && ' — step outside and tap again for a closer fix.'}
              </Note>
            </Box>
          )}
        </Box>
      </Box>

      {/* ── 1.4 Detailed address ────────────────────────────────────────── */}
      <Box className="rst-section">
        <SectionHead icon={<MapPin size={16} color="#45855a" />} title="Detailed Address" />

        <Box className="rst-card">
          <Box className="rst-grid-2" style={{ marginBottom: '14px' }}>
            <Field label="Shop No. / Building / Tower" optional htmlFor="rst-shop">
              <Input
                id="rst-shop"
                className="rst-input"
                type="text"
                value={form.shopNo}
                onChange={(event) => set({ shopNo: event.target.value })}
                placeholder="e.g. Shop 42, Sunrise Tower"
              />
            </Field>
            <Field label="Floor Details" optional htmlFor="rst-floor">
              <Input
                id="rst-floor"
                className="rst-input"
                type="text"
                value={form.floor}
                onChange={(event) => set({ floor: event.target.value })}
                placeholder="e.g. Ground Floor"
              />
            </Field>
          </Box>

          <Field label="Area / Sector / Locality" required htmlFor="rst-area" error={errors.area}>
            <Input
              id="rst-area"
              className={`rst-input${errors.area ? ' is-bad' : ''}`}
              type="text"
              value={form.area}
              onChange={(event) => set({ area: event.target.value })}
              onBlur={() => touch('area')}
              placeholder="e.g. HSR Layout, Sector 1"
            />
          </Field>

          <Box className="rst-grid-2">
            <Field label="City" required htmlFor="rst-city" error={errors.city}>
              <Input
                id="rst-city"
                className={`rst-input${errors.city ? ' is-bad' : ''}`}
                type="text"
                value={form.city}
                onChange={(event) => set({ city: event.target.value })}
                onBlur={() => touch('city')}
                placeholder="e.g. Mumbai"
              />
            </Field>
            <Field
              label="Nearby Landmark"
              hint="Please ensure this matches the FSSAI registration"
              required
              htmlFor="rst-landmark"
              error={errors.landmark}
            >
              <Input
                id="rst-landmark"
                className={`rst-input${errors.landmark ? ' is-bad' : ''}`}
                type="text"
                value={form.landmark}
                onChange={(event) => set({ landmark: event.target.value })}
                onBlur={() => touch('landmark')}
                placeholder="e.g. Near City Mall"
              />
            </Field>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
