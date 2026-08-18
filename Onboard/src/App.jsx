import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar.jsx';
import HeroSlider from './components/HeroSlider.jsx';
import CategorySelector from './components/OnboardingForm/CategorySelector.jsx';
import BasicDetailsStep from './components/OnboardingForm/BasicDetailsStep.jsx';
import CategoryFieldsStep from './components/OnboardingForm/CategoryFieldsStep.jsx';
import PricingAmenitiesStep from './components/OnboardingForm/PricingAmenitiesStep.jsx';
import FormSuccessModal from './components/OnboardingForm/FormSuccessModal.jsx';
import AuthScreen from './components/Auth/AuthScreen.jsx';
import FilterBar from './components/Listings/FilterBar.jsx';
import PropertyCard from './components/Listings/PropertyCard.jsx';
import PropertyDetailModal from './components/Listings/PropertyDetailModal.jsx';
import {
  deleteProperty,
  fetchProperties,
  onboardProperty,
  uploadPropertyImages,
} from './services/api.js';
import { getCurrentUser, logout, getSavedEmployeeEmail } from './services/auth.js';
import { validateOnboarding, firstErrorKey, anchorFor } from './services/validation.js';
import { PlusCircle, AlertCircle, Building2, Loader2, CloudUpload, Database, ShieldAlert, WifiOff } from 'lucide-react';

const INITIAL_FORM_STATE = {
  name: '',
  place: '',
  ownerName: '',
  ownerMobile: '',
  // Optional second number. Blank is a valid answer and is stored as blank.
  ownerAltMobile: '',
  category: 'PG',
  employeeEmail: '',
  stayType: 'Long Stay',
  shortStayDuration: '1-7 Days',
  dailyPrice: '',
  longStayDuration: '1 Month+',
  monthlyPrice: '',
  rent: '',
  deposit: '',
  address: '',
  imageUrl: '',
  images: [],
  localImages: [],
  amenities: ['WiFi', 'AC', 'Food', 'RO Water'],
  categoryDetails: {
    foodIncluded: true,
    foodType: 'Both (Veg & Non-Veg)',
    mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
    mealTimings: {
      Breakfast: '7:30 AM - 9:30 AM',
      Lunch: '12:30 PM - 2:30 PM',
      Dinner: '8:00 PM - 10:00 PM'
    },
    sharingTypes: ['Single', '2 Sharing'],
    /* Occupancies added through "Custom" in CategoryFieldsStep. Only the
       extras are recorded here — the five standard options are a constant in
       that file, not data. */
    customSharingTypes: [],
    sharingPrices: {},
    sharingAC: {},
    sharingAcPrices: {},
    curfewTime: '10:30 PM',
    housekeeping: true
  }
};

