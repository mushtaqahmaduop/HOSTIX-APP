// Ambient type declarations for Hostyllo's cross-file globals.
//
// The renderer shares ONE global script scope (no module system — files are
// loaded in order via <script> tags), so functions/objects defined in one file
// are referenced as globals in others. These declarations tell the type-checker
// about the globals a checked file uses but doesn't define. Grown as more files
// opt into checking (Phase 2 §6.1). Dev-time only — nothing here ships.

// ── Data + persistence ───────────────────────────────────────────────────────
declare var DB: any;
declare var LS_KEY: string;
declare function saveDB(): Promise<void>;
declare function logActivity(action: string, details?: string, category?: string): void;
declare function _initDBFields(d: any): any;
declare function enforceDataRetention(): void;
declare function uid(): string;

// ── UI helpers ───────────────────────────────────────────────────────────────
// Third argument is the TITLE, not a duration — toast() derives its own delay
// from `type`. Declared as `ms: number` for a long time, which flagged every
// correct caller and hid the one that really was passing a number.
declare function toast(message: string, type?: string, title?: string): void;
declare function renderPage(page: string, resetScroll?: boolean): void;
declare function updateSidebar(): void;
declare function renderSidebarCalendar(): void;
declare var currentPage: string;

// ── Session ──────────────────────────────────────────────────────────────────
declare var CUR_USER: any;

// ── Utility helpers (defined in utils.js — which is a CommonJS module for the
//    node license test, so TS doesn't see its functions as global; at runtime in
//    the browser they ARE global. Declared here so script files can use them.) ──
/* Backup validation — utils.js. The one arbitrary document this app ingests,
   so both import paths gate on it. Declared here because storage.js and
   settings.js call it across file boundaries in a no-bundler app. */
declare function validateBackup(data: any): { ok: boolean; reason?: string };
declare function _isPlainObject(v: any): boolean;

declare function escHtml(s: any): string;
declare function fmtPKR(n: any): string;
declare function fmtNum(n: any): string;
declare function fmtDate(d?: any): string;
declare function today(): string;
// Local calendar date / month — NOT toISOString(), which is UTC and names the
// previous day from 7pm at UTC+5. See the CALENDAR DATES block in utils.js.
declare function ymd(d?: any): string;
declare function ym(d?: any): string;
// Active or Cancelling: a student on notice is still living here and still owes.
declare function isResident(t: any): boolean;
// settings.js — serialises the in-memory DB to a download, so it still works
// when the database write is the thing that has failed.
declare function exportData(): void;
declare function moneyValue(amount: any, opts?: any): string;
declare function openExternalLink(url: string): void;
// The room, named. roomLabel() is the boxed two-line CELL; roomText() is the
// same fact as one line of plain text for a sentence, a badge or a modal title.
declare function floorShort(floor: any): string;
declare function roomLabel(number: any, floor?: any): string;
declare function roomText(number: any, floor?: any): string;
// A CNIC on screen: masked to the PDF's shape, revealed on hover. maskCnic()
// is the plain string for print and exports; cnicHtml() is the two-span cell.
declare function maskCnic(v: any): string;
declare function cnicHtml(v: any): string;

// ── config.js ────────────────────────────────────────────────────────────────
declare var _ACTIVE_HOSTEL: string;

// -- config.js: the service model ---------------------------------------------
// Declared here because config.js defines them with `const`/`let` at script
// scope, which the checker cannot see across files the way it sees functions.
interface ServiceModelDef { id: string; label: string; short: string; hint: string; }
declare var SERVICE_MODELS: ServiceModelDef[];
declare var SERVICE_MODEL_DEFAULT: string;
declare function serviceModel(): string;
declare function hostelServesMess(): boolean;
declare function messIsOptional(): boolean;
declare function serviceModelInfo(): ServiceModelDef;

// -- utils.js: the financial authority ----------------------------------------
// What is still owed on one payment record. The single answer to a question
// eight modules used to answer three different ways — see the comment above
// the function itself, and tests/outstanding.test.js.
declare function outstandingOf(p: any): number;
// What this student is billed per month, from settings — the charge authority
// outstandingOf() derives against.
declare function resolveCharges(student: any, opts?: any): any;

