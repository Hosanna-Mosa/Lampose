import React from 'react';
import {
  Phone,
} from 'lucide-react';
import { Inline } from '../../../common/atoms/Inline';
import { Link } from '../../../common/atoms/Link';


/** A number nobody has to copy out by hand. */
export const PhoneLink: React.FC<{ phone: string }> = ({ phone }) => {
  if (!phone) return <Inline className="text-ink-3">no number</Inline>;
  return (
    <Link
      href={`tel:${phone}`}
      className="inline-flex items-center gap-1 font-mono tabular text-brand-ink hover:underline"
    >
      <Phone className="size-3" aria-hidden />
      {phone}
    </Link>
  );
};

