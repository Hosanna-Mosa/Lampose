/* ══════════════════════════════════════════════════════════════════════════
   The menu sheet — many dishes at once, from an Excel file.

   The Food-Partner app's flow, in a browser, against the same server route:

     1. Choose a sheet (download the current menu or the empty template first).
     2. It is DRY-RUN: the server checks every row and writes nothing. Any bad
        row refuses the whole sheet, and every row's problems are listed.
     3. Each NEW dish needs its photo — the server's rule, not this page's —
        so one is chosen per new row before the sheet can be applied.
     4. Applied. Rows with a Product ID edit that dish; rows without one add
        a dish; a dish missing from the sheet is left alone.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, ImageOff, Upload } from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Image } from '../../components/common/atoms/Image';
import { Inline } from '../../components/common/atoms/Inline';
import { PlainInput } from '../../components/common/atoms/PlainInput';
import { Text } from '../../components/common/atoms/Text';
import { Modal } from '../../components/common/organisms/Modal';
import type {
  MenuItem,
  MenuService,
  SheetResult,
  SheetRow,
  SheetRowProblem,
  UploadedImage,
} from '../../api/services/restaurantAdminService';
import { downloadMenuWorkbook, menuFileName, readMenuWorkbook } from '../../lib/menuWorkbook';

interface MenuSheetModalProps {
  open: boolean;
  onClose: () => void;
  service: MenuService;
  /** The menu as it stands, for "Download current menu". */
  items: MenuItem[];
  restaurantName?: string;
  /** After a sheet is applied, with the sentence to show. */
  onApplied: (message: string) => void;
}

type Step =
  | { kind: 'pick' }
  | { kind: 'invalid'; message: string; rows: SheetRowProblem[] }
  | { kind: 'review'; fileName: string; rows: SheetRow[]; result: SheetResult }
  | { kind: 'partial'; failed: { row: number; message: string }[] };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The SHEET_INVALID body's per-row list, read without trusting it. */
const rowProblemsOf = (body: unknown): SheetRowProblem[] => {
  const rows = body && typeof body === 'object' ? (body as { rows?: unknown }).rows : undefined;
  return Array.isArray(rows) ? (rows as SheetRowProblem[]) : [];
};

