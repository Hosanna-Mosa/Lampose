/*
 * Route: /(auth)/payout-setup.tsx
 *
 * The screen lives in components/auth-payout-setup/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { PayoutSetupScreen as default } from '@/components/auth-payout-setup/PayoutSetupScreen';
