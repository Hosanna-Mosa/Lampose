import { useState } from 'react';

const CHAPTERS = [
  { id: 'ch-1', label: '1. Acceptance & Eligibility (1–3)' },
  { id: 'ch-2', label: '2. Accounts & Security (4–7)' },
  { id: 'ch-3', label: '3. Platform & Marketplace (8–12)' },
  { id: 'ch-4', label: '4. Stays & Accommodation (13–17)' },
  { id: 'ch-5', label: '5. Food, Mess & Delivery (18–22)' },
  { id: 'ch-6', label: '6. Payments & Refunds (23–27)' },
  { id: 'ch-7', label: '7. Partner Obligations (28–32)' },
  { id: 'ch-8', label: '8. User Conduct & IP (33–37)' },
  { id: 'ch-9', label: '9. Liability & Dispute Resolution (38–43)' },
];

export default function Terms() {
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
            <span className="sec-tag">Legal Terms &amp; Conditions</span>
            <h1 className="privacy-title">
              Terms &amp; <em>Conditions</em>
            </h1>
            <p className="privacy-subtitle">
              LAMPOSE PRIVATE LIMITED · Legally binding agreement governing user access, host and partner 
              commitments, marketplace bookings, payments, and platform usage.
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
              <span className="meta-val">LAMPOSE (Android &amp; iOS) &amp; Web</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">VERSION</span>
              <span className="meta-val">Version 1.0</span>
            </div>
            <div className="meta-item">
              <span className="meta-label">JURISDICTION</span>
              <span className="meta-val meta-badge">Indian Law &amp; IT Act 2000</span>
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
                <h2>1. Acceptance of Terms &amp; Eligibility</h2>
                <span className="group-sections">SECTIONS 1 – 3</span>
              </div>

              <div className="policy-block">
                <h3>1. CONTRACTUAL RELATIONSHIP</h3>
                <p>
                  These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User", "Host", "Partner", or "you") 
                  and <strong>LAMPOSE PRIVATE LIMITED</strong> ("LAMPOSE", "Company", "we", "us", or "our"), regarding your access to and use of 
                  the LAMPOSE mobile applications (Android and iOS), the website (<a href="https://lampose.com">lampose.com</a>), and associated marketplace services.
                </p>
                <p>
                  By registering for an account, browsing listings, making a reservation, ordering food, or listing a property or service, 
                  you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy.
                </p>
              </div>

              <div className="policy-block">
                <h3>2. ELIGIBILITY &amp; CAPACITY</h3>
                <p>
                  You must be at least 18 years of age and legally competent to enter into binding contracts under the Indian Contract Act, 1872. 
                  If you represent a business entity, property, or food establishment, you warrant that you possess all requisite corporate authorizations and powers to bind such entity.
                </p>
              </div>

              <div className="policy-block">
                <h3>3. AMENDMENTS &amp; UPDATES</h3>
                <p>
                  LAMPOSE reserves the right to modify or amend these Terms at any time. Material updates will be notified through in-app notifications, 
                  email, or website banners. Your continued use of LAMPOSE after such modifications signifies your acceptance of the updated Terms.
                </p>
              </div>
            </article>

            {/* CHAPTER 2: 4 - 7 */}
            <article id="ch-2" className="privacy-group">
              <div className="group-header">
                <h2>2. Account Registration &amp; Security</h2>
                <span className="group-sections">SECTIONS 4 – 7</span>
              </div>

              <div className="policy-block">
                <h3>4. ACCOUNT CREATION</h3>
                <p>
                  To access key platform features (booking accommodation, ordering food, or listing a property), you must register an account using a valid 
                  mobile phone number and verifiable profile information.
                </p>
              </div>

              <div className="policy-block">
                <h3>5. AUTHENTICATION &amp; OTP VERIFICATION</h3>
                <p>
                  LAMPOSE utilizes One-Time Password (OTP) verification for secure login. You are solely responsible for maintaining the confidentiality 
                  of your authentication credentials. LAMPOSE will never ask for your secret OTP over phone, email, or unverified channels.
                </p>
              </div>

              <div className="policy-block">
                <h3>6. ACCURACY OF INFORMATION</h3>
                <p>
                  You agree to provide true, accurate, and complete information during registration and to update such information promptly whenever changes occur. 
                  Submitting false or misleading information constitutes a material breach of these Terms.
                </p>
              </div>

              <div className="policy-block">
                <h3>7. ACCOUNT SUSPENSION &amp; TERMINATION</h3>
                <p>
                  LAMPOSE reserves the right to temporarily suspend or permanently terminate any account that engages in fraudulent activity, harassment, 
                  breach of safety protocols, non-payment, or violation of these Terms.
                </p>
              </div>
            </article>

            {/* CHAPTER 3: 8 - 12 */}
            <article id="ch-3" className="privacy-group">
              <div className="group-header">
                <h2>3. Platform Role &amp; Marketplace Rules</h2>
                <span className="group-sections">SECTIONS 8 – 12</span>
              </div>

              <div className="policy-block">
                <h3>8. NATURE OF THE MARKETPLACE</h3>
                <p>
                  LAMPOSE acts as an intermediary technology aggregator platform that connects consumers with third-party service providers, including 
                  accommodation owners (PGs, hostels, coliving spaces, bachelor rooms, hotels, houses) and food providers (messes, restaurants, tiffin centers).
                </p>
                <div className="privacy-callout info">
                  <strong>Intermediary Status:</strong> Under Section 79 of the Information Technology Act, 2000, LAMPOSE provides a marketplace platform 
                  and is not itself a real estate owner, hostel proprietor, restaurant operator, or food manufacturer, unless expressly stated otherwise in writing.
                </div>
              </div>

              <div className="policy-block">
                <h3>9. INDEPENDENT CONTRACTOR STATUS</h3>
                <p>
                  Accommodation hosts, food partners, and delivery personnel operate as independent third-party contractors and not as employees, agents, or franchisees of LAMPOSE.
                </p>
              </div>

              <div className="policy-block">
                <h3>10. PROHIBITED PLATFORM ACTIVITIES</h3>
                <p>Users and partners agree not to:</p>
                <ul className="policy-list">
                  <li>Use the platform for any illegal, hazardous, or unauthorized purpose;</li>
                  <li>Circumvent or attempt to manipulate LAMPOSE's booking and payment systems;</li>
                  <li>Post fake listings, spam reviews, or fraudulent reservations;</li>
                  <li>Scrape, reverse-engineer, or deploy automated bots on the platform;</li>
                  <li>Engage in abusive, discriminatory, or unlawful conduct toward other users or hosts.</li>
                </ul>
              </div>

              <div className="policy-block">
                <h3>11. USER-GENERATED REVIEWS &amp; RATINGS</h3>
                <p>
                  Users may submit honest reviews for stays and food orders they have completed. Reviews must be factual and devoid of defamatory language. 
                  LAMPOSE reserves the right to moderate or remove reviews that violate content policies.
                </p>
              </div>

              <div className="policy-block">
                <h3>12. APP &amp; DEVICE PERMISSIONS</h3>
                <p>
                  The LAMPOSE mobile app requests device permissions (such as Location, Camera, and Notifications) strictly to deliver platform functionality. 
                  You may configure these permissions in device settings in accordance with our Privacy Policy.
                </p>
              </div>
            </article>

            {/* CHAPTER 4: 13 - 17 */}
            <article id="ch-4" className="privacy-group">
              <div className="group-header">
                <h2>4. Stays &amp; Accommodation Terms</h2>
                <span className="group-sections">SECTIONS 13 – 17</span>
              </div>

              <div className="policy-block">
                <h3>13. ACCOMMODATION BOOKINGS</h3>
                <p>
                  When you book a stay (hostel, PG, room, or coliving bed), a direct contractual relationship is established between you and the accommodation host. 
                  LAMPOSE facilitates the reservation, communication, and payment transaction.
                </p>
              </div>

              <div className="policy-block">
                <h3>14. CHECK-IN, KYC &amp; HOUSE RULES</h3>
                <p>
                  Guests must present valid government-issued photo identification (such as Aadhaar, Voter ID, or Passport) upon check-in as mandated by local law. 
                  Guests agree to respect the host's published house rules, curfew times, visitor policies, and community standards.
                </p>
              </div>

              <div className="policy-block">
                <h3>15. SECURITY DEPOSITS &amp; RENT CYCLES</h3>
                <p>
                  For monthly stays and PG rentals, security deposits and monthly rent cycles are agreed upon according to the property's published listing details. 
                  Refunds of deposits upon move-out are governed by host agreement terms, subject to deductions for documented damages or unpaid dues.
                </p>
              </div>

              <div className="policy-block">
                <h3>16. PROPERTY DAMAGE &amp; CONDUCT</h3>
                <p>
                  Guests are financially responsible for any damage caused to accommodation premises, furniture, appliances, or fixtures during their tenancy.
                </p>
              </div>

              <div className="policy-block">
                <h3>17. SAFETY &amp; COMPLIANCE</h3>
                <p>
                  Hosts are required to maintain basic hygiene, fire safety compliance, and secure access. Any safety concerns may be escalated immediately to LAMPOSE Customer Support.
                </p>
              </div>
            </article>

            {/* CHAPTER 5: 18 - 22 */}
            <article id="ch-5" className="privacy-group">
              <div className="group-header">
                <h2>5. Food, Mess &amp; Delivery Terms</h2>
                <span className="group-sections">SECTIONS 18 – 22</span>
              </div>

              <div className="policy-block">
                <h3>18. FOOD ORDERS &amp; MESS SUBSCRIPTIONS</h3>
                <p>
                  LAMPOSE enables users to browse menus, order meals, and subscribe to recurring mess plans from participating food partners.
                </p>
              </div>

              <div className="policy-block">
                <h3>19. FOOD QUALITY &amp; FSSAI COMPLIANCE</h3>
                <p>
                  All participating food partners are required to possess valid FSSAI (Food Safety and Standards Authority of India) licenses 
                  and maintain statutory standards of food hygiene and preparation. The preparing kitchen remains responsible for food safety and ingredients.
                </p>
              </div>

              <div className="policy-block">
                <h3>20. ALLERGIES &amp; DIETARY ADVISORIES</h3>
                <p>
                  While menus display general ingredient indicators, users with severe food allergies or medical dietary restrictions should exercise caution 
                  and contact the kitchen directly prior to ordering.
                </p>
              </div>

              <div className="policy-block">
                <h3>21. DELIVERY PROTOCOLS</h3>
                <p>
                  Delivery timelines are estimates based on kitchen preparation speed, traffic conditions, and weather. 
                  Users must provide accurate delivery addresses and reachable phone numbers.
                </p>
              </div>

              <div className="policy-block">
                <h3>22. ORDER MODIFICATIONS &amp; CANCELLATIONS</h3>
                <p>
                  Once a kitchen accepts a food order and begins preparation, orders cannot be cancelled or modified without the kitchen's express consent.
                </p>
              </div>
            </article>

            {/* CHAPTER 6: 23 - 27 */}
            <article id="ch-6" className="privacy-group">
              <div className="group-header">
                <h2>6. Payments, Fees &amp; Refunds</h2>
                <span className="group-sections">SECTIONS 23 – 27</span>
              </div>

              <div className="policy-block">
                <h3>23. PRICING &amp; TAXES</h3>
                <p>
                  All prices listed on LAMPOSE are denominated in Indian Rupees (INR) and include applicable taxes (such as GST) unless indicated otherwise. 
                  LAMPOSE displays a clear cost breakdown before final payment confirmation.
                </p>
              </div>

              <div className="policy-block">
                <h3>24. PAYMENT PROCESSING</h3>
                <p>
                  Payments are processed securely via RBI-approved, PCI-DSS compliant payment gateways (supporting UPI, Net Banking, Debit/Credit Cards, and Wallets). 
                  LAMPOSE does not store card numbers or CVV credentials on its servers.
                </p>
              </div>

              <div className="policy-block">
                <h3>25. CANCELLATION POLICIES</h3>
                <p>
                  Each accommodation listing features an explicit cancellation window (e.g. Flexible, Moderate, or Strict). 
                  Cancellations made within the eligible window will be processed for refund according to the specific policy terms shown during checkout.
                </p>
              </div>

              <div className="policy-block">
                <h3>26. REFUND TIMELINES</h3>
                <p>
                  Approved refunds are credited back to the original payment source within 5 to 7 business days, depending on your bank's processing cycles.
                </p>
              </div>

              <div className="policy-block">
                <h3>27. CHARGEBACKS &amp; FRAUD PREVENTION</h3>
                <p>
                  Initiating fraudulent chargebacks or dispute claims without cause will result in immediate account restriction and referral for legal recovery.
                </p>
              </div>
            </article>

            {/* CHAPTER 7: 28 - 32 */}
            <article id="ch-7" className="privacy-group">
              <div className="group-header">
                <h2>7. Partner &amp; Host Obligations</h2>
                <span className="group-sections">SECTIONS 28 – 32</span>
              </div>

              <div className="policy-block">
                <h3>28. LISTING INTEGRITY &amp; ACCURACY</h3>
                <p>
                  Hosts and food partners warrant that all photos, room amenities, pricing, availability counts, and menu descriptions published on LAMPOSE 
                  are accurate and up to date. Misleading listings may be delisted immediately.
                </p>
              </div>

              <div className="policy-block">
                <h3>29. WHATSAPP &amp; DIGITAL VERIFICATION</h3>
                <p>
                  Property owners agree to complete verification protocols, including WhatsApp verification prompts (e.g. replying YES/NO via verified Twilio business channels) 
                  and identity/ownership documentation checks.
                </p>
              </div>

              <div className="policy-block">
                <h3>30. FINANCIAL SETTLEMENTS</h3>
                <p>
                  LAMPOSE remits partner payouts according to established settlement schedules directly to the verified bank accounts provided by partners, 
                  deducting applicable platform commission and statutory TDS where mandated.
                </p>
              </div>

              <div className="policy-block">
                <h3>31. NONDISCRIMINATION POLICY</h3>
                <p>
                  Partners agree to provide equitable service and shall not unlawfully discriminate against any guest or consumer on grounds of religion, race, caste, gender, or state of origin.
                </p>
              </div>

              <div className="policy-block">
                <h3>32. LOCAL LICENSING &amp; STATUTORY COMPLIANCE</h3>
                <p>
                  Partners are exclusively responsible for obtaining and renewing all required local municipal trade licenses, police approvals, fire clearances, and FSSAI registrations.
                </p>
              </div>
            </article>

            {/* CHAPTER 8: 33 - 37 */}
            <article id="ch-8" className="privacy-group">
              <div className="group-header">
                <h2>8. User Conduct &amp; Intellectual Property</h2>
                <span className="group-sections">SECTIONS 33 – 37</span>
              </div>

              <div className="policy-block">
                <h3>33. LAMPOSE INTELLECTUAL PROPERTY</h3>
                <p>
                  All trademarks, logos, brand assets, UI designs, graphics, software code, and platform architecture are the exclusive intellectual property of 
                  <strong>LAMPOSE PRIVATE LIMITED</strong> and are protected under Indian and international copyright and trademark laws.
                </p>
              </div>

              <div className="policy-block">
                <h3>34. LIMITED LICENSE</h3>
                <p>
                  LAMPOSE grants you a personal, revocable, non-exclusive, non-transferable license to access and use the application and services strictly for personal, non-commercial purposes.
                </p>
              </div>

              <div className="policy-block">
                <h3>35. USER CONTENT LICENSE</h3>
                <p>
                  By submitting reviews, listing photos, or descriptions, you grant LAMPOSE a royalty-free, worldwide license to use, display, and promote such content on the marketplace.
                </p>
              </div>

              <div className="policy-block">
                <h3>36. INDEMNIFICATION</h3>
                <p>
                  You agree to defend, indemnify, and hold harmless LAMPOSE, its directors, employees, and agents from any claims, liabilities, damages, or costs 
                  arising from your breach of these Terms, unlawful conduct, or violation of third-party rights.
                </p>
              </div>

              <div className="policy-block">
                <h3>37. DATA PRIVACY ALIGNMENT</h3>
                <p>
                  Personal data collected under these Terms is processed in strict compliance with the Digital Personal Data Protection (DPDP) Act, 2023 
                  and our comprehensive <a href="/privacy">Privacy Policy</a>.
                </p>
              </div>
            </article>

            {/* CHAPTER 9: 38 - 43 */}
            <article id="ch-9" className="privacy-group">
              <div className="group-header">
                <h2>9. Disclaimers, Liability &amp; Dispute Resolution</h2>
                <span className="group-sections">SECTIONS 38 – 43</span>
              </div>

              <div className="policy-block">
                <h3>38. WARRANTY DISCLAIMER</h3>
                <p>
                  The platform and services are provided on an "as-is" and "as-available" basis without warranties of any kind, whether express or implied, 
                  including implied warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </p>
              </div>

              <div className="policy-block">
                <h3>39. LIMITATION OF LIABILITY</h3>
                <p>
                  To the maximum extent permitted by applicable law, LAMPOSE shall not be liable for any indirect, incidental, punitive, or consequential damages 
                  arising out of or relating to your use of the marketplace, host premises, or food products.
                </p>
              </div>

              <div className="policy-block">
                <h3>40. FORCE MAJEURE</h3>
                <p>
                  LAMPOSE shall not be held liable for failure or delay in fulfilling its obligations caused by events beyond reasonable control, including natural disasters, 
                  strikes, network outages, or governmental restrictions.
                </p>
              </div>

              <div className="policy-block">
                <h3>41. GOVERNING LAW &amp; JURISDICTION</h3>
                <p>
                  These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising hereunder shall be subject to the exclusive 
                  jurisdiction of the competent courts located in <strong>Visakhapatnam, Andhra Pradesh, India</strong>.
                </p>
              </div>

              <div className="policy-block">
                <h3>42. GRIEVANCE REDRESSAL &amp; CONTACT</h3>
                <p>
                  In accordance with the Information Technology Act, 2000 and Consumer Protection (E-Commerce) Rules, 2020, users may direct questions, grievances, or legal notices to:
                </p>
                <div className="contact-corporate-card">
                  <div className="contact-col">
                    <span className="contact-sub">REGISTERED ENTITY</span>
                    <strong>LAMPOSE PRIVATE LIMITED</strong>
                    <p>Visakhapatnam, Andhra Pradesh, India</p>
                    <p>CIN: Registered Indian Private Limited Company</p>
                  </div>
                  <div className="contact-col">
                    <span className="contact-sub">OFFICIAL GRIEVANCE CHANNELS</span>
                    <p><strong>Grievance Officer:</strong> <a href="mailto:grievance@lampose.com">grievance@lampose.com</a></p>
                    <p><strong>Legal &amp; Privacy:</strong> <a href="mailto:privacy@lampose.com">privacy@lampose.com</a></p>
                    <p><strong>General Support:</strong> <a href="mailto:support@lampose.com">support@lampose.com</a></p>
                  </div>
                </div>
              </div>

              <div className="policy-block doc-control-block">
                <h3>43. DOCUMENT CONTROL</h3>
                <table className="control-table">
                  <tbody>
                    <tr>
                      <td><strong>Company</strong></td>
                      <td>LAMPOSE PRIVATE LIMITED</td>
                    </tr>
                    <tr>
                      <td><strong>Document Title</strong></td>
                      <td>Terms and Conditions of Platform Usage</td>
                    </tr>
                    <tr>
                      <td><strong>Version</strong></td>
                      <td>Version 1.0</td>
                    </tr>
                    <tr>
                      <td><strong>Applicability</strong></td>
                      <td>All LAMPOSE Users, Guests, Hosts, and Partners</td>
                    </tr>
                    <tr>
                      <td><strong>Review Frequency</strong></td>
                      <td>At least annually or upon material regulatory updates</td>
                    </tr>
                  </tbody>
                </table>
                <p style={{ marginTop: '2rem', textAlign: 'center', color: 'var(--ink-light)', fontSize: '0.85rem' }}>
                  — End of LAMPOSE Terms and Conditions —
                </p>
              </div>
            </article>

          </div>
        </div>
      </section>
    </div>
  );
}