export default function App() {
  // Authentication State
  const [user, setUser] = useState(getCurrentUser());

  const [activeTab, setActiveTab] = useState('listings'); // 'listings' | 'onboard'
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form State
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  /* Why the last submit did not save. Held in state rather than thrown at an
     alert(): an alert is gone the moment it is dismissed, and the thing it was
     explaining — a backend that is not running — is still true afterwards. */
  const [submitError, setSubmitError] = useState(null);
  const [recentlyOnboarded, setRecentlyOnboarded] = useState(null);

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('mine'); // 'mine' | 'all'

  // Modal State
  const [activeModalProperty, setActiveModalProperty] = useState(null);

  // Fetch properties only if authenticated
  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await fetchProperties();
    if (res && res.data) {
      setProperties(res.data);
    } else {
      setErrorMsg('Could not fetch listings from backend. Please ensure Node server is running.');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user && activeTab === 'listings') {
      loadData();
    }
  }, [user, activeTab]);

  // When employee logs in, attach employeeEmail (keep ownerName and ownerMobile clean for actual landlord/owner)
  useEffect(() => {
    const activeEmail = user?.email || getSavedEmployeeEmail() || '';
    if (activeEmail) {
      setFormData(prev => ({
        ...prev,
        employeeEmail: activeEmail
      }));
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    setUser(null);
  };

  // Compute stats for header badges
  const categoryCounts = properties.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  // Handle Form Basic Changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Handle Category Selection & Set Defaults
  const handleCategorySelect = (cat) => {
    let defaultCategoryDetails = {};
    if (cat === 'PG') {
      defaultCategoryDetails = {
        foodIncluded: true,
        foodType: 'Both (Veg & Non-Veg)',
        mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
        mealTimings: {
          Breakfast: '7:30 AM - 9:30 AM',
          Lunch: '12:30 PM - 2:30 PM',
          Dinner: '8:00 PM - 10:00 PM'
        },
        sharingTypes: ['Single', '2 Sharing'],
        customSharingTypes: [],
        sharingPrices: {},
        sharingAC: {},
        sharingAcPrices: {},
        curfewTime: '10:30 PM',
        housekeeping: true
      };
    } else if (cat === 'Hostel') {
      defaultCategoryDetails = {
        hostelType: 'Boys Hostel',
        roomTypes: ['Double Sharing', 'Triple Sharing'],
        canteenFacility: true,
        wardenContact: formData.ownerMobile || '',
        securityCCTV: true,
        studyRoom: true
      };
    } else if (cat === 'Dormitory') {
      defaultCategoryDetails = {
        totalBeds: 18,
        rateType: 'Daily Rate',
        bedType: 'Bunk Bed Pod',
        lockersAvailable: true,
        washroomsCount: 4,
        checkInTime: '12:00 PM'
      };
    } else if (cat === 'Bachelor Room') {
      defaultCategoryDetails = {
        roomType: '1 BHK',
        furnishing: 'Semi-Furnished',
        allowedTenants: 'Bachelors Male / Female',
        kitchenAvailable: true,
        waterSupply: '24 Hours'
      };
    }

    setFormData(prev => ({
      ...prev,
      category: cat,
      stayType: cat === 'Bachelor Room' ? '' : (prev.stayType || 'Long Stay'),
      categoryDetails: defaultCategoryDetails
    }));
  };

  // Handle Category Details Field Changes
  const handleCategoryDetailChange = (field, value) => {
    /* Clear the messages this edit could have answered, so a corrected sharing
       rent stops shouting the moment it is typed rather than at the next
       submit. Prices are keyed per option, so the whole `sharingPrice:` family
       is cleared and re-derived by the next validation pass. */
    setFormErrors(prev => {
      const next = { ...prev };
      delete next[`categoryDetails.${field}`];
      if (['sharingPrices', 'sharingAcPrices', 'sharingTypes', 'sharingAC'].includes(field)) {
        Object.keys(next).forEach((key) => {
          if (key.startsWith('sharingPrice:') || key.startsWith('sharingAcPrice:')) delete next[key];
        });
        delete next['categoryDetails.sharingTypes'];
      }
      if (field === 'mealsProvided' || field === 'foodIncluded') {
        delete next['categoryDetails.mealsProvided'];
      }
      return next;
    });

    setFormData(prev => {
      const updatedDetails = {
        ...prev.categoryDetails,
        [field]: value
      };

      const extraFields = {};
      if (['sharingPrices', 'sharingAcPrices', 'sharingTypes'].includes(field)) {
        // The headline rent is the cheapest way into the property, across both
        // the non-AC and AC rate of every sharing option still selected.
        const selectedTypes = Array.isArray(updatedDetails.sharingTypes) ? updatedDetails.sharingTypes : [];
        const prices = [updatedDetails.sharingPrices, updatedDetails.sharingAcPrices]
          .flatMap(priceMap => selectedTypes.map(type => Number((priceMap || {})[type])))
          .filter(p => !isNaN(p) && p > 0);

        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          extraFields.monthlyPrice = minPrice;
          extraFields.rent = minPrice;
        } else {
          extraFields.monthlyPrice = '';
          extraFields.rent = '';
        }
      }

      return {
        ...prev,
        categoryDetails: updatedDetails,
        ...extraFields
      };
    });
  };


  /**
   * Submit — but only if the form is actually a property.
   *
   * The order here is the whole point of this function. Validation runs FIRST
   * and returns on any failure, so an incomplete form never reaches the photo
   * upload and never reaches the database. Before this, the only checks were
   * four `.trim()` tests, so a listing with a nine-digit owner number, a ₹0
   * rent or no sharing prices at all was uploaded to Cloudinary and POSTed —
   * and the only sign anything was wrong was a red line in the console.
   */
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    // A fresh attempt: whatever the last one failed on is no longer the story.
    setSubmitError(null);

    const errs = validateOnboarding(formData);
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);

      /* Land the user on the first problem in page order, not in object-key
         order. On a form this long an un-scrolled error is an invisible one,
         and the button appears to do nothing. */
      const targetId = anchorFor(firstErrorKey(errs));
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the input directly so the user can start correcting it
          if (typeof el.focus === 'function') el.focus({ preventScroll: true });
        }
      }
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    setSubmitStage('Preparing property photos...');

    /* Photos upload before the property is created, so a failure during that
       phase leaves nothing behind and is safe to retry. Once the POST has
       been issued that stops being true. */
    let saveAttempted = false;

    try {
      const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];

      /* Photos go through the one API caller, which owns the base URL, the
         batch-then-single fallback and the ordering rules. This block used to
         re-derive its own endpoints from a second copy of VITE_API_URL. */
      const finalUrls = await uploadPropertyImages(localImages, setSubmitStage);

      // If no photos were chosen, apply default brand splash fallback
      const resolvedImages = finalUrls.length > 0 ? finalUrls : ['/lampose-logo-splash.png'];

      setSubmitStage('Saving accommodation to MongoDB database...');

      const assignedEmail = formData.employeeEmail || user?.email || getSavedEmployeeEmail() || '';

      const payload = {
        ...formData,
        employeeEmail: assignedEmail,
        images: resolvedImages,
        imageUrl: resolvedImages[0] || '/lampose-logo-splash.png'
      };
      delete payload.localImages;

      console.log('🚀 [Onboarding Started] Sending payload to backend:', payload);
      console.log(`   👨‍💼 Employee Email: "${assignedEmail}"`);
      console.log(`   📸 Images Array (${resolvedImages.length}):`, resolvedImages);

      /* From this line on, a failure is AMBIGUOUS: the request is in flight
         and the server may complete it whatever the browser goes on to see. */
      saveAttempted = true;
      const response = await onboardProperty(payload);

      console.log('📥 [Onboarding Response]:', response);

      if (response && response.success) {
        console.log('✅ [Onboarding Success] Saved property:', response.data);
        // Redirect directly to Listings page and reload
        setActiveTab('listings');
        const activeEmpEmail = user?.email || getSavedEmployeeEmail() || '';
        setFormData({
          ...INITIAL_FORM_STATE,
          employeeEmail: activeEmpEmail
        });
        setFormErrors({});
        setSubmitError(null);
        loadData();
      } else {
        console.error('❌ [Onboarding Error]:', response?.kind, response?.error || response?.message);
        const reason = response?.error || response?.message || '';

        /* Three outcomes, and they are not interchangeable to the person
           standing in a building with the owner waiting.

           'server'  the API answered and refused. Their problem to fix, and
                     the server's own words are the useful ones.
           timeout /
           network   NO answer came back. This does NOT mean nothing
                     happened: POST /properties only replies after the
                     backend has handed the owner's approval message to
                     Twilio, so a lost answer usually means the property IS
                     saved and the owner HAS been messaged. Telling them
                     "nothing was saved, press Submit again" is what creates
                     a duplicate listing and a second WhatsApp to the owner. */
        if (response?.kind === 'timeout' || response?.kind === 'uncertain') {
          setSubmitError({
            kind: 'uncertain',
            title: 'No answer from the server — this may already have gone through',
            detail:
              'The request was sent but the reply never arrived, so we cannot tell whether it '
              + 'was saved. It often was: the owner may already have the WhatsApp approval. '
              + 'Open Listings and check before submitting again — submitting now can create a '
              + 'second listing and message the owner twice.',
          });
        } else if (response?.kind === 'offline' || response?.kind === 'network') {
          setSubmitError({
            kind: 'offline',
            title: 'Could not reach the Lampose server',
            detail:
              'The server is not answering, so nothing was saved and nothing was lost — '
              + 'everything you typed is still on this page. Check that the backend is '
              + 'running, then press Submit again.',
          });
        } else {
          setSubmitError({
            kind: 'rejected',
            title: 'The server would not accept this property',
            detail: reason || 'The server rejected the request without saying why.',
          });
        }
      }
    } catch (submitErr) {
      console.error('❌ [Submission Exception]:', submitErr);
      setSubmitError(
        saveAttempted
          ? {
            kind: 'uncertain',
            title: 'No answer from the server — this may already have gone through',
            detail:
              'The property was sent but the reply never arrived, so we cannot tell whether it '
              + 'was saved. Open Listings and check before submitting again.',
          }
          : {
            kind: 'offline',
            title: 'The photos did not upload',
            detail:
              'Nothing was saved and nothing was lost — everything you typed is still on this '
              + 'page. Check your connection and press Submit again.',
          },
      );
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  // Handle Delete — the response is returned so the caller can surface a refusal
  // (the backend rejects an employee delete without an approved permission).
  const handleDeleteProperty = async (id) => {
    const res = await deleteProperty(id);
    if (res && res.success) {
      setProperties(prev => prev.filter(p => p._id !== id));
      setActiveModalProperty(null);
    }
    return res;
  };
  // Handle an approved edit landing — keep the grid and the open modal in step
  const handlePropertyUpdated = (updated) => {
    if (!updated || !updated._id) return;
    setProperties(prev => prev.map(p => (p._id === updated._id ? { ...p, ...updated } : p)));
    setActiveModalProperty(prev => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  };

  const activeEmployeeEmail = (user?.email || getSavedEmployeeEmail() || user?.name || '').toLowerCase().trim();

  const isMyProperty = (p, userEmailStr) => {
    if (!userEmailStr) return true;
    const emp = (p.employeeEmail || p.empEmail || '').toLowerCase().trim();
    if (!emp) return false;
    return emp === userEmailStr || emp.includes(userEmailStr) || userEmailStr.includes(emp);
  };

  const myPropertiesCount = properties.filter(p => isMyProperty(p, activeEmployeeEmail)).length;
  const allPropertiesCount = properties.length;

  // If user is not logged in, display full-screen Login Screen first
  if (!user) {
    return <AuthScreen onAuthSuccess={(authUser) => setUser(authUser)} />;
  }

  // Filtered Properties for Display Page
  const filteredProperties = properties.filter(p => {
    if (ownershipFilter === 'mine' && activeEmployeeEmail) {
      if (!isMyProperty(p, activeEmployeeEmail)) return false;
    }

    const matchesCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      p.name.toLowerCase().includes(q) ||
      p.place.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.ownerMobile.includes(q) ||
      ((p.employeeEmail || p.empEmail) && (p.employeeEmail || p.empEmail).toLowerCase().includes(q))
    );
    return matchesCategory && matchesSearch;
  });

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation with Auth */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={categoryCounts}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main App Workspace */}
      <main className="main-workspace">
        <div className="container">

          {/* ==================================================== */}
          {/* TAB 1: EXPLORE LIVE LISTINGS */}
          {/* ==================================================== */}
          {activeTab === 'listings' && (
            <div className="animate-fade-in">
              {/* Interactive Banner / Carousel */}
              <HeroSlider onCategorySelect={(cat) => {
                setSelectedCategory(cat);
              }} />

              {/* Search & Filter Bar */}
              <FilterBar
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                totalCount={filteredProperties.length}
                ownershipFilter={ownershipFilter}
                onOwnershipFilterChange={setOwnershipFilter}
                myCount={myPropertiesCount}
                allCount={allPropertiesCount}
                userEmail={activeEmployeeEmail}
              />

              {/* Error Message */}
              {errorMsg && (
                <div style={{
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <AlertCircle size={20} />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Listings Grid */}
              {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <p style={{ fontSize: '1.1rem' }}>Loading properties from database...</p>
                </div>
              ) : filteredProperties.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '1px solid #e2e8f0',
                  color: 'var(--text-muted)'
                }}>
                  <Building2 size={48} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#45855a' }} />
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                    {ownershipFilter === 'mine' ? 'No Accommodations Added By You Yet' : 'No Accommodations Found'}
                  </h3>
                  <p style={{ fontSize: '0.88rem' }}>
                    {ownershipFilter === 'mine'
                      ? 'You have not onboarded any properties under your account yet. Onboard a property now or explore all platform properties.'
                      : 'Try adjusting your search or category filters, or onboard a new property.'}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setActiveTab('onboard')}
                      className="btn btn-primary"
                      style={{ padding: '8px 20px' }}
                    >
                      <PlusCircle size={16} />
                      <span>Onboard Property</span>
                    </button>
                    {ownershipFilter === 'mine' && (
                      <button
                        onClick={() => setOwnershipFilter('all')}
                        className="btn btn-secondary"
                        style={{ padding: '8px 20px' }}
                      >
                        <span>View All Platform Properties ({allPropertiesCount})</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="property-grid">
                  {filteredProperties.map(property => (
                    <PropertyCard
                      key={property._id}
                      property={property}
                      onViewDetails={() => setActiveModalProperty(property)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ==================================================== */}
          {/* TAB 2: MULTI-STEP ONBOARDING FORM */}
          {/* ==================================================== */}
          {activeTab === 'onboard' && (
            <div className="glass-card form-card animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 28px' }}>
              <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                <h2 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--text-main)' }}>
                  Onboard Your Accommodation
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Select category, fill specifications, add photos and live in seconds
                </p>
              </div>

              <form onSubmit={handleSubmitForm}>
                {/* Step 1: Category Picker */}
                <CategorySelector
                  selectedCategory={formData.category}
                  onSelectCategory={handleCategorySelect}
                />

                {/* Step 2: Essential Basic Details with Employee Field */}
                <BasicDetailsStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
                  userEmail={user?.email || getSavedEmployeeEmail()}
                />

                {/* Step 3: Dynamic Category-Specified Details */}
                <CategoryFieldsStep
                  category={formData.category}
                  details={formData.categoryDetails}
                  onChangeDetails={handleCategoryDetailChange}
                  errors={formErrors}
                />

                {/* Step 4: Pricing, Stay Types (Short/Long) & Amenities */}
                <PricingAmenitiesStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
                />

                {/*
                  Why the last press did nothing.

                  The per-field messages are the real answer, but on a form this
                  tall the failing field is usually off screen — so the count
                  goes here, next to the button that refused, and doubles as the
                  way back to it.
                */}
                {Object.keys(formErrors).length > 0 && (
                  <div
                    role="alert"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '14px 16px', marginBottom: '16px',
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px'
                    }}
                  >
                    <ShieldAlert size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ color: '#991b1b', fontSize: '0.9rem' }}>
                        {Object.keys(formErrors).length === 1
                          ? '1 field needs fixing before this can be saved'
                          : `${Object.keys(formErrors).length} fields need fixing before this can be saved`}
                      </strong>
                      <p style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '3px 0 0' }}>
                        Nothing has been sent to the database. Each one is marked in red above.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const id = anchorFor(firstErrorKey(formErrors));
                          const el = id && document.getElementById(id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            if (typeof el.focus === 'function') el.focus({ preventScroll: true });
                          }
                        }}
                        style={{
                          marginTop: '8px', padding: 0, background: 'none', border: 'none',
                          color: '#991b1b', fontWeight: 700, fontSize: '0.82rem',
                          textDecoration: 'underline', cursor: 'pointer'
                        }}
                      >
                        Go to the first one
                      </button>
                    </div>
                  </div>
                )}

                {/* The form was valid, the save was attempted, and it failed. */}
                {submitError && (() => {
                  /* 'rejected' is the only red one. The other two are amber:
                     nothing is broken about the property, the network is just
                     in the way — and 'uncertain' in particular must not read
                     as a failure, because the listing has probably been
                     created. */
                  const rejected = submitError.kind === 'rejected';
                  const uncertain = submitError.kind === 'uncertain';
                  const ink = rejected ? '#991b1b' : '#92400e';
                  const inkSoft = rejected ? '#b91c1c' : '#b45309';

                  return (
                    <div
                      role="alert"
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '14px 16px', marginBottom: '16px',
                        background: rejected ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${rejected ? '#fecaca' : '#fde68a'}`,
                        borderRadius: '12px'
                      }}
                    >
                      {rejected
                        ? <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                        : uncertain
                          ? <ShieldAlert size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '1px' }} />
                          : <WifiOff size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '1px' }} />}

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ color: ink, fontSize: '0.9rem' }}>
                          {submitError.title}
                        </strong>
                        <p style={{ color: inkSoft, fontSize: '0.82rem', margin: '3px 0 0' }}>
                          {submitError.detail}
                        </p>

                        {/* The way out of an ambiguous save is to LOOK, not to
                            press Submit again. So the only button offered is
                            the one that answers the question. */}
                        {uncertain && (
                          <button
                            type="button"
                            onClick={() => { setSubmitError(null); setActiveTab('listings'); loadData(); }}
                            className="btn btn-secondary"
                            style={{ marginTop: '10px', fontSize: '0.8rem', padding: '7px 14px', borderRadius: '9px' }}
                          >
                            Open Listings and check
                          </button>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setSubmitError(null)}
                        aria-label="Dismiss"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })()}

                {/* Submit Button */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('listings')}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ padding: '12px 28px', minWidth: '220px' }}
                  >
                    {submitting ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Loader2 size={18} className="animate-spin" />
                        <span>{submitStage || 'Uploading & Saving...'}</span>
                      </span>
                    ) : (
                      <span>Submit & Onboard Property</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

        </div>
      </main>

      {/* Global Cloud Upload & Submission Progress Modal Overlay */}
      {submitting && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }} className="animate-fade-in">
          <div style={{
            maxWidth: '440px',
            width: '100%',
            padding: '32px 24px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#eaf3ed',
              border: '2px solid #45855a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#45855a'
            }}>
              <Loader2 size={32} className="animate-spin" />
            </div>

            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#181e1b', marginBottom: '8px' }}>
              Onboarding Property...
            </h3>
            
            <p style={{ fontSize: '0.9rem', color: '#45855a', fontWeight: 700, marginBottom: '6px' }}>
              {submitStage || 'Uploading photos to Cloudinary CDN & Saving...'}
            </p>

            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Please do not close this window while images are being saved to cloud storage.
            </span>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        padding: '16px 0',
        borderTop: '1px solid var(--border-glass)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.78rem'
      }}>
        <div className="container">
          <p>© 2026 Lampose — Stay. Eat. Deliver. Live Better.</p>
        </div>
      </footer>

      {/* Onboarding Success Modal */}
      {recentlyOnboarded && (
        <FormSuccessModal
          property={recentlyOnboarded}
          onViewListings={() => {
            setRecentlyOnboarded(null);
            setActiveTab('listings');
          }}
          onResetForm={() => {
            const activeEmpEmail = user?.email || getSavedEmployeeEmail() || '';
            setRecentlyOnboarded(null);
            setFormData({
              ...INITIAL_FORM_STATE,
              employeeEmail: activeEmpEmail,
              empEmail: activeEmpEmail
            });
          }}
        />
      )}

      {/* Property Detail Modal */}
      {activeModalProperty && (
        <PropertyDetailModal
          property={activeModalProperty}
          onClose={() => setActiveModalProperty(null)}
          onDelete={handleDeleteProperty}
          onUpdated={handlePropertyUpdated}
        />
      )}
    </div>
  );
}
