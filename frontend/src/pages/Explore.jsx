import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';
import ListingCard, { rupees } from '../components/ListingCard';
import ConnectionError from '../components/ConnectionError';
import { byCategoryOrder, iconForCategory } from '../data/categories';
import listingsApi from '../api/listingsApi';
import { useReveals } from '../hooks/useSite';

/* ══ Explore ══════════════════════════════════════════════════════════════
   A sticky filter rail beside a results column.

   The grid is the database or it is nothing. There is no bundled snapshot to
   fall back to, because a snapshot makes a broken connection look like a
   working page — which is how a stale grid went unnoticed. If the listings
   cannot be fetched the page says which link is down and offers to retry.

   Every filter option — cities, categories, stay types, amenities and the
   rent ceiling — is derived from the listings actually returned, never from a
   constant baked in at build time, so nothing the API sends can be filtered
   out by a stale ceiling or missing from a hardcoded dropdown.
   ═══════════════════════════════════════════════════════════════════════ */

const SORTS = [
  { id: 'recent', label: 'Recently listed' },
  { id: 'price-asc', label: 'Rent: low to high' },
  { id: 'price-desc', label: 'Rent: high to low' },
  { id: 'name', label: 'Name: A to Z' },
];

/* How many cards are drawn before "Show more". Filtering is instant on the
   whole set; this only bounds how much the browser paints at once, so a
   collection of a few hundred rows stays as quick as one of twenty. */
const PAGE = 12;

const ceilTo500 = n => Math.max(500, Math.ceil(n / 500) * 500);
const rentOf = item => Number(item.rent) || 0;

const EMPTY_FILTERS = {
  q: '',
  category: 'all',
  city: 'all',
  stay: 'all',
  amenities: [],
  maxPrice: null,        // null = no ceiling, so it follows the data
};

