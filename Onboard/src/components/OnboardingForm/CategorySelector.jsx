import React from 'react';
import { Building2, BedDouble, Users, Home, CheckCircle2 } from 'lucide-react';

/*
 * The four categories, by code.
 *
 * `id` is what gets stored — see Backend/src/shared/constants/categories.js,
 * which is where the list is defined and which will reject anything else.
 * The title and subtitle are this screen's own words for them.
 *
 * PG and hostel are one category now. An agent standing in a building does
 * not need to decide which word applies before the form will let them
 * continue, and the fields that follow are the union of what the two asked.
 */
const CATEGORY_OPTIONS = [
  {
    id: 'PG_HOSTEL',
    title: 'PG / Hostel',
    subtitle: 'Sharing rooms, meals, warden or canteen — student and worker stays',
    badge: 'Popular',
    icon: Building2
  },
  {
    id: 'BACHELOR',
    title: 'Bachelor Room / Flat',
    subtitle: '1BHK/2BHK flat or room for male/female bachelors',
    badge: 'Private',
    icon: Users
  },
  {
    id: 'HOTEL',
    title: 'Hotel / Dormitory',
    subtitle: 'Bunk beds or rooms, nightly rates, lockers & shared bath',
    badge: 'By the night',
    icon: BedDouble
  },
  {
    id: 'COLIVE',
    title: 'House / Co-live',
    subtitle: 'A whole house or a room in one, shared with other tenants',
    badge: 'Shared',
    icon: Home
  }
];

export default function CategorySelector({ selectedCategory, onSelectCategory }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <label className="form-label" style={{ fontSize: '1rem', color: '#181e1b', marginBottom: '12px' }}>
        1. Select Accommodation Category *
      </label>

      <div className="category-selector-grid">
        {CATEGORY_OPTIONS.map((cat) => {
          const IconComponent = cat.icon;
          const isSelected = selectedCategory === cat.id;

          return (
            <div
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
                <div className="category-check" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <CheckCircle2 size={18} color="#45855a" />
                </div>
              )}

              <div className="category-card-body">
                <div style={{
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
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#181e1b' }}>{cat.title}</h4>
                  </div>
                  <p className="category-desc" style={{ fontSize: '0.78rem', color: '#64748b', lineHeight: '1.3' }}>
                    {cat.subtitle}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
