/* Which routes sit on light ground, which one drops the footer, and where the
   old .html URLs now point. Lifted out of App.jsx unchanged. */

export const LIGHT_TOP = ['/', '/explore', '/services', '/how', '/cities', '/partners', '/food', '/food-partner', '/download', '/contact', '/privacy', '/terms', '/child-safety'];

export const isLightTop = p => LIGHT_TOP.some(r => p === r || p.startsWith(`${r}/`));

export const isChromeless = p => p.startsWith('/food-partner/onboarding');

export const LEGACY = {
  '/index.html': '/',
  '/explore.html': '/explore',
  '/services.html': '/services',
  '/how.html': '/how',
  '/cities.html': '/cities',
  '/partners.html': '/partners',
  '/food.html': '/food',
  '/download.html': '/download',
  '/contact.html': '/contact',
  '/privacy.html': '/privacy',
  '/terms.html': '/terms',
};
