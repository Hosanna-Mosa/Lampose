import React from 'react';
import { Property } from '../../api/propertyApi';
import { MapPin, Phone, User, Eye, Trash2, Home, Sparkles } from 'lucide-react';

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
    <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl flex flex-col justify-between hover:border-cyan-300 transition group">
      {/* Image & Category Overlay */}
      <div className="relative h-48 w-full overflow-hidden bg-white">
        <img
          src={property.imageUrl || 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80'}
          alt={property.name}
          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/25 to-transparent" />

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-extrabold border backdrop-blur-md ${getCategoryBadgeClass(property.category)}`}>
            {property.category}
          </span>
          <span className="px-2.5 py-1 rounded-full text-3xs font-bold bg-slate-900/60 text-white backdrop-blur-md">
            {property.stayType || 'Long Stay'}
          </span>
        </div>

        <div className="absolute bottom-3 right-3 px-3 py-1 rounded-2xl bg-cyan-500/90 text-white text-sm font-extrabold shadow-lg backdrop-blur-md">
          {formattedRent} <span className="text-3xs font-medium opacity-90">{property.stayType === 'Short Stay' ? '/ day' : '/ month'}</span>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <h3 className="text-base font-extrabold text-slate-900 group-hover:text-cyan-600 transition leading-snug line-clamp-1">
            {property.name}
          </h3>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
            <span className="truncate">{property.place}</span>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
            <span className="flex items-center gap-1.5 font-medium">
              <User className="w-3.5 h-3.5 text-slate-500" />
              {property.ownerName}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-cyan-600">
              <Phone className="w-3.5 h-3.5" />
              {property.ownerMobile}
            </span>
          </div>
        </div>

        {/* Amenities Pills */}
        {property.amenities && property.amenities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200">
            {property.amenities.slice(0, 4).map((amenity, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-3xs font-semibold text-slate-500">
                {amenity}
              </span>
            ))}
            {property.amenities.length > 4 && (
              <span className="px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-3xs font-bold text-cyan-600">
                +{property.amenities.length - 4} more
              </span>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-3 flex items-center justify-between border-t border-slate-200">
          <button
            onClick={() => onDelete(property._id)}
            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition cursor-pointer"
            title="Delete Property"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            onClick={() => onViewDetails(property)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-600 text-xs font-bold border border-cyan-200 transition cursor-pointer"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View Full Details</span>
          </button>
        </div>
      </div>
    </div>
  );
};
