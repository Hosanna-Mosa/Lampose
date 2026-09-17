import React, { useState } from 'react';
import { X, Mail, Lock, User, Phone, Eye, EyeOff, LogIn, UserPlus, Server, Loader2, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { loginUser, registerUser, API_BASE_URL } from '../../../../services/api.js';
import { Box, Form, Heading, Inline, Input, Label, Option, PlainButton, Select, Strong, Text } from '../../../common/atoms';

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
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
    <Box 
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
      <Box 
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
        <PlainButton
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
        </PlainButton>

        {/* Header Branding */}
        <Box style={{ textAlign: 'center', marginBottom: '20px' }}>
          <Box style={{
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
          </Box>
          <Heading level={3} style={{ fontSize: '1.35rem', fontWeight: 800, color: '#181e1b' }}>
            {mode === 'login' ? 'Sign In to Lampose' : 'Create an Account'}
          </Heading>
          <Text style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '4px' }}>
            {mode === 'login' 
              ? 'Enter your details to manage listings & bookings' 
              : 'Join Lampose to list and explore verified accommodations'}
          </Text>
        </Box>

        {/* Mode Selector Tabs */}
        <Box style={{
          display: 'flex',
          background: '#f1f5f2',
          padding: '4px',
          borderRadius: '14px',
          marginBottom: '20px'
        }}>
          <PlainButton
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
            <Inline>Sign In</Inline>
          </PlainButton>

          <PlainButton
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
            <Inline>Sign Up</Inline>
          </PlainButton>
        </Box>

        {/* Success Alert */}
        {successMsg && (
          <Box style={{
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
            <Inline>{successMsg}</Inline>
          </Box>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <Box style={{
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
            <Inline>{errorMsg}</Inline>
          </Box>
        )}

        {/* Form Body */}
        <Form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {mode === 'signup' && (
            <>
              {/* Full Name */}
              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  Full Name *
                </Label>
                <Box style={{ position: 'relative' }}>
                  <User size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <Input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '38px' }}
                  />
                </Box>
              </Box>

              {/* Mobile No */}
              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  Mobile Number
                </Label>
                <Box style={{ position: 'relative' }}>
                  <Phone size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                  <Input
                    type="tel"
                    placeholder="e.g. +91 9876543210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    className="form-input"
                    style={{ paddingLeft: '38px' }}
                  />
                </Box>
              </Box>

              {/* Role */}
              <Box className="form-group" style={{ marginBottom: 0 }}>
                <Label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
                  I am a:
                </Label>
                <Select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="form-select"
                >
                  <Option value="Property Owner">Property Owner / Host</Option>
                  <Option value="Tenant / Seeker">Tenant / Guest</Option>
                  <Option value="Agent">Real Estate Agent</Option>
                </Select>
              </Box>
            </>
          )}

          {/* Email / Username */}
          <Box className="form-group" style={{ marginBottom: 0 }}>
            <Label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
              Email Address *
            </Label>
            <Box style={{ position: 'relative' }}>
              <Mail size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <Input
                type="email"
                required
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px' }}
              />
            </Box>
          </Box>

          {/* Password */}
          <Box className="form-group" style={{ marginBottom: 0 }}>
            <Label className="form-label" style={{ fontSize: '0.82rem', color: '#181e1b', fontWeight: 600 }}>
              Password *
            </Label>
            <Box style={{ position: 'relative' }}>
              <Lock size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <Input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', paddingRight: '38px' }}
              />
              <PlainButton
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
              </PlainButton>
            </Box>
          </Box>

          {/* Submit Button */}
          <PlainButton
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
                <Inline>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</Inline>
              </>
            ) : (
              <>
                {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
                <Inline>{mode === 'login' ? 'Sign In' : 'Create Account'}</Inline>
              </>
            )}
          </PlainButton>
        </Form>

        {/*
          The API host, shown but NOT editable.

          This used to be a "Configure" box that wrote the auth URL into
          localStorage. It meant a browser could be pinned to a host the rest
          of the site never called, which no server-side CORS allowlist can
          fix — so the address now comes from VITE_API_BASE_URL and the only
          way to change it is to change the deployment. It stays on screen
          because "which backend am I talking to" is still the first question
          worth answering when a login fails.
        */}
        <Box style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #f1f5f2' }}>
          <Box
            style={{
              color: '#64748b',
              fontSize: '0.74rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px'
            }}
          >
            <Server size={12} color="#45855a" />
            <Inline>API: <Strong>{API_BASE_URL}</Strong></Inline>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
