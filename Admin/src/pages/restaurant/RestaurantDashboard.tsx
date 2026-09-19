/* ══════════════════════════════════════════════════════════════════════════
   Dashboard — the restaurant owner's opening screen.

   Two questions, in that order:

     1. Is anything waiting for me right now?
     2. How has today gone?

   The first is the reason somebody opens a console at eight in the evening
   and the second is the reason they open it at eleven, so the live counts sit
   above the day's figures rather than beside them.

   Everything here comes from ONE request — `/v1/restaurant-admin/summary` —
   which the server answers with three aggregations and two counts over
   indexed fields. The alternative, four calls the browser adds up, is four
   chances for the tiles to disagree with each other on the same screen.

   ## Two money figures, not one

   `gross` is what diners paid; `earnings` is what reaches the kitchen once
   commission comes off. Showing only the first would overstate the day by the
   commission, and an owner reconciling against their bank would find the
   number nowhere. `earnings` is the larger type because it is the one they
   are looking for.

   Both are summed over DELIVERED orders only. Money is earned when the food
   arrives — counting an order still being cooked would produce a total that
   goes DOWN when one is later refused, which is a figure nobody can trust
   twice.

   ## The open/closed switch is three states behind a two-state control

   `auto` follows the opening-hours schedule and is what most shops sit on.
   The switch here flips between `open` and `closed` as an OVERRIDE, and the
   line beneath says when the schedule is in charge instead — because a
   kitchen pinned open by a tap nobody remembers is the bug the third state
   exists to prevent.
   ══════════════════════════════════════════════════════════════════════════ */
import React, { useState } from 'react';
import {
  Ban,
  Bike,
  BookOpenText,
  CalendarClock,
  CheckCircle2,
  ChefHat,
  Clock,
  Inbox,
  PackageCheck,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { Badge } from '../../components/common/atoms/Badge';
import type { BadgeTone } from '../../components/common/atoms/Badge';
import { Box } from '../../components/common/atoms/Box';
import { Button } from '../../components/common/atoms/Button';
import { Card } from '../../components/common/atoms/Card';
import { Heading } from '../../components/common/atoms/Heading';
import { PlainButton } from '../../components/common/atoms/PlainButton';
import { Switch } from '../../components/common/atoms/Switch';
import { Text } from '../../components/common/atoms/Text';
import { ErrorState } from '../../components/common/molecules/ErrorState';
import { PageHeader } from '../../components/common/molecules/PageHeader';
import { StatCard } from '../../components/common/molecules/StatCard';
import { Toast } from '../../components/common/organisms/Toast';
import type { ToastState } from '../../components/common/organisms/Toast';
import { cx } from '../../components/common/utils';
import { restaurantAdminService } from '../../api/services/restaurantAdminService';
import { useAuth } from '../../context/AuthContext';
import { useFetch } from '../../lib/useFetch';
import { rupees } from '../../lib/format';

interface RestaurantDashboardProps {
  setActiveTab: (tab: string) => void;
}

const VERIFICATION_LOOK: Record<string, { label: string; tone: BadgeTone; icon: React.ElementType }> = {
  approved: { label: 'Approved', tone: 'good', icon: ShieldCheck },
  pending: { label: 'Awaiting approval', tone: 'warn', icon: Clock },
  rejected: { label: 'Not approved', tone: 'crit', icon: Ban },
};

/** One live count, clickable through to the queue it belongs to. */
const LiveTile: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  tone: 'urgent' | 'normal';
  onClick: () => void;
}> = ({ label, value, icon: Icon, tone, onClick }) => (
  <PlainButton
    onClick={onClick}
    className={cx(
      'card p-4 text-left w-full transition-colors duration-120 hover:border-line-strong',
      /* Loud only when there is something to be loud about. A tile shouting
         at zero is one that gets ignored on the night it matters. */
      tone === 'urgent' && value > 0 ? 'bg-warn-soft border-warn-border' : ''
    )}
  >
    <Box className="flex items-center gap-2 text-ink-3">
      <Icon className="size-4 shrink-0" strokeWidth={1.75} />
      <Text className="text-label uppercase">{label}</Text>
    </Box>
    <Text className="text-display text-ink figure mt-2">{value}</Text>
  </PlainButton>
);

