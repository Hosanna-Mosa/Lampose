import React from 'react';
import { PANELS } from '../../../../data/services';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { Box, Heading, Inline, Text } from '../../../common/atoms';

export function DetailPanel({ activeKey, color }) {
  return (
    <Box
      className={`svc-detail${activeKey ? ' open' : ''}`}
      style={{ '--panel-clr': color }}
    >
      <Box className="svc-detail-inner">
        {Object.entries(PANELS).map(([key, p]) => (
          <Box
            key={key}
            className={`svc-detail-content${key === activeKey ? ' active' : ''}`}
          >
            <Box className="svcd-head">
              <Inline className="svcd-icon"><Icon name={p.icon} /></Inline>
              <Box>
                <Heading level={4} className="svcd-title">{p.title}</Heading>
                <Text className="svcd-sub">{p.sub}</Text>
              </Box>
            </Box>

            <Box className="svcd-label">{p.gridLabel}</Box>
            <Box className="svcd-grid">
              {p.items.map(it => (
                <Box className="svcd-item" key={it.h}>
                  <Box className="svcd-item-h">
                    <Inline className="svcd-item-icon"><Icon name={it.icon} /></Inline>{it.h}
                  </Box>
                  <Text>{it.p}</Text>
                </Box>
              ))}
            </Box>

            <Box className="svcd-label">{p.flowLabel}</Box>
            <Box className="svcd-flow">
              {p.flow.map((step, i) => (
                <Fragment key={step}>
                  <Box className="svcd-step">
                    <Inline className="svcd-step-n">{i + 1}</Inline>{step}
                  </Box>
                  {i < p.flow.length - 1 && <Inline className="svcd-arrow">→</Inline>}
                </Fragment>
              ))}
            </Box>

            <Box className="svcd-foot">
              <Text className="svcd-note">{p.note}</Text>
              {/* The download page is gone; the thing this panel is selling
                  is a room, and Explore is where one is found. */}
              <Link className="svcd-cta" to="/explore">{p.cta} →</Link>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
