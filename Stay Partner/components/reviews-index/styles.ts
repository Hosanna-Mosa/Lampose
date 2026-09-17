/*
 * The app/reviews/index.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { radius } from '@/constants/layout';
import { fonts, type } from '@/constants/typography';
import { backRowBase, boldLabel } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  stack: { gap: 16 },
  backRow: { ...backRowBase, marginBottom: -8 },

  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 16,
  },
  summaryLeft: { alignItems: 'center', flexShrink: 0 },
  average: { ...type.metric },
  count: { fontSize: 11, marginTop: 3 },
  distribution: { flex: 1, gap: 5 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  distLabel: { width: 8, fontSize: 10 },
  distTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  distFill: { height: '100%', borderRadius: 3 },

  card: { borderRadius: 14, padding: 16, gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  identity: { flex: 1 },
  name: { ...boldLabel },
  meta: { fontSize: 11, marginTop: 1 },
  stars: { marginTop: -2 },
  reviewText: { lineHeight: 20 },

  composer: { gap: 8, marginTop: 2 },
  composerLabel: { fontSize: 12 },
  composerField: { marginBottom: 0 },
  composerActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },

  replyBox: { flexDirection: 'row', gap: 8, borderRadius: 10, padding: 12 },
  replyBody: { flex: 1 },
  replyAuthor: { fontFamily: fonts.bold, fontSize: 12, marginBottom: 2 },
  replyText: { lineHeight: 19, fontSize: 13 },
  empty: { minHeight: 260 },
});

