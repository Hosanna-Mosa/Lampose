import React, { useState } from 'react';
import { UserPlus, Building2, Phone, Mail, Globe, Crosshair, LocateFixed, ExternalLink, CheckCircle2, AlertCircle, X } from 'lucide-react';
/* The onboarding form's own error atom. Reused rather than copied — one
   message style across the site, and the red border rule lives in one file. */
import { FieldError, errorBorder } from '../../../onboard/atoms/FieldError/FieldError';
import { formatPin, geoErrorMessage, isShortMapLink, readPin, splitAddress } from '../../../../services/mapLink';
import { isValidMobile, phoneDigits } from '../../../../services/validation';
import { createLead } from '../../../../services/api';
import { Box, Form, Heading, Inline, Input, Label, Link, PlainButton, Text } from '../../../common/atoms';

const EMPTY = {
  businessName: '',
  phone: '',
  email: '',
  website: '',
  category: '',
  address: '',
  city: '',
  landmark: '',
};

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
const text = (value) => String(value || '').trim();

/**
 * What has to be true before a lead is sent.
 *
 * Only the business name is required — a lead is something somebody noticed,
 * and refusing to record it because the phone number is on a card in the car
 * is how a lead becomes a forgotten one. What IS checked is a field that has
 * been filled in wrongly: a nine-digit mobile is not a number anybody can
 * call, and it is worse than a blank because the rep believes it.
 */
const validate = (form) => {
  const errs = {};

  if (!text(form.businessName)) {
    errs.businessName = 'Give the business a name — a lead cannot be worked without one';
  } else if (text(form.businessName).length < 3) {
    errs.businessName = 'Give the full name of the business';
  }

  if (text(form.phone) && !isValidMobile(form.phone)) {
    errs.phone = phoneDigits(form.phone).length === 10
      ? 'An Indian mobile starts 6, 7, 8 or 9'
      : 'Enter all 10 digits, or leave it blank';
  }

  if (text(form.email) && !isEmail(form.email)) {
    errs.email = 'That does not look like an email address';
  }

  const website = text(form.website);
  if (website && !/^https?:\/\/\S+$/i.test(website) && !/^[\w-]+(\.[\w-]+)+/.test(website)) {
    errs.website = 'Paste the whole address, or leave it blank';
  }

  return errs;
};

/**
 * Adding a lead by hand, from the onboarding site.
 *
 * ## Where this sits in the flow
 *
 * Sales meets a business, types it in here, and an ADMIN then hands it to a
 * calling agent in the leads panel. So this form never asks who should work
 * the lead: it is created unassigned on purpose, and the screen says so, or
 * the person filling it in would reasonably expect to see it in their own
 * queue afterwards.
 *
 * ## The duplicate answer is a result, not an error
 *
 * The whole point of the lead list's dedupe key is that a rep must not call a
 * business a colleague has already called. A 409 here means exactly that
 * happened, and it is shown as an amber answer rather than a red failure —
 * nothing went wrong, the business is simply already on the list.
 */
