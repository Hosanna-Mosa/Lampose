import React, { useState, useEffect } from 'react';
import { Navbar } from './components/property-onboarding/organisms/Navbar';
import { HeroSlider } from './components/property-onboarding/organisms/HeroSlider';
import { CategorySelector } from './components/property-onboarding/organisms/CategorySelector';
import { BasicDetailsStep } from './components/property-onboarding/organisms/BasicDetailsStep';
import { CategoryFieldsStep } from './components/property-onboarding/organisms/CategoryFieldsStep';
import { PricingAmenitiesStep } from './components/property-onboarding/organisms/PricingAmenitiesStep';
import { FormSuccessModal } from './components/property-onboarding/organisms/FormSuccessModal';
import { FilterBar } from './components/property-onboarding/molecules/FilterBar';
import { PropertyCard } from './components/property-onboarding/organisms/PropertyCard';
import { PropertyDetailModal } from './components/property-onboarding/organisms/PropertyDetailModal';
import { fetchProperties, onboardProperty, deleteProperty } from './components/property-onboarding/utils/api.js';
import { PlusCircle, AlertCircle, Building2 } from 'lucide-react';
import { INITIAL_FORM_STATE } from './components/property-onboarding/utils/initialFormState';
import { Box, ContentInfo, Form, Heading, Inline, Main, PlainButton, Text } from './components/common/atoms';


