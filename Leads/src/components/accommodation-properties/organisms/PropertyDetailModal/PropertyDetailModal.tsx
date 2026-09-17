import React from 'react';
import { Property } from '../../../../api/propertyApi';
import { X, MapPin, Phone, User, Home, Shield, DollarSign, CheckCircle2, Building2 } from 'lucide-react';
import { Box, Heading, Image, Inline, PlainButton, Text } from '../../../common/atoms';

interface PropertyDetailModalProps {
  property: Property;
  onClose: () => void;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({ property, onClose }) => {
  const cd = property.categoryDetails || {};

  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <Box className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-2xl max-h-[90vh] shadow-2xl space-y-6 relative overflow-y-auto">
        <PlainButton
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer z-10"
        >
          <X className="w-4 h-4" />
        </PlainButton>

        {/* Hero Header */}
        <Box className="relative h-56 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200">
          <Image
            src={property.imageUrl || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'}
            alt={property.name}
            className="w-full h-full object-cover"
          />
          <Box className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/35 to-transparent" />

          <Box className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
            <Box>
              <Inline className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500 text-white shadow-lg">
                {property.category}
              </Inline>
              <Heading level={2} className="text-xl font-extrabold text-slate-900 mt-1.5">{property.name}</Heading>
              <Box className="flex items-center gap-1.5 text-xs text-slate-600 mt-1">
                <MapPin className="w-3.5 h-3.5 text-cyan-600" />
                <Inline>{property.place}</Inline>
              </Box>
            </Box>

            <Box className="text-right">
              <Inline className="text-xs text-slate-500 font-medium">Rent</Inline>
              <Box className="text-2xl font-extrabold text-cyan-600">
                ₹{property.rent ? property.rent.toLocaleString() : '0'}
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Quick Contact & Pricing Bar */}
        <Box className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <Box>
            <Inline className="text-slate-500 font-medium">Owner Name</Inline>
            <Text className="font-bold text-slate-900 mt-0.5">{property.ownerName}</Text>
          </Box>
          <Box>
            <Inline className="text-slate-500 font-medium">Contact Mobile</Inline>
            <Text className="font-bold text-cyan-600 font-mono mt-0.5">{property.ownerMobile}</Text>
          </Box>
          <Box>
            <Inline className="text-slate-500 font-medium">Security Deposit</Inline>
            <Text className="font-bold text-amber-600 mt-0.5">₹{property.deposit ? property.deposit.toLocaleString() : '0'}</Text>
          </Box>
        </Box>

        {/* Address */}
        {property.address && (
          <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
            <Inline className="font-bold text-slate-600">Full Address</Inline>
            <Text className="text-slate-500">{property.address}</Text>
          </Box>
        )}

        {/* Category Specific Details */}
        <Box className="space-y-3">
          <Heading level={3} className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-cyan-600" />
            <Inline>Category Specific Information ({property.category})</Inline>
          </Heading>

          <Box className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
            {property.category === 'PG' && (
              <>
                <Box>
                  <Inline className="text-slate-500">Food Included:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.foodIncluded ? 'Yes' : 'No'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Food Type:</Inline>
                  <Inline className="ml-2 font-bold text-cyan-600">{cd.foodType || 'N/A'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Sharing Options:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.sharingTypes ? cd.sharingTypes.join(', ') : 'N/A'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Curfew Time:</Inline>
                  <Inline className="ml-2 font-bold text-amber-600">{cd.curfewTime || 'No Curfew'}</Inline>
                </Box>
              </>
            )}

            {property.category === 'Hostel' && (
              <>
                <Box>
                  <Inline className="text-slate-500">Hostel Type:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.hostelType || 'Boys / Girls Hostel'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Warden Contact:</Inline>
                  <Inline className="ml-2 font-bold text-cyan-600 font-mono">{cd.wardenContact || 'On-site'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Canteen Facility:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.canteenFacility ? 'Available' : 'None'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Security & CCTV:</Inline>
                  <Inline className="ml-2 font-bold text-emerald-600">{cd.securityCCTV ? '24/7 Monitored' : 'Standard'}</Inline>
                </Box>
              </>
            )}

            {property.category === 'Dormitory' && (
              <>
                <Box>
                  <Inline className="text-slate-500">Total Bunk Beds:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.totalBeds || 'N/A'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Bed Type:</Inline>
                  <Inline className="ml-2 font-bold text-cyan-600">{cd.bedType || 'Bunk Bed Pod'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Washrooms Count:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.washroomsCount || '4+ Washrooms'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Check-in Policy:</Inline>
                  <Inline className="ml-2 font-bold text-amber-600">{cd.checkInTime || '12:00 PM'}</Inline>
                </Box>
              </>
            )}

            {property.category === 'Bachelor Room' && (
              <>
                <Box>
                  <Inline className="text-slate-500">Room Type:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.roomType || '1 BHK Studio'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Furnishing:</Inline>
                  <Inline className="ml-2 font-bold text-cyan-600">{cd.furnishing || 'Semi-Furnished'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Kitchen Setup:</Inline>
                  <Inline className="ml-2 font-bold text-slate-900">{cd.kitchenAvailable ? 'Independent Kitchen' : 'Shared'}</Inline>
                </Box>
                <Box>
                  <Inline className="text-slate-500">Water Supply:</Inline>
                  <Inline className="ml-2 font-bold text-emerald-600">{cd.waterSupply || '24 Hours'}</Inline>
                </Box>
              </>
            )}
          </Box>
        </Box>

        {/* Amenities List */}
        {property.amenities && property.amenities.length > 0 && (
          <Box className="space-y-3">
            <Heading level={3} className="text-sm font-extrabold text-slate-900">Included Amenities</Heading>
            <Box className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {property.amenities.map((amenity, idx) => (
                <Box key={idx} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <Inline>{amenity}</Inline>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        <Box className="pt-3 border-t border-slate-200 flex justify-end">
          <PlainButton
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
          >
            Close Inspector
          </PlainButton>
        </Box>
      </Box>
    </Box>
  );
};
