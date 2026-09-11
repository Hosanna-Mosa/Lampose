import { useState } from 'react';
import { Banner as SiteBanner } from '../components/common/organisms/Banner/Banner';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { SecHead } from '../components/common/molecules/SecHead/SecHead';
import { APK } from '../components/download/utils/apk';
import { CARDS } from '../components/download/utils/cards';
import { PartnerPopup } from '../components/download/organisms/PartnerPopup/PartnerPopup';
import { Anchor, Box, Emphasis, Heading, Inline, List, ListItem, Region, Small, Strong, Text } from '../components/common/atoms';

/* The partner builds are ~43 MB each and live on the origin, so they are
   served from there rather than committed into this repo. */


/* ══ Partner APK chooser ══════════════════════════════════════════════════
   The partner build ships in two flavours, so the direct-download button asks
   which one before starting the transfer.
   ════════════════════════════════════════════════════════════════════════ */

export function Download() {
  const [popup, setPopup] = useState(false);

  return (
    <Region id="download">
      <Box className="sec-inner">
        <Box className="reveal" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <SiteBanner set="download" />
          <Inline className="sec-tag">Download</Inline>
          <Heading level={2} className="sec-h2">One account, <Emphasis>three apps.</Emphasis></Heading>
          <Text className="sec-sub" style={{ margin: '0.75rem auto' }}>
            Which one you need depends on which side of Lampose you are on. All three are
            free, and all three talk to each other.
          </Text>
        </Box>

        <Box className="dl-grid">
          {CARDS.map((c, i) => (
            <Box
              className={`dl-card reveal${c.cardCls ? ` ${c.cardCls}` : ''}`}
              key={c.key} style={{ transitionDelay: `${i * 120}ms` }}
            >
              <Box className="dl-card-top">
                <Box className="dl-icon-wrap" style={{ background: c.iconBg }}><Icon name={c.icon} /></Box>
                <Box className={`dl-badge ${c.badgeCls}`}>{c.badge}</Box>
              </Box>

              <Heading level={3} className="dl-title">{c.title}</Heading>
              <Text className="dl-desc">{c.desc}</Text>

              <List className="dl-features">
                {c.features.map((f, k) => <ListItem key={f} style={{ '--i': String(k) }}>{f}</ListItem>)}
              </List>

              <Box className="dl-btns">
                <Anchor className="dl-btn dl-primary" href="#top" onClick={e => e.preventDefault()}>
                  <Inline className="dl-btn-icon"><Icon name="track" /></Inline>
                  <Box className="dl-btn-text"><Small>Get it on</Small><Strong>Google Play</Strong></Box>
                </Anchor>
                <Anchor
                  className="dl-btn dl-apk"
                  href={c.popup ? undefined : '#top'}
                  onClick={e => {
                    e.preventDefault();
                    if (c.popup) setPopup(true);
                  }}
                >
                  <Inline className="dl-btn-icon"><Icon name="orders" /></Inline>
                  <Box className="dl-btn-text">
                    <Small>Direct Download</Small><Strong>{c.apkLabel}</Strong>
                  </Box>
                </Anchor>
              </Box>

              <Text className="dl-note">v1.0 · Android 8.0+ · iOS 14+</Text>
            </Box>
          ))}
        </Box>

        <PartnerPopup open={popup} onClose={() => setPopup(false)} />

        {/* Hidden on the live site too — kept so the markup stays a match. */}
        <Box className="dl-strip reveal" style={{ transitionDelay: '300ms', display: 'none' }}>
          <Box className="dl-strip-icon"><Icon name="qr" /></Box>
          <Box className="dl-strip-text">
            <Strong>Can&apos;t find it on the store?</Strong>
            <Inline>
              Download APK files directly and install on any Android device —
              no Play Store needed.
            </Inline>
          </Box>
          <Box className="dl-strip-btns">
            <Anchor className="dl-strip-btn" href="#top">User APK ↓</Anchor>
            <Anchor className="dl-strip-btn" href="#top">Partner APK ↓</Anchor>
            <Anchor className="dl-strip-btn" href="#top">Delivery APK ↓</Anchor>
          </Box>
        </Box>
      </Box>
    </Region>
  );
}