export function App() {
  const [activeTab, setActiveTab] = useState('listings'); // 'listings' | 'onboard'
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form State
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [recentlyOnboarded, setRecentlyOnboarded] = useState(null);

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal State
  const [activeModalProperty, setActiveModalProperty] = useState(null);

  // Fetch properties on load
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
    loadData();
  }, []);

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
        sharingTypes: ['Single', '2 Sharing'],
        acAvailable: true,
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
      categoryDetails: defaultCategoryDetails
    }));
  };

  // Handle Category Details Field Changes
  const handleCategoryDetailChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      categoryDetails: {
        ...prev.categoryDetails,
        [field]: value
      }
    }));
  };

  // Form Validation
  const validateForm = () => {
    const errs = {};
    if (!formData.name.trim()) errs.name = 'Property name is required';
    if (!formData.place.trim()) errs.place = 'Place / Location is required';
    if (!formData.ownerName.trim()) errs.ownerName = 'Owner name is required';
    if (!formData.ownerMobile.trim()) errs.ownerMobile = 'Owner mobile number is required';
    return errs;
  };

  // Handle Form Submission
  const handleSubmitForm = async (e) => {
    e.preventDefault();
    const errs = validateForm();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      return;
    }

    setSubmitting(true);
    const response = await onboardProperty(formData);
    setSubmitting(false);

    if (response && response.success) {
      setRecentlyOnboarded(response.data);
      loadData();
    } else {
      alert(`Failed to onboard property: ${response.error || response.message || 'Unknown error'}`);
    }
  };

  // Handle Delete
  const handleDeleteProperty = async (id) => {
    const res = await deleteProperty(id);
    if (res && res.success) {
      setProperties(prev => prev.filter(p => p._id !== id));
    }
  };

  // Filtered Properties for Display Page
  const filteredProperties = properties.filter(p => {
    const matchesCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      p.name.toLowerCase().includes(q) ||
      p.place.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.ownerMobile.includes(q)
    );
    return matchesCategory && matchesSearch;
  });

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation */}
      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} counts={categoryCounts} />

      {/* Main App Workspace */}
      <Main style={{ flex: 1, padding: '16px 0 40px' }}>
        <Box className="container">

          {/* ==================================================== */}
          {/* TAB 1: EXPLORE / DISPLAY PROPERTIES LISTINGS */}
          {/* ==================================================== */}
          {activeTab === 'listings' && (
            <Box>
              {/* Interactive Auto-Rotating Hero Carousel Slider - NO GRID LINES BEHIND HERO */}
              <HeroSlider onOnboardClick={() => setActiveTab('onboard')} />

              {/* GRID LINES PATTERN STARTS STRICTLY BELOW HERO SECTION */}
              <Box className="grid-lines-below-hero">
                {/* Filter & Search Bar */}
                <FilterBar
                  selectedCategory={selectedCategory}
                  onCategoryChange={setSelectedCategory}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  totalCount={filteredProperties.length}
                />

                {/* Error Message */}
                {errorMsg && (
                  <Box style={{
                    padding: '14px 16px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.3)',
                    color: '#f43f5e',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.9rem'
                  }}>
                    <AlertCircle size={18} />
                    <Inline>{errorMsg}</Inline>
                  </Box>
                )}

                {/* Loading Spinner */}
                {loading ? (
                  <Box style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <Box style={{ fontSize: '1rem', marginBottom: '8px' }}>Loading Lampose properties...</Box>
                  </Box>
                ) : filteredProperties.length === 0 ? (
                  <Box className="glass-card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <Building2 size={40} color="var(--lampose-gold)" style={{ margin: '0 auto 12px' }} />
                    <Heading level={3} style={{ fontSize: '1.2rem', color: '#ffffff', marginBottom: '6px' }}>No Properties Found</Heading>
                    <Text style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '0.88rem' }}>
                      No accommodations matched your search or category filter. Try clearing filters or onboard a new property!
                    </Text>
                    <PlainButton onClick={() => setActiveTab('onboard')} className="btn btn-primary">
                      <PlusCircle size={16} />
                      <Inline>Onboard Property Now</Inline>
                    </PlainButton>
                  </Box>
                ) : (
                  /* Properties Grid Display */
                  <Box className="property-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                    gap: '18px'
                  }}>
                    {filteredProperties.map(property => (
                      <PropertyCard
                        key={property._id}
                        property={property}
                        onViewDetails={(p) => setActiveModalProperty(p)}
                      />
                    ))}
                  </Box>
                )}
              </Box>
            </Box>
          )}

          {/* ==================================================== */}
          {/* TAB 2: PROPERTY ONBOARDING FORM */}
          {/* ==================================================== */}
          {activeTab === 'onboard' && (
            <Box style={{ maxWidth: '840px', margin: '0 auto' }}>
              <Box style={{
                marginBottom: '16px',
                textAlign: 'center',
                padding: '16px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid var(--border-gold)'
              }}>
                <Inline className="badge badge-pg" style={{ marginBottom: '6px', background: 'rgba(216, 153, 62, 0.25)', color: '#f5b963', borderColor: 'rgba(216, 153, 62, 0.5)' }}>
                  LAMPOSE ONBOARDING PORTAL
                </Inline>
                <Heading level={1} style={{ fontSize: 'clamp(1.4rem, 4vw, 2rem)', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                  Onboard Your Accommodation
                </Heading>
                <Text style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                  Collect name, place, owner name, owner mobile number & category-specific attributes for PGs, Hostels, Dormitories, or Bachelor Rooms.
                </Text>
              </Box>

              {/* Form Container */}
              <Form onSubmit={handleSubmitForm} className="glass-card form-card" style={{ padding: '24px' }}>
                {/* Step 1: Category Selector */}
                <CategorySelector
                  selectedCategory={formData.category}
                  onSelectCategory={handleCategorySelect}
                />

                {/* Step 2: Basic Property & Owner Details */}
                <BasicDetailsStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
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
                <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
                  <PlainButton
                    type="button"
                    onClick={() => setActiveTab('listings')}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </PlainButton>

                  <PlainButton
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ padding: '12px 28px' }}
                  >
                    {submitting ? 'Saving to MongoDB...' : 'Submit & Onboard Property'}
                  </PlainButton>
                </Box>
              </Form>
            </Box>
          )}

        </Box>
      </Main>

      {/* Footer */}
      <ContentInfo style={{
        padding: '16px 0',
        borderTop: '1px solid var(--border-glass)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.78rem'
      }}>
        <Box className="container">
          <Text>© 2026 Lampose — Stay. Eat. Deliver. Live Better.</Text>
        </Box>
      </ContentInfo>

      {/* Onboarding Success Modal */}
      {recentlyOnboarded && (
        <FormSuccessModal
          property={recentlyOnboarded}
          onViewListings={() => {
            setRecentlyOnboarded(null);
            setActiveTab('listings');
          }}
          onResetForm={() => {
            setRecentlyOnboarded(null);
            setFormData(INITIAL_FORM_STATE);
          }}
        />
      )}

      {/* Property Detail Specifications Modal */}
      {activeModalProperty && (
        <PropertyDetailModal
          property={activeModalProperty}
          onClose={() => setActiveModalProperty(null)}
          onDelete={handleDeleteProperty}
        />
      )}
    </Box>
  );
}
