/* ══════════════════════════════════════════════════════════════════════════
   Menu → Bulk upload — many dishes from one Excel sheet, each with its photo.

   "Add Dish" on the Menu tab is still the one-dish form; this is the screen
   beside it, behind its own "Bulk Upload" button.

     1  Download   the sheet: the whole menu, or the empty template when there
                   are no dishes yet (GET /me/products → .xlsx → share sheet).
     2  Upload     the filled-in .xlsx is read on the phone and CHECKED by the
                   server with `dryRun` — nothing is saved, and every bad row
                   is listed by its Excel row number.
     3  Photos     every NEW dish in the sheet needs its photo, taken or picked
                   through the same sheet as the single-dish form. Save stays
                   off until each one has it, and the server refuses a new dish
                   without one too.
     4  Save       the photos are uploaded, then the sheet is applied.

   A row with a Product ID edits that dish, a row without one adds a dish, and
   nothing is ever deleted by a sheet — see `lib/menuWorkbook.ts` and
   `bulkUpsertProducts` on the server. Dishes already on the menu keep the
   photos they have.
   ══════════════════════════════════════════════════════════════════════════ */
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useMemo, useState } from "react";
import { Image, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  ActionTile,
  Button,
  Card,
  Header,
  InfoNote,
  ListGroup,
  ScreenShell,
  Txt,
  VegMarker,
  usePhotoPicker,
} from "@/components/ui";
import { rupees } from "@/lib/money";
import {
  MENU_SHEET_COLUMNS,
  XLSX_MIME,
  buildMenuWorkbook,
  menuFileName,
  readMenuWorkbook,
  type SheetRow,
} from "@/lib/menuWorkbook";
import {
  listMyProducts,
  uploadMenuSheet,
  type SheetRowProblem,
  type SheetSummary,
} from "@/services/foodPartner";
import { uploadOne } from "@/services/uploads";
import { usePartnerStore, type Attachment } from "@/store/partnerStore";
import { font, line, radius, size, ui } from "@/theme/ui";

type Checked =
  | { kind: "ready"; fileName: string; rows: SheetRow[]; summary: SheetSummary; newRows: SheetRow[] }
  | { kind: "invalid"; fileName: string; message: string; rows: SheetRowProblem[] };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const describe = (summary: SheetSummary) =>
  [
    summary.created ? plural(summary.created, "new dish", "new dishes") : "",
    summary.updated ? plural(summary.updated, "dish", "dishes") + " edited" : "",
    summary.unchanged ? `${summary.unchanged} unchanged` : "",
  ]
    .filter(Boolean)
    .join(" · ") || "No changes";

const dietOf = (value: unknown): "veg" | "non-veg" | "egg" => {
  const text = String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (text === "egg") return "egg";
  if (text.startsWith("non")) return "non-veg";
  return "veg";
};

