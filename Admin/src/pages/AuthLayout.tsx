import React from 'react';
import { Building2, ShieldCheck, TrendingUp } from 'lucide-react';

const HIGHLIGHTS = [
  { icon: Building2, label: 'Property records', detail: 'Every listing onboarded by the field team' },
  { icon: ShieldCheck, label: 'Owner verifications', detail: 'Confirmation status for each property owner' },
  { icon: TrendingUp, label: 'Portfolio analytics', detail: 'Onboarding pace, rent spread and coverage' },
];

/** Shared two-column frame for the sign-in and registration screens. */
export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-canvas flex">
    {/* Context panel — hidden on small screens where the form is all that matters */}
    <aside className="hidden lg:flex flex-col justify-between w-[46%] max-w-xl p-10 bg-surface border-r border-line">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center size-8 rounded-control bg-brand text-white">
          <span className="text-body font-semibold leading-none">L</span>
        </span>
        <div>
          <p className="text-body font-semibold text-ink leading-tight">Lampose</p>
          <p className="text-micro uppercase text-ink-3 leading-tight">Admin Console</p>
        </div>
      </div>

      <div className="max-w-sm">
        <h2 className="text-title text-ink">
          The operations view of the accommodation network.
        </h2>
        <ul className="mt-7 space-y-5 list-none m-0 p-0">
          {HIGHLIGHTS.map(({ icon: Icon, label, detail }) => (
            <li key={label} className="flex gap-3">
              <span className="grid place-items-center size-8 rounded-control bg-surface-inset text-ink-2 shrink-0">
                <Icon className="size-4" strokeWidth={1.75} />
              </span>
              <div>
                <p className="text-body font-medium text-ink">{label}</p>
                <p className="text-sm text-ink-3 mt-0.5">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-label text-ink-3">
        © {new Date().getFullYear()} Lampose · Authorised personnel only
      </p>
    </aside>

    <main className="flex-1 flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-sm">
        {/* Compact brand for the mobile layout */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <span className="grid place-items-center size-8 rounded-control bg-brand text-white">
            <span className="text-body font-semibold leading-none">L</span>
          </span>
          <div>
            <p className="text-body font-semibold text-ink leading-tight">Lampose</p>
            <p className="text-micro uppercase text-ink-3 leading-tight">Admin Console</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  </div>
);
