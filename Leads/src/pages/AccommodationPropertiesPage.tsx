import React, { useEffect, useState } from 'react';
import { propertyApi, Property } from '../api/propertyApi';
import { PropertyCard } from '../components/onboarding/PropertyCard';
import { PropertyDetailModal } from '../components/onboarding/PropertyDetailModal';
import { PropertyFormModal } from '../components/onboarding/PropertyFormModal';
import { Search, Plus, Building2, RefreshCw, Home, Sparkles, Filter } from 'lucide-react';

export const AccommodationPropertiesPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showOnboardModal, setShowOnboardModal] = useState(false);

  const categories = ['All', 'PG', 'Hostel', 'Dormitory', 'Bachelor Room'] as const;

  const fetchPropertiesData = async () => {
    setLoading(true);
    try {
      const res = await propertyApi.getProperties({
        category: selectedCategory !== 'All' ? selectedCategory : undefined,
        search: search.trim() || undefined
      });
      if (res.success && res.data) {
        setProperties(res.data);
      }
    } catch (err) {
      console.error('Error fetching properties:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPropertiesData();
  }, [selectedCategory, search]);

  const handleDeleteProperty = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this property entry?')) return;
    try {
      const res = await propertyApi.deleteProperty(id);
      if (res.success) {
        fetchPropertiesData();
      }
    } catch (e) {
      console.error('Error deleting property:', e);
    }
  };

  // Compute Category Stats Badges
  const stats = {
    total: properties.length,
    pgCount: properties.filter(p => p.category === 'PG').length,
    hostelCount: properties.filter(p => p.category === 'Hostel').length,
    dormitoryCount: properties.filter(p => p.category === 'Dormitory').length,
    bachelorCount: properties.filter(p => p.category === 'Bachelor Room').length,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-200 text-cyan-600 text-xs font-bold mb-2">
            <Building2 className="w-3.5 h-3.5" />
            <span>Accommodation Onboarding Engine</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Property & Accommodation Explorer</h1>
          <p className="text-xs text-slate-500">
            Browse onboarded PGs, Hostels, Dormitories, and Bachelor Rooms, or onboard a new listing.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchPropertiesData}
            className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer"
            title="Refresh Listings"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowOnboardModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-extrabold shadow-lg shadow-cyan-500/25 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard New Property</span>
          </button>
        </div>
      </div>

      {/* Category Filter Pills & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl flex flex-col md:flex-row gap-4 justify-between items-center">
        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                  : 'bg-white text-slate-500 border border-slate-200 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {cat === 'All' ? '🏢 All Properties' : cat}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search property, location, owner..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-cyan-500 transition"
          />
        </div>
      </div>

      {/* Property Cards Grid */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 text-xs font-semibold">
          Loading accommodation properties...
        </div>
      ) : properties.length === 0 ? (
        <div className="glass-panel p-16 rounded-3xl text-center space-y-4">
          <Home className="w-12 h-12 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">No Properties Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No accommodation listings matched your search criteria. Click "Onboard New Property" to add a new PG, Hostel, Dormitory, or Bachelor Room!
          </p>
          <button
            onClick={() => setShowOnboardModal(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 text-white text-xs font-bold shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard First Property</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((prop) => (
            <PropertyCard
              key={prop._id}
              property={prop}
              onViewDetails={(p) => setSelectedProperty(p)}
              onDelete={handleDeleteProperty}
            />
          ))}
        </div>
      )}

      {/* Property Details Modal Inspector */}
      {selectedProperty && (
        <PropertyDetailModal
          property={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}

      {/* Property Onboarding Form Modal */}
      {showOnboardModal && (
        <PropertyFormModal
          onClose={() => setShowOnboardModal(false)}
          onSuccess={fetchPropertiesData}
        />
      )}
    </div>
  );
};
