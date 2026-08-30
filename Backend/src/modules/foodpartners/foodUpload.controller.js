/* ══════════════════════════════════════════════════════════════════════════
   Photographs and documents on their way to Cloudinary, for one food partner.

   Every image this module ever stores arrives through here: the logo and the
   cover banner from the onboarding form, a dish photograph and its gallery
   from the menu screen, and the scan of an FSSAI licence, a GST certificate,
   a PAN card or a cancelled cheque that the verification team later reads.
   Nothing in `food_restaurants` or `food_products` holds an image; both hold a
   `{ url, publicId }` pair that this file produced.

   `partners/propertyEdit.controller.js` (`uploadPropertyImages`) and
   `partners/addCustomer.controller.js` (`uploadKycImages`) already solved the
   same problem for the Stay Partner app, and this is deliberately the same
   solution rather than a new one. Three of their behaviours are load-bearing
   and are kept exactly:

     · TWO REQUEST SHAPES, one code path. A native picker sends
       `multipart/form-data`, which multer parses into `req.files` as buffers;
       a JSON client sends base64 data URIs in the body instead. Both are
       turned into the same data-URI string before a single upload loop, so
       there is one place where an upload can be wrong rather than two that
       drift.

     · CLOUDINARY IS CONFIGURED PER REQUEST, not once at require time. The SDK
       keeps its credentials in module-level global state, and `node --watch`
       plus a `.env` that gets filled in mid-session means "configured at boot"
       and "configured now" are not the same statement. Reading the three
       variables on each call costs nothing and cannot be stale.

     · A MISSING CREDENTIAL IS A NAMED 503, never a throw. This process does
       not exit for a missing dependency and carries no fallback account in
       source, so an unset `CLOUDINARY_*` degrades this one route to
       `STORAGE_NOT_CONFIGURED` and leaves discovery, login and the menu
       working. The refusal is printed as well, because "why is the app getting
       503 on uploads" is a question the console should answer on its own.

   ## The `kind` is required, and is never guessed

   Every upload names what it is: `logo`, `cover`, `product`, `gallery`,
   `fssai`, `gst`, `pan` or `cheque`. It is validated against that list, and a
   value outside it is refused.

   The reason is that this endpoint does not attach anything. It returns URLs,
   and the application, menu and profile controllers are what write one onto a
   field — `logoImage`, `coverBannerImage`, `productImage`, `galleryImages`, or
   an entry in `verificationDocuments` whose own `kind` is one of the model's
   `DOCUMENT_KINDS`. A kind nobody recognises is therefore an image with no
   destination: uploaded, paid for, and attached to nothing. The door is the
   last point at which that is still visible to whoever sent it.

   Defaulting an absent kind to `gallery` was considered and rejected for the
   same reason. A client that omitted the field is a client that does not yet
   know where the image goes, and quietly filing a licence scan into a
   restaurant's public photo gallery is a worse outcome than a 400.

   ## Two callers, one endpoint, two folders

   Assets are foldered as `lampose/food-partners/<restaurantId>` — one folder
   per partner, so a support request about one restaurant's photographs is a
   folder to open rather than a shared bucket to trawl.

   A restaurant mid-application does not have an id yet and still has to attach
   a photograph of its licence: the id is minted when `POST /applications`
   succeeds, which is the very request the licence is being attached to. Those
   uploads land in `lampose/food-partners/applications`, the one shared folder
   here, and it is understood to be exactly that — its contents belong to
   nobody until an application claims a URL.

   Which of the two a caller is, is decided by the ROUTE and not by this file:
   the routes file mounts the partner session guard or the phone-verification
   guard in front of it, the same way `uploadPropertyImages` trusts
   `requirePartner` to have run. This handler reads only the session that
   middleware left behind, and falls back to the application folder when there
   is none. Re-deriving in a controller a permission a middleware has already
   decided is how the two answers get to disagree.

   The `restaurantId` is checked against the shape `makeRestaurantId` produces
   before it is used, because a folder name is a path. Nothing but an
   `FP-XXXXXXXX` from our own generator becomes one; anything else is treated
   as "no session" and goes to the application folder.

   ## No database, and so no `requireLamposeDb` check inside this file

   Unlike every other handler in this module, this one touches no collection —
   the session document was loaded by the middleware, and the returned URLs are
   written later by whichever controller owns the field. That is why there is
   no `mongoose.connection.readyState` guard below: there is nothing here for a
   disconnected database to break.

   ## Failures

   The uploads run SEQUENTIALLY, copied from `uploadKycImages`: ten 10MB images
   decoded in parallel is a memory spike on a small instance for no gain a
   person would notice.

   If one of them fails, the whole call fails and the images already sent are
   orphaned in the folder. That is the deliberate trade. A partial success
   would hand the app a list shorter than the one it sent with no way to tell
   which photograph must be sent again, whereas an orphan is inert, is foldered
   under the partner it came from, and costs storage rather than correctness.

   A Cloudinary error carries an `http_code`; that case answers 502
   `STORAGE_UPLOAD_FAILED` rather than falling through to the generic 500,
   because the failure is a third party's and a retry usually clears it. An
   `INTERNAL_ERROR` sends a partner to Lampose support over something that was
   never this process's fault.

   ## The numbers live here

   `MAX_FOOD_IMAGES` and `FOOD_UPLOAD_LIMITS` are exported so the routes file
   builds its multer middleware from the same values this handler enforces. Two
   files each choosing a ceiling is two ceilings, and the wrong one is
   discovered by a partner whose upload multer accepted and this file then
   refused.

   Every line printed here goes through `foodPartner.log.js` rather than a bare
   `console.log`: one badge, one grep string, and one `config.log.enabled`
   guard for the whole module.
   ══════════════════════════════════════════════════════════════════════════ */
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const {
  logUpload, logRejected, logDependencyMissing, logError, startTimer,
} = require('./foodPartner.log');

