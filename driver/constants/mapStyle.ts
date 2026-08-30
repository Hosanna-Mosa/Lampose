/**
 * Google Maps style tuned to the Dock palette (see `theme/index.ts`) — warm
 * bone neutrals with desaturated roads so the route line and markers stay
 * the focal point. Previously a cool indigo-tinted style left over from the
 * app's old palette; re-picked 30 Aug 2026 off the same warm ramp as every
 * other surface in the app.
 */
export const mapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f7f5f1" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8f897c" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e2ded6" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry.fill",
    stylers: [{ color: "#edeae4" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#e3f0eb" }],
  },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e2ded6" }] },
  {
    featureType: "road.arterial",
    elementType: "geometry.fill",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.fill",
    stylers: [{ color: "#f1eee8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#d6cfc0" }],
  },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#dceae6" }] },
];

export default mapStyle;
