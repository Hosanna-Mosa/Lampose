/**
 * Chart primitives — plain SVG, no chart library.
 *
 * Conventions held across every chart here:
 *  · One measure per chart, one axis. Never two y-scales.
 *  · Single-series charts use one hue and carry no legend — the title names it.
 *  · Marks are thin, capped, with a 4px rounded data-end and a square baseline.
 *  · Grid/axis lines are hairline and recessive; text never wears the data colour.
 *  · Every chart ships a hover layer and a screen-reader table of the same values.
 */
import React from 'react';
import type { Datum } from '../../utils/chartTypes';
import { Caption, PlainTable, PlainTd, PlainTh, PlainTr, TableBody } from '../../atoms/PlainTable';

/** Off-screen table so the values are never gated behind hover or colour. */
export const DataTable: React.FC<{ caption: string; data: Datum[]; unit?: string }> = ({
  caption,
  data,
  unit = '',
}) => (
  <PlainTable className="sr-only">
    <Caption>{caption}</Caption>
    <TableBody>
      {data.map((d) => (
        <PlainTr key={d.label}>
          <PlainTh scope="row">{d.label}</PlainTh>
          <PlainTd>
            {d.value.toLocaleString('en-IN')}
            {unit}
          </PlainTd>
        </PlainTr>
      ))}
    </TableBody>
  </PlainTable>
);
