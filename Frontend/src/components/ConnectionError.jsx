import Icon from './Icon';

/* ══ Connection error ═════════════════════════════════════════════════════
   Shown in place of the listings when they could not be fetched.

   Written for the visitor, not for whoever has to fix it. The API address,
   the port, the CORS allow-list and the command that starts the backend are
   all things a visitor can do nothing about, and printing them on a public
   page tells a stranger more about the deployment than it tells the person
   who came here to find a room. The full diagnosis — kind, status, endpoint
   and the raw message — is still classified in listingsApi and logged to the
   console by the page that caught it, which is where a developer looks.

   Offline stays its own case: it is the one failure the visitor can act on.
   ════════════════════════════════════════════════════════════════════════ */

const REPORTS = {
  offline: {
    icon: 'reach',
    title: 'You appear to be offline',
    lead: 'Your device has no network connection right now. Reconnect and try again.',
  },
  default: {
    icon: 'track',
    title: 'Something went wrong at our end',
    lead: 'We could not load this just now. Please try again in a moment — if it '
        + 'keeps happening, let us know and we will look into it.',
  },
};

export default function ConnectionError({ error, onRetry, busy = false }) {
  const report = error?.kind === 'offline' ? REPORTS.offline : REPORTS.default;

  return (
    <div className="xp-err" role="alert">
      <span className="xp-err__badge">
        <Icon name={report.icon} className="xp-err__ico" />
      </span>

      <h3 className="xp-err__title">{report.title}</h3>
      <p className="xp-err__lead">{report.lead}</p>

      <div className="xp-err__foot">
        <button className="exp-more" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : 'Retry'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </div>
  );
}
