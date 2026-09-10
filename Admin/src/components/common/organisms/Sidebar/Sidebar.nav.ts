import React from 'react';
import {
  BadgeIndianRupee,
  BarChart3,
  Bike,
  Briefcase,
  Building2,
  CalendarCheck,
  Globe,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Map,
  MessageCircle,
  Package,
  Radar,
  ReceiptIndianRupee,
  RotateCcw,
  Server,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UtensilsCrossed,
  Wallet,
} from 'lucide-react';
import type { AdminRole } from '../../../../api/types';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  heading: string;
  items: NavItem[];
  /** Rendered only for these roles — the backend enforces access
   *  independently; hiding a link here is just so it isn't shown where it
   *  would 403. A group with no `roles` is visible to everyone, which is what
   *  every group except Database and Food has always been. */
  roles?: AdminRole[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    heading: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'web-analytics', label: 'Web Analytics', icon: Globe },
    ],
  },
  {
    /* Monitor sits directly under Overview and above Records, because it is
       the screen somebody opens to answer "what is happening right now" —
       and because it is the only place money is released. Open to every
       signed-in administrator to READ; the page hides the commission field
       from anyone below Admin and the Withdraw button from anyone below
       Super Admin, matching `monitor.admin.routes.js`. */
    heading: 'Monitor',
    items: [
      { id: 'monitor', label: 'Bookings & Payments', icon: BadgeIndianRupee },
      /* Owner-requested payouts. Beside Bookings & Payments because both are
         money leaving Lampose, but a separate screen because they are
         different money: this one has no guest payment and no commission
         behind it — see `partnerPayoutService`. */
      { id: 'partner-payouts', label: 'Partner Payouts', icon: Wallet },
      /* Guests owed money for a cancelled hotel stay. Beside the two payout
         queues because it is the third way money leaves Lampose by hand. */
      { id: 'refunds', label: 'Refunds', icon: RotateCcw },
    ],
  },
  {
    heading: 'Records',
    items: [
      { id: 'properties', label: 'Properties', icon: Building2 },
      { id: 'verifications', label: 'Verifications', icon: ShieldCheck },
      { id: 'onboarding-team', label: 'Onboarding Team', icon: Briefcase },
      { id: 'permissions', label: 'Permissions', icon: KeyRound },
      { id: 'users', label: 'Administrators', icon: Users },
      /* Not under Food: a zone governs stays as well, and its `allowedServices`
         is what narrows one to a single service when somebody wants that. */
      { id: 'zones', label: 'Service Zones', icon: Map },
    ],
  },
  {
    heading: 'Database',
    roles: ['Super Admin'],
    items: [
      { id: 'visit-requests', label: 'Visit Requests', icon: CalendarCheck },
      { id: 'scriper-users', label: 'Leads Panel Team', icon: UserCog },
      { id: 'scraper-jobs', label: 'Scrape Jobs', icon: Radar },
      { id: 'scraper-leads', label: 'Scraped Leads', icon: ListChecks },
      { id: 'products', label: 'Products', icon: Package },
    ],
  },
  {
    /* Food partners. Open to the roles that can actually work the queue plus
       Super Admin — a Food Admin sees this group and, below, nothing else that
       is not theirs. */
    heading: 'Food',
    roles: ['Super Admin', 'Admin', 'Food Admin'],
    items: [
      /* First in the group, and the only row here that carries a number.
         The two below are queues somebody works through when they have an
         hour; this one is opened because something has gone wrong right now —
         food going cold, or a student's money still sitting with us — so it
         belongs where the eye lands. Its badge counts orders needing a person,
         from `/v1/admin/food-orders/counts`.

         Reading it is open to every signed-in administrator on the backend,
         Viewer included. It sits in this group anyway: the nav is shaped like
         somebody's job rather than like the permission table, and the only way
         to widen it to Support would be to hand that role the restaurant and
         rider approval queues too, which `SUPPORT_GROUPS` below refuses on
         purpose. Refunding is narrower still — Super Admin and Admin only —
         and the page hides that control itself. */
      { id: 'food-orders', label: 'Food Orders', icon: ReceiptIndianRupee },
      { id: 'food-restaurants', label: 'Restaurant Approvals', icon: UtensilsCrossed },
      /* Riders are the other half of a food order, and the same three roles
         work both queues — the person approving restaurants in the morning is
         the person approving riders in the morning. `driverAdmin.routes.js`
         gates on exactly this set for exactly that reason, so a seventh role
         would be a grant to remember for a distinction nobody in operations
         makes. */
      { id: 'drivers', label: 'Delivery Riders', icon: Bike },
    ],
  },
  {
    /* Support spans all three apps AND the stay side, which is why it is its
       own group rather than a row under Food. The roles are the ones that can
       actually answer; anybody else who reaches the page can still read it,
       because the backend gates writing and not reading. */
    heading: 'Support',
    roles: ['Super Admin', 'Admin', 'Support'],
    items: [
      { id: 'support', label: 'Support Queue', icon: LifeBuoy },
    ],
  },
  {
    heading: 'Tools',
    items: [
      { id: 'messages', label: 'Messages', icon: MessageCircle },
    ],
  },
  {
    heading: 'Platform',
    items: [
      { id: 'system', label: 'System', icon: Server },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * What a Food Admin may see.
 *
 * The role exists to work one queue, so rather than tagging every other group
 * with a list of roles that excludes it — five lists to keep in step — the one
 * narrow role names the groups it is allowed into. Adding a group later
 * therefore defaults to "not a Food Admin's", which is the safe direction.
 */
const FOOD_ADMIN_GROUPS = new Set(['Food', 'Platform']);

/**
 * What a Support agent may see.
 *
 * The same shape as the Food Admin rule above and for the same reason: a
 * narrow role names the groups it is allowed into, so a group added later
 * defaults to "not theirs", which is the safe direction.
 *
 * Deliberately just their own queue and Platform. Answering a deposit dispute
 * does sometimes want the property behind it, but a role that can read every
 * record in the console is not a support role — an account that needs that is
 * an Admin, and that grant should be made deliberately rather than inherited.
 */
const SUPPORT_GROUPS = new Set(['Support', 'Platform']);

export const visibleGroupsFor = (role?: AdminRole): NavGroup[] =>
  NAV_GROUPS.filter((group) => {
    if (group.roles && !(role && group.roles.includes(role))) return false;
    if (role === 'Food Admin' && !FOOD_ADMIN_GROUPS.has(group.heading)) return false;
    if (role === 'Support' && !SUPPORT_GROUPS.has(group.heading)) return false;
    return true;
  });
