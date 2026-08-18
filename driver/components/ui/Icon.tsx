import React from "react";
import Svg, { Path } from "react-native-svg";
import { colors, icon as iconToken } from "@/theme";

/**
 * The icon set, drawn to match the customer app's Food module.
 *
 * That app uses Lucide, so these are Lucide's own 24×24 geometry transcribed
 * as raw paths — the rider app renders SVG directly rather than pulling in the
 * library, and a hand-drawn approximation beside a real Lucide glyph reads as
 * a mismatch immediately.
 *
 * Stroke is 1.75 (`icon.strokeWidth`), not the old 1.5: the food surfaces sit
 * on white cards where a 1.5 line goes thin, and the two apps have to agree.
 *
 * A glyph is one path or several. Several is the common case — Lucide draws
 * circles and rounded rects as separate subpaths so the caps stay round.
 */
export const ICON_PATHS = {
  // ── Navigation ────────────────────────────────────────────────────────────
  home: [
    "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
    "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  ],
  orders: [
    "m7.5 4.27 9 5.15",
    "M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z",
    "m3.3 7 8.7 5 8.7-5",
    "M12 22V12",
  ],
  earnings: [
    "M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",
    "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",
  ],
  profile: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0"],

  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  chevronDown: "m6 9 6 6 6-6",
  chevronUp: "m18 15-6-6-6 6",
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  arrowLeft: ["M19 12H5", "m12 19-7-7 7-7"],
  externalLink: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],

  // ── Actions ───────────────────────────────────────────────────────────────
  plus: ["M5 12h14", "M12 5v14"],
  minus: "M5 12h14",
  check: "M20 6 9 17l-5-5",
  close: ["M18 6 6 18", "m6 6 12 12"],
  search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16", "m21 21-4.3-4.3"],
  filters: ["M21 4H14", "M10 4H3", "M21 12H12", "M8 12H3", "M21 20H16", "M12 20H3", "M14 2v4", "M8 10v4", "M16 18v4"],
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  power: ["M12 2v10", "M18.4 6.6a9 9 0 1 1-12.77.04"],
  logout: ["M16 17l5-5-5-5", "M21 12H9", "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"],
  camera: [
    "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z",
    "M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m17 8-5-5-5 5", "M12 3v12"],

  // ── The job ───────────────────────────────────────────────────────────────
  phone: [
    "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  ],
  message: "M7.9 20A9 9 0 1 0 4 16.1L2 22z",
  navigate: "m3 11 19-9-9 19-2-8z",
  mapPin: [
    "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
    "M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  route: ["M9 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0", "M19 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0", "M7 17V9a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2"],
  vehicle: [
    "M18.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
    "M5.5 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7",
    "M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2",
    "M12 17.5V14l-3-3 4-3 2 3h2",
  ],
  clock: ["M12 6v6l4 2", "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0"],
  calendar: [
    "M8 2v4",
    "M16 2v4",
    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
    "M3 10h18",
  ],

  // ── Money & documents ─────────────────────────────────────────────────────
  rupee: ["M6 3h12", "M6 8h12", "m6 13 8.5 8", "M6 13h3", "M9 13c6.667 0 6.667-10 0-10"],
  card: ["M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z", "M2 10h20"],
  bank: ["M3 21h18", "M5 21V10l7-5 7 5v11", "M9 21v-6h6v6"],
  documents: [
    "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z",
    "M14 2v4a2 2 0 0 0 2 2h4",
    "M16 13H8",
    "M16 17H8",
    "M10 9H8",
  ],
  trendingUp: ["M16 7h6v6", "m22 7-8.5 8.5-5-5L2 17"],

  // ── Status & meta ─────────────────────────────────────────────────────────
  bell: [
    "M10.268 21a2 2 0 0 0 3.464 0",
    "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  ],
  alert: ["m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3", "M12 9v4", "M12 17h.01"],
  info: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 16v-4", "M12 8h.01"],
  shield: [
    "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
    "m9 12 2 2 4-4",
  ],
  star: [
    "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  ],
  bookmark: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z",
  settings: [
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
    "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  ],
  support: [
    "M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3",
  ],
  lock: ["M5 11a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z", "M7 9V6a5 5 0 0 1 10 0v3"],
} as const;

export type IconName = keyof typeof ICON_PATHS;

export function Icon({
  name,
  size = 20,
  color = colors.textPrimary,
  strokeWidth = iconToken.strokeWidth,
  fill = "none",
}: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const paths = ICON_PATHS[name];
  const list: readonly string[] = typeof paths === "string" ? [paths] : paths;

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {list.map((d) => (
        <Path
          key={d}
          d={d}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={fill}
        />
      ))}
    </Svg>
  );
}

/**
 * The stylised route sketch drawn over the map panel — a dashed line from the
 * rider's position to the target pin.
 *
 * Brand green rather than the old ink: on the food surfaces green is the
 * colour that means "this is the live one", and a route in progress is
 * exactly that.
 */
export function RouteSketch({
  width,
  height,
  color = colors.brand,
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
        strokeLinecap="round"
        opacity={0.9}
        fill="none"
      />
      <Path
        d="M71 196a7 7 0 1 1-14 0 7 7 0 0 1 14 0"
        fill={color}
        stroke="none"
      />
      <Path
        d="M76 196a12 12 0 1 1-24 0 12 12 0 0 1 24 0"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.35}
        fill="none"
      />
    </Svg>
  );
}

export default Icon;
