import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';

/* ══════════════════════════════════════════════════════════════════════════
   Form atoms for the partner onboarding flow.

   The site's contact form is eight fields and styles them inline; this one is
   closer to a hundred across four steps, so the label / hint / control trio
   lives here once. Everything wears the same tokens as the rest of the site —
   grey ground, white card, green accent — and nothing here knows which step
   it is being used on.
   ══════════════════════════════════════════════════════════════════════════ */

export const Field = ({ label, required, optional, hint, htmlFor, children }) => (
  <div className="ob-field">
    {label && (
      <label className="ob-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="ob-req">*</span>}
        {optional && <span className="ob-opt">(optional)</span>}
      </label>
    )}
    {hint && <p className="ob-hint">{hint}</p>}
    {children}
  </div>
);

/* Section header inside a step — an icon tile and a title, repeated enough
   times that it earns a component. */
export const Block = ({ icon, title, children }) => (
  <section className="ob-block">
    <div className="ob-block__head">
      <span className="ob-block__ico"><Icon name={icon} className="ob-ico" /></span>
      <h2>{title}</h2>
    </div>
    <div className="ob-card">{children}</div>
  </section>
);

export const Chip = ({ active, onClick, children, title }) => (
  <button
    type="button" onClick={onClick} title={title}
    className={`ob-chip${active ? ' is-on' : ''}`}
  >
    {children}
  </button>
);

/* tone: ok | bad | info | warn */
export const Note = ({ tone = 'info', icon, children }) => (
  <p className={`ob-note ob-note--${tone}`}>
    {icon && <Icon name={icon} className="ob-ico" />}
    <span>{children}</span>
  </p>
);

export const TimePicker = ({ label, value, onChange }) => (
  <label className="ob-time">
    <span>{label}</span>
    <input type="time" value={value} onChange={e => onChange(e.target.value)} />
  </label>
);

/* ── File upload ─────────────────────────────────────────────────────────── */

/* Nothing is uploaded from this form yet — only the file's name travels with
   the application — so the sample buttons let the whole flow be walked
   end to end without hunting for a PDF of a licence. */
const sampleFileFor = (label, accept) => {
  const csv = accept.includes('.csv');
  const name = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_sample.${csv ? 'csv' : 'png'}`;
  const body = csv
    ? 'category,itemName,price,description,type,isBestseller\n'
      + 'Starters,Paneer Tikka,220,Char-grilled cottage cheese,Veg,yes\n'
      + 'Main Course,Chicken Biryani,320,Dum-cooked with long grain rice,Non-Veg,yes\n'
    : 'sample document';

  return new File([body], name, { type: csv ? 'text/csv' : 'image/png' });
};

export function FileDrop({ label, desc, file, onChange, accept = '.pdf,.jpg,.jpeg,.png' }) {
  const [over, setOver] = useState(false);
  const inputId = `ob-file-${label.replace(/[^a-zA-Z0-9]/g, '')}`;

  if (file) {
    return (
      <div className="ob-drop is-set">
        <Icon name="doc" className="ob-ico" />
        <div className="ob-drop__meta">
          <strong>{file.name}</strong>
          <span>{(file.size / 1024).toFixed(0)} KB</span>
        </div>
        <button
          type="button" className="ob-x" onClick={() => onChange(null)}
          aria-label={`Remove ${file.name}`}
        >
          <Icon name="close" className="ob-ico" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`ob-drop${over ? ' is-over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onChange(dropped);
      }}
    >
      <input
        type="file" id={inputId} accept={accept} className="ob-file"
        onChange={e => onChange(e.target.files?.[0] || null)}
      />
      <span className="ob-drop__ico"><Icon name="upload" className="ob-ico" /></span>
      <strong>{label}</strong>
      {desc && <p>{desc}</p>}
      <div className="ob-drop__acts">
        <label htmlFor={inputId} className="ob-drop__pick">
          <span>Choose a file</span> or drag it here
        </label>
        <button
          type="button" className="ob-ghost ob-ghost--sm"
          onClick={() => onChange(sampleFileFor(label, accept))}
        >
          <Icon name="sparkle" className="ob-ico" />
          Use a sample
        </button>
      </div>
      <p className="ob-drop__types">
        {accept.includes('.xlsx') ? 'CSV or XLSX, up to 10MB' : 'PDF, JPG or PNG, up to 10MB'}
      </p>
    </div>
  );
}

/* ── Modal ───────────────────────────────────────────────────────────────── */

export function Modal({ title, onClose, children, wide }) {
  /* Callers pass a fresh arrow every render, so the handler is read through a
     ref — binding the effect to `onClose` would tear the listener down and
     put the page's scroll back on every keystroke inside the sheet. */
  const close = useRef(onClose);
  close.current = onClose;

  /* Escape closes, and the body cannot scroll behind an open sheet — the
     step under this one is long enough that it otherwise scrolls away. */
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div className="ob-scrim" onClick={onClose} role="presentation">
      <div
        className={`ob-modal${wide ? ' ob-modal--wide' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={title}
      >
        <div className="ob-modal__head">
          <h3>{title}</h3>
          <button type="button" className="ob-x" onClick={onClose} aria-label="Close">
            <Icon name="close" className="ob-ico" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
