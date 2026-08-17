/**
 * Google Maps style tuned to the app's light indigo palette — muted greys with
 * desaturated roads so the route line and markers stay the focal point.
 */
export const mapStyle = [
  { elementType: "geometry", stylers: [{ color: "#f7f8fc" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a90a6" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }] },
  {
    featureType: "administrative",
    elementType: "geometry.stroke",
    stylers: [{ color: "#e6e9f2" }],
  },
  {
    featureType: "landscape.man_made",
    elementType: "geometry.fill",
    stylers: [{ color: "#eef0f6" }],
  },
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi.park",
    elementType: "geometry.fill",
    stylers: [{ color: "#e3f0e7" }],
  },
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e6e9f2" }] },
  {
    featureType: "road.arterial",
    elementType: "geometry.fill",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.fill",
    stylers: [{ color: "#f0f1f8" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#d6d9fb" }],
  },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry.fill", stylers: [{ color: "#dce4f5" }] },
];

export default mapStyle;
