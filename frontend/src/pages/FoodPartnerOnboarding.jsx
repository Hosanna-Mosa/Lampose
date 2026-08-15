import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/Icon';
import LocationPicker from '../components/partner/LocationPicker';
import MenuBuilder, { MenuSheetTable } from '../components/partner/MenuBuilder';
import {
  Block, Chip, Field, FileDrop, Modal, Note, TimePicker,
} from '../components/partner/OnboardingFields';
import { readMenuSheet } from '../lib/menuSheet';
import {
  COMMERCIALS, CUISINE_OPTIONS, DAYS, MEAT_CATEGORY_OPTIONS, MENU_COLUMNS,
  MENU_TEMPLATE_FILE, PARTNER_COPY, STEPS,
} from '../data/partner';

/* ══════════════════════════════════════════════════════════════════════════
   Partner onboarding — four steps, one application.

   Everything the flow collects lives in a single object rather than forty
   separate hooks, so a step is handed `data` and `set` and nothing else, the
   draft that gets posted is that object rearranged, and adding a field is a
   line in INITIAL rather than a prop threaded through three components.

   A step gates the next one. The rules sit in `GATES` below, in the same
   order the partner meets them, because "why is Next greyed out" is the
   question this form gets asked most.
   ══════════════════════════════════════════════════════════════════════════ */

const defaultSlots = () => DAYS.reduce((acc, day) => {
  acc[day] = [{ open: '09:00', close: '22:00' }];
  return acc;
}, {});

const INITIAL = {
  /* Step 1 — who and where */
  businessName: '',
  categories: [],
  ownerName: '',
  ownerEmail: '',
  password: '',
  confirmPassword: '',
  phone: '',
  otpSent: false,
  otp: '',
  otpVerified: false,
  primaryContact: '',
  sameAsOwner: true,
  lat: '',
  lng: '',
  search: '',
  shopNo: '',
  floor: '',
  area: '',
  city: '',
  landmark: '',

  /* Step 2 — hours and menu */
  days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  activeDay: 'Monday',
  slots: defaultSlots(),
  menuMode: 'manual',
  menuFile: null,
  menuRows: [],
  menuValid: false,
  menuError: '',
  menuCategories: [],

  /* Step 3 — documents and payouts */
  pan: '',
  panFile: null,
  gstin: '',
  gstFile: null,
  gstExempt: false,
  fssai: '',
  fssaiExpiry: '',
  fssaiFile: null,
  account: '',
  accountConfirm: '',
  accountType: 'savings',
  ifsc: '',
  ifscVerified: false,
  chequeFile: null,

  /* Step 4 — the contract */
  accepted: false,
  signature: '',
};

/* The demo OTP. There is no SMS gateway wired up yet, and a partner walking
   the form should not be stopped by a code that can never arrive. */
const DEMO_OTP = '1234';

const SAMPLE_DOCUMENTS = {
  pan: 'ABCDE1234F',
  panFile: new File(['sample'], 'pan_card_sample.png', { type: 'image/png' }),
  gstExempt: false,
  gstin: '22AAAAA0000A1Z5',
  gstFile: new File(['sample'], 'gst_certificate_sample.png', { type: 'image/png' }),
  fssai: '12345678901234',
  fssaiExpiry: '2030-12-31',
  fssaiFile: new File(['sample'], 'fssai_licence_sample.png', { type: 'image/png' }),
  account: '9876543210',
  accountConfirm: '9876543210',
  accountType: 'savings',
  ifsc: 'HDFC0001234',
  ifscVerified: true,
  chequeFile: new File(['sample'], 'cancelled_cheque_sample.png', { type: 'image/png' }),
};

/* What a step is still waiting on, named the way the partner would name it.
   A disabled Next with nothing to explain it is the single most annoying
   thing a long form can do, so the gate and the explanation are the same
   list: the step opens when this comes back empty.

   Step 2 is the only one that differs by partner type — a meat centre lists
   its counter with our team afterwards, so it is asked for hours only. */
const missingFor = (step, d, copy, isMeat) => {
  const need = [];

  if (step === 1) {
    if (!d.businessName.trim()) need.push(copy.businessLabel.toLowerCase());
    if (!d.categories.length) need.push(isMeat ? 'a meat category' : 'a cuisine');
    if (!d.ownerName.trim()) need.push("the owner's name");
    if (!d.ownerEmail.includes('@')) need.push('an email address');
    if (d.password.length < 6) need.push('a password of at least 6 characters');
    else if (d.password !== d.confirmPassword) need.push('both passwords to match');
    if (!d.otpVerified) need.push('the phone number verified');
    if (!d.area.trim()) need.push('the area');
    if (!d.city.trim()) need.push('the city');
    if (!d.landmark.trim()) need.push('a nearby landmark');
  }

  if (step === 2) {
    if (!d.days.length) need.push('the days you are open');
    else if (!d.days.every(day => (d.slots[day] || []).some(s => s.open && s.close))) {
      need.push('opening hours for every day selected');
    }

    if (!isMeat && d.menuMode === 'upload') {
      if (!d.menuFile || !d.menuValid || !d.menuRows.length) need.push('a readable menu sheet');
      else if (!d.menuRows.every(row => row.image)) need.push('a photo for every item in the sheet');
    }
    if (!isMeat && d.menuMode === 'manual'
      && !d.menuCategories.some(c => c.items.length > 0)) {
      need.push('at least one menu item');
    }
  }

  if (step === 3) {
    if (d.pan.length < 10) need.push('the PAN number');
    if (!d.panFile) need.push('a copy of the PAN card');
    if (!d.gstExempt && !d.gstin) need.push('the GSTIN');
    if (!d.gstExempt && !d.gstFile) need.push('the GST certificate');
    if (d.fssai.length !== 14) need.push('a 14-digit FSSAI number');
    if (!d.fssaiExpiry) need.push('the FSSAI expiry date');
    if (!d.fssaiFile) need.push('a copy of the FSSAI licence');
    if (d.account.length < 9) need.push('the bank account number');
    else if (d.account !== d.accountConfirm) need.push('both account numbers to match');
    if (d.ifsc.length !== 11) need.push('an 11-character IFSC');
    else if (!d.ifscVerified) need.push('the IFSC verified');
    if (!d.chequeFile) need.push('a cancelled cheque');
  }

  if (step === 4) {
    if (!d.accepted) need.push('the terms accepted');
    if (d.signature.trim().length < 2) need.push('your signature');
  }

  return need;
};

