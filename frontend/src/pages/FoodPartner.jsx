import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';
import { Modal } from '../components/partner/OnboardingFields';
import { BENEFITS, FAQS, HOW_STEPS, STATS } from '../data/partner';

/* ══════════════════════════════════════════════════════════════════════════
   Food partner — the page a kitchen owner lands on.

   Its whole job is to get someone to the onboarding form knowing what will be
   asked of them, so the four steps and the document list are on this page
   rather than discovered halfway through the form. The one decision taken
   here is which kind of partner they are: a restaurant builds a menu during
   onboarding, a meat centre does not.
   ══════════════════════════════════════════════════════════════════════════ */

/* The hero art. Drawn in the page rather than loaded as a picture, for the
   reason Banners.jsx gives: an <img> is an isolated document that cannot see
   the site's tokens or its webfont, so a baked screenshot would drift the
   moment either changed. It shows the one thing a kitchen owner wants to see
   on this page — an order arriving, and the money that follows it. */
const ORDER = [
  { qty: 1, name: 'Chicken biryani', price: 320 },
  { qty: 2, name: 'Butter naan', price: 80 },
  { qty: 1, name: 'Gulab jamun', price: 60 },
];

const HeroArt = () => (
  <div className="fp-art" aria-hidden="true">
    <div className="fp-art__glow" />

    <article className="fp-ticket">
      <header className="fp-ticket__head">
        <span className="fp-live"><i />Live order</span>
        <span className="fp-ticket__id">#ORD-2481</span>
      </header>

      <p className="fp-ticket__for">Table of one · MVP Colony · 600 m away</p>

      <ul className="fp-ticket__items">
        {ORDER.map(line => (
          <li key={line.name}>
            <span className="fp-ticket__qty">{line.qty}×</span>
            <span className="fp-ticket__name">{line.name}</span>
            <span className="fp-ticket__price">₹{line.price}</span>
          </li>
        ))}
      </ul>

      <footer className="fp-ticket__foot">
        <div>
          <span>Order total</span>
          <strong>₹460</strong>
        </div>
        <span className="fp-ticket__go">Accept</span>
      </footer>
    </article>

    <div className="fp-float fp-float--payout">
      <span className="fp-float__ico"><Icon name="wallet" className="ob-ico" /></span>
      <div>
        <strong>₹8,240 settled</strong>
        <span>Monday, as always</span>
      </div>
    </div>

    <div className="fp-float fp-float--rating">
      <span className="fp-float__ico"><Icon name="verified" className="ob-ico" /></span>
      <div>
        <strong>4.8 from 214 diners</strong>
        <span>All within a walk</span>
      </div>
    </div>
  </div>
);

const TYPES = [
  {
    type: 'food', icon: 'food', title: 'Restaurant or kitchen',
    desc: 'Restaurant details, your menu, FSSAI licence and payout account.',
  },
  {
    type: 'meat', icon: 'store', title: 'Meat centre',
    desc: 'Centre details, opening hours, FSSAI licence and payout account.',
  },
];

export default function FoodPartner() {
  const [picking, setPicking] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const navigate = useNavigate();

  return (
    <>
      <section id="fp-hero">
        <div className="sec-inner">
          <div className="fp-hero">
            <div className="fp-hero__copy reveal-l">
              <span className="sec-tag">Partner with Lampose</span>
              <h1 className="fp-hero__h1">
                Your kitchen, on the street <em>it already feeds.</em>
              </h1>
              <p className="fp-hero__sub">
                Lampose lists verified stays and the kitchens beside them. Put yours on
                the map and take orders from the residents who live a walk away — no
                listing fee, no brokerage, and a person from our team who turns up in
                the first week.
              </p>

              <div className="fp-hero__acts">
                <button type="button" className="fp-cta" onClick={() => setPicking(true)}>
                  Start onboarding
                  <Icon name="arrowR" className="ob-ico" />
                </button>
                <a href="#fp-how" className="fp-cta fp-cta--ghost">See what is involved</a>
              </div>
            </div>

            <div className="fp-hero__art reveal-r">
              <HeroArt />
            </div>
          </div>

          <ul className="fp-stats reveal">
            {STATS.map(([value, label]) => (
              <li key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="divider" />

      <section id="fp-why">
        <div className="sec-inner">
          <SecHead
            tag="Why partner" title="What you get," em="in plain terms."
            sub="No dashboards full of numbers nobody reads. Four things that change how the week runs."
          />

          <div className="fp-grid">
            {BENEFITS.map((benefit, n) => (
              <article className="fp-card reveal" key={benefit.title} style={{ transitionDelay: `${n * 80}ms` }}>
                <span className="fp-card__ico"><Icon name={benefit.icon} className="fp-ico" /></span>
                <h3>{benefit.title}</h3>
                <p>{benefit.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="fp-how">
        <div className="sec-inner">
          <SecHead
            tag="How it works" title="Four steps," em="about ten minutes."
            sub="You can save a half-finished application and come back to it — nothing here has to be done in one sitting."
          />

          <ol className="fp-steps">
            {HOW_STEPS.map(step => (
              <li className="fp-step reveal" key={step.step}>
                <span className="fp-step__n">{step.step}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="fp-ready reveal">
            <div>
              <h3>Have these to hand</h3>
              <p>PAN · FSSAI licence · GST registration (unless exempt) · a cancelled cheque</p>
            </div>
            <button type="button" className="fp-cta" onClick={() => setPicking(true)}>
              Start onboarding
              <Icon name="arrowR" className="ob-ico" />
            </button>
          </div>
        </div>
      </section>

      <div className="divider" />

      <section id="fp-faq">
        <div className="sec-inner">
          <SecHead
            tag="Questions" title="Asked before," em="answered here."
            sub="If yours is not on this list, ring us — the number is at the bottom of every page."
          />

          <div className="fp-faqs">
            {FAQS.map((faq, i) => (
              <div className={`fp-faq${openFaq === i ? ' is-open' : ''}`} key={faq.q}>
                <button
                  type="button" className="fp-faq__q"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{faq.q}</span>
                  <Icon name={openFaq === i ? 'minus' : 'plus'} className="ob-ico" />
                </button>
                {openFaq === i && <p className="fp-faq__a">{faq.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="fp-cta">
        <div className="sec-inner">
          <div className="fp-band reveal">
            <h2>Ready to cook for the street?</h2>
            <p>
              Fill the application in today and someone from the team will be in touch
              within 24 hours.
            </p>
            <div className="fp-band__acts">
              <button type="button" className="fp-cta fp-cta--light" onClick={() => setPicking(true)}>
                Start onboarding
              </button>
              <Link to="/contact" className="fp-cta fp-cta--ghost fp-cta--on-dark">
                Talk to someone first
              </Link>
            </div>
          </div>
        </div>
      </section>

      {picking && (
        <Modal title="What are you listing?" onClose={() => setPicking(false)}>
          <p className="ob-hint">
            The form differs slightly between the two — a restaurant builds its menu
            during onboarding, a meat centre sets its counter up with our team.
          </p>
          <div className="fp-picks">
            {TYPES.map(option => (
              <button
                key={option.type} type="button" className="fp-pick"
                onClick={() => navigate(`/food-partner/onboarding?type=${option.type}`)}
              >
                <span className="fp-pick__ico"><Icon name={option.icon} className="fp-ico" /></span>
                <strong>{option.title}</strong>
                <span className="fp-pick__desc">{option.desc}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
