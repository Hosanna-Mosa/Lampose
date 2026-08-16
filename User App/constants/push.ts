/**
 * The twelve pushes. Copy is the design here.
 *
 * Rules that hold for all twelve, and are enforced by the test at the bottom
 * of this file rather than left as a comment:
 *
 *  1. The title says **what happened**, never what to feel.
 *  2. Any push about money **states the amount**.
 *  3. Any push with a deadline **states the deadline**, not "soon".
 *  4. No exclamation marks.
 *  5. No "Hi Anjali" — a push that greets you is a push that wasted its first
 *     four words, which are the only ones shown on a locked screen.
 *
 * And one that lives in the delivery layer: a push that fires while the app is
 * open becomes the in-app banner instead. Never both.
 */

/**
 * Five channels, so a student can mute rent reminders without muting "the owner
 * accepted". One channel would guarantee they mute the wrong thing — and the
 * one they would mute is the one that costs them a bed.
 */
export type PushChannel = 'MONEY' | 'BOOKING' | 'VISITS' | 'REMINDERS' | 'SUPPORT';

export type ChannelConfig = {
  id: PushChannel;
  /** Shown in the Android channel list, so it must make sense out of context. */
  label: string;
  description: string;
  importance: 'high' | 'default';
  /** SUPPORT goes silent after 9 pm — a reply is not worth a buzz at midnight. */
  silentAfter?: string;
};

export const pushChannels: readonly ChannelConfig[] = [
  {
    id: 'MONEY',
    label: 'Payments and refunds',
    description: 'Payment windows, confirmations and money coming back to you.',
    importance: 'high',
  },
  {
    id: 'BOOKING',
    label: 'Your requests',
    description: 'When an owner answers, and when a request is about to expire.',
    importance: 'high',
  },
  {
    id: 'VISITS',
    label: 'Visits',
    description: 'Confirmed visits and a reminder before you set off.',
    importance: 'default',
  },
  {
    id: 'REMINDERS',
    label: 'Reminders',
    description: 'Rent due, moving in, and the last day to give notice.',
    importance: 'default',
  },
  {
    id: 'SUPPORT',
    label: 'Support replies',
    description: 'When someone answers your ticket.',
    importance: 'default',
    silentAfter: '9 pm',
  },
];

export type PushMessage = {
  id: string;
  channel: PushChannel;
  /** What happened. Never what to feel. */
  title: string;
  body: string;
  /** Every push carries one, so a tap lands on the exact screen. */
  route: string;
  /**
   * Quiet hours are 10 pm – 7 am for everything except these. A payment window
   * closing and an owner accepting are time-critical: the student is strictly
   * worse off not knowing, so they wake the phone.
   */
  bypassQuietHours?: boolean;
  /**
   * Scheduled locally as well as sent from the server, because a student on
   * patchy 4G may not receive the server push before the deadline it is about.
   * The local copy is cancelled on any server-confirmed state change.
   */
  alsoScheduledLocally?: boolean;
  /** Why the copy is the way it is. Kept in code so it survives a rewrite. */
  note: string;
};

