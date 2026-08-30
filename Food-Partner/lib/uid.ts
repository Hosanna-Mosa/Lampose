/* React Native has no `crypto.randomUUID`. These ids never leave the device —
   they key React lists and match a row to its upload — so a timestamp plus a
   random suffix stands in perfectly well. */
export const uid = (): string =>
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export default uid;
