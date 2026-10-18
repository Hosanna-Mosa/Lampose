/* ══════════════════════════════════════════════════════════════════════════
   The menu as an Excel workbook — written for "Download", read for "Upload".

   A port of `Food-Partner/lib/menuWorkbook.ts` (no workspace tooling here, so
   the two are copies): the SAME columns, headers and aliases, so a sheet the
   kitchen downloaded from the app uploads here unchanged and the other way
   round. Change one, change the other. It also reads the onboarding sheets:
   the website/app CSV (category,itemName,price,description,type,isBestseller)
   and the Onboard agent template (Dish Name … Food Type (Veg / Egg / Non-veg)).

   The Product ID column is the whole contract with `…/menu/bulk`:

     · a row WITH a Product ID edits that dish,
     · a row WITHOUT one adds a new dish,
     · a dish left off the sheet is left alone — uploading never deletes.

   Photos are not in the sheet. A new dish's photo is chosen per row after the
   dry run, the way the app asks for one per new dish.

   `xlsx` is imported on first use, so the console's main bundle does not
   carry a spreadsheet engine for a screen most sessions never open.
   ══════════════════════════════════════════════════════════════════════════ */
import type { MenuItem, SheetRow } from '../api/services/restaurantAdminService';

type Key =
  | 'productId'
  | 'category'
  | 'productName'
  | 'isVeg'
  | 'price'
  | 'discountedPrice'
  | 'description'
  | 'isAvailable'
  | 'spiceLevel'
  | 'serves'
  | 'preparationTime'
  | 'calories'
  | 'tags'
  | 'allergenInfo'
  | 'variants'
  | 'addOns'
  | 'displayOrder';

interface Column {
  key: Key;
  header: string;
  /** Other headers this column is recognised by, normalised. */
  aliases?: string[];
  required?: boolean;
  help: string;
  example: string;
  width: number;
}

