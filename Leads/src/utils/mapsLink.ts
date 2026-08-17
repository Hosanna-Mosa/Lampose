import { ScrapedLead } from '../api/scraperApi';

/**
 * Resolves the best Google Maps link for a lead.
 * Priority: stored place/coordinate link -> lat,lng -> name + address search.
 * Returns '' when there is nothing usable to open.
 */
export function getMapsUrl(lead: Partial<ScrapedLead>): string {
  if (lead.mapsUrl) return lead.mapsUrl;

  if (typeof lead.latitude === 'number' && typeof lead.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`;
  }

  const term = [lead.businessName, lead.address || lead.landmark || lead.city]
    .filter(Boolean)
    .join(', ')
    .trim();

  if (!term) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(term)}`;
}

/** Opens the lead location in a new Google Maps tab. */
export function openInMaps(lead: Partial<ScrapedLead>): void {
  const url = getMapsUrl(lead);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}
