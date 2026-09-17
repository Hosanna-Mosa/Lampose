/*
 * The app/settings/property-edit.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  stack: { gap: 4 },
  intro: { lineHeight: 18, marginBottom: 8 },
  section: { marginBottom: 22 },
  sectionTitle: { marginBottom: 10 },
  field: { marginBottom: 16 },
  hint: { marginTop: -10, marginBottom: 4, lineHeight: 16 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  photoThumbWrap: {
    width: 84,
    height: 84,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  photoThumb: { width: '100%', height: '100%' },
  coverBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoTile: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoTileCompact: { minHeight: 56 },
});

