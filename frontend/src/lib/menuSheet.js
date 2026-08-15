import { MENU_COLUMNS } from '../data/partner';
import { uid } from './uid';

/* ══════════════════════════════════════════════════════════════════════════
   Menu sheet reader.

   A partner uploads the menu they already keep — a CSV export or the XLSX
   template — and it is read in the browser, so a mistyped column is caught
   while they are still looking at the form rather than a day later by whoever
   opens the file.

   XLSX is a zip of XML. Reading it here rather than pulling in a spreadsheet
   library keeps the site's dependency list at react + router, which is the
   whole reason this project builds in a couple of seconds. The zip walk below
   is deliberately minimal: find the central directory, take the two entries
   that matter, inflate them with the platform's own DecompressionStream.
   ══════════════════════════════════════════════════════════════════════════ */

const normalizeHeader = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');

/* Partners name these columns half a dozen ways. Map the spellings we have
   actually been sent onto the six the form works in. */
const CANONICAL = [
  ['category', ['category', 'menucategory', 'productcategory']],
  ['itemName', ['itemname', 'item', 'name', 'productname', 'product']],
  ['price', ['price', 'priceinr', 'price₹', 'price rs', 'rate']],
  ['description', ['description', 'desc', 'details']],
  ['type', ['type', 'veg/nonveg', 'cuttype', 'producttype']],
  ['isBestseller', ['isbestseller', 'bestseller', 'tags', 'tag']],
];

const toCanonicalHeader = value => {
  const normalized = normalizeHeader(value);
  const hit = CANONICAL.find(([, spellings]) => spellings.map(normalizeHeader).includes(normalized));
  return hit ? hit[0] : normalized;
};

/* Quotes protect commas inside a description, and a doubled quote is a
   literal one — the two rules that separate a CSV from a split on ','. */
const parseCsvLine = line => {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const rowsFromTable = rows => {
  if (rows.length === 0) throw new Error('The uploaded sheet is empty.');

  const headers = rows[0].map(toCanonicalHeader);
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const missing = MENU_COLUMNS.filter(column => !headerIndex.has(column));

  if (missing.length > 0) {
    throw new Error(`Missing columns: ${missing.join(', ')}`);
  }

  const cell = (row, column) => (row[headerIndex.get(column) ?? -1] || '').trim();

  const parsed = rows.slice(1)
    .map(row => ({
      id: uid(),
      category: cell(row, 'category'),
      itemName: cell(row, 'itemName'),
      price: cell(row, 'price'),
      description: cell(row, 'description'),
      type: cell(row, 'type'),
      isBestseller: cell(row, 'isBestseller'),
      image: null,
    }))
    /* A sheet exported from Excel usually carries a tail of blank rows. */
    .filter(row => MENU_COLUMNS.some(column => row[column]));

  if (parsed.length === 0) {
    throw new Error('Add at least one item row to the uploaded sheet.');
  }

  return parsed;
};

const readFileAsText = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Unable to read the uploaded menu sheet.'));
  reader.readAsText(file);
});

const parseCsvRows = async file => {
  const text = await readFileAsText(file);
  const rows = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

  return rowsFromTable(rows);
};

/* ── XLSX ────────────────────────────────────────────────────────────────── */

/* "C7" → 2. A cell can be missing from the XML entirely, so the column has to
   come from its reference rather than from its position in the row. */
const columnIndexOf = cellRef => {
  const letters = (cellRef.match(/[A-Z]+/i)?.[0] || '').toUpperCase();
  return letters.split('').reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
};

const inflate = async (bytes, method) => {
  if (method === 0) return new TextDecoder().decode(bytes);

  if (!('DecompressionStream' in window)) {
    throw new Error('This browser cannot read XLSX files here. Please upload a CSV instead.');
  }

  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const stream = new Blob([buffer]).stream()
    .pipeThrough(new window.DecompressionStream('deflate-raw'));

  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
};

const readZipEntries = async buffer => {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  let eocd = -1;

  /* The end-of-central-directory record sits at the tail, after a comment of
     unknown length — so it is found by scanning backwards for its signature. */
  for (let i = data.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Unable to read the XLSX file.');

  const total = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let i = 0; i < total; i += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;

    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(data.slice(offset + 46, offset + 46 + nameLength));

    /* The local header repeats the name and extra fields at its own lengths,
       which is where the compressed bytes actually begin. */
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const bytes = data.slice(start, start + compressedSize);

    entries.set(name, () => inflate(bytes, method));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
};

/* Text cells are stored once in a shared table and referenced by index. */
const parseSharedStrings = xmlText => {
  if (!xmlText) return [];
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  return [...xml.getElementsByTagName('si')].map(item => (
    [...item.getElementsByTagName('t')].map(node => node.textContent || '').join('')
  ));
};

const parseXlsxRows = async file => {
  const entries = await readZipEntries(await file.arrayBuffer());
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('The XLSX file must include a first worksheet.');

  const sharedEntry = entries.get('xl/sharedStrings.xml');
  const shared = sharedEntry ? parseSharedStrings(await sharedEntry()) : [];
  const xml = new DOMParser().parseFromString(await sheet(), 'application/xml');

  const rows = [...xml.getElementsByTagName('row')].map(row => {
    const values = [];
    [...row.getElementsByTagName('c')].forEach(cell => {
      const index = columnIndexOf(cell.getAttribute('r') || '');
      const raw = cell.getElementsByTagName('v')[0]?.textContent
        || cell.getElementsByTagName('t')[0]?.textContent
        || '';
      values[index] = cell.getAttribute('t') === 's' ? shared[Number(raw)] || '' : raw;
    });
    return values.map(value => value || '');
  });

  return rowsFromTable(rows);
};

/**
 * Read an uploaded menu sheet into item rows.
 * Throws with a message written for the partner, never a parser error.
 */
export async function readMenuSheet(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'csv') return parseCsvRows(file);
  if (extension === 'xlsx') return parseXlsxRows(file);

  throw new Error('Upload a CSV or XLSX menu sheet.');
}

export default readMenuSheet;
