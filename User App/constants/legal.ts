/**
 * The public legal pages, in one place.
 *
 * The sign-in screen and the listing page both link to these, and App Review
 * checks that the privacy policy named in App Store Connect is reachable from
 * inside the app.
 */
export const LEGAL_URLS = {
  privacy: 'https://lampose.com/privacy',
  terms: 'https://lampose.com/terms',
} as const;
