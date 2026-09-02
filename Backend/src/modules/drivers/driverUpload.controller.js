/* ══════════════════════════════════════════════════════════════════════════
   A rider's photographs on their way to Cloudinary.

   Two things ever arrive here: the profile photograph, and the scans of the
   five documents an administrator reads before putting somebody on the road.
   Nothing in `app_drivers` holds an image — the schema holds URLs, and this
   file is what produced them.

   `foodpartners/foodUpload.controller.js` already solved this exact problem
   for restaurants, and this is deliberately the same solution rather than a
   new one. Its four load-bearing behaviours are kept exactly, and for the same
   reasons, which are set out at length in that file:

     · TWO REQUEST SHAPES, one code path. A native picker sends
       `multipart/form-data`; a JSON client sends base64 data URIs. Both become
       the same data-URI string before one upload loop.
     · CLOUDINARY IS CONFIGURED PER REQUEST. The SDK keeps credentials in
       module global state, and `node --watch` plus a `.env` filled in
       mid-session means "configured at boot" and "configured now" are not the
       same statement.
     · A MISSING CREDENTIAL IS A NAMED 503, never a throw. This process does
       not exit for a missing dependency; an unset `CLOUDINARY_*` degrades this
       one route and leaves sign-in, duty and the whole delivery loop working.
     · SEQUENTIAL UPLOADS. Ten 10MB images decoded in parallel is a memory
       spike on a small instance for no gain anybody would notice.

   ## Why a second upload controller rather than reusing the first

   `uploadFoodImages` is reachable only behind the food-partner session guard,
   and its folder, its `kind` list and its log badge all belong to that module.
   Widening it to also understand riders would mean one endpoint whose
   permission depends on which of two unrelated identity systems signed the
   request — and the first bug in that arrangement is a restaurant reading a
   rider's Aadhaar out of a shared folder. Two small files with one guard each
   is the cheaper half of that trade.

   ## The `kind` is required and is never guessed

   `profile`, or one of the five document kinds the model names. This endpoint
   attaches nothing: it returns URLs, and `PATCH /me` or `POST /me/documents`
   is what writes one onto a field. A kind nobody recognises is therefore an
   image with no destination — uploaded, paid for, and attached to nothing —
   and the door is the last point at which that is still visible to whoever
   sent it.

   The document kinds are imported from the model rather than re-listed, which
   is the opposite of the choice `foodUpload.controller.js` made. There the two
   lists genuinely differ (`menu_sheet` exists in the model and no screen sends
   it); here they are the same list by definition — every document a rider can
   submit is a document a rider can photograph — so a sixth kind added to the
   model should reach this endpoint without a second edit.

   ## One folder per rider

   `lampose/drivers/<driverId>`, so a support request about one rider is a
   folder to open rather than a shared bucket to trawl. Unlike the restaurant
   flow there is no pre-account case to handle: a rider has a `driverId` from
   the moment `POST /auth/start` mints it, and this route sits behind the
   session guard, so `req.driver` is always there.
   ══════════════════════════════════════════════════════════════════════════ */
const cloudinary = require('cloudinary').v2;
const multer = require('multer');

const Driver = require('./driver.model');

const { DOCUMENT_KINDS } = Driver;

const BADGE = '🛵 [drivers/upload]';

/* Four is a licence front and back plus an RC front and back in one call, and
   it is as many as any screen in the app sends. Ten megabytes is generous for
   a phone photograph of a licence and small enough that a full batch cannot
   exhaust a small instance.

   Worth knowing when reading a 413: the inline shape is additionally capped by
   `BODY_LIMIT` (25mb), which body-parser enforces over the whole JSON body
   before this handler is reached. Multipart is not, because multer streams. */
const MAX_DRIVER_IMAGES = 4;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Exactly the object multer's `limits` takes. */
const DRIVER_UPLOAD_LIMITS = { fileSize: MAX_IMAGE_BYTES, files: MAX_DRIVER_IMAGES };

/** The five document kinds from the model, plus the one image that is not one. */
const UPLOAD_KINDS = ['profile', ...DOCUMENT_KINDS];

const FOLDER_ROOT = 'lampose/drivers';

const ROUTE = 'POST /api/v2/drivers/me/uploads/images';

/* `code`, `message` AND `error` on every failure, matching the rest of the
   module: the console reads `message`, the app switches on `code`, and older
   screens still render `error`. */
const fail = (res, status, code, message) => res.status(status).json({
  success: false, code, message, error: message,
});

const badInput = (res, message, code = 'BAD_INPUT') => fail(res, 400, code, message);

/* Identical to the food module's, deliberately: an upload that works for a
   restaurant and not for a rider must never be a difference in how the two
   read the same three variables. Returns the cloud name when all three are
   present, and null otherwise — null is the whole of the 503 decision. */
const configureCloudinary = () => {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) return null;
  cloudinary.config({ cloud_name, api_key, api_secret });
  return cloud_name;
};

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
 * at most two bytes generous — near enough for a size limit, and far cheaper
 * than decoding a 10MB string in order to measure it.
 */
const decodedBytes = (source) => {
  const text = String(source);
  const payload = text.slice(text.indexOf(',') + 1);
  return Math.round((payload.length * 3) / 4);
};

/**
 * Everything attached to this request, whichever shape it arrived in.
 *
 * `req.files` is what `.array()` leaves behind and `req.file` is what
 * `.single()` leaves; both are read because a licence scan is one file and
 * mounting `.single('image')` for it is a reasonable thing to do. `images` is
 * the JSON array and `image` the JSON single, for the same reason — a client
 * should not have to wrap one licence in an array to send it.
 */
