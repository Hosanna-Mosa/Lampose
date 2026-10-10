/* A listing's photos — the limits `PhotoManager` enforces, kept equal to
   `property.routes.v1.js` (`MAX_PROPERTY_IMAGES`, multer's 15 MB). */

export const MAX_PROPERTY_PHOTOS = 10;
export const MAX_FILE_BYTES = 15 * 1024 * 1024;

/** The stand-in the create route stores when a listing arrives with no photo. */
export const PLACEHOLDER_PHOTO = '/lampose-logo-splash.png';

/** A listing's real photos — the stand-in is not one, and is not shown as one. */
export const realPhotos = (images: string[] | undefined): string[] =>
  (images ?? []).filter((url) => url && url !== PLACEHOLDER_PHOTO);
