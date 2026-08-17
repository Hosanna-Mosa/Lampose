import React from 'react';
import { Property } from '../../api/propertyApi';
import { X, MapPin, Phone, User, Home, Shield, DollarSign, CheckCircle2, Building2 } from 'lucide-react';

interface PropertyDetailModalProps {
  property: Property;
  onClose: () => void;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({ property, onClose }) => {
  const cd = property.categoryDetails || {};

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl space-y-6 relative overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero Header */}
        <div className="relative h-56 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
          <img
            src={property.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'}
            alt={property.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/35 to-transparent" />

          <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500 text-white shadow-lg">
                {property.category}
              </span>
              <h2 className="text-xl font-extrabold text-slate-900 mt-1.5">{property.name}</h2>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-600" />
                <span>{property.place}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium">Rent</span>
              <div className="text-2xl font-extrabold text-cyan-600">
                ₹{property.rent ? property.rent.toLocaleString() : '0'}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Contact & Pricing Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <div>
            <span className="text-slate-500 font-medium">Owner Name</span>
            <p className="font-bold text-slate-900 mt-0.5">{property.ownerName}</p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Contact Mobile</span>
            <p className="font-bold text-cyan-600 font-mono mt-0.5">{property.ownerMobile}</p>
          </div>
          <div>
            <span className="text-slate-500 font-medium">Security Deposit</span>
            <p className="font-bold text-amber-600 mt-0.5">₹{property.deposit ? property.deposit.toLocaleString() : '0'}</p>
          </div>
        </div>

        {/* Address */}
        {property.address && (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <span className="font-bold text-slate-600">Full Address</span>
            <p className="text-slate-500">{property.address}</p>
          </div>
        )}

        {/* Category Specific Details */}
        <div className="space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-600" />
            <span>Category Specific Information ({property.category})</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            {property.category === 'PG' && (
              <>
                <div>
                  <span className="text-slate-500">Food Included:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.foodIncluded ? 'Yes' : 'No'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Food Type:</span>
                  <span className="ml-2 font-bold text-cyan-600">{cd.foodType || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Sharing Options:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.sharingTypes ? cd.sharingTypes.join(', ') : 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Curfew Time:</span>
                  <span className="ml-2 font-bold text-amber-600">{cd.curfewTime || 'No Curfew'}</span>
                </div>
              </>
            )}

            {property.category === 'Hostel' && (
              <>
                <div>
                  <span className="text-slate-500">Hostel Type:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.hostelType || 'Boys / Girls Hostel'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Warden Contact:</span>
                  <span className="ml-2 font-bold text-cyan-600 font-mono">{cd.wardenContact || 'On-site'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Canteen Facility:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.canteenFacility ? 'Available' : 'None'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Security & CCTV:</span>
                  <span className="ml-2 font-bold text-emerald-600">{cd.securityCCTV ? '24/7 Monitored' : 'Standard'}</span>
                </div>
              </>
            )}

            {property.category === 'Dormitory' && (
              <>
                <div>
                  <span className="text-slate-500">Total Bunk Beds:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.totalBeds || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Bed Type:</span>
                  <span className="ml-2 font-bold text-cyan-600">{cd.bedType || 'Bunk Bed Pod'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Washrooms Count:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.washroomsCount || '4+ Washrooms'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Check-in Policy:</span>
                  <span className="ml-2 font-bold text-amber-600">{cd.checkInTime || '12:00 PM'}</span>
                </div>
              </>
            )}

            {property.category === 'Bachelor Room' && (
              <>
                <div>
                  <span className="text-slate-500">Room Type:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.roomType || '1 BHK Studio'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Furnishing:</span>
                  <span className="ml-2 font-bold text-cyan-600">{cd.furnishing || 'Semi-Furnished'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Kitchen Setup:</span>
                  <span className="ml-2 font-bold text-slate-900">{cd.kitchenAvailable ? 'Independent Kitchen' : 'Shared'}</span>
                </div>
                <div>
                  <span className="text-slate-500">Water Supply:</span>
                  <span className="ml-2 font-bold text-emerald-600">{cd.waterSupply || '24 Hours'}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Amenities List */}
        {property.amenities && property.amenities.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900">Included Amenities</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {property.amenities.map((amenity, idx) => (
                <div key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <span>{amenity}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
