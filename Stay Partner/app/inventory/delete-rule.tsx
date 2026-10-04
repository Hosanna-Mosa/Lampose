/*
 * Route: /inventory/delete-rule.tsx
 *
 * The screen lives in components/inventory-delete-rule/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
import { DeleteRuleSheetScreen } from '@/components/inventory-delete-rule/DeleteRuleSheetScreen';
import { devOnly } from '@/components/dev-only/devOnly';

/* Developer builds only — see `devOnly`. */
export default devOnly(DeleteRuleSheetScreen);
