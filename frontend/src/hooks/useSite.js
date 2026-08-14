import { useEffect, useRef, useState } from 'react';

const REDUCED = typeof matchMedia !== 'undefined'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = typeof matchMedia !== 'undefined'
  && matchMedia('(hover: hover) and (pointer: fine)').matches;

export { FINE, REDUCED };

/**
 * Custom cursor: a dot pinned to the pointer and a ring that lags behind it.
 * `.cg` on <body> is what the stylesheet uses to grow the ring over anything
 * interactive, so hover intent is delegated rather than bound per element.
 */
export function useCursor() {
  const dot = useRef(null);
  const ring = useRef(null);

  useEffect(() => {
    if (!FINE || REDUCED) return;
    document.body.classList.add('has-cursor');

    let mx = 0, my = 0, rx = 0, ry = 0, raf;

    const move = e => {
      mx = e.clientX; my = e.clientY;
      if (dot.current) {
        dot.current.style.left = `${mx}px`;
        dot.current.style.top = `${my}px`;
      }
    };
    const loop = () => {
      rx += (mx - rx) * 0.11;
      ry += (my - ry) * 0.11;
      if (ring.current) {
        ring.current.style.left = `${rx}px`;
        ring.current.style.top = `${ry}px`;
      }
      raf = requestAnimationFrame(loop);
    };

    const SEL = 'a,button,.svc-card,.stat-card,.hc';
    const over = e => { if (e.target.closest?.(SEL)) document.body.classList.add('cg'); };
    const out = e => {
      if (e.target.closest?.(SEL) && !e.relatedTarget?.closest?.(SEL)) {
        document.body.classList.remove('cg');
      }
    };

    document.addEventListener('mousemove', move);
    document.addEventListener('pointerover', over);
    document.addEventListener('pointerout', out);
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('mousemove', move);
      document.removeEventListener('pointerover', over);
      document.removeEventListener('pointerout', out);
      document.body.classList.remove('has-cursor', 'cg');
    };
  }, []);

  return { dot, ring };
}

/** Scroll progress bar width + the navbar's `scrolled` state, in one listener. */
export function useScrollChrome() {
  const bar = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
      const h = document.documentElement;
      const span = h.scrollHeight - h.clientHeight;
      if (bar.current) {
        bar.current.style.width = `${span > 0 ? (window.scrollY / span) * 100 : 0}%`;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return { bar, scrolled };
}

/* Every reveal variant starts at opacity 0 and is only ever un-hidden by the
   `visible` class, so anything left out of this list stays invisible for good.
   `-l` and `-r` slide in from the sides and are used on How, Food and Contact. */
const REVEAL_SEL = '.reveal,.reveal-l,.reveal-r,.sec-tag';

/** Adds `visible` on first intersection. One observer for every reveal. */
export function useReveals(deps = []) {
  useEffect(() => {
    if (REDUCED) {
      document.querySelectorAll(REVEAL_SEL).forEach(el => el.classList.add('visible'));
      return;
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll(REVEAL_SEL).forEach(el => io.observe(el));

    /* Safety sweep. Every reveal starts at opacity 0, so anything this observer
       fails to pick up — an element added late, a missed callback, a threshold
       that never resolves — would stay invisible permanently. After a few
       seconds, show whatever is still hidden and inside the viewport. Content
       being briefly un-animated is always better than content being lost. */
    const sweep = setTimeout(() => {
      document.querySelectorAll(REVEAL_SEL).forEach(el => {
        if (el.classList.contains('visible')) return;
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('visible');
      });
    }, 3000);

    return () => { io.disconnect(); clearTimeout(sweep); };
  }, deps); // eslint-disable-line
}

/** Pointer-following mesh gradient behind the hero. */
export function useHeroMesh() {
  const mesh = useRef(null);
  const hero = useRef(null);

  useEffect(() => {
    const h = hero.current;
    if (!h || REDUCED || !FINE) return;
    const move = e => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      if (mesh.current) {
        mesh.current.style.background =
          `radial-gradient(ellipse 65% 55% at ${x}% ${y}%,rgba(82,160,109,.22) 0%,transparent 60%),`
          + `radial-gradient(ellipse 50% 65% at ${100 - x}% ${100 - y}%,rgba(46,94,64,.16) 0%,transparent 60%)`;
      }
    };
    h.addEventListener('mousemove', move);
    return () => h.removeEventListener('mousemove', move);
  }, []);

  return { hero, mesh };
}

/** Randomised drifting particles. Built once, in the DOM, never re-rendered. */
export function useParticles(count = 32) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED) return;
    el.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'pt';
      p.style.cssText =
        `left:${Math.random() * 100}%;--d:${9 + Math.random() * 13}s;`
        + `--dl:${Math.random() * 12}s;--tx:${(Math.random() - 0.5) * 140}px;`;
      el.appendChild(p);
    }
    return () => { el.innerHTML = ''; };
  }, [count]);

  return ref;
}

/** Soft floating blobs behind the stats grid. */
export function useStatDots(count = 8) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED) return;
    const made = [];
    for (let i = 0; i < count; i++) {
      const d = document.createElement('div');
      d.className = 'stat-dot';
      const size = 20 + Math.random() * 60;
      d.style.cssText =
        `width:${size}px;height:${size}px;left:${Math.random() * 100}%;`
        + `top:${Math.random() * 100}%;--dd:${6 + Math.random() * 6}s;--ddl:${Math.random() * 4}s;`;
      el.appendChild(d);
      made.push(d);
    }
    return () => made.forEach(d => d.remove());
  }, [count]);

  return ref;
}

