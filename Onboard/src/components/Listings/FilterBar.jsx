import React from 'react';
import { Search, Home, Building2, BedDouble, Users, SlidersHorizontal } from 'lucide-react';

const CATEGORIES = [
  { id: 'All', label: 'All Categories', icon: Home },
  { id: 'PG', label: 'PGs', icon: Building2 },
  { id: 'Hostel', label: 'Hostels', icon: Building2 },
  { id: 'Bachelor Room', label: 'Bachelor Rooms', icon: Users },
  { id: 'Dormitory', label: 'Dormitories', icon: BedDouble }
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
      {/* Search Bar Container */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.02)'
      }}>
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <Search
            size={18}
            color="#64748b"
            style={{ marginRight: '12px', flexShrink: 0 }}
          />
          <input
            type="text"
            placeholder="Search property name, location (e.g. Koramangala), owner..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              fontSize: '0.92rem',
              color: '#181e1b',
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{
          fontSize: '0.85rem',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
          paddingLeft: '16px',
          borderLeft: '1px solid #f1f5f2'
        }}>
          <SlidersHorizontal size={16} color="#45855a" />
          <span>Showing <strong style={{ color: '#181e1b', fontWeight: 700 }}>{totalCount}</strong> Properties</span>
        </div>
      </div>

      {/* Category Tabs Pill Row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
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
                padding: '8px 18px',
                borderRadius: '20px',
                fontSize: '0.85rem',
                fontWeight: isSelected ? 600 : 500,
                whiteSpace: 'nowrap',
                background: isSelected ? '#45855a' : '#ffffff',
                color: isSelected ? '#ffffff' : '#181e1b',
                border: isSelected ? 'none' : '1px solid #e2e8f0',
                boxShadow: isSelected ? '0 4px 12px rgba(69, 133, 90, 0.25)' : '0 2px 6px rgba(0,0,0,0.02)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <IconComponent size={15} color={isSelected ? '#ffffff' : '#181e1b'} />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
