import React from 'react';
import { Inbox, RefreshCw, X } from 'lucide-react';
import { IconButton } from '../../atoms/IconButton';
import { Skeleton } from '../../atoms/Skeleton';
import { EmptyState } from '../../molecules/EmptyState';
import { ErrorState } from '../../molecules/ErrorState';
import { cx } from '../../utils';
import { ACTIVITY_ICON } from '../../../../lib/domain';
import { relativeTime } from '../../../../lib/format';
import type { ActivityEntity } from '../../../../api/types';
import { Aside } from '../../atoms/Aside';
import { Box } from '../../atoms/Box';
import { Heading } from '../../atoms/Heading';
import { Inline } from '../../atoms/Inline';
import { List } from '../../atoms/List';
import { ListItem } from '../../atoms/ListItem';
import { Text } from '../../atoms/Text';
import { Time } from '../../atoms/Time';

interface ActivityPanelProps {
  open: boolean;
  onClose: () => void;
  items: ActivityEntity[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
}

const SEVERITY_ACCENT: Record<string, string> = {
  good: 'bg-good-soft text-good',
  warning: 'bg-warn-soft text-warn',
  critical: 'bg-crit-soft text-crit',
  info: 'bg-surface-inset text-ink-2',
};

/**
 * Slide-over feed of what actually happened — property onboardings, owner
 * verification outcomes and administrator account changes, merged and sorted
 * by timestamp on the server.
 */
export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  open,
  onClose,
  items,
  loading,
  error,
  onReload,
}) => {
  if (!open) return null;

  return (
    <>
      <Box
        className="fixed inset-0 z-40 bg-[rgb(9_12_20/0.45)] backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <Aside
        role="dialog"
        aria-label="Recent activity"
        className="fixed top-0 bottom-0 right-0 z-50 w-full max-w-sm bg-surface border-l border-line flex flex-col anim-slide-left"
      >
        <Box className="h-14 px-4 border-b border-line flex items-center justify-between shrink-0">
          <Box>
            <Heading level={2} className="text-section text-ink">Recent activity</Heading>
            <Text className="text-label text-ink-3">Live from the database</Text>
          </Box>
          <Box className="flex items-center gap-1">
            <IconButton icon={RefreshCw} label="Reload activity" onClick={onReload} spinning={loading} />
            <IconButton icon={X} label="Close panel" onClick={onClose} />
          </Box>
        </Box>

        <Box className="flex-1 overflow-y-auto p-3">
          {error ? (
            <ErrorState message={error} onRetry={onReload} />
          ) : loading && !items.length ? (
            <Box className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Box key={i} className="flex gap-3 p-3">
                  <Skeleton className="size-7 rounded-control shrink-0" />
                  <Box className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </Box>
                </Box>
              ))}
            </Box>
          ) : !items.length ? (
            <EmptyState
              icon={Inbox}
              title="No activity yet"
              description="Property onboardings and verification outcomes will appear here as they happen."
            />
          ) : (
            <List ordered className="space-y-1 list-none m-0 p-0">
              {items.map((event) => {
                const Icon = ACTIVITY_ICON[event.kind] ?? Inbox;
                return (
                  <ListItem
                    key={event.id}
                    className="flex gap-3 p-3 rounded-panel hover:bg-surface-subtle transition-colors"
                  >
                    <Inline
                      className={cx(
                        'grid place-items-center size-7 rounded-control shrink-0',
                        SEVERITY_ACCENT[event.severity] ?? SEVERITY_ACCENT.info
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={2} />
                    </Inline>
                    <Box className="min-w-0 flex-1">
                      <Text className="text-sm text-ink leading-snug">{event.title}</Text>
                      <Text className="text-label text-ink-3 mt-1 leading-relaxed line-clamp-3">
                        {event.detail}
                      </Text>
                      <Time className="text-label text-ink-3 mt-1.5 block tabular">
                        {relativeTime(event.timestamp)}
                      </Time>
                    </Box>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Aside>
    </>
  );
};
