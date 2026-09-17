/*
 * Route: /support/ticket.tsx
 *
 * The screen lives in components/support-ticket/. This file stays at its route path and keeps
 * its default export, because with file-based routing the path IS the route --
 * moving or renaming it deletes the screen behind a green build (M5).
 */
export { TicketThreadScreen as default } from '@/components/support-ticket/TicketThreadScreen';
