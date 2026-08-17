import React from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { colors, ms } from "@/theme";

/**
 * The design's own icon set, transcribed path-for-path from the artifact so
 * the stroke weights and shapes match exactly. All are 24×24 line icons at
 * stroke 1.5 unless noted.
 */
export const ICON_PATHS = {
  home: "M3 10.2 12 3l9 7.2V20a1 1 0 0 1-1 1h-5.5v-6.5h-5V21H4a1 1 0 0 1-1-1z",
  orders: "M8 4h11M8 12h11M8 20h11M4 4h.01M4 12h.01M4 20h.01",
  earnings: "M3 8.5A2 2 0 0 1 5 6.5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M16 15h2",
  profile: "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4.5 21a7.5 7.5 0 0 1 15 0",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  phone: "M5 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L15 13l5 2v3a2 2 0 0 1-2.3 2A17 17 0 0 1 3 5.3 2 2 0 0 1 5 3",
  plus: "M12 2v20M2 12h20",
  navigate: "M12 3l7 18-7-5-7 5z",
  check: "M4 12.5l5 5L20 6.5",
  arrowRight: "M4 12h15M13 6l6 6-6 6",
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = ms(19),
  color = colors.ink,
  strokeWidth = 1.5,
  fill = "none",
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
      <Path
        d={ICON_PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={fill}
      />
    </Svg>
  );
}

/** Bell with an optional unread dot, as used in the home header. */
export function BellIcon({
  size = ms(19),
  color = colors.ink,
}: {
  size?: number;
  color?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.3 21a2 2 0 0 0 3.4 0"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Status-bar signal + battery glyphs from the phone chrome. */
export function SignalIcon({ color = colors.text }: { color?: string }) {
  return (
    <Svg width={15} height={12} viewBox="0 0 15 12" fill="none">
      <Path d="M1 8.5 4 5.5M4 5.5 7 8.5M7 8.5 13 2.5" stroke={color} strokeWidth={1.6} />
    </Svg>
  );
}

export function BatteryIcon({ color = colors.text }: { color?: string }) {
  return (
    <Svg width={16} height={11} viewBox="0 0 16 11" fill="none">
      <Rect x={0.6} y={0.6} width={12} height={9.8} rx={2} stroke={color} strokeWidth={1.2} />
      <Rect x={2.1} y={2.1} width={7.6} height={6.8} rx={1} fill={color} />
      <Path d="M14.4 4v3" stroke={color} strokeWidth={1.2} />
    </Svg>
  );
}

/**
 * The stylised route sketch drawn over the map grid — a dashed ink line from
 * the rider's position to the target pin.
 */
export function RouteSketch({
  width,
  height,
  color = colors.ink,
}: {
  width: number;
  height: number;
  color?: string;
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 360 252" fill="none">
      <Path
        d="M64 196 C110 176 96 120 148 106 C196 93 214 66 300 54"
        stroke={color}
        strokeWidth={3}
        strokeDasharray="9 7"
        opacity={0.8}
        fill="none"
      />
      <Circle cx={64} cy={196} r={7} fill={color} />
      <Circle cx={64} cy={196} r={12} stroke={color} strokeWidth={1.5} opacity={0.35} />
    </Svg>
  );
}

export default Icon;
