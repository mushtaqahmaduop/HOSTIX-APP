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
