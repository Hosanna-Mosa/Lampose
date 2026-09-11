import React from 'react';
import { useCursor } from '../../../../hooks/useSite';
import { Box } from '..';

export function Cursor() {
  const { dot, ring } = useCursor();
  return (
    <>
      <Box id="cursor" ref={dot} aria-hidden="true" />
      <Box id="cursor-ring" ref={ring} aria-hidden="true" />
    </>
  );
}
