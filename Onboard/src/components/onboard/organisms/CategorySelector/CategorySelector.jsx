import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CATEGORY_OPTIONS } from '../../utils/categoryOptions';
import { Box, Heading, Label, Text } from '../../../common/atoms';

/*
 * The categories, by code.
 *
 * `id` is what gets stored — see Backend/src/shared/constants/categories.js,
 * which is where the list is defined and which will reject anything else.
 * The title and subtitle are this screen's own words for them.
 *
 * PG and hostel are one category now. An agent standing in a building does
 * not need to decide which word applies before the form will let them
 * continue, and the fields that follow are the union of what the two asked.
 */

export function CategorySelector({ selectedCategory, onSelectCategory }) {
  return (
    <Box style={{ marginBottom: '24px' }}>
      <Label className="form-label" style={{ fontSize: '1rem', color: '#181e1b', marginBottom: '12px' }}>
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
                background: isSelected ? '#eaf3ed' : '#ffffff',
                borderColor: isSelected ? '#45855a' : '#e2e8f0',
                boxShadow: isSelected ? '0 6px 20px rgba(69, 133, 90, 0.15)' : 'none',
                transition: 'all 0.25s ease'
              }}
            >
              {isSelected && (
                <Box className="category-check" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <CheckCircle2 size={18} color="#45855a" />
                </Box>
              )}

              <Box className="category-card-body">
                <Box style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: isSelected ? '#45855a' : '#f1f5f2',
                  color: isSelected ? '#ffffff' : '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconComponent size={20} />
                </Box>

                <Box>
                  <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <Heading level={4} style={{ fontSize: '0.95rem', fontWeight: 700, color: '#181e1b' }}>{cat.title}</Heading>
                  </Box>
                  <Text className="category-desc" style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.3' }}>
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
