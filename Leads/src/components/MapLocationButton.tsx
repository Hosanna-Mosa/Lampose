import React from 'react';
import { MapPin } from 'lucide-react';
import { ScrapedLead } from '../api/scraperApi';
import { getMapsUrl } from '../utils/mapsLink';

interface MapLocationButtonProps {
  lead: Partial<ScrapedLead>;
  /** 'icon' for compact table cells, 'full' for a labelled button */
  variant?: 'icon' | 'full';
  className?: string;
}

/**
 * Location pin that opens the lead's exact position on Google Maps in a new tab.
 * Renders a disabled pin when the lead carries no usable location data.
 */
export const MapLocationButton: React.FC<MapLocationButtonProps> = ({ lead, variant = 'icon', className = '' }) => {
  const url = getMapsUrl(lead);

  if (!url) {
    return (
      <span
        className="p-1.5 rounded-lg bg-slate-100 text-slate-300 inline-flex items-center cursor-not-allowed"
        title="No location data available"
      >
        <MapPin className="w-4 h-4" />
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open "${lead.businessName || 'this location'}" in Google Maps`}
      className={
        variant === 'full'
          ? `inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 hover:bg-emerald-100 text-xs font-bold transition cursor-pointer ${className}`
          : `p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 transition cursor-pointer inline-flex items-center ${className}`
      }
    >
      <MapPin className="w-4 h-4" />
      {variant === 'full' && <span>View on Google Maps</span>}
    </a>
  );
};
