/* Tree -> canonical JSON.

   This file is load-bearing, not a formatting nicety. Two things depend on it:

   1. STYLE (playbook M3). `style={[styles.body, {paddingTop: x}]}` and
      `style={{...merged}}` are the same pixels and must be the same JSON.
      Without flatten-and-sort, EVERY hoist of an inline object into
      StyleSheet.create diffs — you learn to ignore style diffs, and then a real
      one goes past you. Flattening computes the RESULT, so an ordering change
      that genuinely changes the winning value still shows up.

   2. REACT ELEMENTS IN PROPS. Seven screens pass
      `refreshControl={<RefreshControl … />}`. A React element carries circular
      internals (_owner / fiber), so a raw JSON.stringify throws
      "Converting circular structure to JSON". They are serialised structurally
      instead, so a changed RefreshControl still diffs. */

const { StyleSheet } = require('react-native');

const isElement = (v) =>
  v != null && typeof v === 'object' && v.$$typeof === Symbol.for('react.element');

const typeName = (t) =>
  typeof t === 'string' ? t
    : (t && (t.displayName || t.name)) || 'Component';

function sortKeys(o) {
  if (o == null || typeof o !== 'object' || Array.isArray(o)) return o;
  const out = {};
  for (const k of Object.keys(o).sort()) out[k] = o[k];
  return out;
}

function value(v, seen) {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = typeof v;
  if (t === 'function') return '[fn]';
  if (t === 'symbol') return String(v);
  if (t !== 'object') return v;

  if (seen.has(v)) return '[circular]';
  seen.add(v);
  try {
    if (isElement(v)) {
      return sortKeys({
        $element: typeName(v.type),
        key: v.key == null ? undefined : String(v.key),
        props: props(v.props, seen),
      });
    }
    if (Array.isArray(v)) return v.map((x) => value(x, seen));
    // A ref object, an Animated.Value, a Map — anything exotic. Name it rather
    // than walk it: identity is meaningless, presence is not.
    if (v.constructor && v.constructor !== Object) {
      const n = v.constructor.name;
      if (n && n !== 'Object') return `[${n}]`;
    }
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const s = value(v[k], seen);
      if (s !== undefined) out[k] = s;
    }
    return out;
  } finally {
    seen.delete(v);
  }
}

function props(p, seen) {
  if (!p) return {};
  const out = {};
  for (const k of Object.keys(p).sort()) {
    // `children` is already carried in the children array; keeping it in props
    // would double-count and, for element children, re-introduce cycles.
    if (k === 'children') continue;
    let v = p[k];
    if (k === 'style' || k === 'contentContainerStyle' || k === 'columnWrapperStyle') {
      const flat = StyleSheet.flatten(v);
      v = flat == null ? undefined : sortKeys(flat);
      if (v !== undefined) { out[k] = value(v, seen); }
      continue;
    }
    const s = value(v, seen);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

function node(n, seen) {
  if (n == null) return null;
  if (typeof n === 'string' || typeof n === 'number') return n;
  if (Array.isArray(n)) return n.map((c) => node(c, seen));
  return {
    type: n.type,
    props: props(n.props, seen),
    children: (n.children || []).map((c) => node(c, seen)),
  };
}

function serialize(tree) {
  return node(tree, new WeakSet());
}

/* Digest for the M6/F1 guards: a capture far smaller than its baseline is a
   screen that failed to render, and "identical to an empty screen" is not a pass. */
function digest(tree) {
  const types = {};
  let nodes = 0;
  const texts = [];
  (function walk(n) {
    if (n == null) return;
    if (typeof n === 'string') { if (n.trim()) texts.push(n); return; }
    if (typeof n === 'number') { texts.push(String(n)); return; }
    if (Array.isArray(n)) return n.forEach(walk);
    nodes++;
    types[n.type] = (types[n.type] || 0) + 1;
    (n.children || []).forEach(walk);
  })(tree);
  return { nodes, texts: texts.length, types: sortKeys(types), text: texts.join(' ') };
}

module.exports = { serialize, digest, stringify: (t) => JSON.stringify(serialize(t), null, 2) };
