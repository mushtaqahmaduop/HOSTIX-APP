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
}