/* ── The numbers ──────────────────────────────────────────────────────────
   Ten is a cover, a logo and an eight-photograph gallery in one call, and it
   is what the Stay Partner property upload settled on. Ten megabytes is
   generous for a phone photograph of a licence and small enough that a full
   batch cannot exhaust a small instance.

   Worth knowing when reading a 413: an inline batch is additionally capped by
   `BODY_LIMIT` (25mb), which body-parser enforces over the whole JSON body
   before this handler is reached. Multipart is not, because multer streams —
   so the two shapes reach their ceiling by different roads. */
const MAX_FOOD_IMAGES = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Exactly the object multer's `limits` takes. See the header. */
const FOOD_UPLOAD_LIMITS = { fileSize: MAX_IMAGE_BYTES, files: MAX_FOOD_IMAGES };

/* The four restaurant-facing kinds and the four document kinds, in the order
   the onboarding form asks for them. The document half is a subset of
   `foodRestaurant.model.js`'s `DOCUMENT_KINDS` by intention rather than by
   import: `menu_sheet` exists in the model because the verification team may
   file one, and is not offered here because no screen in the app sends it. An
   import would silently grow this list the day the model's grows. */
const UPLOAD_KINDS = ['logo', 'cover', 'product', 'gallery', 'fssai', 'gst', 'pan', 'cheque'];

const FOLDER_ROOT = 'lampose/food-partners';
const APPLICATION_FOLDER = 'applications';

/** `FP-` and eight Crockford-ish characters — what `makeRestaurantId` mints. */
const RESTAURANT_ID = /^FP-[A-Z0-9]{8}$/;

const ROUTE = 'POST /api/v2/food-partners/uploads/images';

/* ── Replies ──────────────────────────────────────────────────────────────
   `code`, `message` AND `error` on every failure, matching the rest of this
   module: the website reads `message`, the apps switch on `code`, and older
   screens still render `error`. Any one of the three missing is a blank alert
   on somebody's phone. */
const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const badInput = (res, message, code = 'BAD_INPUT') => fail(res, 400, code, message);

/* ── Cloudinary ───────────────────────────────────────────────────────────
   Identical to `propertyEdit.controller.js`'s, deliberately: an upload that
   works for a stay partner and not for a food partner must never be a
   difference in how the two read the same three variables. Returns the cloud
   name when all three are present and null otherwise — null is the whole of
   the 503 decision. */
const configureCloudinary = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return cloud_name;
};

/* ── The two request shapes ───────────────────────────────────────────────*/

const dataUri = (mimetype, buffer) => `data:${mimetype || 'image/jpeg'};base64,${buffer.toString('base64')}`;

/** A JSON client may send the prefix or only the payload; both are accepted. */
const normaliseInline = (value) => {
  const text = String(value).trim();
  return text.startsWith('data:') ? text : `data:image/jpeg;base64,${text}`;
};

/**
 * Roughly how many bytes a data URI decodes to.
 *
 * Base64 is four characters for every three bytes, and the padding makes this
 * at most two bytes generous — near enough for a size limit and for a log
 * line, and far cheaper than decoding a 10MB string in order to measure it.
 */
const decodedBytes = (source) => {
  const text = String(source);
  const payload = text.slice(text.indexOf(',') + 1);
  return Math.round((payload.length * 3) / 4);
};

