import { useEffect, useState } from 'react';
import SiteBanner from '../components/Banners';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';

/* The partner builds are ~43 MB each and live on the origin, so they are
   served from there rather than committed into this repo. */
const APK = {
  food: 'https://lampose.com/apk/Lampose-Food-Partner.apk',
  stay: 'https://lampose.com/apk/Lampose-Stay-Partner.apk',
};

const CARDS = [
  {
    key: 'user', icon: 'stay', iconBg: 'var(--green-t)',
    badge: 'Residents', badgeCls: 'dl-badge-user',
    title: 'The Lampose app',
    desc: 'Find a verified room, order from the kitchens around it, follow the '
        + 'rider to your door, and settle everything on one bill.',
    features: [
      'Browse rooms a scout has walked',
      'Mess plans, home kitchens and restaurants',
      'Live tracking from pickup to gate',
      'Vouchers and meal plans in one wallet',
      'QR check-in, and complaints that get answered',
    ],
    apkLabel: 'Android APK',
  },
  {
    key: 'partner', icon: 'chart', iconBg: 'var(--amber-t)', cardCls: 'dl-card-partner',
    badge: 'Owners & kitchens', badgeCls: 'dl-badge-partner',
    title: 'Lampose Partner',
    desc: 'Run your property or kitchen from one screen — requests, orders, '
        + 'menus, payouts and reviews, without a separate system for each.',
    features: [
      'Live bookings and orders as they arrive',
      'Daily payouts with the full history',
      'Tenants and customers with verified IDs',
      'Menus and subscription plans you control',
      'QR check-in and table reservations',
    ],
    apkLabel: 'Partner APK', popup: true,
  },
  {
    key: 'delivery', icon: 'delivery', iconBg: '#e8f2ec',
    badge: 'Riders', badgeCls: 'dl-badge-delivery',
    title: 'Lampose Rider',
    desc: 'Take the orders you want, follow a route worth riding, and watch the '
        + 'earnings add up through the day.',
    features: [
      'Orders pushed the moment they are ready',
      'Batched routes, less distance per drop',
      'Paid the same day, no minimum',
      'Weekly bonuses and a leaderboard',
      'Scan at the door to close the job',
    ],
    apkLabel: 'Rider APK',
  },
];

/* ══ Partner APK chooser ══════════════════════════════════════════════════
   The partner build ships in two flavours, so the direct-download button asks
   which one before starting the transfer.
   ════════════════════════════════════════════════════════════════════════ */
function PartnerPopup({ open, onClose }) {
  useEffect(() => {
    const esc = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  return (
    <div
      id="partnerPopup" className="popup"
      style={{ display: open ? 'flex' : 'none' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="popup-content">
        <h3>Select Partner Type</h3>
        <button onClick={() => { window.location.href = APK.food; onClose(); }}>
          Food partner
        </button>
        <button onClick={() => { window.location.href = APK.stay; onClose(); }}>
          Stay partner
        </button>
        <button className="close" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

export default function Download() {
  const [popup, setPopup] = useState(false);

  return (
    <section id="download">
      <div className="sec-inner">
        <div className="reveal" style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <SiteBanner set="download" />
          <span className="sec-tag">Download</span>
          <h2 className="sec-h2">One account, <em>three apps.</em></h2>
          <p className="sec-sub" style={{ margin: '0.75rem auto' }}>
            Which one you need depends on which side of Lampose you are on. All three are
            free, and all three talk to each other.
          </p>
        </div>

        <div className="dl-grid">
          {CARDS.map((c, i) => (
            <div
              className={`dl-card reveal${c.cardCls ? ` ${c.cardCls}` : ''}`}
              key={c.key} style={{ transitionDelay: `${i * 120}ms` }}
            >
              <div className="dl-card-top">
                <div className="dl-icon-wrap" style={{ background: c.iconBg }}><Icon name={c.icon} /></div>
                <div className={`dl-badge ${c.badgeCls}`}>{c.badge}</div>
              </div>

              <h3 className="dl-title">{c.title}</h3>
              <p className="dl-desc">{c.desc}</p>

              <ul className="dl-features">
                {c.features.map((f, k) => <li key={f} style={{ '--i': String(k) }}>{f}</li>)}
              </ul>

              <div className="dl-btns">
                <a className="dl-btn dl-primary" href="#top" onClick={e => e.preventDefault()}>
                  <span className="dl-btn-icon"><Icon name="track" /></span>
                  <div className="dl-btn-text"><small>Get it on</small><strong>Google Play</strong></div>
                </a>
                <a
                  className="dl-btn dl-apk"
                  href={c.popup ? undefined : '#top'}
                  onClick={e => {
                    e.preventDefault();
                    if (c.popup) setPopup(true);
                  }}
                >
                  <span className="dl-btn-icon"><Icon name="orders" /></span>
                  <div className="dl-btn-text">
                    <small>Direct Download</small><strong>{c.apkLabel}</strong>
                  </div>
                </a>
              </div>

              <p className="dl-note">v1.0 · Android 8.0+ · iOS 14+</p>
            </div>
          ))}
        </div>

        <PartnerPopup open={popup} onClose={() => setPopup(false)} />

        {/* Hidden on the live site too — kept so the markup stays a match. */}
        <div className="dl-strip reveal" style={{ transitionDelay: '300ms', display: 'none' }}>
          <div className="dl-strip-icon"><Icon name="qr" /></div>
          <div className="dl-strip-text">
            <strong>Can&apos;t find it on the store?</strong>
            <span>
              Download APK files directly and install on any Android device —
              no Play Store needed.
            </span>
          </div>
          <div className="dl-strip-btns">
            <a className="dl-strip-btn" href="#top">User APK ↓</a>
            <a className="dl-strip-btn" href="#top">Partner APK ↓</a>
            <a className="dl-strip-btn" href="#top">Delivery APK ↓</a>
          </div>
        </div>
      </div>
    </section>
  );
}
