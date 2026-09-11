import React from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { CATEGORIES } from '../../utils/categories';
import { Box, Inline, Input, PlainButton, Strong } from '../../../common/atoms';


export function FilterBar({
  selectedCategory,
  onCategoryChange,
  searchTerm,
  onSearchChange,
  totalCount
}) {
  return (
    <Box style={{ marginBottom: '24px' }}>
      {/* Search & Category Filter Header Container */}
      <Box className="glass-card" style={{ padding: '16px 20px', borderRadius: 'var(--radius-md)' }}>
        
        {/* Top Search Input Row */}
        <Box style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px'
        }}>
          <Box style={{ position: 'relative', flex: 1 }}>
            <Search
              size={18}
              color="#D8993E"
              style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <Input
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
          </Box>

          <Box style={{
            fontSize: '0.85rem',
            color: 'var(--text-sub)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexShrink: 0
          }}>
            <SlidersHorizontal size={16} color="#D8993E" />
            <Inline>Showing <Strong style={{ color: '#ffffff' }}>{totalCount}</Strong> Properties</Inline>
          </Box>
        </Box>

        {/* Category Tabs Scrollable Row */}
        <Box style={{
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
              <PlainButton
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
                <Inline>{cat.label}</Inline>
              </PlainButton>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
}
