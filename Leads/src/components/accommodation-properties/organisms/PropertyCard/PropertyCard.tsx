import React from 'react';
import { Property } from '../../../../api/propertyApi';
import { MapPin, Phone, User, Eye, Trash2, Home, Sparkles } from 'lucide-react';
import { Box, Heading, Image, Inline, PlainButton } from '../../../common/atoms';

interface PropertyCardProps {
  property: Property;
  onViewDetails: (property: Property) => void;
  onDelete: (id: string) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onViewDetails, onDelete }) => {
  const getCategoryBadgeClass = (cat: string) => {
    switch (cat) {
      case 'PG':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Hostel':
        return 'bg-cyan-100 text-cyan-700 border-cyan-200';
      case 'Dormitory':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Bachelor Room':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-300';
    }
  };

  const formattedRent = property.rent ? `₹${property.rent.toLocaleString()}` : 'Price on Call';

  return (
    <Box className="glass-panel rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between hover:border-cyan-300 transition group">
      {/* Image & Category Overlay */}
      <Box className="relative h-48 w-full overflow-hidden bg-white">
        <Image
          src={property.imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'}
          alt={property.name}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <Box className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/25 to-transparent" />

        <Box className="absolute top-3 left-3 flex items-center gap-2">
          <Inline className={`px-3 py-1 rounded-full text-xs font-extrabold border backdrop-blur-md ${getCategoryBadgeClass(property.category)}`}>
            {property.category}
          </Inline>
          <Inline className="px-2.5 py-1 rounded-full text-3xs font-bold bg-slate-900/60 text-white backdrop-blur-md">
            {property.stayType || 'Long Stay'}
          </Inline>
        </Box>

        <Box className="absolute bottom-3 right-3 px-3 py-1 rounded-2xl bg-cyan-500/90 text-white text-sm font-extrabold shadow-lg backdrop-blur-md">
          {formattedRent} <Inline className="text-3xs font-medium opacity-90">{property.stayType === 'Short Stay' ? '/ day' : '/ month'}</Inline>
        </Box>
      </Box>

      {/* Content */}
      <Box className="p-5 space-y-4 flex-1 flex flex-col justify-between">
        <Box className="space-y-2">
          <Heading level={3} className="text-base font-extrabold text-slate-900 group-hover:text-cyan-600 transition leading-snug line-clamp-1">
            {property.name}
          </Heading>

          <Box className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
            <Inline className="truncate">{property.place}</Inline>
          </Box>

          <Box className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <Inline className="flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5 text-slate-500" />
              {property.ownerName}
            </Inline>
            <Inline className="flex items-center gap-1.5 font-mono text-cyan-600">
              <Phone className="w-3.5 h-3.5" />
              {property.ownerMobile}
            </Inline>
          </Box>
        </Box>

        {/* Amenities Pills */}
        {property.amenities && property.amenities.length > 0 && (
          <Box className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
            {property.amenities.slice(0, 4).map((amenity, idx) => (
              <Inline key={idx} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-3xs font-semibold text-slate-500">
                {amenity}
              </Inline>
            ))}
            {property.amenities.length > 4 && (
              <Inline className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-3xs font-bold text-cyan-600">
                +{property.amenities.length - 4} more
              </Inline>
            )}
          </Box>
        )}

        {/* Action Buttons */}
        <Box className="pt-3 flex items-center justify-between border-t border-slate-200">
          <PlainButton
            onClick={() => onDelete(property._id)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition cursor-pointer"
            title="Delete Property"
          >
            <Trash2 className="w-4 h-4" />
          </PlainButton>

          <PlainButton
            onClick={() => onViewDetails(property)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-bold border border-cyan-200 transition cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <Inline>View Full Details</Inline>
          </PlainButton>
        </Box>
      </Box>
    </Box>
  );
};