// -- finance.js: the §14 financial integrity layer -----------------------------
// Money is a whole rupee held as an integer, and money() is the one boundary it
// crosses. calculateCharges/calculateOutstanding are the §14 names for the two
// functions above and CALL them — they are not a second opinion. See the header
// of finance.js, tests/finance.test.js and tests/cash-events.test.js.
// MONEY_SAFE_MAX is deliberately NOT declared here: finance.js is inside the
// typecheck scope, so its own `const` is the declaration, and a `declare var`
// beside it is a redeclaration error rather than a convenience.
declare function money(v: any): number;
declare function moneyIsSafe(v: any): boolean;
declare function moneySum(list: any, get?: (x: any, i: number) => any): number;
declare function moneyPct(base: any, pct: any): number;
declare function calculateCharges(student: any, opts?: any): any;
declare function calculateOutstanding(p: any): number;
declare function calculateBill(rec: any): number;
declare function applyPayment(p: any, opts?: any): any;
declare function reversePayment(p: any, opts?: any): any;
declare function calculateRefund(p: any): { refundable: number; recorded: number; derived: boolean; reason: string };
declare function calculateSettlement(studentId: string, opts?: any): any;
declare function calculateReportTotals(payments: any, opts?: any): any;
// Paid / Pending / Overdue for a whole student, aggregated from
// calculateOutstanding() and payments.js's payIsOverdue(). No third rule.
declare function calculateFeeStatus(studentId: string, opts?: any): {
  status: string; outstanding: number; overdue: number; overdueAmount: number;
  records: number; lastPaymentDate: string; nextDueDate: string; credit: number;
};
declare function payIsOverdue(p: any): boolean;

// -- ledger.js: the student ledger (warden ledger spec §2.1) -------------------
// Posted FROM the month records: a site that changes one calls ledgerTrack()
// after, and the diff against what was already posted becomes new entries.
// Entries are never edited; see the header of ledger.js.
declare function ledgerTrack(p: any, opts?: { why?: string }): any[];
declare function ledgerTrackAll(why?: string): number;
declare function ledgerTrackDeleted(p: any, why?: string): any;
declare function ledgerLoaded(): void;
declare function ledgerFlush(): Promise<boolean>;
declare function ledgerImportIfEmpty(): number;
declare function ledgerAdopt(entries: any): Promise<boolean>;
declare function ledgerBalance(studentId: string): number;
declare function ledgerEntriesFor(studentId: string): any[];
declare function ledgerDrift(): any[];
declare function ledgerCollectionLine(e: any): { kind: string; amount: number } | null;
declare function ledgerFirstName(name: string): string;
declare function ledgerHistoryLine(e: any): { id: string; by: string; sign: string; amount: number; tag: string;
  balance: number; date: string; reason: string; method: string };
declare function ledgerHistoryFor(studentId: string, recordId: string | null, n?: number):
  { rows: ReturnType<typeof ledgerHistoryLine>[]; earlier: number; bf: number } | null;