const collectSources = (req) => {
  const body = req.body || {};

  let files = [];
  if (Array.isArray(req.files)) files = req.files.filter(Boolean);
  else if (req.file) files = [req.file];

  /* Only `multer.memoryStorage()` produces a buffer, and that is what the
     instance exported below uses — a rider's Aadhaar never touches this
     server's disk. A file with no buffer means disk storage was mounted
     instead, which has to be a named refusal rather than a TypeError three
     lines further down. */
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

  let shape = 'base64';
  if (files.length && inline.length) shape = 'multipart+base64';
  else if (files.length) shape = 'multipart';

  return { sources, shape, onDisk };
};

/** The kind, from a multipart text field, a JSON field, or the query string. */
const readKind = (req) => {
  const body = req.body || {};
  const query = req.query || {};
  const raw = body.kind !== undefined ? body.kind : query.kind;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return String(value === undefined || value === null ? '' : value).trim().toLowerCase();
};

// @route   POST /api/v2/drivers/me/uploads/images
// @desc    A profile photograph or a document scan, to Cloudinary
// @access  Driver session (approval NOT required — see driver.routes.js)
const uploadDriverImages = async (req, res, next) => {
  try {
    const cloudName = configureCloudinary();
    if (!cloudName) {
      console.error(
        `${BADGE} STORAGE_NOT_CONFIGURED on ${ROUTE}`
        + ' — set CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET in .env and restart.',
      );
      return fail(res, 503, 'STORAGE_NOT_CONFIGURED', 'Image storage is not set up on this server.');
    }

    const kind = readKind(req);
    if (!kind) {
      return badInput(
        res,
        `Say what this image is. Send "kind" as one of: ${UPLOAD_KINDS.join(', ')}.`,
        'MISSING_UPLOAD_KIND',
      );
    }
    if (!UPLOAD_KINDS.includes(kind)) {
      return badInput(
        res,
        `"${kind}" is not something we store. Send "kind" as one of: ${UPLOAD_KINDS.join(', ')}.`,
        'UNKNOWN_UPLOAD_KIND',
      );
    }

    const { sources, shape, onDisk } = collectSources(req);

    if (onDisk) {
      console.error(`${BADGE} the upload middleware is not memory-backed on ${ROUTE}`);
      return fail(res, 500, 'UPLOAD_MISCONFIGURED', 'Image uploads are misconfigured on this server.');
    }
    if (!sources.length) return badInput(res, 'No images were attached.', 'NO_IMAGES');
    if (sources.length > MAX_DRIVER_IMAGES) {
      return badInput(res, `Please attach at most ${MAX_DRIVER_IMAGES} images at a time.`, 'TOO_MANY_IMAGES');
    }

    /* Multer already enforced `fileSize` on the multipart shape; nothing
       enforces it on the inline one, where the only other ceiling is the 25mb
       body limit for the batch as a whole. Checking here is what makes one
       image the same size whichever way it was sent. */
    const oversized = sources.find((item) => item.bytes > MAX_IMAGE_BYTES);
    if (oversized) {
      return fail(
        res, 413, 'IMAGE_TOO_LARGE',
        `Each image must be under ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`,
      );
    }

    const { driverId } = req.driver;
    const folder = `${FOLDER_ROOT}/${driverId}`;

    const uploaded = [];
    for (const item of sources) {
      /* Sequential, not parallel — see the header.

         `resource_type: 'image'` covers the document kinds as well:
         Cloudinary files a PDF under the image resource type, so a licence
         sent as a PDF scan rather than a photograph still lands beside the
         rest. */
      const result = await cloudinary.uploader.upload(item.source, { folder, resource_type: 'image' });
      uploaded.push({
        kind,
        url: result.secure_url,
        publicId: result.public_id,
        fileName: item.fileName || result.original_filename || '',
        bytes: Number(result.bytes) || item.bytes,
        format: result.format || '',
      });
    }

    console.log(`${BADGE} ${driverId} · ${uploaded.length} × ${kind} · ${shape} → ${folder}`);

    return res.status(201).json({
      success: true,
      kind,
      folder,
      count: uploaded.length,
      data: uploaded,
    });
  } catch (error) {
    console.error(`${BADGE} image upload failed:`, error.message);

    /* Cloudinary's SDK puts the status it received on `http_code`. Only that
       case is translated; anything else is a bug in this process and belongs
       to the shared error handler, which is the one place that decides what a
       500 looks like. Sending a rider to Lampose support over a third party's
       outage is the outcome this avoids. */
    if (error && Number.isFinite(Number(error.http_code))) {
      return fail(res, 502, 'STORAGE_UPLOAD_FAILED', 'The image store would not accept that upload. Please try again.');
    }

    return next(error);
  }
};

/* Memory-backed and streamed straight to Cloudinary: a rider's licence scan
   never touches this server's disk, and there is nothing to clean up after a
   failed request. Exported ready-made so the routes file mounts it without
   choosing the numbers a second time. */
const driverImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: DRIVER_UPLOAD_LIMITS,
});

module.exports = {
  uploadDriverImages,
  driverImageUpload,
  UPLOAD_KINDS,
  MAX_DRIVER_IMAGES,
  MAX_IMAGE_BYTES,
  DRIVER_UPLOAD_LIMITS,
};