export function MenuSheetScreen() {
  const insets = useSafeAreaInsets();
  const session = usePartnerStore((s) => s.session);
  const picker = usePhotoPicker();

  const [exporting, setExporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [checked, setChecked] = useState<Checked | null>(null);
  /* Each new dish's photo, by its sheet row. An uploaded one carries its
     `url`, so a save that failed half way does not upload it again. */
  const [photos, setPhotos] = useState<Record<number, Attachment>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const newRows = checked?.kind === "ready" ? checked.newRows : [];
  const photographed = newRows.filter((row) => photos[row.row]).length;
  const missingPhotos = newRows.length - photographed;
  const nothingToSave = checked?.kind === "ready" && checked.summary.created + checked.summary.updated === 0;

  const download = async () => {
    if (!session?.token || exporting) return;
    setError("");
    setDone("");
    setExporting(true);
    try {
      const products = await listMyProducts(session.token);
      const file = new File(Paths.cache, menuFileName(session.restaurantName));
      if (file.exists) file.delete();
      file.create();
      file.write(buildMenuWorkbook(products));

      if (!(await Sharing.isAvailableAsync())) {
        throw new Error("This phone cannot share files from the app.");
      }
      await Sharing.shareAsync(file.uri, {
        mimeType: XLSX_MIME,
        UTI: "org.openxmlformats.spreadsheetml.sheet",
        dialogTitle: "Save or send your menu sheet",
      });
    } catch (err) {
      setError((err as Error)?.message || "The menu sheet could not be made.");
    } finally {
      setExporting(false);
    }
  };

  const pick = async () => {
    if (!session?.token || checking || saving) return;
    setError("");
    setDone("");
    setChecked(null);
    setPhotos({});
    try {
      const result = await DocumentPicker.getDocumentAsync({
        /* Some Android file managers label an .xlsx as a zip or as nothing at
           all, so the last entry lets one through; the reader refuses
           anything that is not a spreadsheet. */
        type: [XLSX_MIME, "application/vnd.ms-excel", "text/csv", "text/comma-separated-values", "*/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];

      setChecking(true);
      const rows = readMenuWorkbook(await new File(asset.uri).bytes());
      const answer = await uploadMenuSheet(session.token, rows, true);
      if (!answer.ok) {
        setChecked({ kind: "invalid", fileName: asset.name, message: answer.message, rows: answer.rows });
        return;
      }
      const creating = new Set(answer.plan.filter((entry) => entry.kind === "create").map((entry) => entry.row));
      setChecked({
        kind: "ready",
        fileName: asset.name,
        rows,
        summary: answer.summary,
        newRows: rows.filter((row) => creating.has(row.row)),
      });
    } catch (err) {
      setError((err as Error)?.message || "That sheet could not be read.");
    } finally {
      setChecking(false);
    }
  };

  const takePhoto = (row: SheetRow) =>
    picker.open({
      title: `Photo of ${String(row.productName || "the dish")}`,
      aspect: [16, 9],
      onPicked: ([photo]) => {
        if (photo) setPhotos((current) => ({ ...current, [row.row]: photo }));
      },
    });

  const save = async () => {
    if (!session?.token || checked?.kind !== "ready" || saving || missingPhotos > 0) return;
    setError("");
    setSaving(true);
    try {
      /* Photos first, one at a time, kept as they land. */
      const uploaded: Record<number, Attachment> = { ...photos };
      let index = 0;
      for (const row of checked.newRows) {
        index += 1;
        setProgress(`Uploading photo ${index} of ${checked.newRows.length}…`);
        uploaded[row.row] = await uploadOne(uploaded[row.row], "product", session.token);
        setPhotos((current) => ({ ...current, [row.row]: uploaded[row.row] }));
      }

      setProgress("Saving to your menu…");
      const rows = checked.rows.map((row) => {
        const photo = uploaded[row.row];
        return photo?.url ? { ...row, productImage: { url: photo.url, publicId: photo.publicId ?? "" } } : row;
      });
      const answer = await uploadMenuSheet(session.token, rows, false);
      if (!answer.ok) {
        /* The menu changed between the check and Save (another phone, the
           web console). Show the new problems rather than half an answer. */
        setChecked({ kind: "invalid", fileName: checked.fileName, message: answer.message, rows: answer.rows });
        return;
      }
      setChecked(null);
      setPhotos({});
      const failed = answer.failed.length
        ? ` ${plural(answer.failed.length, "row")} could not be saved (${answer.failed.map((f) => `row ${f.row}`).join(", ")}) — upload the sheet again to retry them.`
        : "";
      setDone(`Menu updated: ${describe(answer.summary)}.${failed}`);
    } catch (err) {
      setError((err as Error)?.message || "The sheet could not be saved. Your photos are kept — try Save again.");
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  const saveTitle = useMemo(() => {
    if (saving) return progress || "Saving…";
    if (missingPhotos > 0) return `Add ${plural(missingPhotos, "more photo")} to save`;
    return "Save to menu";
  }, [saving, progress, missingPhotos]);

  return (
    <ScreenShell
      header={<Header title="Bulk upload" subtitle="Add many dishes from an Excel sheet" onBack={() => router.back()} />}
      scroll
      contentStyle={[styles.body, { paddingBottom: insets.bottom + 32 }]}
      footer={
        checked?.kind === "ready" ? (
          <Button
            title={saveTitle}
            onPress={save}
            loading={saving}
            disabled={saving || missingPhotos > 0 || nothingToSave}
            fullWidth
          />
        ) : undefined
      }
    >
      {!!error && <InfoNote tone="danger" text={error} />}
      {!!done && <InfoNote tone="success" text={done} />}

      <ListGroup title="1 · Download the sheet" grouped={false} delay={40}>
        <Card bordered elevationLevel="none" style={styles.card}>
          <Txt style={styles.text}>
            Your whole menu as an Excel file, one dish per row. With no dishes yet it downloads the empty sheet
            to fill in.
          </Txt>
          <Button
            title={exporting ? "Preparing…" : "Download sheet (.xlsx)"}
            variant="secondary"
            icon={<Ionicons name="download-outline" size={18} color={ui.brandInk} />}
            onPress={download}
            loading={exporting}
            disabled={exporting}
            fullWidth
          />
        </Card>
      </ListGroup>

      <ListGroup title="2 · Upload it" grouped={false} delay={80}>
        <Card bordered elevationLevel="none" style={styles.card}>
          <Txt style={styles.text}>
            Add a row with Product ID empty for each new dish. Keep a dish&apos;s Product ID to edit it. Dishes you
            remove from the sheet stay on your menu.
          </Txt>
          <Button
            title={checking ? "Checking the sheet…" : checked ? "Choose a different sheet" : "Choose sheet to upload"}
            icon={<Ionicons name="cloud-upload-outline" size={18} color={ui.onBrand} />}
            onPress={pick}
            loading={checking}
            disabled={checking || saving}
            fullWidth
          />
        </Card>
      </ListGroup>

      {checked?.kind === "invalid" && (
        <Card bordered elevationLevel="none" style={styles.card}>
          <Txt style={styles.fileName} numberOfLines={1}>{checked.fileName}</Txt>
          <InfoNote tone="danger" text={`${checked.message} Fix these in the sheet and upload it again.`} />
          <View style={styles.problems}>
            {checked.rows.map((entry, index) => (
              <View key={`${entry.row ?? "sheet"}-${index}`} style={styles.problem}>
                <Txt style={styles.problemRow}>{entry.row ? `Row ${entry.row}` : "Sheet"}</Txt>
                <Txt style={styles.problemText}>{entry.problems.map((p) => p.message).join(" ")}</Txt>
              </View>
            ))}
          </View>
        </Card>
      )}

      {checked?.kind === "ready" && (
        <>
          <Card bordered elevationLevel="none" style={styles.card}>
            <Txt style={styles.fileName} numberOfLines={1}>{checked.fileName}</Txt>
            <InfoNote
              tone={nothingToSave ? "info" : "success"}
              text={
                nothingToSave
                  ? "Every row matches your menu already — there is nothing to save."
                  : `Sheet checked, nothing saved yet: ${describe(checked.summary)}.`
              }
            />
          </Card>

          {newRows.length > 0 && (
            <ListGroup title={`3 · Photos · ${photographed} of ${newRows.length}`} grouped={false}>
              <InfoNote
                tone={missingPhotos ? "warning" : "success"}
                text={
                  missingPhotos
                    ? "Every new dish needs its photo before the sheet can be saved. Take it now, or choose one from your gallery."
                    : "Every new dish has its photo."
                }
              />
              {newRows.map((row) => (
                <NewDishPhoto
                  key={row.row}
                  row={row}
                  photo={photos[row.row]}
                  disabled={saving}
                  onPick={() => takePhoto(row)}
                />
              ))}
            </ListGroup>
          )}
        </>
      )}

      <ListGroup title="Columns in the sheet" grouped={false} delay={120}>
        <Card bordered elevationLevel="none" style={styles.card}>
          {MENU_SHEET_COLUMNS.map((column) => (
            <View key={column.key} style={styles.column}>
              <Txt style={styles.columnName}>
                {column.header}
                {column.required ? " *" : ""}
              </Txt>
              <Txt style={styles.columnHelp}>{column.help}</Txt>
            </View>
          ))}
          <Txt style={styles.footnote}>* required for a new dish. Photos are added here in the app, not in the sheet.</Txt>
        </Card>
      </ListGroup>

      {picker.sheet}
    </ScreenShell>
  );
}

/** One new dish from the sheet, and the photo it still needs (or has). */
function NewDishPhoto({
  row,
  photo,
  disabled,
  onPick,
}: {
  row: SheetRow;
  photo?: Attachment;
  disabled: boolean;
  onPick: () => void;
}) {
  const name = String(row.productName || "");
  const price = Number(row.price);
  return (
    <Card bordered dashed={!photo} elevationLevel="none" padding={12} style={styles.dish}>
      {photo ? (
        <TouchableOpacity
          onPress={onPick}
          disabled={disabled}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Replace the photo of ${name}`}
        >
          <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" />
        </TouchableOpacity>
      ) : (
        <ActionTile dashed icon="camera-outline" label="Add photo" onPress={onPick} />
      )}
      <View style={styles.dishBody}>
        <View style={styles.nameRow}>
          <VegMarker isVeg={dietOf(row.isVeg)} />
          <Txt style={styles.dishName} numberOfLines={1}>{name}</Txt>
        </View>
        <Txt style={styles.dishMeta} numberOfLines={1}>
          {`Row ${row.row} · ${String(row.category || "")}${Number.isFinite(price) ? ` · ${rupees(price)}` : ""}`}
        </Txt>
        <Button
          title={photo ? "Replace photo" : "Take or choose"}
          variant="secondary"
          size="sm"
          onPress={onPick}
          disabled={disabled}
          icon={<Ionicons name="camera-outline" size={16} color={ui.text} />}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, gap: 18, paddingTop: 8 },
  card: { gap: 12 },
  text: { fontFamily: font.body.regular, fontSize: size.medium, lineHeight: line.medium, color: ui.sec },
  fileName: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  problems: { gap: 10 },
  problem: { gap: 2 },
  problemRow: { fontFamily: font.body.bold, fontSize: size.small, color: ui.error },
  problemText: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.text },
  dish: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 96, height: 72, borderRadius: radius.md, backgroundColor: ui.sunken },
  dishBody: { flex: 1, minWidth: 0, gap: 6, alignItems: "flex-start" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dishName: { flex: 1, fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  dishMeta: { fontFamily: font.body.regular, fontSize: size.small, color: ui.sec },
  column: { gap: 2 },
  columnName: { fontFamily: font.body.semibold, fontSize: size.medium, color: ui.text },
  columnHelp: { fontFamily: font.body.regular, fontSize: size.small, lineHeight: line.small, color: ui.sec },
  footnote: { fontFamily: font.body.regular, fontSize: size.small, color: ui.muted },
});
