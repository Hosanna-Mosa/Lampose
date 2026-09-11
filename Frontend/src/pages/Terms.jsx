import { CHAPTERS } from '../components/legal/utils/termsChapters';
import { Anchor, Article, Box, Emphasis, Heading, Inline, List, ListItem, Region, Strong, Table, TableBody, TableCell, TableRow, Text } from '../components/common/atoms';
import { LegalMetaBanner } from '../components/legal/organisms/LegalMetaBanner/LegalMetaBanner';
import { LegalChapterNav } from '../components/legal/organisms/LegalChapterNav/LegalChapterNav';
import { TERMS_META } from '../components/legal/utils/legalMeta';
import { useChapterNav } from '../components/legal/hooks/useChapterNav/useChapterNav';


export function Terms() {
  const { activeChapter, scrollToChapter } = useChapterNav();

  return (
    <Box className="privacy-page">
      {/* Header Banner */}
      <Region id="privacy-hero">
        <Box className="sec-inner">
          <Box className="reveal">
            <Inline className="sec-tag">Legal Terms &amp; Conditions</Inline>
            <Heading level={1} className="privacy-title">
              Terms &amp; <Emphasis>Conditions</Emphasis>
            </Heading>
            <Text className="privacy-subtitle">
              LAMPOSE PRIVATE LIMITED · Legally binding agreement governing user access, host and partner 
              commitments, marketplace bookings, payments, and platform usage.
            </Text>
          </Box>

          {/* Metadata Banner */}
          <LegalMetaBanner items={TERMS_META} />
        </Box>
      </Region>

      {/* Sticky Pill Navigation */}
      <LegalChapterNav
        chapters={CHAPTERS}
        activeId={activeChapter}
        onSelect={scrollToChapter}
      />

      {/* Document Body */}
      <Region className="privacy-body-section">
        <Box className="sec-inner">
          <Box className="privacy-document-card">

            {/* CHAPTER 1: 1 - 3 */}
            <Article id="ch-1" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>1. Acceptance of Terms &amp; Eligibility</Heading>
                <Inline className="group-sections">SECTIONS 1 – 3</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>1. CONTRACTUAL RELATIONSHIP</Heading>
                <Text>
                  These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User", "Host", "Partner", or "you") 
                  and <Strong>LAMPOSE PRIVATE LIMITED</Strong> ("LAMPOSE", "Company", "we", "us", or "our"), regarding your access to and use of 
                  the LAMPOSE mobile applications (Android and iOS), the website (<Anchor href="https://lampose.com">lampose.com</Anchor>), and associated marketplace services.
                </Text>
                <Text>
                  By registering for an account, browsing listings, making a reservation, ordering food, or listing a property or service, 
                  you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>2. ELIGIBILITY &amp; CAPACITY</Heading>
                <Text>
                  You must be at least 18 years of age and legally competent to enter into binding contracts under the Indian Contract Act, 1872. 
                  If you represent a business entity, property, or food establishment, you warrant that you possess all requisite corporate authorizations and powers to bind such entity.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>3. AMENDMENTS &amp; UPDATES</Heading>
                <Text>
                  LAMPOSE reserves the right to modify or amend these Terms at any time. Material updates will be notified through in-app notifications, 
                  email, or website banners. Your continued use of LAMPOSE after such modifications signifies your acceptance of the updated Terms.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 2: 4 - 7 */}
            <Article id="ch-2" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>2. Account Registration &amp; Security</Heading>
                <Inline className="group-sections">SECTIONS 4 – 7</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>4. ACCOUNT CREATION</Heading>
                <Text>
                  To access key platform features (booking accommodation, ordering food, or listing a property), you must register an account using a valid 
                  mobile phone number and verifiable profile information.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>5. AUTHENTICATION &amp; OTP VERIFICATION</Heading>
                <Text>
                  LAMPOSE utilizes One-Time Password (OTP) verification for secure login. You are solely responsible for maintaining the confidentiality 
                  of your authentication credentials. LAMPOSE will never ask for your secret OTP over phone, email, or unverified channels.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>6. ACCURACY OF INFORMATION</Heading>
                <Text>
                  You agree to provide true, accurate, and complete information during registration and to update such information promptly whenever changes occur. 
                  Submitting false or misleading information constitutes a material breach of these Terms.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>7. ACCOUNT SUSPENSION &amp; TERMINATION</Heading>
                <Text>
                  LAMPOSE reserves the right to temporarily suspend or permanently terminate any account that engages in fraudulent activity, harassment, 
                  breach of safety protocols, non-payment, or violation of these Terms.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 3: 8 - 12 */}
            <Article id="ch-3" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>3. Platform Role &amp; Marketplace Rules</Heading>
                <Inline className="group-sections">SECTIONS 8 – 12</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>8. NATURE OF THE MARKETPLACE</Heading>
                <Text>
                  LAMPOSE acts as an intermediary technology aggregator platform that connects consumers with third-party service providers, including 
                  accommodation owners (PGs, hostels, coliving spaces, bachelor rooms, hotels, houses) and food providers (messes, restaurants, tiffin centers).
                </Text>
                <Box className="privacy-callout info">
                  <Strong>Intermediary Status:</Strong> Under Section 79 of the Information Technology Act, 2000, LAMPOSE provides a marketplace platform 
                  and is not itself a real estate owner, hostel proprietor, restaurant operator, or food manufacturer, unless expressly stated otherwise in writing.
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>9. INDEPENDENT CONTRACTOR STATUS</Heading>
                <Text>
                  Accommodation hosts, food partners, and delivery personnel operate as independent third-party contractors and not as employees, agents, or franchisees of LAMPOSE.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>10. PROHIBITED PLATFORM ACTIVITIES</Heading>
                <Text>Users and partners agree not to:</Text>
                <List className="policy-list">
                  <ListItem>Use the platform for any illegal, hazardous, or unauthorized purpose;</ListItem>
                  <ListItem>Circumvent or attempt to manipulate LAMPOSE's booking and payment systems;</ListItem>
                  <ListItem>Post fake listings, spam reviews, or fraudulent reservations;</ListItem>
                  <ListItem>Scrape, reverse-engineer, or deploy automated bots on the platform;</ListItem>
                  <ListItem>Engage in abusive, discriminatory, or unlawful conduct toward other users or hosts.</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>11. USER-GENERATED REVIEWS &amp; RATINGS</Heading>
                <Text>
                  Users may submit honest reviews for stays and food orders they have completed. Reviews must be factual and devoid of defamatory language. 
                  LAMPOSE reserves the right to moderate or remove reviews that violate content policies.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>12. APP &amp; DEVICE PERMISSIONS</Heading>
                <Text>
                  The LAMPOSE mobile app requests device permissions (such as Location, Camera, and Notifications) strictly to deliver platform functionality. 
                  You may configure these permissions in device settings in accordance with our Privacy Policy.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 4: 13 - 17 */}
            <Article id="ch-4" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>4. Stays &amp; Accommodation Terms</Heading>
                <Inline className="group-sections">SECTIONS 13 – 17</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>13. ACCOMMODATION BOOKINGS</Heading>
                <Text>
                  When you book a stay (hostel, PG, room, or coliving bed), a direct contractual relationship is established between you and the accommodation host. 
                  LAMPOSE facilitates the reservation, communication, and payment transaction.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>14. CHECK-IN, KYC &amp; HOUSE RULES</Heading>
                <Text>
                  Guests must present valid government-issued photo identification (such as Aadhaar, Voter ID, or Passport) upon check-in as mandated by local law. 
                  Guests agree to respect the host's published house rules, curfew times, visitor policies, and community standards.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>15. SECURITY DEPOSITS &amp; RENT CYCLES</Heading>
                <Text>
                  For monthly stays and PG rentals, security deposits and monthly rent cycles are agreed upon according to the property's published listing details. 
                  Refunds of deposits upon move-out are governed by host agreement terms, subject to deductions for documented damages or unpaid dues.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>16. PROPERTY DAMAGE &amp; CONDUCT</Heading>
                <Text>
                  Guests are financially responsible for any damage caused to accommodation premises, furniture, appliances, or fixtures during their tenancy.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>17. SAFETY &amp; COMPLIANCE</Heading>
                <Text>
                  Hosts are required to maintain basic hygiene, fire safety compliance, and secure access. Any safety concerns may be escalated immediately to LAMPOSE Customer Support.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 5: 18 - 22 */}
            <Article id="ch-5" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>5. Food, Mess &amp; Delivery Terms</Heading>
                <Inline className="group-sections">SECTIONS 18 – 22</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>18. FOOD ORDERS &amp; MESS SUBSCRIPTIONS</Heading>
                <Text>
                  LAMPOSE enables users to browse menus, order meals, and subscribe to recurring mess plans from participating food partners.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>19. FOOD QUALITY &amp; FSSAI COMPLIANCE</Heading>
                <Text>
                  All participating food partners are required to possess valid FSSAI (Food Safety and Standards Authority of India) licenses 
                  and maintain statutory standards of food hygiene and preparation. The preparing kitchen remains responsible for food safety and ingredients.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>20. ALLERGIES &amp; DIETARY ADVISORIES</Heading>
                <Text>
                  While menus display general ingredient indicators, users with severe food allergies or medical dietary restrictions should exercise caution 
                  and contact the kitchen directly prior to ordering.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>21. DELIVERY PROTOCOLS</Heading>
                <Text>
                  Delivery timelines are estimates based on kitchen preparation speed, traffic conditions, and weather. 
                  Users must provide accurate delivery addresses and reachable phone numbers.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>22. ORDER MODIFICATIONS &amp; CANCELLATIONS</Heading>
                <Text>
                  Once a kitchen accepts a food order and begins preparation, orders cannot be cancelled or modified without the kitchen's express consent.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 6: 23 - 27 */}
            <Article id="ch-6" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>6. Payments, Fees &amp; Refunds</Heading>
                <Inline className="group-sections">SECTIONS 23 – 27</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>23. PRICING &amp; TAXES</Heading>
                <Text>
                  All prices listed on LAMPOSE are denominated in Indian Rupees (INR) and include applicable taxes (such as GST) unless indicated otherwise. 
                  LAMPOSE displays a clear cost breakdown before final payment confirmation.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>24. PAYMENT PROCESSING</Heading>
                <Text>
                  Payments are processed securely via RBI-approved, PCI-DSS compliant payment gateways (supporting UPI, Net Banking, Debit/Credit Cards, and Wallets). 
                  LAMPOSE does not store card numbers or CVV credentials on its servers.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>25. CANCELLATION POLICIES</Heading>
                <Text>
                  Each accommodation listing features an explicit cancellation window (e.g. Flexible, Moderate, or Strict). 
                  Cancellations made within the eligible window will be processed for refund according to the specific policy terms shown during checkout.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>26. REFUND TIMELINES</Heading>
                <Text>
                  Approved refunds are credited back to the original payment source within 5 to 7 business days, depending on your bank's processing cycles.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>27. CHARGEBACKS &amp; FRAUD PREVENTION</Heading>
                <Text>
                  Initiating fraudulent chargebacks or dispute claims without cause will result in immediate account restriction and referral for legal recovery.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 7: 28 - 32 */}
            <Article id="ch-7" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>7. Partner &amp; Host Obligations</Heading>
                <Inline className="group-sections">SECTIONS 28 – 32</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>28. LISTING INTEGRITY &amp; ACCURACY</Heading>
                <Text>
                  Hosts and food partners warrant that all photos, room amenities, pricing, availability counts, and menu descriptions published on LAMPOSE 
                  are accurate and up to date. Misleading listings may be delisted immediately.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>29. WHATSAPP &amp; DIGITAL VERIFICATION</Heading>
                <Text>
                  Property owners agree to complete verification protocols, including WhatsApp verification prompts (e.g. replying YES/NO via verified Twilio business channels) 
                  and identity/ownership documentation checks.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>30. FINANCIAL SETTLEMENTS</Heading>
                <Text>
                  LAMPOSE remits partner payouts according to established settlement schedules directly to the verified bank accounts provided by partners, 
                  deducting applicable platform commission and statutory TDS where mandated.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>31. NONDISCRIMINATION POLICY</Heading>
                <Text>
                  Partners agree to provide equitable service and shall not unlawfully discriminate against any guest or consumer on grounds of religion, race, caste, gender, or state of origin.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>32. LOCAL LICENSING &amp; STATUTORY COMPLIANCE</Heading>
                <Text>
                  Partners are exclusively responsible for obtaining and renewing all required local municipal trade licenses, police approvals, fire clearances, and FSSAI registrations.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 8: 33 - 37 */}
            <Article id="ch-8" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>8. User Conduct &amp; Intellectual Property</Heading>
                <Inline className="group-sections">SECTIONS 33 – 37</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>33. LAMPOSE INTELLECTUAL PROPERTY</Heading>
                <Text>
                  All trademarks, logos, brand assets, UI designs, graphics, software code, and platform architecture are the exclusive intellectual property of 
                  <Strong>LAMPOSE PRIVATE LIMITED</Strong> and are protected under Indian and international copyright and trademark laws.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>34. LIMITED LICENSE</Heading>
                <Text>
                  LAMPOSE grants you a personal, revocable, non-exclusive, non-transferable license to access and use the application and services strictly for personal, non-commercial purposes.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>35. USER CONTENT LICENSE</Heading>
                <Text>
                  By submitting reviews, listing photos, or descriptions, you grant LAMPOSE a royalty-free, worldwide license to use, display, and promote such content on the marketplace.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>36. INDEMNIFICATION</Heading>
                <Text>
                  You agree to defend, indemnify, and hold harmless LAMPOSE, its directors, employees, and agents from any claims, liabilities, damages, or costs 
                  arising from your breach of these Terms, unlawful conduct, or violation of third-party rights.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>37. DATA PRIVACY ALIGNMENT</Heading>
                <Text>
                  Personal data collected under these Terms is processed in strict compliance with the Digital Personal Data Protection (DPDP) Act, 2023 
                  and our comprehensive <Anchor href="/privacy">Privacy Policy</Anchor>.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 9: 38 - 43 */}
            <Article id="ch-9" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>9. Disclaimers, Liability &amp; Dispute Resolution</Heading>
                <Inline className="group-sections">SECTIONS 38 – 43</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>38. WARRANTY DISCLAIMER</Heading>
                <Text>
                  The platform and services are provided on an "as-is" and "as-available" basis without warranties of any kind, whether express or implied, 
                  including implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>39. LIMITATION OF LIABILITY</Heading>
                <Text>
                  To the maximum extent permitted by applicable law, LAMPOSE shall not be liable for any indirect, incidental, punitive, or consequential damages 
                  arising out of or relating to your use of the marketplace, host premises, or food products.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>40. FORCE MAJEURE</Heading>
                <Text>
                  LAMPOSE shall not be held liable for failure or delay in fulfilling its obligations caused by events beyond reasonable control, including natural disasters, 
                  strikes, network outages, or governmental restrictions.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>41. GOVERNING LAW &amp; JURISDICTION</Heading>
                <Text>
                  These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising hereunder shall be subject to the exclusive 
                  jurisdiction of the competent courts located in <Strong>Visakhapatnam, Andhra Pradesh, India</Strong>.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>42. GRIEVANCE REDRESSAL &amp; CONTACT</Heading>
                <Text>
                  In accordance with the Information Technology Act, 2000 and Consumer Protection (E-Commerce) Rules, 2020, users may direct questions, grievances, or legal notices to:
                </Text>
                <Box className="contact-corporate-card">
                  <Box className="contact-col">
                    <Inline className="contact-sub">REGISTERED ENTITY</Inline>
                    <Strong>LAMPOSE PRIVATE LIMITED</Strong>
                    <Text>Visakhapatnam, Andhra Pradesh, India</Text>
                    <Text>CIN: Registered Indian Private Limited Company</Text>
                  </Box>
                  <Box className="contact-col">
                    <Inline className="contact-sub">OFFICIAL GRIEVANCE CHANNELS</Inline>
                    <Text><Strong>Grievance Officer:</Strong> <Anchor href="mailto:grievance@lampose.com">grievance@lampose.com</Anchor></Text>
                    <Text><Strong>Legal &amp; Privacy:</Strong> <Anchor href="mailto:privacy@lampose.com">privacy@lampose.com</Anchor></Text>
                    <Text><Strong>General Support:</Strong> <Anchor href="mailto:support@lampose.com">support@lampose.com</Anchor></Text>
                  </Box>
                </Box>
              </Box>

              <Box className="policy-block doc-control-block">
                <Heading level={3}>43. DOCUMENT CONTROL</Heading>
                <Table className="control-table">
                  <TableBody>
                    <TableRow>
                      <TableCell><Strong>Company</Strong></TableCell>
                      <TableCell>LAMPOSE PRIVATE LIMITED</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Document Title</Strong></TableCell>
                      <TableCell>Terms and Conditions of Platform Usage</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Version</Strong></TableCell>
                      <TableCell>Version 1.0</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Applicability</Strong></TableCell>
                      <TableCell>All LAMPOSE Users, Guests, Hosts, and Partners</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Review Frequency</Strong></TableCell>
                      <TableCell>At least annually or upon material regulatory updates</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Text style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--ink-light)', fontSize: '0.85rem' }}>
                  — End of LAMPOSE Terms and Conditions —
                </Text>
              </Box>
            </Article>

          </Box>
        </Box>
      </Region>
    </Box>
  );
}
