import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * The warning printed under the field it is about.
 *
 * One component rather than the same inline `<span style={{ color: '#f43f5e' …}}>`
 * copied at every input, because the copies had already started to drift and a
 * message that looks different in two places reads as two different kinds of
 * problem.
 *
 * It carries a glyph as well as the colour. An agent onboarding a property in
 * daylight on a cheap phone is the case red-on-white text loses, and the
 * message is the only thing telling them why the form will not submit.
 *
 * `role="alert"` so a screen reader announces it when it appears rather than
 * leaving the user pressing a button that silently does nothing.
 */
export default function FieldError({ message }) {
  if (!message) return null;

  return (
    <span
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '5px',
        color: '#dc2626',
        fontSize: '0.78rem',
        fontWeight: 600,
        lineHeight: 1.35,
        marginTop: '5px',
      }}
    >
      <AlertCircle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{message}</span>
    </span>
  );
}

/** The border an input wears while it has a message under it. */
export const errorBorder = (hasError) => (hasError ? '#dc2626' : undefined);
