import React from 'react';
import {
  IndianRupee, Plus, Trash2, UtensilsCrossed,
} from 'lucide-react';
import {
  Box, Inline, Input, PlainButton, Text,
} from '../../../common/atoms';
import { Field, FieldError, Note, SectionHead } from '../../molecules/Field/Field';
import { FileDrop } from '../../molecules/FileDrop/FileDrop';
import {
  COPY, IS_VEG_OPTIONS, MENU_CATEGORY_OPTIONS, createMenuItem, isMenuItemStarted,
} from '../../utils/restaurantOptions';
import { menuKey } from '../../utils/validateRestaurant';

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

export function MenuSection({ form, set, errors = {}, touch = () => {} }) {
  const items = form.menuItems || [];

  const update = (uid, patch) => {
    set({
      menuItems: items.map((item) => (item.uid === uid ? { ...item, ...patch } : item)),
    });
  };

  const addItem = () => set({ menuItems: [...items, createMenuItem()] });

  const removeItem = (uid) => set({ menuItems: items.filter((item) => item.uid !== uid) });

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

        {items.length === 0 && (
          <Note tone="info" icon={<UtensilsCrossed size={15} />}>
            No dishes added. You can leave this empty — the owner adds the full menu, with
            photographs, from the Food-Partner app once Lampose approves the restaurant.
          </Note>
        )}

        {items.map((item, index) => (
          <Box key={item.uid} className="rst-dish" id={`rst-menu-${index}`} tabIndex={-1}>
            <Box className="rst-dish-head">
              <Text className="rst-dish-num">Dish {index + 1}</Text>
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

            <Field label="Dish Photo" optional error={errors[menuKey(index, 'photo')]}>
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
        ))}

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
