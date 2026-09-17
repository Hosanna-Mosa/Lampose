import React from 'react';
import { X, CloudUpload } from 'lucide-react';
import { Box, Image, Inline, Input, Label, PlainButton } from '../../../common/atoms';

export function LayoutPhotos({ details, onChangeDetails, layoutId, layoutLabel }) {
  const allStaged = details.localSharingImages || {};
  const staged = allStaged[layoutId] || [];

  const setStaged = (next) => {
    onChangeDetails('localSharingImages', { ...allStaged, [layoutId]: next });
  };

  const handleFileSelect = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems = Array.from(files).map((file) => ({
      id: `simg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name,
    }));
    /* Cleared so picking the same file(s) again still fires a change. */
    e.target.value = '';
    setStaged([...staged, ...newItems]);
  };

  const handleRemove = (indexToRemove) => {
    const item = staged[indexToRemove];
    if (item?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
    setStaged(staged.filter((_, idx) => idx !== indexToRemove));
  };

  return (
    <Box style={{ marginTop: '12px' }}>
      <Inline style={{ fontSize: '0.75rem', color: '#45855a', fontWeight: 600 }}>
        Photos for {layoutLabel}{' '}
        <Inline style={{ color: '#94a3b8', fontWeight: 500 }}>
          (optional — falls back to the main photos above if left empty)
        </Inline>
      </Inline>

      <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' }}>
        {staged.map((item, idx) => (
          <Box key={item.id} style={{ position: 'relative', width: '64px', height: '64px' }}>
            <Image
              src={item.previewUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }}
            />
            <PlainButton
              type="button"
              onClick={() => handleRemove(idx)}
              title="Remove"
              aria-label={`Remove this photo from ${layoutLabel}`}
              style={{
                position: 'absolute', top: '-6px', right: '-6px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '18px', height: '18px', borderRadius: '50%', border: '1px solid #fff',
                background: '#475569', color: '#fff', cursor: 'pointer', padding: 0,
              }}
            >
              <X size={10} />
            </PlainButton>
          </Box>
        ))}

        <Label
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px',
            width: '64px', height: '64px', borderRadius: '8px',
            border: '1px dashed #94a3b8', color: '#64748b', cursor: 'pointer',
          }}
        >
          <CloudUpload size={16} />
          <Inline style={{ fontSize: '0.62rem', fontWeight: 600 }}>Add</Inline>
          <Input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileSelect} />
        </Label>
      </Box>
    </Box>
  );
}