/**
 * Arms a ticker band for its entrance and guarantees the entrance happens.
 *
 * `is-armed` is what puts the tags into their hidden starting state, and it is
 * added from JS — so if this never runs the tags simply stay visible. Once
 * armed, `visible` must arrive or the band would be blank, hence the hard
 * fallback: the observer is the nice path, the timer is the promise.
 */
export function useBandReveal(ref, { delay = 2500 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (REDUCED) { el.classList.add('visible'); return; }

    el.classList.add('is-armed');

    const show = () => el.classList.add('visible');
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { show(); io.disconnect(); }
    }, { threshold: 0, rootMargin: '200px 0px' });
    io.observe(el);

    // Unconditional. Losing the scroll-triggered stagger is a cosmetic cost;
    // a permanently empty band is not.
    const fallback = setTimeout(show, delay);

    return () => { io.disconnect(); clearTimeout(fallback); };
  }, [ref, delay]);
}

/**
 * Leans the ticker rows in the direction the page is being scrolled, by an
 * amount proportional to scroll speed — so throwing the page shears the band
 * and it springs back when you stop.
 *
 * The rows are already running a CSS transform animation, so the lean is
 * written to a custom property on the container and applied by an ancestor
 * rule; setting transform on the track itself would be overridden by the
 * marquee keyframes.
 */
export function useTickerLean({ max = 9, gain = 0.32 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || REDUCED) return;

    let last = window.scrollY;
    let vel = 0;
    let raf = null;

    const frame = () => {
      vel *= 0.86;                       // decay toward rest
      const lean = Math.max(-max, Math.min(max, vel * gain));
      el.style.setProperty('--lean', `${lean.toFixed(2)}deg`);
      if (Math.abs(vel) > 0.06) {
        raf = requestAnimationFrame(frame);
      } else {
        el.style.setProperty('--lean', '0deg');
        raf = null;                      // idle: no rAF running at all
      }
    };

    const onScroll = () => {
      const y = window.scrollY;
      vel += y - last;
      last = y;
      if (raf === null) raf = requestAnimationFrame(frame);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [max, gain]);

  return ref;
}

/** Pulls a button toward the cursor while it is over it. */
export function useMagnetic(strength = 0.2) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !FINE || REDUCED) return;
    const move = e => {
      const r = el.getBoundingClientRect();
      el.style.transform =
        `translate(${(e.clientX - r.left - r.width / 2) * strength}px,`
        + `${(e.clientY - r.top - r.height / 2) * strength}px)`;
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    };
  }, [strength]);

  return ref;
}

/**
 * Counts a stat up and sweeps its ring on first view. Both write the DOM
 * directly — a state update per tick would re-render the grid ~60 times.
 *
 * `suffix` is per-stat rather than a hardcoded "+": a satisfaction score is a
 * percentage, and a city count is neither. Adding "+" to everything printed
 * "98+" under "% Satisfaction".
 *
 * When the count lands, `is-done` goes on the card so CSS can celebrate it.
 */
export function useStatCard(target, pct, suffix = '+') {
  const card = useRef(null);
  const num = useRef(null);
  const ringPath = useRef(null);

  useEffect(() => {
    const el = card.current;
    if (!el) return;

    const write = v => {
      if (num.current) num.current.textContent = Math.floor(v).toLocaleString('en-IN') + suffix;
    };
    const sweep = () => {
      if (ringPath.current) ringPath.current.style.strokeDashoffset = 220 * (1 - pct / 100);
    };

    if (REDUCED) { write(target); sweep(); el.classList.add('is-done'); return; }

    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();

      let c = 0;
      const step = target / 62;
      const timer = setInterval(() => {
        c = Math.min(c + step, target);
        write(c);
        if (c >= target) { clearInterval(timer); el.classList.add('is-done'); }
      }, 22);

      setTimeout(sweep, 200);
    }, { threshold: 0.5 });

    io.observe(el);
    return () => io.disconnect();
  }, [target, pct, suffix]);

  return { card, num, ringPath };
}

/** 3D tilt plus a shine hotspot that tracks the pointer across the card. */
export function useTilt() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !FINE || REDUCED) return;
    const move = e => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.transform =
        `perspective(800px) rotateX(${(y - 0.5) * 10}deg) `
        + `rotateY(${(x - 0.5) * -10}deg) translateY(-10px)`;
      el.style.setProperty('--sx', `${x * 100}%`);
      el.style.setProperty('--sy', `${y * 100}%`);
    };
    const leave = () => { el.style.transform = ''; };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => {
      el.removeEventListener('mousemove', move);
      el.removeEventListener('mouseleave', leave);
    };
  }, []);

  return ref;
}

/** Rotates the hero activity toast: hide, swap the message, show, repeat. */
export function useToastRotator(messages) {
  const [msg, setMsg] = useState(messages[0]);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (REDUCED) return;
    let i = 0;
    let hideTimer, swapTimer;

    const cycle = () => {
      setShow(false);
      swapTimer = setTimeout(() => {
        setMsg(messages[i++ % messages.length]);
        setShow(true);
        hideTimer = setTimeout(() => setShow(false), 3200);
      }, 400);
    };

    const start = setTimeout(() => { cycle(); }, 2500);
    const loop = setInterval(cycle, 5500);

    return () => {
      clearTimeout(start); clearTimeout(hideTimer);
      clearTimeout(swapTimer); clearInterval(loop);
    };
  }, [messages]);

  return { msg, show };
}
