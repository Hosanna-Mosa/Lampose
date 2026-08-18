import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, LogIn, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { loginUser } from '../../services/api.js';

export default function AuthScreen({ onAuthSuccess }) {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please enter employee email and password.');
      return;
    }

    setLoading(true);
    const res = await loginUser({ email: email.trim(), password });
    setLoading(false);

    if (res.success) {
      setSuccessMsg(`Welcome, ${res.user?.name || 'Employee'}! Access authorized.`);
      setTimeout(() => {
        if (onAuthSuccess) onAuthSuccess(res.user);
      }, 600);
    } else {
      setErrorMsg(res.error || 'Invalid email or password.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      background: 'linear-gradient(135deg, #f0f7f2 0%, #ffffff 50%, #eaf3ed 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      position: 'relative',
      overflow: 'hidden'
    }} className="animate-fade-in">
      
      {/* Background Decorative Rings */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-5%',
        width: '450px',
        height: '450px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(69, 133, 90, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-5%',
        width: '500px',
        height: '500px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(69, 133, 90, 0.1) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      <div style={{
        maxWidth: '420px',
        width: '100%',
        background: '#ffffff',
        borderRadius: '28px',
        padding: '40px 32px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.08), 0 0 1px 1px rgba(0, 0, 0, 0.02)',
        position: 'relative',
        zIndex: 10
      }}>
        
        {/* Brand Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <img
            src="/lampose-logo-splash.png"
            alt="Lampose Logo"
            style={{
              height: '54px',
              maxWidth: '180px',
              objectFit: 'contain',
              margin: '0 auto 12px'
            }}
          />
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#181e1b', letterSpacing: '-0.02em' }}>
            Employee Portal Login
          </h2>
          <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '4px' }}>
            Sign in with authorized employee credentials to onboard properties
          </p>
        </div>

        {/* Success Alert */}
        {successMsg && (
          <div style={{
            padding: '12px 14px',
            borderRadius: '14px',
            background: '#eaf3ed',
            border: '1px solid #c2e2cc',
            color: '#45855a',
            fontSize: '0.84rem',
            fontWeight: 600,
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <CheckCircle2 size={18} color="#45855a" style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMsg && (
          <div style={{
            padding: '12px 14px',
            borderRadius: '14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            fontSize: '0.84rem',
            fontWeight: 500,
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Employee Email */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.84rem', color: '#181e1b', fontWeight: 600 }}>
              Employee Email *
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={17} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                required
                placeholder="employee@lampose.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px' }}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.84rem', color: '#181e1b', fontWeight: 600 }}>
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={17} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="Enter employee password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '38px', paddingRight: '38px' }}
                autoComplete="current-password"
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
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              marginTop: '10px',
              padding: '13px',
              borderRadius: '14px',
              fontWeight: 700,
              fontSize: '0.98rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <>
                <Loader2 size={19} className="animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <LogIn size={19} />
                <span>Sign In to Onboarding Panel</span>
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
