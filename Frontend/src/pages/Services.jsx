import { useState } from 'react';
import { Banner as SiteBanner } from '../components/common/organisms/Banner/Banner';
import { SecHead } from '../components/common/molecules/SecHead/SecHead';
import {
  CARDS, FEAT_HEAD, HEAD, PANELS, TABS, TAB_FEATURES,
} from '../data/services';
import { ServiceCard } from '../components/services/molecules/ServiceCard/ServiceCard';
import { DetailPanel } from '../components/services/organisms/DetailPanel/DetailPanel';
import { FeatureTabs } from '../components/services/organisms/FeatureTabs/FeatureTabs';
import { Box, Break, Emphasis, Heading, Inline, Region, Text } from '../components/common/atoms';

/* ══ Service card ═════════════════════════════════════════════════════════
   Clicking a card opens the shared detail panel below the grid and tints it
   with that card's accent. Clicking the open card again closes it.
   ════════════════════════════════════════════════════════════════════════ */

/* ══ Detail panel ═════════════════════════════════════════════════════════
   Height is animated with grid-template-rows 0fr → 1fr, which is what lets an
   auto-height block transition without measuring it in JS.
   ════════════════════════════════════════════════════════════════════════ */

/* ══ Feature tabs ═════════════════════════════════════════════════════════
   Switching a tab flies the new cards in from the side you moved towards:
   pick a tab to the right and they enter from the right, to the left and they
   enter from the left. The direction is what makes it read as navigation
   rather than a generic fade — the set appears to slide into place from
   wherever you just pointed.
   ════════════════════════════════════════════════════════════════════════ */

/* ══ Page ═════════════════════════════════════════════════════════════════ */
export function Services() {
  const [open, setOpen] = useState(null);
  const activeColor = CARDS.find(c => c.key === open)?.color;

  return (
    <>
      <Region id="services">
        <Box className="sec-inner">
          <Box className="reveal">
            <SiteBanner set="services" />
            <Inline className="sec-tag">{HEAD.tag}</Inline>
            <Heading level={2} className="sec-h2">
              {HEAD.title}<Break /><Emphasis>{HEAD.em}</Emphasis>
            </Heading>
            <Text className="sec-sub">{HEAD.sub}</Text>
          </Box>

          <Box className="services-grid">
            {CARDS.map((c, i) => (
              <ServiceCard
                key={c.key} card={c} delay={i * 110}
                open={open === c.key}
                onToggle={() => setOpen(v => (v === c.key ? null : c.key))}
              />
            ))}
          </Box>

          <DetailPanel activeKey={open} color={activeColor} />
        </Box>
      </Region>

      <Box className="divider" />

      <Region id="features">
        <Box className="sec-inner">
          <SecHead tag={FEAT_HEAD.tag} title={FEAT_HEAD.title} em={FEAT_HEAD.em} sub={FEAT_HEAD.sub} />
          <FeatureTabs />
        </Box>
      </Region>
    </>
  );
}
