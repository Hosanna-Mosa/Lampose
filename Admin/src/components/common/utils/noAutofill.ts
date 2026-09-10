import type React from 'react';

/**
 * Spread onto credential inputs that must open empty.
 *
 * Chrome ignores `autocomplete="off"` on fields it reads as a username or
 * password and fills them from the saved-password store on load. It does skip
 * read-only inputs, so the field is rendered read-only and becomes editable the
 * moment the user focuses it — by which point the autofill pass has run. The
 * data attributes suppress the 1Password and LastPass overlays for the same
 * reason. Do not add `autoFocus` alongside this: focusing at mount would clear
 * the read-only flag before autofill runs and defeat it.
 */
export const NO_AUTOFILL = {
  autoComplete: 'off',
  readOnly: true,
  onFocus: (e: React.FocusEvent<HTMLInputElement>) =>
    e.currentTarget.removeAttribute('readonly'),
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-bwignore': true,
} as const;
