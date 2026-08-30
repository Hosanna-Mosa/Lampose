/* ══════════════════════════════════════════════════════════════════════════
   Getting the images off the phone and into Cloudinary.

   Every picture a partner chooses starts as a LOCAL uri — `file:///…` on
   Android, `ph://…` or a cache path on iOS. Those mean nothing to anybody
   else: the server cannot read them, and a diner's phone certainly cannot.
   So nothing is ever stored with a local uri in it. Each one is uploaded
   through `POST /api/v2/food-partners/uploads/images` first, and only the
   `https://res.cloudinary.com/…` URL that comes back is written to the
   database.

   That is not a detail — the backend's sanitiser accepts `uri` as an alias for
   `url`, so an app that sent its local path unchanged would have it stored
   verbatim and every image in the product would silently 404. This module is
   what stops that.

   ## Idempotent by design

   `uploadOne` returns the attachment untouched when it already carries an
   `https` url. A partner who edits a dish's price should not re-upload its
   photograph, and a failed submit that is retried should not upload the same
   licence twice.

   ## Sequential, not parallel

   A batch is a set of phone-camera photographs on a mobile connection.
   Firing ten at once on a bad link is how they all time out together; one at a
   time is slower on a good link and far more likely to finish on a poor one,
   which is the connection this app is actually used on.
   ══════════════════════════════════════════════════════════════════════════ */
import { apiUpload } from "./api";
import type { Attachment, OnboardingData } from "@/store/partnerStore";

const UPLOAD_PATH = "/api/v2/food-partners/uploads/images";

/** The kinds the server files an upload under. Anything else is refused. */
export type UploadKind = "logo" | "cover" | "product" | "gallery" | "fssai" | "gst" | "pan" | "cheque";

type UploadedImage = { kind: string; url: string; publicId: string; fileName: string };
type UploadResponse = { success: boolean; data: UploadedImage[] };

/** Already in Cloudinary — nothing to do. */
export const isUploaded = (file: Attachment | null): boolean =>
  !!file && typeof file.url === "string" && /^https?:\/\//.test(file.url);

const guessMime = (file: Attachment): string => {
  if (file.mimeType) return file.mimeType;
  const ext = file.name?.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "pdf") return "application/pdf";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
};

/**
 * One file to Cloudinary, returning the attachment with a real URL on it.
 *
 * Two shapes, because the two sources differ: a picked file is streamed as
 * multipart, and an inline `data:` uri (which is what the sample content and
 * some iOS picks produce) is sent as base64 in a JSON body. The server accepts
 * both on the same route.
 */
export async function uploadOne(
  file: Attachment,
  kind: UploadKind,
  token?: string | null,
): Promise<Attachment> {
  if (isUploaded(file)) return file;

  let response: UploadResponse;

  if (file.uri.startsWith("data:")) {
    const form = new FormData();
    form.append("kind", kind);
    form.append("images", file.uri);
    response = await apiUpload<UploadResponse>(UPLOAD_PATH, form, { token });
  } else {
    const form = new FormData();
    form.append("kind", kind);
    /* React Native's FormData takes this three-key object for a file. It is
       not a browser File and TypeScript's DOM lib has no type for it, which is
       what the cast is for — not laziness. */
    form.append("images", {
      uri: file.uri,
      name: file.name || `${kind}.jpg`,
      type: guessMime(file),
    } as unknown as Blob);
    response = await apiUpload<UploadResponse>(UPLOAD_PATH, form, { token });
  }

  const stored = response?.data?.[0];
  if (!stored?.url) throw new Error(`The ${kind} image did not come back with a URL.`);

  return { ...file, url: stored.url, publicId: stored.publicId };
}

/** The same, for a gallery. Sequential — see the header. */
export async function uploadMany(
  files: Attachment[],
  kind: UploadKind,
  token?: string | null,
): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const file of files) out.push(await uploadOne(file, kind, token));
  return out;
}

export type UploadProgress = { done: number; total: number; label: string };

/**
 * Every image in a whole application, uploaded before it is submitted.
 *
 * Returns a NEW `OnboardingData` with each attachment carrying its Cloudinary
 * URL, so the caller posts real links and nothing local ever reaches Mongo.
 * `onProgress` exists because this is the slowest thing the app does and a
 * submit button that sits still for forty seconds reads as broken.
 */
export async function uploadApplicationImages(
  data: OnboardingData,
  token?: string | null,
  onProgress?: (p: UploadProgress) => void,
): Promise<OnboardingData> {
  /* Counted up front so the progress line can say "3 of 11" rather than
     counting up to a total nobody knows. */
  const jobs: { label: string; run: () => Promise<void> }[] = [];
  const next: OnboardingData = { ...data };

  const single = (
    file: Attachment | null,
    kind: UploadKind,
    label: string,
    assign: (a: Attachment) => void,
  ) => {
    if (!file || isUploaded(file)) return;
    jobs.push({ label, run: async () => assign(await uploadOne(file, kind, token)) });
  };

  single(data.logoImage, "logo", "logo", (a) => { next.logoImage = a; });
  single(data.coverBannerImage, "cover", "cover photo", (a) => { next.coverBannerImage = a; });
  single(data.panFile, "pan", "PAN card", (a) => { next.panFile = a; });
  single(data.gstFile, "gst", "GST certificate", (a) => { next.gstFile = a; });
  single(data.fssaiFile, "fssai", "FSSAI licence", (a) => { next.fssaiFile = a; });
  single(data.chequeFile, "cheque", "cancelled cheque", (a) => { next.chequeFile = a; });

  /* The menu, category by category. The arrays are rebuilt rather than mutated
     so a failure part-way through leaves `data` exactly as it was and the
     partner can retry without a half-updated form. */
  const categories = data.menuCategories.map((c) => ({ ...c, items: [...c.items] }));
  categories.forEach((category, ci) => {
    category.items.forEach((item, ii) => {
      if (item.productImage && !isUploaded(item.productImage)) {
        jobs.push({
          label: item.productName || "a dish",
          run: async () => {
            const uploaded = await uploadOne(item.productImage as Attachment, "product", token);
            categories[ci].items[ii] = { ...categories[ci].items[ii], productImage: uploaded };
          },
        });
      }
      const gallery = item.galleryImages.filter((g) => !isUploaded(g));
      if (gallery.length) {
        jobs.push({
          label: `${item.productName || "a dish"} gallery`,
          run: async () => {
            const uploaded = await uploadMany(categories[ci].items[ii].galleryImages, "gallery", token);
            categories[ci].items[ii] = { ...categories[ci].items[ii], galleryImages: uploaded };
          },
        });
      }
    });
  });

  /* Photographs attached to rows read out of an uploaded spreadsheet. */
  const rows = [...data.menuRows];
  rows.forEach((row, i) => {
    if (row.image && !isUploaded(row.image)) {
      jobs.push({
        label: row.itemName || "a sheet row",
        run: async () => {
          rows[i] = { ...rows[i], image: await uploadOne(row.image as Attachment, "product", token) };
        },
      });
    }
  });

  const total = jobs.length;
  for (let i = 0; i < total; i += 1) {
    onProgress?.({ done: i, total, label: jobs[i].label });
    await jobs[i].run();
  }
  onProgress?.({ done: total, total, label: "" });

  next.menuCategories = categories;
  next.menuRows = rows;
  return next;
}
