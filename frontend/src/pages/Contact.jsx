import { useState } from 'react';
import Icon from '../components/Icon';
import { SecHead } from '../components/Chrome';

const INFO = [
  {
    icon: 'orders', label: 'Email', value: 'hello@lampose.com',
    href: 'mailto:hello@lampose.com', sub: 'Answered within a day, usually sooner',
  },
  {
    icon: 'bell', label: 'Phone', value: '+91 63023 21942',
    href: 'tel:+916302321942', sub: 'Monday to Saturday, 9am to 7pm IST',
  },
  {
    icon: 'pin', label: 'Where we are', value: 'Visakhapatnam, Andhra Pradesh',
    sub: 'Come and see us if you are nearby',
  },
  {
    icon: 'users', label: 'Partnerships', value: 'hello@lampose.com',
    href: 'mailto:hello@lampose.com', sub: 'Rooms, kitchens, riders, press',
  },
];

const TYPES = [
  'User / Tenant', 'Hostel / PG Owner', 'Restaurant / Food Partner',
  'Delivery Partner', 'Investor / Media', 'Other',
];

export default function Contact() {
  const [form, setForm] = useState({
    name: '', phone: '', email: '', type: '', message: '',
  });
  const [note, setNote] = useState(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  /* There is no backend in this project, so the form composes a mail draft —
     the same thing the original page's sendMail() did. */
  const send = () => {
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      setNote({ err: true, text: 'Please add your name, email and a message.' });
      return;
    }
    const body = [
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
      `Reaching out as: ${form.type || 'Not specified'}`,
      '',
      form.message,
    ].join('\n');

    window.location.href =
      `mailto:hello@lampose.com?subject=${encodeURIComponent(`Lampose enquiry — ${form.name}`)}`
      + `&body=${encodeURIComponent(body)}`;

    setNote({ err: false, text: 'Opening your mail app…' });
    setTimeout(() => setNote(null), 4000);
  };

  return (
    <section id="contact">
      <div className="sec-inner">
        <SecHead
          tag="Get in touch" title="Talk to a person," em="not a form."
          sub="A booking gone wrong, a kitchen you want listed, or a question about a city — it reaches the same small team either way."
        />

        <div className="contact-wrap">
          <div className="contact-info reveal-l">
            {INFO.map((i, n) => (
              <div className="cinfo-item" key={i.label} style={{ '--i': String(n) }}>
                <div className="cinfo-icon"><Icon name={i.icon} /></div>
                <div className="cinfo-body">
                  <div className="cinfo-lbl">{i.label}</div>
                  <div className="cinfo-val">
                    {i.href ? <a href={i.href}>{i.value}</a> : i.value}
                  </div>
                  <div className="cinfo-sub">{i.sub}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="contact-form reveal-r">
            <div className="cf-title">Send a Message</div>
            <div className="cf-sub">
              Tell us what happened and we will come back to you, usually the same day.
            </div>

            <div className="cf-row">
              <div className="cf-field">
                <label htmlFor="name">Full Name</label>
                <input
                  id="name" type="text" placeholder="Your name"
                  value={form.name} onChange={set('name')}
                />
              </div>
              <div className="cf-field">
                <label htmlFor="phone">Phone Number</label>
                <input
                  id="phone" type="tel" placeholder="+91 XXXXX XXXXX"
                  value={form.phone} onChange={set('phone')}
                />
              </div>
            </div>

            <div className="cf-field">
              <label htmlFor="email">Email Address</label>
              <input
                id="email" type="email" placeholder="you@example.com"
                value={form.email} onChange={set('email')}
              />
            </div>

            <div className="cf-field">
              <label htmlFor="type">I&apos;m reaching out as a</label>
              <select id="type" value={form.type} onChange={set('type')}>
                <option value="" disabled>Select type</option>
                {TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div className="cf-field">
              <label htmlFor="message">Message</label>
              <textarea
                id="message" rows="4" placeholder="Tell us what's on your mind..."
                value={form.message} onChange={set('message')}
              />
            </div>

            <button className="btn-submit" onClick={send}>Send Message →</button>

            <p className="cf-note" style={note?.err ? { color: 'var(--amber)' } : undefined}>
              {note?.text || 'We respect your privacy. Your details are never shared.'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