export const RestaurantDashboard: React.FC<RestaurantDashboardProps> = ({ setActiveTab }) => {
  const { restaurant, updateRestaurant } = useAuth();
  const summary = useFetch(() => restaurantAdminService.summary(), []);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [flipping, setFlipping] = useState(false);

  const data = summary.data;
  const shop = data?.restaurant;
  const verification = VERIFICATION_LOOK[shop?.verificationStatus ?? 'pending'] ?? VERIFICATION_LOOK.pending;

  /* The switch is an override. `auto` reads as whatever the schedule says
     right now, so the knob shows the effective state and flipping it pins
     the opposite. */
  const open = shop?.isCurrentlyOpen ?? false;
  const onSchedule = (shop?.openState ?? 'auto') === 'auto';

  const flipOpen = async (next: boolean) => {
    setFlipping(true);
    const res = await restaurantAdminService.setOpenState(next ? 'open' : 'closed');
    setFlipping(false);
    if (res.success) {
      setToast({
        tone: 'good',
        message: next
          ? 'Your kitchen is open — customers can order now.'
          : 'Your kitchen is closed. No new orders will come in.',
      });
      /* The stored profile too, so the sidebar and the header stop saying the
         opposite of what this page has just done. */
      updateRestaurant({ isCurrentlyOpen: next, openState: next ? 'open' : 'closed' });
      summary.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be changed.' });
    }
  };

  const backToSchedule = async () => {
    setFlipping(true);
    const res = await restaurantAdminService.setOpenState('auto');
    setFlipping(false);
    if (res.success) {
      setToast({ tone: 'good', message: 'Back on your opening hours.' });
      updateRestaurant({ openState: 'auto' });
      summary.reload();
    } else {
      setToast({ tone: 'crit', message: res.message || 'That could not be changed.' });
    }
  };

  return (
    <Box className="space-y-5">
      <PageHeader
        eyebrow="My restaurant"
        title={shop?.restaurantName || restaurant?.restaurantName || 'Dashboard'}
        description="What needs you right now, and how today has gone."
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={summary.reload}
            loading={summary.refreshing}
          >
            Refresh
          </Button>
        }
      />

      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}

      {/* ── Trading state ─────────────────────────────────────────────── */}
      <Card className="p-4">
        <Box className="flex flex-wrap items-center justify-between gap-4">
          <Box className="flex items-center gap-3 min-w-0">
            <Switch
              checked={open}
              busy={flipping || summary.loading}
              onChange={flipOpen}
              label={open ? 'Close the kitchen' : 'Open the kitchen'}
            />
            <Box className="min-w-0">
              <Text className="text-body font-medium text-ink">
                {open ? 'Taking orders' : 'Not taking orders'}
              </Text>
              <Text className="text-label text-ink-3">
                {onSchedule
                  ? 'Following your opening hours.'
                  : `Held ${open ? 'open' : 'closed'} by hand — your opening hours are being ignored.`}
              </Text>
            </Box>
          </Box>

          <Box className="flex items-center gap-2">
            {!onSchedule && (
              <Button
                size="sm"
                variant="ghost"
                icon={CalendarClock}
                loading={flipping}
                onClick={backToSchedule}
              >
                Back to opening hours
              </Button>
            )}
            <Badge tone={verification.tone} icon={verification.icon}>
              {verification.label}
            </Badge>
          </Box>
        </Box>

        {/* An unapproved shop can do everything here except be seen. Saying so
            once, plainly, is better than an owner wondering why a menu they
            have filled in brings no orders. */}
        {shop?.verificationStatus === 'pending' && (
          <Box className="mt-3 pt-3 border-t border-line">
            <Text className="text-sm text-ink-2">
              Lampose is still checking your documents. You can build your menu now — customers
              will see your restaurant as soon as it is approved.
            </Text>
          </Box>
        )}
      </Card>

      {/* ── Right now ─────────────────────────────────────────────────── */}
      <Box>
        <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
          Right now
        </Heading>
        <Box className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <LiveTile
            label="New orders"
            value={data?.live.newOrders ?? 0}
            icon={Inbox}
            tone="urgent"
            onClick={() => setActiveTab('restaurant-orders')}
          />
          <LiveTile
            label="In the kitchen"
            value={data?.live.inKitchen ?? 0}
            icon={ChefHat}
            tone="normal"
            onClick={() => setActiveTab('restaurant-orders')}
          />
          <LiveTile
            label="Waiting for a rider"
            value={data?.live.awaitingPickup ?? 0}
            icon={PackageCheck}
            tone="normal"
            onClick={() => setActiveTab('restaurant-orders')}
          />
          <LiveTile
            label="On the way"
            value={data?.live.onTheWay ?? 0}
            icon={Bike}
            tone="normal"
            onClick={() => setActiveTab('restaurant-orders')}
          />
        </Box>
      </Box>

      {/* ── Today ─────────────────────────────────────────────────────── */}
      <Box>
        <Heading level={2} className="text-label uppercase text-ink-3 mb-2">
          Today
        </Heading>
        <Box className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="You have earned"
            value={rupees(data?.today.earnings ?? 0)}
            icon={Wallet}
            loading={summary.loading}
            footnote={
              data
                ? `after ${data.today.commissionRate}% commission · ${rupees(data.today.gross)} taken`
                : undefined
            }
          />
          <StatCard
            label="Orders delivered"
            value={String(data?.today.delivered ?? 0)}
            icon={CheckCircle2}
            loading={summary.loading}
            footnote={data ? `${data.today.placed} placed today` : undefined}
          />
          <StatCard
            label="Not fulfilled"
            value={String((data?.today.rejected ?? 0) + (data?.today.cancelled ?? 0))}
            icon={Ban}
            loading={summary.loading}
            footnote={
              data
                ? `${data.today.rejected} refused · ${data.today.cancelled} cancelled`
                : undefined
            }
          />
          <StatCard
            label="Dishes on the menu"
            value={String(data?.menu.total ?? 0)}
            icon={BookOpenText}
            loading={summary.loading}
            footnote={
              data?.menu.outOfStock ? `${data.menu.outOfStock} switched off` : 'all available'
            }
          />
        </Box>
      </Box>

      <Box className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          icon={ReceiptIndianRupee}
          onClick={() => setActiveTab('restaurant-orders')}
        >
          Go to orders
        </Button>
        <Button variant="secondary" icon={BookOpenText} onClick={() => setActiveTab('restaurant-menu')}>
          Edit the menu
        </Button>
      </Box>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </Box>
  );
};
