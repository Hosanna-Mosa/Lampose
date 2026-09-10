import React from 'react';
import {
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '../../../common/atoms/Button';
import { IconButton } from '../../../common/atoms/IconButton';
import { Input } from '../../../common/atoms/Input';
import { Box } from '../../../common/atoms/Box';
export interface KVRow {
  key: string;
  value: string;
}

/** Generic editor for a schema-less object — every field on `categoryDetails`
 *  the onboarding app might send, without this console having to know its
 *  shape in advance. */
export const KeyValueEditor: React.FC<{ rows: KVRow[]; onChange: (rows: KVRow[]) => void }> = ({ rows, onChange }) => {
  const update = (i: number, patch: Partial<KVRow>) =>
    onChange(rows.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  return (
    <Box className="space-y-2">
      {rows.map((row, i) => (
        <Box key={i} className="flex items-center gap-2">
          <Input
            placeholder="key"
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
            className="w-2/5 font-mono text-sm"
          />
          <Input
            placeholder="value"
            value={row.value}
            onChange={(e) => update(i, { value: e.target.value })}
            className="flex-1 font-mono text-sm"
          />
          <IconButton icon={Trash2} label={`Remove ${row.key || 'field'}`} tone="danger" onClick={() => remove(i)} />
        </Box>
      ))}
      <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...rows, { key: '', value: '' }])}>
        Add field
      </Button>
    </Box>
  );
};
