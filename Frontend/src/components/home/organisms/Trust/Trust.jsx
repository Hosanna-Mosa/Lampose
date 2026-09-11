import React from 'react';
import { useTickerLean, useBandReveal } from '../../../../hooks/useSite';
import { ROWS } from '../../utils/trustRows';
import { Row } from '../../molecules/Row/Row';
import { Box } from '../../../common/atoms';

export const Trust = ({ row = 'claims' }) => {
  const lean = useTickerLean();
  const { items, dir } = ROWS[row] || ROWS.claims;
  useBandReveal(lean);

  return (
    <Box className={`trustband trustband--${row}`} ref={lean} aria-hidden="true">
      <Row items={items} dir={dir} />
    </Box>
  );
};
