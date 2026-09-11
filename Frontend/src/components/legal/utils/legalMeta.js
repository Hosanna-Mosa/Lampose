import { LAST_UPDATED } from './childSafetyMeta';

/* The four rows each legal document shows in its header band.

   Ampersands are written as plain `&` here, not as `&amp;`. In the JSX these
   replaced, `&amp;` was an HTML entity that JSX decoded to `&` before it ever
   reached the DOM; in a JavaScript string it would render as the five literal
   characters. The serialised HTML escapes it back to `&amp;` on the way out,
   so the captured markup is unchanged — but only if the data holds the
   character and not the entity. */

export const PRIVACY_META = [
  { label: 'ENTITY', value: 'LAMPOSE PRIVATE LIMITED' },
  { label: 'APPLICATION', value: 'LAMPOSE (Android & iOS)' },
  { label: 'VERSION', value: 'Version 1.0' },
  { label: 'COMPLIANCE FRAMEWORK', value: 'DPDP Act 2023 & App Store 5.1', badge: true },
];

export const TERMS_META = [
  { label: 'ENTITY', value: 'LAMPOSE PRIVATE LIMITED' },
  { label: 'APPLICATION', value: 'LAMPOSE (Android & iOS) & Web' },
  { label: 'VERSION', value: 'Version 1.0' },
  { label: 'JURISDICTION', value: 'Indian Law & IT Act 2000', badge: true },
];

export const CHILD_SAFETY_META = [
  { label: 'ENTITY', value: 'LAMPOSE PRIVATE LIMITED' },
  { label: 'APPLIES TO', value: 'LAMPOSE (Android & iOS) & Web' },
  { label: 'LAST UPDATED', value: LAST_UPDATED },
  { label: 'POLICY STANCE', value: 'Zero Tolerance', badge: true },
];
