import React from 'react';
import { Building2, BedDouble, Users, CheckCircle2 } from 'lucide-react';

const CATEGORY_OPTIONS = [
  {
    id: 'PG',
    title: 'Paying Guest (PG)',
    subtitle: 'Food included, sharing rooms, student/worker stays',
    badge: 'Popular',
    icon: Building2
  },
  {
    id: 'Hostel',
    title: 'Student/Work Hostel',
    subtitle: 'Boys/Girls hostel with canteen, warden & security',
    badge: 'Secure',
    icon: Building2
  },
  {
    id: 'Dormitory',
    title: 'Dormitory / Pods',
    subtitle: 'Bunk beds, daily rates, personal lockers & shared bath',
    badge: 'Budget',
    icon: BedDouble
  },
  {
    id: 'Bachelor Room',
    title: 'Bachelor Room / Flat',
    subtitle: '1BHK/2BHK flat or room for male/female bachelors',
    badge: 'Private',
    icon: Users
  }
];

export default function CategorySelector({ selectedCategory, onSelectCategory }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <label className="form-label" style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '12px' }}>
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
                background: isSelected ? 'rgba(216, 153, 62, 0.18)' : 'rgba(255, 255, 255, 0.05)',
                borderColor: isSelected ? '#D8993E' : 'var(--border-glass)',
                boxShadow: isSelected ? '0 8px 24px rgba(216, 153, 62, 0.25)' : 'none',
                transition: 'all 0.25s ease'
              }}
            >
              {isSelected && (
                <div className="category-check" style={{ position: 'absolute', top: '10px', right: '10px' }}>
                  <CheckCircle2 size={18} color="#D8993E" />
                </div>
              )}

              <div className="category-card-body">
                <div style={{
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
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>{cat.title}</h4>
                  </div>
                  <p className="category-desc" style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
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
