import Icon from './Icon';
import VisitNextSteps from './VisitNextSteps';

/* ══════════════════════════════════════════════════════════════════════════
   What the visitor sees once the owner has been asked.

   This replaces the button rather than sitting beside it: the question has
   been put, and offering to put it again is both untrue and a way to make
   someone's phone ring twice.

   Four states, and each one says what happens next — a status with no next
   step just leaves the visitor holding it.
   ══════════════════════════════════════════════════════════════════════════ */

const STATES = {
  pending_owner: {
    cls: 'is-waiting', icon: 'clock',
    title: 'Waiting for the owner to confirm',
    lead: 'We\'ve sent your request on WhatsApp. Owners usually reply within a '
        + 'few hours, and this page updates on its own.',
  },
  /* `confirmed`, not `approved`: these keys are the API's own status values
     (models/VisitRequest.js in the main backend), so a rename there has to
     land here or the card falls through to rendering nothing. */
  confirmed: {
    cls: 'is-confirmed', icon: 'verified',
    title: 'The owner says it\'s available',
    lead: 'They have your number and can arrange a time with you. You can call '
        + 'them directly using the number in the details above.',
  },
  declined: {
    cls: 'is-declined', icon: 'bell',
    title: 'Not available at the moment',
    lead: 'The owner replied that this property isn\'t free to visit right now. '
        + 'There are similar rooms below and on Explore.',
  },
  expired: {
    cls: 'is-expired', icon: 'clock',
    title: 'The owner didn\'t reply',
    lead: 'We didn\'t hear back within 24 hours. You can try the owner directly '
        + 'on the number above, or ask again.',
  },
};

const when = value => {
  if (!value) return null;
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  });
};

export default function VisitStatus({ request, onAskAgain, onRefresh }) {
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
    <div className="vs-wrap">
      <div className={`vs-card ${state.cls}`} role="status" aria-live="polite">
        <span className="vs-badge">
          {waiting
            ? <span className="vs-spinner" aria-hidden="true" />
            : <Icon name={state.icon} className="exp-ico" />}
        </span>

        <div className="vs-body">
          <h3 className="vs-title">{state.title}</h3>
          <p className="vs-lead">{state.lead}</p>

          <p className="vs-meta">
            {/* Which room was asked about — a listing can have four, and the
                answer only applies to one of them. */}
            {request.sharing?.label && <><strong>{request.sharing.label}</strong> · </>}
            {waiting
              ? <>Asked {when(request.createdAt)} · checking every few seconds</>
              : <>Answered {when(request.decidedAt)}</>}
          </p>

          {canRetry && (
            <button className="exp-more vs-again" onClick={onAskAgain}>
              Ask again <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      </div>

      {/* The ₹199 assisted visit — pay once, pick the slot on WhatsApp, get
          the address with it. (The ₹20 token and ₹99 unlock this rail used
          to hold are retired, server-side included.) */}
      <VisitNextSteps request={request} onUpdated={onRefresh} />
    </div>
  );
}
