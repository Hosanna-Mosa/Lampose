import { useState } from 'react';

const CHAPTERS = [
  { id: 'ch-1', label: '1. Overview & Principles (1–3)' },
  { id: 'ch-2', label: '2. Information We Collect (4–9)' },
  { id: 'ch-3', label: '3. Device Permissions & Media (10–16)' },
  { id: 'ch-4', label: '4. Communications & Sharing (17–23)' },
  { id: 'ch-5', label: '5. Security & Deletion (24–29)' },
  { id: 'ch-6', label: '6. User Rights & Controls (30–35)' },
  { id: 'ch-7', label: '7. Content & Legal Framework (36–44)' },
  { id: 'ch-8', label: '8. App Store & Platform Rules (45–54)' },
  { id: 'ch-9', label: '9. Contact, Checklists & Control (55–63)' },
];

export default function Privacy() {
  const [activeChapter, setActiveChapter] = useState('ch-1');

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
            <span className="sec-tag">Corporate Governance &amp; Compliance</span>
            <h1 className="privacy-title">
              Privacy Policy &amp; <em>Data Protection Handbook</em>
            </h1>
            <p className="privacy-subtitle">
              LAMPOSE PRIVATE LIMITED · Comprehensive data protection guidelines, permissions architecture, 
              user rights, and platform compliance disclosures.
            </p>
          </div>

          {/* Metadata Banner */}
          <div className="privacy-meta-banner">
            <div className="meta-item">
              <span className="meta-label">ENTITY</span>
              <span className="meta-val">LAMPOSE PRIVATE LIMITED</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">APPLICATION</span>
              <span className="meta-val">LAMPOSE (Android &amp; iOS)</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">VERSION</span>
              <span className="meta-val">Version 1.0</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">COMPLIANCE FRAMEWORK</span>
              <span className="meta-val meta-badge">DPDP Act 2023 &amp; App Store 5.1</span>
            </div>
          </div>
        </div>
      </section>

      {/* Sticky Pill Navigation */}
      <div className="privacy-nav-sticky">
        <div className="sec-inner">
          <div className="privacy-nav-track">
            {CHAPTERS.map((ch) => (
              <button
                key={ch.id}
                className={`privacy-nav-pill ${activeChapter === ch.id ? 'active' : ''}`}
                onClick={() => scrollToChapter(ch.id)}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Document Body */}
      <section className="privacy-body-section">
        <div className="sec-inner">
          <div className="privacy-document-card">

            {/* CHAPTER 1: 1 - 3 */}
            <article id="ch-1" className="privacy-group">
              <div className="group-header">
                <h2>1. Overview &amp; Principles</h2>
                <span className="group-sections">SECTIONS 1 – 3</span>
              </div>

              <div className="policy-block">
                <h3>1. INTRODUCTION</h3>
                <p>
                  LAMPOSE PRIVATE LIMITED ("LAMPOSE", "Company", "we", "us", or "our") operates the LAMPOSE mobile
                  application, website (<a href="https://lampose.com">lampose.com</a>) and related services.
                </p>
                <p>
                  LAMPOSE is a platform designed to connect users with accommodation and food-related services, including
                  stays such as PGs, hostels, bachelor rooms, hotels, houses, co-living spaces, lodges and other
                  accommodation providers, and food services including restaurants, messes and other participating food providers.
                </p>
                <p>This Privacy Policy explains:</p>
                <ul className="policy-list">
                  <li>What information LAMPOSE collects;</li>
                  <li>How information is collected;</li>
                  <li>Why information is collected;</li>
                  <li>How information is used;</li>
                  <li>When information is shared;</li>
                  <li>How information is protected;</li>
                  <li>How long information is retained;</li>
                  <li>How users can access, correct or delete their information;</li>
                  <li>How permissions are used;</li>
                  <li>How third-party service providers process information;</li>
                  <li>How users can contact LAMPOSE regarding privacy matters.</li>
                </ul>
                <p>By using LAMPOSE, you acknowledge that you have read and understood this Privacy Policy.</p>
              </div>

              <div className="policy-block">
                <h3>2. SCOPE OF THIS POLICY</h3>
                <p>This Privacy Policy applies to:</p>
                <ol className="policy-num-list">
                  <li>The LAMPOSE Android application;</li>
                  <li>The LAMPOSE iOS application;</li>
                  <li>The LAMPOSE website;</li>
                  <li>LAMPOSE booking services;</li>
                  <li>LAMPOSE property-owner services;</li>
                  <li>LAMPOSE restaurant and food-partner services;</li>
                  <li>Customer support interactions;</li>
                  <li>Communications sent through LAMPOSE;</li>
                  <li>Information collected through LAMPOSE's websites, applications, APIs and related services.</li>
                </ol>
                <p>
                  This Policy applies to users, property owners, food partners, delivery/service partners where applicable, and
                  other persons interacting with LAMPOSE.
                </p>
              </div>

              <div className="policy-block">
                <h3>3. OUR PRIVACY PRINCIPLES</h3>
                <p>LAMPOSE follows these foundational principles:</p>
                <div className="principles-grid">
                  <div className="principle-box">
                    <strong>3.1 Data Minimization</strong>
                    <p>We seek to collect only information reasonably necessary to provide, secure and improve our services.</p>
                  </div>
                  <div className="principle-box">
                    <strong>3.2 Purpose Limitation</strong>
                    <p>Information collected for one purpose will not ordinarily be used for an unrelated purpose without an appropriate legal basis, consent where required, or other lawful authorization.</p>
                  </div>
                  <div className="principle-box">
                    <strong>3.3 Transparency</strong>
                    <p>We explain clearly what information we collect and why we collect it.</p>
                  </div>
                  <div className="principle-box">
                    <strong>3.4 Security</strong>
                    <p>We use reasonable technical and organizational safeguards to protect information against unauthorized access, loss, misuse, alteration or disclosure.</p>
                  </div>
                  <div className="principle-box">
                    <strong>3.5 User Control</strong>
                    <p>Where applicable, users can access, correct, withdraw consent, or request deletion of their information.</p>
                  </div>
                  <div className="principle-box">
                    <strong>3.6 Accountability</strong>
                    <p>LAMPOSE expects its employees, contractors and service providers who handle personal information to follow appropriate privacy and security requirements.</p>
                  </div>
                </div>
              </div>
            </article>

            {/* CHAPTER 2: 4 - 9 */}
            <article id="ch-2" className="privacy-group">
              <div className="group-header">
                <h2>2. Information We Collect</h2>
                <span className="group-sections">SECTIONS 4 – 9</span>
              </div>

              <div className="policy-block">
                <h3>4. INFORMATION WE COLLECT</h3>
                <p>Depending on how you use LAMPOSE, we may collect the following categories of information.</p>
                <h4>4.1 Account Information</h4>
                <p>When creating or using an account, we may collect:</p>
                <ul className="policy-list">
                  <li>Full name;</li>
                  <li>Mobile phone number;</li>
                  <li>Email address;</li>
                  <li>Account identifier;</li>
                  <li>Profile information;</li>
                  <li>Login/authentication information;</li>
                  <li>Account preferences;</li>
                  <li>Profile photograph, if voluntarily provided.</li>
                </ul>
                <p>We use this information to create and manage your account and provide services associated with your account.</p>
              </div>

              <div className="policy-block">
                <h3>5. PHONE NUMBER AND ACCOUNT VERIFICATION</h3>
                <p>LAMPOSE may use your mobile number to:</p>
                <ul className="policy-list">
                  <li>Create or identify your account;</li>
                  <li>Authenticate your account;</li>
                  <li>Send verification codes;</li>
                  <li>Protect against fraudulent accounts;</li>
                  <li>Communicate important service information;</li>
                  <li>Associate bookings with your account.</li>
                </ul>
                <div className="privacy-callout info">
                  <strong>SMS Privacy Assurance:</strong> LAMPOSE does not require access to your SMS inbox merely to verify an account. 
                  Where OTP verification is used, the verification code is processed for authentication and security. 
                  LAMPOSE will not request unrestricted SMS or call-log permissions merely to perform ordinary account verification.
                </div>
              </div>

              <div className="policy-block">
                <h3>6. PROPERTY OWNER INFORMATION</h3>
                <p>If you register a property with LAMPOSE, we may collect:</p>
                <ul className="policy-list">
                  <li>Owner's name, business/property name, mobile number, and email address;</li>
                  <li>Property address, coordinates/location, property photographs, and description;</li>
                  <li>Accommodation type, pricing, availability, and facilities/amenities;</li>
                  <li>Business details, verification documentation voluntarily submitted, and agreement/contract information;</li>
                  <li>Bank/payment settlement information required for financial payouts.</li>
                </ul>
                <p>
                  <strong>Usage:</strong> Used to manage property listings, verify ownership authorization, communicate with owners, 
                  process bookings/agreements, provide customer support, prevent fraud, settle payments, and comply with tax and legal requirements.
                </p>
              </div>

              <div className="policy-block">
                <h3>7. FOOD PARTNER INFORMATION</h3>
                <p>If restaurants, messes or other food providers use LAMPOSE, we may collect:</p>
                <ul className="policy-list">
                  <li>Partner name, restaurant/business name, contact info, and business address;</li>
                  <li>Food/menu information, photographs, operating hours, and pricing;</li>
                  <li>Bank/payment settlement details and tax/business registration information where required;</li>
                  <li>Order and transaction history.</li>
                </ul>
                <p>This information is used to operate the food-service marketplace.</p>
              </div>

              <div className="policy-block">
                <h3>8. BOOKING INFORMATION</h3>
                <p>When you make or receive a booking, LAMPOSE may collect:</p>
                <ul className="policy-list">
                  <li>Booking ID, user/account ID, and property or food partner ID;</li>
                  <li>Selected service, booking date, and check-in/check-out dates;</li>
                  <li>Number of guests, booking status, amount payable, and payment status;</li>
                  <li>Cancellation information, verification details, and booking communications.</li>
                </ul>
                <p>Booking information is necessary to provide the requested service.</p>
              </div>

              <div className="policy-block">
                <h3>9. PAYMENT INFORMATION</h3>
                <p>Where payments are processed through third-party payment processors, LAMPOSE may receive information such as:</p>
                <ul className="policy-list">
                  <li>Transaction ID, payment status, and amount;</li>
                  <li>Payment method type, refund status, and settlement details.</li>
                </ul>
                <div className="privacy-callout warning">
                  <strong>Zero Local Storage of Card Credentials:</strong> Unless specifically stated otherwise, LAMPOSE does not store complete payment-card numbers, CVV numbers or equivalent highly sensitive payment credentials on its own servers. Payment processing is performed by PCI-DSS compliant third-party payment service providers.
                </div>
              </div>
            </article>

            {/* CHAPTER 3: 10 - 16 */}
            <article id="ch-3" className="privacy-group">
              <div className="group-header">
                <h2>3. Device Permissions &amp; Hardware</h2>
                <span className="group-sections">SECTIONS 10 – 16</span>
              </div>

              <div className="policy-block">
                <h3>10. LOCATION INFORMATION</h3>
                <p>
                  LAMPOSE may request location access to provide location-based services such as displaying nearby properties, 
                  displaying nearby restaurants, improving search results, maps, directions, and local recommendations.
                </p>
                <p>
                  LAMPOSE will request location permission only when reasonably necessary for the applicable feature. 
                  Users may deny location permission and, where practical, use alternative functionality such as manually selecting a city, locality or address. 
                  LAMPOSE does not request background location merely for advertising or analytics.
                </p>
              </div>

              <div className="policy-block">
                <h3>11. PHOTOGRAPHS AND MEDIA</h3>
                <p>LAMPOSE may allow users and property/food partners to upload:</p>
                <ul className="policy-list">
                  <li>Profile photographs;</li>
                  <li>Property, room, restaurant, and menu photographs;</li>
                  <li>Documents or supporting material where a feature requires them.</li>
                </ul>
                <p>
                  LAMPOSE will use uploaded media for the purpose for which it was submitted. 
                  LAMPOSE uses system photo pickers where practical instead of requesting broad access to the user's entire photo library.
                </p>
              </div>

              <div className="policy-block">
                <h3>12. CAMERA PERMISSION</h3>
                <p>
                  If LAMPOSE provides features that require taking photographs (uploading property/profile photos, scanning QR codes or verification codes), 
                  the application may request camera permission. LAMPOSE will not use camera access for unrelated purposes.
                </p>
              </div>

              <div className="policy-block">
                <h3>13. CONTACTS</h3>
                <p>
                  LAMPOSE does not require unrestricted access to a user's contacts merely to operate the core accommodation or food-booking service. 
                  If a future feature requires selecting a contact, LAMPOSE will prefer platform-provided contact pickers or equivalent privacy-preserving mechanisms.
                </p>
              </div>

              <div className="policy-block">
                <h3>14. DEVICE AND TECHNICAL INFORMATION</h3>
                <p>LAMPOSE may automatically receive limited technical information such as:</p>
                <ul className="policy-list">
                  <li>Device model, operating-system version, application version, language, and general device configuration;</li>
                  <li>IP address, network information, crash information, diagnostic information, and security-related logs;</li>
                  <li>Approximate region derived from technical information where necessary.</li>
                </ul>
                <p>This information is used to operate the application, diagnose crashes, prevent abuse, improve reliability, and maintain security.</p>
              </div>

              <div className="policy-block">
                <h3>15. LOG INFORMATION</h3>
                <p>
                  Our systems maintain technical logs associated with application and website usage (IP address, request time, endpoint/service requested, error details, authentication/security events) 
                  for security, troubleshooting, fraud prevention, system reliability and legal compliance.
                </p>
              </div>

              <div className="policy-block">
                <h3>16. COOKIES AND SIMILAR TECHNOLOGIES</h3>
                <p>
                  The LAMPOSE website may use cookies, local storage, pixels or similar technologies for authentication, session maintenance, security, remembering preferences, analytics, and performance monitoring. 
                  Where legally required, LAMPOSE provides appropriate choices regarding non-essential cookies.
                </p>
              </div>
            </article>

            {/* CHAPTER 4: 17 - 23 */}
            <article id="ch-4" className="privacy-group">
              <div className="group-header">
                <h2>4. Communications &amp; Data Sharing</h2>
                <span className="group-sections">SECTIONS 17 – 23</span>
              </div>

              <div className="policy-block">
                <h3>17. NOTIFICATIONS</h3>
                <p>
                  LAMPOSE may send push notifications for booking confirmations, booking status, owner verification, property updates, payment status, cancellation details, and security alerts. 
                  Users can control notification permissions through device settings at any time.
                </p>
              </div>

              <div className="policy-block">
                <h3>18. WHATSAPP COMMUNICATIONS</h3>
                <p>
                  LAMPOSE may use WhatsApp through verified communication providers (e.g. Twilio) for specific business communications, property verifications, and transactional alerts. 
                  LAMPOSE will not treat a WhatsApp response as authorization for unrelated activities.
                </p>
              </div>

              <div className="policy-block">
                <h3>19. THIRD-PARTY SERVICE PROVIDERS</h3>
                <p>
                  LAMPOSE may use carefully selected third-party service providers to operate technical or business functions (cloud hosting, databases, media storage, WhatsApp communication, payment processing, mapping, analytics, authentication, and push notifications). 
                  LAMPOSE does not intentionally sell personal information to third parties for their independent use.
                </p>
              </div>

              <div className="policy-block">
                <h3>20. WHY WE SHARE INFORMATION</h3>
                <p>LAMPOSE may share limited information where reasonably necessary to:</p>
                <ul className="policy-list">
                  <li><strong>20.1 Provide a requested service:</strong> Process bookings between a user and a property or food partner;</li>
                  <li><strong>20.2 Process payments:</strong> Share transaction details with secure payment processors;</li>
                  <li><strong>20.3 Technical infrastructure:</strong> Host, store, and secure platform data;</li>
                  <li><strong>20.4 Prevent fraud and abuse:</strong> Identify fake listings or account exploits;</li>
                  <li><strong>20.5 Comply with law:</strong> Respond to lawful court orders, statutory requests, or regulatory obligations;</li>
                  <li><strong>20.6 Protect rights and safety:</strong> Protect users, partners, LAMPOSE, and the public from harm or fraud.</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>21. PROPERTY OWNER AND USER INFORMATION</h3>
                <p>
                  Because LAMPOSE operates a marketplace, certain information must be shared between parties to a transaction (e.g., booking details to property owners, property directions to guests, or order details to food partners). 
                  LAMPOSE seeks to limit such disclosures strictly to what is reasonably necessary for the transaction.
                </p>
              </div>

              <div className="policy-block">
                <h3>22. WE DO NOT SELL PERSONAL INFORMATION</h3>
                <div className="privacy-callout success">
                  <strong>Zero Data Monetization:</strong> LAMPOSE does not intend to sell personal information to third parties as a standalone commercial product.
                </div>
              </div>

              <div className="policy-block">
                <h3>23. ADVERTISING AND TRACKING</h3>
                <p>
                  If LAMPOSE introduces cross-app or cross-website tracking on iOS in the future, LAMPOSE will request explicit user permission via Apple's App Tracking Transparency (ATT) framework. 
                  LAMPOSE will not misrepresent tracking or attempt to circumvent platform privacy controls.
                </p>
              </div>
            </article>

            {/* CHAPTER 5: 24 - 29 */}
            <article id="ch-5" className="privacy-group">
              <div className="group-header">
                <h2>5. Security, Retention &amp; Deletion</h2>
                <span className="group-sections">SECTIONS 24 – 29</span>
              </div>

              <div className="policy-block">
                <h3>24. DATA SECURITY</h3>
                <p>
                  LAMPOSE uses reasonable technical and organizational safeguards (encrypted connections, authentication controls, role-based access, secure server infrastructure, credential protection, logging, backups, vulnerability management, and secure APIs) to protect data. 
                  No Internet-based system is completely secure, so absolute security cannot be guaranteed.
                </p>
              </div>

              <div className="policy-block">
                <h3>25. ADMINISTRATIVE ACCESS</h3>
                <p>
                  Access to user or partner information within administrative systems is limited according to job responsibilities (support, verification, booking operations, billing, compliance). 
                  Credentials are not shared, and sensitive administrative operations are logged.
                </p>
              </div>

              <div className="policy-block">
                <h3>26. DATA RETENTION</h3>
                <p>
                  LAMPOSE retains information only as long as reasonably necessary for service delivery, account maintenance, transaction fulfillment, dispute resolution, accounting, tax laws, and agreement enforcement. 
                  Stale data is deleted or anonymized systematically.
                </p>
              </div>

              <div className="policy-block">
                <h3>27. ACCOUNT DELETION</h3>
                <p>
                  LAMPOSE provides users with an in-app deletion mechanism and a publicly accessible web page to request complete account deletion in compliance with Google Play and Apple App Store standards.
                </p>
              </div>

              <div className="policy-block">
                <h3>28. ACCOUNT DELETION REQUEST PROCESS</h3>
                <div className="deletion-box">
                  <h4>Account Deletion Channels:</h4>
                  <ul>
                    <li><strong>In-App:</strong> Go to <code>Settings &rarr; Account &rarr; Delete Account</code></li>
                    <li><strong>Website:</strong> Submit a request via <a href="https://lampose.com/delete-account">lampose.com/delete-account</a></li>
                  </ul>
                </div>
              </div>

              <div className="policy-block">
                <h3>29. INFORMATION THAT MAY BE RETAINED AFTER ACCOUNT DELETION</h3>
                <p>
                  Account deletion does not necessarily mean every record can immediately be erased. 
                  LAMPOSE may retain limited data where required for legal compliance, tax obligations, fraud prevention, security, and dispute resolution until statutory retention periods expire.
                </p>
              </div>
            </article>

            {/* CHAPTER 6: 30 - 35 */}
            <article id="ch-6" className="privacy-group">
              <div className="group-header">
                <h2>6. User Rights &amp; Permissions Controls</h2>
                <span className="group-sections">SECTIONS 30 – 35</span>
              </div>

              <div className="policy-block">
                <h3>30. USER RIGHTS AND CONTROLS</h3>
                <p>Depending on applicable law, users have rights to:</p>
                <ul className="policy-list">
                  <li>Access personal information held by LAMPOSE;</li>
                  <li>Request correction of inaccurate information;</li>
                  <li>Request deletion of personal data;</li>
                  <li>Withdraw previously granted consent;</li>
                  <li>Submit grievances regarding data processing.</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>31. CONSENT WITHDRAWAL</h3>
                <p>
                  Where processing relies on consent, users may withdraw consent at any time. 
                  Withdrawal does not affect lawful processing conducted prior to withdrawal. Essential services (such as completing an active booking) may not function if required information is withheld.
                </p>
              </div>

              <div className="policy-block">
                <h3>32. LOCATION PERMISSION WITHDRAWAL</h3>
                <p>
                  Users can control or revoke location permissions through system settings. If denied, LAMPOSE provides text-based search alternatives.
                </p>
              </div>

              <div className="policy-block">
                <h3>33. CAMERA AND PHOTO PERMISSION WITHDRAWAL</h3>
                <p>
                  Permissions can be revoked anytime in device settings. Features requiring photo uploads or QR scanning will be disabled accordingly.
                </p>
              </div>

              <div className="policy-block">
                <h3>34. CHILDREN AND MINORS</h3>
                <p>
                  LAMPOSE is intended for users who are legally capable of entering service arrangements. 
                  LAMPOSE does not intentionally collect personal information from children. If an unauthorized minor's account is discovered, LAMPOSE will take immediate steps to restrict or delete the account.
                </p>
              </div>

              <div className="policy-block">
                <h3>35. FRAUD AND SECURITY MONITORING</h3>
                <p>
                  LAMPOSE processes telemetry and listing information to identify fake accounts, detect fraudulent bookings, prevent payment scams, and investigate security threats. 
                  Fraud monitoring may continue after account closure where necessary.
                </p>
              </div>
            </article>

            {/* CHAPTER 7: 36 - 44 */}
            <article id="ch-7" className="privacy-group">
              <div className="group-header">
                <h2>7. Content, Communications &amp; Legal Framework</h2>
                <span className="group-sections">SECTIONS 36 – 44</span>
              </div>

              <div className="policy-block">
                <h3>36. USER-GENERATED CONTENT</h3>
                <p>
                  Users and partners may submit reviews, star ratings, photos, descriptions, comments, and support tickets. 
                  Users should not upload passwords, financial credentials, or unauthorized third-party information to public areas.
                </p>
              </div>

              <div className="policy-block">
                <h3>37. REVIEWS AND RATINGS</h3>
                <p>
                  Reviews are associated with verified transactions to maintain integrity. LAMPOSE may moderate or remove content that violates applicable terms, laws, or marketplace rules.
                </p>
              </div>

              <div className="policy-block">
                <h3>38. COMMUNICATIONS</h3>
                <p>
                  LAMPOSE may communicate via in-app notifications, push alerts, email, SMS, WhatsApp, and customer support channels. 
                  Operational messages are required to provide the service.
                </p>
              </div>

              <div className="policy-block">
                <h3>39. MARKETING COMMUNICATIONS</h3>
                <p>
                  Promotional updates are sent only where legally permitted. Users may opt out at any time using unsubscribe links. 
                  Opting out of marketing will not prevent essential transactional or security notices.
                </p>
              </div>

              <div className="policy-block">
                <h3>40. INTERNATIONAL DATA PROCESSING</h3>
                <p>
                  Some LAMPOSE service providers (e.g. cloud hosting) may process data outside India. 
                  LAMPOSE takes reasonable steps to ensure standard regulatory safeguards apply to cross-border data processing.
                </p>
              </div>

              <div className="policy-block">
                <h3>41. LEGAL AND REGULATORY COMPLIANCE</h3>
                <p>
                  LAMPOSE complies with applicable privacy, consumer-protection, IT, and tax laws. 
                  This Privacy Policy does not replace statutory consumer rights.
                </p>
              </div>

              <div className="policy-block">
                <h3>42. INDIA DATA PROTECTION</h3>
                <p>
                  As an India-based company, LAMPOSE designs data processing in alignment with the Digital Personal Data Protection (DPDP) Act 2023. 
                  We maintain proper mechanisms for notice, consent, user requests, breach responses, and grievance redressal.
                </p>
              </div>

              <div className="policy-block">
                <h3>43. DATA BREACHES AND SECURITY INCIDENTS</h3>
                <p>
                  In the event of a confirmed security incident involving personal data, LAMPOSE will take immediate steps to contain the incident, 
                  investigate the cause, mitigate harm, restore systems, and notify affected users and regulatory authorities as required by law.
                </p>
              </div>

              <div className="policy-block">
                <h3>44. THIRD-PARTY WEBSITES</h3>
                <p>
                  LAMPOSE may provide links to external partner websites. LAMPOSE is not responsible for the privacy practices of independent third-party websites.
                </p>
              </div>
            </article>

            {/* CHAPTER 8: 45 - 54 */}
            <article id="ch-8" className="privacy-group">
              <div className="group-header">
                <h2>8. App Store &amp; Platform Rules</h2>
                <span className="group-sections">SECTIONS 45 – 54</span>
              </div>

              <div className="policy-block">
                <h3>45. THIRD-PARTY SDKs</h3>
                <p>
                  LAMPOSE maintains an internal inventory of all integrated SDKs (analytics, crash reporting, payments, mapping, communication) 
                  to ensure full alignment with Apple Privacy Manifests and Google Play requirements.
                </p>
              </div>

              <div className="policy-block">
                <h3>46. GOOGLE PLAY DATA SAFETY DISCLOSURE</h3>
                <p>
                  LAMPOSE provides accurate declarations in the Google Play Data Safety section. Data declarations are updated whenever SDKs, data categories, or permissions change.
                </p>
              </div>

              <div className="policy-block">
                <h3>47. APPLE APP PRIVACY DISCLOSURE</h3>
                <p>
                  LAMPOSE provides accurate App Privacy nutrition labels in App Store Connect, detailing collected data categories in accordance with Apple guidelines.
                </p>
              </div>

              <div className="policy-block">
                <h3>48. PERMISSION POLICY</h3>
                <p>
                  LAMPOSE follows the principle: <em>No permission unless the feature genuinely needs it.</em> 
                  Location, Camera, Photos, and Notifications are requested strictly on-demand. SMS/Call Log and unrestricted Contacts permissions are strictly avoided.
                </p>
              </div>

              <div className="policy-block">
                <h3>49. PERMISSION REQUEST DESIGN</h3>
                <p>
                  Permissions are requested immediately before relevant features with clear, honest explanations (e.g. "Allow location access to show stays and restaurants near you") without deceptive wording.
                </p>
              </div>

              <div className="policy-block">
                <h3>50. ACCOUNT SECURITY</h3>
                <p>
                  Users are responsible for safeguarding OTPs and account credentials. LAMPOSE will never ask for your authentication codes over phone or unsolicited message.
                </p>
              </div>

              <div className="policy-block">
                <h3>51. PROPERTY VERIFICATION</h3>
                <p>
                  Physical and digital verifications confirm listing existence but do not represent an absolute guarantee of safety or suitability; hosts remain responsible for premises.
                </p>
              </div>

              <div className="policy-block">
                <h3>52. BOOKING DATA SHARING</h3>
                <p>
                  Only the minimum necessary details (guest name, booking dates, contact number) are shared with hosts to fulfill bookings.
                </p>
              </div>

              <div className="policy-block">
                <h3>53. DATA ACCURACY</h3>
                <p>
                  Users and partners must provide accurate info. LAMPOSE may suspend accounts providing fraudulent or materially inaccurate listings.
                </p>
              </div>

              <div className="policy-block">
                <h3>54. BUSINESS TRANSFERS</h3>
                <p>
                  In the event of a merger, acquisition, or asset sale, customer information may be transferred as a business asset, subject to continuing privacy obligations.
                </p>
              </div>
            </article>

            {/* CHAPTER 9: 55 - 63 */}
            <article id="ch-9" className="privacy-group">
              <div className="group-header">
                <h2>9. Contact, Compliance Checklists &amp; Control</h2>
                <span className="group-sections">SECTIONS 55 – 63</span>
              </div>

              <div className="policy-block">
                <h3>55. CHANGES TO THIS PRIVACY POLICY</h3>
                <p>
                  LAMPOSE may update this policy periodically. Material revisions will be highlighted via application notices, website alerts, or email. The "Last Updated" timestamp reflects the latest version.
                </p>
              </div>

              <div className="policy-block">
                <h3>56. GRIEVANCE AND PRIVACY CONTACT</h3>
                <p>For data queries, grievance filings, or deletion requests, contact our official grievance office:</p>
                <div className="contact-corporate-card">
                  <div className="contact-col">
                    <span className="contact-sub">COMPANY INFORMATION</span>
                    <strong>LAMPOSE PRIVATE LIMITED</strong>
                    <p>Visakhapatnam, Andhra Pradesh, India</p>
                    <p>CIN: Registered Indian Private Limited Company</p>
                  </div>
                  <div className="contact-col">
                    <span className="contact-sub">OFFICIAL CONTACTS</span>
                    <p><strong>Grievance &amp; Privacy Officer:</strong> <a href="mailto:privacy@lampose.com">privacy@lampose.com</a></p>
                    <p><strong>Customer Support:</strong> <a href="mailto:support@lampose.com">support@lampose.com</a></p>
                    <p><strong>Website:</strong> <a href="https://lampose.com">lampose.com</a></p>
                  </div>
                </div>
              </div>

              <div className="policy-block">
                <h3>57. DATA DELETION REQUEST</h3>
                <p>
                  Users can initiate an automated account deletion in-app or submit a deletion ticket online at <a href="https://lampose.com/delete-account">lampose.com/delete-account</a>.
                </p>
              </div>

              <div className="policy-block">
                <h3>58. VERSION &amp; STATUS</h3>
                <p>This Privacy Policy is active under <strong>Version 1.0</strong>.</p>
              </div>

              <div className="policy-block">
                <h3>59. IMPORTANT IMPLEMENTATION NOTICE</h3>
                <p>
                  This framework is audited prior to every release to verify that production code, AndroidManifest.xml, iOS Info.plist, and third-party SDKs match these declarations.
                </p>
              </div>

              <div className="policy-block">
                <h3>60. GOOGLE PLAY PLATFORM CHECKLIST</h3>
                <div className="checklist-card">
                  <div className="chk-item">✓ Public HTTPS Privacy Policy</div>
                  <div className="chk-item">✓ Data Safety Declarations Complete</div>
                  <div className="chk-item">✓ In-App &amp; Web Deletion URL Active</div>
                  <div className="chk-item">✓ Photo Picker Implemented</div>
                  <div className="chk-item">✓ No Sensitive SMS/Call-Log Access</div>
                  <div className="chk-item">✓ October 2026 Contacts Rules Ready</div>
                </div>
              </div>

              <div className="policy-block">
                <h3>61. APPLE APP STORE CHECKLIST</h3>
                <div className="checklist-card">
                  <div className="chk-item">✓ App Store Connect Privacy Questionnaire Complete</div>
                  <div className="chk-item">✓ Guideline 5.1 Account Deletion Active</div>
                  <div className="chk-item">✓ Clear Purpose Strings in Info.plist</div>
                  <div className="chk-item">✓ Privacy Manifests for Required-Reason APIs</div>
                  <div className="chk-item">✓ Explicit ATT Framework for Any Tracking</div>
                  <div className="chk-item">✓ Minimal Permission Scope Enforced</div>
                </div>
              </div>

              <div className="policy-block">
                <h3>62. FINAL INTERNAL RULE FOR THE LAMPOSE DEVELOPMENT TEAM</h3>
                <div className="privacy-callout info">
                  <strong>Mandatory Release Rule:</strong> <code>CODE &rarr; DATA MAP &rarr; PRIVACY POLICY &rarr; PLAY DATA SAFETY &rarr; APPLE APP PRIVACY &rarr; PERMISSIONS &rarr; TEST &rarr; SUBMIT</code>. 
                  The privacy policy, app permissions and store declarations must always describe the exact same system.
                </div>
              </div>

              <div className="policy-block doc-control-block">
                <h3>63. DOCUMENT CONTROL</h3>
                <table className="control-table">
                  <tbody>
                    <tr>
                      <td><strong>Company</strong></td>
                      <td>LAMPOSE PRIVATE LIMITED</td>
                    </tr>
                    <tr>
                      <td><strong>Application</strong></td>
                      <td>LAMPOSE Mobile (Android &amp; iOS) &amp; Web</td>
                    </tr>
                    <tr>
                      <td><strong>Document Title</strong></td>
                      <td>Privacy Policy &amp; Data Protection Handbook</td>
                    </tr>
                    <tr>
                      <td><strong>Version</strong></td>
                      <td>Version 1.0</td>
                    </tr>
                    <tr>
                      <td><strong>Review Frequency</strong></td>
                      <td>At least annually and whenever data processing practices change</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--ink-light)', fontSize: '0.85rem' }}>
                  — End of LAMPOSE Privacy Policy &amp; Data Protection Handbook —
                </p>
              </div>
            </article>

          </div>
        </div>
      </section>
    </div>
  );
}
