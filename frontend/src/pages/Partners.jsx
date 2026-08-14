import { useCallback, useEffect, useRef, useState } from 'react';
import SiteBanner from '../components/Banners';
import Icon from '../components/Icon';
import { Link } from 'react-router-dom';
import { SecHead } from '../components/Chrome';
import { FINE, REDUCED } from '../hooks/useSite';

const PARTNERS = [
  {
    icon: 'stay', title: 'Property owners', cta: 'List a property',
    points: [
      'No listing fee, ever',
      'Booking requests straight to your phone',
      'Tenants with verified IDs',
      'Money in your account within 24 hours',
      'Occupancy and reviews on one screen',
    ],
  },
  {
    icon: 'food', title: 'Kitchens & messes', cta: 'Cook with us',
    points: [
      'Serve the residents already on your street',
      'Run monthly plans for steady income',
      'Offers and campaigns you control',
      'One dashboard, phone or laptop',
      'A named person to call, not a helpline',
    ],
  },
  {
    icon: 'delivery', title: 'Riders', cta: 'Start riding',
    points: [
      'Paid the same day, every day',
      'Choose your own hours',
      'Weekly bonuses for consistency',
      'Batched routes, less distance',
      'Earnings visible as you go',
    ],
  },
];

const TESTIMONIALS = [
  {
    q: 'Found a verified PG in Bengaluru within 2 hours of landing. No broker, no drama. The meal subscription sorted my lunches too.',
    tn: 'AK', name: 'Aditya Kumar', role: 'Software Engineer, Bengaluru',
  },
  {
    q: 'As a hostel owner in Hyderabad, Lampose gave me 3x more bookings in the first month. Dashboard is clean, payouts always on time.',
    tn: 'PS', name: 'Priya Sharma', role: 'Hostel Owner, Hyderabad',
  },
  {
    q: 'I deliver for Lampose in Chennai part-time. Routes are smart, pay is daily, and support actually responds. Best gig platform out there.',
    tn: 'MR', name: 'Mohammed Rafiq', role: 'Delivery Partner, Chennai',
  },
  {
    q: 'Relocated to Pune for work. Found a verified PG and a meal plan the same evening — both sorted in one app. Genuinely incredible.',
    tn: 'SR', name: 'Sravani Reddy', role: 'Working Professional, Pune',
  },
  {
    q: 'My restaurant in Hyderabad went from 40 to 140 orders a day after joining Lampose. The platform tools are genuinely powerful.',
    tn: 'VK', name: 'Venkat Krishna', role: 'Restaurant Owner, Hyderabad',
  },
];

/* ══ Testimonial carousel ═════════════════════════════════════════════════
   Translated by measured card width rather than a percentage, so the peek of
   the next card stays correct at every breakpoint.
   ════════════════════════════════════════════════════════════════════════ */
function Testimonials() {
  const [i, setI] = useState(0);
  const track = useRef(null);

  const position = useCallback(index => {
    const el = track.current;
    const card = el?.querySelector('.tcard');
    if (!card) return;
    el.style.transform = `translateX(-${index * (card.offsetWidth + 24)}px)`;
  }, []);

  useEffect(() => { position(i); }, [i, position]);

  useEffect(() => {
    const onResize = () => position(i);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [i, position]);

  useEffect(() => {
    if (REDUCED) return;
    const t = setInterval(() => setI(p => (p + 1) % TESTIMONIALS.length), 4200);
    return () => clearInterval(t);
  }, [i]);

  const go = step => setI(p => (p + step + TESTIMONIALS.length) % TESTIMONIALS.length);

  return (
    <section id="testimonials">
      <div className="sec-inner">
        <SecHead tag="Voices" title="What people said" em="after checking out." />

        <div className="tc-wrap">
          <div className="tc" id="tc" ref={track}>
            {TESTIMONIALS.map(t => (
              <div className="tcard" key={t.name}>
                <div className="stars">★★★★★</div>
                <p className="tq">&ldquo;{t.q}&rdquo;</p>
                <div className="tau">
                  <div className="avatar"><span className="tn">{t.tn}</span></div>
                  <div>
                    <div className="tname">{t.name}</div>
                    <div className="trole">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', alignItems: 'center' }}>
          <button className="tbtn" onClick={() => go(-1)} aria-label="Previous">←</button>
          <div id="tdots" className="tdots">
            {TESTIMONIALS.map((t, n) => (
              <div
                key={t.name} className={`tdot${n === i ? ' active' : ''}`}
                onClick={() => setI(n)}
              />
            ))}
          </div>
          <button className="tbtn" onClick={() => go(1)} aria-label="Next">→</button>
        </div>
      </div>
    </section>
  );
}

export default function Partners() {
  const [spread, setSpread] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const io = new IntersectionObserver(([entry]) => {
      setSpread(entry.isIntersecting);
    }, {
      threshold: 0.4
    });

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <section id="partner">
        <div className="sec-inner">
          <div className="reveal">
            <SiteBanner set="partners" />
            <span className="sec-tag">Partner with us</span>
            <h2 className="sec-h2">Bring your rooms, <em>or your kitchen.</em></h2>
            <p className="sec-sub">
              Three ways onto Lampose. Every one of them starts with someone from
              our team turning up in person.
            </p>
          </div>

          <div 
            ref={containerRef}
            className={`partner-deck-container ${spread ? 'is-spread' : ''}`}
          >
            <div className="partner-deck">
              {PARTNERS.map((p, n) => (
                <div className={`pcard deck-card card-${n}`} key={p.title} style={{ '--i': String(n) }}>
                  <div className="p-icon"><Icon name={p.icon} /></div>
                  <h3>{p.title}</h3>
                  <ul className="p-list">
                    {p.points.map((pt, k) => <li key={pt} style={{ '--i': String(k) }}>{pt}</li>)}
                  </ul>
                  <Link to="/download" className="btn-p" onClick={e => e.stopPropagation()}><span>{p.cta}</span></Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="divider" />
      <Testimonials />
    </>
  );
}
