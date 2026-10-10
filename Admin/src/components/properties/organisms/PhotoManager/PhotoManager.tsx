/**
 * Lampose Admin — a listing's photos, edited in a form.
 *
 * Add (pick or drop files; they upload to Cloudinary straight away), reorder,
 * make one the cover, remove. The FIRST photo is the cover: it is what the
 * listing card shows, and the backend keeps `imageUrl` equal to it.
 *
 * Nothing here touches the listing. The component holds a list of links and
 * hands every change to `onChange`; the listing changes when the form around
 * it is saved, so Cancel really does leave the photos as they were. A file
 * that uploaded and was then removed before saving stays in Cloudinary — the
 * same as the Onboard app, and harmless.
 *
 * The limit and the size cap mirror `property.routes.v1.js`
 * (`MAX_PROPERTY_IMAGES`, multer's 15 MB) so a refusal happens here, with a
 * sentence, rather than as a failed save.
 */
import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImageOff, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import { cx } from '../../../common/utils';
import { Box } from '../../../common/atoms/Box';
import { Image } from '../../../common/atoms/Image';
import { Inline } from '../../../common/atoms/Inline';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { PlainInput } from '../../../common/atoms/PlainInput';
import { Text } from '../../../common/atoms/Text';
import { propertyService } from '../../../../api/services/propertyService';
import { MAX_FILE_BYTES, MAX_PROPERTY_PHOTOS } from '../../utils/photos';

interface PhotoManagerProps {
  images: string[];
  onChange: (images: string[]) => void;
  /** True while files are uploading — the form should not save mid-upload. */
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}

const tileButton =
  'inline-grid place-items-center size-7 rounded-control bg-surface/90 text-ink-2 border border-line hover:text-ink hover:bg-surface disabled:opacity-40 disabled:pointer-events-none';

const PhotoTile: React.FC<{ url: string }> = ({ url }) => {
  const [failed, setFailed] = useState(false);
  if (failed || url.startsWith('/')) {
    return (
      <Box className="absolute inset-0 grid place-items-center bg-surface-inset text-ink-3">
        <ImageOff className="size-5" strokeWidth={1.5} />
      </Box>
    );
  }
  return (
    <Image
      src={url}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-cover bg-surface-inset"
    />
  );
};

export const PhotoManager: React.FC<PhotoManagerProps> = ({ images, onChange, onBusyChange, disabled }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const room = MAX_PROPERTY_PHOTOS - images.length;
  const busy = uploading > 0;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    const next = [...images];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const remove = (index: number) => onChange(images.filter((_, i) => i !== index));

  const add = async (picked: File[]) => {
    setError(null);
    const notes: string[] = [];

    let files = picked.filter((f) => f.type.startsWith('image/'));
    if (files.length < picked.length) notes.push('Only image files can be added.');

    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) {
      notes.push(`${tooBig.length === 1 ? `“${tooBig[0].name}” is` : `${tooBig.length} files are`} over 15 MB.`);
      files = files.filter((f) => f.size <= MAX_FILE_BYTES);
    }

    if (files.length > room) {
      notes.push(`A listing holds ${MAX_PROPERTY_PHOTOS} photos — only the first ${Math.max(room, 0)} were added.`);
      files = files.slice(0, Math.max(room, 0));
    }

    if (!files.length) {
      setError(notes.join(' ') || null);
      return;
    }

    setUploading(files.length);
    onBusyChange?.(true);
    const res = await propertyService.uploadImages(files);
    setUploading(0);
    onBusyChange?.(false);

    if (!res.success || !res.data.length) {
      notes.push(res.message || 'The photos did not upload. Try again.');
    } else {
      onChange([...images, ...res.data].slice(0, MAX_PROPERTY_PHOTOS));
    }
    setError(notes.join(' ') || null);
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    /* Cleared so picking the same file again still fires a change. */
    e.target.value = '';
    if (files.length) void add(files);
  };

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || busy || room <= 0) return;
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void add(files);
  };

  const canAdd = !disabled && !busy && room > 0;

  return (
    <Box className="space-y-2">
      <Box
        className={cx('grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-control', dragging && 'ring-2 ring-brand')}
        onDragOver={(e) => {
          if (!canAdd) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        {images.map((url, i) => (
          <Box
            key={`${url}-${i}`}
            className="group relative aspect-[4/3] overflow-hidden rounded-control border border-line bg-surface-inset"
          >
            <PhotoTile url={url} />

            {i === 0 && (
              <Inline className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-brand px-1.5 py-0.5 text-label text-white">
                <Star className="size-3" strokeWidth={2} />
                Cover
              </Inline>
            )}

            <Box className="absolute inset-x-1.5 bottom-1.5 flex items-center justify-between gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
              <Box className="flex gap-1">
                <PlainButton
                  type="button"
                  className={tileButton}
                  aria-label={`Move photo ${i + 1} earlier`}
                  title="Move earlier"
                  disabled={disabled || i === 0}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowLeft className="size-3.5" />
                </PlainButton>
                <PlainButton
                  type="button"
                  className={tileButton}
                  aria-label={`Move photo ${i + 1} later`}
                  title="Move later"
                  disabled={disabled || i === images.length - 1}
                  onClick={() => move(i, i + 1)}
                >
                  <ArrowRight className="size-3.5" />
                </PlainButton>
                {i > 0 && (
                  <PlainButton
                    type="button"
                    className={tileButton}
                    aria-label={`Make photo ${i + 1} the cover`}
                    title="Make cover"
                    disabled={disabled}
                    onClick={() => move(i, 0)}
                  >
                    <Star className="size-3.5" />
                  </PlainButton>
                )}
              </Box>
              <PlainButton
                type="button"
                className={cx(tileButton, 'hover:text-crit')}
                aria-label={`Remove photo ${i + 1}`}
                title="Remove"
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-3.5" />
              </PlainButton>
            </Box>
          </Box>
        ))}

        {Array.from({ length: uploading }, (_, i) => (
          <Box
            key={`uploading-${i}`}
            className="aspect-[4/3] grid place-items-center rounded-control border border-dashed border-line bg-surface-inset text-ink-3"
          >
            <Loader2 className="size-5 animate-spin" />
          </Box>
        ))}

        {room - uploading > 0 && (
          <PlainButton
            type="button"
            disabled={!canAdd}
            onClick={() => inputRef.current?.click()}
            className="aspect-[4/3] flex flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong text-ink-2 hover:bg-surface-inset hover:text-ink disabled:opacity-50 disabled:pointer-events-none"
          >
            <ImagePlus className="size-5" strokeWidth={1.75} />
            <Inline className="text-label">Add photos</Inline>
            <Inline className="text-label text-ink-3">or drop them here</Inline>
          </PlainButton>
        )}
      </Box>

      <PlainInput
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={pick}
        tabIndex={-1}
        aria-hidden
      />

      <Text className="text-label text-ink-3">
        {images.length} of {MAX_PROPERTY_PHOTOS} photos · the first is the cover · JPG, PNG or WebP up to 15 MB each.
        {busy && ' Uploading…'}
      </Text>
      {error && <Text className="text-label text-crit">{error}</Text>}
    </Box>
  );
};
