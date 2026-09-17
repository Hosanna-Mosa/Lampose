import { Pressable, View } from 'react-native';
import { Text } from '@/components/common/atoms/Text';
import { radius } from '@/constants/layout';
import { fonts } from '@/constants/typography';
import { useColors } from '@/hooks/useColors';
import { styles } from '@/components/common/utils/Chip.internal';

export function Chip({
  label,
  selected = false,
  onPress,
  tone = 'accent',
  disabled = false,
  size = 'md',
  subtle = false,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  /** `danger` is used where selecting the chip drives a destructive action. */
  tone?: 'accent' | 'danger' | 'neutral';
  disabled?: boolean;
  /** `sm` is the compact filter row on list screens. */
  size?: 'md' | 'sm';
  /** Lighter unselected treatment for a filter row subordinate to another. */
  subtle?: boolean;
}) {
  const c = useColors();

  const fill = tone === 'danger' ? c.error : tone === 'neutral' ? c.textPrimary : c.accent;
  const dims =
    size === 'md'
      ? { padV: 8, padH: 14, font: 12.5, radius: 18 }
      : { padV: 6, padH: 13, font: 12.5, radius: 16 };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.target, { opacity: pressed ? 0.7 : disabled ? 0.5 : 1 }]}
    >
      <View
        style={[
          styles.pill,
          {
            paddingVertical: dims.padV,
            paddingHorizontal: dims.padH,
            borderRadius: dims.radius,
            backgroundColor: selected ? fill : 'transparent',
            borderColor: selected ? fill : subtle ? c.borderCard : c.border,
            borderWidth: subtle && !selected ? 1 : 1.5,
          },
        ]}
      >
        <Text
          style={{
            fontFamily: fonts.semibold,
            fontSize: dims.font,
            lineHeight: dims.font + 5,
            color: selected ? c.white : subtle ? c.textSecondary : c.textPrimary,
          }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/** Wrapping row of chips. Column gap only — the 44px targets supply the row rhythm. */
