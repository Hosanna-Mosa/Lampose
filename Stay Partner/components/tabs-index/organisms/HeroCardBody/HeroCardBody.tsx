import { Box } from '@/components/common';
import { Text, Icon } from '@/components/common';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/tabs-index/styles';

export function HeroCardBody({
  c,
  greetingText,
  owner,
  tone,
}: {
  c: ReturnType<typeof useColors>;
  greetingText: string;
  owner: string | null;
  tone: 'on' | 'off';
}) {
  const on = tone === 'on';
  return (
    <>
      <Box style={styles.heroGlyph} pointerEvents="none">
        <Icon name="bed" size={104} color={on ? 'rgba(255,255,255,0.1)' : c.borderSubtle} strokeWidth={1.1} />
      </Box>

      <Box>
        <Text style={[styles.heroGreeting, on ? null : { color: c.textPrimary }]}>
          {greetingText}
          {owner ? `, ${owner}` : ''}
        </Text>
        <Text style={[styles.heroSubtitle, on ? null : { color: c.textSecondary, opacity: 1 }]}>
          Here&apos;s what&apos;s happening today
        </Text>

        <Box
          style={[
            styles.heroChip,
            on
              ? { backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'rgba(255,255,255,0.3)' }
              : { backgroundColor: c.surfaceSunken, borderColor: c.borderCard },
          ]}
        >
          <Box style={[styles.heroDot, { backgroundColor: on ? c.brandYellow : c.textTertiary }]} />
          <Text style={[styles.heroChipText, on ? null : { color: c.textSecondary }]}>
            {on ? 'Rooms available — accepting bookings' : 'Not accepting new bookings'}
          </Text>
        </Box>
      </Box>
    </>
  );
}

/**
 * The two side-by-side summary cards the dashboard opens with. Each is a
 * real shortcut, not decoration — tapping one lands on the tab that has the
 * full picture, the same "headline figure, then go deeper" shape the old
 * stat-tile row and earnings card had, just paired up instead of stacked.
 * Tinted to match what they open onto — green for bookings, the same green
 * as the hero above; a warmer success tone for earnings — rather than two
 * identical white tiles told apart only by their icon.
 */
