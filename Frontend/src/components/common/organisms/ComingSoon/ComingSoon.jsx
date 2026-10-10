import { useState } from 'react';
import { Icon } from '../../atoms/Icon/Icon';
import { Box, Form, Heading, Inline, Input, Label, PlainButton, Strong, Text } from '../../atoms';
import { interestApi } from '../../../../api/interestApi';

/* `page` names where the form is shown ('food-partner' or
   'food-partner-onboarding'); the sign-up is stored as a website lead for the
   leads panel. The success card only appears once the server has said 2xx —
   a failure keeps the typed address and says why. */
export function ComingSoon({ page }) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || sending) return;
    setSending(true);
    setProblem('');
    try {
      await interestApi.signUp(email, page);
      setSubscribed(true);
    } catch (err) {
      setProblem(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setSending(false);
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
                  disabled={sending}
                  aria-invalid={problem ? true : undefined}
                  aria-describedby={problem ? 'cs-email-error' : undefined}
                  required
                />
                <PlainButton type="submit" className="cs-anim-btn" disabled={sending} aria-busy={sending}>
                  <Inline>{sending ? 'Sending…' : 'Notify Me'}</Inline>
                  <Icon name="arrowR" className="cs-btn-arrow" />
                  <Box className="cs-btn-shine" />
                </PlainButton>
              </Box>

              {problem && (
                <Text id="cs-email-error" className="cs-anim-error" role="alert">{problem}</Text>
              )}
            </Form>
          )}
        </Box>
      </Box>
    </Box>
  );
}
