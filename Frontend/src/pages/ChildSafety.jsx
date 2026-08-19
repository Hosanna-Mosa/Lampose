import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/* Same chapter-pill pattern as Privacy and Terms — this page is a third
   document in that set, so it reuses their markup and stylesheet rather than
   introducing a parallel one. */
const CHAPTERS = [
  { id: 'ch-1', label: '1. Zero Tolerance' },
  { id: 'ch-2', label: '2. Who Lampose Is For' },
  { id: 'ch-3', label: '3. Reporting a Concern' },
  { id: 'ch-4', label: '4. Handling of Reports' },
  { id: 'ch-5', label: '5. Authorities' },
  { id: 'ch-6', label: '6. Prevention' },
  { id: 'ch-7', label: '7. Contact' },
  { id: 'ch-8', label: '8. Related Policies' },
];

const PAGE_TITLE = 'Lampose Child Safety Standards';
const PAGE_DESC =
  'Lampose Child Safety Standards describing our zero-tolerance approach to '
  + 'child sexual abuse and exploitation, user safety, reporting concerns, and '
  + 'safety contact information.';

const LAST_UPDATED = '19 August 2026';

/* The site ships a single static <head>, so a policy page that may be linked
   directly from an app store listing sets its own title and description on
   mount and puts the site-wide ones back on the way out. */
