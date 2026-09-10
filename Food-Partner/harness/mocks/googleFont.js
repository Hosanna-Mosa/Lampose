/* Stands in for every @expo-google-fonts/* subpath. app/_layout.tsx imports 12
   of them and hands the lot to useFonts(), which is mocked to [true, null], so
   the values are never read — only their presence matters. */
module.exports = new Proxy({}, { get: () => 1 });