export function AddLeadForm({ user }) {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  /* `{ tone, text }` — the answer to the last submit, kept apart from field
     errors because it is about the request, not about a box. */
  const [result, setResult] = useState(null);

  /* The pin, when the crosshair took one. Local rather than in `form`: it is
     not typed, and it is cleared with the rest on a successful save. */
  const [pin, setPin] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState(null);

  /* One box holds the address and any pasted map link; this is what it comes
     to. Same function the property form uses — see services/mapLink.js. */
  const split = splitAddress(form.address);
  const shownPin = pin || split.pin;

  const setField = (name) => (e) => {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
    setResult(null);
  };

  /** One foreground fix from the browser's own geolocation — no key, no bill. */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote({ tone: 'warn', text: 'This browser cannot read a location. Paste the map link into the address instead.' });
      return;
    }
    if (window.isSecureContext === false) {
      setLocationNote({ tone: 'warn', text: 'Location needs a secure (https) connection. Paste the map link instead.' });
      return;
    }

    setLocating(true);
    setLocationNote(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const found = readPin({ lat: coords.latitude, lng: coords.longitude });
        if (!found) {
          setLocationNote({ tone: 'warn', text: 'The device returned a location outside the map. Paste the map link instead.' });
          return;
        }
        setPin(found);
        const metres = Math.round(coords.accuracy || 0);
        setLocationNote({ tone: 'ok', text: metres ? `Pin dropped, accurate to about ${metres}m.` : 'Pin dropped.' });
      },
      (error) => {
        setLocating(false);
        setLocationNote({ tone: 'warn', text: geoErrorMessage(error) });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  const clearLocation = () => {
    setPin(null);
    setLocationNote(null);
    if (split.mapLink) setForm((prev) => ({ ...prev, address: split.address }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);

    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const el = document.getElementById(Object.keys(errs)[0] === 'businessName' ? 'leadBusinessName' : `lead_${Object.keys(errs)[0]}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (typeof el.focus === 'function') el.focus({ preventScroll: true });
      }
      return;
    }

    setErrors({});
    setSubmitting(true);

    /* The address box is split on the way out, exactly as the property form
       does it: the words alone in `address`, the link in `mapsUrl`. A URL left
       in the address is printed to a rep where the street should be. */
    const payload = {
      businessName: text(form.businessName),
      phone: text(form.phone),
      email: text(form.email),
      website: text(form.website),
      category: text(form.category),
      address: split.address,
      city: text(form.city),
      landmark: text(form.landmark),
      mapsUrl: split.mapLink,
    };

    /* Two loose numbers, which is what this collection holds — NOT the GeoJSON
       the properties collection uses. See the note in scraper.controller.js. */
    if (shownPin) {
      payload.latitude = shownPin.lat;
      payload.longitude = shownPin.lng;
    }

    const response = await createLead(payload);
    setSubmitting(false);

    if (response && response.success) {
      setForm(EMPTY);
      setPin(null);
      setLocationNote(null);
      setResult({
        tone: 'ok',
        text: `"${payload.businessName}" added. An admin will assign it to a calling agent.`,
      });
      return;
    }

    /* Already on the list. Not a failure — it is the dedupe doing its job. */
    if (response && response.code === 'DUPLICATE_LEAD') {
      setResult({ tone: 'warn', text: response.message });
      return;
    }

    setResult({
      tone: 'bad',
      text: (response && (response.message || response.error)) || 'Could not add the lead. Try again.',
    });
  };

  const box = (name, label, { placeholder = '', icon = null, type = 'text', inputMode, hint = '' } = {}) => (
    <Box className="form-group">
      <Label className="form-label" htmlFor={`lead_${name}`} style={{ color: '#181e1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {icon}
        <Inline>{label}</Inline>
      </Label>
      <Input
        id={`lead_${name}`}
        type={type}
        inputMode={inputMode}
        name={name}
        placeholder={placeholder}
        value={form[name]}
        onChange={setField(name)}
        className="form-input"
        style={{ borderColor: errorBorder(errors[name]) }}
      />
      <FieldError message={errors[name]} />
      {hint && !errors[name] && (
        <Text style={{ marginTop: '6px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>{hint}</Text>
      )}
    </Box>
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Box style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px',
        padding: '22px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)',
      }}>
        <Box style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <Box style={{
            width: '38px', height: '38px', borderRadius: '10px', background: '#eaf3ed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <UserPlus size={19} color="#45855a" />
          </Box>
          <Heading style={{ fontSize: '1.1rem', fontWeight: 700, color: '#181e1b', margin: 0 }}>
            Add a Lead
          </Heading>
        </Box>

        {/* What happens to it afterwards. Said before the form rather than
            after the save, because somebody who expects the lead in their own
            queue will go looking for it and not find it. */}
        <Text style={{ fontSize: '0.84rem', color: '#64748b', lineHeight: 1.5, margin: '0 0 18px' }}>
          A business you met or found. It goes onto the leads list unassigned —
          an admin hands it to a calling agent from the leads panel.
          {user?.name ? ` It will be recorded as added by ${user.name}.` : ''}
        </Text>

        <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
            <Label className="form-label" htmlFor="leadBusinessName" style={{ color: '#181e1b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={15} color="#45855a" />
              <Inline>Business Name *</Inline>
            </Label>
            <Input
              id="leadBusinessName"
              type="text"
              name="businessName"
              placeholder="e.g. Sri Sai Boys Hostel"
              value={form.businessName}
              onChange={setField('businessName')}
              className="form-input"
              style={{ borderColor: errorBorder(errors.businessName) }}
            />
            <FieldError message={errors.businessName} />
          </Box>

          {box('phone', 'Phone', { placeholder: 'e.g. 9876543210', icon: <Phone size={15} color="#45855a" />, type: 'tel', inputMode: 'numeric', hint: 'The one field a business does not have two of — it is what stops a duplicate.' })}
          {box('email', 'Email', { placeholder: 'e.g. owner@example.com', icon: <Mail size={15} color="#45855a" />, inputMode: 'email' })}
          {box('category', 'Category', { placeholder: 'e.g. PG / Hostel, Restaurant' })}
          {box('website', 'Website', { placeholder: 'e.g. srisaihostel.com', icon: <Globe size={15} color="#45855a" /> })}
          {box('city', 'City', { placeholder: 'e.g. Visakhapatnam' })}
          {box('landmark', 'Landmark', { placeholder: 'e.g. Near Andhra University' })}

          {/* Address — one box, words or a pasted map link or both, with the
              crosshair beside it. Identical to the property form, on purpose:
              an agent should not have to learn this control twice. */}
          <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
            <Label className="form-label" htmlFor="lead_address" style={{ color: '#181e1b' }}>
              Address
            </Label>

            <Box style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
              <Input
                id="lead_address"
                type="text"
                name="address"
                placeholder="Street address — or paste a Google Maps link"
                value={form.address}
                onChange={setField('address')}
                className="form-input"
                style={{ flex: '1 1 260px', minWidth: 0 }}
              />
              <PlainButton
                type="button"
                onClick={useMyLocation}
                disabled={locating}
                title="Use my current location"
                aria-label="Use my current location"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 16px', borderRadius: '10px',
                  border: `1px solid ${shownPin ? '#c2e2cc' : '#e2e8f0'}`,
                  background: shownPin ? '#eaf3ed' : '#ffffff',
                  color: locating ? '#94a3b8' : '#2e5e3e',
                  fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                  cursor: locating ? 'progress' : 'pointer', whiteSpace: 'nowrap',
                  transition: 'background 0.2s ease, border-color 0.2s ease',
                }}
              >
                {shownPin && !locating ? <LocateFixed size={17} /> : <Crosshair size={17} />}
                <Inline>{locating ? 'Locating...' : 'Use my location'}</Inline>
              </PlainButton>
            </Box>

            {(shownPin || split.mapLink) && (
              <Box style={{
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                marginTop: '8px', padding: '8px 12px', borderRadius: '10px',
                background: '#eaf3ed', border: '1px solid #c2e2cc',
              }}>
                {shownPin && (
                  <Inline style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#2e5e3e', fontWeight: 600 }}>
                    <LocateFixed size={14} /> Pin: {formatPin(shownPin)}
                  </Inline>
                )}
                {split.mapLink && (
                  <Link
                    href={split.mapLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: '#45855a', fontWeight: 600, textDecoration: 'none' }}
                  >
                    <ExternalLink size={13} /> Check the link opens on the business
                  </Link>
                )}
                <PlainButton
                  type="button"
                  onClick={clearLocation}
                  style={{
                    marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '4px',
                    border: 'none', background: 'transparent', padding: 0,
                    color: '#64748b', fontSize: '0.75rem', fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  <X size={13} /> Clear
                </PlainButton>
              </Box>
            )}

            {locationNote && (
              <Text style={{
                marginTop: '6px', fontSize: '0.78rem', lineHeight: 1.45,
                color: locationNote.tone === 'ok' ? '#45855a' : '#b45309',
              }}>
                {locationNote.text}
              </Text>
            )}

            {!shownPin && split.mapLink && isShortMapLink(split.mapLink) && (
              <Text style={{ marginTop: '6px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
                Short links keep their coordinates hidden, so this one is stored as a link only.
              </Text>
            )}
          </Box>
        </Box>

        {result && (
          <Box
            role={result.tone === 'ok' ? 'status' : 'alert'}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px',
              marginTop: '18px', padding: '12px 14px', borderRadius: '12px',
              background: result.tone === 'ok' ? '#eaf3ed' : result.tone === 'warn' ? '#fff7ed' : '#fef2f2',
              border: `1px solid ${result.tone === 'ok' ? '#c2e2cc' : result.tone === 'warn' ? '#fed7aa' : '#fecaca'}`,
            }}
          >
            {result.tone === 'ok'
              ? <CheckCircle2 size={17} color="#2e5e3e" style={{ flexShrink: 0, marginTop: '1px' }} />
              : <AlertCircle size={17} color={result.tone === 'warn' ? '#b45309' : '#b91c1c'} style={{ flexShrink: 0, marginTop: '1px' }} />}
            <Text style={{
              margin: 0, fontSize: '0.85rem', lineHeight: 1.5,
              color: result.tone === 'ok' ? '#2e5e3e' : result.tone === 'warn' ? '#b45309' : '#b91c1c',
            }}>
              {result.text}
            </Text>
          </Box>
        )}

        <PlainButton
          type="submit"
          disabled={submitting}
          className="btn"
          style={{
            marginTop: '20px', width: '100%', padding: '13px 18px', borderRadius: '12px',
            border: 'none', background: submitting ? '#94a3b8' : '#45855a', color: '#ffffff',
            fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit',
            cursor: submitting ? 'progress' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          }}
        >
          <UserPlus size={17} />
          <Inline>{submitting ? 'Adding lead...' : 'Add Lead'}</Inline>
        </PlainButton>
      </Box>
    </Form>
  );
}
