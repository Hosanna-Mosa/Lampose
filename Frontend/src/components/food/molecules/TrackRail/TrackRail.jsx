import React from 'react';
import { Box, Inline, Text } from '../../../common/atoms';

/* ══ Track rail ═══════════════════════════════════════════════════════════
   One column of steps, used twice on the tracking page: once for the
   KITCHEN's track (placed → accepted → cooking → ready) and once for the
   RIDER's (searching → accepted → picked up → handed over).

   They are drawn side by side and not merged, because they are not one
   sequence: an order is cooked and looked for at the same time, and a single
   rail would have to lie about the order of two things that overlap. They
   meet at "picked up", which only the rider can set.

   A step is done because an event said so — `done` comes off the order, and
   nothing here infers that a step finished from a later step having started.
   ════════════════════════════════════════════════════════════════════════ */

export function TrackRail({ title, steps }) {
  return (
    <Box className="fd-track">
      <Text className="fd-lbl">{title}</Text>
      {steps.map((step, i) => (
        <Box className="fd-step" key={step.label}>
          <Box className="fd-step__rail">
            <Inline className={`fd-step__dot${step.done ? ' is-done' : ''}${step.current ? ' is-now' : ''}`}>
              {step.done && (
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
              )}
            </Inline>
            {i < steps.length - 1 && <Inline className={`fd-step__line${step.done ? ' is-done' : ''}`} />}
          </Box>
          <Box className="fd-step__text">
            <Inline className={`fd-step__label${step.done || step.current ? '' : ' is-ahead'}`}>{step.label}</Inline>
            {(step.at || step.note) && (
              <Inline className={`fd-step__at${step.current ? ' is-now' : ''}`}>
                {[step.at, step.note].filter(Boolean).join(' · ')}
              </Inline>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}
