import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CHAPTERS } from '../components/legal/utils/childSafetyChapters';
import { PAGE_TITLE, PAGE_DESC } from '../components/legal/utils/childSafetyMeta';
import { Anchor, Article, Box, Emphasis, Heading, Inline, List, ListItem, Navigation, Region, Strong, Table, TableBody, TableCell, TableRow, Text } from '../components/common/atoms';
import { LegalMetaBanner } from '../components/legal/organisms/LegalMetaBanner/LegalMetaBanner';
import { LegalChapterNav } from '../components/legal/organisms/LegalChapterNav/LegalChapterNav';
import { CHILD_SAFETY_META } from '../components/legal/utils/legalMeta';
import { useChapterNav } from '../components/legal/hooks/useChapterNav/useChapterNav';

/* Same chapter-pill pattern as Privacy and Terms — this page is a third
   document in that set, so it reuses their markup and stylesheet rather than
   introducing a parallel one. */



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

export function ChildSafety() {
  const { activeChapter, scrollToChapter } = useChapterNav();
  useDocumentMeta(PAGE_TITLE, PAGE_DESC);

  return (
    <Box className="privacy-page">
      {/* Header Banner */}
      <Region id="privacy-hero">
        <Box className="sec-inner">
          <Box className="reveal">
            <Inline className="sec-tag">Trust &amp; Safety</Inline>
            <Heading level={1} className="privacy-title">
              Child Safety <Emphasis>Standards</Emphasis>
            </Heading>
            <Text className="privacy-subtitle">
              Keeping Lampose safe for everyone. These standards set out how LAMPOSE PRIVATE LIMITED
              approaches the prevention of child sexual abuse and exploitation (CSAE), the protection
              of minors, and the handling of safety concerns raised by our community.
            </Text>
          </Box>

          {/* Metadata Banner */}
          <LegalMetaBanner items={CHILD_SAFETY_META} />
        </Box>
      </Region>

      {/* Sticky Pill Navigation */}
      <LegalChapterNav
        chapters={CHAPTERS}
        activeId={activeChapter}
        onSelect={scrollToChapter}
        navLabel="Child safety standards sections"
        buttonType="button"
      />

      {/* Document Body */}
      <Region className="privacy-body-section">
        <Box className="sec-inner">
          <Box className="privacy-document-card">

            <Box className="privacy-callout warning">
              <Strong>If a child is in immediate danger, contact the emergency services first.</Strong>
              {' '}
              In India, dial <Strong>112</Strong> for emergencies or <Strong>100</Strong> for the
              police. Lampose is not an emergency service and cannot respond in real time.
            </Box>

            <Text className="privacy-subtitle" style={{ marginBottom: '2.5rem' }}>
              Lampose is committed to maintaining a safe environment for all users. We have zero
              tolerance for child sexual abuse and exploitation (CSAE), child sexual abuse material
              (CSAM), grooming, sexual exploitation of minors, or any other form of abuse involving
              children.
            </Text>

            {/* CHAPTER 1 */}
            <Article id="ch-1" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>1. Zero-Tolerance Policy</Heading>
                <Inline className="group-sections">SECTION 1</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>1.1 PROHIBITED CONDUCT AND CONTENT</Heading>
                <Text>Lampose strictly prohibits:</Text>
                <List className="policy-list">
                  <ListItem>Child sexual abuse and exploitation</ListItem>
                  <ListItem>Child sexual abuse material (CSAM)</ListItem>
                  <ListItem>Sexual content involving minors</ListItem>
                  <ListItem>Grooming or attempts to sexually exploit minors</ListItem>
                  <ListItem>Solicitation or sexualisation of minors</ListItem>
                  <ListItem>Sharing, requesting, or distributing CSAM</ListItem>
                  <ListItem>Encouraging or facilitating the exploitation or abuse of children</ListItem>
                  <ListItem>Any behaviour intended to endanger or sexually exploit a child</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>1.2 ENFORCEMENT</Heading>
                <Text>
                  Any content or behaviour that violates these standards may result in appropriate
                  action, including removal of content, suspension, or termination of an account, in
                  accordance with Lampose&apos;s policies and applicable laws.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 2 */}
            <Article id="ch-2" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>2. Who Lampose Is For &amp; User Safety</Heading>
                <Inline className="group-sections">SECTIONS 2 – 4</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>2. AGE REQUIREMENT</Heading>
                <Text>
                  Lampose accounts are intended for adults. Under our{' '}
                  <Link to="/terms">Terms and Conditions</Link>, you must be at least 18 years of age
                  and legally competent to enter into binding contracts under the Indian Contract Act,
                  1872, in order to register for an account, make a booking, or list a property or
                  service. Lampose is not designed for, or directed at, children.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>3. PROHIBITED USES OF THE PLATFORM</Heading>
                <Text>Users must never use Lampose to:</Text>
                <List className="policy-list">
                  <ListItem>Contact minors for sexual purposes</ListItem>
                  <ListItem>Request or share sexual content involving minors</ListItem>
                  <ListItem>Encourage child exploitation</ListItem>
                  <ListItem>Arrange sexual encounters involving minors</ListItem>
                  <ListItem>Share identifying information about a child for harmful purposes</ListItem>
                  <ListItem>Facilitate abuse, exploitation, or trafficking of children</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>4. EXPECTED CONDUCT</Heading>
                <Text>
                  Users are expected to follow Lampose&apos;s{' '}
                  <Link to="/terms">Terms and Conditions</Link>, which set out the conduct rules that
                  apply across the platform, and our <Link to="/privacy">Privacy Policy</Link>, which
                  explains how personal information is handled.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 3 */}
            <Article id="ch-3" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>3. Reporting Safety Concerns</Heading>
                <Inline className="group-sections">SECTIONS 5 – 7</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>5. HOW TO REPORT</Heading>
                <Text>
                  If you encounter content or behaviour involving suspected child sexual abuse or
                  exploitation, please report it to us so that it can be reviewed.
                </Text>
                <List className="policy-list">
                  <ListItem>
                    <Strong>In the Lampose app:</Strong> open <Emphasis>Support</Emphasis> and choose{' '}
                    <Emphasis>Report a serious problem</Emphasis>. A report goes to our safety team rather than to
                    the person it concerns.
                  </ListItem>
                  <ListItem>
                    <Strong>By email:</Strong> write to the safety contact in section 7 below, using
                    the subject line <Strong>&quot;Child Safety Concern&quot;</Strong>.
                  </ListItem>
                </List>
                <Text>
                  The in-app report reasons cover general safety and conduct concerns. If your concern
                  involves a child, please also contact the safety email below so that it reaches the
                  right people directly.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>6. WHAT TO INCLUDE IN A REPORT</Heading>
                <Text>
                  So that a concern can be reviewed properly, please provide as much relevant
                  information as you safely can:
                </Text>
                <List className="policy-list">
                  <ListItem>A description of the concern</ListItem>
                  <ListItem>Relevant account or profile information</ListItem>
                  <ListItem>The date and approximate time of the incident</ListItem>
                  <ListItem>Relevant content or message information</ListItem>
                  <ListItem>Any other information that may help Lampose review the concern</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>7. HANDLING SUSPECTED MATERIAL</Heading>
                <Box className="privacy-callout warning">
                  <Strong>Do not upload, forward, or redistribute suspected CSAM.</Strong> Describe
                  what you saw and where you saw it instead. Sharing such material further — even in
                  order to report it — may itself be unlawful.
                </Box>
                <Text>
                  Concerns may also be raised directly with the relevant public authorities. The
                  following services are operated by others, not by Lampose:
                </Text>
                <List className="policy-list">
                  <ListItem><Strong>112</Strong> — national emergency number (India)</ListItem>
                  <ListItem><Strong>100</Strong> — police</ListItem>
                  <ListItem>
                    <Strong>1098</Strong> — Childline, India&apos;s helpline for children in need of
                    care and protection
                  </ListItem>
                  <ListItem>
                    <Strong>cybercrime.gov.in</Strong> — the Government of India National Cyber Crime
                    Reporting Portal, which accepts reports of child-related cyber crime
                  </ListItem>
                </List>
              </Box>
            </Article>

            {/* CHAPTER 4 */}
            <Article id="ch-4" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>4. Handling of Reports</Heading>
                <Inline className="group-sections">SECTIONS 8 – 9</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>8. REVIEW</Heading>
                <Text>
                  Lampose takes child-safety concerns seriously. Reports may be reviewed and
                  investigated in accordance with our safety policies and applicable laws. Where
                  appropriate, Lampose may take action against accounts or content that violate these
                  standards.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>9. POSSIBLE ACTIONS</Heading>
                <Text>Depending on what a review finds, actions may include:</Text>
                <List className="policy-list">
                  <ListItem>Removing violating content</ListItem>
                  <ListItem>Restricting account functionality</ListItem>
                  <ListItem>Suspending accounts</ListItem>
                  <ListItem>Permanently terminating accounts</ListItem>
                  <ListItem>Taking other appropriate safety measures</ListItem>
                </List>
              </Box>
            </Article>

            {/* CHAPTER 5 */}
            <Article id="ch-5" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>5. Cooperation With Authorities</Heading>
                <Inline className="group-sections">SECTION 10</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>10. LEGAL PROCESS</Heading>
                <Text>
                  Lampose handles safety matters in accordance with applicable laws and legal
                  requirements.
                </Text>
                <Text>
                  Where legally required and appropriate, Lampose may cooperate with relevant
                  authorities and provide information through appropriate legal processes.
                </Text>
                <Box className="privacy-callout info">
                  Reporting a concern to Lampose is not a substitute for contacting the police or
                  another competent authority. If you believe a child is at risk, please contact the
                  authorities directly as well.
                </Box>
              </Box>
            </Article>

            {/* CHAPTER 6 */}
            <Article id="ch-6" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>6. Prevention of Child Sexual Abuse and Exploitation</Heading>
                <Inline className="group-sections">SECTION 11</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>11. OUR COMMITMENTS</Heading>
                <Text>
                  Lampose does not permit the use of its services to facilitate child sexual abuse or
                  exploitation. We are committed to:
                </Text>
                <Box className="principles-grid">
                  <Box className="principle-box">
                    <Strong>Clear standards</Strong>
                    <Text>Publishing and maintaining child-safety standards that anyone can read.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>Taking reports seriously</Strong>
                    <Text>Providing a route for concerns to reach our safety team.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>Acting on violations</Strong>
                    <Text>
                      Taking appropriate action against content and accounts that break these rules.
                    </Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>Improving safety</Strong>
                    <Text>Continuing to strengthen the safeguards and processes that protect users.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>Meeting legal duties</Strong>
                    <Text>Cooperating with applicable legal and safety requirements.</Text>
                  </Box>
                </Box>
              </Box>
            </Article>

            {/* CHAPTER 7 */}
            <Article id="ch-7" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>7. Contact Us</Heading>
                <Inline className="group-sections">SECTION 12</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>12. SAFETY CONTACT</Heading>
                <Text>
                  For child-safety concerns, suspected CSAE, or other urgent safety issues, contact:
                </Text>
                <Box className="contact-corporate-card">
                  <Box className="contact-col">
                    <Inline className="contact-sub">SAFETY CONTACT</Inline>
                    <Strong>
                      <Anchor href="mailto:support@lampose.com?subject=Child%20Safety%20Concern">
                        support@lampose.com
                      </Anchor>
                    </Strong>
                    <Text>
                      Please use the subject line{' '}
                      <Strong>&quot;Child Safety Concern&quot;</Strong> so that the message is
                      recognised and routed quickly.
                    </Text>
                  </Box>
                  <Box className="contact-col">
                    <Inline className="contact-sub">ESCALATION &amp; GRIEVANCES</Inline>
                    <Strong>
                      <Anchor href="mailto:grievance@lampose.com?subject=Child%20Safety%20Concern">
                        grievance@lampose.com
                      </Anchor>
                    </Strong>
                    <Text>Grievance Officer, LAMPOSE PRIVATE LIMITED</Text>
                    <Text>Visakhapatnam, Andhra Pradesh, India</Text>
                  </Box>
                </Box>
              </Box>
            </Article>

            {/* CHAPTER 8 */}
            <Article id="ch-8" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>8. Related Policies</Heading>
                <Inline className="group-sections">SECTION 13</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>13. OTHER LAMPOSE POLICIES</Heading>
                <Text>These standards should be read alongside:</Text>
                <Table className="control-table">
                  <TableBody>
                    <TableRow>
                      <TableCell><Strong>Terms and Conditions</Strong></TableCell>
                      <TableCell>
                        Eligibility, user conduct, and platform rules —{' '}
                        <Link to="/terms">lampose.com/terms</Link>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Privacy Policy</Strong></TableCell>
                      <TableCell>
                        How personal information is collected and handled —{' '}
                        <Link to="/privacy">lampose.com/privacy</Link>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Contact &amp; Support</Strong></TableCell>
                      <TableCell>
                        General enquiries and support —{' '}
                        <Link to="/contact">lampose.com/contact</Link>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Text style={{ marginTop: '1.25rem' }}>
                  Lampose does not currently publish a separate Community Guidelines document. The
                  rules governing user conduct are set out in the Terms and Conditions.
                </Text>
                <Text
                  style={{
                    marginTop: '2rem',
                    textAlign: 'center',
                    color: 'var(--ink-light)',
                    fontSize: '0.85rem',
                  }}
                >
                  — End of Lampose Child Safety Standards —
                </Text>
              </Box>
            </Article>

          </Box>
        </Box>
      </Region>
    </Box>
  );
}
