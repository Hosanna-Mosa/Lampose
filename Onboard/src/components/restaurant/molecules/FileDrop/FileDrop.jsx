import React, { useEffect, useState } from 'react';
import { CheckCircle2, ImagePlus, Upload, X } from 'lucide-react';
import { Box, Image, Inline, Input, Text } from '../../../common/atoms';

/*
 * Picking one file: the PAN card scan or the FSSAI certificate.
 *
 * The whole control is a `<label>` so that a tap anywhere on it opens the
 * picker — on a phone the visible target is the entire dashed area, and a
 * button hidden inside it would be a 40px target inside a 120px box.
 *
 * Drag-and-drop is kept for the desktop case, but it is an addition rather
 * than the mechanism: `dragover` never fires on a touch screen, so nothing
 * about choosing a file may depend on it.
 *
 * The outer box carries `<id>-field`, and that — not the `<input>` — is what
 * "attach the PAN card" scrolls to when the form points at a missing scan:
 * the input itself is `display: none`, so scrolling to it moves nothing and
 * focusing it focuses nothing. Both branches below render it, so the anchor
 * survives a file being picked and removed again.
 *
 * ## `preview` shows the picture, and a filename does not
 *
 * A licence scan is confirmed by its name — there is one PAN card and the
 * agent just photographed it. A dish photograph is not: "IMG_4471.HEIC" says
 * nothing about whether the biryani is in the frame, in focus, or the right
 * dish, and it is the picture that ends up on the menu card a diner orders
 * from. So the image kinds render a THUMBNAIL of what was actually picked.
 *
 * The object URL is created in an effect and revoked when the file changes or
 * the control unmounts. Browsers hold the blob alive for the life of the
 * document otherwise, and a form where sixty dish photographs were each picked
 * and re-picked would keep every one of them in memory.
 *
 * `compact` is the same control at dish size: these sit one per dish inside a
 * card that already has six boxes in it, and the full drop zone doubles the
 * height of every one of them.
 */
export function FileDrop({
  label,
  desc,
  file,
  onChange,
  accept = 'image/*,.pdf',
  id,
  preview = false,
  compact = false,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [thumbnail, setThumbnail] = useState(null);

  /* Only for a picture, and only when the caller asked to see one: a PDF has
     no thumbnail to make, and `createObjectURL` on one produces a URL that
     renders as a broken image. */
  const isImage = Boolean(file) && String(file.type || '').startsWith('image/');

  useEffect(() => {
    if (!preview || !isImage) { setThumbnail(null); return undefined; }
    const url = URL.createObjectURL(file);
    setThumbnail(url);
    return () => URL.revokeObjectURL(url);
  }, [preview, isImage, file]);

  const pick = (picked) => {
    if (picked) onChange(picked);
  };

  if (file) {
    return (
      <Box id={id ? `${id}-field` : undefined} tabIndex={-1}>
        {label && <Text className="rst-label">{label}</Text>}
        <Box className="rst-file">
          {thumbnail
            ? <Image className="rst-file-thumb" src={thumbnail} alt={file.name} />
            : <CheckCircle2 size={17} color="#45855a" />}
          <Inline className="rst-file-name">{file.name}</Inline>
          <button
            type="button"
            className="rst-file-kill"
            onClick={() => onChange(null)}
            aria-label={`Remove ${file.name}`}
          >
            <X size={15} />
          </button>
        </Box>
      </Box>
    );
  }

  return (
    <Box id={id ? `${id}-field` : undefined} tabIndex={-1}>
      {label && <Text className="rst-label">{label}</Text>}
      <label
        className={`rst-drop${compact ? ' rst-drop--sm' : ''}${dragOver ? ' is-over' : ''}`}
        htmlFor={id}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          pick(event.dataTransfer?.files?.[0]);
        }}
      >
        {preview ? <ImagePlus size={compact ? 18 : 20} /> : <Upload size={20} />}
        <Inline className="rst-drop-title">
          {preview ? 'Tap to upload, or drag a photo here' : 'Tap to upload'}
        </Inline>
        {desc && <Inline className="rst-drop-desc">{desc}</Inline>}
        <Input
          id={id}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={(event) => {
            pick(event.target.files?.[0]);
            /* Cleared so that picking the SAME file again still fires a
               change event — an agent who removed a blurred scan and re-took
               it under the same name would otherwise get nothing. */
            event.target.value = '';
          }}
        />
      </label>
    </Box>
  );
}
