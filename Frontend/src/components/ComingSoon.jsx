import { useState } from 'react';
import Icon from './Icon';

export default function ComingSoon() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <div className="cs-anim-page">
      {/* Background Animated Gradient Mesh / Orbs */}
      <div className="cs-anim-backdrop" aria-hidden="true">
        <div className="cs-orb cs-orb-1" />
        <div className="cs-orb cs-orb-2" />
        <div className="cs-orb cs-orb-3" />
        <div className="cs-grid-overlay" />
        <div className="cs-rings">
          <div className="cs-ring cs-ring-1" />
          <div className="cs-ring cs-ring-2" />
        </div>
      </div>

      <div className="cs-anim-container">
        {/* Floating animated badge */}
        <div className="cs-anim-badge">
          <span className="cs-anim-dot" />
          <span>In The Works</span>
        </div>

        {/* Shimmering Animated Title */}
        <h1 className="cs-anim-title">
          <span>Coming Soon</span>
        </h1>

        {/* Ambient divider light */}
        <div className="cs-anim-line">
          <div className="cs-anim-line-glow" />
        </div>

        {/* Glass card container for Notify Form */}
        <div className="cs-anim-card">
          {subscribed ? (
            <div className="cs-anim-success">
              <div className="cs-anim-success-circle">
                <Icon name="verified" className="cs-success-ico" />
              </div>
              <div className="cs-anim-success-text">
                <strong>You're on the list!</strong>
                <p>We'll notify you the moment this launches.</p>
              </div>
            </div>
          ) : (
            <form className="cs-anim-form" onSubmit={handleSubmit}>
              <label htmlFor="cs-email-input" className="cs-anim-prompt">
                <span className="cs-prompt-icon">🔔</span>
                <span>Notify me when it is launched</span>
              </label>

              <div className="cs-anim-input-group">
                <input
                  id="cs-email-input"
                  type="email"
                  className="cs-anim-input"
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button type="submit" className="cs-anim-btn">
                  <span>Notify Me</span>
                  <Icon name="arrowR" className="cs-btn-arrow" />
                  <div className="cs-btn-shine" />
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
