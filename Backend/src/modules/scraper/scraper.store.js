/* ══════════════════════════════════════════════════════════════════════════
   Leads-panel data access: users, scrape jobs, scraped leads.

   Two backends, chosen once at boot and never switched afterwards:

     mongo — the normal path.
     json  — flat files under data/, for running without a cluster.

   The original code fell back from mongo to json the moment the first connect
   attempt failed. That is worse than it looks: a cluster that is briefly
   unreachable at boot sends every subsequent write to a file nobody reads
   again, so the data silently splits in two. Here the mode is fixed by
   configuration, mongo keeps retrying in the background (config/db.js), and
   callers get a clean 503 while it is down.

   Note that this is a different failover from the v1 onboarding routes' one.
   They share a process but not a policy, and deliberately so: the onboarding
   app is a field tool that has to keep accepting input on a bad connection,
   while a lead written to a file the dashboard never reads is just lost work.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const config = require('../../config/env');
const { isScriperUp, isDbUp } = require('../../infrastructure/database/db');
const { User, ScrapeJob, ScrapedLead } = require('./scriper.model');
const { escapeRegex } = require('../../shared/utils/text');

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

const mode = config.storage.mode;
const useMongo = mode === 'mongo';

let localUsers = [];
let localJobs = [];
let localLeads = [];
let localLoaded = false;

const newId = (prefix) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

/* A mongoose Document is not a plain object: spreading one yields its
   internals ($__, _doc, $isNew) rather than its fields, which is how a
   register response ended up shipping nothing useful to the client. Every
   read path below returns lean objects, and creates are converted here. */
const plain = (doc) => (doc && typeof doc.toObject === 'function' ? doc.toObject() : doc);

/* Letters and digits only, folded to lowercase: "VR Executive Boys Hostel SR
   Nagar" and "vr executive boys hostel, sr nagar" are one business. */
const slug = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * The identity of a scraped business.
 *
 * Phone first, because it is the one field a business does not have two of,
 * and the last ten digits make the formats comparable — the same hostel comes
 * back as "+91 7204476336" from one card and "09505189220" from another, and
 * comparing the strings would call those different places.
 *
 * Name plus city is the fallback for a listing with no phone. It is weaker —
 * two "Sri Sai Hostel" in one city would collapse into one — and that is the
 * right way to be wrong here: a missed duplicate costs a rep a wasted call,
 * while a missed lead costs a customer.
 */
const leadDedupeKey = (lead) => {
  const digits = String(lead.phone || '').replace(/\D/g, '');
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  const name = slug(lead.businessName);
  if (!name) return '';
  return `n:${name}|${slug(lead.city)}`;
};

const withoutPassword = (user) => {
  if (!user) return null;
  const { password, __v, ...rest } = plain(user);
  return rest;
};

/* ── Local JSON store ─────────────────────────────────────────────────── */

/* The lead filter, expressed once for each backend. Kept out of `getLeads`
   so the paged read and the count can never disagree about what matches. */
const buildLeadQuery = (filters = {}) => {
  const query = {};
  if (filters.jobId) query.jobId = filters.jobId;
  if (filters.source && filters.source !== 'ALL') query.source = filters.source;
  if (filters.hasPhone === 'true') query.phone = { $nin: ['', null] };
  if (filters.hasWebsite === 'true') query.hasWebsite = true;
  if (filters.assignedUserId) query['assignedTo.userId'] = filters.assignedUserId;
  if (filters.leadStatus && filters.leadStatus !== 'ALL') query.leadStatus = filters.leadStatus;
  if (filters.search) {
    /* User input goes into a RegExp, so regex metacharacters have to be
       neutralised — an unescaped "(" is a syntax error that would surface as
       a 500 on an ordinary search. */
    const regex = new RegExp(escapeRegex(filters.search), 'i');
    query.$or = [
      { businessName: regex },
      { city: regex },
      { category: regex },
      { phone: regex },
      { email: regex },
      { address: regex },
      { landmark: regex },
    ];
  }
  return query;
};

/* The same filter over the flat-file store. `loadLocalData` is called by the
   caller's path already, but repeating it here keeps this usable on its own. */
