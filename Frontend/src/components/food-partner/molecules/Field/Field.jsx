import React from 'react';
import { Box, Inline, Label, Text } from '../../../common/atoms';

/* ══════════════════════════════════════════════════════════════════════════
   Form atoms for the partner onboarding flow.

   The site's contact form is eight fields and styles them inline; this one is
   closer to a hundred across four steps, so the label / hint / control trio
   lives here once. Everything wears the same tokens as the rest of the site —
   grey ground, white card, green accent — and nothing here knows which step
   it is being used on.
   ══════════════════════════════════════════════════════════════════════════ */

export const Field = ({ label, required, optional, hint, htmlFor, children }) => (
  <Box className="ob-field">
    {label && (
      <Label className="ob-label" htmlFor={htmlFor}>
        {label}
        {required && <Inline className="ob-req">*</Inline>}
        {optional && <Inline className="ob-opt">(optional)</Inline>}
      </Label>
    )}
    {hint && <Text className="ob-hint">{hint}</Text>}
    {children}
  </Box>
);
