import React, { useEffect, useState } from 'react';
import {
  Check, ChevronDown, ChevronUp, Download, FileSpreadsheet, ImagePlus, Images, IndianRupee,
  Pencil, Plus, RefreshCw, Trash2, UtensilsCrossed,
} from 'lucide-react';
import {
  Box, Image, Inline, Input, PlainButton, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import {
  COPY, IS_VEG_OPTIONS, MENU_CATEGORY_OPTIONS, createMenuItem, isMenuItemStarted,
} from '../../utils/restaurantOptions';
import { menuKey } from '../../utils/validateRestaurant';
import { downloadMenuTemplate, matchPhotos, parseMenuSheet } from '../../utils/menuSheet';

/*
 * The menu, on step 2 — and it is OPTIONAL.
 *
 * ## Why optional is the whole design
 *
 * This form is filled in by a Lampose employee standing at a counter with the
 * owner. Sixty dishes with a photograph each is not twenty minutes' work, and
 * a form that demands it is a form abandoned halfway with the licences already
 * photographed. So the section starts EMPTY, with a button rather than a blank
 * row: an empty menu is a valid application (`validateApplication` in the
 * backend stopped requiring one for exactly this reason), and the owner types
 * the rest from the Food-Partner app once the account is approved.
 *
 * What it buys when it IS used: a restaurant that is approved on Tuesday can
 * be ordered from on Tuesday, instead of waiting for somebody to sit down with
 * the app. Half a dozen dishes typed at the counter is usually the difference.
 *
 * ## A row that has been STARTED is checked; an untouched one is not
 *
 * The rules are in `validateRestaurant.js` and they mirror the backend's:
 * every item that is sent needs a name, a category and a price of zero or
 * more, and a discount has to be below the full price. A row nobody typed into
 * is not an error — it is dropped at submit, because "add a dish" pressed by
 * accident should not be a refusal at the end of the form.
 *
 * ## One photograph per dish, and it is optional too
 *
 * `foodProduct.model.js` has room for one and the submit path uploads it to
 * Cloudinary on the way through, so a dish typed here can arrive with its
 * picture already attached — which is what a diner actually scrolls. It is a
 * drop zone rather than a required step for the reason the whole section is
 * optional: sixty photographs taken at a counter is the slowest thing this
 * form could ask for, and the app does the rest of them better, later.
 *
 * The thumbnail matters. A filename says nothing about whether the biryani is
 * in the frame, and this picture is the one on the menu card.
 */

const VEG_LABEL = { veg: 'Veg', egg: 'Egg', 'non-veg': 'Non-veg' };

/*
 * A sheet dish on one line: photo (or a button to add one), name, category,
 * food type and price, then edit and remove. Sixty of these fit where six
 * full cards would. Editing opens the full card for that dish alone.
 */
function DishRow({ item, index, onPhoto, onEdit, onRemove }) {
  const [thumbnail, setThumbnail] = useState(null);

  /* Revoked on change and unmount, as in FileDrop. */
  useEffect(() => {
    if (!item.photoFile) { setThumbnail(null); return undefined; }
    const url = URL.createObjectURL(item.photoFile);
    setThumbnail(url);
    return () => URL.revokeObjectURL(url);
  }, [item.photoFile]);

  const offer = String(item.discountedPrice ?? '').trim();
  const photoId = `${item.uid}-rowphoto`;

  return (
    <Box className="rst-dish-row" id={`rst-menu-${index}`} tabIndex={-1}>
      <label
        className={`rst-dish-row-photo${thumbnail ? ' has-photo' : ''}`}
        htmlFor={photoId}
        title={thumbnail ? 'Change photo' : `Add photo${item.photoName ? ` (${item.photoName})` : ''}`}
      >
        {thumbnail ? <Image src={thumbnail} alt={item.name} /> : <ImagePlus size={16} />}
        <Input
          id={photoId}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            if (event.target.files?.[0]) onPhoto(event.target.files[0]);
            event.target.value = '';
          }}
        />
      </label>

      <Inline className={`rst-veg-mark is-${item.isVeg}`} title={VEG_LABEL[item.isVeg]} />
      <Inline className="rst-dish-row-name" title={item.name}>{item.name}</Inline>
      <Inline className="rst-dish-row-cat">{item.category}</Inline>
      <Inline className="rst-dish-row-price">
        {offer ? (
          <>
            <s>₹{item.price}</s> ₹{offer}
          </>
        ) : `₹${item.price}`}
      </Inline>

      <PlainButton type="button" className="rst-slot-kill" onClick={onEdit} aria-label={`Edit ${item.name}`}>
        <Pencil size={15} />
      </PlainButton>
      <PlainButton type="button" className="rst-slot-kill" onClick={onRemove} aria-label={`Remove ${item.name}`}>
        <Trash2 size={15} />
      </PlainButton>
    </Box>
  );
}

