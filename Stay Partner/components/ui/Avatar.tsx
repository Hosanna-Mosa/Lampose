import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';

export type AvatarTone = 'accent' | 'success' | 'warning' | 'error' | 'info' | 'neutral';

/**
 * Circular initials mark — reviewers, reply authorship, anywhere a person
 * needs an identity and no photo exists. `solid` fills with the tone's full
 * color and white text, for the "this is you" case; the default is the soft
 * tint the rest of the app already uses for that tone.
 */
export function Avatar({
  label,
  size = 34,
  tone = 'accent',
  solid = false,
}: {
  label: string;
  size?: number;
  tone?: AvatarTone;
  solid?: boolean;
}) {
  const c = useColors();

  const tones: Record<AvatarTone, { tint: string; ink: string; solid: string }> = {
    accent: { tint: c.accentTint, ink: c.accentInk, solid: c.accent },
    success: { tint: c.successTint, ink: c.successInk, solid: c.success },
    warning: { tint: c.warningTint, ink: c.warningInk, solid: c.warningFill },
    error: { tint: c.errorTint, ink: c.errorInk, solid: c.error },
    info: { tint: c.infoTint, ink: c.info, solid: c.info },
    neutral: { tint: c.surfaceSunken, ink: c.textSecondary, solid: c.textTertiary },
  };
  const skin = tones[tone];

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: solid ? skin.solid : skin.tint,
        },
      ]}
    >
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: size * 0.34,
          lineHeight: size * 0.42,
          color: solid ? c.white : skin.ink,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});