const filterLocalLeads = (filters = {}) => {
  loadLocalData();
  let results = [...localLeads];
  if (filters.jobId) results = results.filter((l) => l.jobId === filters.jobId);
  if (filters.source && filters.source !== 'ALL') results = results.filter((l) => l.source === filters.source);
  if (filters.hasPhone === 'true') results = results.filter((l) => l.phone && l.phone.trim());
  if (filters.hasWebsite === 'true') results = results.filter((l) => l.hasWebsite || (l.website && l.website.length > 0));
  if (filters.assignedUserId) results = results.filter((l) => l.assignedTo && l.assignedTo.userId === filters.assignedUserId);
  if (filters.leadStatus && filters.leadStatus !== 'ALL') results = results.filter((l) => l.leadStatus === filters.leadStatus);
  if (filters.search) {
    const needle = String(filters.search).toLowerCase();
    const has = (value) => String(value || '').toLowerCase().includes(needle);
    results = results.filter((l) => has(l.businessName) || has(l.city) || has(l.category)
      || has(l.phone) || has(l.email) || has(l.address) || has(l.landmark));
  }
  return results;
};

const DEFAULT_USER_SEEDS = [
  {
    userId: 'user_admin_01',
    name: 'Admin Manager',
    email: 'admin@scriper.com',
    plainPassword: 'admin123',
    role: 'ADMIN',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80',
  },
  {
    userId: 'user_emp_01',
    name: 'John Doe',
    email: 'john@scriper.com',
    plainPassword: 'employee123',
    role: 'EMPLOYEE',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&auto=format&fit=crop&q=80',
  },
  {
    userId: 'user_emp_02',
    name: 'Sarah Connor',
    email: 'sarah@scriper.com',
    plainPassword: 'employee123',
    role: 'EMPLOYEE',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80',
  },
];

/* Hashing three passwords costs about a fifth of a second. Deferred so a
   production boot — which never seeds — does not pay for it. */
const buildDefaultUsers = () => DEFAULT_USER_SEEDS.map(({ plainPassword, ...user }) => ({
  ...user,
  password: bcrypt.hashSync(plainPassword, 10),
}));

const readJson = (file, fallback) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    console.warn(`[store:json] ${path.basename(file)} is unreadable (${error.message}) — starting empty.`);
    return fallback;
  }
};

function saveLocalData() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(USERS_FILE, JSON.stringify(localUsers, null, 2), 'utf8');
    fs.writeFileSync(JOBS_FILE, JSON.stringify(localJobs, null, 2), 'utf8');
    fs.writeFileSync(LEADS_FILE, JSON.stringify(localLeads, null, 2), 'utf8');
  } catch (error) {
    console.error(`[store:json] failed to persist: ${error.message}`);
  }
}

const loadLocalData = () => {
  if (localLoaded) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });

  localUsers = readJson(USERS_FILE, []);
  localJobs = readJson(JOBS_FILE, []);
  localLeads = readJson(LEADS_FILE, []);

  if (localUsers.length === 0 && config.auth.seedDefaultUsers) {
    localUsers = buildDefaultUsers();
  }

  localLoaded = true;
  saveLocalData();
};

/* ── Seeding ──────────────────────────────────────────────────────────── */

let seeded = false;

const seedMongoUsers = async () => {
  if (seeded || !config.auth.seedDefaultUsers) return;
  try {
    if (await User.estimatedDocumentCount() === 0) {
      await User.insertMany(buildDefaultUsers());
      console.log('[store:mongo] seeded the default demo accounts.');
    }
    seeded = true;
  } catch (error) {
    console.warn(`[store:mongo] could not seed default users: ${error.message}`);
  }
};

/* Reports whether an account exists, so server.js can tell an operator
   staring at an empty production database how to create the first one. */
const countUsers = async () => {
  if (!useMongo) {
    loadLocalData();
    return localUsers.length;
  }
  if (!isDbUp()) return null;
  return User.estimatedDocumentCount();
};

const initStore = async () => {
  if (!useMongo) {
    loadLocalData();
    console.log(`[store] leads data → local JSON files (${DATA_DIR})`);
    return;
  }

  console.log('[store] leads data → MongoDB (scriper_* collections)');
  if (isDbUp()) {
    await seedMongoUsers();
  } else {
    /* The connection retries in the background; seed whenever it lands. */
    mongoose.connection.once('connected', () => { seedMongoUsers().catch(() => {}); });
  }
};