export function MenuSection({ form, set, errors = {}, touch = () => {} }) {
  const items = form.menuItems || [];

  const update = (uid, patch) => {
    set({
      menuItems: items.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    });
  };

  const addItem = () => set({ menuItems: [...items, createMenuItem()] });

  const removeItem = (uid) => set({ menuItems: items.filter((item) => item.uid !== uid) });

  /* The outcome of the last sheet or photo upload, shown under the buttons. */
  const [bulkNote, setBulkNote] = useState(null);
  const [busy, setBusy] = useState(false);
  /* Sheet dishes are collapsed into one summary card unless this is on. */
  const [showSheetDishes, setShowSheetDishes] = useState(false);
  /* The one sheet dish opened from its line into the full card. */
  const [editingUid, setEditingUid] = useState(null);

  const sheetItems = items.filter((item) => item.fromSheet);
  const sheetPhotos = sheetItems.filter((item) => item.photoFile).length;
  const hasError = (index) => Object.keys(errors).some((key) => key.startsWith(`menu:${index}:`));
  /* A sheet dish with a problem is always shown as a card, so it can be fixed. */
  const sheetFixes = items.filter((item, index) => item.fromSheet && hasError(index)).length;

  const importSheet = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const { items: imported, skipped } = await parseMenuSheet(file);
      if (!imported.length) {
        setBulkNote({ tone: 'warn', text: 'No dishes found in that sheet.' });
        return;
      }
      /* A new sheet REPLACES the previous sheet's dishes and goes after the
         dishes typed by hand; untouched blank rows go. A photo already on a
         dish of the same name is carried over, so re-uploading a corrected
         sheet does not mean picking every photo again. */
      const oldPhotos = new Map(
        sheetItems.filter((item) => item.photoFile)
          .map((item) => [item.name.trim().toLowerCase(), item.photoFile]),
      );
      const carried = imported.map((item) => {
        const photo = oldPhotos.get(item.name.trim().toLowerCase());
        return photo ? { ...item, photoFile: photo } : item;
      });
      set({
        menuItems: [...items.filter((item) => !item.fromSheet && isMenuItemStarted(item)), ...carried],
        menuSheet: { name: file.name },
      });
      setShowSheetDishes(false);
      const withPhotoNames = imported.filter((item) => item.photoName).length;
      setBulkNote({
        tone: 'ok',
        text: `Added ${imported.length} dish${imported.length === 1 ? '' : 'es'} from ${file.name}`
          + `${skipped ? ` (${skipped} blank row${skipped === 1 ? '' : 's'} skipped)` : ''}.`
          + `${withPhotoNames ? ` Now upload the ${withPhotoNames} photo${withPhotoNames === 1 ? '' : 's'} named in the sheet.` : ''}`,
      });
    } catch (error) {
      setBulkNote({ tone: 'bad', text: error.message || 'Could not read that file.' });
    } finally {
      setBusy(false);
    }
  };

  const removeSheet = () => {
    const count = sheetItems.length;
    const label = form.menuSheet?.name || 'the sheet';
    if (count && !window.confirm(`Remove ${label} and its ${count} dish${count === 1 ? '' : 'es'}?`)) return;
    set({ menuItems: items.filter((item) => !item.fromSheet), menuSheet: null });
    setShowSheetDishes(false);
    setBulkNote(null);
  };

  const sheetInput = (id) => (
    <Input
      id={id}
      type="file"
      accept=".xlsx,.xls,.csv"
      style={{ display: 'none' }}
      disabled={busy}
      onChange={(event) => {
        importSheet(event.target.files?.[0]);
        event.target.value = '';
      }}
    />
  );

  const attachPhotos = (fileList) => {
    const files = Array.from(fileList || []).filter((file) => String(file.type).startsWith('image/'));
    if (!files.length) return;
    const { items: next, matched, unmatched } = matchPhotos(items, files);
    set({ menuItems: next });
    setBulkNote({
      tone: unmatched.length ? 'warn' : 'ok',
      text: `Matched ${matched} photo${matched === 1 ? '' : 's'} to dishes.`
        + (unmatched.length
          ? ` No dish for: ${unmatched.join(', ')}. Name each photo after its dish, or add it from the dish's line.`
          : ''),
    });
  };

  const startedItems = items.filter(isMenuItemStarted);
  const started = startedItems.length;
  /* Counted so the line below can say it: every photograph is an upload that
     happens at submit, and an agent on a slow counter connection should know
     how many are about to go. */
  const withPhotos = startedItems.filter((item) => item.photoFile).length;

  return (
    <Box className="rst-section" id="rst-menu" tabIndex={-1}>
      <SectionHead
        icon={<UtensilsCrossed size={16} color="#45855a" />}
        title="Menu (Optional)"
      />

      <Box className="rst-card">
        <Field label="Dishes" optional hint={COPY.menuHelp} />

        {/* Bulk entry: fill the template, upload it, then upload the photos it
            names in one pick. See `utils/menuSheet.js` for the matching rules. */}
        <Box className="rst-menu-bulk">
          <PlainButton
            type="button"
            className="rst-btn-link"
            onClick={() => downloadMenuTemplate().catch(() => (
              setBulkNote({ tone: 'bad', text: 'Could not create the template.' })
            ))}
          >
            <Download size={15} />
            Download Excel template
          </PlainButton>

          {!form.menuSheet && (
            <label className={`rst-btn-link${busy ? ' is-busy' : ''}`} htmlFor="rst-menu-sheet">
              <FileSpreadsheet size={15} />
              {busy ? 'Reading sheet…' : 'Upload menu Excel'}
              {sheetInput('rst-menu-sheet')}
            </label>
          )}

          {items.length > 0 && (
            <label className="rst-btn-link" htmlFor="rst-menu-photos">
              <Images size={15} />
              Upload dish photos
              <Input
                id="rst-menu-photos"
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(event) => {
                  attachPhotos(event.target.files);
                  event.target.value = '';
                }}
              />
            </label>
          )}
        </Box>

        {form.menuSheet && (
          <Box className="rst-sheet-card">
            <Box className="rst-sheet-head">
              <FileSpreadsheet size={20} color="#45855a" />
              <Box className="rst-sheet-meta">
                <Text className="rst-sheet-name">{form.menuSheet.name}</Text>
                <Text className="rst-hint">
                  {sheetItems.length} dish{sheetItems.length === 1 ? '' : 'es'}
                  {' · '}{sheetPhotos} with a photo
                  {sheetFixes > 0 && ` · ${sheetFixes} need fixing (shown below)`}
                </Text>
              </Box>
            </Box>

            <Box className="rst-sheet-actions">
              {sheetItems.length > 0 && (
                <PlainButton
                  type="button"
                  className="rst-btn-link"
                  onClick={() => setShowSheetDishes((on) => !on)}
                  aria-expanded={showSheetDishes}
                >
                  {showSheetDishes ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  {showSheetDishes ? 'Hide dishes' : 'View dishes'}
                </PlainButton>
              )}

              <label className={`rst-btn-link${busy ? ' is-busy' : ''}`} htmlFor="rst-menu-resheet">
                <RefreshCw size={15} />
                {busy ? 'Reading sheet…' : 'Re-upload'}
                {sheetInput('rst-menu-resheet')}
              </label>

              <PlainButton type="button" className="rst-btn-link rst-btn-danger" onClick={removeSheet}>
                <Trash2 size={15} />
                Remove
              </PlainButton>
            </Box>
          </Box>
        )}

        {bulkNote && <Note tone={bulkNote.tone}>{bulkNote.text}</Note>}

        {items.length === 0 && (
          <Note tone="info" icon={<UtensilsCrossed size={15} />}>
            No dishes added. You can leave this empty — the owner adds the full menu, with
            photographs, from the Food-Partner app once Lampose approves the restaurant.
          </Note>
        )}

        {items.map((item, index) => {
          /* Sheet dishes are one line each; the full card is for a dish typed
             by hand, a sheet dish being edited, and one with a problem. */
          const fullCard = !item.fromSheet || hasError(index) || editingUid === item.uid;
          if (!fullCard) {
            return showSheetDishes ? (
              <DishRow
                key={item.uid}
                item={item}
                index={index}
                onPhoto={(picked) => update(item.uid, { photoFile: picked })}
                onEdit={() => setEditingUid(item.uid)}
                onRemove={() => removeItem(item.uid)}
              />
            ) : null;
          }
          return (
          <Box key={item.uid} className="rst-dish" id={`rst-menu-${index}`} tabIndex={-1}>
            <Box className="rst-dish-head">
              <Text className="rst-dish-num">Dish {index + 1}</Text>
              {item.fromSheet && editingUid === item.uid && !hasError(index) && (
                <PlainButton
                  type="button"
                  className="rst-btn-link"
                  style={{ marginLeft: 'auto', minHeight: 0, padding: '0 4px' }}
                  onClick={() => setEditingUid(null)}
                >
                  <Check size={15} />
                  Done
                </PlainButton>
              )}
              <PlainButton
                type="button"
                className="rst-slot-kill"
                onClick={() => removeItem(item.uid)}
                aria-label={`Remove dish ${index + 1}`}
              >
                <Trash2 size={16} />
              </PlainButton>
            </Box>

            <Field
              label="Dish Name"
              required
              htmlFor={`${item.uid}-name`}
              error={errors[menuKey(index, 'name')]}
            >
              <Input
                id={`${item.uid}-name`}
                className={`rst-input${errors[menuKey(index, 'name')] ? ' is-bad' : ''}`}
                type="text"
                value={item.name}
                onChange={(event) => update(item.uid, { name: event.target.value })}
                onBlur={() => touch(menuKey(index, 'name'))}
                placeholder="e.g. Chicken Biryani"
              />
            </Field>

            <Box className="rst-grid-2">
              {/* Free text with suggestions rather than a closed list: the
                  category is the heading a diner reads on the menu page, and
                  every kitchen names its own. The backend stores the string. */}
              <Field
                label="Category"
                required
                htmlFor={`${item.uid}-category`}
                error={errors[menuKey(index, 'category')]}
              >
                <Input
                  id={`${item.uid}-category`}
                  className={`rst-input${errors[menuKey(index, 'category')] ? ' is-bad' : ''}`}
                  type="text"
                  list="rst-menu-categories"
                  value={item.category}
                  onChange={(event) => update(item.uid, { category: event.target.value })}
                  onBlur={() => touch(menuKey(index, 'category'))}
                  placeholder="e.g. Biryani"
                />
              </Field>

              <Field
                label="Price (₹)"
                required
                htmlFor={`${item.uid}-price`}
                error={errors[menuKey(index, 'price')]}
              >
                <Box className="rst-input-row">
                  <Inline className="rst-prefix"><IndianRupee size={14} /></Inline>
                  <Input
                    id={`${item.uid}-price`}
                    className={`rst-input${errors[menuKey(index, 'price')] ? ' is-bad' : ''}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={item.price}
                    onChange={(event) => update(item.uid, { price: event.target.value })}
                    onBlur={() => touch(menuKey(index, 'price'))}
                    placeholder="180"
                  />
                </Box>
              </Field>
            </Box>

            <Box className="rst-grid-2">
              <Field label="Food Type" htmlFor={`${item.uid}-veg`}>
                <Box className="rst-chips" id={`${item.uid}-veg`}>
                  {IS_VEG_OPTIONS.map((option) => (
                    <PlainButton
                      key={option.id}
                      type="button"
                      className={`rst-chip${item.isVeg === option.id ? ' is-on' : ''}`}
                      onClick={() => update(item.uid, { isVeg: option.id })}
                      aria-pressed={item.isVeg === option.id}
                    >
                      {option.label}
                    </PlainButton>
                  ))}
                </Box>
              </Field>

              {/* Only ever a REAL discount. An empty box is no offer, and the
                  backend reads zero as a dish being given away — see
                  `sanitiseProduct`, which keeps null and 0 apart on purpose. */}
              <Field
                label="Offer Price (₹)"
                optional
                htmlFor={`${item.uid}-offer`}
                error={errors[menuKey(index, 'discountedPrice')]}
              >
                <Box className="rst-input-row">
                  <Inline className="rst-prefix"><IndianRupee size={14} /></Inline>
                  <Input
                    id={`${item.uid}-offer`}
                    className={`rst-input${errors[menuKey(index, 'discountedPrice')] ? ' is-bad' : ''}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={item.discountedPrice}
                    onChange={(event) => update(item.uid, { discountedPrice: event.target.value })}
                    onBlur={() => touch(menuKey(index, 'discountedPrice'))}
                    placeholder="Leave empty if none"
                  />
                </Box>
              </Field>
            </Box>

            <Field label="Description" optional htmlFor={`${item.uid}-desc`}>
              <Input
                id={`${item.uid}-desc`}
                className="rst-input"
                type="text"
                maxLength={200}
                value={item.description}
                onChange={(event) => update(item.uid, { description: event.target.value })}
                placeholder="What is in it, or what it is served with"
              />
            </Field>

            <Field
              label="Dish Photo"
              optional
              hint={item.photoName && !item.photoFile ? `From sheet: ${item.photoName}` : undefined}
              error={errors[menuKey(index, 'photo')]}
            >
              <FileDrop
                id={`${item.uid}-photo`}
                file={item.photoFile}
                onChange={(picked) => update(item.uid, { photoFile: picked })}
                /* Pictures only — a PDF of a menu card is not a dish photo,
                   and the upload route stores images. */
                accept="image/*"
                preview
                compact
              />
            </Field>
          </Box>
          );
        })}

        {/* One list for every category input on the step. */}
        <datalist id="rst-menu-categories">
          {MENU_CATEGORY_OPTIONS.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        <PlainButton
          type="button"
          className="rst-btn-link"
          onClick={addItem}
          style={{ marginTop: items.length ? '12px' : '10px' }}
        >
          <Plus size={15} />
          {items.length ? 'Add another dish' : 'Add a dish'}
        </PlainButton>

        {started > 0 && (
          <Text className="rst-hint" style={{ marginTop: '10px' }}>
            {started} dish{started === 1 ? '' : 'es'} will be submitted with this application
            {withPhotos > 0 && `, ${withPhotos} with a photo`}. Empty rows are dropped.
          </Text>
        )}

        <FieldError message={errors.menu} />
      </Box>
    </Box>
  );
}
