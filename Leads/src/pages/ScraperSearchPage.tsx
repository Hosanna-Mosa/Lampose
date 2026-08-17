import React, { useState } from 'react';
import { scraperApi } from '../api/scraperApi';
import { Search, MapPin, Layers, Hash, Play, Sparkles, ShieldCheck, Navigation } from 'lucide-react';

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
    <div className="max-w-4xl mx-auto space-y-8 py-4">
      {/* Title */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Scriper Automation Control</span>
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Configure Scrape Mission</h1>
        <p className="text-xs text-slate-500">
          Enter target business keywords and geographic location to run live Playwright extraction.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="glass-panel rounded-3xl p-8 space-y-6 shadow-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Keyword / Query */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-cyan-600" />
              <span>Search Category / Keywords *</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Dentists, Real Estate, IT Companies"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </div>

          {/* Location / City */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-cyan-600" />
              <span>City / Location *</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Mumbai, New York, Bangalore"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
              required
            />
          </div>

          {/* Landmark / Specific Area inside the city */}
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Navigation className="w-3.5 h-3.5 text-cyan-600" />
              <span>Nearby Landmark / Area (Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Andhra University, Gachibowli, Near Airport"
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition"
            />
            <p className="text-2xs text-slate-400">
              Narrows the hunt to one neighbourhood instead of the whole city.
            </p>
          </div>

          {/* Scrape Source */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-600" />
              <span>Data Provider Source</span>
            </label>
            <select
              value={source}
              onChange={(e: any) => setSource(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition cursor-pointer"
            >
              <option value="GoogleMaps">Google Maps Scraper</option>
              <option value="JustDial">JustDial Directory</option>
              <option value="Web">General Web Listings</option>
            </select>
          </div>

          {/* Depth / Limits */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-600 flex items-center gap-2">
              <Hash className="w-3.5 h-3.5 text-cyan-600" />
              <span>Target Record Limit (Depth)</span>
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={depth}
              onChange={(e) => setDepth(parseInt(e.target.value, 10))}
              className="w-full px-4 py-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-cyan-500 transition font-mono"
            />
          </div>
        </div>

        {/* Resolved search string preview */}
        {(query.trim() || location.trim()) && (
          <div className="p-4 rounded-2xl bg-cyan-50/60 border border-cyan-200 text-xs">
            <span className="text-slate-500 font-semibold">Target search string: </span>
            <span className="text-cyan-700 font-mono">
              {landmark.trim()
                ? `${query.trim() || '...'} near ${landmark.trim()}, ${location.trim() || '...'}`
                : `${query.trim() || '...'} in ${location.trim() || '...'}`}
            </span>
          </div>
        )}

        {/* Feature Badges */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-wrap gap-4 text-xs text-slate-500 font-medium">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <ShieldCheck className="w-4 h-4" />
            <span>Playwright Headless Navigation</span>
          </div>
          <div>•</div>
          <div>Auto-clean & deduplicate leads</div>
          <div>•</div>
          <div>Extract Phone, Email & Websites</div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-500/25 transition transform active:scale-98 cursor-pointer flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4 fill-white" />
          <span>{loading ? 'Initializing Engine...' : 'Start Playwright Live Extraction'}</span>
        </button>
      </form>
    </div>
  );
};
