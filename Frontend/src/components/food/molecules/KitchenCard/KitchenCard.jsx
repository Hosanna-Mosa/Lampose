import React from 'react';
import { Link } from 'react-router-dom';
import { Article, Box, Heading, Inline, Text } from '../../../common/atoms';
import { DietMark } from '../../atoms/DietMark';
import { PhotoTile } from '../../atoms/PhotoTile';
import { rupees } from '../../../../data/food';

/* ══ Kitchen card ═════════════════════════════════════════════════════════
   One kitchen in the feed. Everything on it is a fact the restaurant filed:
   the rating and its count, the walk, the fee, the minimum. There is no
   "recommended for you" and no invented badge.

   A closed kitchen still gets a card, with the closure written across the
   photo and its opening time beside it — a kitchen that vanishes at 4 pm
   reads as a kitchen that left the platform.
   ════════════════════════════════════════════════════════════════════════ */

export function KitchenCard({ kitchen, index = 0 }) {
  const {
    id, name, cuisine, costForOne, landmark, walkMinutes, rating, ratingCount,
    deliveryFee, minOrder, deliveryWindow, pureVeg, openNow, opensAt, offer, tone,
  } = kitchen;

  return (
    <Article className="fd-card reveal" style={{ '--i': String(index) }}>
      <Link to={`/food/kitchen/${id}`} className="fd-card__media" aria-label={`${name} — see the menu`}>
        <PhotoTile tone={tone} label={openNow ? 'Photo' : null}>
          {offer && openNow && <Inline className="fd-card__offer">{offer}</Inline>}
          {openNow
            ? <Inline className="fd-card__eta">{deliveryWindow}</Inline>
            : (
              <Box className="fd-card__shut">
                <Inline className="fd-card__shutTitle">Closed right now</Inline>
                <Inline className="fd-card__shutSub">Opens at {opensAt} · pre-order allowed</Inline>
              </Box>
            )}
        </PhotoTile>
      </Link>

      <Box className="fd-card__body">
        <Box className="fd-card__head">
          <DietMark diet={pureVeg ? 'veg' : 'nonveg'} />
          <Heading level={3} className="fd-card__name">{name}</Heading>
          <Inline className={`fd-rating${rating >= 4.2 ? '' : ' fd-rating--soft'}`}>{rating} ★</Inline>
        </Box>

        <Text className="fd-card__meta">{cuisine} · {rupees(costForOne)} for one</Text>
        <Text className="fd-card__meta">{landmark} · {walkMinutes} min walk</Text>

        <Box className="fd-card__facts">
          <Inline>Min {rupees(minOrder)}</Inline>
          <Inline aria-hidden="true">|</Inline>
          <Inline>{deliveryFee ? `Delivery ${rupees(deliveryFee)}` : 'Free delivery'}</Inline>
          <Inline aria-hidden="true">|</Inline>
          <Inline>{ratingCount.toLocaleString('en-IN')} ratings</Inline>
        </Box>

        <Link to={`/food/kitchen/${id}`} className={`fd-btn${openNow ? ' fd-btn--dark' : ' fd-btn--ghost'} fd-card__cta`}>
          {openNow ? 'See menu' : 'Browse menu'}
        </Link>
      </Box>
    </Article>
  );
}
