/*
 * The app/settings/rooms.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';

export const styles = StyleSheet.create({
  stack: { gap: 10 },
  sectionGap: { marginTop: 10 },
  card: { padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  name: { flex: 1, fontFamily: fonts.bold, fontSize: 15, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 },
  beds: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 19 },
  amenityCard: { padding: 14 },
  body: { lineHeight: 20 },
  note: { lineHeight: 18, marginTop: 6 },
});