/**
 * Everything attached to this request, whichever shape it arrived in.
 *
 * `req.files` is what `.array()` and `.any()` leave behind; `req.file` is what
 * `.single()` leaves, and both are read because a licence scan is one file and
 * mounting `.single('image')` for it is a reasonable thing for the routes file
 * to do. `images` is the JSON array and `image` the JSON single, for the same
 * reason: most of `UPLOAD_KINDS` is one image, and a client should not have to
 * wrap one licence in an array to send it.
 */
const collectSources = (req) => {
  const body = req.body || {};

  let files = [];
  if (Array.isArray(req.files)) files = req.files.filter(Boolean);
  else if (req.file) files = [req.file];

  /* Only `multer.memoryStorage()` produces a buffer, and that is what the
     instance exported below uses — a partner's licence never touches this
     server's disk. A file with no buffer means the routes file mounted disk
     storage instead, which this handler cannot stream and which has to be a
     named refusal rather than a TypeError three lines further down. */
  const onDisk = files.some((file) => !file.buffer);

  const inline = [
    ...(Array.isArray(body.images) ? body.images : []),
    ...(typeof body.image === 'string' ? [body.image] : []),
  ].filter((value) => typeof value === 'string' && value.trim());

  const sources = [
    ...files.map((file) => ({
      source: file.buffer ? dataUri(file.mimetype, file.buffer) : '',
      fileName: file.originalname || '',
      bytes: Number(file.size) || (file.buffer ? file.buffer.length : 0),
    })),
    ...inline.map((value) => {
      const source = normaliseInline(value);
      return { source, fileName: '', bytes: decodedBytes(source) };
    }),
  ];

  /* Named for the log line, so a developer can see which client shape arrived
     without opening a proxy — the two fail in different ways. */
  let shape = 'base64';
  if (files.length && inline.length) shape = 'multipart+base64';
  else if (files.length) shape = 'multipart';

  return { sources, shape, onDisk };
};

/* ── Who is uploading ─────────────────────────────────────────────────────*/

/**
 * The restaurant on this session, or null for an application in progress.
 *
 * The session guard leaves the loaded restaurant on the request; the
 * phone-verification guard leaves no restaurant, because there is not one yet.
 * Null is an ordinary, expected answer here rather than a failure — see the
 * header on the two folders.
 */
const restaurantIdOf = (req) => {
  const session = req.foodPartner || req.restaurant || null;
  const id = String((session && session.restaurantId) || '').trim().toUpperCase();
  return RESTAURANT_ID.test(id) ? id : null;
};

const folderFor = (restaurantId) => `${FOLDER_ROOT}/${restaurantId || APPLICATION_FOLDER}`;

/** The kind, from a multipart text field, a JSON field, or the query string. */
const readKind = (req) => {
  const body = req.body || {};
  const query = req.query || {};
  const raw = body.kind !== undefined ? body.kind : query.kind;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
};

