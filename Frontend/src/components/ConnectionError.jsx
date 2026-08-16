import Icon from './Icon';

/* ══ Connection error ═════════════════════════════════════════════════════
   Shown in place of the listings when they could not be fetched.

   The site keeps no local copy of the data, so this panel is what a broken
   link looks like — and it is worth more than a shrug. Each failure names the
   part that is down, what to check, and the exact endpoint that was tried, so
   the fix is a step rather than an investigation.
   ════════════════════════════════════════════════════════════════════════ */

const REPORTS = {
  offline: {
    icon: 'reach',
    title: 'You appear to be offline',
    lead: 'The browser has no network connection, so the listings could not be requested.',
    steps: ['Reconnect to a network, then retry.'],
  },
  server: {
    icon: 'track',
    title: 'Cannot reach the Lampose server',
    lead: 'Nothing answered at the API address, so no listings could be loaded.',
    steps: [
      'Start the backend: cd backend && npm run dev',
      'Confirm it is listening on the port in frontend/.env (VITE_API_BASE_URL).',
      'If the server is running, check its CORS allow-list covers this origin.',
    ],
  },
  database: {
    icon: 'wallet',
    title: 'Database not connected',
    lead: 'The server is running, but it cannot reach MongoDB — so there are no listings to show.',
    steps: [
      'Check MONGO_URI in backend/.env.',
      'Confirm the database is up and this machine is allowed to connect.',
      'Read the backend console for the connection error.',
    ],
  },
  api: {
    icon: 'bell',
    title: 'The listings service returned an error',
    lead: 'The server answered, but not with listings.',
    steps: ['Check the backend console for the failing request.'],
  },
};

export default function ConnectionError({ error, onRetry, busy = false }) {
  const report = REPORTS[error?.kind] || REPORTS.api;

  return (
    <div className="xp-err" role="alert">
      <span className="xp-err__badge">
        <Icon name={report.icon} className="xp-err__ico" />
      </span>

      <h3 className="xp-err__title">{report.title}</h3>
      <p className="xp-err__lead">{report.lead}</p>

      {error?.message && <p className="xp-err__detail">{error.message}</p>}

      <ol className="xp-err__steps">
        {report.steps.map(step => <li key={step}>{step}</li>)}
      </ol>

      <div className="xp-err__foot">
        <button className="exp-more" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : 'Retry'}
          {!busy && <span aria-hidden="true">→</span>}
        </button>
        {error?.endpoint && (
          <p className="xp-err__endpoint">
            Tried <code>{error.endpoint}/listings</code>
            {error.status ? ` · HTTP ${error.status}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}