/** The sheet's columns, in order. Identical to the Food-Partner app's. */
export const MENU_SHEET_COLUMNS: readonly Column[] = [
  {
    key: 'productId', header: 'Product ID', aliases: ['id', 'productid', 'dishid'], width: 16,
    help: 'Filled in for dishes already on the menu — do not change it. Leave it EMPTY on a new row to add a new dish.',
    example: 'FPI-7K2M9QXA (or empty for a new dish)',
  },
  {
    key: 'category', header: 'Category', aliases: ['section', 'menucategory', 'productcategory'], required: true, width: 18,
    help: 'The menu section the dish is listed under.', example: 'Starters',
  },
  {
    key: 'productName', header: 'Dish Name', aliases: ['name', 'item', 'itemname', 'productname', 'product', 'dish', 'dishname'], required: true, width: 28,
    help: 'As diners should see it.', example: 'Paneer Tikka',
  },
  {
    /* Beyond the app's copy: `foodtypevegeggnonveg` (the Onboard agent
       template's "Food Type (Veg / Egg / Non-veg)"), and `cuttype` /
       `producttype` / `product` (spellings the onboarding CSV reader takes). */
    key: 'isVeg', header: 'Veg / Non-Veg / Egg', aliases: ['type', 'diet', 'veg', 'isveg', 'vegnonveg', 'foodtype', 'foodtypevegeggnonveg', 'cuttype', 'producttype'], required: true, width: 18,
    help: 'Veg, Non-Veg or Egg. Required, so a dish is never shown with the wrong dot.', example: 'Veg',
  },
  {
    key: 'price', header: 'Price (₹)', aliases: ['price', 'priceinr', 'pricers', 'rate', 'mrp'], required: true, width: 11,
    help: 'The full price, in rupees.', example: '220',
  },
  {
    key: 'discountedPrice', header: 'Offer Price (₹)', aliases: ['offerprice', 'discountedprice', 'saleprice'], width: 14,
    help: 'Optional. What the diner pays when on offer — must be below the price. Empty means no offer.', example: '199',
  },
  {
    key: 'description', header: 'Description', aliases: ['desc', 'details'], width: 40,
    help: 'Optional. One or two lines about the dish.', example: 'Cottage cheese marinated in spices, grilled in the tandoor',
  },
  {
    key: 'isAvailable', header: 'Available (Yes/No)', aliases: ['available', 'isavailable', 'instock', 'stock'], width: 16,
    help: 'Yes to sell it, No for out of stock. Empty keeps it as it is (new dishes start as Yes).', example: 'Yes',
  },
  {
    key: 'spiceLevel', header: 'Spice Level', aliases: ['spice', 'spicelevel'], width: 12,
    help: 'Optional. Mild, Medium or Hot. Empty means no spice level.', example: 'Medium',
  },
  {
    key: 'serves', header: 'Serves', aliases: ['servingsize', 'serves'], width: 8,
    help: 'Optional. How many people one portion serves.', example: '2',
  },
  {
    key: 'preparationTime', header: 'Prep Time (mins)', aliases: ['preptime', 'preparationtime', 'preptimemins'], width: 15,
    help: 'Optional. Minutes to prepare.', example: '15',
  },
  {
    key: 'calories', header: 'Calories', aliases: ['kcal'], width: 10,
    help: 'Optional. Calories per portion.', example: '350',
  },
  {
    key: 'tags', header: 'Tags', aliases: ['tag', 'badges'], width: 22,
    help: 'Optional. Separate with commas.', example: "Bestseller, Chef's Special",
  },
  {
    key: 'allergenInfo', header: 'Allergens', aliases: ['allergen', 'allergeninfo'], width: 20,
    help: 'Optional. Separate with commas.', example: 'Milk, Nuts',
  },
  {
    key: 'variants', header: 'Portions (Name:Price; …)', aliases: ['portions', 'variants', 'sizes'], width: 26,
    help: 'Optional. Choices that REPLACE the price, each with its full price, separated by semicolons.', example: 'Half:120; Full:220',
  },
  {
    key: 'addOns', header: 'Add-ons (Name:Price; …)', aliases: ['addons', 'extras'], width: 26,
    help: 'Optional. Extras added ON TOP of the price, separated by semicolons.', example: 'Extra cheese:30; Butter:15',
  },
  {
    key: 'displayOrder', header: 'Display Order', aliases: ['order', 'position', 'displayorder'], width: 13,
    help: 'Optional. Position within its category (0 is first). Empty puts a new dish at the end.', example: '0',
  },
];

const loadXlsx = () => import('xlsx');

const normalise = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const DIET_LABEL: Record<MenuItem['isVeg'], string> = { veg: 'Veg', 'non-veg': 'Non-Veg', egg: 'Egg' };

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : '');

const options = (list?: { name: string; price: number }[]) =>
  (list ?? []).map((option) => `${option.name}:${option.price}`).join('; ');

/** One dish as a sheet row, in column order. Numbers stay numbers, so Excel can sum them. */
const toRow = (product: MenuItem): (string | number)[] =>
  MENU_SHEET_COLUMNS.map(({ key }) => {
    switch (key) {
      case 'productId': return product.productId;
      case 'category': return product.category ?? '';
      case 'productName': return product.productName ?? '';
      case 'isVeg': return DIET_LABEL[product.isVeg] ?? product.isVeg ?? '';
      case 'price': return product.price ?? '';
      case 'discountedPrice': return product.discountedPrice ?? '';
      case 'description': return product.description ?? '';
      case 'isAvailable': return product.isAvailable === false ? 'No' : 'Yes';
      case 'spiceLevel': return capitalise(product.spiceLevel ?? '');
      case 'serves': return product.serves ?? '';
      case 'preparationTime': return product.preparationTime ?? '';
      case 'calories': return product.calories ?? '';
      case 'tags': return (product.tags ?? []).join(', ');
      case 'allergenInfo': return (product.allergenInfo ?? []).join(', ');
      case 'variants': return options(product.variants);
      case 'addOns': return options(product.addOns);
      case 'displayOrder': return product.displayOrder ?? '';
      default: return '';
    }
  });

