import React, { useState, useEffect } from 'react';
import { Navbar } from './components/common/organisms/Navbar';
import { HeroSlider } from './components/listings/organisms/HeroSlider';
import { CategorySelector } from './components/onboard/organisms/CategorySelector';
import { BasicDetailsStep } from './components/onboard/organisms/BasicDetailsStep';
import { CategoryFieldsStep } from './components/onboard/organisms/CategoryFieldsStep';
import { PricingAmenitiesStep } from './components/onboard/organisms/PricingAmenitiesStep';
import { FormSuccessModal } from './components/onboard/organisms/FormSuccessModal';
import { AddLeadForm } from './components/leads';
import { RestaurantOnboardForm } from './components/restaurant';
import { AuthScreen } from './components/auth/organisms/AuthScreen';
import { SessionExpiredDialog } from './components/common/organisms/SessionExpiredDialog';
import { FilterBar } from './components/listings/molecules/FilterBar';
import { PropertyCard } from './components/listings/organisms/PropertyCard';
import { PropertyDetailModal } from './components/listings/organisms/PropertyDetailModal';
import {
  deleteProperty,
  fetchProperties,
  onboardProperty,
  uploadPropertyDocuments,
  uploadPropertyImages,
  uploadSharingImages,
} from './services/api.js';
import { getCurrentUser, logout, getSavedEmployeeEmail } from './services/auth.js';
import { validateOnboarding, firstErrorKey, anchorFor } from './services/validation.js';
import { readPin, splitAddress } from './services/mapLink.js';
import { PlusCircle, AlertCircle, Building2, Loader2, CloudUpload, Database, ShieldAlert, WifiOff } from 'lucide-react';
import { INITIAL_FORM_STATE } from './components/onboard/utils/initialFormState';
import { tenantList } from './components/onboard/utils/categoryFieldOptions';
import { Box, ContentInfo, Form, Heading, Inline, Main, PlainButton, Strong, Text } from './components/common/atoms';


