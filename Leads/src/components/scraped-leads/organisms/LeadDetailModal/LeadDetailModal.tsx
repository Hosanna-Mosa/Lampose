import React from 'react';
import { ScrapedLead } from '../../../../api/scraperApi';
import { MapLocationButton } from '../../../common/molecules/MapLocationButton';
import { X, Building2, Phone, Mail, Globe, MapPin, Star, Tag, Calendar, ShieldCheck } from 'lucide-react';
import { Box, Heading, Inline, Link, PlainButton, Text } from '../../../common/atoms';

interface LeadDetailModalProps {
  lead: ScrapedLead;
  onClose: () => void;
}

export const LeadDetailModal: React.FC<LeadDetailModalProps> = ({ lead, onClose }) => {
  return (
    <Box className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <Box className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-xl shadow-2xl space-y-6 relative overflow-hidden">
        <PlainButton
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </PlainButton>

        <Box className="flex items-start gap-4 pr-10">
          <Box className="w-12 h-12 rounded-2xl bg-cyan-50 border border-cyan-200 text-cyan-600 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6" />
          </Box>
          <Box>
            <Heading level={2} className="text-xl font-bold text-slate-900">{lead.businessName}</Heading>
            <Box className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <Inline className="px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-600 font-semibold border border-cyan-200">
                {lead.source}
              </Inline>
              <Inline>•</Inline>
              <Inline>{lead.category || 'General Business'}</Inline>
            </Box>
          </Box>
        </Box>

        <Box className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <Box className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Phone className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Phone Number</Inline>
            </Box>
            <Text className="text-sm font-mono text-slate-900 font-medium">{lead.phone || 'Not Available'}</Text>
          </Box>

          <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <Box className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Mail className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Email Address</Inline>
            </Box>
            <Text className="text-sm font-mono text-slate-900 font-medium">{lead.email || 'Not Extracted'}</Text>
          </Box>

          <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <Box className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Globe className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Website</Inline>
            </Box>
            {lead.website ? (
              <Link
                href={lead.website}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-cyan-600 hover:underline truncate block font-mono"
              >
                {lead.website}
              </Link>
            ) : (
              <Text className="text-sm text-slate-400 font-medium">No Website Listed</Text>
            )}
          </Box>

          <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
            <Box className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-400" />
              <Inline>Rating & Reviews</Inline>
            </Box>
            <Text className="text-sm text-slate-900 font-medium">
              {lead.rating ? `${lead.rating} ★ (${lead.reviewsCount || 0} reviews)` : 'No Ratings'}
            </Text>
          </Box>
        </Box>

        <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1">
          <Box className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <MapPin className="w-3.5 h-3.5 text-cyan-600" />
            <Inline>Address / Location</Inline>
          </Box>
          <Text className="text-sm text-slate-600 leading-relaxed">{lead.address || lead.city || 'Location unavailable'}</Text>
          {lead.landmark && (
            <Text className="text-xs text-cyan-600 font-semibold pt-1">Near {lead.landmark}</Text>
          )}
          <Box className="pt-2">
            <MapLocationButton lead={lead} variant="full" />
          </Box>
        </Box>

        <Box className="flex items-center justify-between pt-2 text-xs text-slate-400">
          <Inline>Scraped Date: {lead.scrapedAt ? new Date(lead.scrapedAt).toLocaleString() : 'Recent'}</Inline>
          <Inline>Job ID: {lead.jobId}</Inline>
        </Box>
      </Box>
    </Box>
  );
};
