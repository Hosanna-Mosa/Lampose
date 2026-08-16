import React, { useState } from 'react';
import { cx } from '../ui';
import { initials } from '../../lib/format';

/** Stock-photo URLs seeded into older admin records — never a real person's
 *  picture, so they are treated as absent and the initials are shown instead. */
const PLACEHOLDER_HOSTS = ['images.unsplash.com', 'i.pravatar.cc', 'placehold.co', 'via.placeholder.com'];

const isPlaceholder = (src?: string): boolean => {
  if (!src) return true;
  try {
    return PLACEHOLDER_HOSTS.includes(new URL(src).hostname);
  } catch {
    return true;
  }
};

/** Stable tint per account so avatars stay recognisable between renders. */
const TINTS = [
  'bg-brand-soft text-brand-ink',
  'bg-good-soft text-good',
  'bg-warn-soft text-warn',
  'bg-crit-soft text-crit',
  'bg-neutral-soft text-ink-2',
];

const tintFor = (seed: string): string => {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
};

interface AvatarProps {
  name?: string;
  src?: string;
  size?: number;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ name, src, size = 32, className }) => {
  const [failed, setFailed] = useState(false);
  const showImage = !isPlaceholder(src) && !failed;

  if (showImage) {
    return (
      <img
        src={src}
        alt={name || 'Account'}
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className={cx('rounded-full object-cover shrink-0 ring-1 ring-line', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className={cx(
        'grid place-items-center rounded-full shrink-0 font-medium select-none',
        tintFor(name || '?'),
        className
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.36)) }}
    >
      {initials(name)}
    </span>
  );
};
