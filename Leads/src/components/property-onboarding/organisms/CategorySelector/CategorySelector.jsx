import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CATEGORY_OPTIONS } from '../../utils/categoryOptions';
import { Box, Heading, Label, Text } from '../../../common/atoms';


export function CategorySelector({ selectedCategory, onSelectCategory }) {
  return (
    <Box style={{ marginBottom: '24px' }}>
      <Label className="form-label" style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '12px' }}>
        1. Select Accommodation Category *
      </Label>

      <Box className="category-selector-grid">
        {CATEGORY_OPTIONS.map((cat) => {
          const IconComponent = cat.icon;
          const isSelected = selectedCategory === cat.id;

          return (
            <Box
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="glass-card category-card"
              style={{
                cursor: 'pointer',
                position: 'relative',
                background: isSelected ? 'rgba(216, 153, 62, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                borderColor: isSelected ? '#D8993E' : 'var(--border-glass)',
                boxShadow: isSelected ? '0 8px 24px rgba(216, 153, 62, 0.25)' : 'none',
                transition: 'all 0.25s ease'
              }}
            >
              {isSelected && (
                <Box className="category-check" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <CheckCircle2 size={18} color="#D8993E" />
                </Box>
              )}

              <Box className="category-card-body">
                <Box style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: isSelected ? '#D8993E' : 'rgba(255, 255, 255, 0.1)',
                  color: isSelected ? '#ffffff' : 'var(--text-sub)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconComponent size={20} />
                </Box>

                <Box>
                  <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <Heading level={4} style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>{cat.title}</Heading>
                  </Box>
                  <Text className="category-desc" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                    {cat.subtitle}
                  </Text>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
