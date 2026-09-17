/*
 * Helpers and types belonging to app/settings/rooms.tsx, used by the components
 * extracted from it. §4: "shared helpers to its utils".
 */


export type ShareType = {
  id?: string;
  shareTypeId?: string;
  name?: string;
  monthlyPrice?: number;
  totalBeds?: number;
  availableBeds?: number;
  isAvailable?: boolean;
};
