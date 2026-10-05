// App Store + Google Play screenshots and preview for the Lampose User App.
// Rendered by goldie (https://www.npmjs.com/package/goldie). Every visible
// choice lives here; re-run `goldie frame` after editing copy or theme.
//
// Captures run against a LOCAL backend seeded with demo listings (see the
// screenshot notes in the PR), not against the live server.

const APP_ROOT = "/Users/hosanna/LAMPOSE/1/Lampose/User App";

// Release builds made from a copy of the app at a path with no space in it —
// the space in "User App" breaks the expo-constants build script locally.
const BUILD_ROOT = process.env.LAMPOSE_BUILD_ROOT ?? "";

const config = {
  appRoot: APP_ROOT,
  appPath: process.env.LAMPOSE_IOS_APP ?? "",
  bundleId: "com.lampose.users.com",

  android: {
    appPath: `${BUILD_ROOT}/android/app/build/outputs/apk/release/app-release.apk`,
    applicationId: "com.lampose.users.com",
  },

  devices: ["iphone-6.9", "pixel-10-pro"],
  locales: ["en-US"],
  appearance: "light",

  frame: { variant: "17-pro-silver" },

  theme: {
    // Lampose green: the brand's #0E6E5C fading into its light tint.
    background: "linear-gradient(165deg, #0E6E5C 0%, #13806B 42%, #E3F0EB 100%)",
    headlineColor: "#FFFFFF",
    subheadColor: "#E3F0EB",
    fontFamily: '"DM Sans", -apple-system, system-ui, sans-serif',
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
    template: "editorial",
    layout: "classic",
  },

  store: {
    name: "Lampose",
    subtitle: { "en-US": "PGs, hostels & rooms near you" },
    developer: "Lampose Private Limited",
    category: "Lifestyle",
    rating: 4.8,
    ratingCount: "1.2K Ratings",
    ageRating: "4+",
    price: "Free",
    description: {
      "en-US":
        "Find a PG, hostel, bachelor flat, co-living house or hotel near your college or office — with the rent, deposit and every sharing option shown before you visit.\n\nFilter by budget, gender, sharing and meals, see places within a few kilometres of you, and send the owner a request in one tap. The owner confirms on WhatsApp, usually within minutes.\n\nZero brokerage. Your bookings, saved places and support conversations stay in one place.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "home",
      flow: "store-01-home",
      headline: { "en-US": "Find your next stay" },
      subhead: { "en-US": "PGs, hostels, flats and hotels near your college." },
    },
    {
      kind: "screenshot",
      id: "listing",
      flow: "store-02-listing",
      headline: { "en-US": "Every price, upfront" },
      subhead: { "en-US": "Rent, deposit and each sharing option before you visit." },
    },
    {
      kind: "screenshot",
      id: "filters",
      flow: "store-03-filters",
      headline: { "en-US": "Filter what matters" },
      subhead: { "en-US": "Budget, gender, sharing and meals in seconds." },
    },
    {
      kind: "screenshot",
      id: "areas",
      flow: "store-04-areas",
      headline: { "en-US": "Search by area" },
      subhead: { "en-US": "Or see every place within a few km of you." },
    },
    {
      kind: "screenshot",
      id: "hotel",
      flow: "store-05-hotel",
      headline: { "en-US": "Short stays too" },
      subhead: { "en-US": "Hotels by the night, the month or the hour." },
    },
    {
      kind: "preview",
      id: "preview",
      segments: [
        { id: "browse", flow: "store-preview-01-browse" },
        { id: "category", flow: "store-preview-02-category" },
        { id: "listing", flow: "store-preview-03-listing", holdSeconds: 1 },
      ],
    },
  ],
};

export default config;