export function App() {
  // Authentication State
  const [user, setUser] = useState(getCurrentUser());
  /*
   * A `401` was seen and the session is dead, but NOT yet cleared — the
   * dialog below is on screen and waiting for the Logout click rather than
   * signing the agent out from underneath them mid-action. Set by the
   * `api:unauthorized` listener just below, which `services/api.js`'s
   * response interceptor dispatches on any unauthorised response (other than
   * the sign-in call itself — see the comment there).
   */
  const [sessionExpired, setSessionExpired] = useState(false);

  const [activeTab, setActiveTab] = useState('listings'); // 'listings' | 'onboard' | 'leads' | 'restaurant'
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Form State
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState('');
  /* Why the last submit did not save. Held in state rather than thrown at an
     alert(): an alert is gone the moment it is dismissed, and the thing it was
     explaining — a backend that is not running — is still true afterwards. */
  const [submitError, setSubmitError] = useState(null);
  const [recentlyOnboarded, setRecentlyOnboarded] = useState(null);

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('mine'); // 'mine' | 'all'

  // Modal State
  const [activeModalProperty, setActiveModalProperty] = useState(null);

  /*
   * The bridge from the axios interceptor to this component's state.
   *
   * `services/api.js` cannot call `setUser`/`setSessionExpired` itself — it is
   * a plain module, not a component — so it dispatches a `window` event
   * instead and this is the only place that listens for it. Added/removed on
   * every mount rather than once at import time so a hot reload during
   * development can't leave a stale closure attached.
   */
  useEffect(() => {
    const onUnauthorized = () => setSessionExpired(true);
    window.addEventListener('api:unauthorized', onUnauthorized);
    return () => window.removeEventListener('api:unauthorized', onUnauthorized);
  }, []);

  /**
   * Called by the dialog's Logout button (and by dismissing it any other
   * way — see `SessionExpiredDialog`, which treats a backdrop click and
   * Escape as the same action). Does the full job: clears storage AND resets
   * the `user` state that actually controls what's on screen, then lowers the
   * flag so the dialog does not simply reopen on the next render.
   */
  const handleLogout = () => {
    logout();
    setUser(null);
    setSessionExpired(false);
  };

  /*
   * Fetch the listings, and say what actually went wrong when it fails.
   *
   * This used to answer every failure with "ensure Node server is running",
   * which is the one explanation the agent cannot act on when it is not true
   * — and it usually is not. `services/api.js` already classifies the failure
   * (`kind`, `status`, and the server's own `message`) precisely so this does
   * not have to guess; the old line threw all of it away and guessed anyway.
   *
   * The case it hid most often is an EXPIRED SESSION. The token lasts seven
   * days, the header goes on showing the agent's name after it has lapsed, and
   * every request comes back 401. That case is no longer handled HERE at all:
   * the response interceptor in api.js already dispatched `api:unauthorized`
   * before this promise even resolved, which is what raises the "Session
   * expired" dialog above whatever is on screen. This function's own 401
   * branch only has to stop the spinner and stay quiet — painting a "could not
   * load listings" banner underneath a dialog that already explains what
   * happened would just be a second, worse-worded copy of the same message.
   */
  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await fetchProperties();

    if (res && res.data) {
      setProperties(res.data);
      setLoading(false);
      return;
    }

    if (res?.status === 401) {
      setLoading(false);
      return;
    }

    setErrorMsg(
      res?.kind === 'network'
        ? res.error
        : res?.message || res?.error || 'Could not load listings.',
    );
    setLoading(false);
  };

  useEffect(() => {
    if (user && activeTab === 'listings') {
      loadData();
    }
  }, [user, activeTab]);

  // When employee logs in, attach employeeEmail (keep ownerName and ownerMobile clean for actual landlord/owner)
  useEffect(() => {
    const activeEmail = user?.email || getSavedEmployeeEmail() || '';
    if (activeEmail) {
      setFormData(prev => ({
        ...prev,
        employeeEmail: activeEmail
      }));
    }
  }, [user]);

  // Compute stats for header badges
  const categoryCounts = properties.reduce((acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  }, {});

  // Handle Form Basic Changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  // Handle Category Selection & Set Defaults
  const handleCategorySelect = (cat) => {
    let defaultCategoryDetails = {};
    if (cat === 'PG_HOSTEL') {
      /* The union of what PG and hostel each used to seed. An agent clears
         what does not apply — a hostel with no mess unticks the canteen —
         which is faster than an empty form, and every key here is one the
         merged fields step renders. */
      defaultCategoryDetails = {
        foodIncluded: true,
        foodType: 'Both (Veg & Non-Veg)',
        mealsProvided: ['Breakfast', 'Lunch', 'Dinner'],
        mealTimings: {
          Breakfast: '7:30 AM - 9:30 AM',
          Lunch: '12:30 PM - 2:30 PM',
          Dinner: '8:00 PM - 10:00 PM'
        },
        sharingTypes: ['Single', '2 Sharing'],
        customSharingTypes: [],
        sharingPrices: {},
        sharingBeds: {},
        sharingAC: {},
        sharingAcPrices: {},
        curfewTime: '10:30 PM',
        housekeeping: true,
        hostelType: 'Boys Hostel',
        canteenFacility: true,
        wardenContact: formData.ownerMobile || '',
        securityCCTV: true,
        studyRoom: true
      };
    } else if (cat === 'HOTEL') {
      defaultCategoryDetails = {
        /* Occupancies offered, each priced in `sharingPrices` — the same map
           the PG sharing options and the bachelor layouts use, so a priced bed
           becomes a bookable option everywhere. Distinct from `bedType`, which
           is the physical format of the bed. */
        bedTypes: ['Single'],
        /* Bed types an agent typed in. The presets cover the common
           cases and never all of them — a six-bed dorm, a family room. */
        customBedTypes: [],
        /* Beds and rates are per bed type. `sharingBeds` is the claimable
           count the request flow decrements; the three rate structures are
           priced separately because a hostel sells the same bed nightly to a
           traveller and monthly to a student. */
        sharingBeds: {},
        sharingPrices: {},
        sharingAC: {},
        sharingAcPrices: {},
        monthlyPrices: {},
        monthlyAcPrices: {},
        flexiblePrices: {},
        flexibleAcPrices: {},
        /* Derived from the above in handleCategoryDetailChange, and kept only
           so the listing formatter and the admin console keep working. */
        totalBeds: 0,
        rateType: 'Daily Rate',
        lockersAvailable: true
        /* No checkInTime or checkOutTime: those are the guest's dates, chosen
           when booking, not a fact the owner records once about the building.
           Seeding them would put a value on every hotel that no agent could
           change — the same trap as `lockersAvailable` above. */
      };
    } else if (cat === 'BACHELOR' || cat === 'COLIVE') {
      /* Co-live is let as a whole property like a bachelor flat and records
         the same facts, so it seeds from the same defaults. */
      defaultCategoryDetails = {
        /* Layouts are multi-select now, and each carries its own rent in
           `sharingPrices` — the same map the PG sharing options use, so a
           layout priced here becomes a bookable option everywhere. Seeded
           with one selected so the rent box is visible immediately. */
        roomTypes: [cat === 'COLIVE' ? '2 BHK' : '1 BHK'],
        roomType: cat === 'COLIVE' ? '2 BHK' : '1 BHK',
        /* Layouts an agent typed in — a 4 BHK villa, a penthouse. */
        customRoomTypes: [],
        sharingPrices: {},
        /* Counts, so a building with three 1 BHKs is not filed as having one.
           `sharingBeds` is kept in step — a whole flat is one lettable unit,
           so beds equal the count. */
        sharingRooms: {},
        sharingBeds: {},
        /* Furnishing is per layout: the same house lets a semi-furnished 1 BHK
           and a fully-furnished 2 BHK. The flat `furnishing` and
           `furnishingItems` below are derived from these and kept only so the
           screens that read them keep working. */
        furnishingByLayout: { [cat === 'COLIVE' ? '2 BHK' : '1 BHK']: 'Semi-Furnished' },
        furnishingItemsByLayout: {},
        /* Who may take it, and whether it has a kitchen, are per layout too:
           a building commonly lets its 1 RKs to men and its 2 BHKs to women.
           The flat fields below are derived summaries.

           Tenants are a LIST per layout — several answers are commonly all
           true at once — seeded with the one the category implies. Rows
           written before it was a list carry a bare string, which every
           reader still accepts; see `tenantList` in categoryFieldOptions.js. */
        allowedTenantsByLayout: {
          [cat === 'COLIVE' ? '2 BHK' : '1 BHK']: [
            cat === 'COLIVE' ? 'Bachelors Male / Female' : 'Bachelors Male Only',
          ],
        },
        kitchenByLayout: { [cat === 'COLIVE' ? '2 BHK' : '1 BHK']: true },
        furnishing: 'Semi-Furnished',
        /* Seeded empty rather than pre-ticked: "Semi-Furnished" means
           something different to every owner, and a pre-ticked list would be
           the form answering for them. */
        furnishingItems: [],
        customFurnishingItems: [],
        /* A bachelor let is single-gender by definition, so the mixed option
           is not offered for it and cannot be the default. The flat field is
           the union across layouts, so it is a list like the per-layout one. */
        allowedTenants: [cat === 'COLIVE' ? 'Bachelors Male / Female' : 'Bachelors Male Only'],
        kitchenAvailable: true,
        waterSupply: '24 Hours'
      };
    } else if (cat === 'COMMERCIAL') {
      /*
       * Only the answers that have a safe default.
       *
       * Bare shell is seeded because it is what most commercial units are
       * handed over as, and a private washroom because a unit with none is the
       * exception worth correcting. Everything the FORM marks required —
       * suitable-for, area, floor — is deliberately left empty: seeding
       * "Ground floor" would put a fact on the listing that no agent chose,
       * and a wrong floor is not something a photograph corrects later.
       */
      defaultCategoryDetails = {
        commercialUses: [],
        builtUpArea: '',
        floor: '',
        commercialFurnishing: 'Bare shell',
        washroom: 'Private washroom',
        parking: 'No parking',
      };
    }

    setFormData(prev => ({
      ...prev,
      category: cat,
      /* Bachelor and co-live take their amenities from the furnishing list, so
         they start empty rather than at the four this form seeds for everyone
         else — an untouched default would claim food and a water purifier on a
         flat that has neither. */
      /* Bachelor and co-live take their amenities from the furnishing list;
         a hotel has no amenity list at all. Either way they start empty rather
         than at the four this form seeds for everyone else — an untouched
         default would claim food and a water purifier on a property that has
         neither, and no agent could correct it. */
      /* COMMERCIAL joins them for the same reason and a sharper one: the four
         seeded amenities are Food, RO Water and the like, and a shop claiming
         food is not a default anybody would notice was wrong. */
      amenities: ['BACHELOR', 'COLIVE', 'HOTEL', 'COMMERCIAL'].includes(cat) ? [] : prev.amenities,
      stayType: (cat === 'BACHELOR' || cat === 'COLIVE')
        ? ''
        /* A hotel quotes by the night, so it opens on the short-stay path
           rather than inheriting whatever the previous category was on. A shop
           is the mirror: monthly, always, so it is pinned to Long Stay rather
           than inheriting a Short Stay left behind by a hotel. */
        : (cat === 'HOTEL'
          ? 'Short Stay'
          : (cat === 'COMMERCIAL' ? 'Long Stay' : (prev.stayType || 'Long Stay'))),
      categoryDetails: defaultCategoryDetails
    }));
  };

  // Handle Category Details Field Changes
  const handleCategoryDetailChange = (field, value) => {
    /* Clear the messages this edit could have answered, so a corrected sharing
       rent stops shouting the moment it is typed rather than at the next
       submit. Prices are keyed per option, so the whole `sharingPrice:` family
       is cleared and re-derived by the next validation pass. */
    setFormErrors(prev => {
      const next = { ...prev };
      delete next[`categoryDetails.${field}`];
      if (['sharingPrices', 'sharingAcPrices', 'sharingTypes', 'sharingAC'].includes(field)) {
        Object.keys(next).forEach((key) => {
          if (key.startsWith('sharingPrice:') || key.startsWith('sharingAcPrice:')) delete next[key];
        });
        delete next['categoryDetails.sharingTypes'];
      }
      if (field === 'mealsProvided' || field === 'foodIncluded') {
        delete next['categoryDetails.mealsProvided'];
      }
      return next;
    });

    setFormData(prev => {
      const updatedDetails = {
        ...prev.categoryDetails,
        [field]: value
      };

      const extraFields = {};

      /*
       * Furnishing is recorded per LAYOUT, and rolled up here.
       *
       * A house lets a semi-furnished 1 BHK and a fully-furnished 2 BHK, so
       * `furnishingByLayout` and `furnishingItemsByLayout` are the truth. But
       * the listing card, the admin console and the owner's app all read the
       * flat `furnishing` and `furnishingItems`, and rewriting every one of
       * them to walk a map would be a lot of churn for a summary. So the
       * summary is derived and written alongside.
       *
       * `furnishing` reads "Mixed" when the layouts genuinely disagree, which
       * is the honest answer — better than picking one flat's status and
       * presenting it as the building's.
       *
       * `furnishingItems` is the union, and for these two categories it is
       * also the amenity list: the general picker is hidden for them, so
       * without this `amenities` would sit at whatever it was seeded with and
       * no agent could change it.
       */
      /*
       * A hotel's beds and rate structures are per bed type, and rolled up
       * here for the readers that expect the flat fields.
       *
       * `totalBeds` is the sum, because the building really does have that
       * many. `rateType` is what `listing.formatter.isDaily()` reads to decide
       * whether the listing quotes by the night, so it names whichever
       * structure is actually priced — nightly first, since that is the one
       * the form requires and the one a hotel leads with.
       */
      if (prev.category === 'HOTEL'
        && ['bedTypes', 'sharingBeds', 'sharingPrices', 'monthlyPrices', 'flexiblePrices'].includes(field)) {
        const beds = Array.isArray(updatedDetails.bedTypes) ? updatedDetails.bedTypes : [];
        const bedMap = updatedDetails.sharingBeds || {};

        const total = beds.reduce((sum, b) => sum + (Number(bedMap[b]) || 0), 0);

        const priced = (map) => beds.some(b => Number((updatedDetails[map] || {})[b]) > 0);
        updatedDetails.totalBeds = total;
        updatedDetails.rateType = priced('sharingPrices')
          ? 'Daily Rate'
          : (priced('monthlyPrices') ? 'Monthly Rate' : 'Flexible (Hourly/Daily)');
      }

      if (['furnishingByLayout', 'furnishingItemsByLayout', 'allowedTenantsByLayout',
        'kitchenByLayout', 'roomTypes'].includes(field)
        && (prev.category === 'BACHELOR' || prev.category === 'COLIVE')) {
        const layouts = Array.isArray(updatedDetails.roomTypes) ? updatedDetails.roomTypes : [];
        const byLayout = updatedDetails.furnishingByLayout || {};
        const itemsByLayout = updatedDetails.furnishingItemsByLayout || {};
        const tenantsByLayout = updatedDetails.allowedTenantsByLayout || {};
        const kitchenByLayout = updatedDetails.kitchenByLayout || {};

        /*
         * These four summaries go into `updatedDetails`, NOT `extraFields`.
         *
         * `extraFields` is spread over the TOP LEVEL of the form, which is
         * right for a top-level column like `rent` and wrong for anything the
         * listing reads out of `categoryDetails`. They were written to
         * `extraFields` here, and the consequence was silent in a way worth
         * spelling out: `property.model.js` is `strict: true` and has no
         * `allowedTenants` column, so the derived value was dropped by
         * mongoose on arrival, while `categoryDetails.allowedTenants` kept the
         * value SEEDED when the category was picked. A co-live flat let to a
         * family was stored, listed and shown to renters as "Bachelors Male /
         * Female" — the seed — no matter what the agent chose in the dropdown.
         *
         * The hotel block above already writes its summaries to
         * `updatedDetails` for this reason.
         *
         * `amenities` is the exception and stays in `extraFields`: that one IS
         * a top-level column (`amenities: [String]`), and the general amenity
         * picker is hidden for these two categories, so without this line it
         * would sit at whatever it was seeded with and no agent could change
         * it.
         */
        const levels = [...new Set(layouts.map(l => byLayout[l]).filter(Boolean))];
        updatedDetails.furnishing = levels.length === 1 ? levels[0] : (levels.length ? 'Mixed' : '');

        const union = [...new Set(layouts.flatMap(l => itemsByLayout[l] || []))];
        updatedDetails.furnishingItems = union;
        extraFields.amenities = union;

        /*
         * The union, not "Mixed".
         *
         * This used to collapse to the word 'Mixed' the moment two layouts
         * disagreed, which threw away the only thing a renter wanted from it.
         * A building letting its 1 BHKs to men and its 2 BHKs to families is
         * let to men and to families — both, said plainly — and now that each
         * layout holds a LIST the union is the honest summary of the lot.
         *
         * `tenantList` rather than a bare read, because a row onboarded before
         * the control became multi-select holds one string per layout.
         */
        const tenants = [...new Set(layouts.flatMap(l => tenantList(tenantsByLayout[l])))];
        updatedDetails.allowedTenants = tenants;

        /* `some` rather than `every`, because this summary answers "does this
           building have kitchen-equipped units". A property with three
           kitchens and one without would otherwise be listed as having none,
           which is the more misleading of the two — and the per-layout truth
           is right there for anybody choosing a flat. */
        updatedDetails.kitchenAvailable = layouts.some(l => kitchenByLayout[l] !== false);
      }

      if (['sharingPrices', 'sharingAcPrices', 'sharingTypes', 'roomTypes', 'bedTypes'].includes(field)) {
        // The headline rate is the cheapest way into the property, across both
        // the non-AC and AC price of every option still selected.
        //
        // Three lists, because three shapes of property. A PG offers
        // occupancies (`sharingTypes`); a bachelor flat or co-live house
        // offers layouts (`roomTypes`); a hotel or dormitory offers bed types
        // (`bedTypes`). All three price into `sharingPrices`, so only the list
        // of what is currently selected differs.
        const selectedTypes = [
          updatedDetails.sharingTypes,
          updatedDetails.roomTypes,
          updatedDetails.bedTypes,
        ].find(list => Array.isArray(list) && list.length) || [];

        const prices = [updatedDetails.sharingPrices, updatedDetails.sharingAcPrices]
          .flatMap(priceMap => selectedTypes.map(type => Number((priceMap || {})[type])))
          .filter(p => !isNaN(p) && p > 0);

        /* A hotel quotes by the night, so its cheapest rate is a DAILY price.
           Writing it to `monthlyPrice` would put ₹450 where the site expects a
           month's rent and advertise a hotel as the cheapest home in the
           city. */
        const nightly = prev.category === 'HOTEL' && prev.stayType === 'Short Stay';
        const priceField = nightly ? 'dailyPrice' : 'monthlyPrice';

        if (prices.length > 0) {
          const minPrice = Math.min(...prices);
          extraFields[priceField] = minPrice;
          extraFields.rent = minPrice;
        } else {
          extraFields[priceField] = '';
          extraFields.rent = '';
        }
      }

      return {
        ...prev,
        categoryDetails: updatedDetails,
        ...extraFields
      };
    });
  };


  /**
   * Submit — but only if the form is actually a property.
   *
   * The order here is the whole point of this function. Validation runs FIRST
   * and returns on any failure, so an incomplete form never reaches the photo
   * upload and never reaches the database. Before this, the only checks were
   * four `.trim()` tests, so a listing with a nine-digit owner number, a ₹0
   * rent or no sharing prices at all was uploaded to Cloudinary and POSTed —
   * and the only sign anything was wrong was a red line in the console.
   */
  const handleSubmitForm = async (e) => {
    e.preventDefault();

    // A fresh attempt: whatever the last one failed on is no longer the story.
    setSubmitError(null);

    const errs = validateOnboarding(formData);
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);

      /* Land the user on the first problem in page order, not in object-key
         order. On a form this long an un-scrolled error is an invisible one,
         and the button appears to do nothing. */
      const targetId = anchorFor(firstErrorKey(errs));
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus the input directly so the user can start correcting it
          if (typeof el.focus === 'function') el.focus({ preventScroll: true });
        }
      }
      return;
    }

    setFormErrors({});
    setSubmitting(true);
    setSubmitStage('Preparing property photos...');

    /* Photos upload before the property is created, so a failure during that
       phase leaves nothing behind and is safe to retry. Once the POST has
       been issued that stops being true. */
    let saveAttempted = false;

    try {
      const localImages = Array.isArray(formData.localImages) ? formData.localImages : [];

      /* Photos go through the one API caller, which owns the base URL, the
         batch-then-single fallback and the ordering rules. This block used to
         re-derive its own endpoints from a second copy of VITE_API_URL. */
      const finalUrls = await uploadPropertyImages(localImages, setSubmitStage);

      // If no photos were chosen, apply default brand splash fallback
      const resolvedImages = finalUrls.length > 0 ? finalUrls : ['/lampose-logo-splash.png'];

      /*
       * Hotel paperwork, uploaded the same way and sent TOP-LEVEL.
       *
       * Not inside `categoryDetails`: the public listing API returns that
       * object verbatim, so a PAN filed there would be served to anybody
       * browsing the site. Nothing in the public projection touches
       * `documents`.
       */
      const localDocs = (formData.categoryDetails || {}).localDocuments || {};
      const pendingDocs = Object.entries(localDocs)
        .filter(([, doc]) => doc && doc.file)
        .map(([kind, doc]) => ({ kind, docType: doc.docType || '', file: doc.file }));

      const uploadedDocs = await uploadPropertyDocuments(pendingDocs, setSubmitStage);

      /* Per-layout photos — "1 BHK" and "2 BHK" each get their own set,
         staged under categoryDetails.localSharingImages by CategoryFieldsStep
         and uploaded here the same way the whole-property gallery and the
         hotel documents above already are: to URLs, before the property is
         ever created. */
      const localSharingImages = (formData.categoryDetails || {}).localSharingImages || {};
      const sharingImages = await uploadSharingImages(localSharingImages, setSubmitStage);

      setSubmitStage('Saving accommodation to MongoDB database...');

      const assignedEmail = formData.employeeEmail || user?.email || getSavedEmployeeEmail() || '';

      const payload = {
        ...formData,
        employeeEmail: assignedEmail,
        images: resolvedImages,
        imageUrl: resolvedImages[0] || '/lampose-logo-splash.png',
        documents: uploadedDocs,
      };
      delete payload.localImages;

      /*
       * The one address box, split into the two things that are stored.
       *
       * The form asks for the address in a single field, which an agent may
       * fill with words, a pasted map link, or both. They are separated here
       * rather than on every keystroke, so the box never rearranges itself
       * while somebody is typing in it — the step shows the same split live,
       * from this same function, so nothing about it is a surprise at submit.
       *
       * `address` keeps the words alone: a URL left in it would be printed to
       * a student where the door number belongs.
       */
      const { address, mapLink, pin } = splitAddress(formData.address);
      payload.address = address;
      payload.mapLink = mapLink;

      /* The crosshair's own fix beats one read out of a pasted link — it was
         taken at the doorway. No pin at all is an ABSENT field rather than a
         null one: the backend stores optional GeoJSON, and a null would have
         to be special-cased there to avoid reading as a point with no
         coordinates. */
      const resolvedPin = readPin(formData.location) || pin;
      if (resolvedPin) payload.location = resolvedPin;
      else delete payload.location;

      /* The File objects never leave this device — only the URLs the upload
         returned do. Sending them would put a base64 PAN in the request body
         and in every log that touches it. Same rule for per-layout photos:
         `sharingImages` (the uploaded URLs) replaces `localSharingImages`
         (the staged Files), which never reaches the payload at all. */
      if (payload.categoryDetails) {
        payload.categoryDetails = { ...payload.categoryDetails, sharingImages };
        delete payload.categoryDetails.localDocuments;
        delete payload.categoryDetails.localSharingImages;
      }

      /* Development only. This prints the WHOLE submission — the owner's name
         and mobile number, the agent's email, and every photograph as base64
         — into a browser console on a field agent's laptop, where it stays in
         the session and goes wherever that machine goes. Invaluable while
         building the form, and not something to leave running in the field. */
      if (import.meta.env.DEV) {
        console.log('🚀 [Onboarding Started] Sending payload to backend:', payload);
        console.log(`   👨‍💼 Employee Email: "${assignedEmail}"`);
        console.log(`   📸 Images Array (${resolvedImages.length}):`, resolvedImages);
      }

      /* From this line on, a failure is AMBIGUOUS: the request is in flight
         and the server may complete it whatever the browser goes on to see. */
      saveAttempted = true;
      const response = await onboardProperty(payload);

      if (import.meta.env.DEV) console.log('📥 [Onboarding Response]:', response);

      if (response && response.success) {
        if (import.meta.env.DEV) console.log('✅ [Onboarding Success] Saved property:', response.data);
        // Redirect directly to Listings page and reload
        setActiveTab('listings');
        const activeEmpEmail = user?.email || getSavedEmployeeEmail() || '';
        setFormData({
          ...INITIAL_FORM_STATE,
          employeeEmail: activeEmpEmail
        });
        setFormErrors({});
        setSubmitError(null);
        loadData();
      } else {
        console.error('❌ [Onboarding Error]:', response?.kind, response?.error || response?.message);
        const reason = response?.error || response?.message || '';

        /* Three outcomes, and they are not interchangeable to the person
           standing in a building with the owner waiting.

           'server'  the API answered and refused. Their problem to fix, and
                     the server's own words are the useful ones.
           timeout /
           network   NO answer came back. This does NOT mean nothing
                     happened: POST /properties only replies after the
                     backend has handed the owner's approval message to
                     Twilio, so a lost answer usually means the property IS
                     saved and the owner HAS been messaged. Telling them
                     "nothing was saved, press Submit again" is what creates
                     a duplicate listing and a second WhatsApp to the owner. */
        if (response?.kind === 'timeout' || response?.kind === 'uncertain') {
          setSubmitError({
            kind: 'uncertain',
            title: 'No answer from the server — this may already have gone through',
            detail:
              'The request was sent but the reply never arrived, so we cannot tell whether it '
              + 'was saved. It often was: the owner may already have the WhatsApp approval. '
              + 'Open Listings and check before submitting again — submitting now can create a '
              + 'second listing and message the owner twice.',
          });
        } else if (response?.kind === 'offline' || response?.kind === 'network') {
          setSubmitError({
            kind: 'offline',
            title: 'Could not reach the Lampose server',
            detail:
              'The server is not answering, so nothing was saved and nothing was lost — '
              + 'everything you typed is still on this page. Check that the backend is '
              + 'running, then press Submit again.',
          });
        } else {
          setSubmitError({
            kind: 'rejected',
            title: 'The server would not accept this property',
            detail: reason || 'The server rejected the request without saying why.',
          });
        }
      }
    } catch (submitErr) {
      console.error('❌ [Submission Exception]:', submitErr);
      setSubmitError(
        saveAttempted
          ? {
            kind: 'uncertain',
            title: 'No answer from the server — this may already have gone through',
            detail:
              'The property was sent but the reply never arrived, so we cannot tell whether it '
              + 'was saved. Open Listings and check before submitting again.',
          }
          : {
            kind: 'offline',
            title: 'The photos did not upload',
            detail:
              'Nothing was saved and nothing was lost — everything you typed is still on this '
              + 'page. Check your connection and press Submit again.',
          },
      );
    } finally {
      setSubmitting(false);
      setSubmitStage('');
    }
  };

  // Handle Delete — the response is returned so the caller can surface a refusal
  // (the backend rejects an employee delete without an approved permission).
  const handleDeleteProperty = async (id) => {
    const res = await deleteProperty(id);
    if (res && res.success) {
      setProperties(prev => prev.filter(p => p._id !== id));
      setActiveModalProperty(null);
    }
    return res;
  };
  // Handle an approved edit landing — keep the grid and the open modal in step
  const handlePropertyUpdated = (updated) => {
    if (!updated || !updated._id) return;
    setProperties(prev => prev.map(p => (p._id === updated._id ? { ...p, ...updated } : p)));
    setActiveModalProperty(prev => (prev && prev._id === updated._id ? { ...prev, ...updated } : prev));
  };

  const activeEmployeeEmail = (user?.email || getSavedEmployeeEmail() || user?.name || '').toLowerCase().trim();

  const isMyProperty = (p, userEmailStr) => {
    if (!userEmailStr) return true;
    const emp = (p.employeeEmail || p.empEmail || '').toLowerCase().trim();
    if (!emp) return false;
    return emp === userEmailStr || emp.includes(userEmailStr) || userEmailStr.includes(emp);
  };

  const myPropertiesCount = properties.filter(p => isMyProperty(p, activeEmployeeEmail)).length;
  const allPropertiesCount = properties.length;

  // If user is not logged in, display full-screen Login Screen first.
  // The dialog is rendered here too, defensively: `sessionExpired` can only
  // become true off a request `handleLogout` hasn't yet answered, and every
  // one of those requires a signed-in `user` (the sign-in/register calls
  // that run while signed OUT are exempted in the interceptor), so this
  // branch should never actually see the flag up. It costs nothing to cover
  // anyway, since the alternative — the flag getting stuck true across a
  // sign-out for some path this reasoning missed — is a dialog that can never
  // be dismissed.
  if (!user) {
    return (
      <>
        <AuthScreen onAuthSuccess={(authUser) => setUser(authUser)} />
        <SessionExpiredDialog open={sessionExpired} onLogout={handleLogout} />
      </>
    );
  }

  // Filtered Properties for Display Page
  const filteredProperties = properties.filter(p => {
    if (ownershipFilter === 'mine' && activeEmployeeEmail) {
      if (!isMyProperty(p, activeEmployeeEmail)) return false;
    }

    const matchesCategory = selectedCategory === 'All' || p.category.toLowerCase() === selectedCategory.toLowerCase();
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      p.name.toLowerCase().includes(q) ||
      p.place.toLowerCase().includes(q) ||
      p.ownerName.toLowerCase().includes(q) ||
      p.ownerMobile.includes(q) ||
      ((p.employeeEmail || p.empEmail) && (p.employeeEmail || p.empEmail).toLowerCase().includes(q))
    );
    return matchesCategory && matchesSearch;
  });

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Navigation with Auth */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        counts={categoryCounts}
        user={user}
        onLogout={handleLogout}
      />

      {/* Main App Workspace */}
      <Main className="main-workspace">
        <Box className="container">

          {/* ==================================================== */}
          {/* TAB 1: EXPLORE LIVE LISTINGS */}
          {/* ==================================================== */}
          {activeTab === 'listings' && (
            <Box className="animate-fade-in">
              {/* Interactive Banner / Carousel */}
              <HeroSlider onCategorySelect={(cat) => {
                setSelectedCategory(cat);
              }} />

              {/* Search & Filter Bar */}
              <FilterBar
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                searchTerm={searchTerm}
                onSearchChange={setSearchTerm}
                totalCount={filteredProperties.length}
                ownershipFilter={ownershipFilter}
                onOwnershipFilterChange={setOwnershipFilter}
                myCount={myPropertiesCount}
                allCount={allPropertiesCount}
                userEmail={activeEmployeeEmail}
              />

              {/* Error Message */}
              {errorMsg && (
                <Box style={{
                  padding: '16px',
                  borderRadius: '16px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#dc2626',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px'
                }}>
                  <AlertCircle size={20} />
                  <Inline>{errorMsg}</Inline>
                </Box>
              )}

              {/* Listings Grid */}
              {loading ? (
                <Box style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
                  <Text style={{ fontSize: '1.1rem' }}>Loading properties from database...</Text>
                </Box>
              ) : filteredProperties.length === 0 ? (
                <Box style={{
                  textAlign: 'center',
                  padding: '60px 20px',
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '1px solid #e2e8f0',
                  color: 'var(--text-muted)'
                }}>
                  <Building2 size={48} style={{ margin: '0 auto 12px', opacity: 0.4, color: '#45855a' }} />
                  <Heading level={3} style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                    {ownershipFilter === 'mine' ? 'No Accommodations Added By You Yet' : 'No Accommodations Found'}
                  </Heading>
                  <Text style={{ fontSize: '0.88rem' }}>
                    {ownershipFilter === 'mine'
                      ? 'You have not onboarded any properties under your account yet. Onboard a property now or explore all platform properties.'
                      : 'Try adjusting your search or category filters, or onboard a new property.'}
                  </Text>
                  <Box style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                    <PlainButton
                      onClick={() => setActiveTab('onboard')}
                      className="btn btn-primary"
                      style={{ padding: '8px 20px' }}
                    >
                      <PlusCircle size={16} />
                      <Inline>Onboard Property</Inline>
                    </PlainButton>
                    {ownershipFilter === 'mine' && (
                      <PlainButton
                        onClick={() => setOwnershipFilter('all')}
                        className="btn btn-secondary"
                        style={{ padding: '8px 20px' }}
                      >
                        <Inline>View All Platform Properties ({allPropertiesCount})</Inline>
                      </PlainButton>
                    )}
                  </Box>
                </Box>
              ) : (
                <Box className="property-grid">
                  {filteredProperties.map(property => (
                    <PropertyCard
                      key={property._id}
                      property={property}
                      onViewDetails={() => setActiveModalProperty(property)}
                    />
                  ))}
                </Box>
              )}
            </Box>
          )}

          {/* ==================================================== */}
          {/* TAB 2: MULTI-STEP ONBOARDING FORM */}
          {/* ==================================================== */}
          {/* ==================================================== */}
          {/* TAB 3: ADD A LEAD BY HAND                            */}
          {/* ==================================================== */}
          {/*
            Signed in only — the route behind the form is the leads panel's
            own, and it identifies the caller to record who brought the lead
            in. An anonymous visitor is sent to sign in rather than shown a
            form that would be refused on submit.
          */}
          {activeTab === 'leads' && (
            <Box className="animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto' }}>
              {user ? (
                <AddLeadForm user={user} />
              ) : (
                <Box style={{
                  background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px',
                  padding: '32px 24px', textAlign: 'center',
                }}>
                  <ShieldAlert size={26} color="#b45309" />
                  <Heading level={2} style={{ fontSize: '1.1rem', fontWeight: 700, color: '#181e1b', margin: '10px 0 6px' }}>
                    Sign in to add a lead
                  </Heading>
                  <Text style={{ color: '#64748b', fontSize: '0.88rem', margin: 0 }}>
                    A lead records who added it, so it needs your account.
                  </Text>
                </Box>
              )}
            </Box>
          )}

          {/*
            RESTAURANT / MEAT CENTRE ONBOARDING.

            Deliberately NOT a category inside the accommodation form above.
            The two forms share a tab bar and nothing else: this one verifies
            the OWNER's mobile with a one-time code, uploads licences against
            that phone proof, and writes a `food_restaurants` document through
            `POST /api/v2/food-partners/applications` — a different collection,
            a different identity system and a different approval queue from a
            property's WhatsApp verification chain.

            It holds its own state and does its own submitting, so signing out
            or switching tabs mid-application loses it. That is the same deal
            the property form offers and is the reason the step rail lets a
            completed step be reopened: the fix for a mistake is going back,
            not starting again.
          */}
          {activeTab === 'restaurant' && (
            <Box className="animate-fade-in">
              <Box style={{ marginBottom: '20px', textAlign: 'center' }}>
                <Heading level={2} style={{ fontSize: 'clamp(1.4rem, 4vw, 1.9rem)', fontWeight: 800, color: 'var(--text-main)' }}>
                  Onboard a Restaurant
                </Heading>
                <Text style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Four steps: the restaurant, its opening hours, its papers, and the contract
                </Text>
              </Box>

              <RestaurantOnboardForm onDone={() => setActiveTab('listings')} />
            </Box>
          )}

          {activeTab === 'onboard' && (
            <Box className="glass-card form-card animate-fade-in" style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 28px' }}>
              <Box style={{ marginBottom: '24px', textAlign: 'center' }}>
                <Heading level={2} style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 800, color: 'var(--text-main)' }}>
                  Onboard Your Accommodation
                </Heading>
                <Text style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Select category, fill specifications, add photos and live in seconds
                </Text>
              </Box>

              <Form onSubmit={handleSubmitForm}>
                {/* Step 1: Category Picker */}
                <CategorySelector
                  selectedCategory={formData.category}
                  onSelectCategory={handleCategorySelect}
                />

                {/* Step 2: Essential Basic Details with Employee Field */}
                <BasicDetailsStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
                  userEmail={user?.email || getSavedEmployeeEmail()}
                />

                {/* Step 3: Dynamic Category-Specified Details */}
                <CategoryFieldsStep
                  category={formData.category}
                  details={formData.categoryDetails}
                  onChangeDetails={handleCategoryDetailChange}
                  errors={formErrors}
                />

                {/* Step 4: Pricing, Stay Types (Short/Long) & Amenities */}
                <PricingAmenitiesStep
                  formData={formData}
                  onChange={handleInputChange}
                  errors={formErrors}
                />

                {/*
                  Why the last press did nothing.

                  The per-field messages are the real answer, but on a form this
                  tall the failing field is usually off screen — so the count
                  goes here, next to the button that refused, and doubles as the
                  way back to it.
                */}
                {Object.keys(formErrors).length > 0 && (
                  <Box
                    role="alert"
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: '10px',
                      padding: '14px 16px', marginBottom: '16px',
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px'
                    }}
                  >
                    <ShieldAlert size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      <Strong style={{ color: '#991b1b', fontSize: '0.9rem' }}>
                        {Object.keys(formErrors).length === 1
                          ? '1 field needs fixing before this can be saved'
                          : `${Object.keys(formErrors).length} fields need fixing before this can be saved`}
                      </Strong>
                      <Text style={{ color: '#b91c1c', fontSize: '0.82rem', margin: '3px 0 0' }}>
                        Nothing has been sent to the database. Each one is marked in red above.
                      </Text>
                      <PlainButton
                        type="button"
                        onClick={() => {
                          const id = anchorFor(firstErrorKey(formErrors));
                          const el = id && document.getElementById(id);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            if (typeof el.focus === 'function') el.focus({ preventScroll: true });
                          }
                        }}
                        style={{
                          marginTop: '8px', padding: 0, background: 'none', border: 'none',
                          color: '#991b1b', fontWeight: 700, fontSize: '0.82rem',
                          textDecoration: 'underline', cursor: 'pointer'
                        }}
                      >
                        Go to the first one
                      </PlainButton>
                    </Box>
                  </Box>
                )}

                {/* The form was valid, the save was attempted, and it failed. */}
                {submitError && (() => {
                  /* 'rejected' is the only red one. The other two are amber:
                     nothing is broken about the property, the network is just
                     in the way — and 'uncertain' in particular must not read
                     as a failure, because the listing has probably been
                     created. */
                  const rejected = submitError.kind === 'rejected';
                  const uncertain = submitError.kind === 'uncertain';
                  const ink = rejected ? '#991b1b' : '#92400e';
                  const inkSoft = rejected ? '#b91c1c' : '#b45309';

                  return (
                    <Box
                      role="alert"
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '14px 16px', marginBottom: '16px',
                        background: rejected ? '#fef2f2' : '#fffbeb',
                        border: `1px solid ${rejected ? '#fecaca' : '#fde68a'}`,
                        borderRadius: '12px'
                      }}
                    >
                      {rejected
                        ? <AlertCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                        : uncertain
                          ? <ShieldAlert size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '1px' }} />
                          : <WifiOff size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '1px' }} />}

                      <Box style={{ flex: 1, minWidth: 0 }}>
                        <Strong style={{ color: ink, fontSize: '0.9rem' }}>
                          {submitError.title}
                        </Strong>
                        <Text style={{ color: inkSoft, fontSize: '0.82rem', margin: '3px 0 0' }}>
                          {submitError.detail}
                        </Text>

                        {/* The way out of an ambiguous save is to LOOK, not to
                            press Submit again. So the only button offered is
                            the one that answers the question. */}
                        {uncertain && (
                          <PlainButton
                            type="button"
                            onClick={() => { setSubmitError(null); setActiveTab('listings'); loadData(); }}
                            className="btn btn-secondary"
                            style={{ marginTop: '10px', fontSize: '0.8rem', padding: '7px 14px', borderRadius: '9px' }}
                          >
                            Open Listings and check
                          </PlainButton>
                        )}
                      </Box>

                      <PlainButton
                        type="button"
                        onClick={() => setSubmitError(null)}
                        aria-label="Dismiss"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}
                      >
                        ✕
                      </PlainButton>
                    </Box>
                  );
                })()}

                {/* Submit Button */}
                <Box style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end', paddingTop: '16px', borderTop: '1px solid var(--border-glass)' }}>
                  <PlainButton
                    type="button"
                    onClick={() => setActiveTab('listings')}
                    className="btn btn-secondary"
                    disabled={submitting}
                  >
                    Cancel
                  </PlainButton>

                  <PlainButton
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                    style={{ padding: '12px 28px', minWidth: '220px' }}
                  >
                    {submitting ? (
                      <Inline style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Loader2 size={18} className="animate-spin" />
                        <Inline>{submitStage || 'Uploading & Saving...'}</Inline>
                      </Inline>
                    ) : (
                      <Inline>Submit & Onboard Property</Inline>
                    )}
                  </PlainButton>
                </Box>
              </Form>
            </Box>
          )}

        </Box>
      </Main>

      {/* Global Cloud Upload & Submission Progress Modal Overlay */}
      {submitting && (
        <Box style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }} className="animate-fade-in">
          <Box style={{
            maxWidth: '440px',
            width: '100%',
            padding: '32px 24px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
            border: '1px solid #e2e8f0'
          }}>
            <Box style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#eaf3ed',
              border: '2px solid #45855a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              color: '#45855a'
            }}>
              <Loader2 size={32} className="animate-spin" />
            </Box>

            <Heading level={3} style={{ fontSize: '1.25rem', fontWeight: 800, color: '#181e1b', marginBottom: '8px' }}>
              Onboarding Property...
            </Heading>
            
            <Text style={{ fontSize: '0.9rem', color: '#45855a', fontWeight: 700, marginBottom: '6px' }}>
              {submitStage || 'Uploading photos to Cloudinary CDN & Saving...'}
            </Text>

            <Inline style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Please do not close this window while images are being saved to cloud storage.
            </Inline>
          </Box>
        </Box>
      )}

      {/* Footer */}
      <ContentInfo style={{
        padding: '16px 0',
        borderTop: '1px solid var(--border-glass)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '0.78rem'
      }}>
        <Box className="container">
          <Text>© 2026 Lampose — Stay. Eat. Deliver. Live Better.</Text>
        </Box>
      </ContentInfo>

      {/* Onboarding Success Modal */}
      {recentlyOnboarded && (
        <FormSuccessModal
          property={recentlyOnboarded}
          onViewListings={() => {
            setRecentlyOnboarded(null);
            setActiveTab('listings');
          }}
          onResetForm={() => {
            const activeEmpEmail = user?.email || getSavedEmployeeEmail() || '';
            setRecentlyOnboarded(null);
            setFormData({
              ...INITIAL_FORM_STATE,
              employeeEmail: activeEmpEmail,
              empEmail: activeEmpEmail
            });
          }}
        />
      )}

      {/* Property Detail Modal */}
      {activeModalProperty && (
        <PropertyDetailModal
          property={activeModalProperty}
          onClose={() => setActiveModalProperty(null)}
          onDelete={handleDeleteProperty}
          onUpdated={handlePropertyUpdated}
        />
      )}

      {/*
        Shown OVER whatever else is on screen the instant a 401 comes back —
        including mid-submit, mid-upload, behind another modal. `user` is
        still non-null here (see the `api:unauthorized` listener above); the
        Logout click is what actually clears the session and swaps this whole
        tree out for `AuthScreen` on the next render.
      */}
      <SessionExpiredDialog open={sessionExpired} onLogout={handleLogout} />
    </Box>
  );
}
