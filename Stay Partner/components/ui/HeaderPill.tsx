import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from './Text';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

/**
 * Selector pill for the thing a screen is scoped to — the property on the
 * dashboard, the room type on calendar and pricing.
 *
 * The chevron appears only when there is something to switch to; a single
 * property collapses this to a plain label, per the dashboard spec.
 */
export function HeaderPill({
  label,
  onPress,
  /** Leading rounded swatch. Stands in for the property thumbnail. */
  swatch = false,
  /** Sunken variant used on Calendar and Pricing, which have no border. */
  variant = 'outlined',
}: {
  label: string;
  onPress?: () => void;
  swatch?: boolean;
  variant?: 'outlined' | 'sunken';
}) {
  const c = useColors();
  const switchable = Boolean(onPress);

  const content = (
    <>
      {swatch ? <View style={[styles.swatch, { backgroundColor: c.accentTint }]} /> : null}
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      {switchable ? (
        <Svg width={9} height={6} viewBox="0 0 8 6">
          <Path
            d="M1 1l3 3 3-3"
            stroke={c.textSecondary}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      ) : null}
    </>
  );

  const skin = {
    backgroundColor: variant === 'sunken' ? c.surfaceSunken : c.surface,
    borderColor: variant === 'sunken' ? 'transparent' : c.borderCard,
    borderWidth: variant === 'sunken' ? 0 : 1,
    paddingLeft: swatch ? 8 : 12,
  };

  if (!switchable) {
    return <View style={[styles.pill, skin]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Change selection`}
      style={({ pressed }) => [styles.pill, skin, { opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingRight: 12,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
    /*
     * The pill yields width; whatever sits beside it does not.
     *
     * `label` below already carries `flexShrink: 1`, but that only lets the
     * TEXT give way INSIDE the pill — it does nothing about the pill's own
     * width in the header row. React Native defaults `flexShrink` to 0 (unlike
     * the web, where it is 1), so without this the pill sized itself to a
     * property name of whatever length and pushed the availability switch and
     * the notification bell straight off the right edge of the screen. On a
     * standard-width handset "Apex Luxury Studio & Co-Living Stay" left the
     * bell entirely invisible and the switch as a sliver.
     *
     * `minWidth: 0` is what actually lets a flex child narrow below its own
     * content in React Native — `flexShrink` alone is ignored without it.
     *
     * The pill is the right thing to sacrifice: its label is already
     * `numberOfLines={1}`, so it degrades to an ellipsis, whereas a 36pt round
     * button has nothing to give and simply disappears.
     */
    flexShrink: 1,
    minWidth: 0,
  },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    /* Explicit, because the pill above is now shrinkable and this must not
       shrink with it. A squashed swatch reads as a rendering glitch, and it is
       the property's thumbnail slot — the one part of the pill that is not
       text and cannot be truncated gracefully. */
    flexShrink: 0,
  },
  label: {
    fontFamily: fonts.bold,
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
  },
});