/* ── API ──────────────────────────────────────────────────────────────── */

const dbStore = {
  isMongo: () => useMongo,
  isReady: () => isScriperUp(),
  mode: () => mode,

  /* ── Users ── */

  async registerUser({ name, email, password, role = 'EMPLOYEE', avatar }) {
    const cleanEmail = String(email).toLowerCase().trim();
    if (await this.findUserByEmail(cleanEmail)) {
      throw new Error('An account with this email address already exists.');
    }

    const record = {
      userId: newId('user'),
      name: String(name).trim(),
      email: cleanEmail,
      password: bcrypt.hashSync(password, 10),
      role: role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE',
      avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`,
    };

    if (useMongo) {
      return withoutPassword(await User.create(record));
    }

    loadLocalData();
    localUsers.push(record);
    saveLocalData();
    return withoutPassword(record);
  },

  async authenticateUser(email, plainPassword) {
    const user = await this.findUserByEmail(email);
    /* One message for "no such account" and "wrong password" on purpose:
       distinguishing them tells an attacker which addresses are registered. */
    const invalid = new Error('Invalid email or password.');
    if (!user || !user.password) throw invalid;
    if (!bcrypt.compareSync(String(plainPassword), user.password)) throw invalid;
    return withoutPassword(user);
  },

  async findUserByEmail(email) {
    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail) return null;

    if (useMongo) return User.findOne({ email: cleanEmail }).lean();

    loadLocalData();
    return localUsers.find((u) => String(u.email).toLowerCase() === cleanEmail) || null;
  },

  async findUserById(userId) {
    if (!userId) return null;
    if (useMongo) return withoutPassword(await User.findOne({ userId }).lean());

    loadLocalData();
    return withoutPassword(localUsers.find((u) => u.userId === userId));
  },

  async getUsers() {
    if (useMongo) return User.find({}, '-password').sort({ createdAt: 1 }).lean();

    loadLocalData();
    return localUsers.map(withoutPassword);
  },

  async createUser(userData) {
    return this.registerUser(userData);
  },

  async deleteUser(userId) {
    if (useMongo) {
      const result = await User.deleteOne({ userId });
      return result.deletedCount > 0;
    }

    loadLocalData();
    const before = localUsers.length;
    localUsers = localUsers.filter((u) => u.userId !== userId);
    saveLocalData();
    return localUsers.length < before;
  },

  /* Admin-console edit — name/email/role/avatar, and an optional password
     reset. Re-hashes the password the same way registerUser does; every
     other field is written as given. */
  async updateUser(userId, changes = {}) {
    const updates = {};
    if (changes.name !== undefined) updates.name = String(changes.name).trim();
    if (changes.email !== undefined) updates.email = String(changes.email).toLowerCase().trim();
    if (changes.role !== undefined) updates.role = changes.role === 'ADMIN' ? 'ADMIN' : 'EMPLOYEE';
    if (changes.avatar !== undefined) updates.avatar = changes.avatar;
    if (changes.password) updates.password = bcrypt.hashSync(String(changes.password), 10);

    if (useMongo) {
      return withoutPassword(
        await User.findOneAndUpdate({ userId }, updates, { returnDocument: 'after', runValidators: true }).lean(),
      );
    }

    loadLocalData();
    const user = localUsers.find((u) => u.userId === userId);
    if (!user) return null;
    Object.assign(user, updates);
    saveLocalData();
    return withoutPassword(user);
  },

  /* ── Scrape jobs ── */

  async createJob(jobData) {
    const now = new Date().toISOString();
    const job = {
      jobId: jobData.jobId,
      name: jobData.name || 'Scrape Mission',
      source: jobData.source || 'GoogleMaps',
      query: jobData.query || '',
      location: jobData.location || '',
      landmark: jobData.landmark || '',
      depth: jobData.depth || 10,
      status: jobData.status || 'started',
      progress: jobData.progress || 0,
      statusMessage: jobData.statusMessage || 'Job started',
      resultCount: jobData.resultCount || 0,
      createdAt: now,
      updatedAt: now,
    };

    if (useMongo) return plain(await ScrapeJob.create(job));

    loadLocalData();
    localJobs.unshift(job);
    saveLocalData();
    return job;
  },

  async updateJob(jobId, updates) {
    if (useMongo) {
      /* Progress updates fire every couple of seconds from the scraper and
         are never awaited by a request, so a write that fails because the
         cluster blipped must not become an unhandled rejection. */
      try {
        return await ScrapeJob.findOneAndUpdate({ jobId }, updates, { returnDocument: 'after' }).lean();
      } catch (error) {
        console.warn(`[store] job ${jobId} update failed: ${error.message}`);
        return null;
      }
    }

    loadLocalData();
    const index = localJobs.findIndex((j) => j.jobId === jobId);
    if (index === -1) return null;
    localJobs[index] = { ...localJobs[index], ...updates, updatedAt: new Date().toISOString() };
    saveLocalData();
    return localJobs[index];
  },

  async getJob(jobId) {
    if (useMongo) return ScrapeJob.findOne({ jobId }).lean();

    loadLocalData();
    return localJobs.find((j) => j.jobId === jobId) || null;
  },

  async getJobs() {
    if (useMongo) return ScrapeJob.find().sort({ createdAt: -1 }).lean();

    loadLocalData();
    return [...localJobs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  },

  async deleteJob(jobId) {
    if (useMongo) {
      const result = await ScrapeJob.deleteOne({ jobId });
      return result.deletedCount > 0;
    }

    loadLocalData();
    const before = localJobs.length;
    localJobs = localJobs.filter((j) => j.jobId !== jobId);
    saveLocalData();
    return localJobs.length < before;
  },

  /* ── Leads ── */

  /* Every insert carries its dedupe key, whether or not the caller asked for
     deduplication — the key is what the NEXT scrape matches against, so a row
     written without one is a row that will be duplicated later. */
  async saveLeads(leads) {
    if (!Array.isArray(leads) || leads.length === 0) return [];

    const keyed = leads.map((lead) => ({ ...lead, dedupeKey: lead.dedupeKey || leadDedupeKey(lead) }));

    if (useMongo) return (await ScrapedLead.insertMany(keyed)).map(plain);

    loadLocalData();
    const formatted = keyed.map((lead) => ({
      ...lead,
      _id: lead._id || newId('lead'),
      assignedTo: lead.assignedTo || { userId: null, name: null, email: null },
      leadStatus: lead.leadStatus || 'NEW',
      notes: lead.notes || [],
      scrapedAt: lead.scrapedAt || new Date().toISOString(),
    }));
    localLeads.unshift(...formatted);
    saveLocalData();
    return formatted;
  },

  /**
   * Give every stored lead a dedupe key, once.
   *
   * Rows written before this feature existed have no key, so a re-scrape would
   * match none of them and duplicate the lot. Run lazily rather than as a
   * migration the operator has to remember: it is cheap, it only touches rows
   * that are missing a key, and after the first pass it is a single indexed
   * count that finds nothing.
   */
  async backfillDedupeKeys() {
    if (!useMongo) {
      loadLocalData();
      let touched = 0;
      localLeads.forEach((lead) => {
        if (!lead.dedupeKey) {
          lead.dedupeKey = leadDedupeKey(lead);
          touched += 1;
        }
      });
      if (touched) saveLocalData();
      return touched;
    }

    const stale = await ScrapedLead
      .find({ $or: [{ dedupeKey: { $exists: false } }, { dedupeKey: '' }] }, '_id businessName phone city')
      .lean();
    if (stale.length === 0) return 0;

    const writes = stale
      .map((lead) => ({ id: lead._id, key: leadDedupeKey(lead) }))
      .filter((entry) => entry.key)
      .map(({ id, key }) => ({ updateOne: { filter: { _id: id }, update: { $set: { dedupeKey: key } } } }));

    if (writes.length === 0) return 0;
    await ScrapedLead.bulkWrite(writes, { ordered: false });
    return writes.length;
  },

  /**
   * Split a freshly scraped batch into what is new and what we already hold.
   *
   * Two passes, and both are needed: the database is checked for businesses
   * stored by an earlier job, and the batch is checked against ITSELF, because
   * one scroll of Google Maps happily returns the same place twice.
   */
  async filterNewLeads(leads) {
    if (!Array.isArray(leads) || leads.length === 0) return { fresh: [], duplicates: 0 };

    await this.backfillDedupeKeys();

    const keyed = leads.map((lead) => ({ ...lead, dedupeKey: leadDedupeKey(lead) }));
    const keys = [...new Set(keyed.map((lead) => lead.dedupeKey).filter(Boolean))];

    let known = new Set();
    if (keys.length > 0) {
      if (useMongo) {
        const rows = await ScrapedLead.find({ dedupeKey: { $in: keys } }, 'dedupeKey').lean();
        known = new Set(rows.map((row) => row.dedupeKey));
      } else {
        loadLocalData();
        known = new Set(localLeads.map((lead) => lead.dedupeKey || leadDedupeKey(lead)));
      }
    }

    const seen = new Set();
    const fresh = [];
    keyed.forEach((lead) => {
      /* A lead with no usable key — no phone and no name — cannot be matched
         against anything, so it is kept rather than silently dropped. */
      if (!lead.dedupeKey) {
        fresh.push(lead);
        return;
      }
      if (known.has(lead.dedupeKey) || seen.has(lead.dedupeKey)) return;
      seen.add(lead.dedupeKey);
      fresh.push(lead);
    });

    return { fresh, duplicates: leads.length - fresh.length };
  },

  /**
   * One page of leads, newest first.
   *
   * `limit` of 0 means "everything", which is what every caller got before
   * pagination existed and what the CSV export still needs.
   */
  async getLeads(filters = {}, { skip = 0, limit = 0 } = {}) {
    if (useMongo) {
      let cursor = ScrapedLead.find(buildLeadQuery(filters)).sort({ scrapedAt: -1 });
      if (skip > 0) cursor = cursor.skip(skip);
      if (limit > 0) cursor = cursor.limit(limit);
      return cursor.lean();
    }

    const results = filterLocalLeads(filters);
    if (limit > 0) return results.slice(skip, skip + limit);
    return skip > 0 ? results.slice(skip) : results;
  },

  /** How many leads match, ignoring the page — the pager needs the total. */
  async countLeads(filters = {}) {
    if (useMongo) return ScrapedLead.countDocuments(buildLeadQuery(filters));
    return filterLocalLeads(filters).length;
  },

  /* One lead, by id. Needed before an employee's status change is accepted:
     the server has to know who the lead belongs to before it lets them move
     it, and `getLeads` returning an array is the wrong shape for that. */
  async getLeadById(leadId) {
    if (!leadId) return null;

    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(leadId)) return null;
      return ScrapedLead.findById(leadId).lean();
    }

    loadLocalData();
    return localLeads.find((l) => l._id === leadId) || null;
  },

  async assignLeads(leadIds, userObj) {
    const now = new Date().toISOString();
    const assignedTo = { userId: userObj.userId, name: userObj.name, email: userObj.email };

    if (useMongo) {
      /* A malformed id in the list would otherwise abort the whole update
         with a CastError, losing the assignments that were perfectly valid. */
      const valid = leadIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (valid.length === 0) return 0;
      const result = await ScrapedLead.updateMany(
        { _id: { $in: valid } },
        { $set: { assignedTo, assignedAt: now } },
      );
      return result.modifiedCount === undefined ? valid.length : result.modifiedCount;
    }

    loadLocalData();
    let count = 0;
    localLeads.forEach((lead) => {
      if (leadIds.includes(lead._id)) {
        lead.assignedTo = assignedTo;
        lead.assignedAt = now;
        count += 1;
      }
    });
    saveLocalData();
    return count;
  },

  async updateLeadStatus(leadId, status, noteText = '', authorName = 'User', actor = null) {
    const now = new Date().toISOString();
    const note = noteText
      ? { id: newId('note'), text: noteText, authorName, createdAt: now }
      : null;
    /* Stamped whether or not a note was written. A status moved with no note
       is the normal case, and the admin still has to be able to see who moved
       it. */
    const lastActivityBy = {
      userId: (actor && actor.userId) || null,
      name: (actor && actor.name) || authorName || null,
    };

    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(leadId)) return false;
      const update = { $set: { leadStatus: status, lastActivityAt: now, lastActivityBy } };
      if (note) update.$push = { notes: note };
      const result = await ScrapedLead.findByIdAndUpdate(leadId, update, { returnDocument: 'after' }).lean();
      return Boolean(result);
    }

    loadLocalData();
    const lead = localLeads.find((l) => l._id === leadId);
    if (!lead) return false;
    lead.leadStatus = status;
    lead.lastActivityAt = now;
    lead.lastActivityBy = lastActivityBy;
    if (!Array.isArray(lead.notes)) lead.notes = [];
    if (note) lead.notes.unshift(note);
    saveLocalData();
    return true;
  },

  /* Admin-console create — a single lead entered by hand rather than found by
     a scrape job. Thin wrapper so callers don't need to know saveLeads takes
     an array. */
  async createLead(leadData) {
    const [created] = await this.saveLeads([leadData]);
    return created || null;
  },

  /* Admin-console edit — any field on the lead, not just status/notes (see
     updateLeadStatus above for that narrower, scraper-facing path). */
  async updateLead(leadId, changes = {}) {
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(leadId)) return null;
      return ScrapedLead.findByIdAndUpdate(leadId, changes, { returnDocument: 'after', runValidators: true }).lean();
    }

    loadLocalData();
    const index = localLeads.findIndex((l) => l._id === leadId);
    if (index === -1) return null;
    localLeads[index] = { ...localLeads[index], ...changes };
    saveLocalData();
    return localLeads[index];
  },

  async deleteLead(leadId) {
    if (useMongo) {
      if (!mongoose.Types.ObjectId.isValid(leadId)) return false;
      const result = await ScrapedLead.deleteOne({ _id: leadId });
      return result.deletedCount > 0;
    }

    loadLocalData();
    const before = localLeads.length;
    localLeads = localLeads.filter((l) => l._id !== leadId);
    saveLocalData();
    return localLeads.length < before;
  },

  /* ── Aggregates ── */

  async getStats() {
    let leads;
    let jobs;
    if (useMongo) {
      [leads, jobs] = await Promise.all([ScrapedLead.find().lean(), ScrapeJob.find().lean()]);
    } else {
      loadLocalData();
      [leads, jobs] = [localLeads, localJobs];
    }

    const totalLeads = leads.length;
    const filled = (value) => Boolean(value && String(value).trim());
    const withPhoneCount = leads.filter((l) => filled(l.phone)).length;
    const withWebsiteCount = leads.filter((l) => l.hasWebsite || filled(l.website)).length;
    const percent = (n) => (totalLeads > 0 ? Math.round((n / totalLeads) * 100) : 0);

    return {
      totalLeads,
      withPhoneCount,
      phonePercentage: percent(withPhoneCount),
      withWebsiteCount,
      websitePercentage: percent(withWebsiteCount),
      withEmailCount: leads.filter((l) => filled(l.email)).length,
      assignedLeadsCount: leads.filter((l) => l.assignedTo && l.assignedTo.userId).length,
      totalJobs: jobs.length,
      completedJobs: jobs.filter((j) => j.status === 'completed').length,
    };
  },

  async getTeamStats() {
    let users;
    let leads;
    if (useMongo) {
      [users, leads] = await Promise.all([
        User.find({ role: 'EMPLOYEE' }, '-password').lean(),
        ScrapedLead.find().lean(),
      ]);
    } else {
      loadLocalData();
      users = localUsers.filter((u) => u.role === 'EMPLOYEE').map(withoutPassword);
      leads = localLeads;
    }

    const teamBreakdown = users.map((user) => {
      const owned = leads.filter((l) => l.assignedTo && l.assignedTo.userId === user.userId);
      const countOf = (status) => owned.filter((l) => l.leadStatus === status).length;
      const won = countOf('CLOSED_WON');

      return {
        user,
        totalAssigned: owned.length,
        contacted: countOf('CONTACTED'),
        qualified: countOf('QUALIFIED'),
        won,
        lost: countOf('CLOSED_LOST'),
        conversionRate: owned.length > 0 ? Math.round((won / owned.length) * 100) : 0,
      };
    });

    return {
      teamBreakdown,
      unassignedCount: leads.filter((l) => !(l.assignedTo && l.assignedTo.userId)).length,
      totalLeads: leads.length,
    };
  },
};

/* The store itself is the default export; the two boot-time helpers ride
   along on it so `require('./scraper.store')` is the only path anything
   needs. */
module.exports = dbStore;
module.exports.initStore = initStore;
module.exports.countUsers = countUsers;