export default function Explore() {
  const [listingsData, setListingsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sortBy, setSortBy] = useState('recent');
  const [view, setView] = useState('grid');
  const [visible, setVisible] = useState(PAGE);
  const [railOpen, setRailOpen] = useState(false);

  useReveals([loading]);

  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));

  const load = useCallback(async signal => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listingsApi.getListings();
      if (signal?.aborted) return;
      setListingsData(rows);
    } catch (err) {
      if (signal?.aborted) return;
      /* "No response" cannot tell a stopped server from a live one that lost
         its database, so ask the health endpoint before naming the fault. */
      if (err.kind === 'server' || err.kind === 'api') {
        const kind = await listingsApi.diagnose();
        if (signal?.aborted) return;
        if (kind !== err.kind) err.kind = kind;
      }
      console.error('[Explore] Could not load listings:', err);
      setListingsData([]);
      setError(err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /* ── Facets, derived from the listings in hand ───────────────────────── */
  const facets = useMemo(() => {
    const uniq = xs => [...new Set(xs.filter(Boolean))];
    const tally = new Map();
    listingsData.forEach(l => (l.amenities || []).forEach(a => {
      tally.set(a, (tally.get(a) || 0) + 1);
    }));

    return {
      priceMax: listingsData.length
        ? ceilTo500(Math.max(...listingsData.map(rentOf)))
        : 500,
      cities: uniq(listingsData.map(l => l.city)).sort((a, b) => a.localeCompare(b)),
      categories: uniq(listingsData.map(l => l.category)).sort(byCategoryOrder),
      stays: uniq(listingsData.map(l => l.stayType)),
      amenities: [...tally.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 10)
        .map(([name]) => name),
    };
  }, [listingsData]);

  /* A ceiling of null means "wherever the data ends", so a listing priced
     above the last export can never be hidden by a stale default. */
  const priceCap = filters.maxPrice === null
    ? facets.priceMax
    : Math.min(filters.maxPrice, facets.priceMax);

  /* A selection that no longer exists in the data would filter everything
     out with no way back, so it is dropped when the data changes. */
  useEffect(() => {
    setFilters(f => ({
      ...f,
      category: f.category !== 'all' && !facets.categories.includes(f.category) ? 'all' : f.category,
      city: f.city !== 'all' && !facets.cities.includes(f.city) ? 'all' : f.city,
      stay: f.stay !== 'all' && !facets.stays.includes(f.stay) ? 'all' : f.stay,
      amenities: f.amenities.filter(a => facets.amenities.includes(a)),
    }));
  }, [facets]);

  const matches = (item, f) => {
    if (f.category !== 'all' && item.category !== f.category) return false;
    if (f.city !== 'all' && item.city !== f.city) return false;
    if (f.stay !== 'all' && item.stayType !== f.stay) return false;
    if (rentOf(item) > (f.maxPrice === null ? facets.priceMax : f.maxPrice)) return false;
    if (f.amenities.length
      && !f.amenities.every(a => (item.amenities || []).includes(a))) return false;

    const q = f.q.trim().toLowerCase();
    if (!q) return true;
    return [item.name, item.place, item.locality, item.city, item.ownerName, item.category,
      ...(item.amenities || [])]
      .filter(Boolean)
      .some(field => String(field).toLowerCase().includes(q));
  };

  const filtered = useMemo(() => {
    const rows = listingsData.filter(item => matches(item, { ...filters, maxPrice: priceCap }));
    return rows.sort((a, b) => {
      if (sortBy === 'price-asc') return rentOf(a) - rentOf(b);
      if (sortBy === 'price-desc') return rentOf(b) - rentOf(a);
      if (sortBy === 'name') return String(a.name).localeCompare(String(b.name));
      return String(b.listedAt).localeCompare(String(a.listedAt));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingsData, filters, priceCap, sortBy]);

  /* Facet counts answer "how many are left if I pick this", so an option that
     would empty the grid is greyed out before it is clicked. */
  const countWith = patch => listingsData
    .filter(item => matches(item, { ...filters, maxPrice: priceCap, ...patch })).length;

  useEffect(() => { setVisible(PAGE); }, [filters, sortBy]);

  const activeChips = [
    filters.q && { key: 'q', label: `"${filters.q}"`, clear: () => set('q', '') },
    filters.category !== 'all' && { key: 'cat', label: filters.category, clear: () => set('category', 'all') },
    filters.city !== 'all' && { key: 'city', label: filters.city, clear: () => set('city', 'all') },
    filters.stay !== 'all' && { key: 'stay', label: filters.stay, clear: () => set('stay', 'all') },
    filters.maxPrice !== null && {
      key: 'rent',
      label: `Under ${rupees(priceCap)}`,
      clear: () => set('maxPrice', null),
    },
    ...filters.amenities.map(a => ({
      key: `am-${a}`,
      label: a,
      clear: () => set('amenities', filters.amenities.filter(x => x !== a)),
    })),
  ].filter(Boolean);

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const toggleAmenity = a => set('amenities', filters.amenities.includes(a)
    ? filters.amenities.filter(x => x !== a)
    : [...filters.amenities, a]);

  return (
    <section id="explore">
      <div className="sec-inner">
        <SecHead
          tag="Explore" title="Rooms on Lampose," em="straight from our owners."
          sub="Every listing below is a live property from the Lampose onboarding panel — the rent, the facilities and the contact are exactly what the owner filed."
          align="left"
        />

        {/* Nothing was loaded, so there is nothing to filter — the whole shell
            stands down and the page reports which link is broken. */}
        {error ? (
          <ConnectionError error={error} onRetry={() => load()} busy={loading} />
        ) : (
        <div className={`xp-shell${railOpen ? ' is-open' : ''}`}>
          {/* ── Filter rail ──────────────────────────────────────────── */}
          <button
            className="xp-scrim"
            aria-label="Close filters"
            tabIndex={railOpen ? 0 : -1}
            onClick={() => setRailOpen(false)}
          />

          <aside className="xp-rail" aria-label="Filters">
            <div className="xp-rail__head">
              <span className="exp-lbl">Filters</span>
              <div className="xp-rail__headActions">
                {activeChips.length > 0 && (
                  <button className="xp-linkbtn" onClick={resetFilters}>Clear all</button>
                )}
                <button
                  className="xp-rail__close"
                  onClick={() => setRailOpen(false)}
                  aria-label="Close filters"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="xp-search">
              <Icon name="search" className="exp-ico" />
              <input
                type="search"
                aria-label="Search listings"
                placeholder="Property, locality, owner…"
                value={filters.q}
                onChange={e => set('q', e.target.value)}
              />
              {filters.q && (
                <button className="xp-clear" onClick={() => set('q', '')} aria-label="Clear search">
                  ✕
                </button>
              )}
            </div>

            <div className="xp-group">
              <span className="exp-lbl">Property type</span>
              <div className="xp-opts" role="radiogroup" aria-label="Property type">
                <OptionRow
                  icon="grid" label="All listings"
                  count={countWith({ category: 'all' })}
                  active={filters.category === 'all'}
                  onClick={() => set('category', 'all')}
                />
                {facets.categories.map(cat => (
                  <OptionRow
                    key={cat}
                    icon={iconForCategory(cat)}
                    label={cat}
                    count={countWith({ category: cat })}
                    active={filters.category === cat}
                    onClick={() => set('category', cat)}
                  />
                ))}
              </div>
            </div>

            <div className="xp-group">
              <label className="exp-lbl" htmlFor="xp-city">City</label>
              <select
                id="xp-city"
                className="xp-select"
                value={filters.city}
                onChange={e => set('city', e.target.value)}
              >
                <option value="all">All cities ({countWith({ city: 'all' })})</option>
                {facets.cities.map(city => (
                  <option key={city} value={city}>
                    {city} ({countWith({ city })})
                  </option>
                ))}
              </select>
            </div>

            {facets.stays.length > 1 && (
              <div className="xp-group">
                <span className="exp-lbl">Stay length</span>
                <div className="xp-seg" role="group" aria-label="Stay length">
                  <button
                    className={`xp-seg__btn${filters.stay === 'all' ? ' active' : ''}`}
                    onClick={() => set('stay', 'all')}
                  >
                    Any
                  </button>
                  {facets.stays.map(stay => (
                    <button
                      key={stay}
                      className={`xp-seg__btn${filters.stay === stay ? ' active' : ''}`}
                      onClick={() => set('stay', stay)}
                      disabled={countWith({ stay }) === 0}
                    >
                      {stay.replace(' Stay', '')}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="xp-group">
              <span className="exp-lbl">
                Max rent <strong>{rupees(priceCap)}</strong>
              </span>
              <input
                className="xp-range"
                type="range"
                min="0"
                max={facets.priceMax}
                step="500"
                value={priceCap}
                aria-label="Maximum rent"
                onChange={e => set('maxPrice', Number(e.target.value))}
              />
              <div className="xp-range__ends">
                <span>₹0</span>
                <span>{rupees(facets.priceMax)}+</span>
              </div>
            </div>

            {facets.amenities.length > 0 && (
              <div className="xp-group">
                <span className="exp-lbl">Facilities</span>
                <div className="xp-checks">
                  {facets.amenities.map(a => {
                    const n = countWith({ amenities: [...new Set([...filters.amenities, a])] });
                    const on = filters.amenities.includes(a);
                    return (
                      <button
                        key={a}
                        className={`xp-check${on ? ' active' : ''}`}
                        aria-pressed={on}
                        disabled={!on && n === 0}
                        onClick={() => toggleAmenity(a)}
                      >
                        {a}
                        <em>{n}</em>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button className="xp-rail__apply" onClick={() => setRailOpen(false)}>
              Show {filtered.length} {filtered.length === 1 ? 'stay' : 'stays'}
            </button>
          </aside>

          {/* ── Results ──────────────────────────────────────────────── */}
          <div className="xp-results">
            <div className="xp-toolbar">
              <button className="xp-filterbtn" onClick={() => setRailOpen(true)}>
                <Icon name="filters" className="exp-ico" />
                Filters
                {activeChips.length > 0 && <em>{activeChips.length}</em>}
              </button>

              <p className="xp-tally">
                <strong>{filtered.length}</strong>
                <span>
                  {filtered.length === listingsData.length
                    ? ` ${filtered.length === 1 ? 'stay' : 'stays'} on Lampose`
                    : ` of ${listingsData.length} stays`}
                </span>
                <span className="xp-dot is-live" title="Live from the onboarding panel" />
              </p>

              <div className="xp-toolbar__right">
                <div className="xp-viewtoggle" role="group" aria-label="Layout">
                  <button
                    className={`xp-viewtoggle__btn${view === 'grid' ? ' active' : ''}`}
                    onClick={() => setView('grid')}
                    aria-label="Grid view"
                    aria-pressed={view === 'grid'}
                  >
                    <Icon name="grid" className="exp-ico" />
                  </button>
                  <button
                    className={`xp-viewtoggle__btn${view === 'list' ? ' active' : ''}`}
                    onClick={() => setView('list')}
                    aria-label="List view"
                    aria-pressed={view === 'list'}
                  >
                    <Icon name="filters" className="exp-ico" />
                  </button>
                </div>

                <label className="xp-sort">
                  <span className="exp-lbl">Sort</span>
                  <select
                    className="xp-select"
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                  >
                    {SORTS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="xp-chips">
                {activeChips.map(chip => (
                  <button key={chip.key} className="xp-chip" onClick={chip.clear}>
                    {chip.label} <span aria-hidden="true">✕</span>
                  </button>
                ))}
                <button className="xp-linkbtn" onClick={resetFilters}>Clear all</button>
              </div>
            )}

            {loading && (
              <div className="xp-grid">
                {Array.from({ length: 6 }, (_, i) => (
                  <div className="xp-skel" key={i} style={{ '--i': String(i) }}>
                    <div className="xp-skel__media" />
                    <div className="xp-skel__line" />
                    <div className="xp-skel__line xp-skel__line--short" />
                  </div>
                ))}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <>
                {/* No `reveal` here: the grid swaps in and out as you filter,
                    and the observer only sees what was in the DOM at mount.
                    The cards animate themselves in CSS instead. */}
                <div className={view === 'list' ? 'xp-list' : 'xp-grid'}>
                  {filtered.slice(0, visible).map((item, i) => (
                    <ListingCard key={item.id} item={item} index={i % PAGE} view={view} />
                  ))}
                </div>

                {visible < filtered.length && (
                  <div className="xp-loadmore">
                    <button className="exp-more" onClick={() => setVisible(v => v + PAGE)}>
                      Show {Math.min(PAGE, filtered.length - visible)} more
                      <span aria-hidden="true">→</span>
                    </button>
                    <p className="xp-loadmore__note">
                      Showing {visible} of {filtered.length}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* An empty collection and an over-tight filter are different
                facts, and only one of them is the visitor's doing. */}
            {!loading && filtered.length === 0 && (
              <div className="exp-empty">
                <Icon name="search" className="exp-empty__ico" />
                {listingsData.length === 0 ? (
                  <>
                    <h3>No rooms listed yet</h3>
                    <p>
                      Nothing has been published here so far. Rooms are added as our
                      scouts finish walking them, so it is worth looking again soon.
                    </p>
                    <button className="exp-more" onClick={() => load()}>
                      Check again <span aria-hidden="true">→</span>
                    </button>
                  </>
                ) : (
                  <>
                    <h3>Nothing matches those filters</h3>
                    <p>Widen the rent ceiling, pick another city, or clear the search.</p>
                    <button className="exp-more" onClick={resetFilters}>Reset filters</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </section>
  );
}

/* One row of the type list: glyph, label, and how many listings survive if you
   pick it. Zero means the row cannot help, so it is disabled rather than
   hidden — a filter list that reshuffles as you type is hard to aim at. */
function OptionRow({ icon, label, count, active, onClick }) {
  return (
    <button
      className={`xp-opt${active ? ' active' : ''}`}
      role="radio"
      aria-checked={active}
      disabled={!active && count === 0}
      onClick={onClick}
    >
      <Icon name={icon} className="exp-ico" />
      <span>{label}</span>
      <em>{count}</em>
    </button>
  );
}
