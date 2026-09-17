/*
 * The app/support/ticket.tsx stylesheet, shared by the screen and the components
 * extracted from it.
 *
 * Moved rather than copied: `StyleSheet.create` still runs once at module
 * load and still yields ONE object, so every style prop keeps the identity it
 * had before the move and nothing re-renders differently.
 */
import { StyleSheet } from 'react-native';
import { fonts } from '@/constants/typography';
import { backRowBase } from '@/components/common/utils/styles';

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  backRow: { ...backRowBase, marginTop: 2 },
  subject: { fontFamily: fonts.extrabold, fontSize: 16, lineHeight: 22, marginBottom: 6 },
  badgeRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  closedNote: { marginTop: -8, marginBottom: 10 },
  divider: { marginBottom: 4 },

  messages: { paddingVertical: 14, gap: 12 },
  systemRow: { paddingVertical: 4, alignItems: 'center' },
  systemText: { textAlign: 'center' },
  bubbleGroup: { gap: 4 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleOwner: { borderBottomRightRadius: 4 },
  bubbleSupport: { borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  bubbleMeta: { fontSize: 11 },

  composer: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  inputPill: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1.5,
    borderRadius: 21,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  input: { fontFamily: fonts.regular, fontSize: 14, padding: 0, maxHeight: 90 },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});

