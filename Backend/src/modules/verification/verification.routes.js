const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const twilio = require('twilio');
const VerificationRequest = require('./verificationRequest.model');
const Property = require('../properties/property.model');
const { getIsInMemory, getMemoryStore } = require('../../infrastructure/database/db');

/* HTML-escape for the review page — every stored value passes through this. */
const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * @route   GET /api/verifications/review/:token
 * @desc    The verifier's review page, linked from the team WhatsApp message.
 *
 * Public but capability-gated: the token is 16 random bytes, unique to one
 * request, and the page reports expiry alongside the request's own 48-hour
 * TTL. It renders the pendingPropertyData snapshot — the property does not
 * exist anywhere else yet, so this is the one place a verifier can see the
 * photos and numbers before tapping Accept.
 */
router.get('/review/:token', async (req, res) => {
  res.set('X-Robots-Tag', 'noindex');

  if (getIsInMemory()) {
    return res.status(503).send('<h3>Review unavailable</h3><p>The database is offline; pending submissions are held in memory and cannot be shown here. Try again shortly.</p>');
  }

  try {
    const doc = await VerificationRequest.findOne({ token: req.params.token }).lean();
    if (!doc) {
      return res.status(404).send('<h3>Not found</h3><p>This review link does not match any onboarding request. It may have been mistyped.</p>');
    }

    const p = doc.pendingPropertyData || {};
    const expired = doc.expiresAt && new Date(doc.expiresAt) <= new Date()
      && !['verified', 'rejected', 'verifier_rejected'].includes(doc.status);

    const statusLabel = expired ? 'Expired'
      : doc.status === 'owner_approved' ? 'Owner approved — awaiting your verification'
      : doc.status === 'verified' ? 'Verified & live'
      : doc.status === 'rejected' || doc.status === 'verifier_rejected' ? 'Rejected'
      : 'Awaiting owner approval';
    const statusColor = expired ? '#8E1B21'
      : doc.status === 'verified' ? '#17803D'
      : doc.status === 'owner_approved' ? '#6E4700'
      : doc.status === 'rejected' || doc.status === 'verifier_rejected' ? '#8E1B21'
      : '#3D4247';

    const details = p.categoryDetails || {};
    const mess = details.foodIncluded === true
      ? `Available${details.foodType ? ` – ${details.foodType}` : ''}`
      : details.foodIncluded === false ? 'Not available' : 'Not specified';

    const priceRows = [
      p.stayType ? ['Stay type', p.stayType] : null,
      Number(p.dailyPrice) ? ['Daily price', `₹${Number(p.dailyPrice).toLocaleString('en-IN')}/day (${p.shortStayDuration || '1-7 days'})`] : null,
      Number(p.monthlyPrice || p.rent) ? ['Monthly price', `₹${Number(p.monthlyPrice || p.rent).toLocaleString('en-IN')}/month (${p.longStayDuration || '1 month+'})`] : null,
      Number(p.deposit) ? ['Deposit', `₹${Number(p.deposit).toLocaleString('en-IN')}`] : null,
      ['Mess / food', mess],
      ['Category', p.category || '—'],
      ['Owner', `${p.ownerName || '—'} · ${p.ownerMobile || '—'}`],
      ['Onboarded by', p.employeeEmail || '—'],
    ].filter(Boolean);

    const addressLine = [p.address, p.place].filter(Boolean).join(', ');
    const mapsUrl = addressLine
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLine)}`
      : '';

    const images = Array.isArray(p.images) ? p.images.filter((u) => /^https?:\/\//i.test(String(u))) : [];

    res.send(`<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Verify: ${esc(p.name || 'Property')}</title>
<style>
  body{margin:0;background:#F1F2F4;color:#101214;font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:640px;margin:0 auto;padding:24px 16px 64px}
  .card{background:#fff;border:1px solid #E3E6EA;border-radius:16px;padding:20px;margin-top:16px}
  h1{font-size:22px;margin:8px 0 2px;letter-spacing:-0.02em}
  .status{display:inline-block;font-size:12px;font-weight:700;padding:3px 12px;border-radius:999px;background:#fff;border:1.5px solid ${statusColor};color:${statusColor}}
  .addr{color:#3D4247;margin:6px 0 0}
  .addr a{color:#17803D;font-weight:600}
  table{width:100%;border-collapse:collapse;margin-top:4px}
  td{padding:8px 0;border-top:1px solid #EEF0F3;vertical-align:top;font-size:14px}
  td:first-child{color:#5F6670;width:38%;padding-right:12px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-top:4px}
  .grid img{width:100%;height:140px;object-fit:cover;border-radius:10px;border:1px solid #E3E6EA;background:#E9EBEE}
  h2{font-size:15px;margin:0 0 8px}
  .amen{display:flex;flex-wrap:wrap;gap:6px}
  .amen span{font-size:12px;background:#E9F5ED;color:#17803D;border:1px solid #B7D8C4;border-radius:999px;padding:2px 10px}
  .foot{color:#5F6670;font-size:12.5px;margin-top:18px}
</style></head><body><div class="wrap">
  <span class="status">${esc(statusLabel)}</span>
  <h1>${esc(p.name || 'Property')}</h1>
  <p class="addr">📍 ${esc(addressLine || 'No address recorded')}${mapsUrl ? ` — <a href="${esc(mapsUrl)}" rel="noopener">open in Google Maps</a>` : ''}</p>
  <div class="card"><h2>Photos (${images.length})</h2>
    ${images.length ? `<div class="grid">${images.map((u) => `<img src="${esc(u)}" alt="Property photo" loading="lazy">`).join('')}</div>` : '<p style="color:#5F6670">No photos were uploaded with this submission.</p>'}
  </div>
  <div class="card"><h2>Details</h2><table>
    ${priceRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}
  </table></div>
  <div class="card"><h2>Amenities</h2>
    ${Array.isArray(p.amenities) && p.amenities.length ? `<div class="amen">${p.amenities.map((a) => `<span>${esc(a)}</span>`).join('')}</div>` : '<p style="color:#5F6670">None listed.</p>'}
  </div>
  <p class="foot">Checked everything? Reply on WhatsApp — tap <b>Accept</b> to put this property live, or <b>Reject</b> to cancel the request. This link expires with the request${doc.expiresAt ? ` (${new Date(doc.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)` : ''}.</p>
</div></body></html>`);
  } catch (err) {
    console.error('❌ [Review Page Error]:', err.message);
    res.status(500).send('<h3>Something went wrong</h3><p>Could not load this review page. Try again shortly.</p>');
  }
});

/**
 * @route   GET /api/verifications
 * @desc    Fetch all verification requests from MongoDB Atlas
 * @access  Public / Admin
 */
router.get('/', async (req, res) => {
  try {
    const { search, status } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { ownerMobileE164: { $regex: search, $options: 'i' } },
        { token: { $regex: search, $options: 'i' } },
        { lastError: { $regex: search, $options: 'i' } },
      ];
    }

    if (status && status !== 'All') {
      query.status = status;
    }

    const items = await VerificationRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('property', 'name category place ownerName');

    return res.json({
      success: true,
      count: items.length,
      data: items,
      items: items, // Dual format for frontend compatibility
    });
  } catch (error) {
    console.error('❌ [GET /api/verifications Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error fetching verification requests.',
    });
  }
});

/**
 * @route   POST /api/verifications
 * @desc    Create a new verification request in MongoDB Atlas
 * @access  Public / Admin
 */
router.post('/', async (req, res) => {
  try {
    const { ownerMobileE164, status, lastError, attempts } = req.body;

    if (!ownerMobileE164) {
      return res.status(400).json({
        success: false,
        message: 'Owner mobile number is required.',
      });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const newRequest = await VerificationRequest.create({
      ownerMobileE164,
      token,
      status: status || 'pending',
      lastError: lastError || '',
      attempts: attempts || 1,
      expiresAt,
    });

    console.log(`✅ [Verification Created] ID: ${newRequest._id} | Mobile: ${ownerMobileE164}`);

    return res.status(201).json({
      success: true,
      data: newRequest,
    });
  } catch (error) {
    console.error('❌ [POST /api/verifications Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error creating verification request.',
    });
  }
});

/**
 * @route   PUT /api/verifications/:id
 * @desc    Update a verification request in MongoDB Atlas
 * @access  Public / Admin
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, attempts, lastError, ownerMobileE164 } = req.body;

    const updated = await VerificationRequest.findByIdAndUpdate(
      id,
      {
        ...(status && { status }),
        ...(attempts !== undefined && { attempts }),
        ...(lastError !== undefined && { lastError }),
        ...(ownerMobileE164 && { ownerMobileE164 }),
        ...(status === 'verified' && { respondedAt: new Date() }),
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Verification request not found.' });
    }

    console.log(`✏️ [Verification Updated] ID: ${id} | Status: ${updated.status}`);

    return res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error('❌ [PUT /api/verifications/:id Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error updating verification request.',
    });
  }
});

/**
 * @route   DELETE /api/verifications/:id
 * @desc    Delete a verification request from MongoDB Atlas
 * @access  Public / Admin
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await VerificationRequest.findByIdAndDelete(id);
    console.log(`🗑️ [Verification Deleted] ID: ${id}`);
    return res.json({
      success: true,
      message: 'Verification request deleted successfully.',
    });
  } catch (error) {
    console.error('❌ [DELETE /api/verifications/:id Error]:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error deleting verification request.',
    });
  }
});

/**
 * @route   POST /api/whatsapp/webhook
 * @route   POST /api/verifications/webhook
 * @desc    Incoming Twilio WhatsApp Webhook for 2-stage verification
 */
router.post('/webhook', async (req, res) => {
  const timestamp = new Date().toLocaleTimeString();
  const { From, Body } = req.body;

  console.log(`\n💬 [Twilio Webhook] Received message from ${From}: "${Body}"`);

  // Initialize Twilio MessagingResponse
  const twiml = new twilio.twiml.MessagingResponse();

  if (!From || !Body) {
    console.warn('⚠️ Webhook received request with missing From or Body payload.');
    res.type('text/xml');
    return res.send(twiml.toString());
  }

  try {
    const senderMobile = From.trim(); // contains "whatsapp:+91..."
    let textBody = Body.trim().toLowerCase();

    /* The full-data verification template carries Accept / Reject quick-reply
       buttons; a tap arrives as the button title in Body plus a VERIFY_YES /
       VERIFY_NO payload. Both are normalised here to the yes/no words every
       comparison below already understands, so a tapped button and a typed
       YES stay one flow. (VISIT_* payloads belong to the availability flow
       and pass through untouched.) */
    const verifyButton = String(req.body.ButtonPayload || '').trim().toUpperCase();
    // Matches both the plain payload and the id-carrying one (VERIFY_YES:<id>).
    if (/^VERIFY_YES(:|$)/.test(verifyButton) || textBody === 'accept') textBody = 'yes';
    else if (/^VERIFY_NO(:|$)/.test(verifyButton) || textBody === 'reject') textBody = 'no';

    /* ── Availability (visit requests) ──────────────────────────────────────
       A second, unrelated business flow shares this webhook because Twilio
       allows one inbound URL per number. It is told apart by vocabulary, not
       by route: the owner replies AVAILABLE (or NOT AVAILABLE), never YES.

       handleAvailabilityReply returns null for anything that is not one of
       its own words, and also for an availability word with no visit request
       open — so YES and NO fall through to the verification logic below with
       their meaning completely unchanged. Nothing after this point was
       modified. */
    const { handleAvailabilityReply } = require('../visits/visitRequest.controller');
    const availabilityReply = await handleAvailabilityReply({
      from: senderMobile,
      body: Body,
      buttonPayload: req.body.ButtonPayload,
    });
    if (availabilityReply) {
      twiml.message(availabilityReply);
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    // Load and parse Verification Team Numbers
    const verifierNumbersStr = process.env.VERIFICATION_TEAM_NUMBERS || '';
    const verifierNumbers = verifierNumbersStr
      .split(',')
      .map(num => num.trim())
      .filter(Boolean);

    const isSenderVerifier = verifierNumbers.includes(senderMobile);

    // ==================== IN-MEMORY MODE ====================
    if (getIsInMemory()) {
      console.log('   ℹ️ [In-Memory Mode] Processing webhook response in-memory...');
      const inMemoryStore = getMemoryStore();
      global.pendingInMemoryProperties = global.pendingInMemoryProperties || [];
      const { formatWhatsAppNumber } = require('../../infrastructure/twilio/twilio');

      // Check if there is an active owner-approved request assigned to this verifier
      let verifierPendingIdx = -1;
      if (isSenderVerifier) {
        verifierPendingIdx = global.pendingInMemoryProperties.findIndex(p => {
          return p.assignedVerifierMobileE164 === senderMobile && p.verificationStatus === 'owner_approved';
        });
      }

      // Case A: Sender is a Verifier and has a request assigned
      if (isSenderVerifier && verifierPendingIdx !== -1) {
        const prop = global.pendingInMemoryProperties[verifierPendingIdx];

        if (textBody === 'yes' || textBody === 'y') {
          prop.isVerified = true;
          prop.verificationStatus = 'verified';
          inMemoryStore.unshift(prop);
          global.pendingInMemoryProperties.splice(verifierPendingIdx, 1);
          console.log(`   ✅ [In-Memory Team Approved] Property "${prop.name}" verified and live.`);
          twiml.message(`Thank you! Property "${prop.name}" is now listed live on Lampose.`);
        } else if (textBody === 'no' || textBody === 'n') {
          prop.isVerified = false;
          prop.verificationStatus = 'verifier_rejected';

          // Clean Cloudinary images
          const cloudinary = require('cloudinary').v2;
          cloudinary.config({
            // Credentials come from .env only — the hardcoded fallbacks that
            // used to sit here were committed secrets. Missing config makes
            // the destroy call fail, which the try/catch below already eats.
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
          });
          const getPublicIdFromUrl = (url) => {
            if (!url || !url.includes('cloudinary.com')) return null;
            try {
              const parts = url.split(/\/image\/upload\/v\d+\/|\/image\/upload\//);
              if (parts.length > 1) {
                const relativePath = parts[1];
                const dotIdx = relativePath.lastIndexOf('.');
                return dotIdx !== -1 ? relativePath.substring(0, dotIdx) : relativePath;
              }
              return null;
            } catch (err) {
              return null;
            }
          };
          const imageUrls = prop.images || (prop.imageUrl ? [prop.imageUrl] : []);
          for (const imgUrl of imageUrls) {
            const pubId = getPublicIdFromUrl(imgUrl);
            if (pubId) {
              try { await cloudinary.uploader.destroy(pubId); } catch (e) {}
            }
          }

          global.pendingInMemoryProperties.splice(verifierPendingIdx, 1);
          console.log(`   ❌ [In-Memory Team Rejected] Property "${prop.name}" onboarding request rejected.`);
          twiml.message(`Understood. Onboarding request for "${prop.name}" rejected.`);
        } else {
          twiml.message(`Hello! Please reply YES to approve "${prop.name}" or NO to reject.`);
        }

        res.type('text/xml');
        return res.send(twiml.toString());
      } else {
        // Case B: Sender is the Owner
        const pendingIdx = global.pendingInMemoryProperties.findIndex(p => {
          return formatWhatsAppNumber(p.ownerMobile) === senderMobile && p.verificationStatus === 'pending';
        });

        if (pendingIdx === -1) {
          twiml.message("Hello from Lampose! We couldn't find any pending onboarding request for this number.");
          res.type('text/xml');
          return res.send(twiml.toString());
        }

        const prop = global.pendingInMemoryProperties[pendingIdx];

        if (textBody === 'yes' || textBody === 'y') {
          prop.verificationStatus = 'owner_approved';
          
          if (verifierNumbers.length > 0) {
            const randomVerifier = verifierNumbers[Math.floor(Math.random() * verifierNumbers.length)];
            prop.assignedVerifierMobileE164 = randomVerifier;
            console.log(`   ✅ [In-Memory Owner Approved] Forwarding details to verifier: ${randomVerifier}`);
            twiml.message("Thanks for the Confirmation, Our Verification team will process Your Request and send you the confirmation after its verify.");
          } else {
            prop.isVerified = true;
            prop.verificationStatus = 'verified';
            inMemoryStore.unshift(prop);
            global.pendingInMemoryProperties.splice(pendingIdx, 1);
            console.warn("   ⚠️ No verifiers set. Auto-verifying in-memory property.");
            twiml.message(`Thanks for choosing Lampose! Your property "${prop.name}" is verified and listed successfully.`);
          }
        } else if (textBody === 'no' || textBody === 'n') {
          prop.isVerified = false;
          prop.verificationStatus = 'rejected';
          global.pendingInMemoryProperties.splice(pendingIdx, 1);
          twiml.message(`Understood. The onboarding request for your property "${prop.name}" has been cancelled. Thank you.`);
        } else {
          twiml.message(`Hello! Please reply with YES to approve the onboarding of "${prop.name}" on Lampose, or NO to reject it.`);
        }

        res.type('text/xml');
        return res.send(twiml.toString());
      }
    }

    // ==================== MONGODB DATABASE MODE ====================

    /* ── Which request did this tap belong to? ────────────────────────────
       The approval buttons carry their own request id (VERIFY_YES:<id>), the
       same way the visit-availability template carries VISIT_YES:<id>.

       Without it the only way to choose a request is "the newest one still
       pending for this number", and WhatsApp keeps every past message's
       buttons live forever — so a tap on an older message silently decided a
       DIFFERENT property, and a second tap on an already-answered message
       landed on the next listing in the queue instead of being refused.

       Messages sent before the tagged templates were approved carry no id.
       Those fall through to the legacy lookups below, unchanged. */
    let tagged = null;
    const taggedMatch = verifyButton.match(/^VERIFY_(?:YES|NO):([0-9A-F]{24})$/);

    if (taggedMatch) {
      tagged = await VerificationRequest.findById(taggedMatch[1].toLowerCase());

      if (!tagged) {
        twiml.message('That onboarding request no longer exists, so nothing has been changed.');
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const isOwnerOfIt = tagged.ownerMobileE164 === senderMobile;
      const isAssignedToIt = tagged.assignedVerifierMobileE164 === senderMobile;

      /* A payload naming a request that belongs to neither role on this
         number. Never act on it — this is the check that makes a forwarded
         message harmless. */
      if (!isOwnerOfIt && !isAssignedToIt) {
        console.warn(`⚠️ [Webhook] ${senderMobile} tapped a button for request ${tagged._id}, which is not theirs.`);
        twiml.message('That onboarding request is not linked to this number, so nothing has been changed.');
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const taggedName = (tagged.pendingPropertyData || {}).name || 'that property';

      /* The point of the id: a decision already made is reported back rather
         than repeated on some other listing. This is what makes the second
         button on an answered message inert. */
      const settled = {
        verified: `"${taggedName}" has already been verified and is live on Lampose. Nothing has been changed.`,
        rejected: `The onboarding request for "${taggedName}" was already cancelled. Nothing has been changed.`,
        verifier_rejected: `"${taggedName}" was already rejected by our verification team. Nothing has been changed.`,
        expired: `The onboarding request for "${taggedName}" has expired, so it can no longer be answered.`,
      }[tagged.status];

      if (settled) {
        console.log(`ℹ️ [Webhook] ${senderMobile} tapped ${verifyButton} on "${taggedName}", already ${tagged.status}.`);
        twiml.message(settled);
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      /* Owner has approved and it is with the team. The owner tapping the
         other button now must not cancel it behind the verifier's back. */
      if (tagged.status === 'owner_approved' && !isAssignedToIt) {
        twiml.message(`You have already approved "${taggedName}". It is with our verification team now, and we will let you know as soon as it is live.`);
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      if (tagged.expiresAt && tagged.expiresAt <= new Date()) {
        tagged.status = 'expired';
        await tagged.save();
        twiml.message(`The onboarding request for "${taggedName}" expired before it was answered. Please ask our team to send it again.`);
        res.type('text/xml');
        return res.send(twiml.toString());
      }
    }

    let verification = null;
    if (isSenderVerifier) {
      if (tagged) {
        /* Only a tap the verifier is actually entitled to make counts as a
           verifier decision; anything else falls through to the owner branch,
           which is the right home for a team member onboarding their own
           property. */
        if (tagged.assignedVerifierMobileE164 === senderMobile && tagged.status === 'owner_approved') {
          verification = tagged;
        }
      } else {
        verification = await VerificationRequest.findOne({
          assignedVerifierMobileE164: senderMobile,
          status: 'owner_approved'
        }).sort({ createdAt: -1 });
      }
    }

    // Case A: Sender is a Verifier and has a request assigned
    if (isSenderVerifier && verification) {
      const pendingProperty = verification.pendingPropertyData;
      const propertyName = pendingProperty ? pendingProperty.name : 'your property';

      if (textBody === 'yes' || textBody === 'y') {
        console.log(`✅ [Verification Approved] Verifier ${senderMobile} approved property: "${propertyName}"`);

        verification.status = 'verified';
        verification.respondedAt = new Date();

        if (pendingProperty) {
          const activePropertyPayload = {
            ...pendingProperty,
            isVerified: true,
            verificationStatus: 'verified'
          };
          const prop = await Property.create(activePropertyPayload);
          console.log(`   ✅ Property "${prop.name}" (ID: ${prop._id}) successfully created in MongoDB.`);

          try {
            const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const websiteUrl = process.env.PRODUCTION_WEBSITE_URL || 'https://lampose.com';
            await twilioClient.messages.create({
              body: `Your property "${prop.name}" has been successfully verified! You can check it live on our website: ${websiteUrl}`,
              from: process.env.TWILIO_WHATSAPP_FROM,
              to: verification.ownerMobileE164
            });
            console.log(`   📤 Verification success SMS sent to owner: ${verification.ownerMobileE164}`);
          } catch (smsErr) {
            console.error('   ❌ Error sending verification success SMS to owner:', smsErr.message);
          }
        }

        await verification.save();
        twiml.message(`Thank you! Property "${propertyName}" has been verified and listed live successfully.`);
      } else if (textBody === 'no' || textBody === 'n') {
        console.log(`❌ [Verification Rejected] Verifier ${senderMobile} rejected property: "${propertyName}"`);

        verification.status = 'verifier_rejected';
        verification.respondedAt = new Date();

        if (pendingProperty) {
          const cloudinary = require('cloudinary').v2;
          cloudinary.config({
            // Credentials come from .env only — the hardcoded fallbacks that
            // used to sit here were committed secrets. Missing config makes
            // the destroy call fail, which the try/catch below already eats.
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
          });
          const getPublicIdFromUrl = (url) => {
            if (!url || !url.includes('cloudinary.com')) return null;
            try {
              const parts = url.split(/\/image\/upload\/v\d+\/|\/image\/upload\//);
              if (parts.length > 1) {
                const relativePath = parts[1];
                const dotIdx = relativePath.lastIndexOf('.');
                return dotIdx !== -1 ? relativePath.substring(0, dotIdx) : relativePath;
              }
              return null;
            } catch (err) {
              return null;
            }
          };
          const imageUrls = pendingProperty.images || (pendingProperty.imageUrl ? [pendingProperty.imageUrl] : []);
          for (const imgUrl of imageUrls) {
            const pubId = getPublicIdFromUrl(imgUrl);
            if (pubId) {
              try { await cloudinary.uploader.destroy(pubId); } catch (e) {}
            }
          }

          try {
            const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            await twilioClient.messages.create({
              body: `We regret to inform you that your onboarding request for "${pendingProperty.name}" has been rejected by our verification team.`,
              from: process.env.TWILIO_WHATSAPP_FROM,
              to: verification.ownerMobileE164
            });
          } catch (smsErr) {
            console.error('   ❌ Error sending rejection SMS to owner:', smsErr.message);
          }
        }

        await verification.save();
        twiml.message(`Understood. Onboarding request for "${propertyName}" has been rejected and cancelled.`);
      } else {
        twiml.message(`Hello! Please reply with YES to approve "${propertyName}" or NO to reject.`);
      }

      res.type('text/xml');
      return res.send(twiml.toString());
    } else {
      // Case B: Sender is the Property Owner
      // A tagged tap names its own request; only an untagged one has to guess
      // at the newest still-open submission for this number.
      verification = tagged || await VerificationRequest.findOne({
        ownerMobileE164: senderMobile,
        status: { $in: ['pending', 'sent', 'failed'] }
      }).sort({ createdAt: -1 });

      if (!verification) {
        console.warn(`⚠️ No active pending verification request found for owner: ${senderMobile}`);
        twiml.message("Hello from Lampose! We couldn't find any pending onboarding request for this number.");
        res.type('text/xml');
        return res.send(twiml.toString());
      }

      const pendingProperty = verification.pendingPropertyData;
      const propertyName = pendingProperty ? pendingProperty.name : 'your property';

      if (textBody === 'yes' || textBody === 'y') {
        console.log(`✅ [Owner Approved] Owner approved onboarding of property: "${propertyName}"`);

        verification.status = 'owner_approved';
        
        if (verifierNumbers.length > 0) {
          const randomVerifier = verifierNumbers[Math.floor(Math.random() * verifierNumbers.length)];
          verification.assignedVerifierMobileE164 = randomVerifier;

          const { sendTeamVerificationMessage } = require('../../infrastructure/twilio/twilio');
          console.log(`   ⏳ Forwarding verification to team member: ${randomVerifier}...`);
          await sendTeamVerificationMessage(
            randomVerifier,
            pendingProperty.ownerName,
            pendingProperty.ownerMobile,
            pendingProperty.name,
            // Snapshot + token build the maps and review links; the id rides
            // in the button payloads so the verifier's tap names this exact
            // property rather than whichever is newest in their queue.
            {
              property: pendingProperty,
              token: verification.token,
              requestId: String(verification._id),
            }
          );
          
          twiml.message("Thanks for the Confirmation, Our Verification team will process Your Request and send you the confirmation after its verify.");
        } else {
          console.warn('   ⚠️ No verification team numbers found. Auto-verifying property...');
          verification.status = 'verified';
          verification.respondedAt = new Date();

          if (pendingProperty) {
            const activePropertyPayload = {
              ...pendingProperty,
              isVerified: true,
              verificationStatus: 'verified'
            };
            const prop = await Property.create(activePropertyPayload);
            console.log(`   ✅ Property "${prop.name}" (ID: ${prop._id}) successfully created in MongoDB.`);
          }

          twiml.message(`Thanks for choosing Lampose! Your property "${propertyName}" is verified and listed successfully.`);
        }

        await verification.save();
      } else if (textBody === 'no' || textBody === 'n') {
        console.log(`❌ [Owner Rejected] Owner rejected onboarding of property: "${propertyName}"`);

        if (pendingProperty) {
          const cloudinary = require('cloudinary').v2;
          cloudinary.config({
            // Credentials come from .env only — the hardcoded fallbacks that
            // used to sit here were committed secrets. Missing config makes
            // the destroy call fail, which the try/catch below already eats.
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET
          });
          const getPublicIdFromUrl = (url) => {
            if (!url || !url.includes('cloudinary.com')) return null;
            try {
              const parts = url.split(/\/image\/upload\/v\d+\/|\/image\/upload\//);
              if (parts.length > 1) {
                const relativePath = parts[1];
                const dotIdx = relativePath.lastIndexOf('.');
                return dotIdx !== -1 ? relativePath.substring(0, dotIdx) : relativePath;
              }
              return null;
            } catch (err) {
              return null;
            }
          };
          const imageUrls = pendingProperty.images || (pendingProperty.imageUrl ? [pendingProperty.imageUrl] : []);
          for (const imgUrl of imageUrls) {
            const pubId = getPublicIdFromUrl(imgUrl);
            if (pubId) {
              try { await cloudinary.uploader.destroy(pubId); } catch (e) {}
            }
          }
        }

        verification.status = 'rejected';
        verification.respondedAt = new Date();
        await verification.save();

        twiml.message(`Understood. The onboarding request for your property "${propertyName}" has been cancelled. Thank you.`);
      } else {
        console.log(`ℹ️ [Unrecognized Reply] Owner replied with: "${Body}"`);
        twiml.message(`Hello! Please reply with YES to approve the onboarding of "${propertyName}" on Lampose, or NO to reject it.`);
      }

      res.type('text/xml');
      return res.send(twiml.toString());
    }
  } catch (error) {
    console.error('❌ [Twilio Webhook Exception Error]:', error.message || error);
    res.type('text/xml');
    return res.send(twiml.toString());
  }
});

module.exports = router;
