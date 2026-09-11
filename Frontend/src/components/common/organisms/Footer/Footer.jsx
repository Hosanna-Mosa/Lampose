import React from 'react';
import { Link } from 'react-router-dom';
import logoImg from '../../../../assets/logo.png';
import { FOOTER_DESC, SOCIALS, FOOTER_COLS } from '../../../../data/site';
import { Anchor, Box, ContentInfo, Heading, Image, Inline, List, ListItem, Text } from '../../atoms';

export const Footer = () => (
  <ContentInfo>
    <Box className="footer-grid">
      <Box className="f-brand">
        <Link to="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
          <Image src={logoImg} alt="Lampose" className="footer-logo-img" />
        </Link>
        <Box className="footer-hq">📍 Founded in Visakhapatnam · Serving India</Box>
        <Text className="footer-desc">{FOOTER_DESC}</Text>
        <Box className="socials">
          {SOCIALS.map(s => (
            <Anchor className="social" href="#top" key={s} aria-label="Social link">{s}</Anchor>
          ))}
        </Box>
      </Box>

      {FOOTER_COLS.map(col => (
        <Box className="footer-col" key={col.title}>
          <Heading level={4}>{col.title}</Heading>
          <List>
            {col.links.map(l => (
              <ListItem key={l.label}>
                {l.to
                  ? <Link to={l.to}>{l.label}</Link>
                  : <Anchor href={l.href || '#top'}>{l.label}</Anchor>}
              </ListItem>
            ))}
          </List>
        </Box>
      ))}
    </Box>

    <Box className="footer-bottom">
      <Inline>© 2025 Lampose Technologies Pvt. Ltd. All rights reserved.</Inline>
    </Box>
  </ContentInfo>
);
