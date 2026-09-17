import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

/**
 * Outline icon set — 1.75px stroke, rounded joins, 24x24 grid, per section 5
 * of the design system. Filled variants exist only where the design calls for
 * them (the star rating, the map pin).
 */

export type IconName =
  // tab bar
  | 'home'
  | 'bookings'
  | 'calendar'
  | 'wallet'
  | 'menu'
  // navigation
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-down'
  | 'arrow-up'
  // status & feedback
  | 'check'
  | 'check-circle'
  | 'alert-circle'
  | 'info'
  | 'clock'
  // actions
  | 'plus'
  | 'close'
  | 'edit'
  | 'trash'
  | 'send'
  | 'upload'
  | 'refresh'
  | 'search'
  | 'filter'
  // objects
  | 'bell'
  | 'message'
  | 'star'
  | 'star-outline'
  | 'map-pin'
  | 'image'
  | 'lock'
  | 'user'
  | 'users'
  | 'settings'
  | 'log-out'
  | 'bank'
  | 'rupee'
  | 'bed'
  | 'crosshair'
  | 'grip'
  | 'suitcase';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export function Icon({ name, size = 24, color, strokeWidth = 1.75, style }: Props) {
  const c = useColors();
  const stroke = color ?? c.textPrimary;
  const common = {
    stroke,
    strokeWidth,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {renderPaths(name, common, stroke)}
    </Svg>
  );
}