// @route   POST /api/v2/food-partners/uploads/images
// @desc    Logos, banners, dish photographs and licence scans to Cloudinary
// @access  Food-partner session OR a phone-verification token (decided on the route)
const uploadFoodImages = async (req, res, next) => {
  /* The timer `tagFoodPartnerRequest` hung on the request, so the duration
     printed covers the transfer as well as the upload — for a batch of
     photographs off a phone, the transfer is most of it. */
  const timer = req.foodPartnerTimer || startTimer();

  try {
    const cloudName = configureCloudinary();
    if (!cloudName) {
      logDependencyMissing({
        dependency: 'Cloudinary (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET)',
        code: 'STORAGE_NOT_CONFIGURED',
        route: ROUTE,
        hint: 'set the three CLOUDINARY_* variables in .env and restart',
      });
      return fail(res, 503, 'STORAGE_NOT_CONFIGURED', 'Image storage is not set up on this server.');
    }

    const kind = readKind(req);
    if (!kind) {
      logRejected('the upload named no kind', { code: 'MISSING_UPLOAD_KIND', field: 'kind', status: 400 });
      return badInput(
        res,
        `Say what this image is. Send "kind" as one of: ${UPLOAD_KINDS.join(', ')}.`,
        'MISSING_UPLOAD_KIND',
      );
    }
    if (!UPLOAD_KINDS.includes(kind)) {
      logRejected(`unrecognised upload kind "${kind}"`, { code: 'UNKNOWN_UPLOAD_KIND', field: 'kind', status: 400 });
      return badInput(
        res,
        `"${kind}" is not something we store. Send "kind" as one of: ${UPLOAD_KINDS.join(', ')}.`,
        'UNKNOWN_UPLOAD_KIND',
      );
    }

    const { sources, shape, onDisk } = collectSources(req);

    if (onDisk) {
      logRejected('the upload middleware is not memory-backed', { code: 'UPLOAD_MISCONFIGURED', status: 500 });
      return fail(res, 500, 'UPLOAD_MISCONFIGURED', 'Image uploads are misconfigured on this server.');
    }

    if (!sources.length) {
      logRejected('no images were attached', { code: 'NO_IMAGES', field: kind, status: 400 });
      return badInput(res, 'No images were attached.', 'NO_IMAGES');
    }
    if (sources.length > MAX_FOOD_IMAGES) {
      logRejected(`${sources.length} images in one call`, { code: 'TOO_MANY_IMAGES', field: kind, status: 400 });
      return badInput(res, `Please attach at most ${MAX_FOOD_IMAGES} images at a time.`, 'TOO_MANY_IMAGES');
    }

    /* Multer already enforced `fileSize` on the multipart shape; nothing
       enforces it on the inline one, where the only other ceiling is the 25mb
       body limit for the batch as a whole. Checking here is what makes one
       image the same size whichever way it was sent. */
    const oversized = sources.find((item) => item.bytes > MAX_IMAGE_BYTES);
    if (oversized) {
      logRejected('an image is over the size limit', { code: 'IMAGE_TOO_LARGE', field: kind, status: 413 });
      return fail(
        res,
        413,
        'IMAGE_TOO_LARGE',
        `Each image must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }

    const restaurantId = restaurantIdOf(req);
    const folder = folderFor(restaurantId);

    const uploaded = [];
    let bytes = 0;

    for (const item of sources) {
      /* Sequential, not parallel — see the header.

         `resource_type: 'image'` matches the route name and covers the
         document kinds as well: Cloudinary files a PDF under the image
         resource type, so a licence sent as a PDF scan rather than a
         photograph still lands in the same folder beside the rest. */
      const result = await cloudinary.uploader.upload(item.source, { folder, resource_type: 'image' });

      bytes += item.bytes;
      uploaded.push({
        kind,
        url: result.secure_url,
        publicId: result.public_id,
        /* `verificationDocuments[].fileName` wants the name the partner's
           phone gave the file. Only the multipart shape carries one, so
           Cloudinary's own derived name stands in for the inline shape. */
        fileName: item.fileName || result.original_filename || '',
        bytes: Number(result.bytes) || item.bytes,
        format: result.format || '',
      });
    }

    /* `mode` is `logUpload`'s one free-form slot, and the kind is what a
       reader needs beside the count: "3 images" does not say whether a menu
       gallery or a set of licences just arrived. */
    logUpload({
      restaurantId,
      folder,
      count: uploaded.length,
      mode: `${kind} · ${shape}${restaurantId ? '' : ' · pre-application'}`,
      bytes,
      timer,
    });

    return res.status(201).json({
      success: true,
      kind,
      folder,
      count: uploaded.length,
      data: uploaded,
    });
  } catch (error) {
    logError('image upload failed', error);

    /* Cloudinary's SDK puts the status it received on `http_code`. Only that
       case is translated; anything else is a bug in this process and belongs
       to the shared error handler, which is the one place that decides what a
       500 looks like. */
    if (error && Number.isFinite(Number(error.http_code))) {
      return fail(res, 502, 'STORAGE_UPLOAD_FAILED', 'The image store would not accept that upload. Please try again.');
    }

    return next(error);
  }
};

/* Memory-backed and streamed straight to Cloudinary: a partner's licence scan
   never touches this server's disk, and there is nothing to clean up after a
   failed request. Exported ready-made so the routes file can mount it as
   `.array('images', MAX_FOOD_IMAGES)` — or build its own from
   `FOOD_UPLOAD_LIMITS` — without choosing the numbers a second time. */
const foodImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: FOOD_UPLOAD_LIMITS,
});

module.exports = {
  uploadFoodImages,
  /* The same function under the longer spelling the module's other handlers
     use. An `undefined` handed to `router.post` throws at mount time, and in a
     process that is not allowed to exit that is the one failure worth two
     lines to make impossible. */
  uploadFoodPartnerImages: uploadFoodImages,

  /* Shared with the routes file, so the ceiling is decided once. */
  MAX_FOOD_IMAGES,
  MAX_IMAGE_BYTES,
  FOOD_UPLOAD_LIMITS,
  foodImageUpload,

  /* Shared with the application and menu controllers: the list accepted here
     is the list they may attach. */
  UPLOAD_KINDS,

  /* So a controller that uploads on its own path refuses in the same named way
     rather than reading the three variables again with a shape of its own. */
  configureCloudinary,
};
