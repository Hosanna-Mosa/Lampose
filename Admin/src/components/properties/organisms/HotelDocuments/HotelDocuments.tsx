import React, { useRef, useState } from 'react';
import { CheckCircle2, FileUp, Loader2, Trash2 } from 'lucide-react';
import { Box } from '../../../common/atoms/Box';
import { Inline } from '../../../common/atoms/Inline';
import { Link } from '../../../common/atoms/Link';
import { Option } from '../../../common/atoms/Option';
import { PlainButton } from '../../../common/atoms/PlainButton';
import { PlainInput } from '../../../common/atoms/PlainInput';
import { Select } from '../../../common/atoms/Select';
import { Text } from '../../../common/atoms/Text';
import { propertyService, type PropertyDocument } from '../../../../api/services/propertyService';
import { PREMISES_DOC_TYPES } from '../../../../lib/domain';
import { MAX_FILE_BYTES } from '../../utils/photos';

interface HotelDocumentsProps {
  documents: PropertyDocument[];
  onChange: (documents: PropertyDocument[]) => void;
  onBusyChange?: (busy: boolean) => void;
}

type Kind = 'pan' | 'premises';

const LABEL: Record<Kind, string> = {
  pan: 'Owner or business PAN',
  premises: 'Proof of premises',
};

/**
 * The two documents a hotel is onboarded with: the PAN of whoever is paid,
 * and one document establishing the premises. The server refuses a hotel
 * without both (`DOCUMENTS_REQUIRED`), so this is what lets the console add
 * one at all.
 *
 * Each uploads the moment it is picked, through the route Onboard uses. The
 * links are public-read on Cloudinary — unguessable, not private — so they
 * are opened in a new tab, never previewed inline.
 */
export const HotelDocuments: React.FC<HotelDocumentsProps> = ({ documents, onChange, onBusyChange }) => {
  const [premisesType, setPremisesType] = useState(
    documents.find((d) => d.kind === 'premises')?.docType || PREMISES_DOC_TYPES[0],
  );
  const [uploading, setUploading] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const panRef = useRef<HTMLInputElement>(null);
  const premisesRef = useRef<HTMLInputElement>(null);

  const current = (kind: Kind) => documents.find((d) => d.kind === kind);

  const put = (doc: PropertyDocument) =>
    onChange([...documents.filter((d) => d.kind !== doc.kind), doc]);

  const remove = (kind: Kind) => onChange(documents.filter((d) => d.kind !== kind));

  const upload = async (kind: Kind, file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('Attach a photo or a PDF.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`“${file.name}” is over 15 MB.`);
      return;
    }
    setUploading(kind);
    onBusyChange?.(true);
    const res = await propertyService.uploadDocument(file);
    setUploading(null);
    onBusyChange?.(false);
    if (!res.success || !res.data) {
      setError(res.message || `The ${LABEL[kind].toLowerCase()} did not upload. Try again.`);
      return;
    }
    put({ kind, docType: kind === 'premises' ? premisesType : '', url: res.data, name: file.name });
  };

  const row = (kind: Kind, ref: React.RefObject<HTMLInputElement | null>) => {
    const doc = current(kind);
    const busy = uploading === kind;
    return (
      <Box className="flex items-center gap-3 rounded-control border border-line px-3 py-2.5">
        {doc ? (
          <CheckCircle2 className="size-4 text-good shrink-0" strokeWidth={2} />
        ) : busy ? (
          <Loader2 className="size-4 text-ink-3 animate-spin shrink-0" />
        ) : (
          <FileUp className="size-4 text-ink-3 shrink-0" strokeWidth={1.75} />
        )}
        <Box className="flex-1 min-w-0">
          <Text className="text-sm text-ink">{LABEL[kind]}</Text>
          {doc ? (
            <Link
              href={doc.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-label text-accent underline underline-offset-2 truncate block"
            >
              {doc.name || 'Open document'}
            </Link>
          ) : (
            <Inline className="text-label text-ink-3">{busy ? 'Uploading…' : 'Photo or PDF, up to 15 MB'}</Inline>
          )}
        </Box>
        {doc ? (
          <PlainButton
            type="button"
            onClick={() => remove(kind)}
            aria-label={`Remove ${LABEL[kind]}`}
            className="text-ink-3 hover:text-crit"
          >
            <Trash2 className="size-4" />
          </PlainButton>
        ) : (
          <PlainButton
            type="button"
            disabled={uploading !== null}
            onClick={() => ref.current?.click()}
            className="text-label text-accent font-medium disabled:opacity-40"
          >
            Attach
          </PlainButton>
        )}
        <PlainInput
          ref={ref}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            upload(kind, e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Box>
    );
  };

  return (
    <Box className="space-y-2">
      {row('pan', panRef)}
      <Select
        value={premisesType}
        onChange={(e) => {
          setPremisesType(e.target.value);
          const doc = current('premises');
          if (doc) put({ ...doc, docType: e.target.value });
        }}
        aria-label="Which premises document"
      >
        {PREMISES_DOC_TYPES.map((t) => (
          <Option key={t} value={t}>
            {t}
          </Option>
        ))}
      </Select>
      {row('premises', premisesRef)}
      {error && <Text className="text-label text-crit">{error}</Text>}
    </Box>
  );
};
