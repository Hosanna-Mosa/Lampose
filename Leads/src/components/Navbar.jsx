import React from 'react';
import { PlusCircle, LayoutGrid } from 'lucide-react';

export default function Navbar({ activeTab, setActiveTab }) {
  return (
    <header className="site-header" style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#2a593e',
      borderBottom: 'none'
    }}>
      <div className="header-container header-content">
        {/* Brand Logo - Lampose enlarged */}
        <div 
          onClick={() => setActiveTab('listings')}
          className="brand-logo"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{
              fontFamily: "'Outfit', 'Inter', sans-serif",
              fontSize: '1.95rem',
              fontWeight: 800,
              color: '#F9F7F2',
              letterSpacing: '-0.02em'
            }}>
              Lam
            </span>
            <span style={{
              fontFamily: "'Outfit', 'Inter', sans-serif",
              fontSize: '1.95rem',
              fontWeight: 800,
              color: '#D8993E',
              letterSpacing: '-0.02em'
            }}>
              pose
            </span>
          </div>

          {/* Subtitle Badge */}
          <span className="portal-badge" style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            padding: '3px 9px',
            borderRadius: '10px',
            background: 'rgba(216, 153, 62, 0.2)',
            color: '#f5b963',
            border: '1px solid rgba(216, 153, 62, 0.4)',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap'
          }}>
            PORTAL
          </span>
        </div>

        {/* Navigation Action Buttons enlarged */}
        <div className="header-nav" style={{ gap: '12px' }}>
          <button
            onClick={() => setActiveTab('listings')}
            className={`btn nav-btn ${activeTab === 'listings' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '10px 22px', fontSize: '0.92rem' }}
          >
            <LayoutGrid size={17} />
            <span>Explore</span>
          </button>

          <button
            onClick={() => setActiveTab('onboard')}
            className={`btn nav-btn ${activeTab === 'onboard' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ 
              padding: '10px 22px',
              fontSize: '0.92rem',
              background: activeTab === 'onboard' ? '#D8993E' : 'rgba(255, 255, 255, 0.12)',
              color: '#ffffff'
            }}
          >
            <PlusCircle size={17} />
            <span>Onboard</span>
          </button>
        </div>
      </div>
    </header>
  );
}
