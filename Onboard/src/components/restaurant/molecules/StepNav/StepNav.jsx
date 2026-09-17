import React from 'react';
import { Check } from 'lucide-react';
import { Box, Inline, PlainButton, Text } from '../../../common/atoms';
import { STEPS } from '../../utils/restaurantOptions';

/*
 * Where the agent is in the form, said twice.
 *
 * Both components below are always rendered; the stylesheet shows exactly one
 * of them. That is deliberate rather than wasteful — a `window.innerWidth`
 * check in JavaScript is a value that is wrong for the first paint and wrong
 * again after a rotation, and this is the piece of chrome most likely to be
 * looked at mid-rotation.
 *
 * Backwards only. A completed step may be reopened to fix a typo; a step
 * ahead cannot be jumped to, because its gate has not passed — and the rail
 * is a map, not a way around the gates.
 */

export function StepRail({ step, onGo }) {
  return (
    <Box className="rst-rail">
      <Box className="rst-rail-inner">
        {STEPS.map((entry) => {
          const isActive = entry.num === step;
          const isDone = entry.num < step;

          return (
            <PlainButton
              key={entry.num}
              type="button"
              disabled={entry.num > step}
              onClick={() => onGo(entry.num)}
              className={`rst-rail-item${isActive ? ' is-active' : ''}${isDone ? ' is-done' : ''}`}
            >
              <Box className="rst-rail-num">
                {isDone ? <Check size={14} /> : entry.num}
              </Box>
              <Box>
                <Box className="rst-rail-label">{entry.label}</Box>
                <Box className="rst-rail-sub">{entry.sub}</Box>
              </Box>
            </PlainButton>
          );
        })}
      </Box>
    </Box>
  );
}

export function StepBar({ step }) {
  const current = STEPS.find((entry) => entry.num === step) || STEPS[0];

  return (
    <Box className="rst-topbar">
      <Box className="rst-topbar-row">
        <Text className="rst-topbar-title">{current.label}</Text>
        <Inline className="rst-topbar-count">
          Step {step} of {STEPS.length}
        </Inline>
      </Box>
      <Box className="rst-progress">
        {STEPS.map((entry) => (
          <Box
            key={entry.num}
            className={`rst-progress-seg${entry.num < step ? ' is-done' : ''}${entry.num === step ? ' is-active' : ''}`}
          />
        ))}
      </Box>
    </Box>
  );
}
