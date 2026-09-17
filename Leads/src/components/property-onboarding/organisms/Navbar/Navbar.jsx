import React from 'react';
import { PlusCircle, LayoutGrid } from 'lucide-react';
import { Banner, Box, Inline, PlainButton } from '../../../common/atoms';

export function Navbar({ activeTab, setActiveTab }) {
  return (
    <Banner className="site-header" style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: '#2a593e',
      borderBottom: 'none'
    }}>
      <Box className="header-container header-content">
        {/* Brand Logo - Lampose enlarged */}
        <Box 
          onClick={() => setActiveTab('listings')}
          className="brand-logo"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            <Inline style={{
              fontFamily: "'Outfit', 'Inter', sans-serif",
              fontSize: '1.95rem',
              fontWeight: 800,
              color: '#F9F7F2',
              letterSpacing: '-0.02em'
            }}>
              Lam
            </Inline>
            <Inline style={{
              fontFamily: "'Outfit', 'Inter', sans-serif",
              fontSize: '1.95rem',
              fontWeight: 800,
              color: '#D8993E',
              letterSpacing: '-0.02em'
            }}>
              pose
            </Inline>
          </Box>

          {/* Subtitle Badge */}
          <Inline className="portal-badge" style={{
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
          </Inline>
        </Box>

        {/* Navigation Action Buttons enlarged */}
        <Box className="header-nav" style={{ gap: '12px' }}>
          <PlainButton
            onClick={() => setActiveTab('listings')}
            className={`btn nav-btn ${activeTab === 'listings' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '10px 22px', fontSize: '0.92rem' }}
          >
            <LayoutGrid size={17} />
            <Inline>Explore</Inline>
          </PlainButton>

          <PlainButton
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
            <Inline>Onboard</Inline>
          </PlainButton>
        </Box>
      </Box>
    </Banner>
  );
}