/* "a, b and c", cut short before it turns into a paragraph. */
const humanList = items => {
  const shown = items.slice(0, 3);
  const rest = items.length - shown.length;
  const joined = shown.length > 1
    ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`
    : shown[0];
  return rest > 0 ? `${joined}, and ${rest} more` : joined;
};

const named = file => (file ? { name: file.name } : null);

export default function FoodPartnerOnboarding() {
  const [params] = useSearchParams();
  const partnerType = params.get('type') === 'meat' ? 'meat' : 'food';
  const isMeat = partnerType === 'meat';
  const copy = PARTNER_COPY[partnerType];
  const categoryOptions = isMeat ? MEAT_CATEGORY_OPTIONS : CUISINE_OPTIONS;

  const [data, setData] = useState(INITIAL);
  const [step, setStep] = useState(1);
  const [otpError, setOtpError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState(null);            // null | 'open' | 'sent'
  const [draftEmail, setDraftEmail] = useState('');

  /* Stable, because the map builds its listeners once and holds whatever it
     was given at that moment. */
  const patch = useCallback(next => setData(d => ({ ...d, ...next })), []);
  const set = useCallback((key, value) => patch({ [key]: value }), [patch]);

  /* A step change swaps a screenful of content under a scrolled window. */
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [step]);

  const steps = useMemo(() => STEPS.map(s => {
    if (s.num === 1) return { ...s, label: copy.infoTitle };
    if (s.num === 2 && isMeat) return { ...s, label: 'Operational Details' };
    return s;
  }), [copy.infoTitle, isMeat]);

  const missing = missingFor(step, data, copy, isMeat);
  const canLeave = missing.length === 0;

  /* ── Step 1 ───────────────────────────────────────────────────────────── */

  const toggleCategory = value => setData(d => ({
    ...d,
    categories: d.categories.includes(value)
      ? d.categories.filter(c => c !== value)
      : [...d.categories, value],
  }));

  const verifyOtp = () => {
    if (data.otp === DEMO_OTP) {
      patch({ otpVerified: true });
      setOtpError('');
    } else {
      setOtpError(`That code did not match. SMS delivery is not live yet — enter ${DEMO_OTP}.`);
    }
  };

  /* ── Step 2 ───────────────────────────────────────────────────────────── */

  const toggleDay = day => setData(d => {
    const days = d.days.includes(day) ? d.days.filter(x => x !== day) : [...d.days, day];
    /* The hours editor points at one day; dropping that day has to move it. */
    const activeDay = days.includes(d.activeDay) ? d.activeDay : (days[0] || day);
    return { ...d, days, activeDay };
  });

  const editSlots = (day, next) => setData(d => ({
    ...d, slots: { ...d.slots, [day]: next },
  }));

  const readSheet = async file => {
    patch({ menuFile: file, menuValid: false, menuError: '', menuRows: [] });
    if (!file) return;
    try {
      patch({ menuRows: await readMenuSheet(file), menuValid: true });
    } catch (err) {
      patch({ menuError: err.message || 'Unable to read the uploaded menu sheet.' });
    }
  };

  const setRowImage = (rowId, image) => setData(d => ({
    ...d,
    menuRows: d.menuRows.map(row => (row.id === rowId ? { ...row, image } : row)),
  }));

  /* ── Sending it ───────────────────────────────────────────────────────── */

  /* Front end only for now: nothing is posted anywhere, because the API has
     no endpoint to post it to yet. This builds the application in the shape
     the backend will be handed when it does exist — files are named rather
     than carried, since the documents themselves go up separately — and the
     two handlers below hand it to the console instead of the network. Wiring
     it up later is one `await` in each. */
  const payloadFor = status => ({
    status,
    partnerType,
    restaurantName: data.businessName,
    cuisines: data.categories,
    ownerName: data.ownerName,
    ownerEmail: data.ownerEmail,
    portalPassword: data.password,
    ownerPhone: data.phone,
    otp: data.otp || DEMO_OTP,
    otpVerified: data.otpVerified,
    primaryContact: data.sameAsOwner ? data.phone : data.primaryContact,
    sameAsOwner: data.sameAsOwner,
    location: {
      lat: data.lat ? parseFloat(data.lat) : undefined,
      lng: data.lng ? parseFloat(data.lng) : undefined,
    },
    address: {
      shopNo: data.shopNo,
      floor: data.floor,
      area: data.area,
      city: data.city,
      landmark: data.landmark,
    },
    selectedDays: data.days,
    dayTimeSlots: Object.fromEntries(data.days.map(day => [day, data.slots[day] || []])),
    menuSetupMode: data.menuMode,
    menuReferenceFile: named(data.menuFile),
    menuUploadValid: data.menuValid,
    menuUploadRows: data.menuRows.map(row => ({
      category: row.category,
      itemName: row.itemName,
      price: row.price,
      description: row.description,
      type: row.type,
      isBestseller: row.isBestseller,
      image: named(row.image),
    })),
    menuCategories: data.menuCategories.map(category => ({
      name: category.name,
      items: category.items.map(item => ({
        name: item.name,
        price: item.price,
        description: item.description,
        isVeg: item.isVeg,
        isBestseller: item.isBestseller,
        photo: named(item.photo),
      })),
    })),
    panNumber: data.pan,
    panFile: named(data.panFile),
    gstin: data.gstin,
    gstFile: named(data.gstFile),
    gstExempt: data.gstExempt,
    fssaiNumber: data.fssai,
    fssaiExpiry: data.fssaiExpiry,
    fssaiFile: named(data.fssaiFile),
    bankAccount: data.account,
    bankConfirm: data.accountConfirm,
    accountType: data.accountType,
    ifsc: data.ifsc,
    ifscFetched: data.ifscVerified,
    chequeFile: named(data.chequeFile),
    acceptedTos: data.accepted,
    signature: data.signature,
  });

  const saveDraft = () => {
    if (!draftEmail.includes('@')) return;
    console.info('[onboarding] draft', { ...payloadFor('draft'), resumeEmail: draftEmail });
    setDraft('sent');
  };

  const submit = () => {
    console.info('[onboarding] application', payloadFor('submitted'));
    setSubmitted(true);
  };

  /* ── Submitted ────────────────────────────────────────────────────────── */

  if (submitted) {
    return (
      <section className="ob-done">
        <div className="ob-done__card">
          <span className="ob-done__ico"><Icon name="check" className="ob-ico" /></span>
          <h1>Application submitted</h1>
          <p>
            Thanks for partnering with Lampose. Someone from the team reviews your
            {' '}{copy.noun} and comes back within 24 hours to help you go live.
          </p>
          <p className="ob-hint">
            Once you are approved, sign in to the partner dashboard with
            {' '}<strong>{data.ownerEmail || 'your owner email'}</strong> and the password you set here.
          </p>
          <div className="ob-done__acts">
            <Link to="/" className="ob-go">Back to home</Link>
            <Link to="/food-partner" className="ob-ghost">Partner page</Link>
          </div>
        </div>
      </section>
    );
  }

  /* ── The form ─────────────────────────────────────────────────────────── */

  return (
    <section className="ob">
      <div className="ob-wrap">
        <aside className="ob-rail">
          <div className="ob-rail__head">
            <span className="ob-rail__tag">Partner onboarding</span>
            <p>{copy.railTitle}</p>
          </div>

          {/* Not a <nav>: the stylesheet styles that element itself as the
              fixed site navbar, and a second one inside the rail inherits the
              fixed position. */}
          <div className="ob-rail__steps">
            {steps.map(s => {
              const done = s.num < step;
              const active = s.num === step;
              return (
                <button
                  key={s.num} type="button"
                  className={`ob-rail__step${active ? ' is-on' : ''}${done ? ' is-done' : ''}`}
                  onClick={() => done && setStep(s.num)}
                  disabled={!done && !active}
                >
                  <span className="ob-rail__num">
                    {done ? <Icon name="check" className="ob-ico" /> : s.num}
                  </span>
                  <span className="ob-rail__body">
                    <strong>{s.label}</strong>
                    <em>{done ? 'Done' : active ? 'In progress' : 'Not started'}</em>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="ob-rail__foot">
            <div className="ob-rail__meter">
              <span>Progress</span>
              <strong>{Math.round((step / 4) * 100)}%</strong>
            </div>
            <div className="ob-bar"><div className="ob-bar__fill" style={{ width: `${(step / 4) * 100}%` }} /></div>
          </div>
        </aside>

        <div className="ob-col">
          <header className="ob-head">
            <div>
              <span className="ob-head__step">Step {step} of 4</span>
              <h1>{steps[step - 1].label}</h1>
            </div>
            <div className="ob-head__acts">
              <button type="button" className="ob-ghost" onClick={() => setDraft('open')}>
                <Icon name="save" className="ob-ico" />
                Save draft
              </button>
              <Link to="/food-partner" className="ob-ghost">Exit</Link>
            </div>
          </header>

          <div className="ob-steps">
            {steps.map(s => (
              <span
                key={s.num}
                className={`ob-steps__dot${s.num === step ? ' is-on' : ''}${s.num < step ? ' is-done' : ''}`}
              />
            ))}
          </div>

          {/* ═══ Step 1 — who and where ═══════════════════════════════════ */}
          {step === 1 && (
            <>
              <p className="ob-intro">{copy.infoIntro}</p>

              <Block icon="store" title={copy.detailsTitle}>
                <Field
                  label={copy.businessLabel} required htmlFor="ob-name"
                  hint="The name customers will see in the app"
                >
                  <input
                    id="ob-name" type="text" className="ob-input" value={data.businessName}
                    onChange={e => set('businessName', e.target.value)}
                    placeholder={copy.businessPlaceholder}
                  />
                </Field>

                <Field label={copy.categoryLabel} required hint={copy.categoryHelp}>
                  <div className="ob-chips">
                    {categoryOptions.map(option => (
                      <Chip
                        key={option}
                        active={data.categories.includes(option)}
                        onClick={() => toggleCategory(option)}
                      >
                        {option}
                      </Chip>
                    ))}
                  </div>
                  {data.categories.length > 0 && (
                    <p className="ob-hint">Selected: {data.categories.join(', ')}</p>
                  )}
                </Field>
              </Block>

              <Block icon="users" title="Owner & contact details">
                <div className="ob-grid ob-grid--2">
                  <Field label="Full name" required htmlFor="ob-owner">
                    <input
                      id="ob-owner" type="text" className="ob-input" value={data.ownerName}
                      onChange={e => set('ownerName', e.target.value)}
                      placeholder="The owner's full name"
                    />
                  </Field>
                  <Field label="Email address" required htmlFor="ob-email">
                    <input
                      id="ob-email" type="email" className="ob-input" value={data.ownerEmail}
                      onChange={e => set('ownerEmail', e.target.value)}
                      placeholder="owner@business.com"
                    />
                  </Field>
                </div>

                <div className="ob-panel">
                  <div className="ob-panel__head">
                    <span className="ob-panel__ico"><Icon name="verified" className="ob-ico" /></span>
                    <div>
                      <strong>Partner dashboard login</strong>
                      <p className="ob-hint">
                        Your owner email or phone number and this password sign you in to
                        the dashboard once the application is approved.
                      </p>
                    </div>
                  </div>

                  <div className="ob-grid ob-grid--2">
                    <Field label="Password" required htmlFor="ob-pass">
                      <input
                        id="ob-pass" type="password" className="ob-input" value={data.password}
                        onChange={e => set('password', e.target.value)}
                        placeholder="At least 6 characters"
                      />
                    </Field>
                    <Field label="Confirm password" required htmlFor="ob-pass2">
                      <input
                        id="ob-pass2" type="password" className="ob-input" value={data.confirmPassword}
                        onChange={e => set('confirmPassword', e.target.value)}
                        placeholder="Type it again"
                      />
                    </Field>
                  </div>

                  {data.confirmPassword && data.password !== data.confirmPassword && (
                    <Note tone="bad" icon="alert">The two passwords do not match.</Note>
                  )}
                </div>

                <Field label="Phone number" required>
                  {!data.otpSent ? (
                    <div className="ob-row ob-row--tight">
                      <span className="ob-prefix">🇮🇳 +91</span>
                      <input
                        type="tel" className="ob-input" value={data.phone}
                        onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="10-digit mobile number"
                      />
                      <button
                        type="button" className="ob-go" disabled={data.phone.length < 10}
                        onClick={() => patch({ otpSent: true })}
                      >
                        Send code
                      </button>
                    </div>
                  ) : !data.otpVerified ? (
                    <>
                      <p className="ob-hint">
                        A 4-digit code was sent to <strong>{data.phone}</strong>.
                      </p>
                      <div className="ob-row ob-row--tight">
                        <input
                          type="text" className="ob-input ob-input--code" value={data.otp}
                          maxLength={4} placeholder="––––"
                          onChange={e => set('otp', e.target.value.replace(/\D/g, '').slice(0, 4))}
                        />
                        <button
                          type="button" className="ob-go" onClick={verifyOtp}
                          disabled={data.otp.length < 4}
                        >
                          Verify
                        </button>
                      </div>
                      {otpError && <Note tone="bad" icon="alert">{otpError}</Note>}
                      <button
                        type="button" className="ob-link"
                        onClick={() => { patch({ otpSent: false, otp: '' }); setOtpError(''); }}
                      >
                        Change the number
                      </button>
                    </>
                  ) : (
                    <Note tone="ok" icon="check">Verified — +91 {data.phone}</Note>
                  )}
                </Field>

                <Field
                  label="Primary contact number"
                  hint="The number our riders and support team ring"
                  htmlFor="ob-primary"
                >
                  <label className="ob-check">
                    <input
                      type="checkbox" checked={data.sameAsOwner}
                      onChange={() => patch({
                        sameAsOwner: !data.sameAsOwner,
                        primaryContact: data.sameAsOwner ? '' : data.phone,
                      })}
                    />
                    Same as the owner&apos;s mobile number
                  </label>
                  <input
                    id="ob-primary" type="tel" className="ob-input"
                    value={data.sameAsOwner ? data.phone : data.primaryContact}
                    disabled={data.sameAsOwner}
                    onChange={e => set('primaryContact', e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                  />
                </Field>
              </Block>

              <Block icon="map" title="Location on the map">
                <LocationPicker
                  lat={data.lat} lng={data.lng} search={data.search}
                  onSearch={value => set('search', value)}
                  onPlace={patch}
                />
              </Block>

              <Block icon="pin" title="Detailed address">
                <div className="ob-grid ob-grid--2">
                  <Field label="Shop no. / building" optional htmlFor="ob-shop">
                    <input
                      id="ob-shop" type="text" className="ob-input" value={data.shopNo}
                      onChange={e => set('shopNo', e.target.value)}
                      placeholder="e.g. Shop 42, Sunrise Tower"
                    />
                  </Field>
                  <Field label="Floor" optional htmlFor="ob-floor">
                    <input
                      id="ob-floor" type="text" className="ob-input" value={data.floor}
                      onChange={e => set('floor', e.target.value)}
                      placeholder="e.g. Ground floor"
                    />
                  </Field>
                </div>

                <Field label="Area / locality" required htmlFor="ob-area">
                  <input
                    id="ob-area" type="text" className="ob-input" value={data.area}
                    onChange={e => set('area', e.target.value)}
                    placeholder="e.g. MVP Colony, Sector 4"
                  />
                </Field>

                <div className="ob-grid ob-grid--2">
                  <Field label="City" required htmlFor="ob-city">
                    <input
                      id="ob-city" type="text" className="ob-input" value={data.city}
                      onChange={e => set('city', e.target.value)}
                      placeholder="e.g. Visakhapatnam"
                    />
                  </Field>
                  <Field
                    label="Nearby landmark" required htmlFor="ob-landmark"
                    hint="Please make sure this matches your FSSAI registration"
                  >
                    <input
                      id="ob-landmark" type="text" className="ob-input" value={data.landmark}
                      onChange={e => set('landmark', e.target.value)}
                      placeholder="e.g. Opposite the RTC complex"
                    />
                  </Field>
                </div>
              </Block>
            </>
          )}

          {/* ═══ Step 2 — hours and menu ══════════════════════════════════ */}
          {step === 2 && (
            <>
              <p className="ob-intro">{copy.menuHelp}</p>

              <Block icon="clock" title="Opening hours">
                <Field label="Days you are open" required>
                  <div className="ob-days">
                    {DAYS.map(day => (
                      <Chip
                        key={day} title={day}
                        active={data.days.includes(day)}
                        onClick={() => { toggleDay(day); set('activeDay', day); }}
                      >
                        {day.slice(0, 3)}
                      </Chip>
                    ))}
                  </div>
                  <button
                    type="button" className="ob-link"
                    onClick={() => patch({
                      days: data.days.length === 7 ? [] : [...DAYS],
                      activeDay: 'Monday',
                    })}
                  >
                    {data.days.length === 7 ? 'Clear all days' : 'Select every day'}
                  </button>
                </Field>

                {data.days.length > 0 && (
                  <Field label="Opening & closing times" hint={copy.operatingHelp}>
                    <div className="ob-chips">
                      {data.days.map(day => (
                        <Chip
                          key={day} active={data.activeDay === day}
                          onClick={() => set('activeDay', day)}
                        >
                          {day}
                        </Chip>
                      ))}
                    </div>

                    <div className="ob-slots">
                      {(data.slots[data.activeDay] || []).map((slot, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <div className="ob-slot" key={i}>
                          <TimePicker
                            label="Opens" value={slot.open}
                            onChange={value => editSlots(data.activeDay, (data.slots[data.activeDay] || [])
                              .map((s, idx) => (idx === i ? { ...s, open: value } : s)))}
                          />
                          <span className="ob-slot__dash">—</span>
                          <TimePicker
                            label="Closes" value={slot.close}
                            onChange={value => editSlots(data.activeDay, (data.slots[data.activeDay] || [])
                              .map((s, idx) => (idx === i ? { ...s, close: value } : s)))}
                          />
                          {(data.slots[data.activeDay] || []).length > 1 && (
                            <button
                              type="button" className="ob-x"
                              aria-label={`Remove slot ${i + 1}`}
                              onClick={() => editSlots(data.activeDay,
                                (data.slots[data.activeDay] || []).filter((s, idx) => idx !== i))}
                            >
                              <Icon name="trash" className="ob-ico" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <button
                      type="button" className="ob-link"
                      onClick={() => editSlots(data.activeDay, [
                        ...(data.slots[data.activeDay] || []), { open: '09:00', close: '22:00' },
                      ])}
                    >
                      <Icon name="plus" className="ob-ico" />
                      Add another slot for {data.activeDay}
                    </button>
                  </Field>
                )}
              </Block>

              {!isMeat && (
                <section className="ob-block">
                  <div className="ob-block__head">
                    <span className="ob-block__ico"><Icon name="menu" className="ob-ico" /></span>
                    <h2>{copy.menuTitle}</h2>
                  </div>

                  <div className="ob-card">
                    <Field label="How would you like to set up your menu?">
                      <div className="ob-seg ob-seg--wide">
                        <button
                          type="button"
                          className={`ob-seg__btn${data.menuMode === 'manual' ? ' is-on' : ''}`}
                          onClick={() => set('menuMode', 'manual')}
                        >
                          <Icon name="edit" className="ob-ico" />
                          Type the items in
                        </button>
                        <button
                          type="button"
                          className={`ob-seg__btn${data.menuMode === 'upload' ? ' is-on' : ''}`}
                          onClick={() => set('menuMode', 'upload')}
                        >
                          <Icon name="sheet" className="ob-ico" />
                          Upload a spreadsheet
                        </button>
                      </div>
                    </Field>

                    {data.menuMode === 'upload' && (
                      <div className="ob-panel ob-panel--split">
                        <div className="ob-panel__head">
                          <span className="ob-panel__ico"><Icon name="sheet" className="ob-ico" /></span>
                          <div>
                            <strong>Start from the template</strong>
                            <p className="ob-hint">
                              Keep the columns as they are. Photos are added below, once
                              the sheet has been read.
                            </p>
                          </div>
                        </div>
                        <a className="ob-ghost" href={MENU_TEMPLATE_FILE} download>
                          <Icon name="download" className="ob-ico" />
                          Download template
                        </a>
                      </div>
                    )}
                  </div>

                  {data.menuMode === 'upload' && (
                    <div className="ob-card">
                      <FileDrop
                        label="Upload your menu"
                        desc="Your completed CSV or XLSX menu sheet"
                        accept=".csv,.xlsx"
                        file={data.menuFile}
                        onChange={readSheet}
                      />
                      <p className="ob-hint">Columns required: {MENU_COLUMNS.join(', ')}</p>

                      {data.menuError && <Note tone="bad" icon="alert">{data.menuError}</Note>}
                      {data.menuValid && data.menuFile && (
                        <Note tone="ok" icon="check">
                          Sheet read — {data.menuRows.length} item
                          {data.menuRows.length === 1 ? '' : 's'} found. Add a photo for each below.
                        </Note>
                      )}

                      {data.menuRows.length > 0 && (
                        <MenuSheetTable rows={data.menuRows} onImage={setRowImage} />
                      )}

                      <Note tone="info" icon="info">
                        Once you submit, our onboarding team checks the sheet and the photos,
                        confirms the prices with you, and sets the menu up for you within 24 hours.
                      </Note>
                    </div>
                  )}

                  {data.menuMode === 'manual' && (
                    <MenuBuilder
                      isMeat={isMeat}
                      categories={data.menuCategories}
                      onChange={next => set('menuCategories', next)}
                      help={copy.manualCategoryHelp}
                      emptyTitle={copy.manualEmptyTitle}
                      emptyHelp={copy.manualEmptyHelp}
                    />
                  )}
                </section>
              )}
            </>
          )}

          {/* ═══ Step 3 — documents and payouts ═══════════════════════════ */}
          {step === 3 && (
            <>
              <div className="ob-intro ob-intro--split">
                <p>Upload the documents that let us verify the business, and tell us where to pay you.</p>
                <button
                  type="button" className="ob-ghost"
                  onClick={() => patch(SAMPLE_DOCUMENTS)}
                >
                  <Icon name="sparkle" className="ob-ico" />
                  Fill with sample data
                </button>
              </div>

              <Block icon="badge" title="Tax & identity">
                <Field label="PAN number" required htmlFor="ob-pan">
                  <input
                    id="ob-pan" type="text" className="ob-input" value={data.pan} maxLength={10}
                    onChange={e => set('pan', e.target.value.toUpperCase().slice(0, 10))}
                    placeholder="e.g. ABCDE1234F"
                  />
                </Field>
                <FileDrop label="PAN card copy" file={data.panFile} onChange={f => set('panFile', f)} />

                <div className="ob-split">
                  <p className="ob-label">
                    GSTIN details{!data.gstExempt && <span className="ob-req">*</span>}
                  </p>
                  <label className="ob-check">
                    <input
                      type="checkbox" checked={data.gstExempt}
                      onChange={() => set('gstExempt', !data.gstExempt)}
                    />
                    {copy.gstExemptLabel}
                  </label>
                </div>

                {data.gstExempt ? (
                  <Note tone="info" icon="info">
                    Noted — your {copy.noun} is filed as exempt or on the composition scheme.
                  </Note>
                ) : (
                  <>
                    <input
                      type="text" className="ob-input" value={data.gstin} maxLength={15}
                      onChange={e => set('gstin', e.target.value.toUpperCase().slice(0, 15))}
                      placeholder="e.g. 22AAAAA0000A1Z5"
                    />
                    <FileDrop
                      label="GST certificate" file={data.gstFile}
                      onChange={f => set('gstFile', f)}
                    />
                  </>
                )}
              </Block>

              <Block icon="verified" title={copy.safetyTitle}>
                <div className="ob-grid ob-grid--2">
                  <Field label="FSSAI licence number" required htmlFor="ob-fssai">
                    <input
                      id="ob-fssai" type="text" className="ob-input" value={data.fssai} maxLength={14}
                      onChange={e => set('fssai', e.target.value.replace(/\D/g, '').slice(0, 14))}
                      placeholder="14 digits"
                    />
                  </Field>
                  <Field label="Expiry date" required htmlFor="ob-fssai-exp">
                    <input
                      id="ob-fssai-exp" type="date" className="ob-input" value={data.fssaiExpiry}
                      onChange={e => set('fssaiExpiry', e.target.value)}
                    />
                  </Field>
                </div>
                <FileDrop
                  label="FSSAI licence copy" desc={copy.safetyUploadDescription}
                  file={data.fssaiFile} onChange={f => set('fssaiFile', f)}
                />
              </Block>

              <Block icon="bank" title="Bank & payouts">
                <div className="ob-grid ob-grid--2">
                  <Field label="Bank account number" required htmlFor="ob-acct">
                    <input
                      id="ob-acct" type="text" inputMode="numeric" className="ob-input"
                      value={data.account}
                      onChange={e => set('account', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="Account number"
                    />
                  </Field>
                  <Field label="Re-enter account number" required htmlFor="ob-acct2">
                    <input
                      id="ob-acct2" type="text" inputMode="numeric" value={data.accountConfirm}
                      className={`ob-input${data.accountConfirm
                        ? (data.account === data.accountConfirm ? ' is-ok' : ' is-bad') : ''}`}
                      onChange={e => set('accountConfirm', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="Type it again"
                    />
                    {data.accountConfirm && data.account !== data.accountConfirm && (
                      <Note tone="bad" icon="alert">The account numbers do not match.</Note>
                    )}
                  </Field>
                </div>

                <Field label="Account type" required>
                  <div className="ob-seg ob-seg--wide">
                    {['savings', 'current'].map(type => (
                      <button
                        key={type} type="button"
                        className={`ob-seg__btn${data.accountType === type ? ' is-on' : ''}`}
                        onClick={() => set('accountType', type)}
                      >
                        <Icon name={type === 'savings' ? 'wallet' : 'bank'} className="ob-ico" />
                        {type === 'savings' ? 'Savings' : 'Current'}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label="IFSC code" required htmlFor="ob-ifsc">
                  <div className="ob-row ob-row--tight">
                    <input
                      id="ob-ifsc" type="text" className="ob-input" value={data.ifsc} maxLength={11}
                      onChange={e => patch({
                        ifsc: e.target.value.toUpperCase().slice(0, 11), ifscVerified: false,
                      })}
                      placeholder="e.g. HDFC0001234"
                    />
                    <button
                      type="button" className="ob-go" disabled={data.ifsc.length !== 11}
                      onClick={() => set('ifscVerified', true)}
                    >
                      Verify
                    </button>
                  </div>
                  {data.ifscVerified && (
                    <Note tone="ok" icon="check">IFSC verified — branch details fetched.</Note>
                  )}
                </Field>

                <FileDrop
                  label="Cancelled cheque or bank statement"
                  desc="A clear photo showing the account number and name"
                  file={data.chequeFile} onChange={f => set('chequeFile', f)}
                />
              </Block>
            </>
          )}

          {/* ═══ Step 4 — the contract ════════════════════════════════════ */}
          {step === 4 && (
            <>
              <p className="ob-intro">Read the commercial terms, sign, and send the application in.</p>

              <Block icon="contract" title="Commission & commercial terms">
                <ul className="ob-terms">
                  {COMMERCIALS.map(term => (
                    <li key={term.label}>
                      <strong>{term.label}</strong>
                      <span>{term.value}</span>
                    </li>
                  ))}
                </ul>
              </Block>

              <Block icon="pen" title="Sign the agreement">
                <div className="ob-legal">
                  <h4>LAMPOSE PARTNER MERCHANT AGREEMENT</h4>
                  <p>
                    This Partner Merchant Agreement (&ldquo;Agreement&rdquo;) is entered into between
                    the merchant (&ldquo;Partner&rdquo;) and Lampose Technologies Pvt. Ltd.
                    (&ldquo;Platform&rdquo;).
                  </p>
                  <p>
                    <strong>1. Services.</strong> The Platform agrees to list the Partner&apos;s
                    {' '}{copy.noun} and to facilitate {copy.contractServiceText} to customers
                    through the Lampose platform.
                  </p>
                  <p>
                    <strong>2. Commission.</strong> The Partner agrees to pay commission on each
                    order at the agreed rate. Rates may be revised with 30 days&apos; notice.
                  </p>
                  <p>
                    <strong>3. Payment terms.</strong> Amounts due to the Partner are settled
                    weekly, net of commission, fees and applicable taxes, to the account given
                    in this application. The Partner is responsible for the accuracy of those
                    bank details.
                  </p>
                  <p>
                    <strong>4. {isMeat ? 'Products' : 'Menu'} &amp; pricing.</strong> The Partner
                    sets its own prices and is responsible for keeping listings, availability and
                    descriptions accurate.
                  </p>
                  <p>
                    <strong>5. Quality standards.</strong> The Partner agrees to maintain the
                    hygiene, packaging and quality standards specified by the Platform.
                    Non-compliance may result in de-listing.
                  </p>
                  <p>
                    <strong>6. Term &amp; termination.</strong> This agreement runs until either
                    party ends it with 30 days&apos; written notice. The Platform may terminate
                    immediately for a breach of these terms.
                  </p>
                  <p>
                    <strong>7. Data &amp; privacy.</strong> The Partner agrees to the collection
                    and use of order data for analytics and platform improvement, in line with
                    applicable data protection law.
                  </p>
                  <p>
                    <strong>8. Indemnity.</strong> The Partner indemnifies the Platform against
                    claims arising from the quality or safety of its products or from any breach
                    of applicable law.
                  </p>
                  <p>
                    Accepting below confirms that you have read, understood and agreed to all of
                    the terms above.
                  </p>
                </div>

                <label className="ob-check ob-check--lg">
                  <input
                    type="checkbox" checked={data.accepted}
                    onChange={() => set('accepted', !data.accepted)}
                  />
                  <span>
                    <strong>I accept the partner contract terms.<span className="ob-req">*</span></strong>
                    <em>Accepting binds the {copy.noun} to the agreement above.</em>
                  </span>
                </label>

                <Field
                  label="Digital signature" required htmlFor="ob-sign"
                  hint="Type your full legal name. This is your acceptance of the agreement."
                >
                  <input
                    id="ob-sign" type="text" className="ob-input" value={data.signature}
                    onChange={e => set('signature', e.target.value)}
                    placeholder="Your full legal name"
                  />
                </Field>

                {data.signature && (
                  <div className="ob-signed">
                    <span>Signed digitally by</span>
                    <p>{data.signature}</p>
                  </div>
                )}
              </Block>

              <Block icon="check" title="What you are sending">
                <ul className="ob-summary">
                  {[
                    {
                      label: copy.summaryLabel,
                      value: data.businessName,
                      detail: [data.categories.join(', '), [data.area, data.city].filter(Boolean).join(', ')]
                        .filter(Boolean).join(' · '),
                    },
                    {
                      label: 'Owner',
                      value: data.ownerName,
                      detail: [data.ownerEmail, data.phone && `+91 ${data.phone}`].filter(Boolean).join(' · '),
                    },
                    {
                      label: 'Hours',
                      value: `${data.days.length} day${data.days.length === 1 ? '' : 's'} a week`,
                      detail: data.days
                        .map(day => `${day.slice(0, 3)} ${(data.slots[day] || [])
                          .map(s => `${s.open}–${s.close}`).join(', ')}`)
                        .join(' · '),
                    },
                    {
                      label: isMeat ? 'Products' : 'Menu',
                      value: isMeat
                        ? 'Set up with our team after approval'
                        : data.menuMode === 'upload'
                          ? `${data.menuRows.length} item${data.menuRows.length === 1 ? '' : 's'} from a sheet`
                          : `${data.menuCategories.reduce((n, c) => n + c.items.length, 0)} items in `
                            + `${data.menuCategories.length} categor`
                            + `${data.menuCategories.length === 1 ? 'y' : 'ies'}`,
                      detail: isMeat ? 'Meat centres are listed by hand' : data.menuMode === 'upload'
                        ? data.menuFile?.name || ''
                        : data.menuCategories.map(c => c.name).join(', '),
                    },
                    {
                      label: 'Documents',
                      value: 'PAN, FSSAI, bank — all attached',
                      detail: `PAN ${data.pan} · ${data.gstExempt ? 'GST exempt' : `GST ${data.gstin}`} `
                        + `· FSSAI ${data.fssai} · A/C ending ${data.account.slice(-4)}`,
                    },
                  ].map(row => (
                    <li key={row.label}>
                      <div>
                        <span className="ob-label">{row.label}</span>
                        <strong>{row.value || '—'}</strong>
                        {row.detail && <p className="ob-hint">{row.detail}</p>}
                      </div>
                      <Icon name="check" className="ob-ico ob-ico--ok" />
                    </li>
                  ))}
                </ul>
              </Block>
            </>
          )}

          {missing.length > 0 && (
            <p className="ob-todo">
              <Icon name="info" className="ob-ico" />
              <span>
                {step === 4 ? 'Before you can send this: ' : 'Still to fill in: '}
                <strong>{humanList(missing)}</strong>.
              </span>
            </p>
          )}

          <div className="ob-actions">
            {step > 1 ? (
              <button type="button" className="ob-ghost" onClick={() => setStep(step - 1)}>
                <Icon name="arrowL" className="ob-ico" />
                Back
              </button>
            ) : (
              <Link to="/food-partner" className="ob-ghost">
                <Icon name="close" className="ob-ico" />
                Cancel
              </Link>
            )}

            <div className="ob-actions__right">
              <button type="button" className="ob-ghost ob-only-wide" onClick={() => setDraft('open')}>
                <Icon name="save" className="ob-ico" />
                Save draft
              </button>

              {step < 4 ? (
                <button
                  type="button" className="ob-go" disabled={!canLeave}
                  onClick={() => setStep(step + 1)}
                >
                  Next step
                  <Icon name="arrowR" className="ob-ico" />
                </button>
              ) : (
                <button type="button" className="ob-go" disabled={!canLeave} onClick={submit}>
                  Submit &amp; sign
                  <Icon name="check" className="ob-ico" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {draft && (
        <Modal
          title={draft === 'sent' ? 'Draft saved' : 'Save your progress'}
          onClose={() => { setDraft(null); setDraftEmail(''); }}
        >
          {draft === 'sent' ? (
            <>
              <Note tone="ok" icon="check">
                A link to pick this up again has been sent to {draftEmail}.
              </Note>
              <div className="ob-modal__foot">
                <button
                  type="button" className="ob-go"
                  onClick={() => { setDraft(null); setDraftEmail(''); }}
                >
                  Keep going
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="ob-hint">
                Leave your email and we will send a link that reopens this application
                exactly where you left it.
              </p>
              <Field label="Email address" htmlFor="ob-draft-email">
                <input
                  id="ob-draft-email" type="email" className="ob-input" value={draftEmail}
                  onChange={e => setDraftEmail(e.target.value)}
                  placeholder="you@example.com" autoFocus
                />
              </Field>
              <div className="ob-modal__foot">
                <button
                  type="button" className="ob-ghost"
                  onClick={() => { setDraft(null); setDraftEmail(''); }}
                >
                  Cancel
                </button>
                <button
                  type="button" className="ob-go" onClick={saveDraft}
                  disabled={!draftEmail.includes('@')}
                >
                  Send the link
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
