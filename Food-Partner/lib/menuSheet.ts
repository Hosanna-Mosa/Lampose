/* ══════════════════════════════════════════════════════════════════════════
   Menu sheet reader.

   A partner uploads the menu they already keep and it is read on the device,
   so a mistyped column is caught while they are still looking at the form
   rather than a day later by whoever opens the file.

   CSV ONLY, unlike the website. XLSX is a zip of XML, and the web reader
   inflates it with the platform's DecompressionStream — which React Native
   does not have. Pulling in a spreadsheet library to read a file our own
   template produces is a poor trade, so the app asks for CSV and says so in
   the copy rather than accepting a file it will fail on.
   ══════════════════════════════════════════════════════════════════════════ */
import { MENU_COLUMNS } from "@/constants/partner";
import { uid } from "@/lib/uid";
import type { MenuRow } from "@/store/partnerStore";

const normalise = (value: string) => String(value).toLowerCase().replace(/[^a-z0-9]/g, "");

/* Partners name these columns half a dozen ways. Map the spellings we have
   actually been sent onto the six the form works in. */
const CANONICAL: [string, string[]][] = [
  ["category", ["category", "menucategory", "productcategory"]],
  ["itemName", ["itemname", "item", "name", "productname", "product"]],
  ["price", ["price", "priceinr", "pricers", "rate"]],
  ["description", ["description", "desc", "details"]],
  ["type", ["type", "vegnonveg", "cuttype", "producttype"]],
  ["isBestseller", ["isbestseller", "bestseller", "tags", "tag"]],
];

const toCanonical = (value: string): string => {
  const n = normalise(value);
  const hit = CANONICAL.find(([, spellings]) => spellings.map(normalise).includes(n));
  return hit ? hit[0] : n;
};

/* Quotes protect commas inside a description, and a doubled quote is a literal
   one — the two rules that separate a CSV from a split on ",". */
const parseLine = (line: string): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

export function readMenuSheet(text: string): MenuRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) throw new Error("The uploaded sheet is empty.");

  const headers = parseLine(lines[0]).map(toCanonical);
  const index = new Map(headers.map((h, i) => [h, i]));
  const missing = MENU_COLUMNS.filter((c) => !index.has(c));

  if (missing.length > 0) throw new Error(`Missing columns: ${missing.join(", ")}`);

  const cell = (row: string[], column: string) => (row[index.get(column) ?? -1] || "").trim();

  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    return {
      id: uid(),
      category: cell(values, "category"),
      itemName: cell(values, "itemName"),
      price: cell(values, "price"),
      description: cell(values, "description"),
      itemType: cell(values, "type"),
      isBestseller: /^(y|yes|true|1|bestseller)$/i.test(cell(values, "isBestseller")),
      image: null,
    } satisfies MenuRow;
  });

  const usable = rows.filter((r) => r.itemName || r.price);
  if (usable.length === 0) throw new Error("The sheet has headings but no items under them.");

  return usable;
}
