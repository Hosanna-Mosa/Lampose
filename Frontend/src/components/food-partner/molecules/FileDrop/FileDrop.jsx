import React from 'react';
import { useState } from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { sampleFileFor } from '../../utils/sampleFile';
import { Box, Inline, Input, Label, PlainButton, Strong, Text } from '../../../common/atoms';

/* Nothing is uploaded from this form yet — only the file's name travels with
   the application — so the sample buttons let the whole flow be walked
   end to end without hunting for a PDF of a licence. */

export function FileDrop({ label, desc, file, onChange, accept = '.pdf,.jpg,.jpeg,.png' }) {
  const [over, setOver] = useState(false);
  const inputId = `ob-file-${label.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (file) {
    return (
      <Box className="ob-drop is-set">
        <Icon name="doc" className="ob-ico" />
        <Box className="ob-drop__meta">
          <Strong>{file.name}</Strong>
          <Inline>{(file.size / 1024).toFixed(0)} KB</Inline>
        </Box>
        <PlainButton
          type="button" className="ob-x" onClick={() => onChange(null)}
          aria-label={`Remove ${file.name}`}
        >
          <Icon name="close" className="ob-ico" />
        </PlainButton>
      </Box>
    );
  }

  return (
    <Box
      className={`ob-drop${over ? ' is-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onChange(dropped);
      }}
    >
      <Input
        type="file" id={inputId} accept={accept} className="ob-file"
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
      <Inline className="ob-drop__ico"><Icon name="upload" className="ob-ico" /></Inline>
      <Strong>{label}</Strong>
      {desc && <Text>{desc}</Text>}
      <Box className="ob-drop__acts">
        <Label htmlFor={inputId} className="ob-drop__pick">
          <Inline>Choose a file</Inline> or drag it here
        </Label>
        <PlainButton
          type="button" className="ob-ghost ob-ghost--sm"
          onClick={() => onChange(sampleFileFor(label, accept))}
        >
          <Icon name="sparkle" className="ob-ico" />
          Use a sample
        </PlainButton>
      </Box>
      <Text className="ob-drop__types">
        {accept.includes('.xlsx') ? 'CSV or XLSX, up to 10MB' : 'PDF, JPG or PNG, up to 10MB'}
      </Text>
    </Box>
  );
}
