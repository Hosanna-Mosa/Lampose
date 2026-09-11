import { useState } from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import { Box, Form, Heading, Inline, Input, Label, PlainButton, Strong, Text } from '../../atoms';

export function ComingSoon() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
    }
  };

  return (
    <Box className="cs-anim-page">
      {/* Background Animated Gradient Mesh / Orbs */}
      <Box className="cs-anim-backdrop" aria-hidden="true">
        <Box className="cs-orb cs-orb-1" />
        <Box className="cs-orb cs-orb-2" />
        <Box className="cs-orb cs-orb-3" />
        <Box className="cs-grid-overlay" />
        <Box className="cs-rings">
          <Box className="cs-ring cs-ring-1" />
          <Box className="cs-ring cs-ring-2" />
        </Box>
      </Box>

      <Box className="cs-anim-container">
        {/* Floating animated badge */}
        <Box className="cs-anim-badge">
          <Inline className="cs-anim-dot" />
          <Inline>In The Works</Inline>
        </Box>

        {/* Shimmering Animated Title */}
        <Heading level={1} className="cs-anim-title">
          <Inline>Coming Soon</Inline>
        </Heading>

        {/* Ambient divider light */}
        <Box className="cs-anim-line">
          <Box className="cs-anim-line-glow" />
        </Box>

        {/* Glass card container for Notify Form */}
        <Box className="cs-anim-card">
          {subscribed ? (
            <Box className="cs-anim-success">
              <Box className="cs-anim-success-circle">
                <Icon name="verified" className="cs-success-ico" />
              </Box>
              <Box className="cs-anim-success-text">
                <Strong>You're on the list!</Strong>
                <Text>We'll notify you the moment this launches.</Text>
              </Box>
            </Box>
          ) : (
            <Form className="cs-anim-form" onSubmit={handleSubmit}>
              <Label htmlFor="cs-email-input" className="cs-anim-prompt">
                <Inline className="cs-prompt-icon">🔔</Inline>
                <Inline>Notify me when it is launched</Inline>
              </Label>

              <Box className="cs-anim-input-group">
                <Input
                  id="cs-email-input"
                  type="email"
                  className="cs-anim-input"
                  placeholder="Enter your email address..."
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <PlainButton type="submit" className="cs-anim-btn">
                  <Inline>Notify Me</Inline>
                  <Icon name="arrowR" className="cs-btn-arrow" />
                  <Box className="cs-btn-shine" />
                </PlainButton>
              </Box>
            </Form>
          )}
        </Box>
      </Box>
    </Box>
  );
}
