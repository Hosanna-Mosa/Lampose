/**
 * Room types and a shared date utility. Everything else that used to live
 * here — blocked ranges, day state, calendar-selection night counts — was
 * removed along with the Calendar tab and its block/unblock/bulk-edit
 * screens; nothing else in the app still reads any of it. See the build
 * record's scope-changes panel.
 */

export const ROOM_TYPES = ['Deluxe Double', 'Family Suite'] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export function midnight(d: Date): number {
  return new Date(d).setHours(0, 0, 0, 0);
}