function useDocumentMeta(title, description) {
  useEffect(() => {
    const prevTitle = document.title;
    const tag = document.querySelector('meta[name="description"]');
    const prevDesc = tag ? tag.getAttribute('content') : null;

    document.title = title;
    if (tag) tag.setAttribute('content', description);

    return () => {
      document.title = prevTitle;
      if (tag && prevDesc !== null) tag.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}

export default function ChildSafety() {
  const [activeChapter, setActiveChapter] = useState('ch-1');

  useDocumentMeta(PAGE_TITLE, PAGE_DESC);

  const scrollToChapter = (id) => {
    setActiveChapter(id);
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -120;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  return (
    <div className="privacy-page">
      {/* Header Banner */}
      <section id="privacy-hero">
        <div className="sec-inner">
          <div className="reveal">
            <span className="sec-tag">Trust &amp; Safety</span>
            <h1 className="privacy-title">
              Child Safety <em>Standards</em>
            </h1>
            <p className="privacy-subtitle">
              Keeping Lampose safe for everyone. These standards set out how LAMPOSE PRIVATE LIMITED
              approaches the prevention of child sexual abuse and exploitation (CSAE), the protection
              of minors, and the handling of safety concerns raised by our community.
            </p>
          </div>

          {/* Metadata Banner */}
          <div className="privacy-meta-banner">
            <div className="meta-item">
              <span className="meta-label">ENTITY</span>
              <span className="meta-val">LAMPOSE PRIVATE LIMITED</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">APPLIES TO</span>
              <span className="meta-val">LAMPOSE (Android &amp; iOS) &amp; Web</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">LAST UPDATED</span>
              <span className="meta-val">{LAST_UPDATED}</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">POLICY STANCE</span>
              <span className="meta-val meta-badge">Zero Tolerance</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Pill Navigation */}
      <div className="privacy-nav-sticky">
        <div className="sec-inner">
          <nav className="privacy-nav-track" aria-label="Child safety standards sections">
            {CHAPTERS.map((ch) => (
              <button
                key={ch.id}
                type="button"
                className={`privacy-nav-pill ${activeChapter === ch.id ? 'active' : ''}`}
                onClick={() => scrollToChapter(ch.id)}
              >
                {ch.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Document Body */}
      <section className="privacy-body-section">
        <div className="sec-inner">
          <div className="privacy-document-card">

            <div className="privacy-callout warning">
              <strong>If a child is in immediate danger, contact the emergency services first.</strong>
              {' '}
              In India, dial <strong>112</strong> for emergencies or <strong>100</strong> for the
              police. Lampose is not an emergency service and cannot respond in real time.
            </div>

            <p className="privacy-subtitle" style={{ marginBottom: '2.5rem' }}>
              Lampose is committed to maintaining a safe environment for all users. We have zero
              tolerance for child sexual abuse and exploitation (CSAE), child sexual abuse material
              (CSAM), grooming, sexual exploitation of minors, or any other form of abuse involving
              children.
            </p>

            {/* CHAPTER 1 */}
            <article id="ch-1" className="privacy-group">
              <div className="group-header">
                <h2>1. Zero-Tolerance Policy</h2>
                <span className="group-sections">SECTION 1</span>
              </div>

              <div className="policy-block">
                <h3>1.1 PROHIBITED CONDUCT AND CONTENT</h3>
                <p>Lampose strictly prohibits:</p>
                <ul className="policy-list">
                  <li>Child sexual abuse and exploitation</li>
                  <li>Child sexual abuse material (CSAM)</li>
                  <li>Sexual content involving minors</li>
                  <li>Grooming or attempts to sexually exploit minors</li>
                  <li>Solicitation or sexualisation of minors</li>
                  <li>Sharing, requesting, or distributing CSAM</li>
                  <li>Encouraging or facilitating the exploitation or abuse of children</li>
                  <li>Any behaviour intended to endanger or sexually exploit a child</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>1.2 ENFORCEMENT</h3>
                <p>
                  Any content or behaviour that violates these standards may result in appropriate
                  action, including removal of content, suspension, or termination of an account, in
                  accordance with Lampose&apos;s policies and applicable laws.
                </p>
              </div>
            </article>

            {/* CHAPTER 2 */}
            <article id="ch-2" className="privacy-group">
              <div className="group-header">
                <h2>2. Who Lampose Is For &amp; User Safety</h2>
                <span className="group-sections">SECTIONS 2 – 4</span>
              </div>

              <div className="policy-block">
                <h3>2. AGE REQUIREMENT</h3>
                <p>
                  Lampose accounts are intended for adults. Under our{' '}
                  <Link to="/terms">Terms and Conditions</Link>, you must be at least 18 years of age
                  and legally competent to enter into binding contracts under the Indian Contract Act,
                  1872, in order to register for an account, make a booking, or list a property or
                  service. Lampose is not designed for, or directed at, children.
                </p>
              </div>

              <div className="policy-block">
                <h3>3. PROHIBITED USES OF THE PLATFORM</h3>
                <p>Users must never use Lampose to:</p>
                <ul className="policy-list">
                  <li>Contact minors for sexual purposes</li>
                  <li>Request or share sexual content involving minors</li>
                  <li>Encourage child exploitation</li>
                  <li>Arrange sexual encounters involving minors</li>
                  <li>Share identifying information about a child for harmful purposes</li>
                  <li>Facilitate abuse, exploitation, or trafficking of children</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>4. EXPECTED CONDUCT</h3>
                <p>
                  Users are expected to follow Lampose&apos;s{' '}
                  <Link to="/terms">Terms and Conditions</Link>, which set out the conduct rules that
                  apply across the platform, and our <Link to="/privacy">Privacy Policy</Link>, which
                  explains how personal information is handled.
                </p>
              </div>
            </article>

            {/* CHAPTER 3 */}
            <article id="ch-3" className="privacy-group">
              <div className="group-header">
                <h2>3. Reporting Safety Concerns</h2>
                <span className="group-sections">SECTIONS 5 – 7</span>
              </div>

              <div className="policy-block">
                <h3>5. HOW TO REPORT</h3>
                <p>
                  If you encounter content or behaviour involving suspected child sexual abuse or
                  exploitation, please report it to us so that it can be reviewed.
                </p>
                <ul className="policy-list">
                  <li>
                    <strong>In the Lampose app:</strong> open <em>Support</em> and choose{' '}
                    <em>Report a serious problem</em>. A report goes to our safety team rather than to
                    the person it concerns.
                  </li>
                  <li>
                    <strong>By email:</strong> write to the safety contact in section 7 below, using
                    the subject line <strong>&quot;Child Safety Concern&quot;</strong>.
                  </li>
                </ul>
                <p>
                  The in-app report reasons cover general safety and conduct concerns. If your concern
                  involves a child, please also contact the safety email below so that it reaches the
                  right people directly.
                </p>
              </div>

              <div className="policy-block">
                <h3>6. WHAT TO INCLUDE IN A REPORT</h3>
                <p>
                  So that a concern can be reviewed properly, please provide as much relevant
                  information as you safely can:
                </p>
                <ul className="policy-list">
                  <li>A description of the concern</li>
                  <li>Relevant account or profile information</li>
                  <li>The date and approximate time of the incident</li>
                  <li>Relevant content or message information</li>
                  <li>Any other information that may help Lampose review the concern</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>7. HANDLING SUSPECTED MATERIAL</h3>
                <div className="privacy-callout warning">
                  <strong>Do not upload, forward, or redistribute suspected CSAM.</strong> Describe
                  what you saw and where you saw it instead. Sharing such material further — even in
                  order to report it — may itself be unlawful.
                </div>
                <p>
                  Concerns may also be raised directly with the relevant public authorities. The
                  following services are operated by others, not by Lampose:
                </p>
                <ul className="policy-list">
                  <li><strong>112</strong> — national emergency number (India)</li>
                  <li><strong>100</strong> — police</li>
                  <li>
                    <strong>1098</strong> — Childline, India&apos;s helpline for children in need of
                    care and protection
                  </li>
                  <li>
                    <strong>cybercrime.gov.in</strong> — the Government of India National Cyber Crime
                    Reporting Portal, which accepts reports of child-related cyber crime
                  </li>
                </ul>
              </div>
            </article>

            {/* CHAPTER 4 */}
            <article id="ch-4" className="privacy-group">
              <div className="group-header">
                <h2>4. Handling of Reports</h2>
                <span className="group-sections">SECTIONS 8 – 9</span>
              </div>

              <div className="policy-block">
                <h3>8. REVIEW</h3>
                <p>
                  Lampose takes child-safety concerns seriously. Reports may be reviewed and
                  investigated in accordance with our safety policies and applicable laws. Where
                  appropriate, Lampose may take action against accounts or content that violate these
                  standards.
                </p>
              </div>

              <div className="policy-block">
                <h3>9. POSSIBLE ACTIONS</h3>
                <p>Depending on what a review finds, actions may include:</p>
                <ul className="policy-list">
                  <li>Removing violating content</li>
                  <li>Restricting account functionality</li>
                  <li>Suspending accounts</li>
                  <li>Permanently terminating accounts</li>
                  <li>Taking other appropriate safety measures</li>
                </ul>
              </div>
            </article>

            {/* CHAPTER 5 */}
            <article id="ch-5" className="privacy-group">
              <div className="group-header">
                <h2>5. Cooperation With Authorities</h2>
                <span className="group-sections">SECTION 10</span>
              </div>

              <div className="policy-block">
                <h3>10. LEGAL PROCESS</h3>
                <p>
                  Lampose handles safety matters in accordance with applicable laws and legal
                  requirements.
                </p>
                <p>
                  Where legally required and appropriate, Lampose may cooperate with relevant
                  authorities and provide information through appropriate legal processes.
                </p>
                <div className="privacy-callout info">
                  Reporting a concern to Lampose is not a substitute for contacting the police or
                  another competent authority. If you believe a child is at risk, please contact the
                  authorities directly as well.
                </div>
              </div>
            </article>

            {/* CHAPTER 6 */}
            <article id="ch-6" className="privacy-group">
              <div className="group-header">
                <h2>6. Prevention of Child Sexual Abuse and Exploitation</h2>
                <span className="group-sections">SECTION 11</span>
              </div>

              <div className="policy-block">
                <h3>11. OUR COMMITMENTS</h3>
                <p>
                  Lampose does not permit the use of its services to facilitate child sexual abuse or
                  exploitation. We are committed to:
                </p>
                <div className="principles-grid">
                  <div className="principle-box">
                    <strong>Clear standards</strong>
                    <p>Publishing and maintaining child-safety standards that anyone can read.</p>
                  </div>
                  <div className="principle-box">
                    <strong>Taking reports seriously</strong>
                    <p>Providing a route for concerns to reach our safety team.</p>
                  </div>
                  <div className="principle-box">
                    <strong>Acting on violations</strong>
                    <p>
                      Taking appropriate action against content and accounts that break these rules.
                    </p>
                  </div>
                  <div className="principle-box">
                    <strong>Improving safety</strong>
                    <p>Continuing to strengthen the safeguards and processes that protect users.</p>
                  </div>
                  <div className="principle-box">
                    <strong>Meeting legal duties</strong>
                    <p>Cooperating with applicable legal and safety requirements.</p>
                  </div>
                </div>
              </div>
            </article>

            {/* CHAPTER 7 */}
            <article id="ch-7" className="privacy-group">
              <div className="group-header">
                <h2>7. Contact Us</h2>
                <span className="group-sections">SECTION 12</span>
              </div>

              <div className="policy-block">
                <h3>12. SAFETY CONTACT</h3>
                <p>
                  For child-safety concerns, suspected CSAE, or other urgent safety issues, contact:
                </p>
                <div className="contact-corporate-card">
                  <div className="contact-col">
                    <span className="contact-sub">SAFETY CONTACT</span>
                    <strong>
                      <a href="mailto:support@lampose.com?subject=Child%20Safety%20Concern">
                        support@lampose.com
                      </a>
                    </strong>
                    <p>
                      Please use the subject line{' '}
                      <strong>&quot;Child Safety Concern&quot;</strong> so that the message is
                      recognised and routed quickly.
                    </p>
                  </div>
                  <div className="contact-col">
                    <span className="contact-sub">ESCALATION &amp; GRIEVANCES</span>
                    <strong>
                      <a href="mailto:grievance@lampose.com?subject=Child%20Safety%20Concern">
                        grievance@lampose.com
                      </a>
                    </strong>
                    <p>Grievance Officer, LAMPOSE PRIVATE LIMITED</p>
                    <p>Visakhapatnam, Andhra Pradesh, India</p>
                  </div>
                </div>
              </div>
            </article>

            {/* CHAPTER 8 */}
            <article id="ch-8" className="privacy-group">
              <div className="group-header">
                <h2>8. Related Policies</h2>
                <span className="group-sections">SECTION 13</span>
              </div>

              <div className="policy-block">
                <h3>13. OTHER LAMPOSE POLICIES</h3>
                <p>These standards should be read alongside:</p>
                <table className="control-table">
                  <tbody>
                    <tr>
                      <td><strong>Terms and Conditions</strong></td>
                      <td>
                        Eligibility, user conduct, and platform rules —{' '}
                        <Link to="/terms">lampose.com/terms</Link>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Privacy Policy</strong></td>
                      <td>
                        How personal information is collected and handled —{' '}
                        <Link to="/privacy">lampose.com/privacy</Link>
                      </td>
                    </tr>
                    <tr>
                      <td><strong>Contact &amp; Support</strong></td>
                      <td>
                        General enquiries and support —{' '}
                        <Link to="/contact">lampose.com/contact</Link>
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: '1.25rem' }}>
                  Lampose does not currently publish a separate Community Guidelines document. The
                  rules governing user conduct are set out in the Terms and Conditions.
                </p>
                <p
                  style={{
                    marginTop: '2rem',
                    textAlign: 'center',
                    color: 'var(--ink-light)',
                    fontSize: '0.85rem',
                  }}
                >
                  — End of Lampose Child Safety Standards —
                </p>
              </div>
            </article>

          </div>
        </div>
      </section>
    </div>
  );
}
