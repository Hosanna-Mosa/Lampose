import { createMenuItem } from './restaurantOptions';

/*
 * The menu as an Excel sheet: a template to download, a filled-in sheet to
 * read back into dish rows, and the dish photographs matched onto those rows.
 *
 * ## Why photos are matched by NAME and not embedded
 *
 * A picture pasted into a cell is a drawing floating over the grid, not the
 * cell's value — it is anchored by position, and a sorted or re-typed sheet
 * moves the rows out from under it. So the agent picks the photographs
 * themselves in one go, and a photo named after the dish ("Chicken
 * Biryani.jpg") matches that dish — or one at a time, from the dish's line.
 *
 * The template no longer has a "Photo File Name" column, but a sheet that
 * still carries one (an older template) is read, and that name wins.
 *
 * SheetJS is imported on demand: it is the size of the rest of this app, and
 * most applications never touch the sheet.
 */

const loadXlsx = () => import('xlsx');

const COLUMNS = [
  { key: 'name', header: 'Dish Name', aliases: ['dish', 'name', 'item', 'itemname', 'dishname'] },
  { key: 'category', header: 'Category', aliases: ['category', 'section'] },
  { key: 'price', header: 'Price', aliases: ['price', 'mrp', 'rate', 'amount'] },
  { key: 'discountedPrice', header: 'Offer Price', aliases: ['offerprice', 'offer', 'discountedprice', 'discountprice', 'saleprice'] },
  { key: 'isVeg', header: 'Food Type (Veg / Egg / Non-veg)', aliases: ['foodtype', 'type', 'veg', 'isveg', 'vegnonveg'] },
  { key: 'description', header: 'Description', aliases: ['description', 'desc', 'details'] },
  /* Read if present, never written into the template. */
  { key: 'photoName', header: 'Photo File Name', aliases: ['photo', 'photofilename', 'photoname', 'image', 'imagename', 'filename'], inTemplate: false },
];

const TEMPLATE_COLUMNS = COLUMNS.filter((column) => column.inTemplate !== false);

const SAMPLE_ROWS = [
  ['Chicken Biryani', 'Biryani', 220, 199, 'Non-veg', 'Served with raita and salan'],
  ['Paneer Butter Masala', 'Curries', 180, '', 'Veg', 'Rich tomato and butter gravy'],
  ['Egg Fried Rice', 'Rice', 140, '', 'Egg', ''],
];

const squash = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const stripExtension = (name) => String(name || '').replace(/\.[^.]+$/, '');

const columnFor = (header) => {
  const key = squash(header).replace(/rs$|inr$/, '');
  const exact = COLUMNS.find((column) => squash(column.header) === key);
  if (exact) return exact.key;
  const alias = COLUMNS.find((column) => column.aliases.includes(key));
  return alias ? alias.key : null;
};

const readFoodType = (value) => {
  const key = squash(value);
  if (!key) return 'veg';
  if (key.startsWith('egg')) return 'egg';
  if (key.startsWith('non') || key === 'nv') return 'non-veg';
  return 'veg';
};

const readPrice = (value) => {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[₹,\s]|rs\.?/gi, '');
};

/** Saves `lampose-menu-template.xlsx` with the headers and three example rows. */
export async function downloadMenuTemplate() {
  const XLSX = await loadXlsx();
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS.map((column) => column.header), ...SAMPLE_ROWS]);
  sheet['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 8 }, { wch: 11 }, { wch: 30 }, { wch: 34 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'Menu');
  XLSX.writeFile(book, 'lampose-menu-template.xlsx');
}

/**
 * Reads the first sheet of an .xlsx / .xls / .csv into dish rows.
 * Returns `{ items, skipped }` — `skipped` counts blank rows; a sheet with no
 * recognisable "Dish Name" column throws, with a sentence for the agent.
 */
export async function parseMenuSheet(file) {
  const XLSX = await loadXlsx();
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheet = book.Sheets[book.SheetNames[0]];
  if (!firstSheet) throw new Error('That file has no sheets in it.');

  const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '', blankrows: false });
  if (!rows.length) throw new Error('That sheet is empty.');

  const keys = rows[0].map(columnFor);
  if (!keys.includes('name')) {
    throw new Error('Could not find a "Dish Name" column in the first row. Download the template and fill that in.');
  }

  const items = [];
  let skipped = 0;

  rows.slice(1).forEach((row) => {
    const values = {};
    keys.forEach((key, index) => {
      if (key && values[key] === undefined) values[key] = String(row[index] ?? '').trim();
    });

    if (![values.name, values.category, values.price].some(Boolean)) {
      skipped += 1;
      return;
    }

    items.push({
      ...createMenuItem(),
      name: values.name || '',
      category: values.category || '',
      price: readPrice(values.price),
      discountedPrice: readPrice(values.discountedPrice),
      isVeg: readFoodType(values.isVeg),
      description: (values.description || '').slice(0, 200),
      photoName: values.photoName || '',
      /* Collapsed into the sheet's summary card rather than shown as a card. */
      fromSheet: true,
    });
  });

  return { items, skipped };
}

/**
 * Attaches picked photos to dishes. A photo matches the dish whose
 * "Photo File Name" it is (with or without the extension), or failing that the
 * dish it is named after. Dishes that already have a photo are left alone.
 * Returns `{ items, matched, unmatched }`, `unmatched` being file names.
 */
export function matchPhotos(items, files) {
  const remaining = [...files];
  let matched = 0;

  const take = (test) => {
    const index = remaining.findIndex(test);
    return index === -1 ? null : remaining.splice(index, 1)[0];
  };

  const next = items.map((item) => {
    if (item.photoFile) return item;

    const wanted = squash(item.photoName);
    const wantedBase = squash(stripExtension(item.photoName));
    const dish = squash(item.name);

    const photo = (wanted && take((file) => squash(file.name) === wanted))
      || (wantedBase && take((file) => squash(stripExtension(file.name)) === wantedBase))
      || (dish && take((file) => squash(stripExtension(file.name)) === dish));

    if (!photo) return item;
    matched += 1;
    return { ...item, photoFile: photo };
  });

  return { items: next, matched, unmatched: remaining.map((file) => file.name) };
}
