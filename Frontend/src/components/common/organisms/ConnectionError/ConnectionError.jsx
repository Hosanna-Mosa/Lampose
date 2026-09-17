import { Icon } from '../../atoms/Icon/Icon';
import { REPORTS } from '../../utils/connectionReports';
import { Box, Heading, Inline, PlainButton, Text } from '../../atoms';

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


export function ConnectionError({ error, onRetry, busy = false }) {
  const report = error?.kind === 'offline' ? REPORTS.offline : REPORTS.default;

  return (
    <Box className="xp-err" role="alert">
      <Inline className="xp-err__badge">
        <Icon name={report.icon} className="xp-err__ico" />
      </Inline>

      <Heading level={3} className="xp-err__title">{report.title}</Heading>
      <Text className="xp-err__lead">{report.lead}</Text>

      <Box className="xp-err__foot">
        <PlainButton className="exp-more" onClick={onRetry} disabled={busy}>
          {busy ? 'Retrying…' : 'Retry'}
          {!busy && <Inline aria-hidden="true">→</Inline>}
        </PlainButton>
      </Box>
    </Box>
  );
}
