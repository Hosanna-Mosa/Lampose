import React from 'react';
import { PlusCircle, LayoutGrid, LogIn, LogOut, User } from 'lucide-react';
import { Banner, Box, Image, Inline, PlainButton } from '../../atoms';

export function Navbar({ activeTab, setActiveTab, user, onOpenAuthModal, onLogout }) {
  return (
    <Banner className="site-header" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      width: '100%',
      zIndex: 1000,
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)'
    }}>
      <Box className="header-container header-content">
        {/* Brand Logo */}
        <Box 
          onClick={() => setActiveTab('listings')}
          className="brand-logo"
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <Image 
            src="/lampose-logo-splash.png" 
            alt="lampose logo" 
            className="brand-logo-img"
          />
        </Box>

        {/* Navigation Action Buttons */}
        <Box className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <PlainButton
            onClick={() => setActiveTab('listings')}
            className="nav-btn"
            style={{ 
              background: activeTab === 'listings' ? '#f1f5f2' : '#ffffff',
              borderColor: activeTab === 'listings' ? '#cbd5e1' : '#e2e8f0',
              fontWeight: 600
            }}
          >
            <LayoutGrid size={16} />
            <Inline className="nav-btn-text">Explore</Inline>
          </PlainButton>
 
          <PlainButton
            onClick={() => setActiveTab('onboard')}
            className="nav-btn nav-btn-primary"
            style={{ 
              fontWeight: 600
            }}
          >
            <PlusCircle size={16} />
            <Inline className="nav-btn-text">Onboard</Inline>
          </PlainButton>
 
          {/* User Auth Section */}
          {user ? (
            <Box style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '4px' }}>
              <Box 
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  background: '#eaf3ed',
                  border: '1px solid #c2e2cc',
                  color: '#181e1b',
                  fontSize: '0.82rem',
                  fontWeight: 600
                }}
              >
                <Box style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '50%',
                  background: '#45855a',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}>
                  {user.name ? user.name[0].toUpperCase() : 'U'}
                </Box>
                <Inline className="user-badge-name" style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || 'User'}
                </Inline>
              </Box>

              <PlainButton
                onClick={onLogout}
                className="nav-btn"
                style={{
                  padding: '6px 10px',
                  background: '#fef2f2',
                  borderColor: '#fecaca',
                  color: '#dc2626',
                  fontSize: '0.78rem'
                }}
                title="Sign Out"
              >
                <LogOut size={14} />
              </PlainButton>
            </Box>
          ) : (
            <PlainButton
              onClick={onOpenAuthModal}
              className="nav-btn"
              style={{
                marginLeft: '4px',
                background: '#181e1b',
                color: '#ffffff',
                borderColor: '#181e1b',
                fontWeight: 600
              }}
            >
              <LogIn size={15} />
              <Inline>Login</Inline>
            </PlainButton>
          )}
        </Box>
      </Box>
    </Banner>
  );
}
