/* ─── HOSTYLLO — PRINT WINDOW PRELOAD ─────────────────────────────────────────
   The report window opened by `open-pdf-window` is a plain BrowserWindow
   loading a temp HTML file. It had no bridge at all, so the only way out of it
   was `window.print()` — Chromium's print dialog, whose page numbering is a
   checkbox the user has to know about and whose footer prints the temp file's
   file:// path across the bottom of an owner's report.

   The export specification asks for a footer on every page carrying the hostel
   and "Page X of Y" (§8), and for a real A4 document rather than whatever the
   print dialog was last set to (§5, §6). Both are properties of
   `webContents.printToPDF`, which only the main process can call — hence this
   bridge. The window asks; the main process prints ITSELF and offers a save
   dialog, so nothing in the app's own renderer ever blocks.

   contextIsolation is on and nodeIntegration off here as everywhere else: the
   surface is one method that takes no attacker-controlled path.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hostylloPdf', {
  /* Reads the document's own <meta name="hx-export"> for orientation, footer
     text and the suggested filename, so a document carries its own print
     setup instead of the window guessing. Anything missing falls back to a
     portrait A4 with the document title. */
  save() {
    let opts = {};
    try {
      const el = document.querySelector('meta[name="hx-export"]');
      if (el) opts = JSON.parse(el.getAttribute('content') || '{}');
    } catch (e) { opts = {}; }
    return ipcRenderer.invoke('pdf-window:save', {
      landscape: opts.landscape === true,
      // The paper the document was laid out for (Settings → Paper size).
      pageSize:  typeof opts.pageSize === 'string' ? opts.pageSize.slice(0, 12) : '',
      footer:    typeof opts.footer === 'string' ? opts.footer.slice(0, 200) : '',
      file:      typeof opts.file === 'string' ? opts.file.slice(0, 160) : '',
      title:     (document.title || 'Report').slice(0, 160),
    });
  },
});
