import React from 'react';
import { Search, Home, Building2, BedDouble, Users, SlidersHorizontal } from 'lucide-react';

const CATEGORIES = [
  { id: 'All', label: 'All Categories', icon: Home },
  { id: 'PG', label: 'PGs', icon: Building2 },
  { id: 'Hostel', label: 'Hostels', icon: Building2 },
  { id: 'Dormitory', label: 'Dormitories', icon: BedDouble },
  { id: 'Bachelor Room', label: 'Bachelor Rooms', icon: Users }
];

export default function FilterBar({
  selectedCategory,
  onCategoryChange,
  searchTerm,
  onSearchChange,
  totalCount
}) {
  return (
    <div style={{ marginBottom: '24px' }}>
      {/* Search & Category Filter Header Container */}
      <div className="glass-card" style={{ padding: '16px 20px', borderRadius: 'var(--radius-md)' }}>
        
        {/* Top Search Input Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              color="#D8993E"
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search property name, location (e.g. Koramangala), owner..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="form-input"
              style={{
                paddingLeft: '44px',
                borderRadius: '30px',
                background: 'rgba(25, 54, 38, 0.85)',
                borderColor: 'rgba(255, 255, 255, 0.15)'
              }}
            />
          </div>

          <div style={{
            fontSize: '0.85rem',
            color: 'var(--text-sub)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0
          }}>
            <SlidersHorizontal size={16} color="#D8993E" />
            <span>Showing <strong style={{ color: '#ffffff' }}>{totalCount}</strong> Properties</span>
          </div>
        </div>

        {/* Category Tabs Scrollable Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '4px',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none'
        }}>
          {CATEGORIES.map((cat) => {
            const IconComponent = cat.icon;
            const isSelected = selectedCategory === cat.id;

            return (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className="btn"
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap',
                  background: isSelected ? '#D8993E' : 'rgba(255, 255, 255, 0.08)',
                  color: isSelected ? '#ffffff' : 'var(--text-sub)',
                  border: isSelected ? '1px solid #D8993E' : '1px solid var(--border-glass)',
                  boxShadow: isSelected ? '0 4px 14px rgba(216, 153, 62, 0.3)' : 'none',
                  transition: 'all 0.2s ease'
                }}
              >
                <IconComponent size={15} />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
