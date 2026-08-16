import React, { useState } from 'react';
import { X, Mail, Lock, User, Phone, Eye, EyeOff, LogIn, UserPlus, Server, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { loginUser, registerUser, getAuthApiUrl, setAuthApiUrl } from '../../services/auth';

export default function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  if (!isOpen) return null;

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [role, setRole] = useState('Property Owner');

  // Custom Auth Backend URL Settings
  const [showUrlSettings, setShowUrlSettings] = useState(false);
  const [customUrl, setCustomUrl] = useState(getAuthApiUrl());

  const handleSaveUrl = () => {
    setAuthApiUrl(customUrl);
    setShowUrlSettings(false);
    setErrorMsg('');
    setSuccessMsg('Auth backend URL updated!');
    setTimeout(() => setSuccessMsg(''), 2500);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'login') {
      if (!email.trim() || !password.trim()) {
        setErrorMsg('Please enter your email and password.');
        return;
      }

      setLoading(true);
      const res = await loginUser({ email: email.trim(), password });
      setLoading(false);

      if (res.success) {
        setSuccessMsg(`Welcome back, ${res.user?.name || 'User'}!`);
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.user);
          onClose();
        }, 1000);
      } else {
        setErrorMsg(res.error || 'Failed to sign in. Please check your credentials.');
      }
    } else {
      // Sign up
      if (!name.trim() || !email.trim() || !password.trim()) {
        setErrorMsg('Please enter Name, Email, and Password.');
        return;
      }

      setLoading(true);
      const res = await registerUser({
        name: name.trim(),
        email: email.trim(),
        mobile: mobile.trim(),
        password,
        role
      });
      setLoading(false);

      if (res.success) {
        setSuccessMsg('Account created successfully! You are now logged in.');
        setTimeout(() => {
          if (onAuthSuccess) onAuthSuccess(res.user);
          onClose();
        }, 1200);
      } else {
        setErrorMsg(res.error || 'Failed to create account.');
      }
    }
  };

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      className="animate-fade-in"
    >
      <div 
        style={{
          maxWidth: '440px',
          width: '100%',
          background: '#ffffff',
          borderRadius: '24px',
          padding: '28px 24px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          position: 'relative',
          margin: 'auto'
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            background: '#f8faf8',
            border: '1px solid #e2e8f0',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <X size={18} />
        </button>

        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: '#eaf3ed',
            color: '#45855a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <ShieldCheck size={26} />
          </div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#181e1b' }}>
            {mode === 'login' ? 'Sign In to Lampose' : 'Create an Account'}
          </h3>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
            {mode === 'login' 
              ? 'Enter your details to manage listings & bookings' 
              : 'Join Lampose to list and explore verified accommodations'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{
          display: 'flex',
          background: '#f1f5f2',
          padding: '4px',
          borderRadius: '14px',
          marginBottom: '20px'
        }}>
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: mode === 'login' ? '#ffffff' : 'transparent',
              color: mode === 'login' ? '#181e1b' : '#64748b',
              boxShadow: mode === 'login' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <LogIn size={15} />
            <span>Sign In</span>
          </button>

          <button
            type="button"
            onClick={() => { setMode('signup'); setErrorMsg(''); setSuccessMsg(''); }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '10px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              background: mode === 'signup' ? '#ffffff' : 'transparent',
              color: mode === 'signup' ? '#181e1b' : '#64748b',
              boxShadow: mode === 'signup' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <UserPlus size={15} />
            <span>Sign Up</span>
          </button>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#eaf3ed',
            border: '1px solid #c2e2cc',
            color: '#45855a',
            fontSize: '0.82rem',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={16} color="#45855a" style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '0.82rem',
            fontWeight: 500,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <>
              {/* Full Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  Full Name *
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
              </div>

              {/* Mobile No */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  Mobile Number
                </label>
                <div style={{ position: 'relative' }}>
                  <Phone size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '38px' }}
                  />
                </div>
              </div>

              {/* Role */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  I am a:
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="form-select"
                >
                  <option value="Property Owner">Property Owner / Host</option>
                  <option value="Tenant / Seeker">Tenant / Guest</option>
                  <option value="Agent">Real Estate Agent</option>
                </select>
              </div>
            </>
          )}

          {/* Email / Username */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
              Email Address *
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', paddingRight: '38px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#64748b',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              marginTop: '8px',
              padding: '12px',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : (
              <>
                {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
                <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              </>
            )}
          </button>
        </form>

        {/* Backend Auth URL Settings Expandable */}
        <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #f1f5f2' }}>
          <button
            type="button"
            onClick={() => setShowUrlSettings(!showUrlSettings)}
            style={{
              background: 'none',
              border: 'none',
              color: '#64748b',
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              margin: '0 auto'
            }}
          >
            <Server size={12} color="#45855a" />
            <span>Auth Backend URL: <strong>{getAuthApiUrl()}</strong> (Configure)</span>
          </button>

          {showUrlSettings && (
            <div className="animate-fade-in" style={{
              marginTop: '10px',
              padding: '12px',
              borderRadius: '12px',
              background: '#f8faf8',
              border: '1px solid #e2e8f0'
            }}>
              <span style={{ fontSize: '0.72rem', color: '#64748b', display: 'block', marginBottom: '6px' }}>
                Set your custom authentication backend endpoint:
              </span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://your-auth-backend.com/api/auth"
                  className="form-input"
                  style={{ fontSize: '0.78rem', padding: '6px 10px', flex: 1 }}
                />
                <button
                  type="button"
                  onClick={handleSaveUrl}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.75rem', padding: '6px 12px', borderRadius: '8px' }}
                >
                  Save URL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
