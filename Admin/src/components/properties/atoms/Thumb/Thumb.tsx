import React, { useState } from 'react';
import {
  ImageOff,
} from 'lucide-react';
import { cx } from '../../../common/utils';
import type { PropertyEntity } from '../../../../api/types';
import { Box } from '../../../common/atoms/Box';
import { Image } from '../../../common/atoms/Image';

/** Listing thumbnail, falling back to a neutral placeholder when the record has
 *  no image or the Cloudinary URL fails to load. */
export const Thumb: React.FC<{ property: PropertyEntity; className?: string }> = ({ property, className }) => {
  const [failed, setFailed] = useState(false);
  const src = property.imageUrl;
  const usable = src && !failed && !src.startsWith('/');

  if (!usable) {
    return (
      <Box className={cx('grid place-items-center bg-surface-inset text-ink-3', className)}>
        <ImageOff className="size-5" strokeWidth={1.5} />
      </Box>
    );
  }

  return (
    <Image
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cx('object-cover bg-surface-inset', className)}
    />
  );
};

/* ── Category details ─────────────────────────────────────────────────────
   `categoryDetails` is `Mixed` in property.model.js — its shape depends on
   `category` and isn't validated, so it's read and edited generically rather
   than through a form that would have to guess a schema. The known keys
   (documented in Backend/src/modules/listings/sharing.util.js) get a
   friendly label and layout below; anything else still shows, just less
   dressed up, so nothing the onboarding app sends is ever hidden. */
