import { PixelRatio } from 'react-native';

/**
 * A listing photo, asked for at the size it is drawn.
 *
 * ## Why this exists
 *
 * Owners upload straight from their phones, so a listing photo is a
 * 720×1570 portrait JPEG of ~215 KB — and the feed drew it, as uploaded, into
 * a card about 200 pt tall. Decoded, each one is ~4.5 MB of bitmap; the PG
 * feed alone carries 46 listings and 209 photos. That was the bulk of the
 * memory the app held, and the garbage collection and image decoding it caused
 * is what made every tap on the feed feel late.
 *
 * Cloudinary resizes on the URL: `c_fill,w_…,h_…` crops to the frame the way
 * `contentFit="cover"` would, and `f_auto,q_auto` picks the lightest format
 * the phone can read. The same photo as a card comes back at a fraction of
 * the bytes and decodes to a bitmap the size of the card.
 *
 * Sizes are rounded UP to a few buckets, so every phone asks for one of a
 * handful of variants — Cloudinary derives each once and serves the rest from
 * its CDN, and expo-image's disk cache gets hits across screens.
 *
 * Anything that is not a Cloudinary upload URL (a local file, a `data:` URI,
 * another host) is returned untouched.
 */

const UPLOAD = '/image/upload/';
const BUCKETS = [160, 320, 480, 640, 800, 1080, 1440] as const;

function bucket(px: number): number {
  return BUCKETS.find((size) => size >= px) ?? BUCKETS[BUCKETS.length - 1];
}

/**
 * @param uri    the photo as stored
 * @param width  the width it is drawn at, in points
 * @param height the height it is drawn at, in points — omit to keep the
 *               photo's own shape (a gallery that letterboxes with `contain`)
 */
export function sizedImage(uri: string | undefined, width: number, height?: number): string | undefined {
  if (!uri || !uri.includes('res.cloudinary.com') || !uri.includes(UPLOAD)) return uri;
  /* Already transformed by somebody who knew what they wanted. */
  if (uri.includes('f_auto') || uri.includes('q_auto')) return uri;

  const scale = Math.min(PixelRatio.get(), 3);
  const w = bucket(Math.round(width * scale));
  const transform = height
    ? `c_fill,w_${w},h_${Math.round((w * height) / width)},f_auto,q_auto`
    : `c_limit,w_${w},f_auto,q_auto`;

  return uri.replace(UPLOAD, `${UPLOAD}${transform}/`);
}