declare function ledgerCollectorOf(recordId: string): string;
declare function ledgerEntriesForRecord(recordId: string): any[];
declare function ledgerRecordOwner(recordId: string): { id: string | null; name: string } | null;
// -- ownership.js: who may change collected money (warden ledger spec §3.2) ---
declare function ownIsAdmin(): boolean;
declare function ownHeld(p: any): boolean;
declare function ownOwner(p: any): { id: string | null; name: string };
declare function ownCanEdit(p: any): { ok: boolean; reason: string };
declare function ownCanDelete(p: any): { ok: boolean; reason: string };
declare function ownReversible(p: any): { max: number; mine: number; waiting: number; approved: number; admin: boolean; reason: string };
// Module functions messExempt.js reaches for at call time (dashboard.js, nav.js, students.js).
declare function _payMatchesMonth(p: any, monthKey: string): boolean;
declare function refreshNotifBell(): void;
declare function showStudentPanel(id: string, tab?: string): void;
// -- messExempt.js: mess exemption requests (warden ledger spec §2.6, step 7) ---
declare function meApplies(): boolean;
declare function meIsAdmin(): boolean;
declare function mePending(s: any): any;
declare function meQueue(): any[];
declare function meRequest(studentId: string, kind: 'start' | 'end', reason: string): { ok: boolean; pending?: boolean; reason?: string; outcome?: string; adjusted?: number };
declare function meApprove(studentId: string): { ok: boolean; reason?: string; outcome?: string; adjusted?: number };
declare function meDecline(studentId: string, note: string): { ok: boolean; reason?: string; outcome?: string; adjusted?: number };
declare function meMarkSeen(studentId: string): boolean;
declare function meSeen(studentId: string): void;
declare function meAlerts(): any[];
// -- concessions.js: standing concessions (warden ledger spec §2.4, §3.9, step 8) ---
declare function _payMonthKey(p: any): string;
declare function cnIsAdmin(): boolean;
declare function cnTypeLabel(type: string): string;
declare function cnCovers(c: any, monthKey: string): boolean;
declare function cnForStudent(studentId: string): any[];
declare function cnActiveFor(studentId: string, monthKey: string): any[];
declare function cnMonthsLabel(c: any): string;
declare function cnQueue(): { c: any; kind: 'start' | 'end'; at: string }[];
declare function cnRequest(o: { studentId: string; type: string; value: number; reason: string; startMonth: string; endMonth?: string }): { ok: boolean; pending?: boolean; concession?: any; applied?: number; reason?: string };
declare function cnApprove(id: string): { ok: boolean; pending?: boolean; applied?: number; reason?: string };
declare function cnDecline(id: string, note: string): { ok: boolean; reason?: string };
declare function cnRequestEnd(id: string, reason: string): { ok: boolean; pending?: boolean; applied?: number; reason?: string };
declare function cnApplyAll(studentId: string): number;
declare function cnApplyToRecord(p: any): boolean;
declare function cnMarkSeen(id: string): boolean;
declare function cnSeen(id: string): void;
declare function cnAlerts(): any[];
// -- pin.js: PIN to confirm money (warden ledger spec §3.5, step 10) ----------
declare function pinValid(s: any): boolean;
declare function pinIsRequired(u: any): boolean;
declare function pinHasOne(u: any): boolean;
declare function pinCheck(accountId: string, plain: string): Promise<boolean>;
declare function pinSet(accountId: string, plain: string): Promise<{ ok: boolean; reason?: string }>;
declare function pinClear(accountId: string): Promise<{ ok: boolean; reason?: string }>;
declare function pinConfirm(opts?: { what?: string }): Promise<boolean>;
// -- undertaking.js: rules & undertaking (warden ledger spec §2.7, §3.8, step 11) --
declare const UND_STARTER: { rules: string; declaration: string };
declare function undVersions(): { v: number; rules: string; declaration: string; savedAt: string; savedByName: string }[];
declare function undIsStarter(): boolean;
declare function undCurrent(): { v: number; rules: string; declaration: string; savedAt: string; savedByName: string };
declare function undVersion(v: number): { v: number; rules: string; declaration: string; savedAt: string; savedByName: string } | null;
declare function undRuleLines(text: string): string[];
declare function undSave(o: { rules: string; declaration: string }): { ok: boolean; unchanged?: boolean; version?: number; reason?: string };
declare function undSignedCount(v: number): number;
declare function undSigned(t: any): boolean;
declare function undSignedVersion(t: any): { v: number; rules: string; declaration: string; savedAt: string; savedByName: string } | null;
declare function undSignOriginal(t: any): { ok: boolean; version?: number; signedAt?: string; reason?: string };
declare function undReprintLabel(t: any, doc?: any): string;
declare function undScanOf(t: any): any;
declare function undScanIsImage(doc: any): boolean;
declare function undFilterMatch(t: any, key: string): boolean;
// -- utils.js: prorated charging (warden ledger spec §2.5, step 9) ------------
declare function prorateMonthOf(key: string): { y: number; m: number; days: number } | null;
declare function prorateDefaultDays(monthKey: string, joinDate?: string, todayYmd?: string): number;
declare function prorateText(pr: { days: number; rate: number } | null | undefined): string;
// -- handovers.js: cash handovers (spec §5 step 4) ---------------------------
declare function handoverSync(): number;
declare function hoNeedsHandover(accountId: string): boolean;
declare function hoPendingLines(accountId: string): { row: any; entry: any }[];
declare function hoSum(lines: any[]): number;
declare function hoByMethod(lines: any[]): { [method: string]: number };
declare function hoOpenFor(accountId: string): any;
declare function hoFind(id: string): any;
declare function hoItems(handoverId: string): { item: any; entry: any; row: any }[];
declare function hoLabel(h: any): string;
declare function hoHue(h: any): string;
declare function hoEvaluate(h: any, ticked: any, counted: any): any;
declare function hoSend(accountId: string): any;
declare function hoTakeBack(id: string, accountId: string): any;
declare function hoApprove(id: string, input: any): any;
declare function hoFlag(id: string, input: any): any;
declare function hoAlerts(): any[];
declare function hoMarkSeen(accountId: string): number;
declare function canDo(p: string): boolean;
// -- enforcement-ui.js --------------------------------------------------------
declare function isReadOnly(): boolean;
declare function licenceState(): any;
// Read-only, for My Collections and the Wardens view (spec §5 step 3).
declare function ledgerCollections(accountId: string): { entry: any; kind: string; amount: number; deleted: boolean }[];
declare function ledgerCollectionTotals(rows: any[]): {
  holding: number; count: number; today: number; todayCount: number;
  month: number; monthCount: number; last: string; byMethod: { method: string; amount: number }[];
};

