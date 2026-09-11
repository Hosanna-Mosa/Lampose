import React from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Note } from '../../atoms/Note/Note';
import { Box, Inline, Input, Label, PlainButton, Strong, Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, Text } from '../../../common/atoms';

export function MenuSheetTable({ rows, onImage }) {
  const withImage = rows.filter(row => row.image).length;

  return (
    <Box className="ob-table">
      <Box className="ob-table__head">
        <Box>
          <Strong>Item photos</Strong>
          <Text className="ob-hint">{withImage} of {rows.length} added</Text>
        </Box>
        <Inline className="ob-count">Required</Inline>
      </Box>

      <Box className="ob-table__scroll">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Category</TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell>Price</TableHeaderCell>
              <TableHeaderCell>Type</TableHeaderCell>
              <TableHeaderCell>Photo</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell>{row.category || '—'}</TableCell>
                <TableCell className="ob-table__name">{row.itemName || '—'}</TableCell>
                <TableCell>{row.price || '—'}</TableCell>
                <TableCell>{row.type || '—'}</TableCell>
                <TableCell>
                  {row.image ? (
                    <Inline className="ob-photo ob-photo--sm">
                      <Icon name="image" className="ob-ico" />
                      <Inline>{row.image.name}</Inline>
                      <PlainButton
                        type="button" className="ob-x" onClick={() => onImage(row.id, null)}
                        aria-label={`Remove the photo for ${row.itemName || 'this item'}`}
                      >
                        <Icon name="close" className="ob-ico" />
                      </PlainButton>
                    </Inline>
                  ) : (
                    <Label className="ob-ghost ob-ghost--sm">
                      <Icon name="image" className="ob-ico" />
                      Add photo
                      <Input
                        type="file" accept="image/*" className="ob-file"
                        onChange={e => onImage(row.id, e.target.files?.[0] || null)}
                      />
                    </Label>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {withImage < rows.length && (
        <Box className="ob-table__foot">
          <Note tone="warn" icon="alert">
            Every item needs a photo before this step can be finished.
          </Note>
        </Box>
      )}
    </Box>
  );
}
