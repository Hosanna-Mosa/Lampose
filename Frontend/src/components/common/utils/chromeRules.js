/* Which routes sit on light ground, which one drops the footer, and where the
   old .html URLs now point. Lifted out of App.jsx unchanged. */

export const LIGHT_TOP = ['/', '/explore', '/partners', '/food-partner', '/contact', '/privacy', '/terms', '/child-safety', '/delete-account'];

export const isLightTop = p => LIGHT_TOP.some(r => p === r || p.startsWith(`${r}/`));

export const isChromeless = p => p.startsWith('/food-partner/onboarding');

/*
 * The .html URLs the site had before this rebuild, and where they land now.
 *
 * Services and How It Works are sections of the home page rather than routes,
 * so their old links resolve to the anchor rather than to a page that no
 * longer exists — the visitor still arrives at what they clicked for.
 *
 * Cities, Food and Download are gone outright and their entries go with them.
 * Left in, they would redirect a bookmark to a route that is no longer
 * mounted, which the catch-all silently answers with the home page: the same
 * destination, reached by an indirection that says the page still exists. A
 * removed page should read as removed.
 */
export const LEGACY = {
  '/index.html': '/',
  '/explore.html': '/explore',
  '/services.html': '/#services',
  '/how.html': '/#how',
  '/partners.html': '/partners',
  '/contact.html': '/contact',
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
};
