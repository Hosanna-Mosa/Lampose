import React from 'react';
import { useState, useRef, useEffect } from 'react';
import { REDUCED } from '../../../../hooks/useSite';
import { TABS } from '../../../../data/services';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { TAB_FEATURES } from '../../../../data/services';
import { Box, Heading, Inline, PlainButton, Text } from '../../../common/atoms';

export function FeatureTabs() {
  const [tab, setTab] = useState('user');
  const [dir, setDir] = useState(1);
  const [switched, setSwitched] = useState(false);
  const [seen, setSeen] = useState(false);
  const wrap = useRef(null);

  /* The fly-in is reserved for real tab switches. On first load the pane would
     otherwise animate while still below the fold and be over before it is ever
     looked at, so the opening entrance waits until the grid is on screen. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (REDUCED) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const select = key => {
    if (key === tab) return;
    const from = TABS.findIndex(t => t.key === tab);
    const to = TABS.findIndex(t => t.key === key);
    setDir(to > from ? 1 : -1);
    setSwitched(true);
    setTab(key);
  };

  return (
    <>
      <Box className="feat-tabs">
        {TABS.map(t => (
          <PlainButton
            key={t.key}
            className={`ftab${t.key === tab ? ' active' : ''}`}
            onClick={() => select(t.key)}
          >
            {t.label}
          </PlainButton>
        ))}
      </Box>

      {/* Keyed on the tab so React remounts the whole pane, which is what
          replays the entrance. --dir carries the travel direction into CSS and
          --i carries each card's place in the stagger. */}
      <Box
        ref={wrap}
        className={`feat-grid tab-pane${switched ? ' is-switching' : seen ? ' is-entering' : ''}`}
        key={tab}
        style={{ display: 'grid', '--dir': String(dir) }}
      >
        {TAB_FEATURES[tab].map((f, i) => (
          <Box
            className="feat-card" key={f.h}
            style={{ '--i': String(i) }}
          >
            <Inline className="feat-ico"><Icon name={f.icon} /></Inline>
            <Heading level={3}>{f.h}</Heading>
            <Text>{f.p}</Text>
          </Box>
        ))}
      </Box>
    </>
  );
}
