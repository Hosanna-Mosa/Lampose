import { useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';
import ListingCard, { rupees } from '../components/ListingCard';
import {
  CATEGORIES_LIST, CITIES_LIST, LISTINGS, PRICE_MAX, SORT_OPTIONS,
} from '../data/listings';

/* Every listing here is a real row from the onboarding panel — see
   backend/scripts/export-listings.mjs. The filters below only offer values
   that exist in that data, so none of them can strand you on an empty grid. */
export default function Explore() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCity, setSelectedCity] = useState('All Cities');
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [sortBy, setSortBy] = useState('recent');

  const filtered = useMemo(() => LISTINGS.filter(item => {
    if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
    if (selectedCity !== 'All Cities' && item.city !== selectedCity) return false;
    if (item.rent > maxPrice) return false;

    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.place, item.ownerName, item.category, ...item.amenities]
      .filter(Boolean)
      .some(field => field.toLowerCase().includes(q));
  }).sort((a, b) => {
    if (sortBy === 'price-asc') return a.rent - b.rent;
    if (sortBy === 'price-desc') return b.rent - a.rent;
    return String(b.listedAt).localeCompare(String(a.listedAt));
  }), [searchQuery, selectedCategory, selectedCity, maxPrice, sortBy]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedCity('All Cities');
    setMaxPrice(PRICE_MAX);
  };

  return (
    <section id="explore">
      <div className="sec-inner">
        <SecHead
          tag="Explore" title="Rooms on Lampose," em="straight from our owners."
          sub="Every listing below is a live property from the Lampose onboarding panel — the rent, the facilities and the contact are exactly what the owner filed."
          align="left"
        />

        {/* ── Filters ───────────────────────────────────────────────── */}
        <div className="exp-filters reveal">
          <div className="exp-search">
            <Icon name="search" className="exp-ico" />
            <input
              type="search"
              aria-label="Search listings"
              placeholder="Search a property, locality, owner or facility…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="exp-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>

          <div className="feat-tabs exp-cats" role="tablist" aria-label="Category">
            {CATEGORIES_LIST.map(cat => (
              <button
                key={cat.id}
                role="tab"
                aria-selected={selectedCategory === cat.id}
                className={`ftab${selectedCategory === cat.id ? ' active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <Icon name={cat.icon} className="exp-ico" />
                {cat.label}
              </button>
            ))}
          </div>

          <div className="exp-controls">
            <label className="exp-field">
              <span className="exp-lbl">City</span>
              <select value={selectedCity} onChange={e => setSelectedCity(e.target.value)}>
                {CITIES_LIST.map(city => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>

            <label className="exp-field exp-field--range">
              <span className="exp-lbl">
                Max rent <strong>{rupees(maxPrice)}</strong>
              </span>
              <input
                type="range"
                min="500" max={PRICE_MAX} step="500"
                value={maxPrice}
                onChange={e => setMaxPrice(Number(e.target.value))}
              />
            </label>

            <label className="exp-field exp-field--sort">
              <span className="exp-lbl">Sort</span>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                {SORT_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          </div>

          <p className="exp-count">
            {filtered.length} of {LISTINGS.length} listings
          </p>
        </div>

        {/* ── Grid ──────────────────────────────────────────────────────
            No `reveal` on the grid or the empty state: those two swap in and
            out as you filter, and the observer only ever sees what was in the
            DOM at mount — a node added later would stay at opacity 0 for
            good. The cards animate themselves in CSS instead. */}
        {filtered.length > 0 ? (
          <div className="exp-grid">
            {filtered.map((item, i) => (
              <ListingCard key={item.id} item={item} index={i} />
            ))}
          </div>
        ) : (
          <div className="exp-empty">
            <Icon name="search" className="exp-empty__ico" />
            <h3>Nothing matches those filters</h3>
            <p>Widen the rent ceiling, pick another city, or clear the search.</p>
            <button className="exp-more" onClick={resetFilters}>Reset filters</button>
          </div>
        )}
      </div>
    </section>
  );
}
