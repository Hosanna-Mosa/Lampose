/* ══════════════════════════════════════════════════════════════════════════
   "Tell me after every committed write to this collection."

   Cache invalidation hooked on the SCHEMA rather than at each call site,
   because the call sites are not a list anyone can keep: `properties`,
   `food_restaurants` and `food_products` are written from about forty places
   (owner apps, the console, the WhatsApp approval chain, account deletion,
   review accounts …), mostly as `doc.save()`. A hook sees all of them and
   every one written next year.

   Post-hooks run after Mongo acknowledged the write. There are no
   transactions in this codebase, so acknowledged is committed — invalidation
   never runs ahead of the data it is about.

   What it does NOT see, by Mongoose's own design: `bulkWrite`, `bulkSave` and
   anything sent through `Model.collection` / the raw driver. Nothing in `src/`
   writes these collections that way today; a few one-off scripts do, and they
   are covered by the TTLs.

   Must be called BEFORE `mongoose.model()` — middleware added to a schema
   after it is compiled is silently ignored.

   `onWrite({ op, docs, filter, paths })`:
     docs    the written documents, where Mongoose hands them over ([] if not)
     filter  the query's filter, for query writes
     paths   the field paths that changed, or null for "unknown / everything"
             (an insert, a delete, a replacement, a pipeline update)
   It is awaited — so the response after a write never races its own
   invalidation — and it can never fail the write: errors are swallowed.
   ══════════════════════════════════════════════════════════════════════════ */

const QUERY_WRITES = [
  'updateOne', 'updateMany', 'replaceOne',
  'findOneAndUpdate', 'findOneAndReplace', 'findOneAndDelete',
  'deleteOne', 'deleteMany',
];
const DELETES = new Set(['deleteOne', 'deleteMany', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne']);

/**
 * The field paths an update document touches, or null if it cannot say.
 *
 * `$setOnInsert` is skipped: Mongoose's `timestamps` adds
 * `$setOnInsert: { createdAt }` to EVERY update, and it only applies when the
 * update inserted — which the caller reports as "everything" instead.
 */
const pathsOfUpdate = (update) => {
  if (!update || Array.isArray(update)) return null;
  const paths = [];
  for (const [key, value] of Object.entries(update)) {
    if (key === '$setOnInsert') continue;
    if (key.startsWith('$')) {
      if (value && typeof value === 'object') paths.push(...Object.keys(value));
    } else {
      paths.push(key);
    }
  }
  return paths;
};

/** Did the query write anything at all? A no-op update needs no invalidation. */
const wroteSomething = (query, result) => {
  if (result === null || result === undefined) {
    /* findOneAnd* found nothing — unless it upserted, nothing changed. */
    return Boolean(query.getOptions && query.getOptions().upsert);
  }
  if (typeof result === 'object' && 'matchedCount' in result) {
    return result.matchedCount > 0 || result.upsertedCount > 0;
  }
  if (typeof result === 'object' && 'deletedCount' in result) return result.deletedCount > 0;
  return true;
};

const watchWrites = (schema, onWrite) => {
  const fire = async (change) => {
    try {
      await onWrite(change);
    } catch (error) {
      console.warn(`⚠️  [cache] invalidation after ${change.op} failed: ${error.message}`);
    }
  };

  /* Captured before the save, because after it `modifiedPaths()` is empty. */
  schema.pre('save', function captureChange() {
    this.$locals.cacheChange = this.isNew ? null : this.modifiedPaths();
  });
  schema.post('save', async function afterSave(doc) {
    const paths = doc.$locals ? doc.$locals.cacheChange : null;
    await fire({ op: 'save', docs: [doc], filter: null, paths: paths === undefined ? null : paths });
  });

  schema.post('insertMany', async function afterInsertMany(docs) {
    await fire({ op: 'insertMany', docs: Array.isArray(docs) ? docs : [], filter: null, paths: null });
  });

  /* `doc.deleteOne()` — the document form, which the query hooks below do not see. */
  schema.post('deleteOne', { document: true, query: false }, async function afterDocDelete() {
    await fire({ op: 'deleteOne', docs: [this], filter: null, paths: null });
  });

  schema.post(QUERY_WRITES, async function afterQueryWrite(result) {
    if (!wroteSomething(this, result)) return;

    const raw = result && typeof result === 'object' && result.value !== undefined && 'ok' in result
      ? result.value /* includeResultMetadata */
      : result;
    const docs = raw && typeof raw === 'object' && raw._id !== undefined ? [raw] : [];

    /* An insert changes everything about that document. `updateOne`/`Many`
       say whether they upserted; `findOneAndUpdate` does not, so an upserting
       one is assumed to have. */
    const inserted = (result && result.upsertedCount > 0)
      || (this.op === 'findOneAndUpdate' && Boolean(this.getOptions && this.getOptions().upsert));

    await fire({
      op: this.op,
      docs,
      filter: this.getFilter ? this.getFilter() : {},
      paths: DELETES.has(this.op) || inserted ? null : pathsOfUpdate(this.getUpdate ? this.getUpdate() : null),
    });
  });
};

/** `address.city` → `address`, `dineIn.tableTypes.0.seats` → `dineIn`. */
const rootOf = (path) => String(path).split('.')[0];

/** True when `paths` is unknown (null) or touches any of `fields`. */
const touches = (paths, fields) => paths === null || paths === undefined
  || paths.some((path) => fields.has(rootOf(path)));

module.exports = { watchWrites, touches, rootOf, pathsOfUpdate };
