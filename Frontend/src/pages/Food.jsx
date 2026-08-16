import { useEffect } from 'react';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';
import { REDUCED } from '../hooks/useSite';

const MODULES = [
  {
    icon: 'calendar', label: 'Monthly mess plans',
    body: 'Pay once at the start of the month and eat all month. Veg, non-veg or '
        + 'a mix, with fixed timings and a counter showing exactly how many meals '
        + 'you have left.',
    list: [
      'Plans billed monthly, renewed automatically',
      'Every meal you take is logged',
      'Cancel or pause from the app',
      'Meals-remaining counter on your dashboard',
    ],
  },
  {
    icon: 'food', label: 'A single meal, today',
    body: 'No plan needed. Open the mess menu for today, add a plate, and pay '
        + 'online or at the door — the same way you would order anything else.',
    list: [
      'Order without a subscription',
      'Veg, non-veg and egg filters',
      'Ratings and running offers visible',
      'Your hostel address filled in already',
    ],
  },
  {
    icon: 'stay', label: 'Home kitchens',
    body: 'Tiffins and regional cooking from people cooking in their own homes '
        + 'near your stay. A name and a street, not a warehouse brand.',
    list: [
      'Home cooks listed individually',
      'Cuisine tags for what they actually cook',
      'Filter by price and rating',
      'The same checkout as a restaurant',
    ],
  },
  {
    icon: 'users', label: 'Dine in',
    body: 'Book a table at a nearby restaurant, show the code when you arrive, '
        + 'and use offers that only apply if you eat there.',
    list: [
      'Pick a date, time and party size',
      'Partner confirms or offers another slot',
      'A code on arrival, nothing to print',
      'Dine-in-only discounts',
    ],
  },
];

const PHONES = [
  {
    label: 'Partner', cls: 'd1', delay: 0, wrap: 'reveal-l',
    rows: [
      { i: 'chart',    t: 'Today so far', s: "₹12,400 · 18 bookings" },
      { i: 'users',    t: 'Request from Rahul', s: 'Three months, from the 1st' },
      { i: 'wallet',   t: 'Payout sent', s: "₹8,200 · UPI · cleared" },
      { i: 'verified', t: 'New review, 5 stars', s: 'Clean, safe, affordable' },
    ],
  },
  {
    label: 'Resident', cls: '', delay: 150, wrap: 'reveal', center: true,
    rows: [
      { i: 'stay',     t: "Sunrise PG · ₹5,800/mo", s: 'Vizag · free from Monday' },
      { i: 'food',     t: 'Biryani · 22 min', s: "Spice Garden · ₹120" },
      { i: 'delivery', t: 'Kiran is on the way', s: '1.1 km · following live' },
      { i: 'verified', t: 'You rated your stay', s: 'Sunrise PG · 4.9' },
      { i: 'tag',      t: "₹50 cashback added", s: 'Referral credit' },
    ],
  },
  {
    label: 'Rider', cls: 'd2', delay: 300, wrap: 'reveal-r',
    rows: [
      { i: 'orders', t: "New order · ₹65", s: 'Pick up at Spice Garden' },
      { i: 'route',  t: 'Route set', s: '1.2 km · about 8 minutes' },
      { i: 'rupee',  t: 'Earned today', s: "₹840 · 13 drops" },
      { i: 'trophy', t: 'Weekly bonus unlocked', s: "₹200 on top" },
    ],
  },
];

/* A highlight walks down every phone's rows in step, so the three screens read
   as one connected system rather than three static mockups. */
function useRowPulse() {
  useEffect(() => {
    if (REDUCED) return;
    const rows = [...document.querySelectorAll('.ph-row')];
    if (!rows.length) return;
    let i = 0;
    const t = setInterval(() => {
      rows.forEach(r => r.classList.remove('ar'));
      rows[i].classList.add('ar');
      i = (i + 1) % rows.length;
    }, 1700);
    return () => { clearInterval(t); rows.forEach(r => r.classList.remove('ar')); };
  }, []);
}

export default function Food() {
  useRowPulse();

  return (
    <>
      <section id="food-module">
        <div className="sec-inner">
          <SecHead
            tag="Food" title="Four ways to eat," em="all within a walk."
            sub="A month of mess, one plate today, a home kitchen, or a table booked for tonight. Every one of them near the room you booked."
          />

          <div className="food-grid">
            {MODULES.map((m, n) => (
              <div className="food-card reveal" key={m.label} style={{ transitionDelay: `${n * 90}ms`, '--i': String(n) }}>
                <div className="food-card-head">
                  <span className="food-icon"><Icon name={m.icon} /></span>
                  <span className="food-card-label">{m.label}</span>
                </div>
                <p className="food-card-body">{m.body}</p>
                <ul className="food-list">
                  {m.list.map((l, k) => <li key={l} style={{ '--i': String(k) }}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="app-preview">
        <div className="sec-inner">
          <div className="ap-head">
            <SecHead
              tag="The apps" title="Three apps," em="one system."
              sub="What a resident, a partner and a rider each see of the same order, at the same moment."
            />
          </div>

          <div className="phones-row">
            {PHONES.map(p => (
              <div
                className={`ph-wrap ${p.wrap}${p.center ? ' center' : ''}`}
                key={p.label} style={{ transitionDelay: `${p.delay}ms` }}
              >
                <div className="ph-glow" />
                <div className={`ph-frame ${p.cls}`.trim()}>
                  <div className="ph-notch" />
                  <div className="ph-title">{p.label}</div>
                  {p.rows.map(r => (
                    <div className="ph-row" key={r.t}>
                      <span className="ph-ri"><Icon name={r.i} /></span>
                      <div className="ph-rt"><strong>{r.t}</strong>{r.s}</div>
                    </div>
                  ))}
                </div>
                <div className="ph-label">{p.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
