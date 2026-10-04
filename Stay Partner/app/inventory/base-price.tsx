/*
 * Route: /inventory/base-price.tsx
 *
 * The screen lives in components/inventory-base-price/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
import { BasePriceSheetScreen } from '@/components/inventory-base-price/BasePriceSheetScreen';
import { devOnly } from '@/components/dev-only/devOnly';

/* Developer builds only — see `devOnly`. */
export default devOnly(BasePriceSheetScreen);
