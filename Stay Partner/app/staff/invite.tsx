/*
 * Route: /staff/invite.tsx
 *
 * The screen lives in components/staff-invite/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
import { devOnly } from '@/components/dev-only/devOnly';
import { StaffComingSoonScreen } from '@/components/staff-coming-soon/StaffComingSoonScreen';

/* Not linked from the app until staff accounts exist — see MenuTabScreen. */
export default devOnly(StaffComingSoonScreen);
