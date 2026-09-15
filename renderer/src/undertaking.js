/* ─── HOSTYLLO — RULES & UNDERTAKING (warden ledger spec §2.7, §3.8, §5 step 11) ───
   Owner, 2026-09-14 / 2026-09-15.

   THE RULES TEXT lives in Settings → Rules & Undertaking as numbered versions
   (`DB.settings.undertaking.versions`). Saving adds a version and never edits
   an earlier one, so an admission form always reprints the text the student
   actually signed. Until an admin saves once, the form prints nothing: the
   starter text below is there to be reviewed, not signed.

   THE ORIGINAL is the first Print Full Admission Form. That print freezes
   `firstSignedAt` and `rulesVersionAtSigning` on the student; every later print
   is a REPRINT and says so. Nothing here can create a second original.

   THE SIGNED SCAN is a student document of kind `undertaking` (students.js
   STU_DOC_KINDS). An image scan reprints watermarked; a PDF can only be viewed.

   Pure rules. The screens are in settings.js and students.js. */

const UND_STARTER = {
  rules: [
    'Residents must carry their hostel ID and show it when asked.',
    'Monthly charges are due by the date set by the hostel. Late payment may carry a fine.',
    "Guests are allowed only in the visitors' area and only during visiting hours.",
    'Residents must be back inside the hostel before the closing time set by the management.',
    'Smoking, drugs, alcohol and weapons are not allowed anywhere on the premises.',
    'Rooms, furniture and fittings must be kept in good condition. Damage is charged to the resident responsible.',
    'Noise must be kept low, and quiet hours set by the management must be respected.',
    'Only electrical appliances allowed by the management may be used in rooms.',
    "Leaving the hostel needs one month's written notice to the management.",
    'The management may inspect rooms, and may cancel a seat for breaking these rules.',
  ].join('\n'),
  declaration: 'I have read the rules above, understood them, and agree to follow them for as long as I '
    + 'live in this hostel. I accept responsibility for any damage I cause and for paying my charges '
    + 'on time. My guardian has read these rules with me and accepts responsibility for my conduct '
    + 'and my dues.',
};

/* ── The rules text and its versions ──────────────────────────────────────── */

function undVersions() {
  const u = typeof DB !== 'undefined' && DB.settings && DB.settings.undertaking;
  return (u && Array.isArray(u.versions)) ? u.versions : [];
}

/** True until an admin has saved the rules once. */
function undIsStarter() { return !undVersions().length; }

/** The version printed on a new original: the latest saved, or the starter (v 0). */
function undCurrent() {
  const list = undVersions();
  if (list.length) return list[list.length - 1];
  return { v: 0, rules: UND_STARTER.rules, declaration: UND_STARTER.declaration, savedAt: '', savedByName: '' };
}

function undVersion(v) {
  return undVersions().find(x => Number(x.v) === Number(v)) || null;
}

/** The rules as printed lines. Numbers a warden typed ("3." / "3)") are dropped — the print numbers them. */
function undRuleLines(text) {
  return String(text || '').split(/\r?\n/)
    .map(s => s.replace(/^\s*\d+\s*[.)]\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Saves the rules as a new version. The first save always creates version 1,
 * even from unchanged starter text — that save IS the admin's review. After
 * that an unchanged text is not a new version.
 */
function undSave(o) {
  if (!(typeof canDo === 'function' && canDo('settings'))) {
    return { ok: false, reason: 'Only an account with the Settings permission can change the rules.' };
  }
  const rules = String((o && o.rules) || '').replace(/\r\n/g, '\n').trim();
  const declaration = String((o && o.declaration) || '').replace(/\r\n/g, '\n').trim();
  if (!undRuleLines(rules).length) return { ok: false, reason: 'Write at least one rule.' };
  if (!declaration) return { ok: false, reason: 'Write the responsibility declaration.' };

  const cur = undCurrent();
  if (!undIsStarter() && cur.rules === rules && cur.declaration === declaration) {
    return { ok: true, unchanged: true, version: cur.v };
  }
  if (!DB.settings.undertaking || !Array.isArray(DB.settings.undertaking.versions)) {
    DB.settings.undertaking = { versions: [] };
  }
  const v = undVersions().reduce((m, x) => Math.max(m, Number(x.v) || 0), 0) + 1;
  const user = typeof CUR_USER !== 'undefined' && CUR_USER ? CUR_USER : null;
  DB.settings.undertaking.versions.push({
    v, rules, declaration,
    savedAt: new Date().toISOString(),
    savedByName: (user && (user.name || user.username)) || '',
  });
  return { ok: true, version: v };
}

/** How many students signed a version. */
function undSignedCount(v) {
  return (DB.students || []).filter(s => s && s.firstSignedAt && Number(s.rulesVersionAtSigning) === Number(v)).length;
}

/* ── The original ─────────────────────────────────────────────────────────── */

function undSigned(t) { return !!(t && t.firstSignedAt); }

/** The version a student signed, or null. */
function undSignedVersion(t) {
  return undSigned(t) ? undVersion(t.rulesVersionAtSigning) : null;
}

/**
 * Records the first Print Full Admission Form as the original. Refuses when an
 * original is already on record (reason 'already') and while the rules are the
 * unsaved starter text. Late filing is fine: the date is the day of this print.
 */
function undSignOriginal(t) {
  if (!t) return { ok: false, reason: 'Student not found.' };
  if (undSigned(t)) return { ok: false, reason: 'already', signedAt: t.firstSignedAt };
  if (undIsStarter()) {
    return { ok: false, reason: 'The rules are still the starter text. An administrator must review and save them in Settings → Rules & Undertaking first.' };
  }
  const cur = undCurrent();
  const user = typeof CUR_USER !== 'undefined' && CUR_USER ? CUR_USER : null;
  t.firstSignedAt = today();
  t.rulesVersionAtSigning = cur.v;
  t.firstSignedByName = (user && (user.name || user.username)) || '';
  return { ok: true, version: cur.v, signedAt: t.firstSignedAt };
}

/** "REPRINT — originally signed 15 Sep 2026": the signing on record, else the day the scan was attached. */
function undReprintLabel(t, doc) {
  const d = (t && t.firstSignedAt) || (doc && doc.addedAt) || '';
  return 'REPRINT — originally signed ' + (d ? fmtDate(d) : 'date not recorded');
}

/* ── The signed scan and the Students filter ──────────────────────────────── */

function undScanOf(t) {
  const files = (t && t.docs && Array.isArray(t.docs.files)) ? t.docs.files : [];
  return files.find(f => f && f.kind === 'undertaking') || null;
}

function undScanIsImage(doc) { return !!(doc && /^image\//.test(String(doc.type || ''))); }

/** The Students page's Undertaking filter: 'All' | 'scan' | 'noscan'. */
function undFilterMatch(t, key) {
  if (!key || key === 'All') return true;
  const has = !!undScanOf(t);
  if (key === 'scan') return has;
  if (key === 'noscan') return !has;
  return true;
}
