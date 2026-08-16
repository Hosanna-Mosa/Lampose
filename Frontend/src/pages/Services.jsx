import { Fragment, useEffect, useRef, useState } from 'react';
import SiteBanner from '../components/Banners';
import Icon from '../components/Icon';
import { Link } from 'react-router-dom';
import { SecHead } from '../components/Chrome';
import { REDUCED, useTilt } from '../hooks/useSite';
import {
  CARDS, FEAT_HEAD, HEAD, PANELS, TABS, TAB_FEATURES,
} from '../data/services';

/* ══ Service card ═════════════════════════════════════════════════════════
   Clicking a card opens the shared detail panel below the grid and tints it
   with that card's accent. Clicking the open card again closes it.
   ════════════════════════════════════════════════════════════════════════ */
function ServiceCard({ card, open, onToggle, delay }) {
  const tilt = useTilt();

  return (
    <div className="reveal" style={{ transitionDelay: `${delay}ms`, height: '100%' }}>
      <div
        className={`svc-card${open ? ' svc-active' : ''}`}
        ref={tilt}
        onClick={onToggle}
        style={{ '--card-clr': card.color, height: '100%' }}
      >
        <div
          className="svc-icon-wrap"
          style={{ '--icon-bg': card.iconBg, '--icon-hover': card.iconHover }}
        >
          <Icon name={card.icon} />
        </div>
        <h3 className="svc-h3">{card.title}</h3>
        <p className="svc-p">{card.body}</p>
        <div className="svc-tag">{card.cta} <span className="svc-arrow">→</span></div>
        <div className="tilt-shine" />
      </div>
    </div>
  );
}

/* ══ Detail panel ═════════════════════════════════════════════════════════
   Height is animated with grid-template-rows 0fr → 1fr, which is what lets an
   auto-height block transition without measuring it in JS.
   ════════════════════════════════════════════════════════════════════════ */
function DetailPanel({ activeKey, color }) {
  return (
    <div
      className={`svc-detail${activeKey ? ' open' : ''}`}
      style={{ '--panel-clr': color }}
    >
      <div className="svc-detail-inner">
        {Object.entries(PANELS).map(([key, p]) => (
          <div
            key={key}
            className={`svc-detail-content${key === activeKey ? ' active' : ''}`}
          >
            <div className="svcd-head">
              <span className="svcd-icon"><Icon name={p.icon} /></span>
              <div>
                <h4 className="svcd-title">{p.title}</h4>
                <p className="svcd-sub">{p.sub}</p>
              </div>
            </div>

            <div className="svcd-label">{p.gridLabel}</div>
            <div className="svcd-grid">
              {p.items.map(it => (
                <div className="svcd-item" key={it.h}>
                  <div className="svcd-item-h">
                    <span className="svcd-item-icon"><Icon name={it.icon} /></span>{it.h}
                  </div>
                  <p>{it.p}</p>
                </div>
              ))}
            </div>

            <div className="svcd-label">{p.flowLabel}</div>
            <div className="svcd-flow">
              {p.flow.map((step, i) => (
                <Fragment key={step}>
                  <div className="svcd-step">
                    <span className="svcd-step-n">{i + 1}</span>{step}
                  </div>
                  {i < p.flow.length - 1 && <span className="svcd-arrow">→</span>}
                </Fragment>
              ))}
            </div>

            <div className="svcd-foot">
              <p className="svcd-note">{p.note}</p>
              <Link className="svcd-cta" to="/download">{p.cta} →</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══ Feature tabs ═════════════════════════════════════════════════════════
   Switching a tab flies the new cards in from the side you moved towards:
   pick a tab to the right and they enter from the right, to the left and they
   enter from the left. The direction is what makes it read as navigation
   rather than a generic fade — the set appears to slide into place from
   wherever you just pointed.
   ════════════════════════════════════════════════════════════════════════ */
function FeatureTabs() {
  const [tab, setTab] = useState('user');
  const [dir, setDir] = useState(1);
  const [switched, setSwitched] = useState(false);
  const [seen, setSeen] = useState(false);
  const wrap = useRef(null);

  /* The fly-in is reserved for real tab switches. On first load the pane would
     otherwise animate while still below the fold and be over before it is ever
     looked at, so the opening entrance waits until the grid is on screen. */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    if (REDUCED) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setSeen(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const select = key => {
    if (key === tab) return;
    const from = TABS.findIndex(t => t.key === tab);
    const to = TABS.findIndex(t => t.key === key);
    setDir(to > from ? 1 : -1);
    setSwitched(true);
    setTab(key);
  };

  return (
    <>
      <div className="feat-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`ftab${t.key === tab ? ' active' : ''}`}
            onClick={() => select(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Keyed on the tab so React remounts the whole pane, which is what
          replays the entrance. --dir carries the travel direction into CSS and
          --i carries each card's place in the stagger. */}
      <div
        ref={wrap}
        className={`feat-grid tab-pane${switched ? ' is-switching' : seen ? ' is-entering' : ''}`}
        key={tab}
        style={{ display: 'grid', '--dir': String(dir) }}
      >
        {TAB_FEATURES[tab].map((f, i) => (
          <div
            className="feat-card" key={f.h}
            style={{ '--i': String(i) }}
          >
            <span className="feat-ico"><Icon name={f.icon} /></span>
            <h3>{f.h}</h3>
            <p>{f.p}</p>
          </div>
        ))}
      </div>
    </>
  );
}

/* ══ Page ═════════════════════════════════════════════════════════════════ */
export default function Services() {
  const [open, setOpen] = useState(null);
  const activeColor = CARDS.find(c => c.key === open)?.color;

  return (
    <>
      <section id="services">
        <div className="sec-inner">
          <div className="reveal">
            <SiteBanner set="services" />
            <span className="sec-tag">{HEAD.tag}</span>
            <h2 className="sec-h2">
              {HEAD.title}<br /><em>{HEAD.em}</em>
            </h2>
            <p className="sec-sub">{HEAD.sub}</p>
          </div>

          <div className="services-grid">
            {CARDS.map((c, i) => (
              <ServiceCard
                key={c.key} card={c} delay={i * 110}
                open={open === c.key}
                onToggle={() => setOpen(v => (v === c.key ? null : c.key))}
              />
            ))}
          </div>

          <DetailPanel activeKey={open} color={activeColor} />
        </div>
      </section>

      <div className="divider" />

      <section id="features">
        <div className="sec-inner">
          <SecHead tag={FEAT_HEAD.tag} title={FEAT_HEAD.title} em={FEAT_HEAD.em} sub={FEAT_HEAD.sub} />
          <FeatureTabs />
        </div>
      </section>
    </>
  );
}
