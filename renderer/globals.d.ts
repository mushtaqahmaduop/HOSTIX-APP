// Ambient type declarations for HOSTIX's cross-file globals.
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
declare function toast(message: string, type?: string, ms?: number): void;
declare function renderPage(page: string, resetScroll?: boolean): void;
declare function updateSidebar(): void;
declare function renderSidebarCalendar(): void;
declare var currentPage: string;

// ── Session ──────────────────────────────────────────────────────────────────
declare var CUR_USER: any;

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
}
