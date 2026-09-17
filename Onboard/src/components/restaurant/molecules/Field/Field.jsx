import React from 'react';
import { Box, Inline, Label, Text } from '../../../common/atoms';

/*
 * A labelled box, with the hint above the control rather than below it.
 *
 * Above, because on a phone the control is usually the last thing on screen
 * before the keyboard covers everything under it — a hint printed beneath the
 * input is a hint nobody reads while typing into that input.
 */
export function Field({ label, hint, required, optional, htmlFor, children }) {
  return (
    <Box className="rst-field">
      {label && (
        <Label className="rst-label" htmlFor={htmlFor}>
          {label}
          {required && <Inline className="rst-req"> *</Inline>}
          {optional && <Inline className="rst-opt"> (Optional)</Inline>}
        </Label>
      )}
      {hint && <Text className="rst-hint">{hint}</Text>}
      {children}
    </Box>
  );
}

/** The heading strip that opens each section of a step. */
export function SectionHead({ icon, title }) {
  return (
    <Box className="rst-section-head">
      <Box className="rst-icon-badge">{icon}</Box>
      <Box className="rst-section-title">{title}</Box>
    </Box>
  );
}

/** A coloured strip that says one thing. `tone` is ok | info | warn | bad. */
export function Note({ tone = 'info', icon, children }) {
  return (
    <Box className={`rst-note rst-note-${tone}`}>
      {icon}
      <Inline>{children}</Inline>
    </Box>
  );
}
