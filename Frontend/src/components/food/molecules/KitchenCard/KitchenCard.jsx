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
    deliveryFee, deliveryWindow, pureVeg, openNow, opensAt, offer, tone,
    coverUrl, logoUrl, sections,
  } = kitchen;

  /* No dish at all: the kitchen is approved and listed but has not typed its
     menu in yet. Said on the card, because "See menu" over an empty page is a
     button that lets somebody down. */
  const noMenu = !(sections && sections.length);

  return (
    <Article className="fd-card reveal" style={{ '--i': String(index) }}>
      <Link to={`/food/kitchen/${id}`} className="fd-card__media" aria-label={`${name} — see the menu`}>
        <PhotoTile tone={tone} src={coverUrl || logoUrl} alt={name} label={openNow ? 'Photo' : null}>
          {offer && openNow && <Inline className="fd-card__offer">{offer}</Inline>}
          {openNow
            /* Only with a time to show. A kitchen with no preparation time has
               an empty window, and an empty white pill on a photograph looks
               like a rendering fault. */
            ? (deliveryWindow ? <Inline className="fd-card__eta">{deliveryWindow}</Inline> : null)
            : (
              <Box className="fd-card__shut">
                <Inline className="fd-card__shutTitle">Closed right now</Inline>
                {/* No "pre-order allowed": the order path refuses a closed kitchen
                    (409 RESTAURANT_CLOSED), so the fixture's promise was false.
                    And `opensAt` is empty when the owner shut the kitchen by hand
                    - there is then no time to give, and inventing one is worse. */}
                <Inline className="fd-card__shutSub">
                  {opensAt ? `Opens at ${opensAt}` : 'Not taking orders right now'}
                </Inline>
              </Box>
            )}
        </PhotoTile>
      </Link>

      <Box className="fd-card__body">
        <Box className="fd-card__head">
          <DietMark diet={pureVeg ? 'veg' : 'nonveg'} />
          <Heading level={3} className="fd-card__name">{name}</Heading>
          {/* "New" until somebody has rated it. A rating of 0 with a count of 0
              is "nobody has said", not "zero stars" - printing "0 ★" tells a
              hungry visitor the kitchen is terrible, which nobody claimed. */}
          <Inline className={`fd-rating${ratingCount > 0 && rating >= 4.2 ? '' : ' fd-rating--soft'}`}>
            {ratingCount > 0 ? `${rating} ★` : 'New'}
          </Inline>
        </Box>

        {/* Every part is optional now that this is real data. `costForOne` is 0
            for a kitchen whose menu is not typed in yet, and `walkMinutes` is
            null unless the visitor shared a location - the template used to
            print "₹0 for one" and "null min walk". */}
        <Text className="fd-card__meta">
          {[cuisine, costForOne > 0 ? `${rupees(costForOne)} for one` : ''].filter(Boolean).join(' · ')}
        </Text>
        <Text className="fd-card__meta">
          {[landmark, walkMinutes != null ? `${walkMinutes} min walk` : ''].filter(Boolean).join(' · ')}
        </Text>

        <Box className="fd-card__facts">
          {[
            deliveryFee ? `Delivery ${rupees(deliveryFee)}` : 'Free delivery',
            ratingCount > 0 ? `${ratingCount.toLocaleString('en-IN')} ratings` : '',
          ].filter(Boolean).flatMap((fact, i) => [
            ...(i ? [<Inline key={`sep-${fact}`} aria-hidden="true">|</Inline>] : []),
            <Inline key={fact}>{fact}</Inline>,
          ])}
        </Box>

        <Link
          to={`/food/kitchen/${id}`}
          className={`fd-btn${openNow && !noMenu ? ' fd-btn--dark' : ' fd-btn--ghost'} fd-card__cta`}
        >
          {noMenu ? 'Menu coming soon' : openNow ? 'See menu' : 'Browse menu'}
        </Link>
      </Box>
    </Article>
  );
}
