import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Box, Inline, Label, Text } from '../../../common/atoms';

/*
 * A labelled box, with the hint above the control rather than below it.
 *
 * Above, because on a phone the control is usually the last thing on screen
 * before the keyboard covers everything under it — a hint printed beneath the
 * input is a hint nobody reads while typing into that input.
 *
 * The ERROR goes below, for the opposite reason: it is about what was just
 * typed, so it belongs where the eye leaves the control, and it is the one
 * line that must not be mistaken for instructions about a field further down.
 */
export function Field({
  label, hint, required, optional, htmlFor, error, children,
}) {
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
      <FieldError message={error} />
    </Box>
  );
}

/*
 * One problem, printed against the one control it belongs to.
 *
 * Renders nothing without a message, so a caller can pass `errors.whatever`
 * straight in without a conditional — which is what keeps a field and its
 * error from drifting apart when one of them is edited.
 *
 * `role="alert"` so a screen reader announces it when it appears: the agent
 * who most needs telling is the one who has already moved on to the next box.
 */
export function FieldError({ message }) {
  if (!message) return null;

  return (
    <Box className="rst-err" role="alert">
      <AlertCircle size={13} />
      <Inline>{message}</Inline>
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
