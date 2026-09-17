import { Banner as SiteBanner } from '../components/common/organisms/Banner/Banner';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { Link } from 'react-router-dom';
import { FINE } from '../hooks/useSite';
import { PARTNERS } from '../components/partners/utils/partners';
import { Testimonials } from '../components/partners/organisms/Testimonials/Testimonials';
import { Box, Emphasis, Heading, Inline, List, ListItem, Region, Text } from '../components/common/atoms';
import { useDeckSpread } from '../components/common/hooks/useDeckSpread/useDeckSpread';



/* ══ Testimonial carousel ═════════════════════════════════════════════════
   Translated by measured card width rather than a percentage, so the peek of
   the next card stays correct at every breakpoint.
   ════════════════════════════════════════════════════════════════════════ */

export function Partners() {
  const { spread, containerRef } = useDeckSpread();

  return (
    <>
      <Region id="partner">
        <Box className="sec-inner">
          <Box className="reveal">
            <SiteBanner set="partners" />
            <Inline className="sec-tag">Partner with us</Inline>
            <Heading level={2} className="sec-h2">Bring your rooms, <Emphasis>or your kitchen.</Emphasis></Heading>
            <Text className="sec-sub">
              Three ways onto Lampose. Every one of them starts with someone from
              our team turning up in person.
            </Text>
          </Box>

          <Box 
            ref={containerRef}
            className={`partner-deck-container ${spread ? 'is-spread' : ''}`}
          >
            <Box className="partner-deck">
              {PARTNERS.map((p, n) => (
                <Box className={`pcard deck-card card-${n}`} key={p.title} style={{ '--i': String(n) }}>
                  <Box className="p-icon"><Icon name={p.icon} /></Box>
                  <Heading level={3}>{p.title}</Heading>
                  <List className="p-list">
                    {p.points.map((pt, k) => <ListItem key={pt} style={{ '--i': String(k) }}>{pt}</ListItem>)}
                  </List>
                  <Link to="/download" className="btn-p" onClick={e => e.stopPropagation()}><Inline>{p.cta}</Inline></Link>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>
      </Region>

      <Box className="divider" />
      <Testimonials />
    </>
  );
}
