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
import { fetchProperties, onboardProperty, deleteProperty } from './services/api.js';
import { getCurrentUser, logout, getSavedEmployeeEmail } from './services/auth.js';
import { PlusCircle, AlertCircle, Building2, Loader2, CloudUpload, Database } from 'lucide-react';

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
  const [recentlyOnboarded, setRecentlyOnboarded] = useState(null);

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

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

  // Form Validation
  const validateForm = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Property name is required';
    if (!formData.place.trim()) errs.place = 'Place / Location is required';
    if (!formData.ownerName.trim()) errs.ownerName = 'Owner name is required';
    if (!formData.ownerMobile.trim()) errs.ownerMobile = 'Owner WhatsApp number is required';

    /* The second number is optional, so an empty box is never an error. A
       half-typed one is: silently storing "98765" would look like a recorded
       contact and be useless to whoever calls it. */
    const altMobile = (formData.ownerAltMobile || '').trim();
    if (altMobile && altMobile.replace(/\D/g, '').length < 10) {
      errs.ownerAltMobile = 'Enter the full mobile number, or leave this blank';
    }
    return errs;
  };

  // Handle Form Submission (Uploads Images to Cloudinary on Submit & Saves to DB)
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);

      // Map error fields to element IDs for scrolling
      const idMap = {
        name: 'propertyName',
        place: 'propertyPlace',
        ownerName: 'ownerName',
        ownerMobile: 'ownerMobile',
        ownerAltMobile: 'ownerAltMobile'
      };

      const firstErrorField = Object.keys(errs)[0];
      const targetId = idMap[firstErrorField];
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the input directly so the user can start correcting it
          el.focus({ preventScroll: true });
        }
      }
      return;
    }

    setSubmitting(true);
    setSubmitStage('Preparing property photos...');

    try {
      const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001/api/properties';
      const singleEndpoint = API_BASE.replace(/\/properties\/?$/, '/properties/upload-image');
      const batchEndpoint = API_BASE.replace(/\/properties\/?$/, '/properties/upload-images');

      const finalUrls = [];

      // Separate items with pending files from existing URLs
      const filesToUpload = localImages.filter(item => item.file);

      if (filesToUpload.length > 0) {
        setSubmitStage(`Uploading ${filesToUpload.length} photo(s) to Cloudinary CDN...`);

        // Try batch upload endpoint first
        let batchSuccess = false;
        try {
          const batchFd = new FormData();
          filesToUpload.forEach(item => batchFd.append('images', item.file));
          
          const batchRes = await fetch(batchEndpoint, {
            method: 'POST',
            body: batchFd
          });

          if (batchRes.ok) {
            const batchJson = await batchRes.json();
            if (batchJson.success && Array.isArray(batchJson.urls) && batchJson.urls.length === filesToUpload.length) {
              let urlIdx = 0;
              localImages.forEach(item => {
                if (item.file) {
                  finalUrls.push(batchJson.urls[urlIdx++]);
                } else if (item.url) {
                  finalUrls.push(item.url);
                }
              });
              batchSuccess = true;
            }
          }
        } catch (bErr) {
          console.warn('Batch upload route skipped, using direct upload:', bErr);
        }

        // Fallback to concurrent single uploads if batch did not return
        if (!batchSuccess) {
          for (let i = 0; i < localImages.length; i++) {
            const item = localImages[i];
            if (item.file) {
              setSubmitStage(`Uploading photo ${i + 1} of ${localImages.length} to Cloudinary...`);
              const singleFd = new FormData();
              singleFd.append('image', item.file);
              const res = await fetch(singleEndpoint, { method: 'POST', body: singleFd });
              const json = await res.json();
              if (json.success && json.url) {
                finalUrls.push(json.url);
              }
            } else if (item.url) {
              finalUrls.push(item.url);
            }
          }
        }
      } else {
        // Only existing URLs or presets
        localImages.forEach(item => {
          if (item.url) finalUrls.push(item.url);
        });
      }

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
        loadData();
      } else {
        console.error('❌ [Onboarding Error]:', response?.error || response?.message);
        alert(`Failed to onboard property: ${response.error || response.message || 'Unknown error'}`);
      }
    } catch (submitErr) {
      console.error('❌ [Submission Exception]:', submitErr);
      alert('An error occurred while uploading photos or saving property. Please try again.');
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

  // If user is not logged in, display full-screen Login Screen first
  if (!user) {
    return <AuthScreen onAuthSuccess={(authUser) => setUser(authUser)} />;
  }

  // Filtered Properties for Display Page
  const filteredProperties = properties.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      p.name.toLowerCase().includes(q) ||
      p.place.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.ownerMobile.includes(q) ||
      (p.employeeEmail && p.employeeEmail.toLowerCase().includes(q))
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
                  <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '4px' }}>No Accommodations Found</h3>
                  <p style={{ fontSize: '0.88rem' }}>Try adjusting your search or category filters, or onboard a new property.</p>
                  <button
                    onClick={() => setActiveTab('onboard')}
                    className="btn btn-primary"
                    style={{ marginTop: '16px', padding: '8px 20px' }}
                  >
                    <PlusCircle size={16} />
                    <span>Onboard First Property</span>
                  </button>
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
                />

                {/* Step 4: Pricing, Stay Types (Short/Long) & Amenities */}
                <PricingAmenitiesStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
                />

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