// -- rooms.js: bulk creation --------------------------------------------------
declare function bulkRoomPlan(o: any): { create: string[]; skip: string[]; error: string };
declare var ROOM_AMENITY_DEFAULTS: string[];
declare function cmpRoomNo(a: any, b: any): number;
declare function formatRoomNumber(inp: any): void;

// -- onboarding.js ------------------------------------------------------------
declare function needsSetup(): boolean;
declare function maybeRunSetup(): boolean;
declare function openSetupAgain(): void;

// -- auth-nev.js --------------------------------------------------------------
declare var CUR_USER: any;
declare var CUR_ROLE: any;
declare var WARDENS: any;
declare var DEFAULT_PASSWORD: string;
declare function verifyPassword(plain: string, stored: any): Promise<boolean>;
declare function hashPassword(plain: string): Promise<any>;
declare function hashNewPassword(plain: string): Promise<any>;
declare function saveWardenConfig(): void;
declare function requirePerm(p: string): boolean;
declare function isResident(t: any): boolean;
declare function escHtml(s: any): string;
declare function renderPage(page: string, ...rest: any[]): void;

// ── modals.js ────────────────────────────────────────────────────────────────
declare function showModal(size: string, title: string, body: string, footer?: string): void;
declare function showConfirm(title: string, text: string, onConfirm?: Function, onCancel?: Function): void;
declare function closeModal(): void;

// ── Secure IPC bridge exposed by preload.js ──────────────────────────────────
interface ElectronAPI {
  openExternal(url: string): void;
  dbAll(table: string): any[];
  dbUpsert(table: string, id: string, record: any): any;
  dbDelete(table: string, id: string): any;
  dbExportFull(): { ok: boolean; data?: any; error?: string };
  [key: string]: any;
}
interface Window {
  electronAPI: ElectronAPI;
  _hostyllo_license_cache?: any;
  _hostyllo_license_checked_at?: number;
  _hostyllo_machine_id?: string;
}

// ── src/export/ — the global export engine ───────────────────────────────────
// xlsx-writer.js ends with a CommonJS export (it is loaded directly by the
// node-side writer test), which makes TypeScript read the file as a module and
// its top-level `const HXW` as file-local. In the browser it is a classic
// script sharing one global lexical scope with engine.js, so this restates the
// binding the way the runtime actually sees it.
declare const HXW: any;
declare function _electronPDF(html: string, suggestedName?: string, opts?: any): void;

// ── Shared list toolbar (src/toolbar.js, added 2026-09-08) ───────────────────
// The globals it reaches for live outside the checked set: `icon` in
// src/icons.js, the filter registry in src/modules/nav.js. `thisMonth` and
// `monthLabel` ARE in utils.js, but utils.js declares them below the point
// tsc treats as the file's global scope for these two, so they are stated
// here alongside the rest rather than left as the only unchecked names.
declare function icon(name: string, size?: string): string;
declare function thisMonth(): string;
declare function monthLabel(key: string): string;
declare function registerFilter(key: string, obj: any, defaults: () => any, also?: () => void): void;
declare function resetFilters(key?: string): void;
declare function filtersAreSet(key: string): boolean;
declare function tbExport(o: any): string;
declare function tbMonth(keys: any[], o?: any): string;
declare function tbMonthLabel(key: string): string;
declare function tbClear(page: string, o?: any): string;
declare function tbClearAll(page: string): void;
declare function tbToggleMenu(id: string, ev?: any): void;
declare function tbCloseMenus(): void;
