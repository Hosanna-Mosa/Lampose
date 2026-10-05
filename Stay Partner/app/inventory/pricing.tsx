/*
 * Route: /inventory/pricing.tsx
 *
 * The screen lives in components/inventory-pricing/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
import { PricingScreen } from '@/components/inventory-pricing/PricingScreen';
import { devOnly } from '@/components/dev-only/devOnly';

/* Developer builds only — see `devOnly`. */
export default devOnly(PricingScreen);
