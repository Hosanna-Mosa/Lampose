import { CHAPTERS } from '../components/legal/utils/privacyChapters';
import { Anchor, Article, Box, Code, Emphasis, Heading, Inline, List, ListItem, Region, Strong, Table, TableBody, TableCell, TableRow, Text } from '../components/common/atoms';
import { LegalMetaBanner } from '../components/legal/organisms/LegalMetaBanner/LegalMetaBanner';
import { LegalChapterNav } from '../components/legal/organisms/LegalChapterNav/LegalChapterNav';
import { PRIVACY_META } from '../components/legal/utils/legalMeta';
import { useChapterNav } from '../components/legal/hooks/useChapterNav/useChapterNav';


export function Privacy() {
  const { activeChapter, scrollToChapter } = useChapterNav();

  return (
    <Box className="privacy-page">
      {/* Header Banner */}
      <Region id="privacy-hero">
        <Box className="sec-inner">
          <Box className="reveal">
            <Inline className="sec-tag">Corporate Governance &amp; Compliance</Inline>
            <Heading level={1} className="privacy-title">
              Privacy Policy &amp; <Emphasis>Data Protection Handbook</Emphasis>
            </Heading>
            <Text className="privacy-subtitle">
              LAMPOSE PRIVATE LIMITED · Comprehensive data protection guidelines, permissions architecture, 
              user rights, and platform compliance disclosures.
            </Text>
          </Box>

          {/* Metadata Banner */}
          <LegalMetaBanner items={PRIVACY_META} />
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
                <Heading level={2}>1. Overview &amp; Principles</Heading>
                <Inline className="group-sections">SECTIONS 1 – 3</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>1. INTRODUCTION</Heading>
                <Text>
                  LAMPOSE PRIVATE LIMITED ("LAMPOSE", "Company", "we", "us", or "our") operates the LAMPOSE mobile
                  application, website (<Anchor href="https://lampose.com">lampose.com</Anchor>) and related services.
                </Text>
                <Text>
                  LAMPOSE is a platform designed to connect users with accommodation and food-related services, including
                  stays such as PGs, hostels, bachelor rooms, hotels, houses, co-living spaces, lodges and other
                  accommodation providers, and food services including restaurants, messes and other participating food providers.
                </Text>
                <Text>This Privacy Policy explains:</Text>
                <List className="policy-list">
                  <ListItem>What information LAMPOSE collects;</ListItem>
                  <ListItem>How information is collected;</ListItem>
                  <ListItem>Why information is collected;</ListItem>
                  <ListItem>How information is used;</ListItem>
                  <ListItem>When information is shared;</ListItem>
                  <ListItem>How information is protected;</ListItem>
                  <ListItem>How long information is retained;</ListItem>
                  <ListItem>How users can access, correct or delete their information;</ListItem>
                  <ListItem>How permissions are used;</ListItem>
                  <ListItem>How third-party service providers process information;</ListItem>
                  <ListItem>How users can contact LAMPOSE regarding privacy matters.</ListItem>
                </List>
                <Text>By using LAMPOSE, you acknowledge that you have read and understood this Privacy Policy.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>2. SCOPE OF THIS POLICY</Heading>
                <Text>This Privacy Policy applies to:</Text>
                <List ordered className="policy-num-list">
                  <ListItem>The LAMPOSE Android application;</ListItem>
                  <ListItem>The LAMPOSE iOS application;</ListItem>
                  <ListItem>The LAMPOSE website;</ListItem>
                  <ListItem>LAMPOSE booking services;</ListItem>
                  <ListItem>LAMPOSE property-owner services;</ListItem>
                  <ListItem>LAMPOSE restaurant and food-partner services;</ListItem>
                  <ListItem>Customer support interactions;</ListItem>
                  <ListItem>Communications sent through LAMPOSE;</ListItem>
                  <ListItem>Information collected through LAMPOSE's websites, applications, APIs and related services.</ListItem>
                </List>
                <Text>
                  This Policy applies to users, property owners, food partners, delivery/service partners where applicable, and
                  other persons interacting with LAMPOSE.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>3. OUR PRIVACY PRINCIPLES</Heading>
                <Text>LAMPOSE follows these foundational principles:</Text>
                <Box className="principles-grid">
                  <Box className="principle-box">
                    <Strong>3.1 Data Minimization</Strong>
                    <Text>We seek to collect only information reasonably necessary to provide, secure and improve our services.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>3.2 Purpose Limitation</Strong>
                    <Text>Information collected for one purpose will not ordinarily be used for an unrelated purpose without an appropriate legal basis, consent where required, or other lawful authorization.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>3.3 Transparency</Strong>
                    <Text>We explain clearly what information we collect and why we collect it.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>3.4 Security</Strong>
                    <Text>We use reasonable technical and organizational safeguards to protect information against unauthorized access, loss, misuse, alteration or disclosure.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>3.5 User Control</Strong>
                    <Text>Where applicable, users can access, correct, withdraw consent, or request deletion of their information.</Text>
                  </Box>
                  <Box className="principle-box">
                    <Strong>3.6 Accountability</Strong>
                    <Text>LAMPOSE expects its employees, contractors and service providers who handle personal information to follow appropriate privacy and security requirements.</Text>
                  </Box>
                </Box>
              </Box>
            </Article>

            {/* CHAPTER 2: 4 - 9 */}
            <Article id="ch-2" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>2. Information We Collect</Heading>
                <Inline className="group-sections">SECTIONS 4 – 9</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>4. INFORMATION WE COLLECT</Heading>
                <Text>Depending on how you use LAMPOSE, we may collect the following categories of information.</Text>
                <Heading level={4}>4.1 Account Information</Heading>
                <Text>When creating or using an account, we may collect:</Text>
                <List className="policy-list">
                  <ListItem>Full name;</ListItem>
                  <ListItem>Mobile phone number;</ListItem>
                  <ListItem>Email address;</ListItem>
                  <ListItem>Account identifier;</ListItem>
                  <ListItem>Profile information;</ListItem>
                  <ListItem>Login/authentication information;</ListItem>
                  <ListItem>Account preferences;</ListItem>
                  <ListItem>Profile photograph, if voluntarily provided.</ListItem>
                </List>
                <Text>We use this information to create and manage your account and provide services associated with your account.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>5. PHONE NUMBER AND ACCOUNT VERIFICATION</Heading>
                <Text>LAMPOSE may use your mobile number to:</Text>
                <List className="policy-list">
                  <ListItem>Create or identify your account;</ListItem>
                  <ListItem>Authenticate your account;</ListItem>
                  <ListItem>Send verification codes;</ListItem>
                  <ListItem>Protect against fraudulent accounts;</ListItem>
                  <ListItem>Communicate important service information;</ListItem>
                  <ListItem>Associate bookings with your account.</ListItem>
                </List>
                <Box className="privacy-callout info">
                  <Strong>SMS Privacy Assurance:</Strong> LAMPOSE does not require access to your SMS inbox merely to verify an account. 
                  Where OTP verification is used, the verification code is processed for authentication and security. 
                  LAMPOSE will not request unrestricted SMS or call-log permissions merely to perform ordinary account verification.
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>6. PROPERTY OWNER INFORMATION</Heading>
                <Text>If you register a property with LAMPOSE, we may collect:</Text>
                <List className="policy-list">
                  <ListItem>Owner's name, business/property name, mobile number, and email address;</ListItem>
                  <ListItem>Property address, coordinates/location, property photographs, and description;</ListItem>
                  <ListItem>Accommodation type, pricing, availability, and facilities/amenities;</ListItem>
                  <ListItem>Business details, verification documentation voluntarily submitted, and agreement/contract information;</ListItem>
                  <ListItem>Bank/payment settlement information required for financial payouts.</ListItem>
                </List>
                <Text>
                  <Strong>Usage:</Strong> Used to manage property listings, verify ownership authorization, communicate with owners, 
                  process bookings/agreements, provide customer support, prevent fraud, settle payments, and comply with tax and legal requirements.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>7. FOOD PARTNER INFORMATION</Heading>
                <Text>If restaurants, messes or other food providers use LAMPOSE, we may collect:</Text>
                <List className="policy-list">
                  <ListItem>Partner name, restaurant/business name, contact info, and business address;</ListItem>
                  <ListItem>Food/menu information, photographs, operating hours, and pricing;</ListItem>
                  <ListItem>Bank/payment settlement details and tax/business registration information where required;</ListItem>
                  <ListItem>Order and transaction history.</ListItem>
                </List>
                <Text>This information is used to operate the food-service marketplace.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>8. BOOKING INFORMATION</Heading>
                <Text>When you make or receive a booking, LAMPOSE may collect:</Text>
                <List className="policy-list">
                  <ListItem>Booking ID, user/account ID, and property or food partner ID;</ListItem>
                  <ListItem>Selected service, booking date, and check-in/check-out dates;</ListItem>
                  <ListItem>Number of guests, booking status, amount payable, and payment status;</ListItem>
                  <ListItem>Cancellation information, verification details, and booking communications.</ListItem>
                </List>
                <Text>Booking information is necessary to provide the requested service.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>9. PAYMENT INFORMATION</Heading>
                <Text>Where payments are processed through third-party payment processors, LAMPOSE may receive information such as:</Text>
                <List className="policy-list">
                  <ListItem>Transaction ID, payment status, and amount;</ListItem>
                  <ListItem>Payment method type, refund status, and settlement details.</ListItem>
                </List>
                <Box className="privacy-callout warning">
                  <Strong>Zero Local Storage of Card Credentials:</Strong> Unless specifically stated otherwise, LAMPOSE does not store complete payment-card numbers, CVV numbers or equivalent highly sensitive payment credentials on its own servers. Payment processing is performed by PCI-DSS compliant third-party payment service providers.
                </Box>
              </Box>
            </Article>

            {/* CHAPTER 3: 10 - 16 */}
            <Article id="ch-3" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>3. Device Permissions &amp; Hardware</Heading>
                <Inline className="group-sections">SECTIONS 10 – 16</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>10. LOCATION INFORMATION</Heading>
                <Text>
                  LAMPOSE may request location access to provide location-based services such as displaying nearby properties, 
                  displaying nearby restaurants, improving search results, maps, directions, and local recommendations.
                </Text>
                <Text>
                  LAMPOSE will request location permission only when reasonably necessary for the applicable feature. 
                  Users may deny location permission and, where practical, use alternative functionality such as manually selecting a city, locality or address. 
                  LAMPOSE does not request background location merely for advertising or analytics.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>11. PHOTOGRAPHS AND MEDIA</Heading>
                <Text>LAMPOSE may allow users and property/food partners to upload:</Text>
                <List className="policy-list">
                  <ListItem>Profile photographs;</ListItem>
                  <ListItem>Property, room, restaurant, and menu photographs;</ListItem>
                  <ListItem>Documents or supporting material where a feature requires them.</ListItem>
                </List>
                <Text>
                  LAMPOSE will use uploaded media for the purpose for which it was submitted. 
                  LAMPOSE uses system photo pickers where practical instead of requesting broad access to the user's entire photo library.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>12. CAMERA PERMISSION</Heading>
                <Text>
                  If LAMPOSE provides features that require taking photographs (uploading property/profile photos, scanning QR codes or verification codes), 
                  the application may request camera permission. LAMPOSE will not use camera access for unrelated purposes.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>13. CONTACTS</Heading>
                <Text>
                  LAMPOSE does not require unrestricted access to a user's contacts merely to operate the core accommodation or food-booking service. 
                  If a future feature requires selecting a contact, LAMPOSE will prefer platform-provided contact pickers or equivalent privacy-preserving mechanisms.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>14. DEVICE AND TECHNICAL INFORMATION</Heading>
                <Text>LAMPOSE may automatically receive limited technical information such as:</Text>
                <List className="policy-list">
                  <ListItem>Device model, operating-system version, application version, language, and general device configuration;</ListItem>
                  <ListItem>IP address, network information, crash information, diagnostic information, and security-related logs;</ListItem>
                  <ListItem>Approximate region derived from technical information where necessary.</ListItem>
                </List>
                <Text>This information is used to operate the application, diagnose crashes, prevent abuse, improve reliability, and maintain security.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>15. LOG INFORMATION</Heading>
                <Text>
                  Our systems maintain technical logs associated with application and website usage (IP address, request time, endpoint/service requested, error details, authentication/security events) 
                  for security, troubleshooting, fraud prevention, system reliability and legal compliance.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>16. COOKIES AND SIMILAR TECHNOLOGIES</Heading>
                <Text>
                  The LAMPOSE website may use cookies, local storage, pixels or similar technologies for authentication, session maintenance, security, remembering preferences, analytics, and performance monitoring. 
                  Where legally required, LAMPOSE provides appropriate choices regarding non-essential cookies.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 4: 17 - 23 */}
            <Article id="ch-4" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>4. Communications &amp; Data Sharing</Heading>
                <Inline className="group-sections">SECTIONS 17 – 23</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>17. NOTIFICATIONS</Heading>
                <Text>
                  LAMPOSE may send push notifications for booking confirmations, booking status, owner verification, property updates, payment status, cancellation details, and security alerts. 
                  Users can control notification permissions through device settings at any time.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>18. WHATSAPP COMMUNICATIONS</Heading>
                <Text>
                  LAMPOSE may use WhatsApp through verified communication providers (e.g. Twilio) for specific business communications, property verifications, and transactional alerts. 
                  LAMPOSE will not treat a WhatsApp response as authorization for unrelated activities.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>19. THIRD-PARTY SERVICE PROVIDERS</Heading>
                <Text>
                  LAMPOSE may use carefully selected third-party service providers to operate technical or business functions (cloud hosting, databases, media storage, WhatsApp communication, payment processing, mapping, analytics, authentication, and push notifications). 
                  LAMPOSE does not intentionally sell personal information to third parties for their independent use.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>20. WHY WE SHARE INFORMATION</Heading>
                <Text>LAMPOSE may share limited information where reasonably necessary to:</Text>
                <List className="policy-list">
                  <ListItem><Strong>20.1 Provide a requested service:</Strong> Process bookings between a user and a property or food partner;</ListItem>
                  <ListItem><Strong>20.2 Process payments:</Strong> Share transaction details with secure payment processors;</ListItem>
                  <ListItem><Strong>20.3 Technical infrastructure:</Strong> Host, store, and secure platform data;</ListItem>
                  <ListItem><Strong>20.4 Prevent fraud and abuse:</Strong> Identify fake listings or account exploits;</ListItem>
                  <ListItem><Strong>20.5 Comply with law:</Strong> Respond to lawful court orders, statutory requests, or regulatory obligations;</ListItem>
                  <ListItem><Strong>20.6 Protect rights and safety:</Strong> Protect users, partners, LAMPOSE, and the public from harm or fraud.</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>21. PROPERTY OWNER AND USER INFORMATION</Heading>
                <Text>
                  Because LAMPOSE operates a marketplace, certain information must be shared between parties to a transaction (e.g., booking details to property owners, property directions to guests, or order details to food partners). 
                  LAMPOSE seeks to limit such disclosures strictly to what is reasonably necessary for the transaction.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>22. WE DO NOT SELL PERSONAL INFORMATION</Heading>
                <Box className="privacy-callout success">
                  <Strong>Zero Data Monetization:</Strong> LAMPOSE does not intend to sell personal information to third parties as a standalone commercial product.
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>23. ADVERTISING AND TRACKING</Heading>
                <Text>
                  If LAMPOSE introduces cross-app or cross-website tracking on iOS in the future, LAMPOSE will request explicit user permission via Apple's App Tracking Transparency (ATT) framework. 
                  LAMPOSE will not misrepresent tracking or attempt to circumvent platform privacy controls.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 5: 24 - 29 */}
            <Article id="ch-5" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>5. Security, Retention &amp; Deletion</Heading>
                <Inline className="group-sections">SECTIONS 24 – 29</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>24. DATA SECURITY</Heading>
                <Text>
                  LAMPOSE uses reasonable technical and organizational safeguards (encrypted connections, authentication controls, role-based access, secure server infrastructure, credential protection, logging, backups, vulnerability management, and secure APIs) to protect data. 
                  No Internet-based system is completely secure, so absolute security cannot be guaranteed.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>25. ADMINISTRATIVE ACCESS</Heading>
                <Text>
                  Access to user or partner information within administrative systems is limited according to job responsibilities (support, verification, booking operations, billing, compliance). 
                  Credentials are not shared, and sensitive administrative operations are logged.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>26. DATA RETENTION</Heading>
                <Text>
                  LAMPOSE retains information only as long as reasonably necessary for service delivery, account maintenance, transaction fulfillment, dispute resolution, accounting, tax laws, and agreement enforcement. 
                  Stale data is deleted or anonymized systematically.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>27. ACCOUNT DELETION</Heading>
                <Text>
                  LAMPOSE provides users with an in-app deletion mechanism and a publicly accessible web page to request complete account deletion in compliance with Google Play and Apple App Store standards.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>28. ACCOUNT DELETION REQUEST PROCESS</Heading>
                <Box className="deletion-box">
                  <Heading level={4}>Account Deletion Channels:</Heading>
                  <List>
                    <ListItem><Strong>In-App:</Strong> Go to <Code>Settings &rarr; Account &rarr; Delete Account</Code></ListItem>
                    <ListItem><Strong>Website:</Strong> Submit a request via <Anchor href="https://lampose.com/delete-account">lampose.com/delete-account</Anchor></ListItem>
                  </List>
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>29. INFORMATION THAT MAY BE RETAINED AFTER ACCOUNT DELETION</Heading>
                <Text>
                  Account deletion does not necessarily mean every record can immediately be erased. 
                  LAMPOSE may retain limited data where required for legal compliance, tax obligations, fraud prevention, security, and dispute resolution until statutory retention periods expire.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 6: 30 - 35 */}
            <Article id="ch-6" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>6. User Rights &amp; Permissions Controls</Heading>
                <Inline className="group-sections">SECTIONS 30 – 35</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>30. USER RIGHTS AND CONTROLS</Heading>
                <Text>Depending on applicable law, users have rights to:</Text>
                <List className="policy-list">
                  <ListItem>Access personal information held by LAMPOSE;</ListItem>
                  <ListItem>Request correction of inaccurate information;</ListItem>
                  <ListItem>Request deletion of personal data;</ListItem>
                  <ListItem>Withdraw previously granted consent;</ListItem>
                  <ListItem>Submit grievances regarding data processing.</ListItem>
                </List>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>31. CONSENT WITHDRAWAL</Heading>
                <Text>
                  Where processing relies on consent, users may withdraw consent at any time. 
                  Withdrawal does not affect lawful processing conducted prior to withdrawal. Essential services (such as completing an active booking) may not function if required information is withheld.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>32. LOCATION PERMISSION WITHDRAWAL</Heading>
                <Text>
                  Users can control or revoke location permissions through system settings. If denied, LAMPOSE provides text-based search alternatives.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>33. CAMERA AND PHOTO PERMISSION WITHDRAWAL</Heading>
                <Text>
                  Permissions can be revoked anytime in device settings. Features requiring photo uploads or QR scanning will be disabled accordingly.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>34. CHILDREN AND MINORS</Heading>
                <Text>
                  LAMPOSE is intended for users who are legally capable of entering service arrangements. 
                  LAMPOSE does not intentionally collect personal information from children. If an unauthorized minor's account is discovered, LAMPOSE will take immediate steps to restrict or delete the account.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>35. FRAUD AND SECURITY MONITORING</Heading>
                <Text>
                  LAMPOSE processes telemetry and listing information to identify fake accounts, detect fraudulent bookings, prevent payment scams, and investigate security threats. 
                  Fraud monitoring may continue after account closure where necessary.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 7: 36 - 44 */}
            <Article id="ch-7" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>7. Content, Communications &amp; Legal Framework</Heading>
                <Inline className="group-sections">SECTIONS 36 – 44</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>36. USER-GENERATED CONTENT</Heading>
                <Text>
                  Users and partners may submit reviews, star ratings, photos, descriptions, comments, and support tickets. 
                  Users should not upload passwords, financial credentials, or unauthorized third-party information to public areas.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>37. REVIEWS AND RATINGS</Heading>
                <Text>
                  Reviews are associated with verified transactions to maintain integrity. LAMPOSE may moderate or remove content that violates applicable terms, laws, or marketplace rules.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>38. COMMUNICATIONS</Heading>
                <Text>
                  LAMPOSE may communicate via in-app notifications, push alerts, email, SMS, WhatsApp, and customer support channels. 
                  Operational messages are required to provide the service.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>39. MARKETING COMMUNICATIONS</Heading>
                <Text>
                  Promotional updates are sent only where legally permitted. Users may opt out at any time using unsubscribe links. 
                  Opting out of marketing will not prevent essential transactional or security notices.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>40. INTERNATIONAL DATA PROCESSING</Heading>
                <Text>
                  Some LAMPOSE service providers (e.g. cloud hosting) may process data outside India. 
                  LAMPOSE takes reasonable steps to ensure standard regulatory safeguards apply to cross-border data processing.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>41. LEGAL AND REGULATORY COMPLIANCE</Heading>
                <Text>
                  LAMPOSE complies with applicable privacy, consumer-protection, IT, and tax laws. 
                  This Privacy Policy does not replace statutory consumer rights.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>42. INDIA DATA PROTECTION</Heading>
                <Text>
                  As an India-based company, LAMPOSE designs data processing in alignment with the Digital Personal Data Protection (DPDP) Act 2023. 
                  We maintain proper mechanisms for notice, consent, user requests, breach responses, and grievance redressal.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>43. DATA BREACHES AND SECURITY INCIDENTS</Heading>
                <Text>
                  In the event of a confirmed security incident involving personal data, LAMPOSE will take immediate steps to contain the incident, 
                  investigate the cause, mitigate harm, restore systems, and notify affected users and regulatory authorities as required by law.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>44. THIRD-PARTY WEBSITES</Heading>
                <Text>
                  LAMPOSE may provide links to external partner websites. LAMPOSE is not responsible for the privacy practices of independent third-party websites.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 8: 45 - 54 */}
            <Article id="ch-8" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>8. App Store &amp; Platform Rules</Heading>
                <Inline className="group-sections">SECTIONS 45 – 54</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>45. THIRD-PARTY SDKs</Heading>
                <Text>
                  LAMPOSE maintains an internal inventory of all integrated SDKs (analytics, crash reporting, payments, mapping, communication) 
                  to ensure full alignment with Apple Privacy Manifests and Google Play requirements.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>46. GOOGLE PLAY DATA SAFETY DISCLOSURE</Heading>
                <Text>
                  LAMPOSE provides accurate declarations in the Google Play Data Safety section. Data declarations are updated whenever SDKs, data categories, or permissions change.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>47. APPLE APP PRIVACY DISCLOSURE</Heading>
                <Text>
                  LAMPOSE provides accurate App Privacy nutrition labels in App Store Connect, detailing collected data categories in accordance with Apple guidelines.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>48. PERMISSION POLICY</Heading>
                <Text>
                  LAMPOSE follows the principle: <Emphasis>No permission unless the feature genuinely needs it.</Emphasis> 
                  Location, Camera, Photos, and Notifications are requested strictly on-demand. SMS/Call Log and unrestricted Contacts permissions are strictly avoided.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>49. PERMISSION REQUEST DESIGN</Heading>
                <Text>
                  Permissions are requested immediately before relevant features with clear, honest explanations (e.g. "Allow location access to show stays and restaurants near you") without deceptive wording.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>50. ACCOUNT SECURITY</Heading>
                <Text>
                  Users are responsible for safeguarding OTPs and account credentials. LAMPOSE will never ask for your authentication codes over phone or unsolicited message.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>51. PROPERTY VERIFICATION</Heading>
                <Text>
                  Physical and digital verifications confirm listing existence but do not represent an absolute guarantee of safety or suitability; hosts remain responsible for premises.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>52. BOOKING DATA SHARING</Heading>
                <Text>
                  Only the minimum necessary details (guest name, booking dates, contact number) are shared with hosts to fulfill bookings.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>53. DATA ACCURACY</Heading>
                <Text>
                  Users and partners must provide accurate info. LAMPOSE may suspend accounts providing fraudulent or materially inaccurate listings.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>54. BUSINESS TRANSFERS</Heading>
                <Text>
                  In the event of a merger, acquisition, or asset sale, customer information may be transferred as a business asset, subject to continuing privacy obligations.
                </Text>
              </Box>
            </Article>

            {/* CHAPTER 9: 55 - 63 */}
            <Article id="ch-9" className="privacy-group">
              <Box className="group-header">
                <Heading level={2}>9. Contact, Compliance Checklists &amp; Control</Heading>
                <Inline className="group-sections">SECTIONS 55 – 63</Inline>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>55. CHANGES TO THIS PRIVACY POLICY</Heading>
                <Text>
                  LAMPOSE may update this policy periodically. Material revisions will be highlighted via application notices, website alerts, or email. The "Last Updated" timestamp reflects the latest version.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>56. GRIEVANCE AND PRIVACY CONTACT</Heading>
                <Text>For data queries, grievance filings, or deletion requests, contact our official grievance office:</Text>
                <Box className="contact-corporate-card">
                  <Box className="contact-col">
                    <Inline className="contact-sub">COMPANY INFORMATION</Inline>
                    <Strong>LAMPOSE PRIVATE LIMITED</Strong>
                    <Text>Visakhapatnam, Andhra Pradesh, India</Text>
                    <Text>CIN: Registered Indian Private Limited Company</Text>
                  </Box>
                  <Box className="contact-col">
                    <Inline className="contact-sub">OFFICIAL CONTACTS</Inline>
                    <Text><Strong>Grievance &amp; Privacy Officer:</Strong> <Anchor href="mailto:privacy@lampose.com">privacy@lampose.com</Anchor></Text>
                    <Text><Strong>Customer Support:</Strong> <Anchor href="mailto:support@lampose.com">support@lampose.com</Anchor></Text>
                    <Text><Strong>Website:</Strong> <Anchor href="https://lampose.com">lampose.com</Anchor></Text>
                  </Box>
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>57. DATA DELETION REQUEST</Heading>
                <Text>
                  Users can initiate an automated account deletion in-app or submit a deletion ticket online at <Anchor href="https://lampose.com/delete-account">lampose.com/delete-account</Anchor>.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>58. VERSION &amp; STATUS</Heading>
                <Text>This Privacy Policy is active under <Strong>Version 1.0</Strong>.</Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>59. IMPORTANT IMPLEMENTATION NOTICE</Heading>
                <Text>
                  This framework is audited prior to every release to verify that production code, AndroidManifest.xml, iOS Info.plist, and third-party SDKs match these declarations.
                </Text>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>60. GOOGLE PLAY PLATFORM CHECKLIST</Heading>
                <Box className="checklist-card">
                  <Box className="chk-item">✓ Public HTTPS Privacy Policy</Box>
                  <Box className="chk-item">✓ Data Safety Declarations Complete</Box>
                  <Box className="chk-item">✓ In-App &amp; Web Deletion URL Active</Box>
                  <Box className="chk-item">✓ Photo Picker Implemented</Box>
                  <Box className="chk-item">✓ No Sensitive SMS/Call-Log Access</Box>
                  <Box className="chk-item">✓ October 2026 Contacts Rules Ready</Box>
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>61. APPLE APP STORE CHECKLIST</Heading>
                <Box className="checklist-card">
                  <Box className="chk-item">✓ App Store Connect Privacy Questionnaire Complete</Box>
                  <Box className="chk-item">✓ Guideline 5.1 Account Deletion Active</Box>
                  <Box className="chk-item">✓ Clear Purpose Strings in Info.plist</Box>
                  <Box className="chk-item">✓ Privacy Manifests for Required-Reason APIs</Box>
                  <Box className="chk-item">✓ Explicit ATT Framework for Any Tracking</Box>
                  <Box className="chk-item">✓ Minimal Permission Scope Enforced</Box>
                </Box>
              </Box>

              <Box className="policy-block">
                <Heading level={3}>62. FINAL INTERNAL RULE FOR THE LAMPOSE DEVELOPMENT TEAM</Heading>
                <Box className="privacy-callout info">
                  <Strong>Mandatory Release Rule:</Strong> <Code>CODE &rarr; DATA MAP &rarr; PRIVACY POLICY &rarr; PLAY DATA SAFETY &rarr; APPLE APP PRIVACY &rarr; PERMISSIONS &rarr; TEST &rarr; SUBMIT</Code>. 
                  The privacy policy, app permissions and store declarations must always describe the exact same system.
                </Box>
              </Box>

              <Box className="policy-block doc-control-block">
                <Heading level={3}>63. DOCUMENT CONTROL</Heading>
                <Table className="control-table">
                  <TableBody>
                    <TableRow>
                      <TableCell><Strong>Company</Strong></TableCell>
                      <TableCell>LAMPOSE PRIVATE LIMITED</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Application</Strong></TableCell>
                      <TableCell>LAMPOSE Mobile (Android &amp; iOS) &amp; Web</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Document Title</Strong></TableCell>
                      <TableCell>Privacy Policy &amp; Data Protection Handbook</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Version</Strong></TableCell>
                      <TableCell>Version 1.0</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell><Strong>Review Frequency</Strong></TableCell>
                      <TableCell>At least annually and whenever data processing practices change</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                <Text style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--ink-light)', fontSize: '0.85rem' }}>
                  — End of LAMPOSE Privacy Policy &amp; Data Protection Handbook —
                </Text>
              </Box>
            </Article>

          </Box>
        </Box>
      </Region>
    </Box>
  );
}
