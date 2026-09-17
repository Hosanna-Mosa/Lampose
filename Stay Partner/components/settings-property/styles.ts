/*
 * The app/settings/property.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';

export const styles = StyleSheet.create({
  stack: { gap: 12 },
  card: { padding: 14, gap: 14 },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  availRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  availText: { flex: 1, gap: 2 },
  availHint: { lineHeight: 15 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 16, lineHeight: 21 },
  block: { gap: 6 },
  body: { lineHeight: 20 },
  amenities: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  amenity: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    /* Never wider than the card. A long amenity label wraps inside its own
       chip rather than pushing the row off the edge. */
    maxWidth: '100%',
  },
  note: { lineHeight: 18, marginTop: 4 },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
});