/**
 * Saves the menu as `.xlsx` in the browser: a Menu sheet with every dish (or
 * the headers alone, which is the template), and an Instructions sheet.
 */
export async function downloadMenuWorkbook(products: readonly MenuItem[], fileName: string): Promise<void> {
  const XLSX = await loadXlsx();
  const sorted = [...products].sort(
    (a, b) =>
      (a.category ?? '').localeCompare(b.category ?? '') || (a.displayOrder ?? 0) - (b.displayOrder ?? 0),
  );

  const menu = XLSX.utils.aoa_to_sheet([MENU_SHEET_COLUMNS.map((column) => column.header), ...sorted.map(toRow)]);
  menu['!cols'] = MENU_SHEET_COLUMNS.map((column) => ({ wch: column.width }));

  const instructions = XLSX.utils.aoa_to_sheet([
    ['How to use this sheet'],
    ['Edit a dish: change its row and keep its Product ID.'],
    ['Add a dish: add a new row and leave Product ID empty.'],
    ['Removing a row does NOT delete the dish — delete dishes one at a time.'],
    ['Photos are chosen for each new dish after the sheet is checked.'],
    ['When done, save as .xlsx and upload it from the menu screen.'],
    [],
    ['Column', 'Required', 'What to put', 'Example'],
    ...MENU_SHEET_COLUMNS.map((column) => [column.header, column.required ? 'Yes' : 'No', column.help, column.example]),
  ]);
  instructions['!cols'] = [{ wch: 26 }, { wch: 10 }, { wch: 90 }, { wch: 40 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, menu, 'Menu');
  XLSX.utils.book_append_sheet(book, instructions, 'Instructions');
  XLSX.writeFile(book, fileName);
}

const text = (value: unknown) => String(value ?? '').trim();

/** "₹1,200", "Rs. 120", 120 → "1200" / "120"; anything else is passed on for the server to refuse. */
const money = (value: unknown) => {
  if (typeof value === 'number') return value;
  return text(value).replace(/^(rs\.?|inr)\s*/i, '').replace(/[₹,\s]/g, '');
};

const list = (value: unknown) =>
  text(value)
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

/** "Half:120; Full:220" → [{ name, price }]. A part with no price is sent as one, so the server names it. */
const optionList = (value: unknown) =>
  text(value)
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const cut = Math.max(part.lastIndexOf(':'), part.lastIndexOf('='));
      return cut > 0
        ? { name: part.slice(0, cut).trim(), price: money(part.slice(cut + 1)) }
        : { name: part, price: '' };
    });

const yesNo = (value: unknown) => {
  const t = text(value).toLowerCase();
  if (t === 'y') return 'yes';
  if (t === 'n') return 'no';
  return t;
};

/**
 * Reads an uploaded `.xlsx` (or `.csv`) into the rows the server takes.
 *
 * The first sheet named "Menu", or else the first sheet. Row numbers are the
 * sheet's own — the header is row 1 — so a refusal points at the right line
 * in Excel. Blank rows are skipped. Throws a sentence when the file is not a
 * menu sheet at all.
 */
