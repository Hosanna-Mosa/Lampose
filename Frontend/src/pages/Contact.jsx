import { useState } from 'react';
import { Icon } from '../components/common/atoms/Icon/Icon';
import { SecHead } from '../components/common/molecules/SecHead/SecHead';
import { INFO, TYPES } from '../components/contact/utils/contactInfo';
import { Anchor, Box, Input, Label, Option, PlainButton, Region, Select, Text, TextArea } from '../components/common/atoms';



export function Contact() {
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
      `mailto:contact@lampose.com?subject=${encodeURIComponent(`Lampose enquiry — ${form.name}`)}`
      + `&body=${encodeURIComponent(body)}`;

    setNote({ err: false, text: 'Opening your mail app…' });
    setTimeout(() => setNote(null), 4000);
  };

  return (
    <Region id="contact">
      <Box className="sec-inner">
        <SecHead
          tag="Get in touch" title="Talk to a person," em="not a form."
          sub="A booking gone wrong, a kitchen you want listed, or a question about a city — it reaches the same small team either way."
        />

        <Box className="contact-wrap">
          <Box className="contact-info reveal-l">
            {INFO.map((i, n) => (
              <Box className="cinfo-item" key={i.label} style={{ '--i': String(n) }}>
                <Box className="cinfo-icon"><Icon name={i.icon} /></Box>
                <Box className="cinfo-body">
                  <Box className="cinfo-lbl">{i.label}</Box>
                  <Box className="cinfo-val">
                    {i.href ? <Anchor href={i.href}>{i.value}</Anchor> : i.value}
                  </Box>
                  <Box className="cinfo-sub">{i.sub}</Box>
                </Box>
              </Box>
            ))}
          </Box>

          <Box className="contact-form reveal-r">
            <Box className="cf-title">Send a Message</Box>
            <Box className="cf-sub">
              Tell us what happened and we will come back to you, usually the same day.
            </Box>

            <Box className="cf-row">
              <Box className="cf-field">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name" type="text" placeholder="Your name"
                  value={form.name} onChange={set('name')}
                />
              </Box>
              <Box className="cf-field">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone" type="tel" placeholder="+91 XXXXX XXXXX"
                  value={form.phone} onChange={set('phone')}
                />
              </Box>
            </Box>

            <Box className="cf-field">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email" type="email" placeholder="you@example.com"
                value={form.email} onChange={set('email')}
              />
            </Box>

            <Box className="cf-field">
              <Label htmlFor="type">I&apos;m reaching out as a</Label>
              <Select id="type" value={form.type} onChange={set('type')}>
                <Option value="" disabled>Select type</Option>
                {TYPES.map(t => <Option key={t}>{t}</Option>)}
              </Select>
            </Box>

            <Box className="cf-field">
              <Label htmlFor="message">Message</Label>
              <TextArea
                id="message" rows="4" placeholder="Tell us what's on your mind..."
                value={form.message} onChange={set('message')}
              />
            </Box>

            <PlainButton className="btn-submit" onClick={send}>Send Message →</PlainButton>

            <Text className="cf-note" style={note?.err ? { color: 'var(--amber)' } : undefined}>
              {note?.text || 'We respect your privacy. Your details are never shared.'}
            </Text>
          </Box>
        </Box>
      </Box>
    </Region>
  );
}
