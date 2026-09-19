import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, FieldSet, Heading, Inline, Input, Label, Legend, PlainButton, Text, TextArea,
} from '../../../common/atoms';
import { DietMark } from '../../atoms/DietMark';
import { PhotoTile } from '../../atoms/PhotoTile';
import { SPICE_LABEL } from '../../../../food/cart';
import { kitchenById, readyLabel, rupees } from '../../../../data/food';

/* ══════════════════════════════════════════════════════════════════════════
   The dish sheet — what is being added, and everything the kitchen needs to
   know before it cooks it.

   Every dish opens this, not only the ones with add-ons. A dish with nothing
   to choose still has a description worth reading, a portion worth checking
   and a note worth leaving, and a row that sometimes opens a panel and
   sometimes silently adds an item is a row nobody trusts.

   ## What it can and cannot change

   The add-ons move the price and the sheet says so as they are ticked. The
   note does not, and the sheet says that too — "less oil" is a request, and
   a kitchen that charges for it would be quoting a price the diner never
   saw. A sold-out add-on stays listed and disabled, because its absence is
   information about tonight rather than a permanent fact about the menu.
   ══════════════════════════════════════════════════════════════════════════ */

export function DishSheet({ dish, onClose, onAdd }) {
  const kitchen = kitchenById(dish.kitchenId);

  const [qty, setQty] = useState(1);
  const [spice, setSpice] = useState(dish.spiceFixed ? null : 'medium');
  const [picked, setPicked] = useState([]);
  const [note, setNote] = useState('');
  const panel = useRef(null);

  /* Escape closes it, like every other dialog on the site. */
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { panel.current?.focus(); }, []);

  const addOns = useMemo(() => (dish.addOns || []).filter(a => !a.soldOut), [dish]);
  const chosen = useMemo(() => addOns.filter(a => picked.includes(a.id)), [addOns, picked]);
  const extras = chosen.reduce((sum, a) => sum + a.price, 0);
  const unit = dish.price + extras;

  const toggle = id => setPicked(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  return (
    <Box className="fd-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <Box
        className="fd-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dish-title"
        tabIndex={-1}
        ref={panel}
      >
        {/* ── the dish, and the facts that do not change ── */}
        <Box className="fd-sheet__left">
          <PhotoTile tone={dish.tone} className="fd-sheet__photo" label="Dish photo" />

          <Box className="fd-sheet__aside">
            <Text className="fd-lbl">From this kitchen</Text>
            <Box className="fd-sheet__kitchen">
              <PhotoTile tone={kitchen.tone} className="fd-sheet__kitchenThumb" />
              <Box>
                <Inline className="fd-sheet__kitchenName">{kitchen.name}</Inline>
                <Inline className="fd-sheet__kitchenMeta">
                  {kitchen.rating} ★ · {kitchen.walkMinutes} min walk
                  {kitchen.openNow ? ` · open till ${kitchen.closesAt}` : ` · opens at ${kitchen.opensAt}`}
                </Inline>
              </Box>
            </Box>

            {(dish.serves || dish.allergens?.length) && (
              <>
                <Text className="fd-lbl">Good to know</Text>
                <Box className="fd-sheet__facts">
                  {(dish.serves || '').split(' · ').filter(Boolean).map(fact => (
                    <Inline className="fd-pill" key={fact}>{fact}</Inline>
                  ))}
                  <Inline className="fd-pill">Cooked to order</Inline>
                </Box>
                {dish.allergens?.length > 0 && (
                  <Box className="fd-callout fd-callout--warn">
                    <Text>
                      Contains <Inline className="fd-strong">{dish.allergens.join(', ').toLowerCase()}</Inline>.
                      Your saved allergen list flags this dish.
                    </Text>
                  </Box>
                )}
              </>
            )}
          </Box>
        </Box>

        {/* ── what there is to choose ── */}
        <Box className="fd-sheet__right">
          <Box className="fd-sheet__head">
            <Box className="fd-sheet__headText">
              <Box className="fd-dish__marks">
                <DietMark diet={dish.diet} size={16} />
                {dish.bestseller && <Inline className="fd-flag">BESTSELLER</Inline>}
              </Box>
              <Heading level={2} id="dish-title" className="fd-sheet__name">{dish.name}</Heading>
              <Box className="fd-dish__price">
                <Inline className="fd-sheet__rupees">{rupees(dish.price)}</Inline>
                {dish.rating && (
                  <Inline className="fd-dish__rating">
                    {dish.rating} ★ <Inline className="fd-dish__ratingCount">{dish.ratingCount} ratings</Inline>
                  </Inline>
                )}
              </Box>
              {dish.description && <Text className="fd-sheet__desc">{dish.description}</Text>}
            </Box>
            <PlainButton type="button" className="fd-sheet__close" onClick={onClose} aria-label="Close">✕</PlainButton>
          </Box>

          <Box className="fd-sheet__body">
            {!dish.spiceFixed && (
              <FieldSet className="fd-field">
                <Legend>Spice level <Inline className="fd-field__opt">· required</Inline></Legend>
                <Box className="fd-choices fd-choices--row">
                  {Object.entries(SPICE_LABEL).map(([key, label]) => (
                    <Label key={key} className={`fd-choice${spice === key ? ' is-on' : ''}`}>
                      <Input
                        type="radio"
                        name="spice"
                        checked={spice === key}
                        onChange={() => setSpice(key)}
                      />
                      <Inline>{label}</Inline>
                    </Label>
                  ))}
                </Box>
              </FieldSet>
            )}

            {dish.spiceFixed && (
              <Box className="fd-callout">
                <Text>This one is cooked to a set spice — the kitchen makes it in one pot.</Text>
              </Box>
            )}

            {dish.addOns?.length > 0 && (
              <FieldSet className="fd-field">
                <Legend>Add to the plate <Inline className="fd-field__opt">· optional, pick any</Inline></Legend>
                <Box className="fd-choices">
                  {dish.addOns.map(addOn => (
                    <Label
                      key={addOn.id}
                      className={`fd-choice fd-choice--wide${picked.includes(addOn.id) ? ' is-on' : ''}${addOn.soldOut ? ' is-off' : ''}`}
                    >
                      <Input
                        type="checkbox"
                        disabled={addOn.soldOut}
                        checked={picked.includes(addOn.id)}
                        onChange={() => toggle(addOn.id)}
                      />
                      <Inline className="fd-choice__label">
                        {addOn.label}{addOn.soldOut ? ' · finished for today' : ''}
                      </Inline>
                      <Inline className="fd-choice__price">+ {rupees(addOn.price)}</Inline>
                    </Label>
                  ))}
                </Box>
              </FieldSet>
            )}

            <Box className="fd-field">
              <Label htmlFor="dish-note">
                A note for the kitchen <Inline className="fd-field__opt">· optional</Inline>
              </Label>
              <TextArea
                id="dish-note"
                rows={2}
                className="fd-textarea"
                placeholder="Less oil, pack the curd separately…"
                value={note}
                onChange={e => setNote(e.target.value)}
              />
              <Text className="fd-note">
                The kitchen reads this on the order ticket. It cannot change the price.
              </Text>
            </Box>
          </Box>

          <Box className="fd-sheet__foot">
            <Box className="fd-qty fd-qty--lg">
              <PlainButton type="button" onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Fewer">−</PlainButton>
              <Inline className="fd-qty__n">{qty}</Inline>
              <PlainButton type="button" onClick={() => setQty(q => Math.min(20, q + 1))} aria-label="More">+</PlainButton>
            </Box>

            <Box className="fd-sheet__ready">
              <Inline>Ready about {readyLabel(kitchen.prepMinutes)}</Inline>
              <Inline>
                {rupees(dish.price)}
                {chosen.map(a => ` + ${rupees(a.price)} ${a.label.toLowerCase()}`).join('')}
              </Inline>
            </Box>

            <PlainButton
              type="button"
              className="fd-btn fd-btn--dark fd-btn--lg"
              onClick={() => onAdd({ qty, addOns: chosen, spice, note })}
            >
              Add item · {rupees(unit * qty)}
            </PlainButton>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