export async function readMenuWorkbook(file: File): Promise<SheetRow[]> {
  const XLSX = await loadXlsx();
  let book: import('xlsx').WorkBook;
  try {
    /* A CSV is decoded as UTF-8 here first: handed raw bytes, SheetJS reads
       them as a single-byte codepage and "₹1,200" arrives as mojibake that
       no longer looks like a price. A leading byte-order mark is dropped. */
    book = /\.(csv|txt)$/i.test(file.name) || file.type === 'text/csv'
      ? XLSX.read((await file.text()).replace(/^﻿/, ''), { type: 'string' })
      : XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  } catch {
    throw new Error('That file could not be opened as a spreadsheet. Save it as .xlsx and try again.');
  }

  const name = book.SheetNames.find((sheet) => sheet.toLowerCase() === 'menu') ?? book.SheetNames[0];
  const sheet = name ? book.Sheets[name] : undefined;
  if (!sheet) throw new Error('That spreadsheet has no sheets in it.');

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true, raw: true });
  const headerRow = (grid[0] ?? []).map(normalise);

  /* Column index for each key, by header or alias. */
  const at = new Map<Key, number>();
  MENU_SHEET_COLUMNS.forEach((column) => {
    const names = [normalise(column.header), ...(column.aliases ?? [])];
    const index = headerRow.findIndex((cell) => cell && names.includes(cell));
    if (index >= 0) at.set(column.key, index);
  });

  const missing = MENU_SHEET_COLUMNS.filter((column) => column.required && !at.has(column.key));
  if (missing.length) {
    throw new Error(
      `This does not look like the Lampose menu sheet — it has no ${missing.map((column) => `"${column.header}"`).join(', ')} column. Download the template and fill that in.`,
    );
  }

  const legacyBestseller = headerRow.findIndex((cell) => cell === 'isbestseller' || cell === 'bestseller');

  const rows: SheetRow[] = [];
  grid.slice(1).forEach((cells, index) => {
    if (!cells.some((cell) => text(cell))) return;
    const cell = (key: Key) => (at.has(key) ? cells[at.get(key)!] : undefined);
    const has = (key: Key) => at.has(key);

    const row: SheetRow = { row: index + 2 };
    const productId = text(cell('productId'));
    if (productId) row.productId = productId;

    /* The required three are always sent, so an emptied cell is refused by name. */
    row.category = text(cell('category'));
    row.productName = text(cell('productName'));
    row.price = money(cell('price'));
    const diet = text(cell('isVeg'));
    if (diet || !productId) row.isVeg = diet;

    /* Optional columns that are present are applied as written: an empty cell
       clears the field on an existing dish. */
    if (has('discountedPrice')) row.discountedPrice = money(cell('discountedPrice'));
    if (has('description')) row.description = text(cell('description'));
    if (has('spiceLevel')) row.spiceLevel = text(cell('spiceLevel')).toLowerCase();
    if (has('calories')) row.calories = money(cell('calories'));
    if (has('preparationTime')) row.preparationTime = money(cell('preparationTime'));
    if (has('allergenInfo')) row.allergenInfo = list(cell('allergenInfo'));
    if (has('variants')) row.variants = optionList(cell('variants'));
    if (has('addOns')) row.addOns = optionList(cell('addOns'));

    /* These three mean "leave it" when empty, never "clear". */
    const available = yesNo(cell('isAvailable'));
    if (available) row.isAvailable = available;
    const serves = money(cell('serves'));
    if (serves !== '') row.serves = serves;
    const order = money(cell('displayOrder'));
    if (order !== '') row.displayOrder = order;

    /* The onboarding CSV's yes/no "isBestseller" column, folded into Tags. */
    const bestseller = legacyBestseller >= 0 && /^(y|yes|true|1|bestseller)$/i.test(text(cells[legacyBestseller]));
    if (has('tags') || bestseller) {
      const tags = has('tags') ? list(cell('tags')) : [];
      if (bestseller && !tags.includes('Bestseller')) tags.push('Bestseller');
      row.tags = tags;
    }

    rows.push(row);
  });

  if (!rows.length) throw new Error('The sheet has no dishes in it — add rows under the header and upload again.');
  return rows;
}

/** `lampose-menu-<restaurant>-<YYYY-MM-DD>.xlsx` */
export function menuFileName(restaurantName: string | undefined, now = new Date()): string {
  const slug = normalise(restaurantName ?? '').slice(0, 32) || 'restaurant';
  const day = now.toISOString().slice(0, 10);
  return `lampose-menu-${slug}-${day}.xlsx`;
}
