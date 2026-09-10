import React from 'react';
import { Building2, ShieldCheck, TrendingUp } from 'lucide-react';
import { Aside } from '../../atoms/Aside';
import { Box } from '../../atoms/Box';
import { Heading } from '../../atoms/Heading';
import { Inline } from '../../atoms/Inline';
import { List } from '../../atoms/List';
import { ListItem } from '../../atoms/ListItem';
import { Main } from '../../atoms/Main';
import { Text } from '../../atoms/Text';

const HIGHLIGHTS = [
  { icon: Building2, label: 'Property records', detail: 'Every listing onboarded by the field team' },
  { icon: ShieldCheck, label: 'Owner verifications', detail: 'Confirmation status for each property owner' },
  { icon: TrendingUp, label: 'Portfolio analytics', detail: 'Onboarding pace, rent spread and coverage' },
];

/** Shared two-column frame for the sign-in and registration screens. */
export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box className="min-h-screen bg-canvas flex">
    {/* Context panel — hidden on small screens where the form is all that matters */}
    <Aside className="hidden lg:flex flex-col justify-between w-[46%] max-w-xl p-10 bg-surface border-r border-line">
      <Box className="flex items-center gap-2.5">
        <Inline className="grid place-items-center size-8 rounded-control bg-brand text-white">
          <Inline className="text-body font-semibold leading-none">L</Inline>
        </Inline>
        <Box>
          <Text className="text-body font-semibold text-ink leading-tight">Lampose</Text>
          <Text className="text-micro uppercase text-ink-3 leading-tight">Admin Console</Text>
        </Box>
      </Box>

      <Box className="max-w-sm">
        <Heading level={2} className="text-title text-ink">
          The operations view of the accommodation network.
        </Heading>
        <List className="mt-7 space-y-5 list-none m-0 p-0">
          {HIGHLIGHTS.map(({ icon: Icon, label, detail }) => (
            <ListItem key={label} className="flex gap-3">
              <Inline className="grid place-items-center size-8 rounded-control bg-surface-inset text-ink-2 shrink-0">
                <Icon className="size-4" strokeWidth={1.75} />
              </Inline>
              <Box>
                <Text className="text-body font-medium text-ink">{label}</Text>
                <Text className="text-sm text-ink-3 mt-0.5">{detail}</Text>
              </Box>
            </ListItem>
          ))}
        </List>
      </Box>

      <Text className="text-label text-ink-3">
        © {new Date().getFullYear()} Lampose · Authorised personnel only
      </Text>
    </Aside>

    <Main className="flex-1 flex items-center justify-center p-5 sm:p-8">
      <Box className="w-full max-w-sm">
        {/* Compact brand for the mobile layout */}
        <Box className="flex items-center gap-2.5 mb-8 lg:hidden">
          <Inline className="grid place-items-center size-8 rounded-control bg-brand text-white">
            <Inline className="text-body font-semibold leading-none">L</Inline>
          </Inline>
          <Box>
            <Text className="text-body font-semibold text-ink leading-tight">Lampose</Text>
            <Text className="text-micro uppercase text-ink-3 leading-tight">Admin Console</Text>
          </Box>
        </Box>
        {children}
      </Box>
    </Main>
  </Box>
);
