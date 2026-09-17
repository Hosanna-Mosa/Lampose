import React, { useState } from 'react';
import { scraperApi } from '../api/scraperApi';
import { Search, MapPin, Layers, Hash, Play, Sparkles, ShieldCheck, Navigation } from 'lucide-react';
import { Box, Form, Heading, Inline, Input, Label, Option, PlainButton, Select, Text } from '../components/common/atoms';

interface ScraperSearchPageProps {
  onJobStarted: (jobId: string) => void;
}

export const ScraperSearchPage: React.FC<ScraperSearchPageProps> = ({ onJobStarted }) => {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [landmark, setLandmark] = useState('');
  const [source, setSource] = useState<'GoogleMaps' | 'JustDial' | 'Web'>('GoogleMaps');
  const [depth, setDepth] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !location.trim()) {
      setError('Please provide both search category/query and location city.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await scraperApi.startScrape({
        query: query.trim(),
        location: location.trim(),
        landmark: landmark.trim(),
        source,
        depth: Number(depth) || 15
      });

      if (res.success && res.data?.jobId) {
        onJobStarted(res.data.jobId);
      } else {
        setError(res.error || 'Failed to initialize scraper task.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Error connecting to scraper engine.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Title */}
      <Box className="space-y-2">
        <Box className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          <Inline>Scriper Automation Control</Inline>
        </Box>
        <Heading level={1} className="text-2xl font-extrabold text-slate-900 tracking-tight">Configure Scrape Mission</Heading>
        <Text className="text-xs text-slate-500">
          Enter target business keywords and geographic location to run live Playwright extraction.
        </Text>
      </Box>

      {error && (
        <Box className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </Box>
      )}

      {/* Form Card */}
      <Form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 space-y-6 shadow-2xl">
        <Box className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Keyword / Query */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Search Category / Keywords *</Inline>
            </Label>
            <Input
              type="text"
              placeholder="e.g. Dentists, Real Estate, IT Companies"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </Box>

          {/* Location / City */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>City / Location *</Inline>
            </Label>
            <Input
              type="text"
              placeholder="e.g. Mumbai, New York, Bangalore"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </Box>

          {/* Landmark / Specific Area inside the city */}
          <Box className="space-y-2 md:col-span-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Nearby Landmark / Area (Optional)</Inline>
            </Label>
            <Input
              type="text"
              placeholder="e.g. Andhra University, Gachibowli, Near Airport"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
            />
            <Text className="text-2xs text-slate-400">
              Narrows the hunt to one neighbourhood instead of the whole city.
            </Text>
          </Box>

          {/* Scrape Source */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Data Provider Source</Inline>
            </Label>
            <Select
              value={source}
              onChange={(e: any) => setSource(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
            >
              <Option value="GoogleMaps">Google Maps Scraper</Option>
              <Option value="JustDial">JustDial Directory</Option>
              <Option value="Web">General Web Listings</Option>
            </Select>
          </Box>

          {/* Depth / Limits */}
          <Box className="space-y-2">
            <Label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-cyan-600" />
              <Inline>Target Record Limit (Depth)</Inline>
            </Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition font-mono"
            />
          </Box>
        </Box>

        {/* Resolved search string preview */}
        {(query.trim() || location.trim()) && (
          <Box className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-200 text-xs">
            <Inline className="text-slate-500 font-semibold">Target search string: </Inline>
            <Inline className="text-cyan-700 font-mono">
              {landmark.trim()
                ? `${query.trim() || '...'} near ${landmark.trim()}, ${location.trim() || '...'}`
                : `${query.trim() || '...'} in ${location.trim() || '...'}`}
            </Inline>
          </Box>
        )}

        {/* Feature Badges */}
        <Box className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap gap-4 text-xs text-slate-500 font-medium">
          <Box className="flex items-center gap-1.5 text-emerald-600">
            <ShieldCheck className="w-4 h-4" />
            <Inline>Playwright Headless Navigation</Inline>
          </Box>
          <Box>•</Box>
          <Box>Auto-clean & deduplicate leads</Box>
          <Box>•</Box>
          <Box>Extract Phone, Email & Websites</Box>
        </Box>

        {/* Submit */}
        <PlainButton
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4 fill-white" />
          <Inline>{loading ? 'Initializing Engine...' : 'Start Playwright Live Extraction'}</Inline>
        </PlainButton>
      </Form>
    </Box>
  );
};