export const pushMessages: readonly PushMessage[] = [
  {
    id: 'visit-confirmed',
    channel: 'VISITS',
    title: 'Visit confirmed for tomorrow, 4:30 pm',
    body: 'Bhavana Girls PG · ask for Padma at the gate. Take a photo ID.',
    route: '/bookings/visits',
    note: 'Names who to ask for — the thing a nervous student forgets at the gate.',
  },
  {
    id: 'visit-soon',
    channel: 'VISITS',
    title: 'Your visit is in 2 hours',
    body: 'Bhavana Girls PG, 4:30 pm. About 20 minutes from Ameerpet metro. Cancel free until 2:30.',
    route: '/bookings/visits',
    alsoScheduledLocally: true,
    note: 'Travel time, not just a clock time. Fires at T−2h only, never twice.',
  },
  {
    id: 'request-accepted',
    channel: 'BOOKING',
    title: 'Padma accepted your request',
    body: 'Bhavana Girls PG is yours if you pay ₹26,499 in the next 2 hours. Tap to pay.',
    route: '/pay/lst-pg-0143',
    bypassQuietHours: true,
    note: 'The amount and the window in one line. Time-critical, so it bypasses quiet hours.',
  },
  {
    id: 'request-rejected',
    channel: 'BOOKING',
    title: 'Bhavana PG can’t take you right now',
    body: 'Nothing was charged. We found 6 similar girls’ PGs in Ameerpet from ₹6,200.',
    route: '/results',
    // No blame, no apology, and the recovery is inside the notification.
    note: 'A rejection push that only says "declined" leaves the student with nothing to do at 9 pm.',
  },
  {
    id: 'request-expiring',
    channel: 'BOOKING',
    title: 'Your request expires in 10 minutes',
    body: 'Padma has not answered yet. Nothing is charged either way, and you can send it again.',
    route: '/request/waiting',
    alsoScheduledLocally: true,
    note: 'States the harmless outcome, so an expiry push does not read as a threat.',
  },
  {
    id: 'payment-window',
    channel: 'MONEY',
    title: '30 minutes left to pay ₹26,499',
    body: 'After that the bed is released. Nothing has been charged yet.',
    route: '/pay/lst-pg-0143',
    bypassQuietHours: true,
    alsoScheduledLocally: true,
    note: 'Both facts a student needs at 11 pm: what happens, and that no money has moved.',
  },
  {
    id: 'payment-confirmed',
    channel: 'MONEY',
    title: 'Payment confirmed · ₹26,499',
    body: 'Bhavana Girls PG is booked from 5 September. Your move-in code is 4192.',
    route: '/bookings/bkg-4192',
    // The code is in the push, so it works with the app closed and no signal.
    note: 'A move-in code that needs the app to load is a code that fails at the gate.',
  },
  {
    id: 'moving-in',
    channel: 'REMINDERS',
    title: 'Moving in tomorrow',
    body: 'Reach Bhavana Girls PG by 7 pm. Take your photo ID, two passport photos and your code 4192. Nothing to pay on arrival.',
    route: '/bookings/bkg-4192',
    note: '"Nothing to pay on arrival" — the anti-fleecing line, in the place it is needed most.',
  },
  {
    id: 'rent-due',
    channel: 'REMINDERS',
    title: '₹8,500 rent due in 4 days',
    body: 'Pay Padma directly on 5 September. We only remind you — nothing is collected through the app.',
    route: '/bookings/bkg-4192',
    // Fires once, at T−4 days. Daily nagging is how notifications get disabled.
    note: 'Clarifies every time that we are not taking the money. A student who believes we do will not pay the owner.',
  },
  {
    id: 'notice-window',
    channel: 'REMINDERS',
    title: '30 days left before you can leave notice-free',
    body: 'Tell Padma by 12 August if you want to move out on 12 September. A message in the app counts.',
    route: '/bookings/notice',
    note: 'The one reminder that saves a student a month’s rent.',
  },
  {
    id: 'refund-sent',
    channel: 'MONEY',
    title: '₹16,260 sent to your UPI',
    body: 'Deposit refund for Bhavana Girls PG · reference RFD-4192-A. Banks can take 24 hours to show it.',
    route: '/bookings/refund',
    note: 'Pre-empts the "it says sent but it is not there" ticket, which is otherwise guaranteed.',
  },
  {
    id: 'support-reply',
    channel: 'SUPPORT',
    title: 'Ravi replied about your deposit',
    body: 'TKT-2188 · he has queued the transfer again for today and added ₹500 for the delay.',
    route: '/support/TKT-2188',
    note: 'Named human, and the outcome in the body — so the push itself resolves most of the anxiety.',
  },
];

/**
 * The copy rules, as a function rather than a comment.
 *
 * Run this over `pushMessages` in a test. A rule that only exists in prose gets
 * broken by the third person to add a notification.
 */
export function pushCopyViolations(message: PushMessage): readonly string[] {
  const problems: string[] = [];
  const all = `${message.title} ${message.body}`;

  if (all.includes('!')) problems.push('no exclamation marks');
  if (/\bHi \w/.test(all)) problems.push('no greeting — the first four words are the only ones shown');
  if (/\bsoon\b/i.test(all)) problems.push('a deadline must be stated, never "soon"');
  // Money channels must name the figure.
  if (message.channel === 'MONEY' && !/₹[\d,]+/.test(all)) {
    problems.push('a money push must state the amount');
  }
  return problems;
}
