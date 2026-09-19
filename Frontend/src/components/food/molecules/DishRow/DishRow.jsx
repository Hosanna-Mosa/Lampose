import React from 'react';
import { Article, Box, Heading, Inline, PlainButton, Text } from '../../../common/atoms';
import { DietMark } from '../../atoms/DietMark';
import { PhotoTile } from '../../atoms/PhotoTile';
import { AddControl } from '../AddControl';
import { rupees } from '../../../../data/food';

/* ══ Dish row ═════════════════════════════════════════════════════════════
   The menu line: everything readable before the photo, because the photo is
   the half most likely to be missing.

   The whole text column opens the sheet — a dish with add-ons cannot be
   ordered from the row alone, and a dish without them still deserves the
   description, the portion and the note field.
   ════════════════════════════════════════════════════════════════════════ */

export function DishRow({ dish, qty = 0, onOpen, onLess, onMore, closed = false }) {
  const {
    name, price, description, diet, serves, rating, ratingCount,
    bestseller, soldOut, soldOutNote, ordersInBlock, addOns, tone,
  } = dish;

  return (
    <Article className={`fd-dish${soldOut ? ' fd-dish--out' : ''}`}>
      <Box className="fd-dish__text">
        <Box className="fd-dish__marks">
          <DietMark diet={diet} />
          {bestseller && <Inline className="fd-flag">BESTSELLER</Inline>}
        </Box>

        <Heading level={3} className="fd-dish__name">{name}</Heading>

        <Box className="fd-dish__price">
          <Inline className="fd-dish__rupees">{rupees(price)}</Inline>
          {rating && (
            <Inline className="fd-dish__rating">
              {rating} ★ <Inline className="fd-dish__ratingCount">({ratingCount})</Inline>
            </Inline>
          )}
        </Box>

        {description && <Text className="fd-dish__desc">{description}</Text>}

        {(serves || ordersInBlock || soldOutNote) && (
          <Text className="fd-dish__serves">
            {[
              serves,
              ordersInBlock ? `${ordersInBlock} orders from your block this week` : null,
              soldOut ? soldOutNote : null,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
      </Box>

      <Box className="fd-dish__side">
        {soldOut ? (
          <PhotoTile tone={tone} className="fd-dish__photo" />
        ) : (
          <PlainButton type="button" className="fd-dish__photoBtn" onClick={onOpen} aria-label={`${name} — see details`}>
            <PhotoTile tone={tone} className="fd-dish__photo" />
          </PlainButton>
        )}

        <Box className="fd-dish__add">
          <AddControl
            qty={qty}
            soldOut={soldOut}
            closed={closed}
            onAdd={onOpen}
            onLess={onLess}
            onMore={onMore}
          />
        </Box>

        {addOns?.length > 0 && !soldOut && <Inline className="fd-dish__custom">Customisable</Inline>}
      </Box>
    </Article>
  );
}
