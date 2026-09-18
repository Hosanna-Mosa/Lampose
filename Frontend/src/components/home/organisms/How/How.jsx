import { useEffect, useRef } from 'react';
import { Icon } from '../../../common/atoms/Icon/Icon';
import { SecHead } from '../../../common/molecules/SecHead/SecHead';
import { REDUCED } from '../../../../hooks/useSite';
import { STEPS } from '../../../how/utils/steps';
import { QR_STEPS } from '../../../how/utils/qrSteps';
import { VOUCHERS } from '../../../how/utils/vouchers';
import { HEAD, QR_HEAD, CARDS } from '../../../how/utils/howCopy';
import { Box, Emphasis, Heading, Image, Inline, PlainButton, Region, Text } from '../../../common/atoms';

/* Content says what actually happens at each step, in the order it happens,
   rather than naming the stage and leaving the reader to fill it in. */







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

export function How() {
  const timeline = useRef(null);
  useTimeline(timeline);

  return (
    <>
      <Region id="how">
        <Box className="sec-inner">
          <SecHead tag={HEAD.tag} title={HEAD.title} em={HEAD.em} sub={HEAD.sub} />

          <Box className="timeline" ref={timeline}>
            {STEPS.map((s, i) => (
              <Box className="tl-step" key={s.n} style={{ '--i': String(i) }}>
                <Box className="tl-num">{s.n}</Box>
                <Box className="tl-body">
                  <Heading level={3}>{s.h}</Heading>
                  <Text>{s.p}</Text>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
      </Region>

      <Box className="divider" />

      <Region
        id="qr-features"
        style={{ background: 'var(--forest)', position: 'relative', overflow: 'hidden' }}
      >
        <Box className="sec-inner" style={{ position: 'relative', zIndex: 1 }}>
          <Box className="qrf-grid">
            <Box className="left reveal-l">
              <Image
                className="sec-illo left" src="/images/qr-checkin.svg" loading="lazy"
                alt="QR check-in and delivery verification"
                style={{
                  borderRadius: 'var(--rl)', objectFit: 'cover',
                  height: 240, width: '100%', maxWidth: 360, marginBottom: '1.75rem',
                }}
              />
              <Inline className="sec-tag">{QR_HEAD.tag}</Inline>
              <Heading level={2} className="sec-h2">
                {QR_HEAD.title} <Emphasis>{QR_HEAD.em}</Emphasis>
              </Heading>
              <Text className="sec-sub" style={{ margin: '1rem 0 2rem' }}>{QR_HEAD.sub}</Text>

              <Box className="qrf-steps">
                {QR_STEPS.map((s, i) => (
                  <Box className="qrf-step" key={s.n} style={{ '--i': String(i) }}>
                    <Box className="qrf-num">{s.n}</Box>
                    <Box className="qrf-body">
                      <Heading level={3}>{s.h}</Heading>
                      <Text>{s.p}</Text>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            <Box className="qrf-right reveal-r">
              {CARDS.map((c, i) => (
                <Box className="qrf-card" key={c.title} style={{ '--i': String(i) }}>
                  <Box className="qrf-card-head">
                    <Icon name={c.icon} />{c.title}
                  </Box>
                  {c.rows.map(r => (
                    <Box className="qrf-detail" key={r.k}>
                      <Inline className="qrf-key">{r.k}</Inline>
                      <Inline className={`qrf-val${r.green ? ' qrf-green' : ''}`}>{r.v}</Inline>
                    </Box>
                  ))}
                  {c.note && (
                    <Box className="qrf-coupon">
                      <Icon name="tag" />{c.note}
                    </Box>
                  )}
                </Box>
              ))}

              <Box className="qrf-card" style={{ '--i': '2' }}>
                <Box className="qrf-card-head">
                  <Icon name="tag" />My vouchers
                </Box>
                {VOUCHERS.map(v => (
                  <Box className="qrf-voucher" key={v.title}>
                    <Box className="qrf-v-left">
                      <Box className="qrf-v-title">{v.title}</Box>
                      <Box className="qrf-v-sub">{v.sub}</Box>
                    </Box>
                    <PlainButton className="qrf-v-btn">Use</PlainButton>
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>
        </Box>
      </Region>
    </>
  );
}
