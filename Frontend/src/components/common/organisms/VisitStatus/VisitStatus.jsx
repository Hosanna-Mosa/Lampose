import { Icon } from '../../atoms/Icon/Icon';
import { VisitNextSteps } from '../VisitNextSteps/VisitNextSteps';
import { STATES } from '../../utils/visitStates';
import { Box, Heading, Inline, PlainButton, Strong, Text } from '../../atoms';

/* ══════════════════════════════════════════════════════════════════════════
   What the visitor sees once the owner has been asked.

   This replaces the button rather than sitting beside it: the question has
   been put, and offering to put it again is both untrue and a way to make
   someone's phone ring twice.

   Four states, and each one says what happens next — a status with no next
   step just leaves the visitor holding it.
   ══════════════════════════════════════════════════════════════════════════ */


const when = value => {
  if (!value) return null;
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
};

export function VisitStatus({ request, onAskAgain, onRefresh }) {
  const state = STATES[request.status];
  if (!state) return null;

  const waiting = request.status === 'pending_owner';

  /* Only after an expiry. A decline is an answer, and the backend holds one
     request per property per day — offering "ask again" on a "no" would put
     up a button whose only possible outcome is being refused. */
  const canRetry = request.status === 'expired';

  return (
    /*
     * The answer, and then what to do about it — as two stacked cards.
     *
     * `VisitNextSteps` used to render inside `.vs-body`, which is the wrong
     * place for it: that column starts after a 34px badge and its gutter, so
     * a card in the listing rail had about 215px to lay two tabs and a date
     * field out in. As a sibling it gets the rail's full width, and the
     * status card goes back to being only the status.
     */
    <Box className="vs-wrap">
      <Box className={`vs-card ${state.cls}`} role="status" aria-live="polite">
        <Inline className="vs-badge">
          {waiting
            ? <Inline className="vs-spinner" aria-hidden="true" />
            : <Icon name={state.icon} className="exp-ico" />}
        </Inline>

        <Box className="vs-body">
          <Heading level={3} className="vs-title">{state.title}</Heading>
          <Text className="vs-lead">{state.lead}</Text>

          <Text className="vs-meta">
            {/* Which room was asked about — a listing can have four, and the
                answer only applies to one of them. */}
            {request.sharing?.label && <><Strong>{request.sharing.label}</Strong> · </>}
            {waiting
              ? <>Asked {when(request.createdAt)} · checking every few seconds</>
              : <>Answered {when(request.decidedAt)}</>}
          </Text>

          {canRetry && (
            <PlainButton className="exp-more vs-again" onClick={onAskAgain}>
              Ask again <Inline aria-hidden="true">→</Inline>
            </PlainButton>
          )}
        </Box>
      </Box>

      {/* The ₹199 assisted visit — pay once, pick the slot on WhatsApp, get
          the address with it. (The ₹20 token and ₹99 unlock this rail used
          to hold are retired, server-side included.) */}
      <VisitNextSteps request={request} onUpdated={onRefresh} />
    </Box>
  );
}
