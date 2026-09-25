import React, { useState } from 'react';
import { IndianRupee, Clock, Calendar, Check, Sparkles, Upload, CloudUpload, AlertCircle, X, CheckCircle2, Plus, Star, Crosshair, LocateFixed, ExternalLink } from 'lucide-react';
import { FieldError, errorBorder } from '../../atoms/FieldError/FieldError';
import { PRESET_IMAGES, ALL_AMENITIES, DEFAULT_FALLBACK_SPLASH } from '../../utils/pricingOptions';
import { formatPin, geoErrorMessage, isShortMapLink, readPin, splitAddress } from '../../../../services/mapLink';
import { stayOffersFor, staySelectable, stayTypeFrom } from '../../../../services/stayOffers';
import { Box, Heading, Image, Inline, Input, Label, Link, Option, PlainButton, Select, Strong, Text } from '../../../common/atoms';




export function PricingAmenitiesStep({ formData, onChange, errors = {} }) {
  const [customUrlInput, setCustomUrlInput] = useState('');
  /* Local to this control: the URL box is not part of the property until Add
     is pressed, so a bad link is answered here rather than at submit. */
  const [urlError, setUrlError] = useState('');

  const selectedAmenities = Array.isArray(formData.amenities) ? formData.amenities : [];
  /*
   * What this property offers, which can be BOTH.
   *
   * Read through `stayOffersFor` rather than compared here: `validation.js`
   * reads the same function, so what the form draws and what the check demands
   * cannot drift. It also holds the categories whose answer is fixed — a hotel
   * is nightly, a shop and a whole-property let are monthly.
   */
  const offers = stayOffersFor(formData);
  const derivedRent = formData.monthlyPrice || formData.rent || '';
  const isHotel = formData.category === 'HOTEL';
  /* Written by App.jsx whenever a layout price changes — see the rent
     derivation in handleCategoryDetailChange. */

  
  // Local images array representing photos chosen by user
  const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];

  const toggleAmenity = (amenity) => {
    const updated = selectedAmenities.includes(amenity)
      ? selectedAmenities.filter(a => a !== amenity)
      : [...selectedAmenities, amenity];
    
    onChange({
      target: {
        name: 'amenities',
        value: updated
      }
    });
  };

  /*
   * Turn one length on or off, keeping the other as it is.
   *
   * The last one cannot be turned off: a property that offers no stay length
   * is not a listing, and the string it would have to be saved as does not
   * exist in the model's enum. The button simply does not answer — which reads
   * as "this one is already the answer" rather than as a broken control.
   */
  const toggleStay = (which) => {
    const next = { ...offers, [which]: !offers[which] };
    const value = stayTypeFrom(next);
    if (!value) return;
    onChange({ target: { name: 'stayType', value } });
  };

  /* ── Where the property is ────────────────────────────────────────────
     One box, holding words or a pasted link or both, plus a crosshair. The
     split into what gets stored is `splitAddress`; see services/mapLink.js. */

  /* Whether the browser is mid-fix, and what to say about the last attempt.
     Local because neither is part of the property — a denied permission is
     something to fix in the browser, not something to store on a listing. */
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState(null);

  /* Read on every render rather than kept in state, so what is shown under
     the box and what App.jsx sends at submit come from the same function and
     cannot drift apart. */
  const split = splitAddress(formData.address);

  /*
   * The pin the crosshair took wins over one read out of a pasted link: it is
   * a fix taken at the doorway rather than wherever the link's author was
   * pointing. `formData.location` is only ever written by the crosshair.
   */
  const pin = readPin(formData.location) || split.pin;

  const setField = (name, value) => onChange({ target: { name, value } });

  /*
   * The address is stored exactly as typed. The link is not lifted out of the
   * box while somebody is still editing it — a field that rearranges itself
   * mid-sentence is unusable — only at submit, and the line underneath shows
   * what that will come to.
   */
  const handleAddressChange = (e) => {
    setLocationNote(null);
    onChange(e);
  };

  /**
   * One foreground fix from the browser, kept as the pin.
   *
   * `navigator.geolocation` is the PLATFORM's — the same thing the mobile apps
   * reach through expo-location, with no key, no billing and no request we pay
   * for, which is what lets this ship with no credential in source.
   *
   * It does not touch the address box. A browser has no reverse geocoder, so
   * there are no words to write there, and appending coordinates to a line
   * somebody is halfway through typing would only be in the way.
   */
  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationNote({ tone: 'warn', text: 'This browser cannot read a location. Paste the map link into the address instead.' });
      return;
    }
    /* Chrome and Safari refuse geolocation outside https (localhost aside) and
       report it as a plain permission denial, which sends an agent into the
       browser settings looking for a switch that was never the problem. */
    if (window.isSecureContext === false) {
      setLocationNote({ tone: 'warn', text: 'Location needs a secure (https) connection. Paste the map link into the address instead.' });
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

        setField('location', found);

        const metres = Math.round(coords.accuracy || 0);
        setLocationNote({
          tone: 'ok',
          text: metres ? `Pin dropped, accurate to about ${metres}m.` : 'Pin dropped.',
        });
      },
      (error) => {
        setLocating(false);
        setLocationNote({ tone: 'warn', text: geoErrorMessage(error) });
      },
      /* High accuracy because the whole point is which building this is, not
         which neighbourhood. 20s because a cold fix indoors is slow and the
         default (no timeout) leaves the button spinning forever. */
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  };

  /* Drops the pin AND the pasted link — the link has to go too, or it would
     silently put the pin straight back on the next render. What the agent
     typed as words is left alone. */
  const clearLocation = () => {
    setLocationNote(null);
    setField('location', null);
    if (split.mapLink) setField('address', split.address);
  };

  const isBachelor = formData.category === 'BACHELOR' || formData.category === 'COLIVE';
  /*
   * A shop is monthly by definition, the mirror of the hotel rule below.
   *
   * Nobody takes a commercial unit by the night, so it is forced onto the
   * long-stay path whatever `stayType` holds — a stale Short Stay carried over
   * from a hotel would otherwise ask a godown for a nightly rate, and
   * `validation.js` (which forces the same thing) would then refuse to submit
   * against a field the form never showed.
   */
  const isCommercial = formData.category === 'COMMERCIAL';
  /* A hotel is nightly by definition, so it takes the short-stay path
     whatever `stayType` happens to hold — a stale Long Stay carried over from
     a previous category would otherwise hide check-in and check-out. */
  /* Both can be true now — see `stayOffersFor`, which is also where the
     hotel / shop / whole-property exceptions live. */
  const isShortStay = offers.short;
  const isLongStay = offers.long;
  /*
   * Categories that are never asked "short or long?" — the answer is fixed by
   * what they are. They still take the typed-price path below, unlike the
   * whole-property lets, which read a rent derived from their layouts.
   */
  const fixedStayLength = !staySelectable(formData.category);

  // Local File Selection (Does not upload to cloud until form submit)
  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    e.target.value = '';

    const newItems = fileList.map((file) => ({
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      file: file,
      previewUrl: URL.createObjectURL(file),
      name: file.name
    }));

    const updated = [...localImages, ...newItems];
    onChange({ target: { name: 'localImages', value: updated } });
  };

  const handleRemoveImage = (indexToRemove) => {
    const itemToRemove = localImages[indexToRemove];
    if (itemToRemove && itemToRemove.previewUrl && itemToRemove.previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(itemToRemove.previewUrl);
    }
    const updated = localImages.filter((_, idx) => idx !== indexToRemove);
    onChange({ target: { name: 'localImages', value: updated } });
  };

  const handleSetCoverPhoto = (indexToSet) => {
    if (indexToSet === 0) return;
    const selected = localImages[indexToSet];
    const remaining = localImages.filter((_, idx) => idx !== indexToSet);
    const reordered = [selected, ...remaining];
    onChange({ target: { name: 'localImages', value: reordered } });
  };

  const handleAddCustomUrl = () => {
    const newUrl = customUrlInput.trim();
    if (!newUrl) {
      setUrlError('Paste a photo link first');
      return;
    }
    if (!/^https?:\/\/\S+$/i.test(newUrl)) {
      setUrlError('A photo link has to start with http:// or https://');
      return;
    }
    if (localImages.some(img => img.url === newUrl || img.previewUrl === newUrl)) {
      setUrlError('That photo is already in the list');
      return;
    }
    setUrlError('');
    const newItem = {
      id: 'url_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      url: newUrl,
      previewUrl: newUrl
    };
    const updated = [...localImages, newItem];
    onChange({ target: { name: 'localImages', value: updated } });
    setCustomUrlInput('');
  };

  const handleAddPreset = (url, label) => {
    if (localImages.some(img => img.url === url || img.previewUrl === url)) return;
    const newItem = {
      id: 'preset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      url: url,
      previewUrl: url,
      name: label
    };
    const updated = [...localImages, newItem];
    onChange({ target: { name: 'localImages', value: updated } });
  };

  return (
    <Box className="animate-fade-in" style={{ marginBottom: '28px' }}>
      <Heading level={3} style={{ fontSize: '1.2rem', color: '#181e1b', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <IndianRupee size={20} color="#45855a" />
        {/* Each says what the step actually contains: a bachelor let has no
            stay duration and no amenity picker (both live in the previous
            step), and a hotel records check-in and check-out rather than a
            duration. */}
        <Inline>
          {isBachelor || fixedStayLength
            ? '3. Pricing & Photos'
            : '3. Stay Duration, Pricing & Amenities'}
        </Inline>
      </Heading>

      {/* STAY TYPE SELECTION (everything except the whole-property lets) */}
      {!isBachelor ? (
        <Box style={{
          padding: '20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          {/*
            * A hotel is not asked which kind of stay it offers.
            *
            * It is nightly by definition — the category exists for places sold
            * by the night, `handleCategorySelect` sets Short Stay when it is
            * chosen, and the bed cards price by the night. Offering the choice
            * only let an agent put a hotel on the long-stay path, where the
            * form would then ask for a monthly rent the bed grid had already
            * answered.
            */}
          {fixedStayLength ? null : (
            <Box style={{ marginBottom: '14px' }}>
              <Label className="form-label" style={{ fontSize: '0.95rem', color: '#181e1b', fontWeight: 700, marginBottom: '4px' }}>
                Are you looking for / Offering Stay Type *
              </Label>
              {/* Said out loud, because two buttons that look like a radio are
                  read as a radio. A property that lets a room by the night and
                  by the month picks both, and prices both below. */}
              <Text style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
                Pick both if this property takes guests for a few nights and for
                months at a time. Each one you pick asks for its own price.
              </Text>
            </Box>
          )}

          {/* Short and Long, and they are not exclusive — see `toggleStay`. */}
          <Box style={{ display: fixedStayLength ? 'none' : 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '18px' }}>
            <PlainButton
              type="button"
              className="btn"
              style={{
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '12px',
                background: isShortStay ? '#45855a' : '#ffffff',
                color: isShortStay ? '#ffffff' : '#181e1b',
                border: isShortStay ? '1px solid #45855a' : '1px solid #cbd5e1',
                boxShadow: isShortStay ? '0 4px 14px rgba(69, 133, 90, 0.3)' : '0 2px 6px rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
              aria-pressed={isShortStay}
              onClick={() => toggleStay('short')}
            >
              <Clock size={16} color={isShortStay ? '#ffffff' : '#45855a'} />
              <Inline>Short Stay (1-7 Days)</Inline>
            </PlainButton>

            <PlainButton
              type="button"
              className="btn"
              style={{
                padding: '12px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                borderRadius: '12px',
                background: isLongStay ? '#45855a' : '#ffffff',
                color: isLongStay ? '#ffffff' : '#181e1b',
                border: isLongStay ? '1px solid #45855a' : '1px solid #cbd5e1',
                boxShadow: isLongStay ? '0 4px 14px rgba(69, 133, 90, 0.3)' : '0 2px 6px rgba(0,0,0,0.02)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
              aria-pressed={isLongStay}
              onClick={() => toggleStay('long')}
            >
              <Calendar size={16} color={isLongStay ? '#ffffff' : '#45855a'} />
              <Inline>Long Stay (1+ Month)</Inline>
            </PlainButton>
          </Box>

          {/* Short Stay Configuration */}
          {isShortStay && (
            <Box className="animate-fade-in" style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#f0f7f2',
              border: '1px solid #c2e2cc'
            }}>
              <Heading level={4} style={{ fontSize: '0.92rem', color: '#181e1b', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} color="#45855a" />
                <Inline>{isHotel ? 'Nightly Rate' : 'Short Stay Configuration (1 - 7 Days)'}</Inline>
              </Heading>

              <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {/*
                  * A hotel is asked for no duration and no times.
                  *
                  * Check-in and check-out are the GUEST's — the dates they
                  * pick when booking — not a fact the owner records once about
                  * the building. Collecting them here produced a policy time
                  * that looked like an availability window and was neither.
                  *
                  * So a hotel's pricing card is just the rate, which the bed
                  * grid in the previous step has already worked out.
                  */}
                {isHotel ? null : (
                  <Box className="form-group" style={{ marginBottom: 0 }}>
                    <Label className="form-label" style={{ color: '#181e1b' }}>Duration Option</Label>
                    <Select
                      name="shortStayDuration"
                      className="form-select"
                      value={formData.shortStayDuration || '1-7 Days'}
                      onChange={onChange}
                    >
                      <Option value="1 Day">1 Day</Option>
                      <Option value="2 Days">2 Days</Option>
                      <Option value="3 Days">3 Days</Option>
                      <Option value="4 Days">4 Days</Option>
                      <Option value="5 Days">5 Days</Option>
                      <Option value="6 Days">6 Days</Option>
                      <Option value="7 Days">7 Days (1 Week)</Option>
                      <Option value="1-7 Days">Flexible (1-7 Days)</Option>
                    </Select>
                  </Box>
                )}

                <Box className="form-group" style={{ marginBottom: 0 }} id={isHotel ? 'dailyPriceInput' : undefined}>
                  <Label className="form-label" htmlFor={isHotel ? undefined : 'dailyPriceInput'} style={{ color: '#181e1b' }}>
                    Price per Day (₹){isHotel ? '' : ' *'}
                  </Label>
                  {isHotel ? (
                    /* Read, not typed: every bed type carries its own nightly
                       rate in the previous step, and the cheapest is what the
                       listing leads with. A free input here could disagree
                       with all of them. */
                    formData.dailyPrice || formData.rent ? (
                      <Box style={{
                        display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap',
                        padding: '10px 14px', borderRadius: '10px',
                        background: '#eaf3ed', border: '1px solid #c2e2cc'
                      }}>
                        <Inline style={{ fontSize: '1.2rem', fontWeight: 700, color: '#2e5e3e' }}>
                          ₹{Number(formData.dailyPrice || formData.rent).toLocaleString('en-IN')}
                        </Inline>
                        <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>
                          cheapest bed you priced
                        </Inline>
                      </Box>
                    ) : (
                      <Box style={{
                        padding: '10px 14px', borderRadius: '10px',
                        background: '#f8faf8', border: '1px dashed #c8d4cb',
                        fontSize: '0.82rem', color: '#64748b'
                      }}>
                        Fills itself once you price a bed type above.
                      </Box>
                    )
                  ) : (
                  <Input
                    id="dailyPriceInput"
                    type="number"
                    name="dailyPrice"
                    placeholder="e.g. 450.00"
                    value={formData.dailyPrice || ''}
                    onChange={(e) => {
                      onChange(e);
                      onChange({ target: { name: 'rent', value: e.target.value } });
                    }}
                    className="form-input"
                    style={{ borderColor: errorBorder(errors.dailyPrice) }}
                  />
                  )}
                  <FieldError message={errors.dailyPrice} />
                </Box>
              </Box>
            </Box>
          )}

          {/* Long Stay Configuration */}
          {isLongStay && (
            <Box className="animate-fade-in" style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#f0f7f2',
              border: '1px solid #c2e2cc'
            }}>
              <Heading level={4} style={{ fontSize: '0.92rem', color: '#181e1b', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Calendar size={16} color="#45855a" />
                <Inline>{isCommercial ? 'Monthly Rent' : 'Long Stay Configuration (Starting from 1 Month)'}</Inline>
              </Heading>

              <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {/* A commercial lease has a term, but it is negotiated in the
                    agreement rather than picked from a list of stay lengths —
                    and "Minimum Duration" under a heading about stays reads as
                    a question about living there. */}
                <Box className="form-group" style={{ marginBottom: 0, display: isCommercial ? 'none' : undefined }}>
                  <Label className="form-label" style={{ color: '#181e1b' }}>Minimum Duration</Label>
                  <Select
                    name="longStayDuration"
                    className="form-select"
                    value={formData.longStayDuration || '1 Month+'}
                    onChange={onChange}
                  >
                    <Option value="1 Month">1 Month</Option>
                    <Option value="3 Months">3 Months</Option>
                    <Option value="6 Months">6 Months</Option>
                    <Option value="1 Year">1 Year</Option>
                    <Option value="1 Month+">1 Month & Above</Option>
                  </Select>
                </Box>

                <Box className="form-group" style={{ marginBottom: 0 }}>
                  <Label className="form-label" htmlFor="monthlyPriceInput" style={{ color: '#181e1b' }}>Price per Month (₹) *</Label>
                  <Input
                    id="monthlyPriceInput"
                    type="number"
                    name="monthlyPrice"
                    placeholder="e.g. 8500.00"
                    value={formData.monthlyPrice || ''}
                    onChange={(e) => {
                      onChange(e);
                      onChange({ target: { name: 'rent', value: e.target.value } });
                    }}
                    className="form-input"
                    style={{ borderColor: errorBorder(errors.monthlyPrice) }}
                  />
                  <FieldError message={errors.monthlyPrice} />
                  {formData.category === 'PG_HOSTEL' && (
                    <Inline style={{ display: 'block', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                      For a PG this fills itself from the cheapest sharing rent you enter above.
                    </Inline>
                  )}
                </Box>
              </Box>
            </Box>
          )}
        </Box>
      ) : (
        /*
         * Bachelor and co-live: the headline rent is READ, not typed.
         *
         * Each layout carries its own rent in the previous step, and the
         * cheapest of them is the price the listing leads with. This used to
         * be a free input, which meant an agent could type ₹12,000 here while
         * the only layout was priced at ₹18,000 — and the site would advertise
         * the wrong one. Showing the derived figure removes the disagreement
         * rather than validating it away.
         */
        <Box style={{
          padding: '20px',
          borderRadius: '16px',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          marginBottom: '20px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.02)'
        }}>
          <Box className="form-group" style={{ marginBottom: 0 }} id="monthlyPriceInput">
            <Label className="form-label" style={{ fontSize: '1rem', color: '#181e1b', fontWeight: 700, marginBottom: '8px' }}>
              Monthly Rent Amount (₹)
            </Label>
            {derivedRent ? (
              <Box style={{
                display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap',
                padding: '12px 16px', borderRadius: '10px',
                background: '#eaf3ed', border: '1px solid #c2e2cc'
              }}>
                <Inline style={{ fontSize: '1.35rem', fontWeight: 700, color: '#2e5e3e' }}>
                  ₹{Number(derivedRent).toLocaleString('en-IN')}
                </Inline>
                <Inline style={{ fontSize: '0.78rem', color: '#45855a', fontWeight: 600 }}>
                  the cheapest layout you priced
                </Inline>
              </Box>
            ) : (
              <Box style={{
                padding: '12px 16px', borderRadius: '10px',
                background: '#f8faf8', border: '1px dashed #c8d4cb',
                fontSize: '0.85rem', color: '#64748b'
              }}>
                Fills itself once you price a layout in the step above.
              </Box>
            )}
            <FieldError message={errors.monthlyPrice} />
          </Box>
        </Box>
      )}

      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '20px' }}>
        {/* Security Deposit */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="depositInput" style={{ color: '#181e1b' }}>
            Security Deposit (₹)
          </Label>
          <Input
            id="depositInput"
            type="number"
            name="deposit"
            placeholder="e.g. 15000"
            value={formData.deposit || ''}
            onChange={onChange}
            className="form-input"
            style={{ borderColor: errorBorder(errors.deposit) }}
          />
          <FieldError message={errors.deposit} />
        </Box>

        {/* Agreed Success Charge — every category, never shown to students. */}
        <Box className="form-group">
          <Label className="form-label" htmlFor="agreedSuccessChargeInput" style={{ color: '#181e1b' }}>
            Agreed Success Charge (₹)
          </Label>
          <Input
            id="agreedSuccessChargeInput"
            type="number"
            min="0"
            name="agreedSuccessCharge"
            placeholder="e.g. 1000"
            value={formData.agreedSuccessCharge || ''}
            onChange={onChange}
            className="form-input"
            style={{ borderColor: errorBorder(errors.agreedSuccessCharge) }}
          />
          <FieldError message={errors.agreedSuccessCharge} />
        </Box>

        {/*
          Address — ONE box, which may hold words, a pasted map link, or both.

          A second field asking for the same place in a different notation is a
          field most agents leave blank. What the box cannot be is ambiguous
          once it is stored, because the two halves are read by different
          people: the words are printed to a student as the street address, the
          link is what a verifier taps before driving there. So the split
          happens on the way out (`splitAddress`) and is shown live underneath,
          rather than being guessed at by whoever reads the row later.
        */}
        <Box className="form-group" style={{ gridColumn: '1 / -1' }}>
          <Label className="form-label" htmlFor="addressInput" style={{ color: '#181e1b' }}>
            Complete Street Address
          </Label>

          <Box style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap' }}>
            <Input
              id="addressInput"
              type="text"
              name="address"
              placeholder="e.g. House No. 42, 1st Cross Road — or paste a Google Maps link"
              value={formData.address || ''}
              onChange={handleAddressChange}
              className="form-input"
              style={{ flex: '1 1 260px', minWidth: 0, borderColor: errorBorder(errors.address) }}
            />

            {/* The crosshair. Matched to the input's own height so the two read
                as one control rather than a button parked beside a box. */}
            <PlainButton
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              title="Use my current location"
              aria-label="Use my current location"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '12px 16px', borderRadius: '10px',
                border: `1px solid ${pin ? '#c2e2cc' : '#e2e8f0'}`,
                background: pin ? '#eaf3ed' : '#ffffff',
                color: locating ? '#94a3b8' : '#2e5e3e',
                fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                cursor: locating ? 'progress' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.2s ease, border-color 0.2s ease',
              }}
            >
              {pin && !locating ? <LocateFixed size={17} /> : <Crosshair size={17} />}
              <Inline>{locating ? 'Locating...' : 'Use my location'}</Inline>
            </PlainButton>
          </Box>

          <FieldError message={errors.address} />

          {/* What the box will actually be stored as. Shown because the split
              is otherwise invisible: an agent who pastes a link and sees it
              vanish from the street address on the listing would reasonably
              think the form ate it. */}
          {(pin || split.mapLink) && (
            <Box style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              marginTop: '8px', padding: '8px 12px', borderRadius: '10px',
              background: '#eaf3ed', border: '1px solid #c2e2cc',
            }}>
              {pin && (
                <Inline style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#2e5e3e', fontWeight: 600 }}>
                  <LocateFixed size={14} /> Pin: {formatPin(pin)}
                </Inline>
              )}
              {split.mapLink && (
                <Link
                  href={split.mapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.8rem', color: '#45855a', fontWeight: 600, textDecoration: 'none' }}
                >
                  <ExternalLink size={13} /> Check the link opens on the property
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

          {/* A short link is a good answer that simply has no readable pin in
              it — said out loud so it does not look like the paste failed. */}
          {!pin && split.mapLink && isShortMapLink(split.mapLink) && (
            <Text style={{ marginTop: '6px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
              Short links keep their coordinates hidden, so this one is stored as a link only. Tap the
              crosshair while you are at the property to add the pin too.
            </Text>
          )}

          {!pin && !split.mapLink && !locationNote && (
            <Text style={{ marginTop: '6px', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
              You can paste a Google Maps link in here as well, or tap the crosshair while you are
              standing at the property.
            </Text>
          )}
        </Box>

        {/* ==================================================== */}
        {/* MULTI-PHOTO SELECTION & GALLERY (UPLOADS ON SUBMIT) */}
        {/* ==================================================== */}
        <Box id="propertyPhotos" className="form-group" style={{ gridColumn: '1 / -1' }}>
          <FieldError message={errors.photos} />
          <Label className="form-label" style={{ color: '#181e1b', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <Inline style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CloudUpload size={18} color="#45855a" />
              <Inline>Property Photos ({localImages.length} Selected)</Inline>
              <Inline style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 500 }}>(Optional - Uploaded on Submit)</Inline>
            </Inline>
            <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600, background: '#eaf3ed', padding: '2px 8px', borderRadius: '10px' }}>
              ☁️ Auto Cloudinary Storage on Submit
            </Inline>
          </Label>

          {/* Select Dropzone */}
          <Box 
            style={{
              border: '2px dashed #c2e2cc',
              borderRadius: '16px',
              padding: '22px 16px',
              textAlign: 'center',
              background: '#f8faf8',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              marginBottom: '14px',
              position: 'relative'
            }}
            onClick={() => document.getElementById('cloudinaryMultiFileInput').click()}
          >
            <Input
              id="cloudinaryMultiFileInput"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={handleFileSelect}
            />

            <Box style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <Box style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: '#eaf3ed',
                color: '#45855a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Upload size={22} />
              </Box>
              <Box>
                <Inline style={{ fontSize: '0.92rem', fontWeight: 700, color: '#181e1b' }}>
                  Click to select photos or drag & drop images
                </Inline>
                <Text style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  Supports JPG, PNG, WEBP. Photos will be saved to Cloudinary when you submit the form.
                </Text>
              </Box>
            </Box>
          </Box>

          {/* Multi-Image Gallery Grid */}
          {localImages.length > 0 ? (
            <Box style={{ marginBottom: '16px' }}>
              <Box style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '10px',
                marginBottom: '10px'
              }}>
                {localImages.map((item, idx) => {
                  const isCover = idx === 0;
                  return (
                    <Box
                      key={item.id || idx}
                      style={{
                        position: 'relative',
                        height: '110px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        border: isCover ? '2px solid #45855a' : '1px solid #cbd5e1',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        background: '#ffffff'
                      }}
                    >
                      <Image
                        src={item.previewUrl || item.url || DEFAULT_FALLBACK_SPLASH}
                        alt={`Photo ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onError={(e) => { e.target.src = DEFAULT_FALLBACK_SPLASH; }}
                      />

                      {/* Cover Photo Badge / Set Cover Button */}
                      {isCover ? (
                        <Box style={{
                          position: 'absolute',
                          top: '6px',
                          left: '6px',
                          background: '#45855a',
                          color: '#ffffff',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}>
                          <Star size={10} fill="#ffffff" />
                          <Inline>Cover</Inline>
                        </Box>
                      ) : (
                        <PlainButton
                          type="button"
                          onClick={() => handleSetCoverPhoto(idx)}
                          style={{
                            position: 'absolute',
                            top: '6px',
                            left: '6px',
                            background: 'rgba(0,0,0,0.65)',
                            color: '#ffffff',
                            border: 'none',
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Click to make this the primary cover photo"
                        >
                          Make Cover
                        </PlainButton>
                      )}

                      {/* Remove Button */}
                      <PlainButton
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        style={{
                          position: 'absolute',
                          top: '6px',
                          right: '6px',
                          background: 'rgba(239, 68, 68, 0.9)',
                          color: '#ffffff',
                          border: 'none',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                        }}
                        title="Remove this photo"
                      >
                        <X size={12} />
                      </PlainButton>
                    </Box>
                  );
                })}

                {/* Add More Photos Box Inside Grid */}
                <Box
                  onClick={() => document.getElementById('cloudinaryMultiFileInput').click()}
                  style={{
                    height: '110px',
                    borderRadius: '12px',
                    border: '2px dashed #c2e2cc',
                    background: '#f8faf8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    cursor: 'pointer',
                    color: '#45855a',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Plus size={22} />
                  <Inline style={{ fontSize: '0.75rem', fontWeight: 700 }}>Add More</Inline>
                </Box>
              </Box>
            </Box>
          ) : (
            /* Warning / Informational Fallback Notice */
            <Box style={{
              padding: '12px 14px',
              borderRadius: '12px',
              background: '#f8faf8',
              border: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '14px'
            }}>
              <Image
                src={DEFAULT_FALLBACK_SPLASH}
                alt="Lampose Splash Fallback"
                style={{ width: '64px', height: '44px', objectFit: 'contain', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0 }}
              />
              <Box style={{ fontSize: '0.8rem', color: '#64748b', lineHeight: '1.4' }}>
                <Inline style={{ fontWeight: 600, color: '#181e1b', display: 'block' }}>
                  No photos selected (Optional)
                </Inline>
                <Inline>If you submit without photos, the default <Strong>Lampose Brand Splash Photo</Strong> will be used.</Inline>
              </Box>
            </Box>
          )}

          {/* Manual URL Input */}
          <Box style={{ marginBottom: '12px' }}>
            <Inline style={{ fontSize: '0.78rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
              Or add Photo by URL:
            </Inline>
            <Box style={{ display: 'flex', gap: '8px' }}>
              <Input
                type="url"
                placeholder="Paste Image URL (https://...)"
                value={customUrlInput}
                onChange={(e) => { setCustomUrlInput(e.target.value); setUrlError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomUrl(); } }}
                className="form-input"
                style={{ flex: 1, borderColor: errorBorder(urlError) }}
              />
              <PlainButton
                type="button"
                onClick={handleAddCustomUrl}
                className="btn btn-secondary"
                style={{ padding: '0 16px', fontSize: '0.82rem', whiteSpace: 'nowrap', borderRadius: '10px' }}
              >
                Add URL
              </PlainButton>
            </Box>
            <FieldError message={urlError} />
          </Box>

          {/* Quick Presets */}
          <Box style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Inline style={{ fontSize: '0.78rem', color: '#64748b' }}>Quick Select Presets:</Inline>
            {PRESET_IMAGES.map((img, i) => (
              <PlainButton
                key={i}
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '0.78rem', borderRadius: '14px', background: '#ffffff', color: '#181e1b', border: '1px solid #cbd5e1' }}
                onClick={() => handleAddPreset(img.url, img.label)}
              >
                <Sparkles size={12} color="#45855a" />
                <Inline>+ {img.label}</Inline>
              </PlainButton>
            ))}
          </Box>
        </Box>
      </Box>

      {/*
        * The general amenity list — PG / Hostel only.
        *
        * Bachelor and co-live ask this question already, under Furnishing
        * Status in the previous step and under the same heading. Two lists
        * called "Key Amenities Included" on one form is a question asked
        * twice, and the two could disagree — an agent could tick AC there and
        * leave it unticked here, and nothing would say which the listing
        * meant. So for those two the furnishing list IS the amenity list:
        * App.jsx mirrors `furnishingItems` into `amenities`.
        *
        * A hotel has no amenity list at all. What it sells is a bed at a rate,
        * and AC is already recorded against each bed type. `amenities` is
        * cleared when the category is chosen rather than left at the four this
        * form seeds — a hotel claiming "Food" and "RO Water" that nobody
        * entered is worse than a hotel claiming nothing.
        */}
      {/* Commercial joins them: the list below is Food, RO Water, Laundry and
          the rest of a residential offer, none of which a shop has. What a
          commercial unit does carry — condition, washroom, parking — is asked
          in its own block in the previous step. */}
      {isBachelor || isHotel || isCommercial ? null : (
        <Box className="form-group" id="propertyAmenities">
          <Label className="form-label" style={{ color: '#181e1b', fontWeight: 700, marginBottom: '12px' }}>
            Key Amenities Included *
          </Label>
          <FieldError message={errors.amenities} />
          <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px' }}>
            {ALL_AMENITIES.map((amenity) => {
              const isChecked = selectedAmenities.includes(amenity);
              return (
                <Box
                  key={amenity}
                  onClick={() => toggleAmenity(amenity)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: isChecked ? '#eaf3ed' : '#ffffff',
                    border: isChecked ? '1px solid #45855a' : '1px solid #e2e8f0',
                    color: isChecked ? '#181e1b' : '#475569',
                    fontWeight: isChecked ? 600 : 400,
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Box style={{
                    width: '18px',
                    height: '18px',
                    borderRadius: '4px',
                    background: isChecked ? '#45855a' : '#f1f5f2',
                    border: isChecked ? 'none' : '1px solid #cbd5e1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {isChecked && <Check size={12} color="#ffffff" />}
                  </Box>
                  <Inline>{amenity}</Inline>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </Box>
  );
}
