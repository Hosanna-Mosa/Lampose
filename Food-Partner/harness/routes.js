/* The route manifest.

   Explicit, and asserted against a glob of app/ (F11). The route set is a
   CONTRACT — these paths are URLs — and a move-and-split refactor extracts
   components OUT of route files without ever adding or moving one. So a file
   appearing in or disappearing from app/ is a failure, not a surprise:
   - a route deleted or renamed vanishes silently with a green build (M5)
   - a helper left behind in app/ silently BECOMES a route
   - a file dropped into app/(dash)/ becomes a fifth tab under a tab bar
     hardcoded to four (parked as P2)

   `must` strings are the F6 guard: proof the thing under test was actually on
   screen, not merely that the snapshot matched. */

module.exports = [
  { name: 'root-layout',           file: 'app/_layout.tsx' },
  { name: 'index',                 file: 'app/index.tsx',                 must: ['Lampose'] },
  { name: 'signin',                file: 'app/signin.tsx',                must: ['Welcome back'] },
  { name: 'status',                file: 'app/status.tsx',                must: ['r_seed_1'] },
  { name: 'submitted',             file: 'app/submitted.tsx',             must: ['Application submitted'] },
  { name: 'new-order',             file: 'app/new-order.tsx',             must: ['New order'] },
  { name: 'not-found',             file: 'app/+not-found.tsx',            must: ['Screen not found'] },
  { name: 'dash-layout',           file: 'app/(dash)/_layout.tsx',        must: ['Home', 'Menu', 'Orders', 'Profile'] },
  { name: 'dash-index',            file: 'app/(dash)/index.tsx',          must: ['Paradise Biryani'] },
  { name: 'dash-menu',             file: 'app/(dash)/menu.tsx',           must: ['Chicken Dum Biryani'] },
  { name: 'dash-orders',           file: 'app/(dash)/orders.tsx',         must: ['LMP-100241'] },
  { name: 'dash-profile',          file: 'app/(dash)/profile.tsx',        must: ['Paradise Biryani'] },
  { name: 'onboarding-layout',     file: 'app/onboarding/_layout.tsx' },
  { name: 'onboarding-restaurant', file: 'app/onboarding/restaurant.tsx', must: ['Step 1 of 5'] },
  { name: 'onboarding-operations', file: 'app/onboarding/operations.tsx', must: ['Step 2 of 5'] },
  { name: 'onboarding-menu',       file: 'app/onboarding/menu.tsx',       must: ['Step 3 of 5'] },
  { name: 'onboarding-documents',  file: 'app/onboarding/documents.tsx',  must: ['Step 4 of 5'] },
  { name: 'onboarding-contract',   file: 'app/onboarding/contract.tsx',   must: ['Step 5 of 5'] },
  { name: 'support-layout',        file: 'app/support/_layout.tsx' },
  { name: 'support-index',         file: 'app/support/index.tsx',         must: ['SUP-1001'] },
  { name: 'support-new',           file: 'app/support/new.tsx',           must: ['New request'] },
  { name: 'support-reference',     file: 'app/support/[reference].tsx',   params: { reference: 'SUP-1001' }, must: ['SUP-1001'] },
  /* product/[id].tsx branches on `id === "new"` — the create path renders
     emptyItem(), the edit path renders a loaded ServerProduct. One case would
     leave half the file unverified. */
  { name: 'product-new',           file: 'app/product/[id].tsx',          params: { id: 'new' },      must: ['Add a dish'] },
  { name: 'product-edit',          file: 'app/product/[id].tsx',          params: { id: 'prod_1' },   must: ['Chicken Dum Biryani'] },
];