export const MenuSheetModal: React.FC<MenuSheetModalProps> = ({
  open,
  onClose,
  service,
  items,
  restaurantName,
  onApplied,
}) => {
  const [step, setStep] = useState<Step>({ kind: 'pick' });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* Photos for new dishes, by sheet row number. */
  const [photos, setPhotos] = useState<Record<number, UploadedImage>>({});
  const [uploadingRow, setUploadingRow] = useState<number | null>(null);
  const sheetInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoFor = useRef<number | null>(null);

  const reset = () => {
    setStep({ kind: 'pick' });
    setPhotos({});
    setError(null);
    setBusy(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const download = async (withDishes: boolean) => {
    setError(null);
    try {
      await downloadMenuWorkbook(withDishes ? items : [], menuFileName(restaurantName));
    } catch {
      setError('The sheet could not be created in this browser.');
    }
  };

  const check = async (file: File | undefined) => {
    if (!file || !service.bulk) return;
    setError(null);
    setPhotos({});
    setBusy('Checking the sheet…');
    let rows: SheetRow[];
    try {
      rows = await readMenuWorkbook(file);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'That file could not be read.');
      return;
    }
    const res = await service.bulk(rows, true);
    setBusy(null);
    if (res.success && res.data) {
      setStep({ kind: 'review', fileName: file.name, rows, result: res.data });
      return;
    }
    const problems = rowProblemsOf(res.errorBody);
    if (problems.length) {
      setStep({ kind: 'invalid', message: res.message || 'Nothing was saved.', rows: problems });
    } else {
      setError(res.message || 'The sheet could not be checked.');
    }
  };

  const pickPhoto = async (file: File | undefined) => {
    const row = photoFor.current;
    if (!file || row === null || !service.uploadImages) return;
    setError(null);
    setUploadingRow(row);
    const res = await service.uploadImages([file]);
    setUploadingRow(null);
    const uploaded = res.success ? res.data[0] : undefined;
    if (uploaded?.url) setPhotos((prev) => ({ ...prev, [row]: uploaded }));
    else setError(res.message || 'That photo could not be uploaded.');
  };

  const apply = async () => {
    if (step.kind !== 'review' || !service.bulk) return;
    setError(null);
    setBusy('Saving the menu…');
    const rows = step.rows.map((row) =>
      photos[row.row] && !row.productId ? { ...row, productImage: photos[row.row] } : row
    );
    const res = await service.bulk(rows, false);
    setBusy(null);

    const data = res.data;
    if (data && (data.created || data.updated || res.success)) {
      const parts = [
        data.created ? `${plural(data.created, 'dish', 'dishes')} added` : '',
        data.updated ? `${plural(data.updated, 'dish', 'dishes')} updated` : '',
      ].filter(Boolean);
      onApplied(parts.length ? `${parts.join(', ')}.` : 'Nothing on the sheet changed the menu.');
    }
    /* Checked before success: a sheet where some rows did not save is
       answered 200 with `success: false` and the rows in `failed`. */
    if (data?.failed?.length) {
      setStep({ kind: 'partial', failed: data.failed });
      return;
    }
    if (res.success) {
      reset();
      onClose();
      return;
    }
    const problems = rowProblemsOf(res.errorBody);
    if (problems.length) {
      setStep({ kind: 'invalid', message: res.message || 'Nothing was saved.', rows: problems });
    } else {
      setError(res.message || 'The sheet could not be saved.');
    }
  };

  /* ── What the review step needs ─────────────────────────────────────── */
  const review = step.kind === 'review' ? step : null;
  const newRows = review
    ? review.rows.filter((row) =>
        (review.result.plan ?? []).some((p) => p.row === row.row && p.kind === 'create')
      )
    : [];
  const missingPhotos = newRows.filter((row) => !photos[row.row]).length;
  const nothingToDo = review ? !review.result.created && !review.result.updated : false;

  const footer =
    step.kind === 'review' ? (
      <>
        <Button variant="secondary" onClick={reset} disabled={Boolean(busy)}>
          Choose another file
        </Button>
        <Button
          variant="primary"
          icon={CheckCircle2}
          loading={busy !== null}
          disabled={nothingToDo || missingPhotos > 0 || uploadingRow !== null}
          onClick={apply}
        >
          Apply to menu
        </Button>
      </>
    ) : step.kind === 'pick' ? (
      <Button variant="secondary" onClick={close} disabled={Boolean(busy)}>
        Cancel
      </Button>
    ) : (
      <>
        <Button variant="secondary" onClick={close}>
          Close
        </Button>
        <Button variant="primary" icon={FileSpreadsheet} onClick={reset}>
          Upload a fixed sheet
        </Button>
      </>
    );

  return (
    <Modal
      open={open}
      onClose={close}
      title="Bulk upload from Excel"
      description="Rows with a Product ID edit that dish; rows without one add a new dish. Nothing is ever deleted by a sheet."
      size="lg"
      footer={footer}
    >
      <Box className="space-y-4">
        {error && (
          <Box
            role="alert"
            className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border"
          >
            <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
            <Text className="text-sm text-ink-2">{error}</Text>
          </Box>
        )}

        <PlainInput
          ref={sheetInput}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void check(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <PlainInput
          ref={photoInput}
          type="file"
          accept="image/*"
          className="hidden"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pickPhoto(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {step.kind === 'pick' && (
          <>
            <Box className="rounded-panel border border-line p-4 space-y-3">
              <Text className="text-sm font-medium text-ink">1. Get the sheet</Text>
              <Text className="text-label text-ink-3">
                The same sheet the Food Partner app uses. Download the current menu to edit it, or the empty
                template to start one. The Instructions tab explains every column.
              </Text>
              <Box className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Download}
                  onClick={() => download(true)}
                  disabled={!items.length}
                >
                  Current menu ({items.length})
                </Button>
                <Button size="sm" variant="secondary" icon={Download} onClick={() => download(false)}>
                  Empty template
                </Button>
              </Box>
            </Box>
            <Box className="rounded-panel border border-line p-4 space-y-3">
              <Text className="text-sm font-medium text-ink">2. Upload it</Text>
              <Text className="text-label text-ink-3">
                It is checked first and nothing is saved until you confirm. New dishes then each need a photo.
              </Text>
              <Button
                size="sm"
                variant="primary"
                icon={Upload}
                loading={busy !== null}
                onClick={() => sheetInput.current?.click()}
              >
                {busy ?? 'Choose .xlsx file'}
              </Button>
            </Box>
          </>
        )}

        {step.kind === 'invalid' && (
          <>
            <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-crit-soft border border-crit-border">
              <AlertCircle className="size-4 text-crit shrink-0 mt-0.5" strokeWidth={2} />
              <Text className="text-sm text-ink-2">
                {step.message} Fix these in the sheet and upload it again.
              </Text>
            </Box>
            <Box className="max-h-80 overflow-y-auto divide-y divide-line rounded-panel border border-line">
              {step.rows.map((entry, index) => (
                <Box key={`${entry.row ?? 'sheet'}-${index}`} className="p-3">
                  <Text className="text-micro uppercase text-ink-3 mb-1">
                    {entry.row === null ? 'Whole sheet' : `Row ${entry.row}`}
                  </Text>
                  {entry.problems.map((problem, i) => (
                    <Text key={i} className="text-sm text-ink-2">
                      {problem.message}
                    </Text>
                  ))}
                </Box>
              ))}
            </Box>
          </>
        )}

        {review && (
          <>
            <Box className="flex flex-wrap items-center gap-2">
              <Inline className="text-label text-ink-3">{review.fileName}</Inline>
              <Badge tone="good">{review.result.created} new</Badge>
              <Badge tone="warn">{review.result.updated} edited</Badge>
              <Badge tone="neutral">{review.result.unchanged} unchanged</Badge>
            </Box>

            {nothingToDo && (
              <Text className="text-sm text-ink-2">
                Every row matches the menu as it is — there is nothing to apply.
              </Text>
            )}

            {newRows.length > 0 && (
              <Box className="space-y-2">
                <Text className="text-sm text-ink-2">
                  {missingPhotos
                    ? `Add a photo for each new dish (${plural(missingPhotos, 'photo')} still needed).`
                    : 'Every new dish has its photo.'}
                </Text>
                <Box className="max-h-80 overflow-y-auto divide-y divide-line rounded-panel border border-line">
                  {newRows.map((row) => {
                    const photo = photos[row.row];
                    return (
                      <Box key={row.row} className="flex items-center gap-3 p-3">
                        {photo ? (
                          <Image
                            src={photo.url}
                            alt=""
                            className="size-10 rounded-control object-cover border border-line shrink-0"
                          />
                        ) : (
                          <Inline className="grid place-items-center size-10 rounded-control bg-surface-inset text-ink-3 shrink-0">
                            <ImageOff className="size-4" strokeWidth={1.75} />
                          </Inline>
                        )}
                        <Box className="min-w-0 flex-1">
                          <Text className="text-sm font-medium text-ink truncate">{String(row.productName)}</Text>
                          <Text className="text-label text-ink-3 truncate">
                            Row {row.row} · {String(row.category)}
                          </Text>
                        </Box>
                        <Button
                          size="sm"
                          variant={photo ? 'ghost' : 'secondary'}
                          icon={Upload}
                          loading={uploadingRow === row.row}
                          disabled={uploadingRow !== null && uploadingRow !== row.row}
                          onClick={() => {
                            photoFor.current = row.row;
                            photoInput.current?.click();
                          }}
                        >
                          {photo ? 'Change' : 'Add photo'}
                        </Button>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            )}
          </>
        )}

        {step.kind === 'partial' && (
          <>
            <Box className="flex items-start gap-2.5 p-3 rounded-panel bg-warn-soft border border-warn-border">
              <AlertCircle className="size-4 text-warn shrink-0 mt-0.5" strokeWidth={2} />
              <Text className="text-sm text-ink-2">
                The rest of the sheet was saved, but {plural(step.failed.length, 'row')} could not be.
                Download the current menu to see what was saved, then upload just these rows again.
              </Text>
            </Box>
            <Box className="divide-y divide-line rounded-panel border border-line">
              {step.failed.map((entry) => (
                <Box key={entry.row} className="p-3">
                  <Text className="text-micro uppercase text-ink-3 mb-1">Row {entry.row}</Text>
                  <Text className="text-sm text-ink-2">{entry.message}</Text>
                </Box>
              ))}
            </Box>
          </>
        )}
      </Box>
    </Modal>
  );
};
