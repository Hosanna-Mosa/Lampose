/* crypto.randomUUID only exists in a secure context, and the dev server is
   reached over plain http from phones on the same network. These ids never
   leave the browser — they key React lists and match a row to its upload —
   so a random suffix stands in perfectly well when the real thing is absent. */
export const uid = () => (
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
);

export default uid;
