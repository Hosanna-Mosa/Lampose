import { useEffect, useRef } from 'react';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';
import { REDUCED } from '../hooks/useSite';

/* Content says what actually happens at each step, in the order it happens,
   rather than naming the stage and leaving the reader to fill it in. */

const HEAD = {
  tag: 'How it works',
  title: 'Four steps,',
  em: 'search to dinner.',
  sub: 'Find the room, book it, scan in, eat. This is the whole thing — there is no fifth step.',
};

const STEPS = [
  {
    n: '1', h: 'Search your street',
    p: 'Filter by area, budget and what is included, then look only at rooms a '
     + 'scout has already walked, photographed and signed off.',
  },
  {
    n: '2', h: 'Book it in one tap',
    p: 'Send the request and the owner sees it immediately. Pay by UPI, pay no '
     + 'brokerage, and deal with nobody in between.',
  },
  {
    n: '3', h: 'Order from nearby',
    p: 'Take a monthly mess plan or a single meal from a kitchen within walking '
     + 'distance of the bed you just booked.',
  },
  {
    n: '4', h: 'Watch it arrive',
    p: 'Follow the rider on the map from the kitchen to your gate, with an ETA '
     + 'that updates the whole way.',
  },
];

const QR_HEAD = {
  tag: 'Smart features',
  title: 'One scan ties it',
  em: 'together.',
  sub: 'The same QR checks you in without paperwork, credits your food coupon, '
     + 'and later proves the rider reached the right door.',
};

const QR_STEPS = [
  {
    n: '01', h: 'Book and confirm',
    p: 'Once the owner accepts, a "Check in with QR" option appears in your dashboard — nothing to print or carry.',
  },
  {
    n: '02', h: 'Scan at reception',
    p: 'The app checks the hostel ID, your booking ID and the time window together, so a code cannot be reused or shared.',
  },
  {
    n: '03', h: 'Coupon lands instantly',
    p: 'A ₹100 food credit is added to your wallet the moment the scan clears, and applies itself to your next order.',
  },
  {
    n: '04', h: 'Delivery, proven',
    p: 'Riders scan the same code at the door, which timestamps the drop and settles any question about whether it arrived.',
  },
];

const CARDS = [
  {
    icon: 'qr', title: 'QR check-in',
    rows: [
      { k: 'Status', v: '✓ Verified', green: true },
      { k: 'Hostel', v: 'Sunrise PG, Vizag' },
      { k: 'Checked in', v: 'Today · 11:42 AM' },
      { k: 'Booking', v: '#BKG-20487' },
    ],
    note: '₹100 food credit added to your wallet',
  },
  {
    icon: 'delivery', title: 'Delivery verification',
    rows: [
      { k: 'Order', v: '#ORD-9812 · Biryani' },
      { k: 'Rider', v: 'Kiran · 0.4 km away' },
      { k: 'Drop', v: 'Sunrise PG · Room 204' },
      { k: 'Delivered', v: '✓ 12:09 PM', green: true },
    ],
  },
];

const VOUCHERS = [
  { title: 'Flat ₹100 off', sub: 'Next food order · expires in 7 days' },
  { title: '₹50 cashback', sub: 'On a stay booking over ₹3,000' },
];

/* The steps reveal in sequence and the spine grows with them, so the eye is
   walked down 1 → 4 rather than shown four items at once. */
function useTimeline(ref) {
  useEffect(() => {
    const line = ref.current;
    const steps = [...document.querySelectorAll('.tl-step')];
    if (!steps.length) return;

    if (REDUCED) {
      steps.forEach(s => s.classList.add('visible'));
      line?.classList.add('is-in');
      return;
    }

    const io = new IntersectionObserver(entries => {
      entries.forEach((e, i) => {
        if (!e.isIntersecting) return;
        setTimeout(() => e.target.classList.add('visible'), i * 160);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    steps.forEach(s => io.observe(s));

    const lineIo = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { line.classList.add('is-in'); lineIo.disconnect(); }
    }, { threshold: 0.05 });
    if (line) lineIo.observe(line);

    // Anything the observers miss must not stay at opacity 0 forever.
    const sweep = setTimeout(() => {
      steps.forEach(s => s.classList.add('visible'));
      line?.classList.add('is-in');
    }, 4000);

    return () => { io.disconnect(); lineIo.disconnect(); clearTimeout(sweep); };
  }, [ref]);
}

export default function How() {
  const timeline = useRef(null);
  useTimeline(timeline);

  return (
    <>
      <section id="how">
        <div className="sec-inner">
          <SecHead tag={HEAD.tag} title={HEAD.title} em={HEAD.em} sub={HEAD.sub} />

          <div className="timeline" ref={timeline}>
            {STEPS.map((s, i) => (
              <div className="tl-step" key={s.n} style={{ '--i': String(i) }}>
                <div className="tl-num">{s.n}</div>
                <div className="tl-body">
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section
        id="qr-features"
        style={{ background: 'var(--forest)', position: 'relative', overflow: 'hidden' }}
      >
        <div className="sec-inner" style={{ position: 'relative', zIndex: 1 }}>
          <div className="qrf-grid">
            <div className="left reveal-l">
              <img
                className="sec-illo left" src="/images/qr-checkin.svg" loading="lazy"
                alt="QR check-in and delivery verification"
                style={{
                  borderRadius: 'var(--rl)', objectFit: 'cover',
                  height: 240, width: '100%', maxWidth: 360, marginBottom: '1.75rem',
                }}
              />
              <span className="sec-tag">{QR_HEAD.tag}</span>
              <h2 className="sec-h2">
                {QR_HEAD.title} <em>{QR_HEAD.em}</em>
              </h2>
              <p className="sec-sub" style={{ margin: '1rem 0 2rem' }}>{QR_HEAD.sub}</p>

              <div className="qrf-steps">
                {QR_STEPS.map((s, i) => (
                  <div className="qrf-step" key={s.n} style={{ '--i': String(i) }}>
                    <div className="qrf-num">{s.n}</div>
                    <div className="qrf-body">
                      <h3>{s.h}</h3>
                      <p>{s.p}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="qrf-right reveal-r">
              {CARDS.map((c, i) => (
                <div className="qrf-card" key={c.title} style={{ '--i': String(i) }}>
                  <div className="qrf-card-head">
                    <Icon name={c.icon} />{c.title}
                  </div>
                  {c.rows.map(r => (
                    <div className="qrf-detail" key={r.k}>
                      <span className="qrf-key">{r.k}</span>
                      <span className={`qrf-val${r.green ? ' qrf-green' : ''}`}>{r.v}</span>
                    </div>
                  ))}
                  {c.note && (
                    <div className="qrf-coupon">
                      <Icon name="tag" />{c.note}
                    </div>
                  )}
                </div>
              ))}

              <div className="qrf-card" style={{ '--i': '2' }}>
                <div className="qrf-card-head">
                  <Icon name="tag" />My vouchers
                </div>
                {VOUCHERS.map(v => (
                  <div className="qrf-voucher" key={v.title}>
                    <div className="qrf-v-left">
                      <div className="qrf-v-title">{v.title}</div>
                      <div className="qrf-v-sub">{v.sub}</div>
                    </div>
                    <button className="qrf-v-btn">Use</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
