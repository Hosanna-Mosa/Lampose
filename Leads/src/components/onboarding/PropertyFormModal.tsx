import React, { useState } from 'react';
import { propertyApi, Property } from '../../api/propertyApi';
import { X, CheckCircle2, Building2, MapPin, User, Phone, Home, DollarSign, Sparkles, Loader2 } from 'lucide-react';

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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4 font-['Plus_Jakarta_Sans',sans-serif]">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl space-y-6 relative overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-500/20">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Onboard New Property</h2>
            <p className="text-xs text-slate-500">Add PG, Hostel, Dormitory, or Bachelor Room listing</p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Category Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600">1. Select Accommodation Category *</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['PG', 'Hostel', 'Dormitory', 'Bachelor Room'] as const).map((cat) => (
                <button
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
                  <span>{cat}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Basic Details */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold text-cyan-600 uppercase tracking-wider">2. Basic Property & Owner Information</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-2xs font-semibold text-slate-500">Property Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Starlight Luxury PG"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-slate-500">Place / Location *</label>
                <input
                  type="text"
                  placeholder="e.g. Koramangala, Bangalore"
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-slate-500">Owner Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Rajesh Kumar"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-slate-500">Owner Mobile *</label>
                <input
                  type="text"
                  placeholder="e.g. +91 98765 43210"
                  value={ownerMobile}
                  onChange={(e) => setOwnerMobile(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-2xs font-semibold text-slate-500">Image URL (Optional)</label>
              <input
                type="text"
                placeholder="https://images.unsplash.com/photo-..."
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Step 3: Category Specific Fields */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider">3. Category Specific Configurations ({category})</h3>

            {category === 'PG' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <label className="text-slate-500">Food Type</label>
                  <select
                    value={foodType}
                    onChange={(e) => setFoodType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <option value="Veg Only">Veg Only</option>
                    <option value="Non-Veg Only">Non-Veg Only</option>
                    <option value="Both (Veg & Non-Veg)">Both (Veg & Non-Veg)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500">Curfew Time</label>
                  <input
                    type="text"
                    value={curfewTime}
                    onChange={(e) => setCurfewTime(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </div>
              </div>
            )}

            {category === 'Hostel' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <label className="text-slate-500">Hostel Type</label>
                  <select
                    value={hostelType}
                    onChange={(e) => setHostelType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <option value="Boys Hostel">Boys Hostel</option>
                    <option value="Girls Hostel">Girls Hostel</option>
                    <option value="Co-ed Hostel">Co-ed Hostel</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-500">Warden Mobile Contact</label>
                  <input
                    type="text"
                    placeholder="+91 91234 56789"
                    value={wardenContact}
                    onChange={(e) => setWardenContact(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </div>
              </div>
            )}

            {category === 'Dormitory' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <label className="text-slate-500">Total Bunk Beds</label>
                  <input
                    type="number"
                    value={totalBeds}
                    onChange={(e) => setTotalBeds(e.target.value ? Number(e.target.value) : '')}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-500">Bed Type</label>
                  <input
                    type="text"
                    value={bedType}
                    onChange={(e) => setBedType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </div>
              </div>
            )}

            {category === 'Bachelor Room' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <label className="text-slate-500">Room Format</label>
                  <input
                    type="text"
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  />
                </div>

                <div>
                  <label className="text-slate-500">Furnishing</label>
                  <select
                    value={furnishing}
                    onChange={(e) => setFurnishing(e.target.value)}
                    className="w-full mt-1 p-2 rounded-xl bg-white border border-slate-200 text-slate-900 text-xs"
                  >
                    <option value="Fully Furnished">Fully Furnished</option>
                    <option value="Semi-Furnished">Semi-Furnished</option>
                    <option value="Unfurnished">Unfurnished</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Pricing & Amenities */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider">4. Rent Pricing & Amenities</h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-2xs font-semibold text-slate-500">Monthly Rent (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 9500"
                  value={rent}
                  onChange={(e) => setRent(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-slate-500">Security Deposit (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 15000"
                  value={deposit}
                  onChange={(e) => setDeposit(e.target.value ? Number(e.target.value) : '')}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-2xs font-semibold text-slate-500">Stay Option</label>
                <select
                  value={stayType}
                  onChange={(e: any) => setStayType(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 cursor-pointer"
                >
                  <option value="Long Stay">Long Stay (Monthly)</option>
                  <option value="Short Stay">Short Stay (Daily)</option>
                  <option value="Both Short & Long Stay">Both Short & Long Stay</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-2xs font-semibold text-slate-500 mb-1.5 block">Select Included Amenities</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {availableAmenities.map((amenity) => (
                  <button
                    type="button"
                    key={amenity}
                    onClick={() => toggleAmenity(amenity)}
                    className={`p-2 rounded-xl border text-2xs font-semibold flex items-center justify-between transition cursor-pointer ${
                      selectedAmenities.includes(amenity)
                        ? 'border-cyan-500 bg-cyan-50 text-cyan-600'
                        : 'border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <span>{amenity}</span>
                    {selectedAmenities.includes(amenity) && <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20 transition cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>Onboard Property Listing</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
