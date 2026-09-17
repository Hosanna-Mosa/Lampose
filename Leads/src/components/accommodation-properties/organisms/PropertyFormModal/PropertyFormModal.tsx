import React, { useState } from 'react';
import { propertyApi, Property } from '../../../../api/propertyApi';
import { X, CheckCircle2, Building2, MapPin, User, Phone, Home, DollarSign, Sparkles, Loader2 } from 'lucide-react';
import { Box, Form, Heading, Inline, Input, Label, Option, PlainButton, Select, Text } from '../../../common/atoms';

interface PropertyFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const PropertyFormModal: React.FC<PropertyFormModalProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form State
  const [category, setCategory] = useState<'PG' | 'Hostel' | 'Dormitory' | 'Bachelor Room'>('PG');
  const [name, setName] = useState('');
  const [place, setPlace] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerMobile, setOwnerMobile] = useState('');
  const [stayType, setStayType] = useState<'Short Stay' | 'Long Stay' | 'Both Short & Long Stay'>('Long Stay');
  const [dailyPrice, setDailyPrice] = useState<number | ''>('');
  const [monthlyPrice, setMonthlyPrice] = useState<number | ''>('');
  const [rent, setRent] = useState<number | ''>('');
  const [deposit, setDeposit] = useState<number | ''>('');
  const [address, setAddress] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(['WiFi', 'AC', 'Food', 'RO Water']);

  // Category Specific State
  const [foodIncluded, setFoodIncluded] = useState(true);
  const [foodType, setFoodType] = useState('Both (Veg & Non-Veg)');
  const [sharingTypes, setSharingTypes] = useState<string[]>(['Single', '2 Sharing']);
  const [curfewTime, setCurfewTime] = useState('10:30 PM');

  const [hostelType, setHostelType] = useState('Girls Hostel');
  const [wardenContact, setWardenContact] = useState('');
  const [canteenFacility, setCanteenFacility] = useState(true);
  const [securityCCTV, setSecurityCCTV] = useState(true);

  const [totalBeds, setTotalBeds] = useState<number | ''>(16);
  const [bedType, setBedType] = useState('Bunk Bed Pod');

  const [roomType, setRoomType] = useState('1 BHK Studio');
  const [furnishing, setFurnishing] = useState('Semi-Furnished');
  const [kitchenAvailable, setKitchenAvailable] = useState(true);

  const availableAmenities = [
    'WiFi', 'AC', 'Food', 'TV', 'Housekeeping', 'Power Backup',
    'RO Water', 'Washing Machine', 'CCTV Security', 'Parking', 'Kitchen Setup', 'Balcony'
  ];

  const toggleAmenity = (item: string) => {
    if (selectedAmenities.includes(item)) {
      setSelectedAmenities(selectedAmenities.filter(a => a !== item));
    } else {
      setSelectedAmenities([...selectedAmenities, item]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !place || !ownerName || !ownerMobile) {
      setError('Please fill in all required fields (Property Name, Location, Owner Name, Mobile).');
      return;
    }

    setLoading(true);
    setError('');

    let categoryDetails: any = {};
    if (category === 'PG') {
      categoryDetails = { foodIncluded, foodType, sharingTypes, curfewTime };
    } else if (category === 'Hostel') {
      categoryDetails = { hostelType, wardenContact, canteenFacility, securityCCTV };
    } else if (category === 'Dormitory') {
      categoryDetails = { totalBeds: Number(totalBeds || 0), bedType };
    } else if (category === 'Bachelor Room') {
      categoryDetails = { roomType, furnishing, kitchenAvailable };
    }

    const calculatedRent = rent !== '' ? Number(rent) : Number(monthlyPrice || dailyPrice || 0);

    const payload: Partial<Property> = {
      name,
      place,
      ownerName,
      ownerMobile,
      category,
      stayType,
      dailyPrice: Number(dailyPrice || 0),
      monthlyPrice: Number(monthlyPrice || 0),
      rent: calculatedRent,
      deposit: Number(deposit || 0),
      address,
      imageUrl: imageUrl.trim() || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80',
      amenities: selectedAmenities,
      categoryDetails
    };

    try {
      const res = await propertyApi.createProperty(payload);
      if (res.success) {
        onSuccess();
        onClose();
      } else {
        setError(res.message || 'Failed to onboard property.');
      }
    } catch (err: any) {
      setError(err.message || 'Error creating property entry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <Box className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl space-y-6 relative overflow-y-auto">
        <PlainButton
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </PlainButton>

        {/* Modal Title */}
        <Box className="flex items-center gap-3">
          <Box className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <Building2 className="w-5 h-5" />
          </Box>
          <Box>
            <Heading level={2} className="text-xl font-extrabold text-slate-900">Onboard New Property</Heading>
            <Text className="text-xs text-slate-500">Add PG, Hostel, Dormitory, or Bachelor Room listing</Text>
          </Box>
        </Box>

        {error && (
          <Box className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </Box>
        )}

        <Form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Category Selector */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600">1. Select Accommodation Category *</Label>
            <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['PG', 'Hostel', 'Dormitory', 'Bachelor Room'] as const).map((cat) => (
                <PlainButton
                  type="button"
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`p-3 rounded-xl border text-xs font-bold transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                    category === cat
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-600 shadow-lg shadow-cyan-500/10'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <Home className="w-4 h-4" />
                  <Inline>{cat}</Inline>
                </PlainButton>
              ))}
            </Box>
          </Box>

          {/* Step 2: Basic Details */}
          <Box className="space-y-3 pt-2 border-t border-slate-200">
            <Heading level={3} className="text-xs font-bold text-cyan-600 uppercase tracking-wider">2. Basic Property & Owner Information</Heading>
            
            <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Property Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Starlight Luxury PG"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </Box>

              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Place / Location *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Koramangala, Bangalore"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </Box>

              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Owner Name *</Label>
                <Input
                  type="text"
                  placeholder="e.g. Rajesh Kumar"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </Box>

              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Owner Mobile *</Label>
                <Input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={ownerMobile}
                  onChange={(e) => setOwnerMobile(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </Box>
            </Box>

            <Box>
              <Label className="text-2xs font-semibold text-slate-500">Image URL (Optional)</Label>
              <Input
                type="text"
                placeholder="https://images.unsplash.com/photo-..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
              />
            </Box>
          </Box>

          {/* Step 3: Category Specific Fields */}
          <Box className="space-y-3 pt-2 border-t border-slate-200">
            <Heading level={3} className="text-xs font-bold text-amber-600 uppercase tracking-wider">3. Category Specific Configurations ({category})</Heading>

            {category === 'PG' && (
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <Box>
                  <Label className="text-slate-500">Food Type</Label>
                  <Select
                    value={foodType}
                    onChange={(e) => setFoodType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <Option value="Veg Only">Veg Only</Option>
                    <Option value="Non-Veg Only">Non-Veg Only</Option>
                    <Option value="Both (Veg & Non-Veg)">Both (Veg & Non-Veg)</Option>
                  </Select>
                </Box>

                <Box>
                  <Label className="text-slate-500">Curfew Time</Label>
                  <Input
                    type="text"
                    value={curfewTime}
                    onChange={(e) => setCurfewTime(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </Box>
              </Box>
            )}

            {category === 'Hostel' && (
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <Box>
                  <Label className="text-slate-500">Hostel Type</Label>
                  <Select
                    value={hostelType}
                    onChange={(e) => setHostelType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <Option value="Boys Hostel">Boys Hostel</Option>
                    <Option value="Girls Hostel">Girls Hostel</Option>
                    <Option value="Co-ed Hostel">Co-ed Hostel</Option>
                  </Select>
                </Box>

                <Box>
                  <Label className="text-slate-500">Warden Mobile Contact</Label>
                  <Input
                    type="text"
                    placeholder="+91 91234 56789"
                    value={wardenContact}
                    onChange={(e) => setWardenContact(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </Box>
              </Box>
            )}

            {category === 'Dormitory' && (
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <Box>
                  <Label className="text-slate-500">Total Bunk Beds</Label>
                  <Input
                    type="number"
                    value={totalBeds}
                    onChange={(e) => setTotalBeds(e.target.value ? Number(e.target.value) : '')}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </Box>

                <Box>
                  <Label className="text-slate-500">Bed Type</Label>
                  <Input
                    type="text"
                    value={bedType}
                    onChange={(e) => setBedType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </Box>
              </Box>
            )}

            {category === 'Bachelor Room' && (
              <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <Box>
                  <Label className="text-slate-500">Room Format</Label>
                  <Input
                    type="text"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </Box>

                <Box>
                  <Label className="text-slate-500">Furnishing</Label>
                  <Select
                    value={furnishing}
                    onChange={(e) => setFurnishing(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <Option value="Fully Furnished">Fully Furnished</Option>
                    <Option value="Semi-Furnished">Semi-Furnished</Option>
                    <Option value="Unfurnished">Unfurnished</Option>
                  </Select>
                </Box>
              </Box>
            )}
          </Box>

          {/* Step 4: Pricing & Amenities */}
          <Box className="space-y-3 pt-2 border-t border-slate-200">
            <Heading level={3} className="text-xs font-bold text-emerald-600 uppercase tracking-wider">4. Rent Pricing & Amenities</Heading>

            <Box className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Monthly Rent (₹) *</Label>
                <Input
                  type="number"
                  placeholder="e.g. 9500"
                  value={rent}
                  onChange={(e) => setRent(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </Box>

              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Security Deposit (₹)</Label>
                <Input
                  type="number"
                  placeholder="e.g. 15000"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                />
              </Box>

              <Box>
                <Label className="text-2xs font-semibold text-slate-500">Stay Option</Label>
                <Select
                  value={stayType}
                  onChange={(e: any) => setStayType(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 cursor-pointer"
                >
                  <Option value="Long Stay">Long Stay (Monthly)</Option>
                  <Option value="Short Stay">Short Stay (Daily)</Option>
                  <Option value="Both Short & Long Stay">Both Short & Long Stay</Option>
                </Select>
              </Box>
            </Box>

            <Box>
              <Label className="text-2xs font-semibold text-slate-500 mb-1.5 block">Select Included Amenities</Label>
              <Box className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {availableAmenities.map((amenity) => (
                  <PlainButton
                    type="button"
                    key={amenity}
                    onClick={() => toggleAmenity(amenity)}
                    className={`p-2 rounded-xl border text-2xs font-semibold flex items-center justify-between transition cursor-pointer ${
                      selectedAmenities.includes(amenity)
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <Inline>{amenity}</Inline>
                    {selectedAmenities.includes(amenity) && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600" />}
                  </PlainButton>
                ))}
              </Box>
            </Box>
          </Box>

          <Box className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <PlainButton
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </PlainButton>
            <PlainButton
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <Inline>Onboard Property Listing</Inline>
            </PlainButton>
          </Box>
        </Form>
      </Box>
    </Box>
  );
};
