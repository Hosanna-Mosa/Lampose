import React, { useState } from 'react';
import { CheckCircle2, Upload, X } from 'lucide-react';
import { Box, Inline, Input, Text } from '../../../common/atoms';

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
 */
export function FileDrop({
  label,
  desc,
  file,
  onChange,
  accept = 'image/*,.pdf',
  id,
}) {
  const [dragOver, setDragOver] = useState(false);

  const pick = (picked) => {
    if (picked) onChange(picked);
  };

  if (file) {
    return (
      <Box id={id ? `${id}-field` : undefined} tabIndex={-1}>
        {label && <Text className="rst-label">{label}</Text>}
        <Box className="rst-file">
          <CheckCircle2 size={17} color="#45855a" />
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
        className={`rst-drop${dragOver ? ' is-over' : ''}`}
        htmlFor={id}
        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          pick(event.dataTransfer?.files?.[0]);
        }}
      >
        <Upload size={20} />
        <Inline className="rst-drop-title">Tap to upload</Inline>
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