function renderPaths(
  name: IconName,
  p: {
    stroke: string;
    strokeWidth: number;
    fill: 'none';
    strokeLinecap: 'round';
    strokeLinejoin: 'round';
  },
  solid: string,
) {
  switch (name) {
    case 'home':
      return (
        <>
          <Path d="M4 10.5L12 4l8 6.5" {...p} />
          <Path d="M6 9.5V20h12V9.5" {...p} />
          <Path d="M10 20v-5h4v5" {...p} />
        </>
      );
    case 'bookings':
      return (
        <>
          <Rect x="4" y="4" width="16" height="17" rx="2" {...p} />
          <Path d="M9 3v3M15 3v3" {...p} />
          <Path d="M8.5 13.5l2 2 4.5-4.5" {...p} />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...p} />
          <Path d="M3 10h18M8 3v4M16 3v4" {...p} />
        </>
      );
    case 'wallet':
      return (
        <>
          <Path d="M3 8a2 2 0 012-2h12a2 2 0 012 2" {...p} />
          <Rect x="3" y="8" width="18" height="12" rx="2" {...p} />
          <Path d="M21 12.5h-4a1.5 1.5 0 000 3h4" {...p} />
        </>
      );
    case 'menu':
      return <Path d="M4 7h16M4 12h16M4 17h16" {...p} />;

    case 'chevron-left':
      return <Path d="M15 4l-8 8 8 8" {...p} />;
    case 'chevron-right':
      return <Path d="M9 4l8 8-8 8" {...p} />;
    case 'chevron-down':
      return <Path d="M5 9l7 7 7-7" {...p} />;
    case 'arrow-up':
      return <Path d="M12 20V5M6 11l6-6 6 6" {...p} />;

    case 'check':
      return <Path d="M4 12l6 6 10-14" {...p} />;
    case 'check-circle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M8 12.5l2.5 2.5L16 9" {...p} />
        </>
      );
    case 'alert-circle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 8v5M12 16v.01" {...p} />
        </>
      );
    case 'info':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 16v-5M12 8v.01" {...p} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...p} />
          <Path d="M12 7v5l3 3" {...p} />
        </>
      );

    case 'plus':
      return <Path d="M12 5v14M5 12h14" {...p} />;
    case 'close':
      return <Path d="M6 6l12 12M18 6L6 18" {...p} />;
    case 'edit':
      return (
        <>
          <Path d="M12 20h9" {...p} />
          <Path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" {...p} />
        </>
      );
    case 'trash':
      return (
        <>
          <Path d="M3 6h18" {...p} />
          <Path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...p} />
        </>
      );
    case 'send':
      return (
        <>
          <Path d="M22 2L11 13" {...p} />
          <Path d="M22 2l-7 20-4-9-9-4 20-7z" {...p} />
        </>
      );
    case 'upload':
      return (
        <>
          <Path d="M12 16V4M7 9l5-5 5 5" {...p} />
          <Path d="M5 20h14" {...p} />
        </>
      );
    case 'refresh':
      return (
        <>
          <Path d="M20 11a8 8 0 10-2.3 6.3" {...p} />
          <Path d="M20 5v6h-6" {...p} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" {...p} />
          <Path d="M16.5 16.5L21 21" {...p} />
        </>
      );
    case 'filter':
      return <Path d="M4 6h16M7 12h10M10 18h4" {...p} />;

    case 'bell':
      return (
        <>
          <Path d="M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6" {...p} />
          <Path d="M13.7 20a2 2 0 01-3.4 0" {...p} />
        </>
      );
    case 'message':
      return <Path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" {...p} />;
    case 'star':
      return (
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"
          fill={solid}
        />
      );
    case 'star-outline':
      return (
        <Path
          d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14l-5-4.87 6.91-1.01L12 2z"
          {...p}
        />
      );
    case 'map-pin':
      return (
        <>
          <Path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill={solid} />
          <Circle cx="12" cy="10" r="3" fill="#FFFFFF" />
        </>
      );
    case 'image':
      return (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="2" {...p} />
          <Circle cx="8.5" cy="9.5" r="1.5" {...p} />
          <Path d="M21 16l-5-5-6 6-2-2-5 5" {...p} />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x="4" y="10" width="16" height="10" rx="2" {...p} />
          <Path d="M8 10V7a4 4 0 018 0v3" {...p} />
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx="12" cy="8" r="4" {...p} />
          <Path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" {...p} />
        </>
      );
    case 'users':
      return (
        <>
          <Circle cx="9" cy="8" r="3.5" {...p} />
          <Path d="M2 21c0-3.6 3.1-5.5 7-5.5s7 1.9 7 5.5" {...p} />
          <Path d="M16 5.5a3.5 3.5 0 010 6.6M18 15.2c2.4.6 4 2.1 4 4.3" {...p} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3" {...p} />
          <Path
            d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1A1.6 1.6 0 007.6 19.5l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 003 15H3a2 2 0 110-4h.1A1.6 1.6 0 004.5 7.6l-.1-.1a2 2 0 112.8-2.8l.1.1A1.6 1.6 0 0010 4.5V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1.3z"
            {...p}
          />
        </>
      );
    case 'log-out':
      return (
        <>
          <Path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" {...p} />
          <Path d="M16 17l5-5-5-5M21 12H9" {...p} />
        </>
      );
    case 'bank':
      return (
        <>
          <Path d="M3 10l9-6 9 6" {...p} />
          <Rect x="3" y="10" width="18" height="9" rx="1" {...p} />
          <Path d="M7 14v3M12 14v3M17 14v3" {...p} />
        </>
      );
    case 'rupee':
      return <Path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" {...p} />;
    case 'bed':
      return (
        <>
          <Rect x="3" y="7" width="18" height="12" rx="2" {...p} />
          <Path d="M3 11h18M3 19v2M21 19v2" {...p} />
        </>
      );
    case 'crosshair':
      return (
        <>
          <Circle cx="12" cy="12" r="3" {...p} />
          <Path d="M12 2v4M12 18v4M2 12h4M18 12h4" {...p} />
        </>
      );
    case 'suitcase':
      return (
        <>
          <Rect x="4" y="10" width="16" height="10" rx="2" {...p} />
          <Path d="M8 10V7a4 4 0 018 0v3" {...p} />
        </>
      );
    case 'grip':
      return (
        <>
          <Circle cx="7" cy="6" r="1.6" fill={solid} />
          <Circle cx="17" cy="6" r="1.6" fill={solid} />
          <Circle cx="7" cy="12" r="1.6" fill={solid} />
          <Circle cx="17" cy="12" r="1.6" fill={solid} />
          <Circle cx="7" cy="18" r="1.6" fill={solid} />
          <Circle cx="17" cy="18" r="1.6" fill={solid} />
        </>
      );
  }
}
