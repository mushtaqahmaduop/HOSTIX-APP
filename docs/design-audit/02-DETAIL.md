# HOSTIX-APP — Design Truth Audit — Detail

Read-only inventory extracted from the code on the `feature/warden-ledger` working tree. Static values come from parsing every in-scope file; rendered values (contrast, computed heading sizes, overflow, table and control metrics) were measured in the running app on a scratch profile with sample records, at 1366×768 unless a width is stated. Evidence format: `file:line` (repeat lines comma-separated, `+n` = further occurrences).

## 0. Scope and method

Files covered: **79** (30 CSS, 4 HTML, 45 JS). Lines covered: **66946** (newline count per file).

| File | Lines |
|---|---|
| main.js | 2562 |
| pdf-window-preload.js | 41 |
| preload.js | 260 |
| renderer/activitylog.css | 153 |
| renderer/app.js | 534 |
| renderer/archive.css | 222 |
| renderer/backup.css | 133 |
| renderer/cancellations.css | 243 |
| renderer/chrome.css | 900 |
| renderer/components.css | 344 |
| renderer/dashboard.css | 3236 |
| renderer/expenses.css | 328 |
| renderer/former.css | 178 |
| renderer/forms.css | 548 |
| renderer/index.html | 836 |
| renderer/issues.css | 209 |
| renderer/license-settings.html | 579 |
| renderer/license.html | 648 |
| renderer/listkit.css | 441 |
| renderer/login.css | 304 |
| renderer/onboarding.css | 180 |
| renderer/payments.css | 1583 |
| renderer/pw-eye.css | 23 |
| renderer/rail-compact.css | 57 |
| renderer/recovery.html | 212 |
| renderer/registers-center.css | 100 |
| renderer/reports.css | 634 |
| renderer/rooms.css | 442 |
| renderer/settings.css | 1273 |
| renderer/src/auth-nev.js | 850 |
| renderer/src/concessions.js | 347 |
| renderer/src/config.js | 123 |
| renderer/src/enforcement-ui.js | 254 |
| renderer/src/export/engine.js | 974 |
| renderer/src/export/xlsx-writer.js | 647 |
| renderer/src/finance.js | 618 |
| renderer/src/handovers.js | 373 |
| renderer/src/icons.js | 183 |
| renderer/src/ledger.js | 641 |
| renderer/src/license.js | 236 |
| renderer/src/messExempt.js | 188 |
| renderer/src/modules/activitylog.js | 454 |
| renderer/src/modules/archive.js | 1056 |
| renderer/src/modules/backup-page.js | 541 |
| renderer/src/modules/cancellations.js | 1426 |
| renderer/src/modules/command-palette.js | 135 |
| renderer/src/modules/dashboard.js | 3948 |
| renderer/src/modules/expenses.js | 1066 |
| renderer/src/modules/former.js | 407 |
| renderer/src/modules/issues.js | 1116 |
| renderer/src/modules/modals.js | 1234 |
| renderer/src/modules/nav.js | 753 |
| renderer/src/modules/onboarding.js | 628 |
| renderer/src/modules/payments.js | 3832 |
| renderer/src/modules/reports.js | 2017 |
| renderer/src/modules/rooms.js | 1053 |
| renderer/src/modules/settings.js | 3790 |
| renderer/src/modules/sidebar_calendar.js | 159 |
| renderer/src/modules/students.js | 5329 |
| renderer/src/modules/support.js | 852 |
| renderer/src/modules/theme.js | 66 |
| renderer/src/modules/users.js | 1904 |
| renderer/src/modules/whatsapp.js | 228 |
| renderer/src/ownership.js | 109 |
| renderer/src/pw-eye.js | 80 |
| renderer/src/receipt.js | 514 |
| renderer/src/storage.js | 465 |
| renderer/src/titlebar.js | 321 |
| renderer/src/toolbar.js | 268 |
| renderer/src/utils.js | 1541 |
| renderer/students.css | 1863 |
| renderer/style.css | 5197 |
| renderer/support.css | 284 |
| renderer/titlebar.css | 171 |
| renderer/tokens.css | 676 |
| renderer/ui-kit.css | 127 |
| renderer/users.css | 308 |
| renderer/vendor/fonts.css | 249 |
| renderer/whatsapp.css | 142 |

Excluded from style extraction (third-party or not part of the renderer UI): `renderer/vendor/js/chart.umd.js`, `renderer/vendor/js/chartjs-plugin-datalabels.min.js`, `renderer/vendor/js/xlsx.full.min.js`, `keygen.html`, `keygen.js`, `server/public/*`, `stitch-prototypes/*`, `scripts/*`, `services/*`, `tests/*`, `.scratch-*`. Font and image files are inventoried in §1 and §12.

Parser output: 5382 CSS rules (stylesheets + <style> blocks, incl. CSS built in JS strings), 23217 declarations, 953 inline `style=` attributes, 354 JS style/class operations, 1477 colour literal occurrences.

Method limits: selectors are matched as written — cascade winners between *different* selectors that target the same element are not resolved statically (§13, §16 report identical-selector conflicts only); values assembled at runtime from JS variables appear as `VAR`.

## 1. Typography

### 1.1 font-family stacks — 36 distinct

| Stack (verbatim) | Count | Locations |
|---|---|---|
| var(--ant-num-font) | 152 | renderer/activitylog.css:34,79,115; renderer/archive.css:58,92,109 (+2); renderer/backup.css:56,106; renderer/cancellations.css:20,45,173; +19 files |
| var(--font) | 106 | renderer/archive.css:25,33,44 (+1); renderer/chrome.css:436,525; renderer/dashboard.css:3161; renderer/expenses.css:63,70,86 (+2); +17 files |
| inherit | 24 | renderer/components.css:82; renderer/dashboard.css:999,1285,1307 (+4); renderer/listkit.css:338,364; renderer/payments.css:453,840,1466; +3 files |
| var(--font-display) | 13 | renderer/chrome.css:378; renderer/forms.css:153; renderer/style.css:719,1228,1558 (+8) |
| 'Barlow' | 10 | renderer/vendor/fonts.css:76,85,94 (+7) |
| monospace | 8 | renderer/src/modules/dashboard.js:2816; renderer/src/modules/nav.js:519; renderer/src/receipt.js:239,265,306 (+3) |
| 'Barlow Condensed' | 6 | renderer/vendor/fonts.css:166,175,184 (+3) |
| var(--font-mono) | 4 | renderer/components.css:310; renderer/settings.css:446; renderer/students.css:382; renderer/style.css:2084 |
| 'Inter' | 2 | renderer/vendor/fonts.css:5,14 |
| 'JetBrains Mono' | 2 | renderer/vendor/fonts.css:23,32 |
| 'Material Symbols Rounded' | 2 | renderer/style.css:557; renderer/vendor/fonts.css:243 |
| 'Outfit' | 2 | renderer/vendor/fonts.css:41,50 |
| 'Roboto Mono' | 2 | renderer/vendor/fonts.css:224,233 |
| Consolas,"Courier New",monospace | 2 | renderer/recovery.html:31; renderer/src/modules/students.js:5032 |
| sans-serif | 2 | renderer/app.js:89,95 |
| Segoe UI,Arial,sans-serif | 2 | renderer/app.js:199; main.js:1795 |
| var(--mono) | 2 | renderer/license.html:130,164 |
| '${ff}', serif | 1 | renderer/src/modules/settings.js:2645 |
| 'Inter','Segoe UI',Arial,sans-serif | 1 | renderer/src/modules/students.js:3507 |
| 'JetBrains Mono', ui-monospace, monospace | 1 | renderer/license-settings.html:132 |
| 'Outfit', 'Segoe UI', sans-serif | 1 | renderer/license-settings.html:75 |
| 'VAR',var(--font) | 1 | renderer/src/modules/settings.js:1642 |
| "Segoe UI", system-ui, -apple-system, sans-serif | 1 | renderer/recovery.html:21 |
| "Segoe UI",-apple-system,Roboto,Arial,sans-serif | 1 | renderer/src/modules/students.js:4988 |
| "Segoe UI",Inter,Arial,sans-serif | 1 | renderer/src/export/engine.js:524 |
| \'Courier New\',Courier,monospace;' + 'font-size:11px;font-weight:800;color:#111;margin:3px 0 | 1 | renderer/src/receipt.js:287 |
| \'Courier New\',Courier,monospace;' + 'font-size:VAR;font-weight:VAR;color:#000;margin:3px 0 | 1 | renderer/src/receipt.js:127 |
| \'Courier New\',Courier,monospace;font-size:11px;letter-spacing:2px;VARborder-left:4px solid #222;padding-left:8px | 1 | renderer/src/receipt.js:138 |
| \'Courier New\',Courier,monospace;VARbox-shadow:0 4px 24px rgba(0,0,0,0.18);border:1px solid #e0e0e0 | 1 | renderer/src/receipt.js:144 |
| \'DM Serif Display\',serif; | 1 | renderer/src/license.js:97 |
| \'JetBrains Mono\',\'Courier New\',monospace;' + 'word-break:break-all;letter-spacing:0.5px; | 1 | renderer/src/license.js:126 |
| Arial,Helvetica,sans-serif | 1 | renderer/src/modules/dashboard.js:2418 |
| face ? '"' + face.replace(/"/g, '') + '", var(--font)' : ' | 1 | renderer/src/titlebar.js:319 |
| var(--font-mono, monospace) | 1 | renderer/chrome.css:448 |
| var(--font-mono, ui-monospace, monospace) | 1 | renderer/rooms.css:324 |
| var(--font, 'Inter', 'Segoe UI', system-ui, sans-serif) | 1 | renderer/titlebar.css:22 |

Distinct family names appearing inside those stacks: 38 — ${ff}, ') + ', -apple-system, 0, 0.18);border:1px solid #e0e0e0, Arial, Barlow, Barlow Condensed, Consolas, Courier, Courier New, Helvetica, Inter, JetBrains Mono, Material Symbols Rounded, Outfit, Roboto, Roboto Mono, Segoe UI, VAR, \'Courier New\, \'DM Serif Display\, \'JetBrains Mono\, face ? '"' + face.replace(/"/g, inherit, monospace, monospace), monospace;' + 'font-size:11px;font-weight:800;color:#111;margin:3px 0, monospace;' + 'font-size:VAR;font-weight:VAR;color:#000;margin:3px 0, monospace;' + 'word-break:break-all;letter-spacing:0.5px;, monospace;VARbox-shadow:0 4px 24px rgba(0, monospace;font-size:11px;letter-spacing:2px;VARborder-left:4px solid #222;padding-left:8px, sans-serif, sans-serif), serif, serif;, system-ui, ui-monospace.

### 1.2 font-size — 67 distinct values across 1642 declarations

**px** — 37 distinct, 1588 declarations

| Value | Count | Locations |
|---|---|---|
| 11px | 244 | renderer/activitylog.css:37,43,44 (+3); renderer/archive.css:15,55,60 (+3); renderer/backup.css:33,111; +27 files |
| 12px | 209 | renderer/activitylog.css:96,99,114 (+1); renderer/archive.css:135,146,211; renderer/backup.css:70,93,123; +30 files |
| 12.5px | 179 | renderer/archive.css:25,74,97; renderer/backup.css:17,110; renderer/cancellations.css:37,51,57 (+3); +24 files |
| 11.5px | 163 | renderer/activitylog.css:31,70,74 (+3); renderer/archive.css:152,161; renderer/backup.css:59,91,105 (+2); +24 files |
| 13px | 160 | renderer/archive.css:33,44,91 (+1); renderer/backup.css:32,116; renderer/cancellations.css:93,124; +32 files |
| 10px | 136 | renderer/archive.css:102,140,200; renderer/chrome.css:229,299,446 (+1); renderer/dashboard.css:79,92,136 (+12); +16 files |
| 10.5px | 83 | renderer/activitylog.css:68; renderer/archive.css:78; renderer/backup.css:108; +18 files |
| 9px | 49 | renderer/dashboard.css:158,830,1919 (+2); renderer/expenses.css:104; renderer/listkit.css:141; +7 files |
| 14px | 48 | renderer/cancellations.css:82,172; renderer/dashboard.css:110,145,980 (+3); renderer/forms.css:524; +19 files |
| 15px | 48 | renderer/activitylog.css:140; renderer/cancellations.css:26,77; renderer/dashboard.css:197,208,734 (+4); +18 files |
| 13.5px | 33 | renderer/archive.css:89; renderer/backup.css:90; renderer/chrome.css:245; +13 files |
| 9.5px | 32 | renderer/dashboard.css:198,985,1049 (+1); renderer/former.css:131,158; renderer/listkit.css:438; +7 files |
| 16px | 23 | renderer/chrome.css:173; renderer/expenses.css:255; renderer/former.css:86; +12 files |
| 26px | 21 | renderer/chrome.css:379; renderer/dashboard.css:314,771; renderer/payments.css:52; +6 files |
| 22px | 20 | renderer/backup.css:16; renderer/dashboard.css:196,1094; renderer/payments.css:51; +7 files |
| 19px | 16 | renderer/backup.css:55; renderer/cancellations.css:19; renderer/dashboard.css:1121,1267; +10 files |
| 18px | 15 | renderer/archive.css:132; renderer/students.css:43,1294; renderer/style.css:1229,1558,2751 (+1); +5 files |
| 17px | 13 | renderer/archive.css:134,142; renderer/dashboard.css:477,1735; renderer/listkit.css:40; +5 files |
| 8.5px | 12 | renderer/dashboard.css:1051,1811,2107; renderer/settings.css:1146; renderer/src/modules/dashboard.js:2447,2468,2471 (+1); +2 files |
| 20px | 11 | renderer/dashboard.css:98,804; renderer/onboarding.css:62; renderer/rooms.css:35; +6 files |
| 21px | 11 | renderer/archive.css:119; renderer/dashboard.css:328,1744; renderer/reports.css:87,296; +5 files |
| 24px | 11 | renderer/activitylog.css:33; renderer/archive.css:57; renderer/dashboard.css:151,1418; +4 files |
| 30px | 9 | renderer/dashboard.css:97,671; renderer/listkit.css:58; renderer/login.css:226; +4 files |
| 14.5px | 7 | renderer/cancellations.css:13,79; renderer/dashboard.css:1893; renderer/forms.css:488; +3 files |
| 28px | 7 | renderer/listkit.css:39; renderer/students.css:1045; renderer/style.css:2660,4860; +1 files |
| 32px | 6 | renderer/login.css:83; renderer/style.css:2956; renderer/license.html:289; +1 files |
| 8px | 5 | renderer/dashboard.css:736,1561; renderer/src/modules/dashboard.js:2510; renderer/src/receipt.js:158,308 |
| 27px | 3 | renderer/login.css:288; renderer/reports.css:249; renderer/src/modules/students.js:3531 |
| 15.5px | 2 | renderer/dashboard.css:3170; renderer/reports.css:81 |
| 25px | 2 | renderer/login.css:74,294 |
| 38px | 2 | renderer/src/modules/archive.js:181; renderer/src/modules/reports.js:70 |
| 7.5px | 2 | renderer/src/modules/students.js:5012; renderer/src/receipt.js:321 |
| varpx | 2 | renderer/src/modules/users.js:134; renderer/src/utils.js:574 |
| 36px | 1 | renderer/style.css:3875 |
| 40px | 1 | renderer/license.html:94 |
| 44px | 1 | renderer/src/modules/reports.js:156 |
| 7px | 1 | main.js:1795 |

**pt** — 13 distinct, 27 declarations

| Value | Count | Locations |
|---|---|---|
| 7.5pt | 7 | renderer/src/export/engine.js:546,579,584 (+4) |
| 9pt | 4 | renderer/src/export/engine.js:525,571,583 (+1) |
| 8.5pt | 3 | renderer/src/export/engine.js:542,561,611 |
| 5.8pt | 2 | renderer/src/export/engine.js:559,563 |
| 7pt | 2 | renderer/src/export/engine.js:534,626 |
| 8pt | 2 | renderer/src/export/engine.js:572,640 |
| 11pt | 1 | renderer/src/export/engine.js:619 |
| 12pt | 1 | renderer/src/export/engine.js:533 |
| 13pt | 1 | renderer/src/export/engine.js:642 |
| 14pt | 1 | renderer/src/export/engine.js:532 |
| 15pt | 1 | renderer/src/export/engine.js:541 |
| 6.8pt | 1 | renderer/src/export/engine.js:569 |
| 9.5pt | 1 | renderer/src/export/engine.js:577 |

**var/calc/function** — 11 distinct, 19 declarations

| Value | Count | Locations |
|---|---|---|
| var(--text-xs) | 5 | renderer/components.css:22,141,187 (+2) |
| var(--text-sm) | 4 | renderer/components.css:76,205,259 (+1) |
| var(--fs-display) | 2 | renderer/style.css:3678,4430 |
| clamp(25px, 1.95vw, 29px) | 1 | renderer/dashboard.css:307 |
| var(--fs-body) | 1 | renderer/style.css:3700 |
| var(--fs-card) | 1 | renderer/listkit.css:124 |
| var(--fs-label) | 1 | renderer/style.css:3701 |
| var(--fs-meta) | 1 | renderer/listkit.css:127 |
| var(--fs-section) | 1 | renderer/style.css:3699 |
| var(--text-3xl) | 1 | renderer/components.css:195 |
| var(--text-base) | 1 | renderer/components.css:145 |

**em** — 4 distinct, 4 declarations

| Value | Count | Locations |
|---|---|---|
| .62em | 1 | renderer/students.css:51 |
| 0.34em | 1 | renderer/style.css:3698 |
| 0.45em | 1 | renderer/style.css:3655 |
| 0.65em | 1 | renderer/style.css:3633 |

**keyword/other** — 2 distinct, 4 declarations

| Value | Count | Locations |
|---|---|---|
| inherit | 3 | renderer/dashboard.css:1419,1743; renderer/style.css:559 |
| 9.5px}.no-print{display:none} | 1 | renderer/src/modules/students.js:4989 |

### 1.3 font-weight — 21 distinct

| Value | Kind | Count | Locations |
|---|---|---|---|
| 700 | numeric | 454 | renderer/activitylog.css:44,78,114 (+2); renderer/archive.css:15,25,55 (+6); renderer/backup.css:32,90,93 (+2); +34 files |
| 600 | numeric | 236 | renderer/archive.css:33,44,74 (+2); renderer/backup.css:110; renderer/cancellations.css:26,41,47 (+2); +31 files |
| 800 | numeric | 214 | renderer/activitylog.css:33; renderer/archive.css:57,89,91 (+6); renderer/backup.css:16,55; +30 files |
| 500 | numeric | 70 | renderer/backup.css:108; renderer/chrome.css:177,245,523 (+1); renderer/dashboard.css:111,198,536 (+1); +18 files |
| 900 | numeric | 62 | renderer/archive.css:119; renderer/style.css:1694,2706,3120; renderer/src/modules/dashboard.js:2431,2446,2464 (+22); +5 files |
| 650 | numeric | 24 | renderer/chrome.css:803; renderer/dashboard.css:1188,1307,1322 (+7); renderer/login.css:98,224; +6 files |
| 400 | numeric | 17 | renderer/chrome.css:388; renderer/dashboard.css:1165,2831; renderer/payments.css:278,283,1175; +5 files |
| 750 | numeric | 3 | renderer/dashboard.css:1455; renderer/reports.css:630; renderer/license.html:240 |
| var | keyword/var | 3 | renderer/src/modules/dashboard.js:2978; renderer/src/modules/sidebar_calendar.js:117; renderer/src/receipt.js:129 |
| var(--weight-medium) | keyword/var | 3 | renderer/components.css:23,77,188 |
| var(--weight-semibold) | keyword/var | 3 | renderer/components.css:196,260,287 |
| 300 900 | keyword/var | 2 | renderer/vendor/fonts.css:7,16 |
| 400 500 | keyword/var | 2 | renderer/vendor/fonts.css:25,34 |
| 400 700 | keyword/var | 2 | renderer/vendor/fonts.css:226,235 |
| 400 900 | keyword/var | 2 | renderer/vendor/fonts.css:43,52 |
| 550 | numeric | 2 | renderer/login.css:125; renderer/students.css:1462 |
| var(--fw-display) | keyword/var | 2 | renderer/style.css:3663,4431 |
| 100 700 | keyword/var | 1 | renderer/vendor/fonts.css:245 |
| var(--fw-card) | keyword/var | 1 | renderer/listkit.css:124 |
| var(--fw-meta) | keyword/var | 1 | renderer/listkit.css:127 |
| var(--fw-section) | keyword/var | 1 | renderer/style.css:3699 |

### 1.4 line-height — 25 distinct

| Value | Kind | Count | Locations |
|---|---|---|---|
| 1.5 | unitless | 37 | renderer/archive.css:211; renderer/backup.css:117,123; renderer/cancellations.css:12,94,125; +15 files |
| 1 | unitless | 24 | renderer/dashboard.css:97,98,196 (+3); renderer/forms.css:273; renderer/listkit.css:58; +9 files |
| 1.2 | unitless | 23 | renderer/archive.css:134; renderer/dashboard.css:793,1271,1685 (+1); renderer/forms.css:158; +9 files |
| 1.45 | unitless | 19 | renderer/activitylog.css:141; renderer/issues.css:148; renderer/login.css:240; +7 files |
| 1.55 | unitless | 19 | renderer/archive.css:161; renderer/backup.css:70; renderer/cancellations.css:57,107,179; +11 files |
| 1.3 | unitless | 17 | renderer/dashboard.css:52,1166,1653 (+2); renderer/listkit.css:425; renderer/payments.css:32; +4 files |
| 1.6 | unitless | 17 | renderer/cancellations.css:141,153; renderer/dashboard.css:521; renderer/expenses.css:237; +9 files |
| 1.15 | unitless | 15 | renderer/archive.css:59; renderer/backup.css:16; renderer/chrome.css:380; +9 files |
| 1.1 | unitless | 14 | renderer/activitylog.css:33; renderer/backup.css:55; renderer/dashboard.css:151,157,1267 (+2); +7 files |
| 1.25 | unitless | 11 | renderer/dashboard.css:207,898,1157 (+3); renderer/reports.css:68; renderer/settings.css:493; +2 files |
| 1.35 | unitless | 10 | renderer/dashboard.css:576,1552,1634 (+1); renderer/login.css:239; renderer/reports.css:91; +3 files |
| 1.4 | unitless | 10 | renderer/chrome.css:550; renderer/dashboard.css:62,2843; renderer/expenses.css:327; +5 files |
| 1.65 | unitless | 5 | renderer/cancellations.css:62; renderer/login.css:228; renderer/payments.css:1010; +2 files |
| 1.8 | unitless | 4 | renderer/src/modules/payments.js:2329,3073; renderer/src/modules/settings.js:3012; renderer/src/modules/students.js:4804 |
| 18px | px | 4 | renderer/listkit.css:97; renderer/payments.css:102; renderer/students.css:99; +1 files |
| 0 | unitless | 3 | renderer/forms.css:502,539; renderer/reports.css:468 |
| 1.7 | unitless | 3 | renderer/support.css:213; renderer/src/modules/archive.js:183; renderer/src/modules/nav.js:519 |
| 1.02 | unitless | 1 | renderer/style.css:3680 |
| 1.05 | unitless | 1 | renderer/license.html:95 |
| 1.75 | unitless | 1 | renderer/src/modules/students.js:3975 |
| 1.85 | unitless | 1 | renderer/src/modules/dashboard.js:2812 |
| 1.9 | unitless | 1 | renderer/src/modules/settings.js:2980 |
| 17px | px | 1 | renderer/chrome.css:474 |
| 26px | px | 1 | renderer/src/export/engine.js:532 |
| var(--leading-tight) | var/calc/function | 1 | renderer/components.css:200 |

### 1.5 letter-spacing — 57 distinct

| Value | Count | Locations |
|---|---|---|
| var(--ant-num-track) | 136 | renderer/activitylog.css:34,79,115; renderer/archive.css:57,93,109 (+2); renderer/backup.css:56,106; +20 files |
| 1px | 35 | renderer/settings.css:306,397; renderer/students.css:448; renderer/style.css:1307,1358; +4 files |
| 0 | 19 | renderer/chrome.css:388; renderer/forms.css:200; renderer/payments.css:750,1282,1423 (+2); +7 files |
| .7px | 16 | renderer/archive.css:102,141,147; renderer/dashboard.css:144,986; renderer/listkit.css:137; +6 files |
| -.02em | 15 | renderer/backup.css:16; renderer/login.css:83,226; renderer/reports.css:296; +6 files |
| .6px | 15 | renderer/payments.css:380,553,697 (+3); renderer/license-settings.html:133; renderer/license.html:131; +3 files |
| .5px | 11 | renderer/payments.css:502,637,659 (+1); renderer/rooms.css:317,325; renderer/students.css:676; +3 files |
| .9px | 10 | renderer/dashboard.css:52,403,476; renderer/payments.css:109; renderer/settings.css:430; +3 files |
| .8px | 9 | renderer/archive.css:16,56; renderer/dashboard.css:152,303; renderer/listkit.css:37; +2 files |
| -.01em | 8 | renderer/listkit.css:125; renderer/onboarding.css:62; renderer/payments.css:277,370,601; +3 files |
| .2px | 7 | renderer/chrome.css:173; renderer/dashboard.css:999,1049,2084 (+1); renderer/expenses.css:191; +1 files |
| .4px | 7 | renderer/payments.css:158,430,1032; renderer/settings.css:323; renderer/src/export/engine.js:534; +1 files |
| .04em | 6 | renderer/activitylog.css:145; renderer/onboarding.css:103; renderer/students.css:38,1483,1595; +1 files |
| .06em | 6 | renderer/former.css:131,158; renderer/forms.css:482; renderer/onboarding.css:29; +2 files |
| .05em | 5 | renderer/students.css:1487; renderer/users.css:78,116,138 (+1) |
| 0.2px | 5 | renderer/style.css:735,2996,3431 (+1); renderer/app.js:95 |
| 0.5px | 5 | renderer/style.css:814,1697,3150 (+1); renderer/src/receipt.js:321 |
| 1.2px | 5 | renderer/archive.css:117; renderer/students.css:385; renderer/src/modules/students.js:3530,5056; +1 files |
| 1.5px | 5 | renderer/style.css:724,985,2153; renderer/src/modules/reports.js:69,155 |
| 0.3px | 4 | renderer/style.css:908,1415,3229; renderer/src/receipt.js:168 |
| 0.8px | 4 | renderer/style.css:578,768,1462; renderer/src/modules/settings.js:219 |
| 1.1px | 4 | renderer/chrome.css:868; renderer/students.css:273,402; renderer/src/modules/dashboard.js:2447 |
| -.2px | 3 | renderer/cancellations.css:19; renderer/dashboard.css:1268; renderer/students.css:1642 |
| .02em | 3 | renderer/chrome.css:329; renderer/expenses.css:225; renderer/students.css:535 |
| .3px | 3 | renderer/dashboard.css:828; renderer/listkit.css:438; renderer/students.css:1630 |
| 1.6px | 3 | renderer/license.html:165; renderer/src/modules/dashboard.js:2434; renderer/src/modules/students.js:5001 |
| 2px | 3 | renderer/style.css:2988; renderer/src/license.js:98; renderer/src/receipt.js:130 |
| -.5px | 2 | renderer/dashboard.css:672; renderer/license.html:95 |
| -0.2px | 2 | renderer/forms.css:156; renderer/style.css:4619 |
| 0.02em | 2 | renderer/style.css:3658,4509 |
| 0.04em | 2 | renderer/components.css:191,290 |
| 0.08em | 2 | renderer/style.css:4422,4477 |
| 1.3px | 2 | renderer/license.html:123,154 |
| 1.4px | 2 | renderer/chrome.css:230; renderer/src/export/engine.js:533 |
| -.022em | 1 | renderer/chrome.css:379 |
| -.3px | 1 | renderer/dashboard.css:1745 |
| -.4px | 1 | renderer/dashboard.css:1418 |
| -0.02em | 1 | renderer/style.css:3664 |
| -0.03em | 1 | renderer/style.css:3696 |
| -0.3px | 1 | renderer/style.css:1235 |
| -1px | 1 | renderer/src/modules/reports.js:156 |
| .01em | 1 | renderer/settings.css:1146 |
| .03em | 1 | renderer/students.css:1016 |
| .08em | 1 | renderer/students.css:1726 |
| .14em | 1 | renderer/login.css:74 |
| .16em | 1 | renderer/login.css:75 |
| .1px | 1 | renderer/titlebar.css:158 |
| .75px | 1 | renderer/expenses.css:100 |
| .85px | 1 | renderer/reports.css:248 |
| 0.03em | 1 | renderer/components.css:263 |
| 1.8px | 1 | renderer/src/modules/dashboard.js:2467 |
| 2.5px | 1 | renderer/style.css:3008 |
| 3.2px | 1 | renderer/license.html:105 |
| 3px | 1 | renderer/src/receipt.js:320 |
| 4px | 1 | renderer/src/receipt.js:158 |
| inherit | 1 | renderer/payments.css:453 |
| normal | 1 | renderer/former.css:25 |

### 1.6 text-transform — 3 distinct

| Value | Count | Locations |
|---|---|---|
| uppercase | 156 | renderer/activitylog.css:145; renderer/archive.css:15,55,102 (+3); renderer/chrome.css:229; +22 files |
| none | 13 | renderer/chrome.css:389; renderer/forms.css:199; renderer/payments.css:701,712,1424 (+2); +4 files |
| capitalize | 4 | renderer/src/modules/students.js:2736,2738,3773 (+1) |

### 1.7 font-variant-numeric / font-feature-settings — 171 declarations

| Property | Value | Count | Selectors (sample) | Locations |
|---|---|---|---|---|
| font-variant-numeric | tabular-nums | 170 | .al-kpi__v ; .arc-kpi__v ; .arc-panel__end ; .arc-table .num | renderer/activitylog.css:35; renderer/archive.css:59,94,109 (+2); renderer/backup.css:57; +24 files |
| font-variant-numeric | inherit | 1 | .ws__amt | renderer/payments.css:453 |

Tabular figures: 170 declarations set `tabular-nums`. Of 384 rules whose selector names a numeric element (pattern `money|amt|amount|num|price|total|balance|figure|stat__v|kpi|date|when|room`), 56 set tabular-nums in the same rule; the remaining 328 do not set it in that rule (they may inherit it from another rule — not resolved statically).

### 1.8 Font files and @font-face

| Font file | Format | Size (KB) | Referenced by @font-face |
|---|---|---|---|
| renderer/vendor/fonts/barlow-400-latin.woff2 | woff2 | 21.7 | renderer/vendor/fonts.css:84 |
| renderer/vendor/fonts/barlow-400-latinext.woff2 | woff2 | 13.9 | renderer/vendor/fonts.css:75 |
| renderer/vendor/fonts/barlow-500-latin.woff2 | woff2 | 21.5 | renderer/vendor/fonts.css:102 |
| renderer/vendor/fonts/barlow-500-latinext.woff2 | woff2 | 14.1 | renderer/vendor/fonts.css:93 |
| renderer/vendor/fonts/barlow-600-latin.woff2 | woff2 | 22.2 | renderer/vendor/fonts.css:120 |
| renderer/vendor/fonts/barlow-600-latinext.woff2 | woff2 | 14.6 | renderer/vendor/fonts.css:111 |
| renderer/vendor/fonts/barlow-700-latin.woff2 | woff2 | 22.3 | renderer/vendor/fonts.css:138 |
| renderer/vendor/fonts/barlow-700-latinext.woff2 | woff2 | 14.5 | renderer/vendor/fonts.css:129 |
| renderer/vendor/fonts/barlow-800-latin.woff2 | woff2 | 22.4 | renderer/vendor/fonts.css:156 |
| renderer/vendor/fonts/barlow-800-latinext.woff2 | woff2 | 14.7 | renderer/vendor/fonts.css:147 |
| renderer/vendor/fonts/barlow-cond-400-latin.woff2 | woff2 | 20.7 | renderer/vendor/fonts.css:174 |
| renderer/vendor/fonts/barlow-cond-400-latinext.woff2 | woff2 | 13.6 | renderer/vendor/fonts.css:165 |
| renderer/vendor/fonts/barlow-cond-600-latin.woff2 | woff2 | 21.8 | renderer/vendor/fonts.css:192 |
| renderer/vendor/fonts/barlow-cond-600-latinext.woff2 | woff2 | 14.2 | renderer/vendor/fonts.css:183 |
| renderer/vendor/fonts/barlow-cond-700-latin.woff2 | woff2 | 21.9 | renderer/vendor/fonts.css:210 |
| renderer/vendor/fonts/barlow-cond-700-latinext.woff2 | woff2 | 14.3 | renderer/vendor/fonts.css:201 |
| renderer/vendor/fonts/inter-latin-ext.woff2 | woff2 | 83.1 | renderer/vendor/fonts.css:4 |
| renderer/vendor/fonts/inter-latin.woff2 | woff2 | 47.1 | renderer/vendor/fonts.css:13 |
| renderer/vendor/fonts/jetbrains-mono-latin-ext.woff2 | woff2 | 11.4 | renderer/vendor/fonts.css:22 |
| renderer/vendor/fonts/jetbrains-mono-latin.woff2 | woff2 | 30.7 | renderer/vendor/fonts.css:31 |
| renderer/vendor/fonts/material-symbols-rounded.woff2 | woff2 | 5219.9 | renderer/vendor/fonts.css:242 |
| renderer/vendor/fonts/outfit-latin-ext.woff2 | woff2 | 14.5 | renderer/vendor/fonts.css:40 |
| renderer/vendor/fonts/outfit-latin.woff2 | woff2 | 31.5 | renderer/vendor/fonts.css:49 |
| renderer/vendor/fonts/roboto-mono-latin-ext.woff2 | woff2 | 22.4 | renderer/vendor/fonts.css:223 |
| renderer/vendor/fonts/roboto-mono-latin.woff2 | woff2 | 32 | renderer/vendor/fonts.css:232 |

| @font-face (file:line) | family | weight | style | src | src file exists |
|---|---|---|---|---|---|
| renderer/vendor/fonts.css:4 | 'Inter' | 300 900 | normal | ./fonts/inter-latin-ext.woff2 | yes |
| renderer/vendor/fonts.css:13 | 'Inter' | 300 900 | normal | ./fonts/inter-latin.woff2 | yes |
| renderer/vendor/fonts.css:22 | 'JetBrains Mono' | 400 500 | normal | ./fonts/jetbrains-mono-latin-ext.woff2 | yes |
| renderer/vendor/fonts.css:31 | 'JetBrains Mono' | 400 500 | normal | ./fonts/jetbrains-mono-latin.woff2 | yes |
| renderer/vendor/fonts.css:40 | 'Outfit' | 400 900 | normal | ./fonts/outfit-latin-ext.woff2 | yes |
| renderer/vendor/fonts.css:49 | 'Outfit' | 400 900 | normal | ./fonts/outfit-latin.woff2 | yes |
| renderer/vendor/fonts.css:75 | 'Barlow' | 400 | normal | ./fonts/barlow-400-latinext.woff2 | yes |
| renderer/vendor/fonts.css:84 | 'Barlow' | 400 | normal | ./fonts/barlow-400-latin.woff2 | yes |
| renderer/vendor/fonts.css:93 | 'Barlow' | 500 | normal | ./fonts/barlow-500-latinext.woff2 | yes |
| renderer/vendor/fonts.css:102 | 'Barlow' | 500 | normal | ./fonts/barlow-500-latin.woff2 | yes |
| renderer/vendor/fonts.css:111 | 'Barlow' | 600 | normal | ./fonts/barlow-600-latinext.woff2 | yes |
| renderer/vendor/fonts.css:120 | 'Barlow' | 600 | normal | ./fonts/barlow-600-latin.woff2 | yes |
| renderer/vendor/fonts.css:129 | 'Barlow' | 700 | normal | ./fonts/barlow-700-latinext.woff2 | yes |
| renderer/vendor/fonts.css:138 | 'Barlow' | 700 | normal | ./fonts/barlow-700-latin.woff2 | yes |
| renderer/vendor/fonts.css:147 | 'Barlow' | 800 | normal | ./fonts/barlow-800-latinext.woff2 | yes |
| renderer/vendor/fonts.css:156 | 'Barlow' | 800 | normal | ./fonts/barlow-800-latin.woff2 | yes |
| renderer/vendor/fonts.css:165 | 'Barlow Condensed' | 400 | normal | ./fonts/barlow-cond-400-latinext.woff2 | yes |
| renderer/vendor/fonts.css:174 | 'Barlow Condensed' | 400 | normal | ./fonts/barlow-cond-400-latin.woff2 | yes |
| renderer/vendor/fonts.css:183 | 'Barlow Condensed' | 600 | normal | ./fonts/barlow-cond-600-latinext.woff2 | yes |
| renderer/vendor/fonts.css:192 | 'Barlow Condensed' | 600 | normal | ./fonts/barlow-cond-600-latin.woff2 | yes |
| renderer/vendor/fonts.css:201 | 'Barlow Condensed' | 700 | normal | ./fonts/barlow-cond-700-latinext.woff2 | yes |
| renderer/vendor/fonts.css:210 | 'Barlow Condensed' | 700 | normal | ./fonts/barlow-cond-700-latin.woff2 | yes |
| renderer/vendor/fonts.css:223 | 'Roboto Mono' | 400 700 | normal | ./fonts/roboto-mono-latin-ext.woff2 | yes |
| renderer/vendor/fonts.css:232 | 'Roboto Mono' | 400 700 | normal | ./fonts/roboto-mono-latin.woff2 | yes |
| renderer/vendor/fonts.css:242 | 'Material Symbols Rounded' | 100 700 | normal | ./fonts/material-symbols-rounded.woff2 | yes |

Network font URLs: none found.

CSP declarations (font-src governs fonts):

| Location | Policy text |
|---|---|
| renderer/license-settings.html:7 | Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;"> <link rel="stylesheet" href="vendor/fonts.css"> <script src="src/icons.js"></script> <style> *, *::before, *::after { box-sizing: border-box; margin: 0 |
| renderer/license.html:10 | Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;"> <link rel="stylesheet" href="vendor/fonts.css"> <style> *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } /* ── THE ACTIVATION SCREEN IS A LIGHT WORKSPACE ───────────────────────── It used to be a dark page with floating violet orbs, which matched nothi |
| renderer/recovery.html:6 | Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;"> <title>Hostyllo — Recovery</title> <style> /* Self-contained on purpose. This screen has to render when the rest of the app cannot, so it depends on no token file, no stylesheet and no font the machine might not have. */ :root { --bg:#1a1c1e; --panel:#232629; --line:#33383d; --ink:# |
| main.js:2449 | Content-Security-Policy': [ "default-src 'self';" + "script-src 'self' 'unsafe-inline';" + "style-src 'self' 'unsafe-inline';" + "font-src 'self' data:;" + "img-src 'self' data: blob:;" + "connect-src 'self';" + "worker-src 'self' blob:;" ] } }); });  |

## 2. Colour

### 2.1 Colour literals — 523 distinct normalised values (#rrggbbaa) from 1477 occurrences

| Normalised | Raw spellings | Count | Sources | Locations |
|---|---|---|---|---|
| #00000000 | transparent | 166 | stylesheet,inline-attr,js-assigned | renderer/cancellations.css:239; renderer/chrome.css:244,254,280 (+1); renderer/components.css:48,79,117 (+2); +17 files |
| #ffffffff | #FFFFFF #fff white #ffffff | 67 | stylesheet,style-block,inline-attr,js-assigned | renderer/chrome.css:119,473,831; renderer/dashboard.css:1478,2204; renderer/login.css:28,137,153; +20 files |
| #0000000a | rgba(0, 0, 0, 0.04) rgba(0,0,0,0.04) | 31 | stylesheet,inline-attr,js-assigned | renderer/style.css:382,418,421 (+16); renderer/tokens.css:107,108,109 (+3); renderer/src/receipt.js:149,149,325 (+3) |
| #94a3b8ff | #94A3B8 #94a3b8 | 23 | style-block,inline-attr,js-assigned | renderer/src/export/engine.js:619,78; renderer/src/modules/dashboard.js:2438,2448,2508 (+3); renderer/src/modules/students.js:3536,3561,3567 (+9); +2 files |
| #e2e8f0ff | #e2e8f0 | 20 | style-block | renderer/license.html:29; renderer/src/modules/dashboard.js:2443,2484,2513 (+1); renderer/src/modules/students.js:3526,3535,3541 (+12) |
| #0000000f | rgba(0, 0, 0, 0.06) rgba(0,0,0,0.06) | 18 | stylesheet | renderer/style.css:320,333,433 (+13); renderer/tokens.css:108,347 |
| #b91c1cff | #B91C1C #b91c1c | 17 | stylesheet,style-block,inline-attr,js-assigned | renderer/dashboard.css:1361; renderer/login.css:176; renderer/style.css:5184; +5 files |
| #2563ebff | #2563EB #2563eb | 16 | stylesheet,style-block,js-assigned | renderer/dashboard.css:1357,1875; renderer/style.css:3242,5174; renderer/titlebar.css:63; +7 files |
| #64748bff | #64748b #64748B | 16 | style-block,inline-attr,js-assigned | renderer/src/modules/dashboard.js:2432; renderer/src/modules/students.js:3511,3512,3521 (+10); main.js:1795; +1 files |
| #00000033 | rgba(0, 0, 0, 0.2) rgba(0,0,0,0.2) | 15 | stylesheet | renderer/style.css:141,387,421 (+12) |
| #000000ff | #000 black | 15 | stylesheet,inline-attr,js-assigned | renderer/dashboard.css:1827,1828; renderer/students.css:1797; renderer/style.css:4090; +4 files |
| #0f172aff | #0F172A #0f172a | 15 | stylesheet,style-block | renderer/chrome.css:121; renderer/src/modules/dashboard.js:2418,2431,2446 (+3); renderer/src/modules/students.js:4988,5013,5029 (+5) |
| #475569ff | #475569 | 15 | stylesheet,style-block,js-assigned | renderer/dashboard.css:1366; renderer/src/modules/dashboard.js:2433,2490; renderer/src/modules/students.js:3526,3567,5001 (+8); +1 files |
| #1d4ed8ff | #1d4ed8 | 13 | stylesheet,style-block,inline-attr | renderer/style.css:3217; renderer/license-settings.html:56; renderer/src/modules/dashboard.js:2505,2521; +1 files |
| #b45309ff | #B45309 #b45309 | 13 | stylesheet,style-block,inline-attr,js-assigned | renderer/dashboard.css:1359,1927; renderer/style.css:5179; renderer/license-settings.html:60; +4 files |
| #d7c3b5ff | #d7c3b5 | 13 | stylesheet | renderer/style.css:4225,4242,4314 (+10) |
| #f1f5f9ff | #F1F5F9 #f1f5f9 | 13 | stylesheet,style-block,js-assigned | renderer/dashboard.css:1365,1876; renderer/license.html:340; renderer/src/modules/dashboard.js:2487,2489; +2 files |
| #0000001a | rgba(0, 0, 0, 0.1) rgba(0,0,0,0.1) | 12 | stylesheet | renderer/style.css:426,641,1484 (+9) |
| #00000014 | rgba(0, 0, 0, 0.08) rgba(0,0,0,0.08) | 11 | stylesheet | renderer/style.css:453,665,702 (+6); renderer/tokens.css:109,348 |
| #3b82f6ff | #3B82F6 #3b82f6 | 11 | stylesheet,js-assigned | renderer/dashboard.css:1926; renderer/login.css:21; renderer/style.css:2924,2924,2924 (+2); +3 files |
| #0000004d | rgba(0, 0, 0, .30) rgba(0, 0, 0, 0.3) rgba(0,0,0,0.3) | 10 | stylesheet | renderer/chrome.css:695; renderer/style.css:142,480,2422 (+6) |
| #15803dff | #15803D #15803d | 10 | stylesheet,style-block,inline-attr | renderer/dashboard.css:1928,1928; renderer/src/modules/dashboard.js:2494; renderer/src/modules/students.js:5014,5035,5035 (+4) |
| #00000026 | rgba(0, 0, 0, 0.15) rgba(0,0,0,0.15) | 9 | stylesheet | renderer/style.css:745,1421,1422 (+6) |
| #16a34aff | #16A34A #16a34a | 9 | stylesheet,style-block,inline-attr,js-assigned | renderer/dashboard.css:1363; renderer/login.css:198,274; renderer/src/modules/dashboard.js:2452; +3 files |
| #1e293bff | #1e293b | 9 | style-block,js-assigned | renderer/src/modules/dashboard.js:2430,2437,2469 (+1); renderer/src/modules/students.js:3507,5003,5045 (+2) |
| #cbd5e1ff | #CBD5E1 #cbd5e1 | 9 | stylesheet,style-block | renderer/login.css:133; renderer/src/modules/dashboard.js:2469,2472,2502 (+2); renderer/src/modules/students.js:3548,5037,5045 |
| #dcfce7ff | #DCFCE7 #dcfce7 | 8 | stylesheet,style-block | renderer/dashboard.css:1364; renderer/whatsapp.css:8; renderer/src/modules/dashboard.js:2452,2494; +1 files |
| #ef4444ff | #ef4444 #EF4444 | 8 | stylesheet,inline-attr,js-assigned | renderer/chrome.css:473; renderer/rooms.css:268; renderer/style.css:3263; +3 files |
| #ffffff0f | rgba(255, 255, 255, 0.06) rgba(255,255,255,0.06) | 8 | stylesheet,js-assigned | renderer/components.css:127,182,225; renderer/style.css:2900,3036,3393 (+1); renderer/src/modules/modals.js:507 |
| #ffffff14 | rgba(255,255,255,.08) rgba(255, 255, 255, 0.08) rgba(255,255,255,0.08) | 8 | stylesheet,js-assigned | renderer/chrome.css:45; renderer/components.css:34,113; renderer/style.css:35,3143; +1 files |
| #0000001f | rgba(0,0,0,.12) rgba(0, 0, 0, 0.12) rgba(0,0,0,0.12) | 7 | stylesheet | renderer/settings.css:139,193; renderer/style.css:375,2911,2912 (+2) |
| #00000080 | rgba(0, 0, 0, 0.5) rgba(0,0,0,.5) rgba(0,0,0,0.5) | 7 | stylesheet,inline-attr,js-assigned | renderer/style.css:1988,2213,2346 (+1); renderer/tokens.css:256; renderer/index.html:441; +1 files |
| #dbeafeff | #DBEAFE #dbeafe | 7 | stylesheet,style-block | renderer/dashboard.css:1358; renderer/login.css:223; renderer/src/modules/dashboard.js:2450; +1 files |
| #dc2626ff | #dc2626 | 7 | style-block | renderer/license.html:37; renderer/src/modules/dashboard.js:2451,2496,2510 (+1); renderer/src/modules/students.js:3538,5017 |
| #eff6ffff | #EFF6FF #eff6ff | 7 | stylesheet,style-block,js-assigned | renderer/dashboard.css:1875; renderer/login.css:23; renderer/license-settings.html:57,62; +3 files |
| #fee2e2ff | #FEE2E2 #fee2e2 | 7 | stylesheet,style-block | renderer/dashboard.css:1362; renderer/src/modules/dashboard.js:2451,2496,2510; renderer/src/modules/students.js:5017,5039,5041 |
| #ffffff1a | rgba(255, 255, 255, .10) rgba(255,255,255,.10) rgba(255, 255, 255, 0.1) rgba(255,255,255,0.1) | 7 | stylesheet,js-assigned | renderer/chrome.css:267,830; renderer/style.css:1123,2961; renderer/ui-kit.css:69; +2 files |
| #00000059 | rgba(0, 0, 0, 0.35) rgba(0,0,0,0.35) rgba(0,0,0,.35) | 6 | stylesheet,js-assigned | renderer/style.css:138,140,665 (+2); renderer/src/storage.js:203 |
| #60a5fa1a | rgba(96,165,250,0.10) | 6 | stylesheet,style-block | renderer/style.css:4410,4413,4515 (+2); renderer/license-settings.html:40 |
| #8b5cf6ff | #8B5CF6 #8b5cf6 | 6 | stylesheet,inline-attr,js-assigned | renderer/dashboard.css:1929; renderer/src/modules/reports.js:1115,1310,1382; renderer/src/modules/dashboard.js:3357,3513 |
| #d97706ff | #D97706 #d97706 | 6 | stylesheet,style-block,js-assigned | renderer/dashboard.css:1927; renderer/rooms.css:218,218; renderer/license.html:41; +1 files |
| #f8fafcff | #f8fafc | 6 | style-block | renderer/src/modules/dashboard.js:2500,2507; renderer/src/modules/students.js:3556,3558,5026 (+1) |
| #fef2f2ff | #FEF2F2 #fef2f2 | 6 | stylesheet,style-block,js-assigned | renderer/login.css:176; renderer/license-settings.html:61; renderer/license.html:38,502,503 (+1) |
| #00000066 | rgba(0, 0, 0, 0.4) | 5 | stylesheet | renderer/style.css:139,483; renderer/tokens.css:255,256,257 |
| #00000099 | rgba(0, 0, 0, 0.6) rgba(0,0,0,0.6) | 5 | stylesheet,js-assigned | renderer/style.css:1958,2493,2734; renderer/tokens.css:257; renderer/src/modules/modals.js:474 |
| #111111ff | #111111 #111 | 5 | stylesheet,inline-attr,js-assigned | renderer/style.css:2839; renderer/src/receipt.js:129,144,287 (+1) |
| #1a1c1eff | #1a1c1e | 5 | style-block,js-assigned | renderer/recovery.html:14; main.js:991,1184,1214; renderer/license-settings.html:20 |
| #2563eb4d | rgba(37,99,235,0.3) | 5 | inline-attr,js-assigned | renderer/src/modules/dashboard.js:3056,3106,3794; renderer/src/modules/reports.js:224; renderer/src/modules/students.js:4679 |
| #34d39933 | rgba(52,211,153,0.2) | 5 | stylesheet | renderer/style.css:2420,2431,2556 (+2) |
| #38bdf814 | rgba(56, 189, 248, 0.08) rgba(56,189,248,0.08) | 5 | stylesheet | renderer/style.css:1031,3059,3077 (+2) |
| #38bdf8ff | #38bdf8 | 5 | stylesheet | renderer/style.css:1043,1046,3084 (+2) |
| #3b82f608 | rgba(59,130,246, 0.03) rgba(59,130,246,0.03) | 5 | stylesheet | renderer/style.css:461,1383,2940 (+2) |
| #555555ff | #555 | 5 | inline-attr | renderer/app.js:199; renderer/src/receipt.js:158,169,170 (+1) |
| #7c3aedff | #7c3aed #7C3AED | 5 | style-block,inline-attr,js-assigned | renderer/src/modules/dashboard.js:2449; renderer/src/license.js:94,114; renderer/src/modules/modals.js:295; +1 files |
| #93c5fdff | #93c5fd #93C5FD | 5 | stylesheet,style-block,js-assigned | renderer/style.css:2924,2924,3242; renderer/license-settings.html:34; renderer/src/utils.js:274 |
| #bfdbfeff | #BFDBFE #bfdbfe | 5 | stylesheet,style-block | renderer/dashboard.css:2319; renderer/login.css:184; renderer/license-settings.html:63; +1 files |
| #e05252ff | #e05252 | 5 | inline-attr,js-assigned | renderer/src/license.js:94,94,117 (+1); renderer/src/modules/nav.js:519 |
| #f871711a | rgba(248,113,113,0.1) rgba(248,113,113,0.10) | 5 | stylesheet | renderer/style.css:2433,2525,3308 (+2) |
| #f8717133 | rgba(248, 113, 113, 0.2) rgba(248,113,113,0.2) | 5 | stylesheet | renderer/style.css:1186,2433,3200 (+2) |
| #fecacaff | #FECACA #fecaca | 5 | stylesheet,style-block,js-assigned | renderer/login.css:176; renderer/license-settings.html:61; renderer/license.html:39,502,506 |
| #ffffff0a | rgba(255, 255, 255, 0.04) rgba(255,255,255,0.04) | 5 | stylesheet | renderer/components.css:107; renderer/style.css:2432,2900,3142 (+1) |
| #ffffff12 | rgba(255,255,255,.07) rgba(255,255,255,0.07) | 5 | stylesheet,js-assigned | renderer/chrome.css:29; renderer/style.css:4114; renderer/src/modules/dashboard.js:3517; +1 files |
| #0ea5e9ff | #0ea5e9 | 4 | stylesheet | renderer/style.css:328,414,4300 (+1) |
| #0f172a0f | rgba(15, 23, 42, .06) rgba(15,23,42,.06) rgba(15, 23, 42, 0.06) | 4 | stylesheet | renderer/dashboard.css:30; renderer/students.css:830; renderer/style.css:296,298 |
| #0f172a29 | rgba(15, 23, 42, .16) rgba(15,23,42,.16) | 4 | stylesheet,style-block | renderer/dashboard.css:1587; renderer/students.css:1238; renderer/style.css:2054; +1 files |
| #2451d6ff | #2451D6 | 4 | stylesheet | renderer/dashboard.css:1926,1926; renderer/style.css:275; renderer/ui-kit.css:42 |
| #2563eb47 | rgba(37,99,235,.28) rgba(37, 99, 235, .28) | 4 | stylesheet,style-block | renderer/chrome.css:583; renderer/style.css:5173; renderer/license.html:88,192 |
| #2ec98a4d | rgba(46,201,138,0.3) | 4 | inline-attr,js-assigned | renderer/src/modules/reports.js:57,223,68; renderer/src/modules/settings.js:3488 |
| #2ec98aff | #2ec98a | 4 | inline-attr,js-assigned | renderer/src/license.js:118,60; renderer/src/config.js:86; renderer/src/modules/modals.js:294 |
| #34d3991a | rgba(52, 211, 153, 0.1) rgba(52,211,153,0.1) | 4 | stylesheet | renderer/style.css:2287,2431,2548 (+1) |
| #34d3991f | rgba(52,211,153,0.12) | 4 | stylesheet,style-block | renderer/style.css:3420,3903,4043; renderer/license-settings.html:37 |
| #38bdf81f | rgba(56,189,248,0.12) | 4 | stylesheet | renderer/style.css:2128,3083,3161 (+1) |
| #4a9cf0ff | #4a9cf0 | 4 | js-assigned | renderer/src/config.js:84; renderer/src/modules/modals.js:292; renderer/src/modules/settings.js:3143,3198 |
| #60a5fa0a | rgba(96,165,250,0.04) | 4 | stylesheet | renderer/style.css:4373,4493,4602 (+1) |
| #60a5fa33 | rgba(96,165,250,0.2) rgba(96,165,250,0.20) | 4 | stylesheet | renderer/style.css:4381,4516,4586 (+1) |
| #6b7a99ff | #6B7A99 #6b7a99 | 4 | style-block,js-assigned | renderer/app.js:92; renderer/src/modules/modals.js:491,515,534 |
| #888888ff | #888 | 4 | inline-attr | renderer/src/receipt.js:135,308,390 (+1) |
| #dfe5ecff | #DFE5EC | 4 | js-assigned | renderer/index.html:164,169,189 (+1) |
| #e052524d | rgba(224,82,82,0.3) | 4 | inline-attr,js-assigned | renderer/src/modules/reports.js:62,116,68; renderer/src/modules/settings.js:3470 |
| #e0e8f0ff | #e0e8f0 | 4 | js-assigned | renderer/src/modules/modals.js:486,505,508 (+1) |
| #f59e0bff | #F59E0B #f59e0b | 4 | stylesheet,js-assigned | renderer/dashboard.css:1927; renderer/rooms.css:217,217; renderer/src/modules/reports.js:1309 |
| #fca5a5ff | #fca5a5 | 4 | style-block,js-assigned | renderer/src/modules/dashboard.js:2475; renderer/src/modules/students.js:5051,5068; renderer/license.html:503 |
| #0000002e | rgba(0,0,0,0.18) | 3 | stylesheet,inline-attr,js-assigned | renderer/style.css:1800; renderer/src/receipt.js:144,146 |
| #059669ff | #059669 | 3 | stylesheet,style-block | renderer/style.css:3257; renderer/license.html:40,203 |
| #0ea5e90f | rgba(14, 165, 233, 0.06) rgba(14,165,233,0.06) | 3 | stylesheet | renderer/style.css:322,3065,4295 |
| #0f172a14 | rgba(15,23,42,.08) rgba(15, 23, 42, .08) rgba(15, 23, 42, 0.08) | 3 | stylesheet | renderer/chrome.css:120; renderer/dashboard.css:39; renderer/style.css:293 |
| #0f766eff | #0f766e #0F766E | 3 | style-block,inline-attr,js-assigned | renderer/src/modules/students.js:5036,5118; renderer/src/utils.js:287 |
| #181715ff | #181715 | 3 | stylesheet | renderer/style.css:28; renderer/tokens.css:172,198 |
| #1e3a8aff | #1e3a8a | 3 | style-block,inline-attr | renderer/src/modules/students.js:3510,3520,3665 |
| #1e3c6aff | #1e3c6a | 3 | inline-attr,js-assigned | renderer/src/license.js:91,95,100 |
| #22c55eff | #22C55E #22c55e | 3 | stylesheet,js-assigned | renderer/dashboard.css:1928; renderer/src/modules/dashboard.js:3357; renderer/src/modules/reports.js:1309 |
| #2451d614 | rgba(36, 81, 214, 0.08) | 3 | stylesheet | renderer/style.css:276; renderer/tokens.css:369,376 |
| #2563eb1a | rgba(37, 99, 235, 0.10) rgba(37, 99, 235, .10) rgba(37,99,235,0.1) | 3 | stylesheet,inline-attr | renderer/style.css:297,5172; renderer/src/modules/dashboard.js:2253 |
| #2563eb1f | rgba(37,99,235,0.12) rgba(37, 99, 235, .12) | 3 | stylesheet,style-block | renderer/style.css:1840,1843; renderer/license.html:171 |
| #3b82f61a | rgba(59,130,246,.10) rgba(59,130,246,0.10) | 3 | stylesheet | renderer/login.css:110; renderer/style.css:2839,4552 |
| #3b82f633 | rgba(59,130,246, 0.2) rgba(59,130,246,0.2) | 3 | stylesheet | renderer/style.css:435,772,2542 |
| #3b82f659 | rgba(59,130,246, 0.35) rgba(59,130,246,0.35) | 3 | stylesheet | renderer/style.css:680,2175,3560 |
| #4f46e5ff | #4f46e5 #4F46E5 | 3 | style-block,js-assigned | renderer/license.html:87,190; renderer/src/utils.js:287 |
| #52443aff | #52443a | 3 | stylesheet | renderer/style.css:4222,4237,4525 |
| #7ba0ffff | #7BA0FF | 3 | stylesheet | renderer/style.css:60; renderer/tokens.css:252; renderer/ui-kit.css:20 |
| #bbbbbbff | #bbb | 3 | inline-attr | renderer/src/receipt.js:148,321,324 |
| #c0402fff | #C0402F | 3 | stylesheet | renderer/tokens.css:79,339; renderer/ui-kit.css:44 |
| #d9e2f2ff | #D9E2F2 | 3 | style-block,js-assigned | renderer/app.js:88,96; renderer/src/export/engine.js:79 |
| #e0525266 | rgba(224,82,82,0.4) | 3 | js-assigned | renderer/src/license.js:100; renderer/src/modules/reports.js:154,182 |
| #e8f5eeff | #E8F5EE | 3 | stylesheet | renderer/tokens.css:70,330; renderer/ui-kit.css:43 |
| #eaf0feff | #EAF0FE | 3 | stylesheet | renderer/tokens.css:82,342; renderer/ui-kit.css:42 |
| #f5f5f5ff | #f5f5f5 | 3 | stylesheet,style-block | renderer/chrome.css:26; renderer/style.css:2849; renderer/license-settings.html:48 |
| #f8717140 | rgba(248, 113, 113, 0.25) rgba(248,113,113,0.25) | 3 | stylesheet | renderer/style.css:1187,1420,2254 |
| #f871714d | rgba(248, 113, 113, 0.3) rgba(248,113,113,0.3) | 3 | stylesheet | renderer/style.css:1181,2244,3778 |
| #f87171ff | #f87171 | 3 | stylesheet,style-block | renderer/chrome.css:273; renderer/style.css:3263; renderer/license-settings.html:39 |
| #f97316ff | #F97316 #f97316 | 3 | stylesheet,js-assigned | renderer/dashboard.css:2117; renderer/src/modules/dashboard.js:3357; renderer/src/modules/reports.js:1309 |
| #fafaf8ff | #fafaf8 | 3 | inline-attr | renderer/src/receipt.js:144,148,324 |
| #fbbf24ff | #fbbf24 | 3 | stylesheet,style-block,js-assigned | renderer/whatsapp.css:70; renderer/license-settings.html:38; renderer/src/modules/dashboard.js:3495 |
| #fbebe8ff | #FBEBE8 | 3 | stylesheet | renderer/tokens.css:78,338; renderer/ui-kit.css:44 |
| #fbf2e2ff | #FBF2E2 | 3 | stylesheet | renderer/tokens.css:74,334; renderer/ui-kit.css:46 |
| #fef3c7ff | #FEF3C7 #fef3c7 | 3 | stylesheet,style-block | renderer/dashboard.css:1360; renderer/src/modules/dashboard.js:2495; renderer/src/modules/students.js:5018 |
| #ffb4ab1f | rgba(255,180,171,0.12) | 3 | stylesheet | renderer/style.css:4412,4514,4825 |
| #ffffff08 | rgba(255,255,255,0.03) | 3 | stylesheet | renderer/style.css:2940,3037,4595 |
| #ffffff1f | rgba(255, 255, 255, 0.12) rgba(255,255,255,0.12) | 3 | stylesheet,js-assigned | renderer/components.css:54,108; renderer/src/modules/modals.js:473 |
| #ffffff26 | rgba(255,255,255,0.15) | 3 | stylesheet | renderer/style.css:3228,3236,3244 |
| #0000000d | rgba(0,0,0,0.05) | 2 | stylesheet | renderer/style.css:3942,4343 |
| #00000073 | rgba(0, 0, 0, 0.45) rgba(0,0,0,0.45) | 2 | stylesheet,style-block | renderer/style.css:137; renderer/license-settings.html:42 |
| #000000b3 | rgba(0, 0, 0, 0.7) rgba(0,0,0,0.7) | 2 | stylesheet | renderer/style.css:1534,2900 |
| #000000d9 | rgba(0,0,0,.85) rgba(0,0,0,0.85) | 2 | stylesheet,js-assigned | renderer/style.css:2714; renderer/src/license.js:92 |
| #0284c7ff | #0284c7 | 2 | stylesheet | renderer/style.css:325,4298 |
| #0ea5e914 | rgba(14, 165, 233, 0.08) | 2 | stylesheet | renderer/style.css:324,4297 |
| #0f0f0ffa | rgba(15, 15, 15, 0.98) rgba(15,15,15,0.98) | 2 | stylesheet | renderer/style.css:634,4305 |
| #0f172a24 | rgba(15, 23, 42, .14) rgba(15,23,42,.14) | 2 | stylesheet | renderer/cancellations.css:205; renderer/listkit.css:331 |
| #10b981ff | #10b981 | 2 | stylesheet,style-block | renderer/style.css:3257; renderer/license.html:203 |
| #123b8fff | #123B8F | 2 | style-block,js-assigned | renderer/app.js:96; renderer/src/export/engine.js:74 |
| #141824ff | #141824 | 2 | js-assigned | renderer/src/modules/modals.js:481,504 |
| #155eefff | #155EEF | 2 | style-block,js-assigned | renderer/app.js:95; renderer/src/export/engine.js:73 |
| #1b3faeff | #1B3FAE | 2 | stylesheet | renderer/tokens.css:83,343 |
| #1c1b1bff | #1c1b1b | 2 | stylesheet,js-assigned | renderer/style.css:4548; renderer/src/modules/dashboard.js:3516 |
| #1e3050ff | #1e3050 | 2 | js-assigned | renderer/src/license.js:114,112 |
| #1f1e1bff | #1F1E1B | 2 | stylesheet | renderer/style.css:33; renderer/tokens.css:170 |
| #1f8a5aff | #1F8A5A | 2 | stylesheet | renderer/tokens.css:71; renderer/ui-kit.css:43 |
| #222222ff | #222 | 2 | inline-attr,js-assigned | renderer/src/receipt.js:138,140 |
| #2563eb59 | rgba(37,99,235,0.35) | 2 | stylesheet | renderer/style.css:1842,4690 |
| #25d366ff | #25D366 #25d366 | 2 | stylesheet | renderer/dashboard.css:1327; renderer/whatsapp.css:7 |
| #2ec98a1f | rgba(46,201,138,.12) rgba(46,201,138,0.12) | 2 | stylesheet,inline-attr | renderer/dashboard.css:178; renderer/src/modules/payments.js:2139 |
| #2ec98a66 | rgba(46,201,138,0.4) | 2 | js-assigned | renderer/src/modules/reports.js:154,180 |
| #333333ff | #333 | 2 | inline-attr | renderer/src/receipt.js:168,306 |
| #334155ff | #334155 | 2 | style-block,js-assigned | renderer/src/modules/dashboard.js:2463; renderer/src/utils.js:288 |
| #34d399ff | #34d399 | 2 | stylesheet,style-block | renderer/style.css:2924; renderer/license-settings.html:37 |
| #38bdf80f | rgba(56,189,248,0.06) rgba(56, 189, 248, 0.06) | 2 | stylesheet | renderer/style.css:3058,4270 |
| #38bdf866 | rgba(56, 189, 248, 0.4) rgba(56,189,248,0.4) | 2 | stylesheet | renderer/style.css:471,3057 |
| #3b82f62e | rgba(59,130,246,0.18) | 2 | stylesheet | renderer/style.css:2839,2897 |
| #3b82f6b3 | rgba(59,130,246,0.7) | 2 | stylesheet | renderer/style.css:3920,3928 |
| #3fbf8324 | rgba(63, 191, 131, 0.14) | 2 | stylesheet | renderer/style.css:57; renderer/tokens.css:239 |
| #3fbf83ff | #3FBF83 | 2 | stylesheet | renderer/tokens.css:240; renderer/ui-kit.css:21 |
| #44e2cd1a | rgba(68,226,205,0.10) | 2 | stylesheet | renderer/style.css:4414,4517 |
| #45dfa41a | rgba(69,223,164,0.10) | 2 | stylesheet | renderer/style.css:4411,4513 |
| #4a9cf04d | rgba(74,156,240,0.3) | 2 | inline-attr | renderer/src/modules/reports.js:120,225 |
| #4d6580ff | #4d6580 | 2 | inline-attr | renderer/src/license.js:106,125 |
| #5b4bc4ff | #5B4BC4 | 2 | stylesheet | renderer/style.css:277; renderer/ui-kit.css:45 |
| #60a5fa0d | rgba(96,165,250,0.05) | 2 | stylesheet | renderer/style.css:4612,4688 |
| #60a5fa14 | rgba(96,165,250,0.08) | 2 | stylesheet | renderer/style.css:4516,4826 |
| #60a5fa29 | rgba(96,165,250,.16) | 2 | stylesheet | renderer/whatsapp.css:43,119 |
| #60a5fa40 | rgba(96,165,250,0.25) | 2 | stylesheet | renderer/style.css:4515,4612 |
| #60a5faff | #60a5fa | 2 | style-block | renderer/license-settings.html:33; renderer/src/modules/students.js:3517 |
| #666666ff | #666 | 2 | inline-attr | renderer/src/receipt.js:265,307 |
| #6d28d9ff | #6D28D9 | 2 | stylesheet | renderer/dashboard.css:1929,1929 |
| #7ba0ff24 | rgba(123, 160, 255, 0.14) | 2 | stylesheet | renderer/style.css:61; renderer/tokens.css:251 |
| #7dd3fcff | #7dd3fc | 2 | stylesheet | renderer/style.css:1032,4278 |
| #86efacff | #86efac | 2 | style-block | renderer/src/modules/dashboard.js:2476; renderer/src/modules/students.js:5051 |
| #8fa5c8ff | #8fa5c8 | 2 | inline-attr,js-assigned | renderer/src/license.js:126,102 |
| #9b6df0ff | #9b6df0 | 2 | js-assigned | renderer/src/config.js:85; renderer/src/modules/modals.js:293 |
| #9b8cf0ff | #9B8CF0 | 2 | stylesheet | renderer/style.css:62; renderer/ui-kit.css:23 |
| #a09d96ff | #A09D96 #a09d96 | 2 | stylesheet | renderer/tokens.css:183,456 |
| #a3a3a3ff | #a3a3a3 | 2 | js-assigned | renderer/license-settings.html:30,53 |
| #a78bfaff | #A78BFA #a78bfa | 2 | stylesheet,inline-attr | renderer/dashboard.css:1933; renderer/src/license.js:97 |
| #ad7a1eff | #AD7A1E | 2 | stylesheet | renderer/tokens.css:75; renderer/ui-kit.css:46 |
| #b3c8faff | #B3C8FA | 2 | stylesheet | renderer/tokens.css:84,344 |
| #bfe3d0ff | #BFE3D0 | 2 | stylesheet | renderer/tokens.css:72,332 |
| #c084fc1a | rgba(192,132,252,0.10) | 2 | stylesheet | renderer/style.css:4415,4518 |
| #c084fc40 | rgba(192,132,252,0.25) | 2 | stylesheet | renderer/style.css:1424,4518 |
| #c2410cff | #C2410C | 2 | stylesheet | renderer/dashboard.css:2117,2117 |
| #d9a44124 | rgba(217, 164, 65, 0.14) | 2 | stylesheet | renderer/style.css:59; renderer/tokens.css:243 |
| #d9a441ff | #D9A441 | 2 | stylesheet | renderer/tokens.css:244; renderer/ui-kit.css:24 |
| #dbe7ffff | #dbe7ff | 2 | style-block | renderer/license.html:36,69 |
| #dc26261a | rgba(220, 38, 38, .10) rgba(220,38,38,.10) | 2 | stylesheet,style-block | renderer/style.css:5182; renderer/license.html:173 |
| #e0e0e0ff | #e0e0e0 | 2 | inline-attr,js-assigned | renderer/src/receipt.js:144,146 |
| #e4e7eeff | #E4E7EE | 2 | stylesheet | renderer/style.css:244; renderer/tokens.css:297 |
| #e5e5e5ff | #e5e5e5 | 2 | style-block | renderer/license-settings.html:29,49 |
| #ecfdf5ff | #ecfdf5 | 2 | style-block | renderer/license-settings.html:59; renderer/license.html:146 |
| #edf1f5ff | #EDF1F5 | 2 | stylesheet | renderer/login.css:34,40 |
| #eef2f6ff | #EEF2F6 | 2 | stylesheet | renderer/login.css:34,40 |
| #efd9a8ff | #EFD9A8 | 2 | stylesheet | renderer/tokens.css:76,336 |
| #f0796a24 | rgba(240, 121, 106, 0.14) | 2 | stylesheet | renderer/style.css:55; renderer/tokens.css:247 |
| #f0796aff | #F0796A | 2 | stylesheet | renderer/tokens.css:248; renderer/ui-kit.css:22 |
| #f0a03059 | rgba(240,160,48,.35) rgba(240,160,48,0.35) | 2 | stylesheet,inline-attr | renderer/payments.css:159; renderer/src/modules/settings.js:2942 |
| #f0a030ff | #f0a030 | 2 | js-assigned | renderer/src/config.js:88; renderer/src/modules/modals.js:296 |
| #f2c5bcff | #F2C5BC | 2 | stylesheet | renderer/tokens.css:80,340 |
| #f3f3f3ff | #f3f3f3 | 2 | stylesheet | renderer/style.css:4324,4496 |
| #f5f6f9ff | #F5F6F9 | 2 | stylesheet | renderer/style.css:237; renderer/tokens.css:296 |
| #f7f9fbff | #F7F9FB | 2 | stylesheet | renderer/login.css:34,40 |
| #f8717114 | rgba(248,113,113,0.08) | 2 | stylesheet | renderer/style.css:3199,3726 |
| #f871711f | rgba(248,113,113,0.12) | 2 | stylesheet,style-block | renderer/style.css:3421; renderer/license-settings.html:39 |
| #fafafaff | #fafafa | 2 | stylesheet,js-assigned | renderer/style.css:4462; renderer/license-settings.html:47 |
| #fbbf241a | rgba(251,191,36,0.10) | 2 | stylesheet | renderer/style.css:3906,4520 |
| #fbbf241f | rgba(251,191,36,.12) rgba(251,191,36,0.12) | 2 | stylesheet,style-block | renderer/whatsapp.css:67; renderer/license-settings.html:38 |
| #fbbf2440 | rgba(251,191,36,0.25) | 2 | stylesheet | renderer/style.css:1426,4520 |
| #fde68aff | #fde68a | 2 | style-block,js-assigned | renderer/license-settings.html:60; renderer/license.html:505 |
| #ff4d6d4d | rgba(255,77,109,0.3) | 2 | inline-attr | renderer/src/modules/students.js:4336,4647 |
| #ffb4ab33 | rgba(255,180,171,0.20) rgba(255,180,171,0.2) | 2 | stylesheet | renderer/style.css:4671,4825 |
| #fffbebff | #fffbeb | 2 | style-block,js-assigned | renderer/license-settings.html:60; renderer/license.html:505 |
| #ffffff0d | rgba(255,255,255,0.05) | 2 | stylesheet,js-assigned | renderer/style.css:3269; renderer/src/modules/modals.js:500 |
| #ffffff0e | rgba(255,255,255,.055) | 2 | stylesheet | renderer/chrome.css:318; renderer/ui-kit.css:69 |
| #ffffff17 | rgba(255,255,255,.09) | 2 | stylesheet | renderer/chrome.css:25; renderer/ui-kit.css:25 |
| #ffffff47 | rgba(255,255,255,.28) | 2 | stylesheet,style-block | renderer/chrome.css:302; renderer/src/modules/students.js:3532 |
| #ffffffeb | rgba(255,255,255,0.92) | 2 | stylesheet | renderer/style.css:3955,4312 |
| #00000012 | rgba(0,0,0,0.07) | 1 | style-block | renderer/license-settings.html:64 |
| #00000024 | rgba(0, 0, 0, .14) | 1 | stylesheet | renderer/titlebar.css:134 |
| #00000047 | rgba(0, 0, 0, .28) | 1 | stylesheet | renderer/titlebar.css:75 |
| #00000057 | rgba(0,0,0,.34) | 1 | stylesheet | renderer/students.css:832 |
| #00000061 | rgba(0, 0, 0, .38) | 1 | stylesheet | renderer/activitylog.css:123 |
| #000000a6 | rgba(0,0,0,0.65) | 1 | stylesheet | renderer/style.css:4595 |
| #000000bf | rgba(0, 0, 0, 0.75) | 1 | stylesheet | renderer/style.css:1518 |
| #000000cc | rgba(0, 0, 0, .8) | 1 | stylesheet | renderer/style.css:2473 |
| #01a651ff | #01a651 | 1 | stylesheet | renderer/style.css:2134 |
| #0369a1ff | #0369a1 | 1 | style-block | renderer/src/modules/dashboard.js:2492 |
| #047857ff | #047857 | 1 | style-block | renderer/license-settings.html:59 |
| #0596691f | rgba(5,150,105,.12) | 1 | style-block | renderer/license.html:174 |
| #05966947 | rgba(5, 150, 105, .28) | 1 | style-block | renderer/license.html:204 |
| #06b6d4ff | #06b6d4 | 1 | js-assigned | renderer/src/modules/reports.js:1310 |
| #071428ff | #071428 | 1 | inline-attr | renderer/src/license.js:91 |
| #087443ff | #087443 | 1 | js-assigned | renderer/src/export/engine.js:82 |
| #0891b2ff | #0891B2 | 1 | js-assigned | renderer/src/utils.js:287 |
| #0a0a00ff | #0a0a00 | 1 | stylesheet | renderer/style.css:1156 |
| #0a1525ff | #0a1525 | 1 | inline-attr | renderer/src/license.js:124 |
| #0e0e0eff | #0e0e0e | 1 | stylesheet | renderer/style.css:4220 |
| #0e7d8714 | rgba(14, 125, 135, 0.08) | 1 | stylesheet | renderer/style.css:268 |
| #0e7d87ff | #0E7D87 | 1 | stylesheet | renderer/style.css:267 |
| #0ea5e90d | rgba(14,165,233,0.05) | 1 | stylesheet | renderer/style.css:3064 |
| #0ea5e926 | rgba(14, 165, 233, 0.15) | 1 | stylesheet | renderer/style.css:326 |
| #0ea5e94d | rgba(14,165,233,0.3) | 1 | stylesheet | renderer/style.css:3063 |
| #0f0f0fff | #0f0f0f | 1 | style-block | renderer/license-settings.html:26 |
| #0f172a0e | rgba(15,23,42,.055) | 1 | stylesheet | renderer/chrome.css:124 |
| #0f172a12 | rgba(15, 23, 42, .07) | 1 | stylesheet | renderer/chrome.css:835 |
| #0f172a13 | rgba(15, 23, 42, 0.075) | 1 | stylesheet | renderer/style.css:295 |
| #0f172a17 | rgba(15,23,42,.09) | 1 | stylesheet | renderer/chrome.css:128 |
| #0f172a1a | rgba(15, 23, 42, .10) | 1 | stylesheet | renderer/dashboard.css:2601 |
| #0f172a2e | rgba(15,23,42,.18) | 1 | stylesheet | renderer/students.css:1217 |
| #0f1a2eff | #0f1a2e | 1 | inline-attr | renderer/src/license.js:111 |
| #0f255712 | rgba(15, 37, 87, .07) | 1 | style-block | renderer/license.html:44 |
| #0f25571a | rgba(15, 37, 87, .10) | 1 | style-block | renderer/license.html:45 |
| #0f2557ff | #0f2557 | 1 | style-block | renderer/license.html:26 |
| #10b98166 | rgba(16,185,129,0.4) | 1 | stylesheet | renderer/style.css:3258 |
| #131211ff | #131211 | 1 | stylesheet | renderer/style.css:32 |
| #131b2eff | #131B2E | 1 | stylesheet | renderer/style.css:241 |
| #1320301a | rgba(19, 32, 48, .10) | 1 | stylesheet | renderer/login.css:58 |
| #141414e0 | rgba(20, 20, 20, 0.88) | 1 | stylesheet | renderer/style.css:2894 |
| #141414ff | #141414 | 1 | style-block | renderer/license-settings.html:24 |
| #14b8a6ff | #14b8a6 | 1 | js-assigned | renderer/src/modules/reports.js:1309 |
| #1522380d | rgba(21, 34, 56, .05) | 1 | stylesheet | renderer/chrome.css:693 |
| #1522381a | rgba(21, 34, 56, 0.10) | 1 | stylesheet | renderer/style.css:292 |
| #152238b8 | rgba(21,34,56,.72) | 1 | stylesheet | renderer/rooms.css:145 |
| #152238ff | #152238 | 1 | stylesheet | renderer/tokens.css:300 |
| #155eef47 | rgba(21,94,239,.28) | 1 | style-block | renderer/app.js:95 |
| #161616ff | #161616 | 1 | js-assigned | renderer/src/modules/dashboard.js:3371 |
| #16202eff | #16202E | 1 | stylesheet | renderer/login.css:24 |
| #166534ff | #166534 | 1 | style-block | renderer/src/modules/students.js:3524 |
| #171717ff | #171717 | 1 | style-block | renderer/license-settings.html:51 |
| #17233aff | #17233A | 1 | stylesheet | renderer/style.css:282 |
| #172b4dff | #172B4D | 1 | js-assigned | renderer/src/export/engine.js:76 |
| #1a0a0aff | #1a0a0a | 1 | inline-attr | renderer/src/modules/nav.js:519 |
| #1a1a1aff | #1a1a1a | 1 | stylesheet | renderer/style.css:679 |
| #1a1a400f | rgba(26, 26, 64, 0.06) | 1 | stylesheet | renderer/style.css:410 |
| #1a1a4059 | rgba(26, 26, 64, 0.35) | 1 | stylesheet | renderer/style.css:315 |
| #1b3fae47 | rgba(27, 63, 174, .28) | 1 | stylesheet | renderer/chrome.css:268 |
| #1c1c1ccc | rgba(28,28,28,0.8) | 1 | stylesheet | renderer/style.css:3390 |
| #1c1c1cff | #1c1c1c | 1 | js-assigned | renderer/license-settings.html:25 |
| #1d805417 | rgba(29, 128, 84, 0.09) | 1 | stylesheet | renderer/style.css:272 |
| #1d8054ff | #1D8054 | 1 | stylesheet | renderer/tokens.css:331 |
| #1da851ff | #1da851 | 1 | stylesheet | renderer/students.css:1854 |
| #1e2533ff | #1e2533 | 1 | js-assigned | renderer/src/modules/modals.js:473 |
| #1e3c6a66 | rgba(30,60,106,0.4) | 1 | js-assigned | renderer/src/license.js:99 |
| #1e40afff | #1E40AF | 1 | stylesheet | renderer/login.css:185 |
| #1e5fd4ff | #1e5fd4 | 1 | inline-attr | renderer/src/license.js:120 |
| #232629ff | #232629 | 1 | style-block | renderer/recovery.html:14 |
| #252320ff | #252320 | 1 | stylesheet | renderer/tokens.css:171 |
| #252525ff | #252525 | 1 | stylesheet | renderer/style.css:679 |
| #2563eb0b | rgba(37, 99, 235, 0.045) | 1 | stylesheet | renderer/style.css:305 |
| #2563eb0f | rgba(37,99,235,0.06) | 1 | stylesheet | renderer/style.css:1840 |
| #2563eb14 | rgba(37,99,235,0.08) | 1 | inline-attr | renderer/src/modules/students.js:4679 |
| #2563eb33 | rgba(37, 99, 235, 0.20) | 1 | stylesheet | renderer/style.css:294 |
| #2563eb42 | rgba(37,99,235,.26) | 1 | stylesheet | renderer/login.css:154 |
| #2563eb57 | rgba(37, 99, 235, .34) | 1 | style-block | renderer/license.html:199 |
| #2563eb66 | rgba(37,99,235,0.4) | 1 | inline-attr | renderer/src/modules/dashboard.js:2251 |
| #2563eb80 | rgba(37,99,235,.5) | 1 | inline-attr | renderer/src/auth-nev.js:741 |
| #25b862ff | #25b862 | 1 | stylesheet | renderer/students.css:1852 |
| #25d36624 | rgba(37,211,102,.14) | 1 | stylesheet | renderer/whatsapp.css:7 |
| #28c840ff | #28c840 | 1 | stylesheet | renderer/style.css:3520 |
| #2a2724ff | #2A2724 | 1 | stylesheet | renderer/tokens.css:174 |
| #2a2a2aff | #2a2a2a | 1 | style-block | renderer/license-settings.html:27 |
| #2a5298ff | #2a5298 | 1 | inline-attr | renderer/src/license.js:95 |
| #2a7aedff | #2a7aed | 1 | inline-attr | renderer/src/license.js:120 |
| #2b2f33ff | #2b2f33 | 1 | style-block | renderer/recovery.html:45 |
| #2dd4bf12 | rgba(45,212,191,0.07) | 1 | stylesheet | renderer/style.css:2839 |
| #2dd4bf33 | rgba(45,212,191,0.2) | 1 | stylesheet | renderer/style.css:2882 |
| #2dd4bf40 | rgba(45,212,191,0.25) | 1 | stylesheet | renderer/style.css:1423 |
| #2ec98a1a | rgba(46,201,138,0.1) | 1 | inline-attr | renderer/src/modules/students.js:4336 |
| #2ec98a33 | rgba(46,201,138,0.2) | 1 | inline-attr | renderer/src/modules/students.js:4336 |
| #2f8a5aff | #2F8A5A | 1 | stylesheet | renderer/dashboard.css:2238 |
| #33383dff | #33383d | 1 | style-block | renderer/recovery.html:14 |
| #34d39926 | rgba(52,211,153,0.15) | 1 | stylesheet | renderer/style.css:3298 |
| #34d39940 | rgba(52,211,153,0.25) | 1 | stylesheet | renderer/style.css:1419 |
| #34d39947 | rgba(52,211,153,0.28) | 1 | style-block | renderer/license-settings.html:37 |
| #34d3994d | rgba(52, 211, 153, 0.3) | 1 | stylesheet | renderer/style.css:1192 |
| #34d39966 | rgba(52,211,153,0.4) | 1 | stylesheet | renderer/style.css:2547 |
| #35322dff | #35322D | 1 | stylesheet | renderer/tokens.css:173 |
| #353534ff | #353534 | 1 | stylesheet | renderer/style.css:4221 |
| #35507fff | #35507f | 1 | js-assigned | renderer/license.html:27 |
| #38bdf800 | rgba(56, 189, 248, 0) | 1 | stylesheet | renderer/style.css:474 |
| #38bdf80a | rgba(56,189,248,0.04) | 1 | stylesheet | renderer/style.css:3052 |
| #38bdf81a | rgba(56,189,248,0.10) | 1 | stylesheet | renderer/style.css:3561 |
| #38bdf826 | rgba(56, 189, 248, 0.15) | 1 | stylesheet | renderer/style.css:1033 |
| #38bdf833 | rgba(56,189,248,0.2) | 1 | stylesheet | renderer/style.css:3078 |
| #38bdf840 | rgba(56,189,248,0.25) | 1 | stylesheet | renderer/style.css:3051 |
| #38bdf880 | rgba(56,189,248,0.5) | 1 | stylesheet | renderer/style.css:3082 |
| #3a2500ff | #3a2500 | 1 | stylesheet | renderer/rooms.css:217 |
| #3a3a3aff | #3a3a3a | 1 | js-assigned | renderer/license-settings.html:28 |
| #3b6bd1ff | #3B6BD1 | 1 | stylesheet | renderer/dashboard.css:2236 |
| #3b82f605 | rgba(59,130,246,0.02) | 1 | stylesheet | renderer/style.css:3047 |
| #3b82f60d | rgba(59,130,246,0.05) | 1 | stylesheet | renderer/style.css:4459 |
| #3b82f61f | rgba(59,130,246,.12) | 1 | stylesheet | renderer/chrome.css:431 |
| #3b82f629 | rgba(59,130,246,.16) | 1 | stylesheet | renderer/login.css:140 |
| #3f8f52ff | #3f8f52 | 1 | stylesheet | renderer/tokens.css:496 |
| #3fa66a21 | rgba(63,166,106,.13) | 1 | style-block | renderer/recovery.html:53 |
| #3fa66aff | #3fa66a | 1 | style-block | renderer/recovery.html:16 |
| #3fbf8329 | rgba(63,191,131,.16) | 1 | stylesheet | renderer/ui-kit.css:21 |
| #3fbf8342 | rgba(63, 191, 131, 0.26) | 1 | stylesheet | renderer/tokens.css:241 |
| #4338caff | #4338ca | 1 | js-assigned | renderer/license.html:504 |
| #44d3c41f | rgba(68, 211, 196, 0.12) | 1 | stylesheet | renderer/style.css:47 |
| #44d3c4ff | #44d3c4 | 1 | stylesheet | renderer/style.css:46 |
| #44e2cd40 | rgba(68,226,205,0.25) | 1 | stylesheet | renderer/style.css:4517 |
| #45dfa41f | rgba(69,223,164,0.12) | 1 | stylesheet | renderer/style.css:4824 |
| #45dfa433 | rgba(69,223,164,0.2) | 1 | stylesheet | renderer/style.css:4824 |
| #45dfa440 | rgba(69,223,164,0.25) | 1 | stylesheet | renderer/style.css:4513 |
| #45dfa466 | rgba(69,223,164,.40) | 1 | stylesheet | renderer/payments.css:930 |
| #45dfa4ff | #45dfa4 | 1 | js-assigned | renderer/src/modules/dashboard.js:3493 |
| #4a6080ff | #4a6080 | 1 | js-assigned | renderer/src/modules/dashboard.js:3515 |
| #4a9cf066 | rgba(74,156,240,0.4) | 1 | js-assigned | renderer/src/modules/reports.js:179 |
| #4ba675ff | #4BA675 | 1 | stylesheet | renderer/dashboard.css:2238 |
| #4d6a90ff | #4d6a90 | 1 | inline-attr | renderer/src/license.js:98 |
| #4e7dff29 | rgba(78, 125, 255, 0.16) | 1 | stylesheet | renderer/tokens.css:375 |
| #525252ff | #525252 | 1 | js-assigned | renderer/license-settings.html:52 |
| #5b4bc417 | rgba(91, 75, 196, 0.09) | 1 | stylesheet | renderer/style.css:278 |
| #5b647aff | #5B647A | 1 | stylesheet | renderer/tokens.css:301 |
| #5d89e0ff | #5D89E0 | 1 | stylesheet | renderer/dashboard.css:2236 |
| #5db87221 | rgba(93, 184, 114, 0.13) | 1 | stylesheet | renderer/tokens.css:497 |
| #5db87224 | rgba(93, 184, 114, 0.14) | 1 | stylesheet | renderer/tokens.css:449 |
| #5db872ff | #5db872 | 1 | stylesheet | renderer/tokens.css:448 |
| #5db8a6ff | #5db8a6 | 1 | stylesheet | renderer/tokens.css:454 |
| #60a5fa0f | rgba(96,165,250,0.06) | 1 | stylesheet | renderer/style.css:4854 |
| #60a5fa24 | rgba(96,165,250,0.14) | 1 | style-block | renderer/license-settings.html:35 |
| #60a5fa3d | rgba(96,165,250,0.24) | 1 | style-block | renderer/license-settings.html:41 |
| #60a5fa47 | rgba(96,165,250,0.28) | 1 | stylesheet | renderer/style.css:4853 |
| #60a5fa59 | rgba(96,165,250,0.35) | 1 | stylesheet | renderer/style.css:4281 |
| #60a5fa99 | rgba(96,165,250,0.6) | 1 | stylesheet | renderer/style.css:4229 |
| #677187ff | #677187 | 1 | stylesheet | renderer/tokens.css:310 |
| #6c6a641a | rgba(108, 106, 100, 0.10) | 1 | stylesheet | renderer/tokens.css:503 |
| #6c6a64ff | #6c6a64 | 1 | stylesheet | renderer/tokens.css:502 |
| #6f55c0ff | #6F55C0 | 1 | stylesheet | renderer/dashboard.css:2240 |
| #737373ff | #737373 | 1 | js-assigned | renderer/license-settings.html:31 |
| #7a6a60ff | #7a6a60 | 1 | stylesheet | renderer/style.css:4496 |
| #7ba0ff29 | rgba(123,160,255,.16) | 1 | stylesheet | renderer/ui-kit.css:20 |
| #7ba0ff42 | rgba(123, 160, 255, 0.26) | 1 | stylesheet | renderer/tokens.css:253 |
| #7c8fb0ff | #7c8fb0 | 1 | js-assigned | renderer/license.html:28 |
| #7ea2f5ff | #7EA2F5 | 1 | stylesheet | renderer/dashboard.css:1930 |
| #84cc16ff | #84cc16 | 1 | js-assigned | renderer/src/modules/reports.js:1310 |
| #86d9a4ff | #86D9A4 | 1 | stylesheet | renderer/dashboard.css:2232 |
| #8a9ab8ff | #8a9ab8 | 1 | js-assigned | renderer/src/modules/dashboard.js:3514 |
| #8b73d4ff | #8B73D4 | 1 | stylesheet | renderer/dashboard.css:2240 |
| #909090ff | #909090 | 1 | js-assigned | renderer/src/modules/reports.js:1351 |
| #93b4f7ff | #93B4F7 | 1 | stylesheet | renderer/dashboard.css:2230 |
| #95691a17 | rgba(149, 105, 26, 0.09) | 1 | stylesheet | renderer/style.css:274 |
| #95691aff | #95691A | 1 | stylesheet | renderer/tokens.css:335 |
| #96710fff | #96710f | 1 | stylesheet | renderer/tokens.css:498 |
| #991b1bff | #991b1b | 1 | js-assigned | renderer/license.html:503 |
| #999999ff | #999 | 1 | inline-attr | renderer/app.js:201 |
| #9a7a1aff | #9a7a1a | 1 | stylesheet | renderer/style.css:1155 |
| #9aa3abff | #9aa3ab | 1 | style-block | renderer/recovery.html:15 |
| #9b8cf024 | rgba(155, 140, 240, 0.14) | 1 | stylesheet | renderer/style.css:63 |
| #9b8cf029 | rgba(155,140,240,.16) | 1 | stylesheet | renderer/ui-kit.css:23 |
| #a09d9624 | rgba(160, 157, 150, 0.14) | 1 | stylesheet | renderer/tokens.css:457 |
| #a15c00ff | #A15C00 | 1 | js-assigned | renderer/src/export/engine.js:83 |
| #a21cafff | #A21CAF | 1 | js-assigned | renderer/src/utils.js:288 |
| #a5211eff | #A5211E | 1 | stylesheet | renderer/tokens.css:666 |
| #a53535ff | #a53535 | 1 | stylesheet | renderer/tokens.css:500 |
| #a7f3d0ff | #a7f3d0 | 1 | style-block | renderer/license-settings.html:59 |
| #aaaaaaff | #aaa | 1 | inline-attr | renderer/src/receipt.js:130 |
| #b07e28ff | #B07E28 | 1 | stylesheet | renderer/dashboard.css:2237 |
| #b0bcd4ff | #b0bcd4 | 1 | js-assigned | renderer/src/modules/modals.js:501 |
| #b3e6c8ff | #b3e6c8 | 1 | style-block | renderer/recovery.html:53 |
| #b42318ff | #B42318 | 1 | js-assigned | renderer/src/export/engine.js:84 |
| #b85e2bff | #B85E2B | 1 | stylesheet | renderer/dashboard.css:2239 |
| #b89020ff | #b89020 | 1 | stylesheet | renderer/style.css:1161 |
| #b9a2f3ff | #B9A2F3 | 1 | stylesheet | renderer/dashboard.css:2234 |
| #b9c6daff | #b9c6da | 1 | style-block | renderer/license.html:168 |
| #bbf7d0ff | #bbf7d0 | 1 | style-block | renderer/src/modules/students.js:3524 |
| #beebceff | #BEEBCE | 1 | stylesheet | renderer/dashboard.css:2232 |
| #bfd3fbff | #BFD3FB | 1 | stylesheet | renderer/dashboard.css:2230 |
| #c0402f14 | rgba(192, 64, 47, 0.08) | 1 | stylesheet | renderer/style.css:270 |
| #c645451c | rgba(198, 69, 69, 0.11) | 1 | stylesheet | renderer/tokens.css:501 |
| #c6454524 | rgba(198, 69, 69, 0.14) | 1 | stylesheet | renderer/tokens.css:453 |
| #c64545ff | #c64545 | 1 | stylesheet | renderer/tokens.css:452 |
| #c7d2feff | #c7d2fe | 1 | js-assigned | renderer/license.html:504 |
| #c7d8f5ff | #c7d8f5 | 1 | style-block | renderer/license.html:65 |
| #c8a84bff | #c8a84b | 1 | js-assigned | renderer/src/config.js:87 |
| #c99a46ff | #C99A46 | 1 | stylesheet | renderer/dashboard.css:2237 |
| #cbb79fff | #CBB79F | 1 | js-assigned | renderer/index.html:191 |
| #cbd5e0ff | #CBD5E0 | 1 | js-assigned | renderer/index.html:192 |
| #cc0000ff | #c00 | 1 | inline-attr | renderer/src/receipt.js:239 |
| #ccccccff | #ccc | 1 | inline-attr | renderer/src/receipt.js:162 |
| #cfcfcfff | #cfcfcf | 1 | stylesheet | renderer/components.css:336 |
| #d07c48ff | #D07C48 | 1 | stylesheet | renderer/dashboard.css:2239 |
| #d0d4f8ff | #d0d4f8 | 1 | stylesheet | renderer/style.css:424 |
| #d3d8e2ff | #D3D8E2 | 1 | stylesheet | renderer/tokens.css:298 |
| #d3dce6ff | #D3DCE6 | 1 | js-assigned | renderer/index.html:190 |
| #d4a01724 | rgba(212, 160, 23, 0.14) | 1 | stylesheet | renderer/tokens.css:451 |
| #d4a01726 | rgba(212, 160, 23, 0.15) | 1 | stylesheet | renderer/tokens.css:499 |
| #d4a017ff | #d4a017 | 1 | stylesheet | renderer/tokens.css:450 |
| #d4d4d4ff | #d4d4d4 | 1 | js-assigned | renderer/license-settings.html:50 |
| #d6caf8ff | #D6CAF8 | 1 | stylesheet | renderer/dashboard.css:2234 |
| #d8443cff | #D8443C | 1 | stylesheet | renderer/tokens.css:666 |
| #d8d5cdff | #D8D5CD | 1 | stylesheet | renderer/tokens.css:177 |
| #d9534f21 | rgba(217,83,79,.13) | 1 | style-block | renderer/recovery.html:52 |
| #d9534fff | #d9534f | 1 | style-block | renderer/recovery.html:16 |
| #d9a44129 | rgba(217,164,65,.16) | 1 | stylesheet | renderer/ui-kit.css:24 |
| #d9a44142 | rgba(217, 164, 65, 0.26) | 1 | stylesheet | renderer/tokens.css:245 |
| #db2777ff | #DB2777 | 1 | js-assigned | renderer/src/utils.js:287 |
| #dc26264d | rgba(220, 38, 38, .30) | 1 | stylesheet | renderer/style.css:5183 |
| #ddddddff | #ddd | 1 | stylesheet | renderer/style.css:4091 |
| #e052521f | rgba(224,82,82,0.12) | 1 | js-assigned | renderer/src/modules/payments.js:2223 |
| #e0525226 | rgba(224,82,82,0.15) | 1 | js-assigned | renderer/src/license.js:99 |
| #e0525280 | rgba(224,82,82,0.5) | 1 | js-assigned | renderer/src/modules/payments.js:2223 |
| #e0a4720d | rgba(224,164,114,0.05) | 1 | stylesheet | renderer/style.css:1662 |
| #e0a4720f | rgba(224, 164, 114, 0.06) | 1 | stylesheet | renderer/style.css:1012 |
| #e0a4721a | rgba(224,164,114,0.10) | 1 | stylesheet | renderer/style.css:3912 |
| #e0a47226 | rgba(224, 164, 114, 0.15) | 1 | stylesheet | renderer/style.css:711 |
| #e0a47233 | rgba(224,164,114,0.2) | 1 | stylesheet | renderer/style.css:3912 |
| #e0a472b3 | rgba(224, 164, 114, 0.7) | 1 | stylesheet | renderer/style.css:770 |
| #e0f2feff | #e0f2fe | 1 | style-block | renderer/src/modules/dashboard.js:2491 |
| #e5a13aff | #e5a13a | 1 | style-block | renderer/recovery.html:16 |
| #e7eaeeff | #E7EAEE | 1 | stylesheet | renderer/login.css:27 |
| #e7eaf0ff | #E7EAF0 | 1 | stylesheet | renderer/style.css:78 |
| #e7ebf2ff | #E7EBF2 | 1 | stylesheet | renderer/ui-kit.css:70 |
| #e7ecf2ff | #E7ECF2 | 1 | stylesheet | renderer/login.css:249 |
| #e81123ff | #e81123 | 1 | stylesheet | renderer/titlebar.css:98 |
| #e8a55aff | #e8a55a | 1 | stylesheet | renderer/tokens.css:455 |
| #e8eaedff | #e8eaed | 1 | style-block | renderer/recovery.html:15 |
| #e8eaffff | #e8eaff | 1 | stylesheet | renderer/style.css:424 |
| #e8eef8ff | #e8eef8 | 1 | js-assigned | renderer/src/license.js:112 |
| #e91e8cff | #e91e8c | 1 | stylesheet | renderer/style.css:2133 |
| #e9eef4ff | #E9EEF4 | 1 | js-assigned | renderer/index.html:189 |
| #ea580cff | #EA580C | 1 | js-assigned | renderer/src/utils.js:287 |
| #eaf8f0ff | #EAF8F0 | 1 | js-assigned | renderer/src/export/engine.js:82 |
| #ec4899ff | #ec4899 | 1 | js-assigned | renderer/src/modules/reports.js:1310 |
| #ede9feff | #ede9fe | 1 | style-block | renderer/src/modules/dashboard.js:2449 |
| #edebfaff | #EDEBFA | 1 | stylesheet | renderer/ui-kit.css:45 |
| #edeff4ff | #EDEFF4 | 1 | stylesheet | renderer/style.css:246 |
| #eef1f6ff | #EEF1F6 | 1 | stylesheet | renderer/ui-kit.css:47 |
| #eef2f7ff | #eef2f7 | 1 | style-block | renderer/license.html:30 |
| #eef2ffff | #eef2ff | 1 | js-assigned | renderer/license.html:504 |
| #eef4ffff | #EEF4FF | 1 | js-assigned | renderer/src/export/engine.js:75 |
| #eff3f7ff | #EFF3F7 | 1 | stylesheet | renderer/login.css:249 |
| #f0796a29 | rgba(240,121,106,.16) | 1 | stylesheet | renderer/ui-kit.css:22 |
| #f0796a42 | rgba(240, 121, 106, 0.26) | 1 | stylesheet | renderer/tokens.css:249 |
| #f0a0301f | rgba(240,160,48,0.12) | 1 | inline-attr | renderer/src/modules/settings.js:2942 |
| #f0a0304d | rgba(240,160,48,0.3) | 1 | inline-attr | renderer/src/modules/reports.js:112 |
| #f0a03066 | rgba(240,160,48,0.4) | 1 | js-assigned | renderer/src/modules/reports.js:181 |
| #f0d4b4ff | #F0D4B4 | 1 | js-assigned | renderer/index.html:184 |
| #f0ede9ff | #f0ede9 | 1 | stylesheet | renderer/style.css:4224 |
| #f0f5ffff | #f0f5ff | 1 | style-block | renderer/license.html:35 |
| #f3b5b3ff | #f3b5b3 | 1 | style-block | renderer/recovery.html:52 |
| #f3c89aff | #F3C89A | 1 | js-assigned | renderer/index.html:174 |
| #f4f6f8ff | #F4F6F8 | 1 | stylesheet | renderer/login.css:29 |
| #f4f7fcff | #f4f7fc | 1 | style-block | renderer/license.html:32 |
| #f59e0b1f | rgba(245, 158, 11, .12) | 1 | stylesheet | renderer/style.css:5177 |
| #f59e0b52 | rgba(245, 158, 11, .32) | 1 | stylesheet | renderer/style.css:5178 |
| #f5c97aff | #F5C97A | 1 | stylesheet | renderer/dashboard.css:2231 |
| #f5f5f0ff | #f5f5f0 | 1 | js-assigned | renderer/src/receipt.js:398 |
| #f7f8fbff | #F7F8FB | 1 | stylesheet | renderer/ui-kit.css:70 |
| #f871710a | rgba(248,113,113,0.04) | 1 | stylesheet | renderer/style.css:3722 |
| #f8717147 | rgba(248,113,113,0.28) | 1 | style-block | renderer/license-settings.html:39 |
| #f8b183ff | #F8B183 | 1 | stylesheet | renderer/dashboard.css:2233 |
| #f8f7f6ff | #f8f7f6 | 1 | stylesheet | renderer/style.css:4674 |
| #f8fafdff | #F8FAFD | 1 | js-assigned | renderer/src/export/engine.js:81 |
| #f9b25eff | #F9B25E | 1 | js-assigned | renderer/index.html:172 |
| #faf9f5ff | #FAF9F5 | 1 | stylesheet | renderer/tokens.css:176 |
| #fafbfdff | #FAFBFD | 1 | stylesheet | renderer/tokens.css:295 |
| #fb923cff | #FB923C | 1 | stylesheet | renderer/dashboard.css:2118 |
| #fbbf2433 | rgba(251,191,36,0.2) | 1 | stylesheet | renderer/style.css:3906 |
| #fbbf2447 | rgba(251,191,36,0.28) | 1 | style-block | renderer/license-settings.html:38 |
| #fbbf2452 | rgba(251,191,36,.32) | 1 | stylesheet | renderer/whatsapp.css:68 |
| #fbbf77ff | #FBBF77 | 1 | js-assigned | renderer/index.html:195 |
| #fbd3b8ff | #FBD3B8 | 1 | stylesheet | renderer/dashboard.css:2233 |
| #fbe3b4ff | #FBE3B4 | 1 | stylesheet | renderer/dashboard.css:2231 |
| #fbfcfeff | #FBFCFE | 1 | style-block | renderer/src/export/engine.js:614 |
| #fdececff | #FDECEC | 1 | js-assigned | renderer/src/export/engine.js:84 |
| #febc2eff | #febc2e | 1 | stylesheet | renderer/style.css:3519 |
| #ff4d6d1a | rgba(255,77,109,0.1) | 1 | inline-attr | renderer/src/modules/students.js:4669 |
| #ff4d6d26 | rgba(255,77,109,0.15) | 1 | inline-attr | renderer/src/modules/students.js:4336 |
| #ff4d6d59 | rgba(255,77,109,0.35) | 1 | inline-attr | renderer/src/modules/students.js:4669 |
| #ff5f57ff | #ff5f57 | 1 | stylesheet | renderer/style.css:3518 |
| #ffb4ab40 | rgba(255,180,171,0.25) | 1 | stylesheet | renderer/style.css:4514 |
| #ffb4abff | #ffb4ab | 1 | js-assigned | renderer/src/modules/dashboard.js:3494 |
| #ffd9a8ff | #FFD9A8 | 1 | js-assigned | renderer/index.html:172 |
| #fff6e5ff | #FFF6E5 | 1 | js-assigned | renderer/src/export/engine.js:83 |
| #fff6eeff | #FFF6EE | 1 | stylesheet | renderer/login.css:249 |
| #ffffff05 | rgba(255,255,255,0.02) | 1 | stylesheet | renderer/style.css:3268 |
| #ffffff1c | rgba(255,255,255,.11) | 1 | stylesheet | renderer/chrome.css:324 |
| #ffffff24 | rgba(255,255,255,.14) | 1 | stylesheet | renderer/chrome.css:830 |
| #ffffff40 | rgba(255,255,255,0.25) | 1 | stylesheet | renderer/style.css:4080 |
| #ffffff59 | rgba(255,255,255,.35) | 1 | style-block | renderer/license.html:208 |
| #ffffffb3 | rgba(255,255,255,0.7) | 1 | stylesheet | renderer/style.css:3397 |
| #ffffffcc | rgba(255, 255, 255, 0.8) | 1 | stylesheet | renderer/style.css:426 |
| #ffffffe6 | rgba(255,255,255,0.9) | 1 | stylesheet | renderer/style.css:2912 |
| #fffffff2 | rgba(255, 255, 255, 0.95) | 1 | stylesheet | renderer/style.css:336 |
| #fffffff5 | rgba(255,255,255,0.96) | 1 | stylesheet | renderer/style.css:2910 |
| #fffffff7 | rgba(255,255,255,.97) | 1 | style-block | renderer/app.js:87 |

### 2.2 Colour custom properties — 120 (of 221 custom properties)

Scope key: `root` = :root/html/body with no media; `light` = selector contains `.light-theme`; `scoped` = any other selector. The app adds `light-theme` to `<body>` when no theme is saved (renderer/src/modules/theme.js:41-45), so a `light` definition on `body.light-theme` wins over `:root` for everything inside `<body>` in the default state.

| Variable | Defined value | Scope | Selector | Location | References |
|---|---|---|---|---|---|
| --accent | var(--accent-600) | root | :root | renderer/tokens.css:361 | 355 |
|  | var(--accent-600) | light | body.light-theme | renderer/tokens.css:592 |  |
|  | #60a5fa | root | :root | renderer/license-settings.html:33 |  |
|  | #2563eb | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:55 |  |
|  | #2563eb | root | :root | renderer/recovery.html:15 |  |
| --accent-dim | rgba(36, 81, 214, 0.08) | root | :root | renderer/tokens.css:369 | 84 |
|  | rgba(78, 125, 255, 0.16) | root | :root | renderer/tokens.css:375 |  |
|  | rgba(36, 81, 214, 0.08) | light | body.light-theme | renderer/tokens.css:376 |  |
|  | rgba(96,165,250,0.14) | root | :root | renderer/license-settings.html:35 |  |
|  | #eff6ff | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:57 |  |
|  | var(--blue-dim) | scoped | #hz-titlebar | renderer/license.html:341 |  |
| --accent-ink | #93c5fd | root | :root | renderer/license-settings.html:34 | 4 |
|  | #1d4ed8 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:56 |  |
|  | #fff | root | :root | renderer/recovery.html:15 |  |
| --amber | var(--warning-fg) | root | :root | renderer/style.css:58 | 51 |
|  | var(--warning-fg) | light | body.light-theme | renderer/style.css:273 |  |
|  | #d97706 | root | :root | renderer/license.html:41 |  |
| --amber-dim | rgba(217, 164, 65, 0.14) | root | :root | renderer/style.css:59 | 9 |
|  | rgba(149, 105, 26, 0.09) | light | body.light-theme | renderer/style.css:274 |  |
| --ant-amber | #e8a55a | root | :root | renderer/tokens.css:455 | 0 |
| --ant-danger-bg | rgba(198, 69, 69, 0.14) | root | :root | renderer/tokens.css:453 | 6 |
|  | rgba(198, 69, 69, 0.11) | light | body.light-theme | renderer/tokens.css:501 |  |
| --ant-danger-fg | #c64545 | root | :root | renderer/tokens.css:452 | 12 |
|  | #a53535 | light | body.light-theme | renderer/tokens.css:500 |  |
| --ant-neutral-bg | rgba(160, 157, 150, 0.14) | root | :root | renderer/tokens.css:457 | 6 |
|  | rgba(108, 106, 100, 0.10) | light | body.light-theme | renderer/tokens.css:503 |  |
| --ant-neutral-fg | #a09d96 | root | :root | renderer/tokens.css:456 | 6 |
|  | #6c6a64 | light | body.light-theme | renderer/tokens.css:502 |  |
| --ant-success-bg | rgba(93, 184, 114, 0.14) | root | :root | renderer/tokens.css:449 | 10 |
|  | rgba(93, 184, 114, 0.13) | light | body.light-theme | renderer/tokens.css:497 |  |
| --ant-success-fg | #5db872 | root | :root | renderer/tokens.css:448 | 24 |
|  | #3f8f52 | light | body.light-theme | renderer/tokens.css:496 |  |
| --ant-teal | #5db8a6 | root | :root | renderer/tokens.css:454 | 0 |
| --ant-warning-bg | rgba(212, 160, 23, 0.14) | root | :root | renderer/tokens.css:451 | 17 |
|  | rgba(212, 160, 23, 0.15) | light | body.light-theme | renderer/tokens.css:499 |  |
| --ant-warning-fg | #d4a017 | root | :root | renderer/tokens.css:450 | 30 |
|  | #96710f | light | body.light-theme | renderer/tokens.css:498 |  |
| --background | var(--bg) | root | :root | renderer/tokens.css:577 | 0 |
|  | var(--bg) | light | body.light-theme | renderer/tokens.css:624 |  |
| --bg | #181715 | root | :root | renderer/style.css:28 | 17 |
|  | #F5F6F9 | light | body.light-theme | renderer/style.css:237 |  |
|  | #f4f7fc | root | :root | renderer/license.html:32 |  |
|  | #1a1c1e | root | :root | renderer/recovery.html:14 |  |
| --blue | #7BA0FF | root | :root | renderer/style.css:60 | 31 |
|  | #2451D6 | light | body.light-theme | renderer/style.css:275 |  |
|  | #2563eb | root | :root | renderer/license.html:33 |  |
| --blue-dim | rgba(123, 160, 255, 0.14) | root | :root | renderer/style.css:61 | 8 |
|  | rgba(36, 81, 214, 0.08) | light | body.light-theme | renderer/style.css:276 |  |
|  | #f0f5ff | root | :root | renderer/license.html:35 |  |
| --blue-line | #dbe7ff | root | :root | renderer/license.html:36 | 3 |
| --border | rgba(255, 255, 255, 0.08) | root | :root | renderer/style.css:35 | 447 |
|  | #E4E7EE | light | body.light-theme | renderer/style.css:244 |  |
|  | #2a2a2a | root | :root | renderer/license-settings.html:27 |  |
|  | #e5e5e5 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:49 |  |
|  | var(--line) | scoped | #hz-titlebar | renderer/license.html:343 |  |
| --border-default | var(--surface-border) | root | :root | renderer/tokens.css:402 | 0 |
|  | var(--surface-border) | light | body.light-theme | renderer/tokens.css:603 |  |
| --border-token | var(--border) | root | :root | renderer/tokens.css:580 | 0 |
|  | var(--border) | light | body.light-theme | renderer/tokens.css:626 |  |
| --c-bg | var(--conn-unconfigured-bg) | scoped | .conn-sum, .conn-row | renderer/settings.css:962 | 3 |
|  | var(--conn-online-bg) | scoped | .is-online | renderer/settings.css:963 |  |
|  | var(--conn-degraded-bg) | scoped | .is-degraded | renderer/settings.css:964 |  |
|  | var(--conn-offline-bg) | scoped | .is-offline | renderer/settings.css:965 |  |
|  | var(--conn-unconfigured-bg) | scoped | .is-unconfigured | renderer/settings.css:966 |  |
| --c-fg | var(--conn-unconfigured-fg) | scoped | .conn-sum, .conn-row | renderer/settings.css:962 | 3 |
|  | var(--conn-online-fg) | scoped | .is-online | renderer/settings.css:963 |  |
|  | var(--conn-degraded-fg) | scoped | .is-degraded | renderer/settings.css:964 |  |
|  | var(--conn-offline-fg) | scoped | .is-offline | renderer/settings.css:965 |  |
|  | var(--conn-unconfigured-fg) | scoped | .is-unconfigured | renderer/settings.css:966 |  |
| --card | #1F1E1B | root | :root | renderer/style.css:33 | 238 |
|  | #FFFFFF | light | body.light-theme | renderer/style.css:242 |  |
|  | #ffffff | root | :root | renderer/license.html:31 |  |
|  | #ffffff | scoped | #hz-titlebar | renderer/license.html:340 |  |
| --conn-degraded-bg | var(--warning-bg) | root | :root | renderer/tokens.css:423 | 1 |
|  | var(--warning-bg) | light | body.light-theme | renderer/tokens.css:614 |  |
| --conn-degraded-fg | var(--warning-fg) | root | :root | renderer/tokens.css:422 | 1 |
|  | var(--warning-fg) | light | body.light-theme | renderer/tokens.css:613 |  |
| --conn-offline-bg | var(--surface-sunken) | root | :root | renderer/tokens.css:425 | 1 |
|  | var(--surface-sunken) | light | body.light-theme | renderer/tokens.css:616 |  |
| --conn-offline-fg | var(--text-secondary) | root | :root | renderer/tokens.css:424 | 1 |
|  | var(--text-secondary) | light | body.light-theme | renderer/tokens.css:615 |  |
| --conn-online-bg | var(--success-bg) | root | :root | renderer/tokens.css:421 | 1 |
|  | var(--success-bg) | light | body.light-theme | renderer/tokens.css:612 |  |
| --conn-online-fg | var(--success-fg) | root | :root | renderer/tokens.css:420 | 1 |
|  | var(--success-fg) | light | body.light-theme | renderer/tokens.css:611 |  |
| --conn-unconfigured-bg | var(--surface-muted) | root | :root | renderer/tokens.css:427 | 2 |
|  | var(--surface-muted) | light | body.light-theme | renderer/tokens.css:618 |  |
| --conn-unconfigured-fg | var(--text-tertiary) | root | :root | renderer/tokens.css:426 | 2 |
|  | var(--text-tertiary) | light | body.light-theme | renderer/tokens.css:617 |  |
| --danger | var(--red) | root | :root | renderer/tokens.css:586 | 6 |
|  | var(--red) | light | body.light-theme | renderer/tokens.css:630 |  |
|  | #f87171 | root | :root | renderer/license-settings.html:39 |  |
|  | #b91c1c | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:61 |  |
|  | #d9534f | root | :root | renderer/recovery.html:16 |  |
| --danger-bd | rgba(248,113,113,0.28) | root | :root | renderer/license-settings.html:39 | 2 |
|  | #fecaca | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:61 |  |
| --danger-bg | #FBEBE8 | root | :root | renderer/tokens.css:78 | 7 |
|  | rgba(240, 121, 106, 0.14) | root | :root | renderer/tokens.css:247 |  |
|  | #FBEBE8 | light | body.light-theme | renderer/tokens.css:338 |  |
|  | rgba(248,113,113,0.12) | root | :root | renderer/license-settings.html:39 |  |
|  | #fef2f2 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:61 |  |
| --danger-border | #F2C5BC | root | :root | renderer/tokens.css:80 | 3 |
|  | rgba(240, 121, 106, 0.26) | root | :root | renderer/tokens.css:249 |  |
|  | #F2C5BC | light | body.light-theme | renderer/tokens.css:340 |  |
| --danger-fg | #C0402F | root | :root | renderer/tokens.css:79 | 22 |
|  | #F0796A | root | :root | renderer/tokens.css:248 |  |
|  | #C0402F | light | body.light-theme | renderer/tokens.css:339 |  |
| --dash-sunk | rgba(255,255,255,.055) | root | :root | renderer/ui-kit.css:69 | 141 |
|  | #F7F8FB | light | body.light-theme | renderer/ui-kit.css:70 |  |
|  | #f1f5f9 | scoped | #hz-titlebar | renderer/license.html:340 |  |
| --dash-track | rgba(255,255,255,.10) | root | :root | renderer/ui-kit.css:69 | 20 |
|  | #E7EBF2 | light | body.light-theme | renderer/ui-kit.css:70 |  |
| --dh-bg | rgba(123,160,255,.16) | scoped | .dh-blue | renderer/ui-kit.css:20 | 82 |
|  | rgba(63,191,131,.16) | scoped | .dh-green | renderer/ui-kit.css:21 |  |
|  | rgba(240,121,106,.16) | scoped | .dh-red | renderer/ui-kit.css:22 |  |
|  | rgba(155,140,240,.16) | scoped | .dh-violet | renderer/ui-kit.css:23 |  |
|  | rgba(217,164,65,.16) | scoped | .dh-amber | renderer/ui-kit.css:24 |  |
|  | rgba(255,255,255,.09) | scoped | .dh-slate | renderer/ui-kit.css:25 |  |
|  | #EAF0FE | light | body.light-theme .dh-blue | renderer/ui-kit.css:42 |  |
|  | #E8F5EE | light | body.light-theme .dh-green | renderer/ui-kit.css:43 |  |
|  | #FBEBE8 | light | body.light-theme .dh-red | renderer/ui-kit.css:44 |  |
|  | #EDEBFA | light | body.light-theme .dh-violet | renderer/ui-kit.css:45 |  |
|  | #FBF2E2 | light | body.light-theme .dh-amber | renderer/ui-kit.css:46 |  |
|  | #EEF1F6 | light | body.light-theme .dh-slate | renderer/ui-kit.css:47 |  |
| --divider | #EDEFF4 | light | body.light-theme | renderer/style.css:246 | 0 |
| --green | var(--success-fg) | root | :root | renderer/style.css:56 | 125 |
|  | var(--success-fg) | light | body.light-theme | renderer/style.css:271 |  |
|  | #059669 | root | :root | renderer/license.html:40 |  |
| --green-dim | rgba(63, 191, 131, 0.14) | root | :root | renderer/style.css:57 | 13 |
|  | rgba(29, 128, 84, 0.09) | light | body.light-theme | renderer/style.css:272 |  |
| --info-bd | rgba(96,165,250,0.24) | root | :root | renderer/license-settings.html:41 | 2 |
|  | #bfdbfe | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:63 |  |
| --info-bg | #EAF0FE | root | :root | renderer/tokens.css:82 | 3 |
|  | rgba(123, 160, 255, 0.14) | root | :root | renderer/tokens.css:251 |  |
|  | #EAF0FE | light | body.light-theme | renderer/tokens.css:342 |  |
|  | rgba(96,165,250,0.10) | root | :root | renderer/license-settings.html:40 |  |
|  | #eff6ff | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:62 |  |
| --info-border | #B3C8FA | root | :root | renderer/tokens.css:84 | 0 |
|  | rgba(123, 160, 255, 0.26) | root | :root | renderer/tokens.css:253 |  |
|  | #B3C8FA | light | body.light-theme | renderer/tokens.css:344 |  |
| --info-fg | #1B3FAE | root | :root | renderer/tokens.css:83 | 2 |
|  | #7BA0FF | root | :root | renderer/tokens.css:252 |  |
|  | #1B3FAE | light | body.light-theme | renderer/tokens.css:343 |  |
| --ink | #0f2557 | root | :root | renderer/license.html:26 | 9 |
|  | #e8eaed | root | :root | renderer/recovery.html:15 |  |
| --k | #8b5cf6 | scoped | [style] | renderer/src/modules/reports.js:1115 | 1 |
|  | #ef4444 | scoped | [style] | renderer/src/modules/reports.js:1116 |  |
|  | #16a34a | scoped | [style] | renderer/src/modules/reports.js:1117 |  |
| --kbar-a | #2451D6 | scoped | .kbar--blue | renderer/dashboard.css:1926 | 1 |
|  | #D97706 | scoped | .kbar--amber | renderer/dashboard.css:1927 |  |
|  | #15803D | scoped | .kbar--green | renderer/dashboard.css:1928 |  |
|  | #6D28D9 | scoped | .kbar--violet | renderer/dashboard.css:1929 |  |
|  | #C2410C | scoped | .kbar--orange | renderer/dashboard.css:2117 |  |
|  | #93B4F7 | scoped | .kbar--blue | renderer/dashboard.css:2230 |  |
|  | #F5C97A | scoped | .kbar--amber | renderer/dashboard.css:2231 |  |
|  | #86D9A4 | scoped | .kbar--green | renderer/dashboard.css:2232 |  |
|  | #F8B183 | scoped | .kbar--orange | renderer/dashboard.css:2233 |  |
|  | #B9A2F3 | scoped | .kbar--violet | renderer/dashboard.css:2234 |  |
|  | #3B6BD1 | light | body:not(.light-theme) .kbar--blue | renderer/dashboard.css:2236 |  |
|  | #B07E28 | light | body:not(.light-theme) .kbar--amber | renderer/dashboard.css:2237 |  |
|  | #2F8A5A | light | body:not(.light-theme) .kbar--green | renderer/dashboard.css:2238 |  |
|  | #B85E2B | light | body:not(.light-theme) .kbar--orange | renderer/dashboard.css:2239 |  |
|  | #6F55C0 | light | body:not(.light-theme) .kbar--violet | renderer/dashboard.css:2240 |  |
| --kbar-b | #3B82F6 | scoped | .kbar--blue | renderer/dashboard.css:1926 | 1 |
|  | #F59E0B | scoped | .kbar--amber | renderer/dashboard.css:1927 |  |
|  | #22C55E | scoped | .kbar--green | renderer/dashboard.css:1928 |  |
|  | #8B5CF6 | scoped | .kbar--violet | renderer/dashboard.css:1929 |  |
|  | #F97316 | scoped | .kbar--orange | renderer/dashboard.css:2117 |  |
|  | #BFD3FB | scoped | .kbar--blue | renderer/dashboard.css:2230 |  |
|  | #FBE3B4 | scoped | .kbar--amber | renderer/dashboard.css:2231 |  |
|  | #BEEBCE | scoped | .kbar--green | renderer/dashboard.css:2232 |  |
|  | #FBD3B8 | scoped | .kbar--orange | renderer/dashboard.css:2233 |  |
|  | #D6CAF8 | scoped | .kbar--violet | renderer/dashboard.css:2234 |  |
|  | #5D89E0 | light | body:not(.light-theme) .kbar--blue | renderer/dashboard.css:2236 |  |
|  | #C99A46 | light | body:not(.light-theme) .kbar--amber | renderer/dashboard.css:2237 |  |
|  | #4BA675 | light | body:not(.light-theme) .kbar--green | renderer/dashboard.css:2238 |  |
|  | #D07C48 | light | body:not(.light-theme) .kbar--orange | renderer/dashboard.css:2239 |  |
|  | #8B73D4 | light | body:not(.light-theme) .kbar--violet | renderer/dashboard.css:2240 |  |
| --kbar-fg | #2451D6 | scoped | .kbar--blue | renderer/dashboard.css:1926 | 1 |
|  | #B45309 | scoped | .kbar--amber | renderer/dashboard.css:1927 |  |
|  | #15803D | scoped | .kbar--green | renderer/dashboard.css:1928 |  |
|  | #6D28D9 | scoped | .kbar--violet | renderer/dashboard.css:1929 |  |
|  | #7EA2F5 | light | body:not(.light-theme) .kbar--blue | renderer/dashboard.css:1930 |  |
|  | var(--warning-fg) | light | body:not(.light-theme) .kbar--amber | renderer/dashboard.css:1931 |  |
|  | var(--success-fg) | light | body:not(.light-theme) .kbar--green | renderer/dashboard.css:1932 |  |
|  | #A78BFA | light | body:not(.light-theme) .kbar--violet | renderer/dashboard.css:1933 |  |
|  | #C2410C | scoped | .kbar--orange | renderer/dashboard.css:2117 |  |
|  | #FB923C | light | body:not(.light-theme) .kbar--orange | renderer/dashboard.css:2118 |  |
| --kpi-a | var(--kpi-1a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(1) | renderer/dashboard.css:2179 | 1 |
|  | var(--kpi-2a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(2) | renderer/dashboard.css:2180 |  |
|  | var(--kpi-3a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(3) | renderer/dashboard.css:2181 |  |
|  | var(--kpi-4a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(4) | renderer/dashboard.css:2182 |  |
|  | var(--kpi-5a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(5) | renderer/dashboard.css:2183 |  |
|  | var(--kpi-loss-a) | scoped | .dash-kpi-grid > .dsh-card:nth-child(3).dh-red | renderer/dashboard.css:2190 |  |
| --kpi-b | var(--kpi-1b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(1) | renderer/dashboard.css:2179 | 2 |
|  | var(--kpi-2b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(2) | renderer/dashboard.css:2180 |  |
|  | var(--kpi-3b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(3) | renderer/dashboard.css:2181 |  |
|  | var(--kpi-4b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(4) | renderer/dashboard.css:2182 |  |
|  | var(--kpi-5b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(5) | renderer/dashboard.css:2183 |  |
|  | var(--kpi-loss-b) | scoped | .dash-kpi-grid > .dsh-card:nth-child(3).dh-red | renderer/dashboard.css:2190 |  |
| --kpi-loss-a | #D8443C | root | :root | renderer/tokens.css:666 | 1 |
|  | #EF4444 | light | body.light-theme | renderer/tokens.css:674 |  |
| --kpi-loss-b | #A5211E | root | :root | renderer/tokens.css:666 | 1 |
|  | #B91C1C | light | body.light-theme | renderer/tokens.css:674 |  |
| --lg-brand | #3B82F6 | scoped | #login-screen | renderer/login.css:21 | 7 |
| --lg-brand-soft | #EFF6FF | scoped | #login-screen | renderer/login.css:23 | 4 |
| --lg-ink | #16202E | scoped | #login-screen | renderer/login.css:24 | 9 |
| --lg-line | #E7EAEE | scoped | #login-screen | renderer/login.css:27 | 7 |
| --lg-panel | #F4F6F8 | scoped | #login-screen | renderer/login.css:29 | 1 |
| --lg-surface | #FFFFFF | scoped | #login-screen | renderer/login.css:28 | 4 |
| --line | #e2e8f0 | root | :root | renderer/license.html:29 | 9 |
|  | #33383d | root | :root | renderer/recovery.html:14 |  |
| --line-soft | #eef2f7 | root | :root | renderer/license.html:30 | 1 |
| --muted | var(--text3) | root | :root | renderer/tokens.css:583 | 5 |
|  | var(--text3) | light | body.light-theme | renderer/tokens.css:627 |  |
|  | #9aa3ab | root | :root | renderer/recovery.html:15 |  |
| --ok | #3fa66a | root | :root | renderer/recovery.html:16 | 1 |
| --panel | #232629 | root | :root | renderer/recovery.html:14 | 1 |
| --primary | var(--accent) | root | :root | renderer/tokens.css:584 | 0 |
|  | var(--accent) | light | body.light-theme | renderer/tokens.css:628 |  |
| --purple | #9B8CF0 | root | :root | renderer/style.css:62 | 8 |
|  | #5B4BC4 | light | body.light-theme | renderer/style.css:277 |  |
| --purple-dim | rgba(155, 140, 240, 0.14) | root | :root | renderer/style.css:63 | 3 |
|  | rgba(91, 75, 196, 0.09) | light | body.light-theme | renderer/style.css:278 |  |
| --red | var(--danger-fg) | root | :root | renderer/style.css:54 | 155 |
|  | var(--danger-fg) | light | body.light-theme | renderer/style.css:269 |  |
|  | #dc2626 | root | :root | renderer/license.html:37 |  |
| --red-dim | rgba(240, 121, 106, 0.14) | root | :root | renderer/style.css:55 | 17 |
|  | rgba(192, 64, 47, 0.08) | light | body.light-theme | renderer/style.css:270 |  |
|  | #fef2f2 | root | :root | renderer/license.html:38 |  |
| --red-line | #fecaca | root | :root | renderer/license.html:39 | 0 |
| --sb-active | var(--accent) | root | :root | renderer/chrome.css:36 | 8 |
|  | var(--accent) | light | body.light-theme | renderer/chrome.css:125 |  |
| --sb-active-edge | rgba(255,255,255,.14) | scoped | #sidebar | renderer/chrome.css:830 | 1 |
|  | var(--border) | light | body.light-theme #sidebar | renderer/chrome.css:831 |  |
| --sb-active-fg | var(--text-on-accent) | root | :root | renderer/chrome.css:44 | 2 |
|  | var(--text-on-accent) | light | body.light-theme | renderer/chrome.css:127 |  |
| --sb-active-surface | rgba(255,255,255,.10) | scoped | #sidebar | renderer/chrome.css:830 | 1 |
|  | #FFFFFF | light | body.light-theme #sidebar | renderer/chrome.css:831 |  |
| --sb-avatar | var(--accent) | root | :root | renderer/chrome.css:46 | 1 |
|  | var(--accent) | light | body.light-theme | renderer/chrome.css:129 |  |
| --sb-border | rgba(255,255,255,.09) | root | :root | renderer/chrome.css:25 | 1 |
|  | rgba(15,23,42,.08) | light | body.light-theme | renderer/chrome.css:120 |  |
| --sb-divider | rgba(255,255,255,.08) | root | :root | renderer/chrome.css:45 | 5 |
|  | rgba(15,23,42,.09) | light | body.light-theme | renderer/chrome.css:128 |  |
| --sb-fg | #f5f5f5 | root | :root | renderer/chrome.css:26 | 5 |
|  | #0F172A | light | body.light-theme | renderer/chrome.css:121 |  |
| --sb-hover | rgba(255,255,255,.07) | root | :root | renderer/chrome.css:29 | 2 |
|  | rgba(15,23,42,.055) | light | body.light-theme | renderer/chrome.css:124 |  |
| --seat-free-bg | color-mix(in srgb, var(--accent) 16%, transparent) | scoped | .dash-row-b | renderer/dashboard.css:1872 | 1 |
|  | #EFF6FF | light | body.light-theme .dash-row-b | renderer/dashboard.css:1875 |  |
| --seat-free-fg | var(--accent) | scoped | .dash-row-b | renderer/dashboard.css:1873 | 1 |
|  | #2563EB | light | body.light-theme .dash-row-b | renderer/dashboard.css:1875 |  |
| --seat-full-bg | var(--bg3) | scoped | .dash-row-b | renderer/dashboard.css:1874 | 1 |
|  | #F1F5F9 | light | body.light-theme .dash-row-b | renderer/dashboard.css:1876 |  |
| --seat-tile-br | color-mix(in srgb, var(--accent) 30%, transparent) | scoped | .dash-row-b | renderer/dashboard.css:2318 | 1 |
|  | #BFDBFE | light | body.light-theme .dash-row-b | renderer/dashboard.css:2319 |  |
| --sidebar-bg | #FFFFFF | light | body.light-theme | renderer/chrome.css:119 | 5 |
|  | #131211 | root | :root | renderer/style.css:32 |  |
|  | #131B2E | light | body.light-theme | renderer/style.css:241 |  |
| --success | var(--green) | root | :root | renderer/tokens.css:585 | 2 |
|  | var(--green) | light | body.light-theme | renderer/tokens.css:629 |  |
|  | #34d399 | root | :root | renderer/license-settings.html:37 |  |
|  | #047857 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:59 |  |
| --success-bd | rgba(52,211,153,0.28) | root | :root | renderer/license-settings.html:37 | 1 |
|  | #a7f3d0 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:59 |  |
| --success-bg | #E8F5EE | root | :root | renderer/tokens.css:70 | 7 |
|  | rgba(63, 191, 131, 0.14) | root | :root | renderer/tokens.css:239 |  |
|  | #E8F5EE | light | body.light-theme | renderer/tokens.css:330 |  |
|  | rgba(52,211,153,0.12) | root | :root | renderer/license-settings.html:37 |  |
|  | #ecfdf5 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:59 |  |
| --success-border | #BFE3D0 | root | :root | renderer/tokens.css:72 | 2 |
|  | rgba(63, 191, 131, 0.26) | root | :root | renderer/tokens.css:241 |  |
|  | #BFE3D0 | light | body.light-theme | renderer/tokens.css:332 |  |
| --success-fg | #1F8A5A | root | :root | renderer/tokens.css:71 | 14 |
|  | #3FBF83 | root | :root | renderer/tokens.css:240 |  |
|  | #1D8054 | light | body.light-theme | renderer/tokens.css:331 |  |
| --surface | #ffffff | root | :root | renderer/tokens.css:89 | 12 |
|  | #1F1E1B | root | :root | renderer/tokens.css:170 |  |
|  | #FFFFFF | light | body.light-theme | renderer/tokens.css:294 |  |
|  | var(--card) | root | :root | renderer/tokens.css:578 |  |
|  | #141414 | root | :root | renderer/license-settings.html:24 |  |
|  | #ffffff | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:46 |  |
| --surface-border | var(--gray-200) | root | :root | renderer/tokens.css:92 | 4 |
|  | #35322D | root | :root | renderer/tokens.css:173 |  |
|  | #E4E7EE | light | body.light-theme | renderer/tokens.css:297 |  |
| --surface-divider | var(--gray-200) | root | :root | renderer/tokens.css:93 | 3 |
|  | #2A2724 | root | :root | renderer/tokens.css:174 |  |
|  | #D3D8E2 | light | body.light-theme | renderer/tokens.css:298 |  |
| --surface-muted | var(--gray-50) | root | :root | renderer/tokens.css:90 | 3 |
|  | #252320 | root | :root | renderer/tokens.css:171 |  |
|  | #FAFBFD | light | body.light-theme | renderer/tokens.css:295 |  |
| --surface-sunk | #0f0f0f | root | :root | renderer/license-settings.html:26 | 4 |
|  | #f5f5f5 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:48 |  |
| --surface-sunken | var(--gray-100) | root | :root | renderer/tokens.css:91 | 2 |
|  | #181715 | root | :root | renderer/tokens.css:172 |  |
|  | #F5F6F9 | light | body.light-theme | renderer/tokens.css:296 |  |
| --teal | #44d3c4 | root | :root | renderer/style.css:46 | 9 |
|  | #0E7D87 | light | body.light-theme | renderer/style.css:267 |  |
| --teal-dim | rgba(68, 211, 196, 0.12) | root | :root | renderer/style.css:47 | 3 |
|  | rgba(14, 125, 135, 0.08) | light | body.light-theme | renderer/style.css:268 |  |
| --text | #E7EAF0 | root | :root | renderer/style.css:78 | 437 |
|  | #17233A | light | body.light-theme | renderer/style.css:282 |  |
|  | #e5e5e5 | root | :root | renderer/license-settings.html:29 |  |
|  | #171717 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:51 |  |
|  | var(--ink) | scoped | #hz-titlebar | renderer/license.html:342 |  |
| --text-on-accent | #ffffff | root | :root | renderer/tokens.css:101 | 57 |
|  | #181715 | root | :root | renderer/tokens.css:198 |  |
|  | #FFFFFF | light | body.light-theme | renderer/tokens.css:313 |  |
| --text-primary | var(--gray-900) | root | :root | renderer/tokens.css:98 | 6 |
|  | #FAF9F5 | root | :root | renderer/tokens.css:176 |  |
|  | #152238 | light | body.light-theme | renderer/tokens.css:300 |  |
|  | var(--text) | root | :root | renderer/tokens.css:581 |  |
| --text-secondary | var(--gray-600) | root | :root | renderer/tokens.css:99 | 5 |
|  | #D8D5CD | root | :root | renderer/tokens.css:177 |  |
|  | #5B647A | light | body.light-theme | renderer/tokens.css:301 |  |
|  | var(--text2) | root | :root | renderer/tokens.css:582 |  |
| --text-tertiary | var(--gray-400) | root | :root | renderer/tokens.css:100 | 7 |
|  | #A09D96 | root | :root | renderer/tokens.css:183 |  |
|  | #677187 | light | body.light-theme | renderer/tokens.css:310 |  |
| --toast-tone | var(--success-fg) | scoped | .toast.success | renderer/style.css:2065 | 5 |
|  | var(--danger-fg) | scoped | .toast.error | renderer/style.css:2066 |  |
|  | var(--warning-fg) | scoped | .toast.warning | renderer/style.css:2067 |  |
|  | var(--accent) | scoped | .toast.info | renderer/style.css:2068 |  |
| --wa-green | #25d366 | root | :root | renderer/whatsapp.css:7 | 5 |
| --wa-tint | rgba(37,211,102,.14) | root | :root | renderer/whatsapp.css:7 | 2 |
|  | #dcfce7 | light | body.light-theme | renderer/whatsapp.css:8 |  |
| --warn | #e5a13a | root | :root | renderer/recovery.html:16 | 1 |
| --warning | var(--amber) | root | :root | renderer/tokens.css:587 | 2 |
|  | var(--amber) | light | body.light-theme | renderer/tokens.css:631 |  |
|  | #fbbf24 | root | :root | renderer/license-settings.html:38 |  |
|  | #b45309 | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:60 |  |
| --warning-bd | rgba(251,191,36,0.28) | root | :root | renderer/license-settings.html:38 | 1 |
|  | #fde68a | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:60 |  |
| --warning-bg | #FBF2E2 | root | :root | renderer/tokens.css:74 | 8 |
|  | rgba(217, 164, 65, 0.14) | root | :root | renderer/tokens.css:243 |  |
|  | #FBF2E2 | light | body.light-theme | renderer/tokens.css:334 |  |
|  | rgba(251,191,36,0.12) | root | :root | renderer/license-settings.html:38 |  |
|  | #fffbeb | light-explicit | :root @media (prefers-color-scheme: light) | renderer/license-settings.html:60 |  |
| --warning-border | #EFD9A8 | root | :root | renderer/tokens.css:76 | 2 |
|  | rgba(217, 164, 65, 0.26) | root | :root | renderer/tokens.css:245 |  |
|  | #EFD9A8 | light | body.light-theme | renderer/tokens.css:336 |  |
| --warning-fg | #AD7A1E | root | :root | renderer/tokens.css:75 | 15 |
|  | #D9A441 | root | :root | renderer/tokens.css:244 |  |
|  | #95691A | light | body.light-theme | renderer/tokens.css:335 |  |
| --x-amber-fg | #B45309 | scoped | .dl-coll, .dl-pending | renderer/dashboard.css:1359 | 2 |
|  | var(--warning-fg) | light | body:not(.light-theme) .dl-coll, body:not(.light-theme) .dl-pending | renderer/dashboard.css:1374 |  |
| --x-blue | #2563EB | scoped | .dl-coll, .dl-pending | renderer/dashboard.css:1357 | 8 |
|  | var(--accent) | light | body:not(.light-theme) .dl-coll, body:not(.light-theme) .dl-pending | renderer/dashboard.css:1372 |  |
| --x-green | #16A34A | scoped | .dl-coll, .dl-pending | renderer/dashboard.css:1363 | 3 |
|  | var(--success-fg) | light | body:not(.light-theme) .dl-coll, body:not(.light-theme) .dl-pending | renderer/dashboard.css:1378 |  |
| --x-red-fg | #B91C1C | scoped | .dl-coll, .dl-pending | renderer/dashboard.css:1361 | 2 |
|  | var(--danger-fg) | light | body:not(.light-theme) .dl-coll, body:not(.light-theme) .dl-pending | renderer/dashboard.css:1376 |  |

### 2.3 Colour variables with zero references — 9

| Variable | Defined at |
|---|---|
| --ant-amber | renderer/tokens.css:455 |
| --ant-teal | renderer/tokens.css:454 |
| --background | renderer/tokens.css:577; renderer/tokens.css:624 |
| --border-default | renderer/tokens.css:402; renderer/tokens.css:603 |
| --border-token | renderer/tokens.css:580; renderer/tokens.css:626 |
| --divider | renderer/style.css:246 |
| --info-border | renderer/tokens.css:84; renderer/tokens.css:253; renderer/tokens.css:344 |
| --primary | renderer/tokens.css:584; renderer/tokens.css:628 |
| --red-line | renderer/license.html:39 |

All custom properties (any type) with zero references: 42 — --fw-regular, --fw-text, --fw-medium, --fw-semibold, --fw-bold, --fw-strong, --shadow-royal, --glow-indigo, --font-icon, --fw-body, --fw-label, --divider, --shadow-elevated, --r-lg, --info-border, --text-link, --radius-sm-new, --radius-xl, --font-sans, --text-md, --text-lg, --text-xl, --weight-regular, --weight-bold, --leading-normal, --leading-loose, --brand-primary, --brand-primary-hover, --brand-primary-soft, --brand-primary-dark, --border-default, --border-strong, --border-focus, --text-disabled, --ant-teal, --ant-amber, --ant-unit-track, --background, --surface-secondary, --border-token, --primary, --red-line.

### 2.4 Colour literals used instead of a variable — 1154 occurrences outside custom-property definitions; 214 of them equal the resolved value of an existing colour variable

| File | Literal occurrences |
|---|---|
| renderer/style.css | 460 |
| renderer/src/modules/students.js | 161 |
| renderer/src/modules/dashboard.js | 87 |
| renderer/src/receipt.js | 51 |
| renderer/license.html | 35 |
| renderer/src/modules/reports.js | 34 |
| renderer/dashboard.css | 31 |
| renderer/src/license.js | 31 |
| renderer/login.css | 29 |
| renderer/src/modules/modals.js | 28 |
| renderer/src/export/engine.js | 23 |
| renderer/chrome.css | 17 |
| renderer/index.html | 17 |
| renderer/src/utils.js | 16 |
| renderer/students.css | 15 |
| renderer/components.css | 14 |
| renderer/app.js | 13 |
| renderer/payments.css | 11 |
| renderer/rooms.css | 10 |
| renderer/whatsapp.css | 9 |
| renderer/settings.css | 7 |
| renderer/src/modules/settings.js | 6 |
| main.js | 5 |
| renderer/recovery.html | 5 |
| renderer/src/config.js | 5 |
| renderer/src/storage.js | 5 |
| renderer/titlebar.css | 5 |
| renderer/forms.css | 4 |
| renderer/src/modules/payments.js | 4 |
| renderer/cancellations.css | 2 |
| renderer/listkit.css | 2 |
| renderer/src/modules/nav.js | 2 |
| renderer/src/modules/sidebar_calendar.js | 2 |
| renderer/activitylog.css | 1 |
| renderer/expenses.css | 1 |
| renderer/license-settings.html | 1 |
| renderer/pw-eye.css | 1 |
| renderer/reports.css | 1 |
| renderer/src/auth-nev.js | 1 |
| renderer/src/modules/cancellations.js | 1 |
| renderer/support.css | 1 |

| Literal | Equals variable(s) | Count | Locations |
|---|---|---|---|
| #ffffffff | --card, --lg-surface, --sb-active-fg, --sb-active-surface | 55 | renderer/chrome.css:473; renderer/dashboard.css:1478,2204; renderer/login.css:137,153; +17 files |
| #e2e8f0ff | --line | 19 | renderer/src/modules/dashboard.js:2443,2484,2513 (+1); renderer/src/modules/students.js:3526,3535,3541 (+12) |
| #0f172aff | --sb-fg | 14 | renderer/src/modules/dashboard.js:2418,2431,2446 (+3); renderer/src/modules/students.js:4988,5013,5029 (+5) |
| #b91c1cff | --kpi-b, --kpi-loss-b | 14 | renderer/login.css:176; renderer/style.css:5184; renderer/src/modules/students.js:5017,5035,5039 (+5); +2 files |
| #2563ebff | --blue, --seat-free-fg | 11 | renderer/style.css:3242,5174; renderer/titlebar.css:63; renderer/license.html:87,190; +4 files |
| #f1f5f9ff | --seat-full-bg | 10 | renderer/src/modules/dashboard.js:2487,2489; renderer/src/modules/students.js:3544,5015,5023 (+4); renderer/src/export/engine.js:85 |
| #3b82f6ff | --lg-brand | 8 | renderer/style.css:2924,2924,2924 (+2); renderer/src/modules/dashboard.js:3357,3496; renderer/src/modules/reports.js:1310 |
| #16a34aff | --k | 7 | renderer/login.css:198,274; renderer/src/modules/dashboard.js:2452; renderer/src/modules/students.js:3538,5014; +2 files |
| #dc2626ff | --red | 6 | renderer/src/modules/dashboard.js:2451,2496,2510 (+1); renderer/src/modules/students.js:3538,5017 |
| #dcfce7ff | --wa-tint | 6 | renderer/src/modules/dashboard.js:2452,2494; renderer/src/modules/students.js:3524,5014,5039 (+1) |
| #ef4444ff | --kpi-a, --kpi-loss-a | 6 | renderer/chrome.css:473; renderer/rooms.css:268; renderer/style.css:3263; +2 files |
| #ffffff14 | --sb-divider | 6 | renderer/components.css:34,113; renderer/style.css:3143; renderer/src/modules/modals.js:490,528,532 |
| #60a5fa1a | --info-bg | 5 | renderer/style.css:4410,4413,4515 (+2) |
| #ffffff1a | --dash-track | 5 | renderer/chrome.css:267; renderer/style.css:1123,2961; renderer/src/modules/modals.js:507; +1 files |
| #93c5fdff | --accent-ink | 4 | renderer/style.css:2924,2924,3242; renderer/src/utils.js:274 |
| #d97706ff | --amber | 4 | renderer/rooms.css:218,218; renderer/src/utils.js:276,277 |
| #fef2f2ff | --red-dim | 4 | renderer/login.css:176; renderer/license.html:502,503,506 |
| #34d3991f | --conn-online-bg, --success-bg | 3 | renderer/style.css:3420,3903,4043 |
| #bfdbfeff | --seat-tile-br | 3 | renderer/login.css:184; renderer/src/modules/students.js:3517,3525 |
| #eff6ffff | --lg-brand-soft, --seat-free-bg | 3 | renderer/src/modules/dashboard.js:2505; renderer/src/modules/students.js:3514; renderer/index.html:169 |
| #fecacaff | --red-line | 3 | renderer/login.css:176; renderer/license.html:502,506 |
| #ffffff12 | --sb-hover | 3 | renderer/src/modules/dashboard.js:3517; renderer/src/modules/modals.js:481,500 |
| #059669ff | --green | 2 | renderer/style.css:3257; renderer/license.html:203 |
| #f87171ff | --danger | 2 | renderer/chrome.css:273; renderer/style.css:3263 |
| #fbbf24ff | --warning | 2 | renderer/whatsapp.css:70; renderer/src/modules/dashboard.js:3495 |
| #0f172a14 | --sb-border | 1 | renderer/dashboard.css:39 |
| #25d366ff | --wa-green | 1 | renderer/dashboard.css:1327 |
| #34d399ff | --success | 1 | renderer/style.css:2924 |
| #60a5faff | --accent, --primary, --sb-active, --sb-avatar | 1 | renderer/src/modules/students.js:3517 |
| #dbe7ffff | --blue-line | 1 | renderer/license.html:69 |
| #f5f5f5ff | --sb-fg | 1 | renderer/style.css:2849 |
| #f871711f | --danger-bg | 1 | renderer/style.css:3421 |
| #fbbf241f | --conn-degraded-bg, --warning-bg | 1 | renderer/whatsapp.css:67 |
| #ffffff0e | --dash-sunk | 1 | renderer/chrome.css:318 |

### 2.5 Dark mode

Mechanism: a class on `<body>` — `light-theme` present = light, absent = dark (theme.js:10 toggles it; theme.js:41-45 applies light when nothing is saved). Locations referring to the mechanism:

| Marker | Count | Locations |
|---|---|---|
| light-theme | 2 | renderer/src/modules/theme.js:10,45 |
| prefers-color-scheme | 2 | renderer/license-settings.html:19,44 |

Colour variables with a different resolved value in light vs dark (root) scope: 76.

| Variable | Dark (root) value | Light value |
|---|---|---|
| --accent-dim | #60a5fa24 | #2451d614 |
| --amber | #d97706ff | #95691aff |
| --amber-dim | #d9a44124 | #95691a17 |
| --ant-danger-bg | #c6454524 | #c645451c |
| --ant-danger-fg | #c64545ff | #a53535ff |
| --ant-neutral-bg | #a09d9624 | #6c6a641a |
| --ant-neutral-fg | #a09d96ff | #6c6a64ff |
| --ant-success-bg | #5db87224 | #5db87221 |
| --ant-success-fg | #5db872ff | #3f8f52ff |
| --ant-warning-bg | #d4a01724 | #d4a01726 |
| --ant-warning-fg | #d4a017ff | #96710fff |
| --background | #f4f7fcff | #f5f6f9ff |
| --bg | #f4f7fcff | #f5f6f9ff |
| --blue | #2563ebff | #2451d6ff |
| --blue-dim | #f0f5ffff | #2451d614 |
| --border | #2a2a2aff | #e4e7eeff |
| --border-default | #35322dff | #e4e7eeff |
| --border-token | #2a2a2aff | #e4e7eeff |
| --c-bg | #252320ff | #fafbfdff |
| --c-fg | #a09d96ff | #677187ff |
| --conn-degraded-bg | #fbbf241f | #fbf2e2ff |
| --conn-degraded-fg | #d9a441ff | #95691aff |
| --conn-offline-bg | #181715ff | #f5f6f9ff |
| --conn-online-bg | #34d3991f | #e8f5eeff |
| --conn-online-fg | #3fbf83ff | #1d8054ff |
| --conn-unconfigured-bg | #252320ff | #fafbfdff |
| --conn-unconfigured-fg | #a09d96ff | #677187ff |
| --danger | #f87171ff | #c0402fff |
| --danger-bg | #f871711f | #fbebe8ff |
| --danger-border | #f0796a42 | #f2c5bcff |
| --danger-fg | #f0796aff | #c0402fff |
| --dash-sunk | #ffffff0e | #f7f8fbff |
| --dash-track | #ffffff1a | #e7ebf2ff |
| --green | #059669ff | #1d8054ff |
| --green-dim | #3fbf8324 | #1d805417 |
| --info-bg | #60a5fa1a | #eaf0feff |
| --info-border | #7ba0ff42 | #b3c8faff |
| --info-fg | #7ba0ffff | #1b3faeff |
| --kpi-a | #d8443cff | #ef4444ff |
| --kpi-b | #a5211eff | #b91c1cff |
| --kpi-loss-a | #d8443cff | #ef4444ff |
| --kpi-loss-b | #a5211eff | #b91c1cff |
| --purple | #9b8cf0ff | #5b4bc4ff |
| --purple-dim | #9b8cf024 | #5b4bc417 |
| --red | #dc2626ff | #c0402fff |
| --red-dim | #fef2f2ff | #c0402f14 |
| --sb-active-edge | #2a2a2aff | #e4e7eeff |
| --sb-active-fg | #181715ff | #ffffffff |
| --sb-border | #ffffff17 | #0f172a14 |
| --sb-divider | #ffffff14 | #0f172a17 |
| --sb-fg | #f5f5f5ff | #0f172aff |
| --sb-hover | #ffffff12 | #0f172a0e |
| --sidebar-bg | #131211ff | #ffffffff |
| --success | #34d399ff | #1d8054ff |
| --success-bg | #34d3991f | #e8f5eeff |
| --success-border | #3fbf8342 | #bfe3d0ff |
| --success-fg | #3fbf83ff | #1d8054ff |
| --surface | #141414ff | #ffffffff |
| --surface-border | #35322dff | #e4e7eeff |
| --surface-divider | #2a2724ff | #d3d8e2ff |
| --surface-muted | #252320ff | #fafbfdff |
| --surface-sunken | #181715ff | #f5f6f9ff |
| --teal | #44d3c4ff | #0e7d87ff |
| --teal-dim | #44d3c41f | #0e7d8714 |
| --text | #e5e5e5ff | #17233aff |
| --text-on-accent | #181715ff | #ffffffff |
| --text-primary | #e5e5e5ff | #152238ff |
| --text-tertiary | #a09d96ff | #677187ff |
| --wa-tint | #25d36624 | #dcfce7ff |
| --warning | #fbbf24ff | #95691aff |
| --warning-bg | #fbbf241f | #fbf2e2ff |
| --warning-border | #d9a44142 | #efd9a8ff |
| --warning-fg | #d9a441ff | #95691aff |
| --x-amber-fg | #d9a441ff | #95691aff |
| --x-green | #3fbf83ff | #1d8054ff |
| --x-red-fg | #f0796aff | #c0402fff |

Colour variables with the same value in both (not redefined for light, or redefined to the same value): 44.

| Variable | Value |
|---|---|
| --accent | #60a5faff |
| --accent-ink | #93c5fdff |
| --ant-amber | #e8a55aff |
| --ant-teal | #5db8a6ff |
| --blue-line | #dbe7ffff |
| --card | #ffffffff |
| --conn-offline-fg | #5b647aff |
| --danger-bd | #f8717147 |
| --dh-bg | #eef1f6ff |
| --divider | #edeff4ff |
| --info-bd | #60a5fa3d |
| --ink | #0f2557ff |
| --k | #16a34aff |
| --kbar-a | #6f55c0ff |
| --kbar-b | #8b73d4ff |
| --kbar-fg | #fb923cff |
| --lg-brand | #3b82f6ff |
| --lg-brand-soft | #eff6ffff |
| --lg-ink | #16202eff |
| --lg-line | #e7eaeeff |
| --lg-panel | #f4f6f8ff |
| --lg-surface | #ffffffff |
| --line | #e2e8f0ff |
| --line-soft | #eef2f7ff |
| --muted | #9aa3abff |
| --ok | #3fa66aff |
| --panel | #232629ff |
| --primary | #60a5faff |
| --red-line | #fecacaff |
| --sb-active | #60a5faff |
| --sb-active-surface | #ffffffff |
| --sb-avatar | #60a5faff |
| --seat-free-bg | #eff6ffff |
| --seat-free-fg | #2563ebff |
| --seat-full-bg | #f1f5f9ff |
| --seat-tile-br | #bfdbfeff |
| --success-bd | #34d39947 |
| --surface-sunk | #0f0f0fff |
| --text-secondary | #5b647aff |
| --toast-tone | #60a5faff |
| --wa-green | #25d366ff |
| --warn | #e5a13aff |
| --warning-bd | #fbbf2447 |
| --x-blue | #60a5faff |

Colour literals written directly inside `.light-theme` selectors (not variables): 210 — renderer/chrome.css:119,120,121 (+6); renderer/dashboard.css:1373,1375,1377 (+20); renderer/listkit.css:244; renderer/login.css:40,40,40 (+2); renderer/payments.css:1365; renderer/students.css:832,1854; renderer/style.css:237,241,242 (+115); renderer/tokens.css:294,295,296 (+34); +2 files.

### 2.6 Palette by observed role (from the property each literal is used on)

**backgrounds/surfaces** — 169 distinct, 425 occurrences: #00000000 ×112, #0000000a ×16, #ffffffff ×15, #0000000f ×9, #00000014 ×7, #f1f5f9ff ×7, #dcfce7ff ×6, #fee2e2ff ×6, #3b82f608 ×5, #3b82f6ff ×5, #60a5fa1a ×5, #f871711a ×5, #0000001a ×4, #1d4ed8ff ×4, #60a5fa0a ×4, #f8fafcff ×4, #00000033 ×3, #0f172aff ×3, #2563ebff ×3, #34d3991a ×3, #34d3991f ×3, #38bdf814 ×3, #93c5fdff ×3, #dbeafeff ×3, #fafaf8ff ×3, #ffb4ab1f ×3, #ffffff0a ×3, #ffffff0f ×3, #ffffff14 ×3, #00000026 ×2 … (+139 more in CSV)

**custom-property definition** — 221 distinct, 323 occurrences: #ffffffff ×12, #00000000 ×6, #0000000a ×6, #2563ebff ×5, #00000066 ×4, #2451d6ff ×4, #eff6ffff ×4, #181715ff ×3, #2451d614 ×3, #3b82f6ff ×3, #7ba0ffff ×3, #b45309ff ×3, #b91c1cff ×3, #c0402fff ×3, #e8f5eeff ×3, #eaf0feff ×3, #f1f5f9ff ×3, #fbebe8ff ×3, #fbf2e2ff ×3, #0000000f ×2, #00000014 ×2, #00000059 ×2, #00000073 ×2, #0f172a0f ×2, #0f172a14 ×2, #15803dff ×2, #16a34aff ×2, #1b3faeff ×2, #1f1e1bff ×2, #1f8a5aff ×2 … (+191 more in CSV)

**text** — 71 distinct, 253 occurrences: #ffffffff ×35, #94a3b8ff ×19, #64748bff ×15, #475569ff ×13, #b91c1cff ×12, #0f172aff ×11, #000000ff ×9, #b45309ff ×9, #15803dff ×8, #1d4ed8ff ×8, #cbd5e1ff ×8, #dc2626ff ×6, #16a34aff ×5, #555555ff ×5, #2ec98aff ×4, #4a9cf0ff ×4, #111111ff ×3, #1e293bff ×3, #1e3a8aff ×3, #2563ebff ×3, #38bdf8ff ×3, #888888ff ×3, #fca5a5ff ×3, #00000000 ×2, #0284c7ff ×2, #0ea5e9ff ×2, #0f766eff ×2, #333333ff ×2, #4d6580ff ×2, #7c3aedff ×2 … (+41 more in CSV)

**borders/outlines** — 100 distinct, 232 occurrences: #00000000 ×41, #e2e8f0ff ×18, #d7c3b5ff ×11, #00000033 ×8, #2563eb4d ×5, #0000001a ×4, #1e293bff ×4, #34d39933 ×4, #60a5fa33 ×4, #f8717133 ×4, #0000001f ×3, #00000026 ×3, #0000004d ×3, #2ec98a4d ×3, #3b82f659 ×3, #bfdbfeff ×3, #d9e2f2ff ×3, #dbeafeff ×3, #e052524d ×3, #f871714d ×3, #fecacaff ×3, #1e3050ff ×2, #1e3c6aff ×2, #2563eb59 ×2, #2563ebff ×2, #3b82f633 ×2, #3b82f6b3 ×2, #4a9cf04d ×2, #bbbbbbff ×2, #c084fc40 ×2 … (+70 more in CSV)

**JS literal (canvas/chart/object)** — 82 distinct, 120 occurrences: #1a1c1eff ×4, #8b5cf6ff ×4, #dfe5ecff ×4, #e0e8f0ff ×4, #ffffffff ×4, #2563ebff ×3, #3b82f6ff ×3, #6b7a99ff ×3, #94a3b8ff ×3, #ef4444ff ×3, #fef2f2ff ×3, #ffffff12 ×3, #0000000a ×2, #141824ff ×2, #16a34aff ×2, #22c55eff ×2, #d97706ff ×2, #e0525266 ×2, #f97316ff ×2, #ffffff14 ×2, #ffffff1a ×2, #000000ff ×1, #06b6d4ff ×1, #087443ff ×1, #0891b2ff ×1, #0f766eff ×1, #123b8fff ×1, #14b8a6ff ×1, #155eefff ×1, #161616ff ×1 … (+52 more in CSV)

**shadows/overlays** — 61 distinct, 114 occurrences: #0000000a ×7, #0000000f ×6, #0000004d ×5, #00000080 ×5, #0000001a ×4, #0000001f ×4, #00000026 ×4, #0f172a29 ×4, #00000033 ×3, #00000099 ×3, #2563eb47 ×3, #38bdf81f ×3, #00000000 ×2, #0000000d ×2, #00000014 ×2, #0000002e ×2, #00000059 ×2, #000000b3 ×2, #0f172a0f ×2, #0f172a24 ×2, #2563eb1f ×2, #38bdf814 ×2, #3b82f61a ×2, #ffffff0a ×2, #ffffff0f ×2, #ffffff26 ×2, #00000024 ×1, #00000047 ×1, #00000057 ×1, #00000066 ×1 … (+31 more in CSV)

**other (font-family)** — 5 distinct, 5 occurrences: #0000002e ×1, #000000ff ×1, #111111ff ×1, #222222ff ×1, #e0e0e0ff ×1

**other (scrollbar-color)** — 1 distinct, 3 occurrences: #00000000 ×3

**other (-webkit-mask-image)** — 1 distinct, 1 occurrences: #000000ff ×1

**other (mask-image)** — 1 distinct, 1 occurrences: #000000ff ×1

## 3. Contrast

Measured in the running app: for every visible element with its own text, the computed text colour composited over the first opaque background up its ancestors (semi-transparent layers blended). Ratio per WCAG 2.1. Large text = ≥24px, or ≥18.66px with weight ≥700 (AA 3:1). Text over a background image or gradient is marked UNKNOWN (a pixel sample would settle it). Evidence is the DOM path and page (rendered facts have no single source line). Viewport: 1366×728 CSS px (devicePixelRatio 1). The "login" rows were measured with every top-level element outside the login screen hidden, so they hold login-screen text only.

### 3.1 light theme — 340 distinct text/background/size/weight combinations; 62 FAIL; 2 UNKNOWN (image/gradient background)

| Text | Background | Size/weight | Ratio | Result | Elements | Pages | Sample element |
|---|---|---|---|---|---|---|---|
| #d3d8e2 | #f3f3f3 | 12px/400 | 1.29:1 | FAIL | 3 | dashboard | footer.dash-foot > div.dash-foot__l > span.dash-foot__sep [dash-foot__sep] |
| #d3d8e2 | #ffffff | 13px/400 | 1.43:1 | FAIL | 1 | addpayment | div.tsk-head__l > nav.tsk-crumb > span.sep [sep] |
| #2ec98a | #e3f8ef | 11px/700 | 1.93:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #f0a030 | #fdf2e3 | 11px/700 | 1.94:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #404040 | #c0402f | 10px/800 | 1.98:1 | FAIL | 1 | cancellations | nav.sb-nav.sidebar__middle > div.nav-item.active > span#cancel-badge.nav-badge [nav-badge] |
| #c8a84b | #f8f3e7 | 11px/700 | 2.07:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #2ec98a | #ffffff | 12px/800 | 2.13:1 | FAIL | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #404040 | #95691a | 10px/800 | 2.13:1 | FAIL | 1 | issues | nav.sb-nav.sidebar__middle > div.nav-item.active > span#issues-badge.nav-badge [nav-badge] |
| #f0a030 | #ffffff | 12px/800 | 2.15:1 | FAIL | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #c8a84b | #ffffff | 12px/800 | 2.29:1 | FAIL | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #4a9cf0 | #e7f2fd | 11px/700 | 2.53:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #94a3b0 | #ffffff | 11.5px/400 | 2.58:1 | FAIL | 2 | login | div.lg-safe > span > span [lg-foot__c] |
| #4a9cf0 | #ffffff | 12px/800 | 2.87:1 | FAIL | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #9b6df0 | #f2ecfd | 11px/700 | 3.12:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #ad7a1e | #fbf2e2 | 9px/700 | 3.39:1 | FAIL | 3 | dashboard,students | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill stu-cov dh-amber] |
| #ad7a1e | #fbf2e2 | 11px/700 | 3.39:1 | FAIL | 4 | dashboard,cancellations,issues,complaints | div.dl-needs > button.dl-need.dh-amber > span.dl-need__verb [dl-need__verb lk-chip dh-amber] |
| #ad7a1e | #fbf2e2 | 11px/800 | 3.39:1 | FAIL | 1 | dashboard | div > div.dash-pay > div.dash-av.dh-amber [dash-av dh-amber] |
| #ad7a1e | #fbf2e2 | 10px/600 | 3.39:1 | FAIL | 1 | students | tr > td > span.stu-pill.dh-amber [stu-pill dh-amber] |
| #ad7a1e | #fbf2e2 | 11.5px/800 | 3.39:1 | FAIL | 1 | payments | td > div.pay-who > div.pay-who__av.dh-amber [pay-who__av dh-amber] |
| #ad7a1e | #fbf2e2 | 11.5px/700 | 3.39:1 | FAIL | 1 | expenses | tr > td > span.exp-cat.dh-amber [exp-cat dh-amber] |
| #3f8f52 | #edeef1 | 12.5px/700 | 3.44:1 | FAIL | 1 | payments | tr > td.pay-money.pay-money--in > span [] |
| #96710f | #e9e2d0 | 10.5px/700 | 3.48:1 | FAIL | 1 | payments | tr > td > span.pay-pill.dh-amber [pay-pill dh-amber] |
| #3f8f52 | #eaf6ed | 10.5px/700 | 3.59:1 | FAIL | 1 | payments | tr > td > span.pay-pill.dh-green [pay-pill dh-green] |
| #3f8f52 | #eaf6ed | 11.5px/600 | 3.59:1 | FAIL | 1 | settings | div.set-head > div.set-head__end > span#hi-savestate.hi-live [hi-live] |
| #9b6df0 | #ffffff | 12px/800 | 3.60:1 | FAIL | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #3b82f6 | #ffffff | 13px/600 | 3.68:1 | FAIL | 1 | login | section.lg-form > div.lg-meta > button.lg-link [lg-link] |
| #677187 | #dce1ea | 12.5px/400 | 3.73:1 | FAIL | 6 | settings | div.set-row.is-locked > div.set-row__c > span.set-dead [set-dead] |
| #ffffff | #ef4444 | 10px/800 | 3.76:1 | FAIL | 18 | dashboard,rooms,students,payments +14 | div > button#hdr-bell.hdr-btn > span#hdr-bell-count.hdr-btn__count [hdr-btn__count] |
| #ad7a1e | #ffffff | 11px/700 | 3.76:1 | FAIL | 1 | payments | div.pay-stat.pay-stat--click > div.pay-stat__foot > span.pay-stat__delta [pay-stat__delta] |
| #677187 | #d8e2ff | 8.5px/700 | 3.79:1 | FAIL | 1 | settings | div.hi-id__top > button#hi-logo.hi-logo > span.hi-logo__hint [hi-logo__hint] |
| #1f8a5a | #e8f5ee | 9px/700 | 3.87:1 | FAIL | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #1f8a5a | #e8f5ee | 11px/800 | 3.87:1 | FAIL | 2 | dashboard | div > div.dash-pay > div.dash-av.dh-green [dash-av dh-green] |
| #1f8a5a | #e8f5ee | 11px/700 | 3.87:1 | FAIL | 9 | rooms,activitylog,users,settings | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__state [rms-card__state lk-chip dh-green] |
| #1f8a5a | #e8f5ee | 10px/600 | 3.87:1 | FAIL | 5 | students | tr > td > span.stu-pill.dh-green [stu-pill dh-green] |
| #1f8a5a | #e8f5ee | 13px/600 | 3.87:1 | FAIL | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue [pay-btn pay-btn--hue dh-green] |
| #1f8a5a | #e8f5ee | 11.5px/800 | 3.87:1 | FAIL | 3 | payments | td > div.pay-who > div.pay-who__av.dh-green [pay-who__av dh-green] |
| #3f8f52 | #ffffff | 12.5px/700 | 3.99:1 | FAIL | 5 | payments | tr > td.pay-money.pay-money--in > span [pay-money pay-money--in] |
| #95691a | #eeebe7 | 10.5px/700 | 4.10:1 | FAIL | 1 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__vac [rms-card__vac] |
| #677187 | #e7ebf2 | 10px/500 | 4.10:1 | FAIL | 6 | students | td > div.stu-room > div.stu-room__t [stu-room__t] |
| #677187 | #e7ebf2 | 11px/500 | 4.10:1 | FAIL | 11 | payments,cancellations,issues,maintenance +1 | td > span.lk-room > span.lk-room__t [lk-room__t] |
| #677187 | #e7ebf2 | 11.5px/400 | 4.10:1 | FAIL | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__s [bk-drop__s] |
| #6c6a64 | #e0e1e3 | 9.5px/800 | 4.13:1 | FAIL | 1 | payments | div.pay-who > div > span.pay-cov.dh-slate [pay-cov dh-slate] |
| #677187 | #edeef1 | 10.5px/500 | 4.22:1 | FAIL | 1 | students | div.stu-who > div > div.stu-who__sub [stu-who__sub] |
| #677187 | #edeef1 | 10.5px/400 | 4.22:1 | FAIL | 2 | payments | div.pay-who > div > div.pay-who__meta [pay-who__meta pay-room__t] |
| #677187 | #edeef1 | 12.5px/400 | 4.22:1 | FAIL | 5 | payments,former,issues | tr > td.pay-col-x > span.pay-dash [pay-dash lk-empty__s lk-dash] |
| #677187 | #edeef1 | 11px/400 | 4.22:1 | FAIL | 5 | cancellations,issues,users | div.lk-who.dh-violet > div > div.lk-who__s [lk-who__s lk-sub] |
| #677187 | #edeef1 | 11.5px/400 | 4.22:1 | FAIL | 1 | users | div.usr-who > div > div.usr-who__s [usr-who__s] |
| #677187 | #edeef1 | 13.5px/400 | 4.22:1 | FAIL | 1 | users | tr > td > span.lk-dash [lk-dash] |
| #677187 | #fbebe8 | 11px/400 | 4.23:1 | FAIL | 1 | backup | div.bk-health.dh-red > span > small [] |
| #2563eb | #dbeafe | 11.5px/600 | 4.24:1 | FAIL | 1 | dashboard | div.dash-sec__head > button.dl-monthchip > span [] |
| #2563eb | #dbeafe | 13px/650 | 4.24:1 | FAIL | 1 | dashboard | div.dash-sec.dl-pending > div.dl-pend__foot > button.dl-remind [dl-remind] |
| #1f8a5a | #ffffff | 11px/700 | 4.34:1 | FAIL | 1 | payments | div.pay-stat.pay-stat--click > div.pay-stat__foot > span.pay-stat__delta [pay-stat__delta] |
| #1f8a5a | #ffffff | 14px/800 | 4.34:1 | FAIL | 1 | reports | div.mov__cv > span.money-value.money-value--body > span.money-amt [money-amt] |
| #677187 | #e8f5ee | 11px/400 | 4.37:1 | FAIL | 1 | support | div.conn-sum.is-online > span > small [] |
| #95691a | #fbf2e2 | 11.5px/600 | 4.38:1 | FAIL | 1 | dashboard | footer.dash-foot > div.dash-foot__r > span.dash-foot__state.is-warn [dash-foot__state is-warn] |
| #1d8054 | #e8f5ee | 11.5px/700 | 4.39:1 | FAIL | 3 | support | div.conn-rows > div.conn-row.is-online > span.conn-pill [conn-pill] |
| #677187 | #f3f3f3 | 12px/400 | 4.41:1 | FAIL | 5 | dashboard,rooms,addstudent | footer.dash-foot > div.dash-foot__l > span [dash-foot__tag dash-foot__stamp pager-info] |
| #677187 | #f3f3f3 | 12.5px/400 | 4.41:1 | FAIL | 3 | activitylog,backup,users | div.bk-head > div.set-head__mid > div.bk-head__s [bk-head__s] |
| #677187 | #f3f3f3 | 11.5px/600 | 4.41:1 | FAIL | 2 | addstudent | div > nav.asf-crumb > span [] |
| #677187 | #f3f3f3 | 10px/700 | 4.41:1 | FAIL | 1 | addstudent | div.asf-head > div.asf-meter > span.asf-meter__l [asf-meter__l] |
| #677187 | #f5f5f5 | 13.5px/400 | 4.49:1 | FAIL | 6 | archive | tr > td.nm > span [num] |
| #1d8054 | #e6f9f1 | 12.5px/700 | 4.50:1 | FAIL | 1 | dashboard | div.dash-sec > div.dash-sec__head > span.rt-full [rt-full] |
| #3b82f6 | #f4f6f8 | 20px/800 | 3.39:1 | PASS AA (large) | 1 | login | span.lg-mark > svg > text [] |
| #b45309 | #fef3c7 | 11.5px/650 | 4.51:1 | PASS AA | 5 | dashboard | div.dash-pay > div > span.dash-status.dh-slate [dash-status dh-slate] |
| #c0402f | #fbebe8 | 9px/700 | 4.52:1 | PASS AA | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #c0402f | #fbebe8 | 10px/700 | 4.52:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-panel > div.dash-sec__head.dl-head3 > span.dash-pill.dh-red [dash-pill dh-red] |
| #c0402f | #fbebe8 | 11px/700 | 4.52:1 | PASS AA | 7 | dashboard,issues,maintenance,complaints | div.dl-needs > button.dl-need.dh-red > span.dl-need__verb [dl-need__verb lk-chip dh-red] |
| #fafafa | #737373 | 13.5px/650 | 4.54:1 | PASS AA | 17 | dashboard,rooms,students,payments +13 | nav.sb-nav.sidebar__middle > div.nav-item.active > span.nav-label [nav-label] |
| #95691a | #f7f8fb | 10px/700 | 4.58:1 | PASS AA | 1 | rooms | div.rms-occ > span.rms-occ__chip.is-vacating > b.rms-occ__vac [rms-occ__vac] |
| #1d8054 | #ecfcf6 | 11px/600 | 4.64:1 | PASS AA | 1 | dashboard | tr.dash-rp-row > td > span.badge.badge-green [badge badge-green] |
| #2563eb | #eff6ff | 12px/650 | 4.75:1 | PASS AA | 1 | login | div#login-card > aside.lg-side > span.lg-badge [lg-badge] |
| #2563eb | #eff6ff | 13px/700 | 4.75:1 | PASS AA | 40 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.n [n] |
| #2563eb | #f4f6f8 | 25px/800 | 4.77:1 | PASS AA | 1 | login | aside.lg-side > h2.lg-h2 > em [] |
| #ffffff | #95691a | 10px/800 | 4.87:1 | PASS AA | 18 | dashboard,rooms,students,payments +14 | nav.sb-nav.sidebar__middle > div.nav-item > span#issues-badge.nav-badge [nav-badge] |
| #677187 | #ffffff | 11px/400 | 4.90:1 | PASS AA | 70 | dashboard,payments,cancellations,former +9 | div.hdr-greet > span.hdr-greet__b > span.hdr-greet__sub [hdr-greet__sub seat-hd__s dash-pay__room] |
| #677187 | #ffffff | 10px/700 | 4.90:1 | PASS AA | 28 | dashboard,rooms,students,payments +14 | div#hdr-search-wrap > div.hdr-find > kbd.hdr-kbd [hdr-kbd dash-rp-stat__label stu-stat__label] |
| #677187 | #ffffff | 9.05658px/600 | 4.90:1 | PASS AA | 5 | dashboard | div.dash-kpi__value > span.money-value.money-value--display > span.money-cur [money-cur] |
| #677187 | #ffffff | 6.825px/600 | 4.90:1 | PASS AA | 1 | dashboard | div.dsh-card.dh-blue > div.dash-kpi__sub > span.pkr [pkr] |
| #677187 | #ffffff | 10.5px/400 | 4.90:1 | PASS AA | 59 | dashboard,rooms,payments,expenses +5 | div.dash-kpi__split > span.dash-kpi__srow > span.dash-kpi__slabel [dash-kpi__slabel dnut__sub dash-pay__due] |
| #677187 | #ffffff | 8px/700 | 4.90:1 | PASS AA | 2 | dashboard | span.dash-kpi__srow > b > span.pkr [pkr] |
| #677187 | #ffffff | 12px/700 | 4.90:1 | PASS AA | 2 | dashboard | div.dnut__top > span.dnut__fig > span.rt-of [rt-of dnut__cur] |
| #677187 | #ffffff | 9.5px/400 | 4.90:1 | PASS AA | 3 | dashboard,activitylog,settings | div.dnut > div.dnut__mid > div.dnut__sub [dnut__sub hi-ring__l] |
| #677187 | #ffffff | 10px/600 | 4.90:1 | PASS AA | 7 | dashboard,addstudent | div.rt-right > div.rt-list__hd > span [rt-list__hd-rooms rt-list__hd-occ asf-secmeta] |
| #677187 | #ffffff | 11.5px/400 | 4.90:1 | PASS AA | 134 | dashboard,rooms,cancellations,former +8 | div.dl-meth > button.dl-meth__row > span.dl-meth__pct [dl-meth__pct dash-rp-date k] |
| #677187 | #ffffff | 13px/600 | 4.90:1 | PASS AA | 17 | dashboard,payments,backup,users +1 | div.dl-meth > button.dl-meth__row.is-zero > span.dl-meth__amt [dl-meth__amt cur set-tab] |
| #677187 | #ffffff | 13.5px/400 | 4.90:1 | PASS AA | 63 | dashboard,activitylog,archive | tr.dash-rp-row > td > span.dash-rp-nil [dash-rp-nil lk-dash num] |
| #677187 | #ffffff | 11px/600 | 4.90:1 | PASS AA | 9 | rooms,expenses,addpayment | div.rms-stat__top > div > div.rms-stat__label [rms-stat__label exp-stat__l ws__add] |
| #677187 | #ffffff | 12px/600 | 4.90:1 | PASS AA | 8 | rooms,reports | div > div.rms-stat__val > small [rpt-tile__l] |
| #677187 | #ffffff | 10.5px/500 | 4.90:1 | PASS AA | 12 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__sub [stu-stat__sub stu-who__sub lk-statdate] |
| #677187 | #ffffff | 17.36px/700 | 4.90:1 | PASS AA | 1 | students | div.stu-stat.stu-stat--click > div.stu-stat__val > small [] |
| #677187 | #ffffff | 12.5px/400 | 4.90:1 | PASS AA | 52 | students,payments,expenses,cancellations +8 | div.stu-panel > div.stu-foot > div.stu-foot__size [stu-foot__size stu-foot__info pay-meta__txt] |
| #1d8054 | #ffffff | 11px/800 | 4.92:1 | PASS AA | 1 | dashboard | button.dl-glance__row > span.dl-glance__body > span.dl-glance__sub.dl-money [dl-glance__sub dl-money] |
| #1d8054 | #ffffff | 28px/700 | 4.92:1 | PASS AA | 1 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val.is-good [stu-stat__val is-good] |
| #2563eb | #ffffff | 12.5px/650 | 5.17:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-pending > div.dash-sec__head > button.dash-link.dl-pend__all [dash-link dl-pend__all] |
| #52627a | #e7ebf2 | 9px/600 | 5.19:1 | PASS AA | 3 | dashboard | div.seat-inline > span.seat-inline__k > span [] |
| #52627a | #e7ebf2 | 11.5px/600 | 5.19:1 | PASS AA | 13 | dashboard,payments,expenses | tr.dash-rp-row > td > span.pm-chip [pm-chip exp-meth] |
| #52627a | #e7ebf2 | 12px/600 | 5.19:1 | PASS AA | 3 | rooms | div.pager > div.pager-controls > button.pager-btn [pager-btn] |
| #52627a | #e7ebf2 | 9.5px/700 | 5.19:1 | PASS AA | 10 | students | thead > tr > th.is-sortable [is-sortable] |
| #52627a | #e7ebf2 | 9px/700 | 5.19:1 | PASS AA | 24 | students,payments,expenses,cancellations +1 | tr > th.is-sortable > span.arw [arw] |
| #52627a | #e7ebf2 | 10px/700 | 5.19:1 | PASS AA | 85 | payments,expenses,cancellations,former +7 | thead > tr > th.is-sortable [is-sortable pay-col-x pay-col-act] |
| #ffffff | #c0402f | 10px/800 | 5.23:1 | PASS AA | 18 | dashboard,rooms,students,payments +14 | nav.sb-nav.sidebar__middle > div.nav-item > span#cancel-badge.nav-badge [nav-badge] |
| #c0402f | #ffffff | 12.5px/700 | 5.23:1 | PASS AA | 7 | dashboard,addpayment | tr.dash-rp-row > td > span.dash-rp-num.dash-rp-num--due [dash-rp-num dash-rp-num--due req] |
| #c0402f | #ffffff | 28px/700 | 5.23:1 | PASS AA | 1 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val.is-bad [stu-stat__val is-bad] |
| #52627a | #edebfa | 12px/400 | 5.27:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-violet > span.dl-need__label [dl-need__label] |
| #b91c1c | #fee2e2 | 11.5px/700 | 5.30:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-pending > div.dash-sec__head > span.dl-pend__count [dl-pend__count] |
| #52627a | #edeef1 | 12px/500 | 5.34:1 | PASS AA | 2 | students | tbody > tr > td.stu-idc [stu-idc] |
| #52627a | #edeef1 | 10.5px/500 | 5.34:1 | PASS AA | 2 | students | td > span.stu-addr > span.stu-addr__t [stu-addr__t stu-nat] |
| #52627a | #fbebe8 | 12px/400 | 5.36:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-red > span.dl-need__label [dl-need__label] |
| #5a6675 | #f4f6f8 | 9.5px/600 | 5.40:1 | PASS AA | 1 | login | div.lg-brand > span > span.lg-brand__s [lg-brand__s] |
| #5a6675 | #f4f6f8 | 13.5px/400 | 5.40:1 | PASS AA | 1 | login | div#login-card > aside.lg-side > p.lg-sub [lg-sub] |
| #5a6675 | #f4f6f8 | 12px/400 | 5.40:1 | PASS AA | 4 | login | li.lg-feat > span > span [] |
| #52627a | #eaf0fe | 12px/400 | 5.43:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__label [dl-need__label] |
| #2451d6 | #e7ebf2 | 14px/800 | 5.45:1 | PASS AA | 1 | dashboard | div.seat-inline > span.seat-inline__k.is-free > b [] |
| #52627a | #eef1f6 | 9px/700 | 5.48:1 | PASS AA | 6 | dashboard,students | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill.dh-slate [dash-pill dh-slate stu-cov] |
| #52627a | #eef1f6 | 11px/600 | 5.48:1 | PASS AA | 2 | dashboard | div.dash-sec > div.seat-foot > button.seat-foot__b [seat-foot__b] |
| #52627a | #eef1f6 | 9.5px/800 | 5.48:1 | PASS AA | 6 | dashboard | tr.dash-rp-row > td > span.lk-cov.dh-slate [lk-cov dh-slate] |
| #5b4bc4 | #edebfa | 9px/700 | 5.50:1 | PASS AA | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #5b4bc4 | #edebfa | 11px/700 | 5.50:1 | PASS AA | 26 | dashboard,rooms,users | div.dl-needs > button.dl-need.dh-violet > span.dl-need__verb [dl-need__verb rms-card__state lk-chip] |
| #5b4bc4 | #edebfa | 11px/800 | 5.50:1 | PASS AA | 2 | dashboard | div > div.dash-pay > div.dash-av.dh-violet [dash-av dh-violet] |
| #52627a | #fbf2e2 | 12px/400 | 5.58:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-amber > span.dl-need__label [dl-need__label] |
| #52627a | #f3f3f3 | 12px/650 | 5.59:1 | PASS AA | 2 | dashboard | footer.dash-foot > div.dash-foot__l > span.dash-foot__brand [dash-foot__brand] |
| #52627a | #f1f5f9 | 13px/700 | 5.66:1 | PASS AA | 2 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.n [n] |
| #52627a | #f1f5f9 | 10.5px/650 | 5.66:1 | PASS AA | 2 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.c [c] |
| #52627a | #eff6ff | 10.5px/650 | 5.70:1 | PASS AA | 40 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.c [c] |
| #2451d6 | #eaf0fe | 11px/700 | 5.71:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__verb [dl-need__verb] |
| #2451d6 | #eaf0fe | 13px/600 | 5.71:1 | PASS AA | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue [pay-btn pay-btn--hue dh-blue] |
| #52627a | #f7f8fb | 11px/600 | 5.84:1 | PASS AA | 2 | dashboard | div.dash-sec__head > div.trend-range > button.trend-range__b [trend-range__b] |
| #52627a | #f7f8fb | 10.5px/400 | 5.84:1 | PASS AA | 6 | rooms | div.rms-occ > span.rms-occ__chip > span [] |
| #5a6675 | #ffffff | 13.5px/400 | 5.85:1 | PASS AA | 1 | login | div#login-card > section.lg-form > p.lg-p [lg-p] |
| #5a6675 | #ffffff | 13px/550 | 5.85:1 | PASS AA | 1 | login | section.lg-form > div.lg-meta > label.lg-remember [lg-remember] |
| #5a6675 | #ffffff | 11.5px/600 | 5.85:1 | PASS AA | 1 | login | section.lg-form > div.lg-foot > span#login-version.lg-foot__v [lg-foot__v] |
| #2451d6 | #eff6ff | 11px/600 | 5.99:1 | PASS AA | 5 | dashboard | tr.dash-rp-row > td > span.badge.badge-gold [badge badge-gold] |
| #52627a | #ffffff | 10px/700 | 6.20:1 | PASS AA | 7 | dashboard,addpayment | div.dsh-card.dh-blue > div.dash-kpi__top > div.dash-kpi__label [dash-kpi__label ap-card__h] |
| #52627a | #ffffff | 10.5px/600 | 6.20:1 | PASS AA | 5 | dashboard | div.dash-kpi-grid > div.dsh-card.dh-blue > div.dash-kpi__sub [dash-kpi__sub kbar__pct seat-key__k] |
| #52627a | #ffffff | 11px/600 | 6.20:1 | PASS AA | 29 | dashboard,settings,support,addpayment | div.dsh-card.dh-blue > div.kbar.kbar--blue > div.kbar__pct [kbar__pct rt-row__rooms req] |
| #52627a | #ffffff | 10px/600 | 6.20:1 | PASS AA | 10 | dashboard | div.dash-sec__head > div.dash-legend > span.dash-legend__k.dh-blue [dash-legend__k dh-blue dh-slate] |
| #52627a | #ffffff | 11.5px/600 | 6.20:1 | PASS AA | 38 | dashboard,settings,support,addstudent | div.dl-glance__row.dl-glance__row--static > span.dl-glance__body > span.dl-glance__label [dl-glance__label set-btn set-btn--sm] |
| #52627a | #ffffff | 12.5px/600 | 6.20:1 | PASS AA | 45 | dashboard,rooms,students,payments +7 | div.dl-meth > button.dl-meth__row > span.dl-meth__name [dl-meth__name rms-btn pay-money] |
| #52627a | #ffffff | 12.5px/700 | 6.20:1 | PASS AA | 13 | dashboard,payments,support | tr.dash-rp-row > td > span.dash-rp-room [dash-rp-room sup-empty__t] |
| #52627a | #ffffff | 12px/600 | 6.20:1 | PASS AA | 43 | rooms,students,payments,reports | div.rms-tools > div.rms-seg > button [stu-btn pay-stat__label rpt-card__a] |
| #52627a | #ffffff | 12px/500 | 6.20:1 | PASS AA | 10 | students | tbody > tr > td.stu-idc [stu-idc] |
| #52627a | #ffffff | 10.5px/500 | 6.20:1 | PASS AA | 10 | students | td > span.stu-addr > span.stu-addr__t [stu-addr__t stu-nat] |
| #52627a | #ffffff | 13px/600 | 6.20:1 | PASS AA | 31 | payments,cancellations,former,issues +9 | div.pay-tools > div > button.pay-btn [pay-btn lk-btn set-btn] |
| #b91c1c | #ffffff | 13px/750 | 6.47:1 | PASS AA | 5 | dashboard | div > div > div.dash-pay__amt [dash-pay__amt] |
| #ffffff | #2451d6 | 12.5px/800 | 6.52:1 | PASS AA | 19 | dashboard,rooms,students,payments +15 | div.sb-user-wrap > div#sb-user.sb-user > div#sb-user-av.sb-user__av [sb-user__av] |
| #ffffff | #2451d6 | 13px/600 | 6.52:1 | PASS AA | 17 | dashboard,rooms,students,payments +12 | div.hdr-right > button#hdr-action.btn.btn-primary > span#hdr-action-text [is-on set-btn set-btn--go] |
| #ffffff | #2451d6 | 12px/800 | 6.52:1 | PASS AA | 6 | dashboard | td > div.dash-rp-who > div.dash-rp-av [dash-rp-av] |
| #2451d6 | #ffffff | 12.5px/600 | 6.52:1 | PASS AA | 1 | rooms | div.rms-panel > div.rms-tools > button.rms-btn.rms-btn--go [rms-btn rms-btn--go] |
| #ffffff | #2451d6 | 12px/600 | 6.52:1 | PASS AA | 30 | rooms,students | div.rms-card__body.dh-green > div.rms-acts > button.rms-add [rms-add pager-btn active] |
| #ffffff | #2451d6 | 12.5px/600 | 6.52:1 | PASS AA | 10 | students,payments,expenses,cancellations +6 | div.stu-foot > div.stu-pager > button.is-on [is-on rpt-tab pf-btn] |
| #ffffff | #545e6f | 10.5px/600 | 6.55:1 | PASS AA | 30 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__beds [rms-card__beds] |
| #3a2500 | #f59e0b | 12px/600 | 6.77:1 | PASS AA | 2 | rooms | div.rms-card__body.dh-green > div.rms-acts > button.rms-force [rms-force] |
| #1b3fae | #dde2ef | 12px/700 | 6.84:1 | PASS AA | 1 | students | td > div.stu-who > span.stu-av.dh-amber [stu-av dh-amber is-initials] |
| #1b3fae | #d8e2ff | 10.5px/600 | 6.86:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-panel > div.dl-foot.dl-foot--tint > span [] |
| #1b3fae | #e7ebf2 | 9.5px/700 | 7.41:1 | PASS AAA | 1 | students | thead > tr > th.is-sortable.is-sorted [is-sortable is-sorted] |
| #1b3fae | #e7ebf2 | 9px/700 | 7.41:1 | PASS AAA | 5 | students,payments,expenses,cancellations +1 | tr > th.is-sortable.is-sorted > span.arw [arw] |
| #1b3fae | #e7ebf2 | 10px/700 | 7.41:1 | PASS AAA | 4 | payments,expenses,cancellations,former | thead > tr > th.is-sortable.is-sorted [is-sortable is-sorted] |
| #1b3fae | #edf1fc | 12px/600 | 7.85:1 | PASS AAA | 1 | rooms | div.rms-tools > div.rms-seg > button.is-on [is-on] |
| #1b3fae | #edf1fc | 11px/600 | 7.85:1 | PASS AAA | 30 | rooms | div.rms-card__body.dh-green > div.rms-card__head > span.rms-card__type [rms-card__type] |
| #1b3fae | #edf1fc | 12px/700 | 7.85:1 | PASS AAA | 5 | students | td > div.stu-who > span.stu-av.dh-green [stu-av dh-green is-initials] |
| #1b3fae | #ffffff | 12px/700 | 8.87:1 | PASS AAA | 4 | dashboard,support | div.dash-sec > div.dash-sec__head > button.dash-link [dash-link sup-big__a] |
| #334155 | #ffffff | 10px/800 | 10.35:1 | PASS AAA | 95 | dashboard,rooms,students,payments +15 | aside#sidebar > nav.sb-nav.sidebar__middle > div.sb-section [sb-section] |
| #334155 | #ffffff | 13.5px/500 | 10.35:1 | PASS AAA | 268 | dashboard,rooms,students,payments +15 | nav.sb-nav.sidebar__middle > div.nav-item > span.nav-label [nav-label] |
| #334155 | #ffffff | 11px/400 | 10.35:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div#sb-user.sb-user > div.sb-user__id > div#sb-user-role.sb-user__role [sb-user__role] |
| #17233a | #e7ebf2 | 12px/700 | 13.13:1 | PASS AAA | 25 | dashboard,rooms,students,payments +15 | div.sb-month-picker__header > div.sb-month-picker__display > span#sb-cal-today-lbl.sb-month-picker__label [sb-month-picker__label stu-room__n] |
| #17233a | #e7ebf2 | 14px/800 | 13.13:1 | PASS AAA | 2 | dashboard | div.seat-inline > span.seat-inline__k > b [] |
| #17233a | #edebfa | 15px/800 | 13.35:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-violet > span.dl-need__n [dl-need__n] |
| #17233a | #edebfa | 11px/600 | 13.35:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-violet > span.dl-act__label [dl-act__label] |
| #17233a | #edeef1 | 12.5px/700 | 13.53:1 | PASS AAA | 2 | students | div.stu-who > div > div.stu-who__name [stu-who__name stu-charge] |
| #17233a | #edeef1 | 11.5px/500 | 13.53:1 | PASS AAA | 1 | students | tr > td > div.stu-contact [stu-contact] |
| #17233a | #edeef1 | 11px/500 | 13.53:1 | PASS AAA | 1 | students | span.stu-cnic > span.cnic-r > span.cnic-r__m [cnic-r__m] |
| #17233a | #fbebe8 | 15px/800 | 13.57:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-red > span.dl-need__n [dl-need__n] |
| #17233a | #eaf0fe | 15px/800 | 13.75:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__n [dl-need__n] |
| #17233a | #eaf0fe | 11px/600 | 13.75:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-blue > span.dl-act__label [dl-act__label] |
| #17233a | #e8f5ee | 11px/600 | 14.00:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-green > span.dl-act__label [dl-act__label] |
| #17233a | #fbf2e2 | 15px/800 | 14.13:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-amber > span.dl-need__n [dl-need__n] |
| #17233a | #fbf2e2 | 11px/600 | 14.13:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-amber > span.dl-act__label [dl-act__label] |
| #16202e | #f4f6f8 | 25px/800 | 15.14:1 | PASS AAA | 2 | login | div.lg-brand > span > span.lg-brand__n [lg-brand__n lg-h2] |
| #16202e | #f4f6f8 | 13.5px/700 | 15.14:1 | PASS AAA | 4 | login | li.lg-feat > span > b [] |
| #17233a | #ffffff | 26px/700 | 15.70:1 | PASS AAA | 18 | dashboard,rooms,students,payments +14 | div.hdr-left > div.hdr-title-wrap > div#hdr-title.page-title [page-title] |
| #17233a | #ffffff | 12.5px/700 | 15.70:1 | PASS AAA | 52 | dashboard,students,payments,expenses +4 | div.hdr-greet > span.hdr-greet__b > span.hdr-greet__hi [hdr-greet__hi dash-pay__name dash-rp-num] |
| #17233a | #ffffff | 26.637px/700 | 15.70:1 | PASS AAA | 5 | dashboard | div.dash-kpi__value > span.money-value.money-value--display > span.money-amt [money-amt] |
| #17233a | #ffffff | 10.5px/700 | 15.70:1 | PASS AAA | 2 | dashboard | div.dash-kpi__split > span.dash-kpi__srow > b [] |
| #17233a | #ffffff | 13px/700 | 15.70:1 | PASS AAA | 54 | dashboard,payments,issues,settings +4 | div.dash-sec > div.dash-sec__head > span.dash-sec__title [dash-sec__title dl-glance__n dl-meth__amt] |
| #17233a | #ffffff | 11px/700 | 15.70:1 | PASS AAA | 1 | dashboard | div.dash-sec__head > div.trend-range > button.trend-range__b.is-on [trend-range__b is-on] |
| #17233a | #ffffff | 14.5px/700 | 15.70:1 | PASS AAA | 7 | dashboard,reports | div.dash-sec__head.seat-head > div.seat-hd > div.seat-hd__t [seat-hd__t rpt-card__h] |
| #17233a | #ffffff | 21px/800 | 15.70:1 | PASS AAA | 12 | dashboard,reports,backup,settings +1 | div.dnut__mid > div.dnut__top > span.dnut__fig [dnut__fig mov__t set-head__t] |
| #17233a | #ffffff | 12px/700 | 15.70:1 | PASS AAA | 6 | dashboard,reports | div.rt-right > div.rt-row > span.rt-row__name [rt-row__name rpt-brow__v] |
| #17233a | #ffffff | 24px/800 | 15.70:1 | PASS AAA | 4 | dashboard,activitylog | div.dnut__mid > div.dnut__top > span.dnut__fig [dnut__fig al-kpi__v] |
| #17233a | #ffffff | 17px/800 | 15.70:1 | PASS AAA | 4 | dashboard | div.dash-rp-stat.dh-blue > div.dash-rp-stat__body > div.dash-rp-stat__val [dash-rp-stat__val] |
| #17233a | #ffffff | 20px/700 | 15.70:1 | PASS AAA | 5 | rooms,settings | div.rms-stat__top > div > div.rms-stat__val [rms-stat__val hi-id__name] |
| #17233a | #ffffff | 15px/700 | 15.70:1 | PASS AAA | 31 | rooms | div.rms-shell > div.rms-head > div.rms-head__t [rms-head__t rms-card__num] |
| #17233a | #ffffff | 11.5px/700 | 15.70:1 | PASS AAA | 74 | rooms,activitylog,settings,support +1 | div.rms-card__body.dh-green > div.rms-row > span.v [v hi-store__v al-user__v] |
| #17233a | #ffffff | 28px/700 | 15.70:1 | PASS AAA | 4 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val [stu-stat__val] |
| #17233a | #ffffff | 11.5px/500 | 15.70:1 | PASS AAA | 5 | students | tr > td > div.stu-contact [stu-contact] |
| #17233a | #ffffff | 11px/500 | 15.70:1 | PASS AAA | 5 | students | span.stu-cnic > span.cnic-r > span.cnic-r__m [cnic-r__m] |
| #17233a | #ffffff | 26px/800 | 15.70:1 | PASS AAA | 4 | payments | div.pay-stats > div.pay-stat.dh-green > div.pay-stat__val [pay-stat__val] |
| #16202e | #ffffff | 27px/800 | 16.40:1 | PASS AAA | 1 | login | div#login-card > section.lg-form > h1.lg-h [lg-h] |
| #16202e | #ffffff | 13.5px/700 | 16.40:1 | PASS AAA | 1 | login | section.lg-form > p.lg-p > b#login-hostel-name [] |
| #16202e | #ffffff | 12.5px/650 | 16.40:1 | PASS AAA | 2 | login | div#login-card > section.lg-form > label.lg-lbl [lg-lbl] |
| #ffffff | #ffffff (over linear-gradient(90deg, rgb(59, 130, 246), rgb(37, ) | 15px/700 | n/a | UNKNOWN | 1 | login | div#login-card > section.lg-form > button#login-btn |
| #16202e | #ffffff | 12.5px/600 | 16.40:1 | PASS AAA | 1 | login | div.lg-safe > span > b [] |
| #2ec98a | #f7f9fb (over radial-gradient(1100px 620px at 12% -10%, rgb(238,) | 9px/400 | n/a | UNKNOWN | 1 | login | body.light-theme.has-titlebar > div#login-screen > div#license-badge |
| #ad7a1e | #ffffff | 22px/800 | 3.76:1 | PASS AA (large) | 1 | reports | div.rpt-tile.dh-amber > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #1f8a5a | #ffffff | 22px/800 | 4.34:1 | PASS AA (large) | 1 | reports | div.rpt-tile.dh-green > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #95691a | #f7f8fb | 13.5px/800 | 4.58:1 | PASS AA | 1 | archive | tbody > tr.arc-sub > td.num [num] |
| #677187 | #f7f8fb | 12.5px/600 | 4.61:1 | PASS AA | 9 | reports | div#content > div.rpt-tabs > button.rpt-tab [rpt-tab] |
| #677187 | #f7f8fb | 10.5px/700 | 4.61:1 | PASS AA | 12 | backup,settings | div.set-head > div.set-head__end > span.set-lock [set-lock] |
| #677187 | #f7f8fb | 9.5px/700 | 4.61:1 | PASS AA | 8 | users,addpayment | div > div.usr-who__n > span.usr-you [usr-you ws__ha] |
| #677187 | #f7f8fb | 11.5px/400 | 4.61:1 | PASS AA | 1 | support | div.set-card > div.sup-note > span [] |
| #677187 | #f7f8fb | 12px/400 | 4.61:1 | PASS AA | 5 | support | div.sup-grid > div.sup-row > span.sup-row__l [sup-row__l] |
| #677187 | #f7f8fb | 11px/400 | 4.61:1 | PASS AA | 8 | archive,addstudent | div.arc-panel > div.arc-panel__head > span.arc-panel__n [arc-panel__n arc-legend__i] |
| #677187 | #f7f8fb | 11.5px/600 | 4.61:1 | PASS AA | 1 | addpayment | div.ws__d > div#f-pmess-seg.ws__seg > button.ws__seg-b [ws__seg-b] |
| #677187 | #f7f8fb | 11px/700 | 4.61:1 | PASS AA | 1 | addpayment | div#ap-summary > div.ap-stub__bal.is-none > span [] |
| #677187 | #f7f8fb | 16px/800 | 4.61:1 | PASS AA | 1 | addpayment | div#ap-summary > div.ap-stub__bal.is-none > b [] |
| #1d8054 | #f7f8fb | 13.5px/800 | 4.63:1 | PASS AA | 2 | archive | tbody > tr.arc-sub > td.num [num] |
| #677187 | #fafbfd | 11.5px/700 | 4.73:1 | PASS AA | 1 | support | div.conn-rows > div.conn-row.is-unconfigured > span.conn-pill [conn-pill] |
| #6c6a64 | #f0f0f0 | 9.5px/800 | 4.75:1 | PASS AA | 5 | payments | div.pay-who > div > span.pay-cov.dh-slate [pay-cov dh-slate] |
| #6c6a64 | #f0f0f0 | 10.5px/700 | 4.75:1 | PASS AA | 4 | payments | tr > td > span.pay-pill.dh-slate [pay-pill dh-slate] |
| #6c6a64 | #f0f0f0 | 11px/600 | 4.75:1 | PASS AA | 1 | expenses | div.exp-stat__c > div.exp-stat__vrow > span.exp-stat__trend.is-none [exp-stat__trend is-none] |
| #52627a | #d8e2ff | 12px/400 | 4.80:1 | PASS AA | 1 | backup | div.set-card > div.bk-warn.is-info > span [] |
| #52627a | #d8e2ff | 11.5px/400 | 4.80:1 | PASS AA | 5 | backup,users,settings | div.set-card > div.cfg-note > span [] |
| #52627a | #d8e2ff | 11.5px/700 | 4.80:1 | PASS AA | 3 | backup,users,settings | div.cfg-note > span > b [] |
| #95691a | #ffffff | 14px/800 | 4.87:1 | PASS AA | 1 | archive | div.arc-kpi__v > span.money-value.money-value--body > span.money-amt [money-amt] |
| #95691a | #ffffff | 13.5px/400 | 4.87:1 | PASS AA | 1 | archive | tbody > tr.is-click > td.num [num] |
| #95691a | #ffffff | 24px/800 | 4.87:1 | PASS AA | 1 | archive | div.arc-kpis > div.arc-kpi.dh-amber > div.arc-kpi__v [arc-kpi__v] |
| #677187 | #ffffff | 13px/400 | 4.90:1 | PASS AA | 3 | expenses,archive,addpayment | tr > td > span.exp-dash [exp-dash arc-empty] |
| #677187 | #ffffff | 6.3px/600 | 4.90:1 | PASS AA | 11 | reports,archive | div.rpt-stat__val > span.money-value.money-value--body > span.money-cur [money-cur] |
| #677187 | #ffffff | 10.5px/700 | 4.90:1 | PASS AA | 6 | reports,archive | div.rpt-stat.dh-blue > div.rpt-stat__sub > span.rpt-delta.rpt-delta--flat [rpt-delta rpt-delta--flat arc-tabs__n] |
| #677187 | #ffffff | 12px/400 | 4.90:1 | PASS AA | 11 | reports,settings,support,addpayment | div.rpt-legend > div.rpt-legend__r > span.rpt-legend__v [rpt-legend__v hi-id__tag hi-fact__l] |
| #677187 | #ffffff | 12.5px/500 | 4.90:1 | PASS AA | 1 | reports | div.rpt-card.rpt-hi > div.rpt-card__h > span.rpt-card__hs [rpt-card__hs] |
| #677187 | #ffffff | 11px/500 | 4.90:1 | PASS AA | 5 | reports,settings | div.rpt-card.rpt-quick > div.rpt-card__h > span.rpt-quick__note [rpt-quick__note opt] |
| #677187 | #ffffff | 24px/800 | 4.90:1 | PASS AA | 1 | activitylog | div.al-kpi.dh-slate > div > div.al-kpi__v [al-kpi__v] |
| #677187 | #ffffff | 19px/800 | 4.90:1 | PASS AA | 1 | users | div.usr-kpi.dh-slate > div > div.usr-kpi__v [usr-kpi__v] |
| #677187 | #ffffff | 12.5px/600 | 4.90:1 | PASS AA | 1 | settings | div.hi-facts > div.hi-fact.is-locked > span.hi-fact__v [hi-fact__v] |
| #677187 | #ffffff | 11px/700 | 4.90:1 | PASS AA | 12 | archive | div#content > div.arc-bar > span.arc-bar__lbl [arc-bar__lbl arc-kpi__l] |
| #677187 | #ffffff | 10px/400 | 4.90:1 | PASS AA | 24 | archive | div.arc-chart__b > div.arc-axis > span [] |
| #677187 | #ffffff | 15px/700 | 4.90:1 | PASS AA | 4 | addpayment | div.ws__row > div.ws__a > span#ws-a-02.ws__amt.is-muted [ws__amt is-muted] |
| #677187 | #ffffff | 9px/700 | 4.90:1 | PASS AA | 11 | addpayment | div.ws__fields > div.pf-f > label [ap-key__i] |
| #677187 | #ffffff | 9px/400 | 4.90:1 | PASS AA | 1 | addpayment | div.pf-f > label > span.opt [opt] |
| #677187 | #ffffff | 9.5px/700 | 4.90:1 | PASS AA | 4 | addpayment | div.ap-stub__r > span > i [] |
| #1d8054 | #ffffff | 14px/800 | 4.92:1 | PASS AA | 3 | reports,archive | div.rpt-stat__val > span.money-value.money-value--body > span.money-amt [money-amt] |
| #1d8054 | #ffffff | 13.5px/400 | 4.92:1 | PASS AA | 2 | archive | tbody > tr.is-click > td.num [num] |
| #c0402f | #f7f8fb | 13.5px/800 | 4.92:1 | PASS AA | 1 | archive | tbody > tr.arc-sub > td.num [num] |
| #1d8054 | #ffffff | 24px/800 | 4.92:1 | PASS AA | 2 | archive | div.arc-kpis > div.arc-kpi.dh-green > div.arc-kpi__v [arc-kpi__v] |
| #1d8054 | #ffffff | 9px/700 | 4.92:1 | PASS AA | 1 | addpayment | div.ap-card > div.ap-card__h > span.ap-live [ap-live] |
| #52627a | #e2e6f1 | 12.5px/400 | 4.97:1 | PASS AA | 1 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__s [sup-hero__s] |
| #52627a | #e2e6f1 | 11.5px/700 | 4.97:1 | PASS AA | 1 | support | div.sup-hero__b > div.sup-pop > span.sup-pop__l [sup-pop__l] |
| #52627a | #e7ebf2 | 12.5px/600 | 5.19:1 | PASS AA | 4 | expenses | div.exp-foot > div.exp-pager > button [] |
| #c0402f | #ffffff | 14px/800 | 5.23:1 | PASS AA | 2 | reports,archive | div.mov__cv > span.money-value.money-value--body > span.money-amt [money-amt] |
| #c0402f | #ffffff | 22px/800 | 5.23:1 | PASS AA | 1 | reports | div.rpt-tile.dh-red > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #c0402f | #ffffff | 13px/600 | 5.23:1 | PASS AA | 1 | activitylog | div.bk-head > div.al-head__acts > button.set-btn.set-btn--danger [set-btn set-btn--danger] |
| #c0402f | #ffffff | 13.5px/400 | 5.23:1 | PASS AA | 1 | archive | tbody > tr.is-click > td.num [num] |
| #c0402f | #ffffff | 11.5px/600 | 5.23:1 | PASS AA | 5 | addstudent | div.sf-f > label > span.req [req] |
| #c0402f | #ffffff | 9px/700 | 5.23:1 | PASS AA | 2 | addpayment | div.pf-f > label > span.req [req] |
| #52627a | #edeef1 | 12.5px/400 | 5.34:1 | PASS AA | 2 | payments,cancellations | tr > td.pay-mo > span.pay-mo__abbr [pay-mo__abbr lk-prose] |
| #52627a | #edeef1 | 12.5px/700 | 5.34:1 | PASS AA | 1 | payments | td.pay-money > span > span [] |
| #52627a | #edeef1 | 14px/700 | 5.34:1 | PASS AA | 1 | former | td > div.lk-empty > div.lk-empty__t [lk-empty__t] |
| #5b4bc4 | #edebfa | 11.5px/800 | 5.50:1 | PASS AA | 4 | payments,issues,complaints | td > div.pay-who > div.pay-who__av.dh-violet [pay-who__av dh-violet lk-who__av] |
| #5b4bc4 | #edebfa | 12.5px/800 | 5.50:1 | PASS AA | 1 | cancellations | td > div.lk-who.dh-violet > div.lk-who__av [lk-who__av] |
| #52627a | #f9f1dc | 12px/400 | 5.50:1 | PASS AA | 1 | backup | div.set-card > div.bk-warn > span [] |
| #5b4bc4 | #edebfa | 14px/800 | 5.50:1 | PASS AA | 1 | users | td > div.usr-who > div.usr-av.usr-av--ini [usr-av usr-av--ini dh-violet] |
| #52627a | #f3f3f3 | 13px/800 | 5.59:1 | PASS AA | 1 | addstudent | div.asf-head > div.asf-meter > span#asf-meter-pct.asf-meter__v [asf-meter__v] |
| #a53535 | #edeef1 | 12.5px/700 | 5.73:1 | PASS AA | 1 | payments | tr > td.pay-money.pay-money--due > span [] |
| #52627a | #f7f8fb | 11px/700 | 5.84:1 | PASS AA | 5 | cancellations,issues,maintenance,complaints | tr > td > span.lk-chip.lk-chip--flat [lk-chip lk-chip--flat] |
| #52627a | #f7f8fb | 13px/600 | 5.84:1 | PASS AA | 3 | reports,addstudent | div.rpt-bar > div.rpt-seg > button [sf-btn sf-btn--ghost] |
| #52627a | #f7f8fb | 13px/700 | 5.84:1 | PASS AA | 6 | issues,maintenance,complaints | div#content > div.iss-tabs > button.iss-tab [iss-tab] |
| #52627a | #f7f8fb | 10px/700 | 5.84:1 | PASS AA | 3 | issues,maintenance,complaints | thead > tr > th [] |
| #52627a | #f7f8fb | 12.5px/400 | 5.84:1 | PASS AA | 1 | backup | div.set-card > div.set-note > span [] |
| #52627a | #f7f8fb | 12.5px/700 | 5.84:1 | PASS AA | 3 | backup,addstudent | div.set-note > span > b [sf-prefix] |
| #52627a | #f7f8fb | 12.5px/600 | 5.84:1 | PASS AA | 5 | archive | div#content > div.arc-tabs > button [] |
| #52627a | #f7f8fb | 11.5px/600 | 5.84:1 | PASS AA | 2 | addpayment | header.tsk-head > div.tsk-head__r > span.tsk-chip [tsk-chip tsk-chip--state] |
| #52627a | #ffffff | 12.5px/400 | 6.20:1 | PASS AA | 5 | payments | tr > td.pay-mo > span.pay-mo__abbr [pay-mo__abbr] |
| #52627a | #ffffff | 12.5px/650 | 6.20:1 | PASS AA | 2 | expenses | div#content > div.exp-tools > button.exp-catadd [exp-catadd] |
| #52627a | #ffffff | 13px/400 | 6.20:1 | PASS AA | 2 | expenses | tbody > tr > td.exp-date [exp-date exp-desc] |
| #52627a | #ffffff | 13px/700 | 6.20:1 | PASS AA | 4 | expenses,reports,backup | tr > td.exp-amt > span [bk-empty__t] |
| #52627a | #ffffff | 11px/700 | 6.20:1 | PASS AA | 21 | cancellations,former,issues,maintenance +2 | div.lk-stat.lk-stat--click > div.lk-stat__top > div.lk-stat__label [lk-stat__label] |
| #52627a | #ffffff | 12px/400 | 6.20:1 | PASS AA | 9 | reports,activitylog,backup | div.mov__bar > div.mov__legend > span.mov__k [mov__k rpt-brow__n al-det] |
| #52627a | #ffffff | 22px/800 | 6.20:1 | PASS AA | 1 | reports | div.rpt-tile.dh-slate > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #52627a | #ffffff | 11.5px/400 | 6.20:1 | PASS AA | 14 | activitylog,settings,support,addpayment | div.hi-store__b > div.hi-store__r > span.hi-store__k [hi-store__k al-user__n sup-urgent__p] |
| #52627a | #ffffff | 12px/700 | 6.20:1 | PASS AA | 4 | activitylog,settings,addpayment | div.al-foot > div.al-pager > span.al-pager__n [al-pager__n] |
| #52627a | #ffffff | 11.5px/700 | 6.20:1 | PASS AA | 3 | support | div.conn-foot > span > b [] |
| #52627a | #ffffff | 11px/800 | 6.20:1 | PASS AA | 1 | addpayment | div.ws__chips > button.ws__chip > b#ws-q-full [] |
| #5b4bc4 | #ffffff | 14px/800 | 6.46:1 | PASS AA | 1 | reports | div.mov__cv > span.money-value.money-value--body > span.money-amt [money-amt] |
| #5b4bc4 | #ffffff | 22px/800 | 6.46:1 | PASS AA | 1 | reports | div.rpt-tile.dh-violet > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #ffffff | #2451d6 | 12px/650 | 6.52:1 | PASS AA | 1 | reports | div.rpt-bar > div.rpt-bar__end > button.rpt-print [rpt-print] |
| #2451d6 | #ffffff | 17px/800 | 6.52:1 | PASS AA | 1 | reports | div.mov__cell.dh-blue > div > div.mov__cv [mov__cv] |
| #2451d6 | #ffffff | 22px/800 | 6.52:1 | PASS AA | 1 | reports | div.rpt-tile.dh-blue > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #2451d6 | #ffffff | 24px/800 | 6.52:1 | PASS AA | 3 | archive | div.arc-kpis > div.arc-kpi.dh-blue > div.arc-kpi__v [arc-kpi__v] |
| #ffffff | #2451d6 | 10.5px/800 | 6.52:1 | PASS AA | 6 | addpayment | div.ws > div.ws__row > div.ws__n [ws__n] |
| #ffffff | #2451d6 | 11.5px/600 | 6.52:1 | PASS AA | 1 | addpayment | div.ws__d > div#f-pmess-seg.ws__seg > button.ws__seg-b.is-on [ws__seg-b is-on] |
| #ffffff | #2451d6 | 11px/800 | 6.52:1 | PASS AA | 1 | addpayment | div.ap-mrail > div#ap-chips.ap-chips > button.ap-chip.is-on [ap-chip is-on is-now] |
| #a53535 | #ffffff | 12.5px/700 | 6.64:1 | PASS AA | 4 | payments | tr > td.pay-money.pay-money--due > span [] |
| #1b3fae | #e6ebf8 | 12.5px/700 | 7.43:1 | PASS AAA | 2 | archive | div.arc-bar > div.arc-years > button.is-on [is-on] |
| #1b3fae | #edeef1 | 11px/600 | 7.64:1 | PASS AAA | 1 | cancellations | div.lk-who.dh-violet > div > div.lk-who__id [lk-who__id] |
| #1b3fae | #edf1fc | 13px/700 | 7.85:1 | PASS AAA | 3 | issues,maintenance,complaints | div#content > div.iss-tabs > button.iss-tab.is-on [iss-tab is-on] |
| #1b3fae | #f3f3f3 | 11.5px/700 | 7.99:1 | PASS AAA | 1 | addstudent | div > nav.asf-crumb > b [] |
| #1b3fae | #f2f8ff | 11px/600 | 8.29:1 | PASS AAA | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.badge.badge-blue [badge badge-blue] |
| #1b3fae | #ffffff | 11px/600 | 8.87:1 | PASS AAA | 1 | cancellations | div.lk-banner.dh-violet > div > div.lk-banner__a [lk-banner__a] |
| #1b3fae | #ffffff | 13px/700 | 8.87:1 | PASS AAA | 3 | backup,users,settings | div.set-tabs-wrap > div.set-tabs > div.set-tab.is-on [set-tab is-on] |
| #1b3fae | #ffffff | 11px/700 | 8.87:1 | PASS AAA | 1 | support | div.sup-hero > div.sup-hero__b > span.sup-hero__k [sup-hero__k] |
| #1b3fae | #ffffff | 15px/700 | 8.87:1 | PASS AAA | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.asf-rec__v.asf-num [asf-rec__v asf-num asf-num--id] |
| #1b3fae | #ffffff | 12.5px/700 | 8.87:1 | PASS AAA | 4 | addstudent | div.sf-sec > div.sf-sec__h > span.asf-n [asf-n] |
| #1b3fae | #ffffff | 10px/700 | 8.87:1 | PASS AAA | 1 | addpayment | div.ap-card > div.ap-card__h > button.ap-card__lnk [ap-card__lnk] |
| #17233a | #d8e2ff | 12px/700 | 12.14:1 | PASS AAA | 2 | backup | div.bk-warn.is-info > span > b [] |
| #17233a | #e2e6f1 | 22px/800 | 12.57:1 | PASS AAA | 1 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__t [sup-hero__t] |
| #17233a | #e7ebf2 | 13.5px/800 | 13.13:1 | PASS AAA | 11 | payments,cancellations,issues,maintenance +1 | td > span.lk-room > span.lk-room__n [lk-room__n] |
| #17233a | #e7ebf2 | 13.5px/700 | 13.13:1 | PASS AAA | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__t [bk-drop__t] |
| #17233a | #edeef1 | 13px/700 | 13.53:1 | PASS AAA | 4 | payments,cancellations,issues | div.pay-who > div > div.pay-who__name [pay-who__name lk-who__n iss-t] |
| #17233a | #edeef1 | 12px/400 | 13.53:1 | PASS AAA | 4 | cancellations,issues,users | tr > td > div.lk-when [lk-when al-when] |
| #17233a | #edeef1 | 12px/800 | 13.53:1 | PASS AAA | 1 | issues | tr > td.iss-c-ref > div.iss-ref [iss-ref] |
| #17233a | #edeef1 | 13.5px/700 | 13.53:1 | PASS AAA | 1 | users | div.usr-who > div > div.usr-who__n [usr-who__n] |
| #17233a | #fbebe8 | 13px/700 | 13.57:1 | PASS AAA | 1 | backup | div.bk-health.dh-red > span > b [] |
| #17233a | #f9f1dc | 12px/700 | 13.93:1 | PASS AAA | 1 | backup | div.bk-warn > span > b [] |
| #17233a | #e8f5ee | 12.5px/700 | 14.00:1 | PASS AAA | 1 | support | div.conn-sum.is-online > span > b [] |
| #17233a | #f3f3f3 | 22px/800 | 14.15:1 | PASS AAA | 4 | activitylog,backup,users,addstudent | div.bk-head > div.set-head__mid > div.bk-head__t [bk-head__t asf-title] |
| #17233a | #f5f5f5 | 13.5px/700 | 14.40:1 | PASS AAA | 1 | archive | tbody > tr > td.nm [nm] |
| #17233a | #f7f8fb | 12.5px/750 | 14.78:1 | PASS AAA | 6 | reports | tbody > tr.rpt-tbl__tot > td [] |
| #17233a | #f7f8fb | 12.5px/600 | 14.78:1 | PASS AAA | 4 | support | div.sup-grid > div.sup-row > span.sup-row__v [sup-row__v is-mono] |
| #17233a | #f7f8fb | 13.5px/800 | 14.78:1 | PASS AAA | 7 | archive | div.arc-panel > div.arc-panel__head > span.arc-panel__t [arc-panel__t num] |
| #17233a | #ffffff | 19px/800 | 15.70:1 | PASS AAA | 12 | expenses,backup,users | div.exp-stat__v > span > span [exp-stat__v bk-stat__v usr-kpi__v] |
| #17233a | #ffffff | 28px/800 | 15.70:1 | PASS AAA | 20 | cancellations,former,issues,maintenance +1 | div.lk-stats > div.lk-stat.lk-stat--click > div.lk-stat__val [lk-stat__val] |
| #17233a | #ffffff | 13.5px/700 | 15.70:1 | PASS AAA | 12 | cancellations,archive | div.lk-banner__l > div > div.lk-banner__t [lk-banner__t nm] |
| #17233a | #ffffff | 30px/800 | 15.70:1 | PASS AAA | 1 | cancellations | div.lk-banner.dh-violet > div > div.lk-banner__v [lk-banner__v] |
| #17233a | #ffffff | 15px/650 | 15.70:1 | PASS AAA | 2 | cancellations,former | div.lk-panel > div.lk-head > div.lk-head__t [lk-head__t] |
| #17233a | #ffffff | 14px/800 | 15.70:1 | PASS AAA | 4 | reports,addpayment | div.rpt-stat__val > span.money-value.money-value--body > span.money-amt [money-amt] |
| #17233a | #ffffff | 15.5px/800 | 15.70:1 | PASS AAA | 2 | reports | div.rpt-stats > div.rpt-stat.dh-blue > div.rpt-stat__val [rpt-stat__val] |
| #17233a | #ffffff | 14px/700 | 15.70:1 | PASS AAA | 17 | reports,activitylog,backup,settings +1 | div.mov__chart > div.mov__bar > span.mov__bart [mov__bart hi-id__ttl sup-big__t] |
| #17233a | #ffffff | 13.5px/800 | 15.70:1 | PASS AAA | 1 | reports | div.rpt-donut__c > div.rpt-donut__mid > b [] |
| #17233a | #ffffff | 12.5px/600 | 15.70:1 | PASS AAA | 10 | reports,support,addstudent | div.rpt-legend > div.rpt-legend__r > span.rpt-legend__n [rpt-legend__n sup-row__v is-mono] |
| #17233a | #ffffff | 13px/900 | 15.70:1 | PASS AAA | 1 | reports | div.rpt-card > div.rpt-btot > b [] |
| #17233a | #ffffff | 12.5px/400 | 15.70:1 | PASS AAA | 25 | reports | tbody > tr > td [rpt-tbl__z] |
| #17233a | #ffffff | 12px/800 | 15.70:1 | PASS AAA | 3 | issues,maintenance,complaints | tr > td.iss-c-ref > div.iss-ref [iss-ref] |
| #17233a | #ffffff | 12px/400 | 15.70:1 | PASS AAA | 4 | issues,activitylog,maintenance,complaints | tr > td > div.lk-when [lk-when al-when] |
| #17233a | #ffffff | 13px/800 | 15.70:1 | PASS AAA | 2 | activitylog,settings | div.hi-ring > div.hi-ring__c > div.hi-ring__v [hi-ring__v] |
| #17233a | #ffffff | 13.5px/400 | 15.70:1 | PASS AAA | 3 | activitylog,archive | tbody > tr > td [num] |
| #17233a | #ffffff | 11.5px/600 | 15.70:1 | PASS AAA | 3 | addstudent | div.asf-doc > span.asf-doc__x > span.asf-doc__n [asf-doc__n] |
| #17233a | #ffffff | 13px/600 | 15.70:1 | PASS AAA | 1 | addpayment | div.tsk-head__l > nav.tsk-crumb > b [] |
| #0f172a | #ffffff | 16px/800 | 17.85:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div.sb-logo-mark > div.sb-logo-text > div.name [name] |
| #0f172a | #ffffff | 13px/700 | 17.85:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div#sb-user.sb-user > div.sb-user__id > div#sb-user-name.sb-user__name [sb-user__name] |

Placeholder text (light) — 8 combinations:

| Placeholder | Background | Size | Ratio | Result (4.5:1) | Pages | Sample |
|---|---|---|---|---|---|---|
| #94a3b0 | #ffffff | 14px | 2.58 | FAIL | login | section.lg-form > div.lg-field > input#login-user.lg-in |
| #677187 | #ffffff | 13px | 4.90 | PASS AA | dashboard,rooms,students,payments | div#hdr-search-wrap > div.hdr-find > input#dash-global-search |
| #677187 | #ffffff | 12.5px | 4.90 | PASS AA | rooms,addpayment | div.rms-tools > div.rms-search > input#search-rooms.lk-sin |
| #677187 | #ffffff | 11.5px | 4.90 | PASS AA | students,users,addpayment | div.stu-tools > div.stu-search > input#search-students.lk-sin |
| #677187 | #e7ebf2 | 13px | 4.10 | FAIL | expenses | div.exp-tools > div.exp-search > input#search-expenses.lk-sin |
| #677187 | #ffffff | 13.5px | 4.90 | PASS AA | activitylog,settings,support | div.al-filters > div.al-search > input#al-q.form-control |
| #757575 | #ffffff | 13px | 4.61 | PASS AA | support | div.sup-hero__b > div.sup-hero__find > input#sup-find.sup-hero__in |
| #757575 | #ffffff | 12.5px | 4.61 | PASS AA | addpayment | div.ws__row > div.ws__d.ws__d--span > textarea#f-pnotes-main.pf-ta |

Disabled controls (light) — 7 combinations (WCAG exempts disabled controls; ratio reported as found):

| Text | Background | Opacity | Ratio | Pages | Sample |
|---|---|---|---|---|---|
| #abb4c2 | #e7ebf2 | 0.4 | 1.75 | rooms | div.pager > div.pager-controls > button.pager-btn |
| #bac0ca | #ffffff | 0.4 | 1.83 | students,payments,cancellations,former | div.stu-foot > div.stu-pager > button |
| #abb4c2 | #e7ebf2 | 0.4 | 1.75 | expenses | div.exp-foot > div.exp-pager > button |
| #a9b1bd | #ffffff | 0.5 | 2.16 | activitylog,backup,users,settings | div.al-foot > div.al-pager > button.set-btn |
| #cacdd3 | #e7ebf2 | 0.45 | 1.33 | backup,settings | div.set-head > div.set-head__end > button.set-tog |
| #92a8eb | #2451d6 | 0.5 | 2.80 | settings | div.set-head > div.set-head__end > button#hi-save.set-btn.set-btn--go |
| #2148bb | #2451d6 | 0.45 | 1.19 | settings | div.set-row.is-locked > div.set-row__c > button.set-tog.is-on |

Borders against their background (light) — 29 combinations; 21 below 3:1. Decorative dividers are included (WCAG 1.4.11 applies only where the border identifies a control or state — not determinable statically).

| Border | Background | Ratio | Elements | Pages | Sample |
|---|---|---|---|---|---|
| #ffffff | #ffffff | 1.00 | 18 | dashboard,rooms,students | div > button#hdr-bell.hdr-btn > span#hdr-bell-count.hdr-btn__count |
| #e4e7ee | #e2e6f1 | 1.01 | 6 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__find |
| #e4e7ee | #e7ebf2 | 1.04 | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__i |
| #e4e7ee | #edeef1 | 1.07 | 11 | students,payments,cancellations | tr > td > div.stu-room |
| #e4e7ee | #f3f3f3 | 1.12 | 163 | dashboard,rooms,students | div#content > div.dash-kpi-grid > div.dsh-card.dh-blue |
| #dbeafe | #f4f6f8 | 1.13 | 1 | login | div#login-card > aside.lg-side > span.lg-badge |
| #e7eaee | #f7f9fb | 1.14 | 1 | login | body.light-theme.has-titlebar > div#login-screen > div#login-card |
| #d1f7e8 | #ffffff | 1.16 | 1 | dashboard | tr.dash-rp-row > td > span.badge.badge-green |
| #dfedfe | #ffffff | 1.19 | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.badge.badge-blue |
| #d3d8e2 | #e7ebf2 | 1.20 | 3 | backup,settings | div.set-head__end > button.set-tog > span.set-tog__k |
| #e9eaec | #ffffff | 1.20 | 38 | dashboard,rooms,students | aside#sidebar > div.sb-logo > button#sidebar-collapse-btn.sidebar-collapse-btn |
| #e7eaee | #ffffff | 1.21 | 1 | login | div#login-card > section.lg-form > div.lg-foot |
| #d7e9fe | #ffffff | 1.24 | 5 | dashboard | tr.dash-rp-row > td > span.badge.badge-gold |
| #e4e7ee | #ffffff | 1.24 | 290 | login,dashboard,rooms | section.lg-form > div.lg-field > input#login-input.lg-in |
| #d3d8e2 | #f3f3f3 | 1.29 | 10 | reports,activitylog,users | div.rpt-bar > div.rpt-bar__end > button.rpt-card__a |
| #d3d8e2 | #f7f8fb | 1.35 | 4 | dashboard,issues | div.dash-sec__head > div.trend-range > button.trend-range__b.is-on |
| #bfdbfe | #ffffff | 1.42 | 40 | dashboard | div.dash-sec > div.dash-room-wrap > div.dash-room.dh-violet |
| #d3d8e2 | #ffffff | 1.43 | 234 | dashboard,rooms,students | header#header > div#hdr-search-wrap > div.hdr-find |
| #cbd5e1 | #ffffff | 1.48 | 1 | login | div.lg-meta > label.lg-remember > span.lg-check |
| #d7c3b5 | #ffffff | 1.70 | 1 | activitylog | div.al-filters > div.al-search > input#al-q.form-control |
| #f59e0b | #ffffff | 2.15 | 2 | rooms | div.rms-card__body.dh-green > div.rms-acts > button.rms-force |
| #3b82f6 | #ffffff | 3.68 | 1 | login | section.lg-form > div.lg-field > input#login-user.lg-in |
| #1f8a5a | #ffffff | 4.34 | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue |
| #95691a | #f7f8fb | 4.58 | 1 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__vac |
| #737373 | #ffffff | 4.74 | 17 | dashboard,rooms,students | aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active |
| #95691a | #ffffff | 4.87 | 1 | rooms | div.rms-card__body.dh-green > div.rms-occ > span.rms-occ__chip.is-vacating |
| #2451d6 | #f3f3f3 | 5.87 | 3 | rooms,reports,users | div.pager > div.pager-controls > button.pager-btn.active |
| #2451d6 | #f7f8fb | 6.14 | 1 | reports | div#content > div.rpt-tabs > button.rpt-tab.is-on |
| #2451d6 | #ffffff | 6.52 | 54 | rooms,students,payments | div.rms-panel > div.rms-tools > select.rms-select.is-set |

### 3.2 dark theme — 351 distinct text/background/size/weight combinations; 25 FAIL; 2 UNKNOWN (image/gradient background)

| Text | Background | Size/weight | Ratio | Result | Elements | Pages | Sample element |
|---|---|---|---|---|---|---|---|
| #35322d | #1f1e1b | 13px/400 | 1.31:1 | FAIL | 1 | addpayment | div.tsk-head__l > nav.tsk-crumb > span.sep [sep] |
| #35322d | #181715 | 12px/400 | 1.40:1 | FAIL | 3 | dashboard | footer.dash-foot > div.dash-foot__l > span.dash-foot__sep [dash-foot__sep] |
| #ffffff | #7ba0ff | 12px/600 | 2.53:1 | FAIL | 1 | rooms | div.pager > div.pager-controls > button.pager-btn.active [pager-btn active] |
| #94a3b0 | #ffffff | 11.5px/400 | 2.58:1 | FAIL | 2 | login | div.lg-safe > span > span [lg-foot__c] |
| #c64545 | #2d2f30 | 12.5px/700 | 2.78:1 | FAIL | 1 | payments | tr > td.pay-money.pay-money--due > span [] |
| #c64545 | #1f1e1b | 12.5px/700 | 3.44:1 | FAIL | 4 | payments | tr > td.pay-money.pay-money--due > span [] |
| #3b82f6 | #ffffff | 13px/600 | 3.68:1 | FAIL | 1 | login | section.lg-form > div.lg-meta > button.lg-link [lg-link] |
| #9b8cf0 | #3f3e4f | 11.5px/800 | 3.68:1 | FAIL | 2 | payments,issues | td > div.pay-who > div.pay-who__av.dh-violet [pay-who__av dh-violet lk-who__av] |
| #9b8cf0 | #3f3e4f | 12.5px/800 | 3.68:1 | FAIL | 1 | cancellations | td > div.lk-who.dh-violet > div.lk-who__av [lk-who__av] |
| #9b8cf0 | #3f3e4f | 14px/800 | 3.68:1 | FAIL | 1 | users | td > div.usr-who > div.usr-av.usr-av--ini [usr-av usr-av--ini dh-violet] |
| #9b8cf0 | #3f3e4f | 11px/700 | 3.68:1 | FAIL | 1 | users | tr > td > span.lk-chip.dh-violet [lk-chip dh-violet] |
| #ffffff | #ef4444 | 10px/800 | 3.76:1 | FAIL | 18 | dashboard,rooms,students,payments +14 | div > button#hdr-bell.hdr-btn > span#hdr-bell-count.hdr-btn__count [hdr-btn__count] |
| #404040 | #f0796a | 10px/800 | 3.78:1 | FAIL | 1 | cancellations | nav.sb-nav.sidebar__middle > div.nav-item.active > span#cancel-badge.nav-badge [nav-badge] |
| #f0796a | #4d3b39 | 11px/700 | 3.82:1 | FAIL | 1 | issues | tr > td > span.lk-chip.dh-red [lk-chip dh-red] |
| #4e7dff | #262c31 | 11px/600 | 3.83:1 | FAIL | 5 | dashboard | tr.dash-rp-row > td > span.badge.badge-gold [badge badge-gold] |
| #9b8cf0 | #3d3a48 | 11px/700 | 3.90:1 | FAIL | 24 | rooms | div.rms-card > div.rms-card__pic.dh-violet > span.rms-card__state [rms-card__state] |
| #9b6df0 | #2f2937 | 11px/700 | 3.91:1 | FAIL | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #a09d96 | #3d3f3e | 9.5px/800 | 3.92:1 | FAIL | 1 | payments | div.pay-who > div > span.pay-cov.dh-slate [pay-cov dh-slate] |
| #a09d96 | #393b3b | 9.5px/700 | 4.16:1 | FAIL | 1 | users | div > div.usr-who__n > span.usr-you [usr-you] |
| #4e7dff | #252320 | 14px/800 | 4.25:1 | FAIL | 1 | dashboard | div.seat-inline > span.seat-inline__k.is-free > b [] |
| #3fbf83 | #30463d | 10px/600 | 4.35:1 | FAIL | 1 | students | tr > td > span.stu-pill.dh-green [stu-pill dh-green] |
| #3fbf83 | #30463d | 11px/700 | 4.35:1 | FAIL | 1 | users | tr > td > span.lk-chip.dh-green [lk-chip dh-green] |
| #7ba0ff | #333c51 | 12px/700 | 4.36:1 | FAIL | 1 | students | td > div.stu-who > span.stu-av.dh-amber [stu-av dh-amber is-initials] |
| #d4a017 | #453f2c | 10.5px/700 | 4.42:1 | FAIL | 1 | payments | tr > td > span.pay-pill.dh-amber [pay-pill dh-amber] |
| #d9a441 | #494233 | 11px/700 | 4.42:1 | FAIL | 2 | cancellations,issues | tr > td > span.lk-chip.dh-amber [lk-chip dh-amber] |
| #3b82f6 | #f4f6f8 | 20px/800 | 3.39:1 | PASS AA (large) | 1 | login | span.lg-mark > svg > text [] |
| #4e7dff | #1f1e1b | 13px/700 | 4.53:1 | PASS AA | 40 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.n [n] |
| #4e7dff | #1f1e1b | 11.5px/600 | 4.53:1 | PASS AA | 1 | dashboard | div.dash-sec__head > button.dl-monthchip > span [] |
| #4e7dff | #1f1e1b | 12.5px/650 | 4.53:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-pending > div.dash-sec__head > button.dash-link.dl-pend__all [dash-link dl-pend__all] |
| #4e7dff | #1f1e1b | 13px/650 | 4.53:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-pending > div.dl-pend__foot > button.dl-remind [dl-remind] |
| #4e7dff | #1f1e1b | 12.5px/600 | 4.53:1 | PASS AA | 1 | rooms | div.rms-panel > div.rms-tools > button.rms-btn.rms-btn--go [rms-btn rms-btn--go] |
| #9b8cf0 | #33303d | 9px/700 | 4.54:1 | PASS AA | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #9b8cf0 | #33303d | 11px/700 | 4.54:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-violet > span.dl-need__verb [dl-need__verb] |
| #9b8cf0 | #33303d | 11px/800 | 4.54:1 | PASS AA | 2 | dashboard | div > div.dash-pay > div.dash-av.dh-violet [dash-av dh-violet] |
| #3fbf83 | #2e4236 | 11px/700 | 4.61:1 | PASS AA | 6 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__state [rms-card__state] |
| #a8b0be | #404243 | 9px/700 | 4.63:1 | PASS AA | 1 | students | tr > td > span.stu-cov.dh-slate [stu-cov dh-slate] |
| #9b6df0 | #1f1e1b | 12px/800 | 4.64:1 | PASS AA | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #f0796a | #402d28 | 9px/700 | 4.71:1 | PASS AA | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #f0796a | #402d28 | 10px/700 | 4.71:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-panel > div.dash-sec__head.dl-head3 > span.dash-pill.dh-red [dash-pill dh-red] |
| #f0796a | #402d28 | 11px/700 | 4.71:1 | PASS AA | 6 | dashboard,issues,maintenance,complaints | div.dl-needs > button.dl-need.dh-red > span.dl-need__verb [dl-need__verb lk-chip dh-red] |
| #2563eb | #eff6ff | 12px/650 | 4.75:1 | PASS AA | 1 | login | div#login-card > aside.lg-side > span.lg-badge [lg-badge] |
| #2563eb | #f4f6f8 | 25px/800 | 4.77:1 | PASS AA | 1 | login | aside.lg-side > h2.lg-h2 > em [] |
| #181715 | #4e7dff | 12.5px/800 | 4.86:1 | PASS AA | 19 | dashboard,rooms,students,payments +15 | div.sb-user-wrap > div#sb-user.sb-user > div#sb-user-av.sb-user__av [sb-user__av] |
| #181715 | #4e7dff | 13px/600 | 4.86:1 | PASS AA | 17 | dashboard,rooms,students,payments +12 | div.hdr-right > button#hdr-action.btn.btn-primary > span#hdr-action-text [is-on set-btn set-btn--go] |
| #181715 | #4e7dff | 12px/800 | 4.86:1 | PASS AA | 6 | dashboard | td > div.dash-rp-who > div.dash-rp-av [dash-rp-av] |
| #181715 | #4e7dff | 12px/600 | 4.86:1 | PASS AA | 29 | rooms,students | div.rms-card__body.dh-green > div.rms-acts > button.rms-add [rms-add stu-btn stu-btn--primary] |
| #181715 | #4e7dff | 12.5px/600 | 4.86:1 | PASS AA | 10 | students,payments,expenses,cancellations +6 | div.stu-foot > div.stu-pager > button.is-on [is-on rpt-tab pf-btn] |
| #a09d96 | #31302c | 9.5px/800 | 4.88:1 | PASS AA | 5 | payments | div.pay-who > div > span.pay-cov.dh-slate [pay-cov dh-slate] |
| #d9a441 | #443b2b | 10.5px/700 | 4.90:1 | PASS AA | 1 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__vac [rms-card__vac] |
| #7ba0ff | #29334d | 10.5px/600 | 4.96:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-panel > div.dl-foot.dl-foot--tint > span [] |
| #a09d96 | #2d2f30 | 10.5px/500 | 4.97:1 | PASS AA | 1 | students | div.stu-who > div > div.stu-who__sub [stu-who__sub] |
| #7ba0ff | #2e333f | 11px/700 | 5.00:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__verb [dl-need__verb] |
| #7ba0ff | #2e333f | 13px/600 | 5.00:1 | PASS AA | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue [pay-btn pay-btn--hue dh-blue] |
| #a09d96 | #2b2a28 | 9.5px/700 | 5.30:1 | PASS AA | 17 | students,addpayment | thead > tr > th.is-sortable [is-sortable ws__ha] |
| #a09d96 | #2b2a28 | 9px/700 | 5.30:1 | PASS AA | 24 | students,payments,expenses,cancellations +1 | tr > th.is-sortable > span.arw [arw] |
| #a09d96 | #2b2a28 | 10px/700 | 5.30:1 | PASS AA | 88 | payments,expenses,cancellations,former +7 | thead > tr > th.is-sortable [is-sortable pay-col-x pay-col-act] |
| #3fbf83 | #24382c | 9px/700 | 5.36:1 | PASS AA | 1 | dashboard | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill] |
| #3fbf83 | #24382c | 11px/800 | 5.36:1 | PASS AA | 2 | dashboard | div > div.dash-pay > div.dash-av.dh-green [dash-av dh-green] |
| #3fbf83 | #24382c | 10px/600 | 5.36:1 | PASS AA | 4 | students | tr > td > span.stu-pill.dh-green [stu-pill dh-green] |
| #3fbf83 | #24382c | 13px/600 | 5.36:1 | PASS AA | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue [pay-btn pay-btn--hue dh-green] |
| #3fbf83 | #24382c | 11.5px/800 | 5.36:1 | PASS AA | 3 | payments | td > div.pay-who > div.pay-who__av.dh-green [pay-who__av dh-green] |
| #5a6675 | #f4f6f8 | 9.5px/600 | 5.40:1 | PASS AA | 1 | login | div.lg-brand > span > span.lg-brand__s [lg-brand__s] |
| #5a6675 | #f4f6f8 | 13.5px/400 | 5.40:1 | PASS AA | 1 | login | div#login-card > aside.lg-side > p.lg-sub [lg-sub] |
| #5a6675 | #f4f6f8 | 12px/400 | 5.40:1 | PASS AA | 4 | login | li.lg-feat > span > span [] |
| #7ba0ff | #272d3f | 12px/600 | 5.42:1 | PASS AA | 1 | rooms | div.rms-tools > div.rms-seg > button.is-on [is-on] |
| #7ba0ff | #272d3f | 11px/600 | 5.42:1 | PASS AA | 30 | rooms | div.rms-card__body.dh-green > div.rms-card__head > span.rms-card__type [rms-card__type] |
| #7ba0ff | #272d3f | 12px/700 | 5.42:1 | PASS AA | 5 | students | td > div.stu-who > span.stu-av.dh-green [stu-av dh-green is-initials] |
| #d9a441 | #3d3321 | 9px/700 | 5.51:1 | PASS AA | 3 | dashboard,students | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill [dash-pill stu-cov dh-amber] |
| #d9a441 | #3d3321 | 11px/700 | 5.51:1 | PASS AA | 2 | dashboard,complaints | div.dl-needs > button.dl-need.dh-amber > span.dl-need__verb [dl-need__verb lk-chip dh-amber] |
| #d9a441 | #3d3321 | 11px/800 | 5.51:1 | PASS AA | 1 | dashboard | div > div.dash-pay > div.dash-av.dh-amber [dash-av dh-amber] |
| #d9a441 | #3d3321 | 10px/600 | 5.51:1 | PASS AA | 1 | students | tr > td > span.stu-pill.dh-amber [stu-pill dh-amber] |
| #a8b0be | #3d3321 | 12px/400 | 5.68:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-amber > span.dl-need__label [dl-need__label] |
| #7ba0ff | #2b2a28 | 9.5px/700 | 5.68:1 | PASS AA | 1 | students | thead > tr > th.is-sortable.is-sorted [is-sortable is-sorted] |
| #7ba0ff | #2b2a28 | 9px/700 | 5.68:1 | PASS AA | 5 | students,payments,expenses,cancellations +1 | tr > th.is-sortable.is-sorted > span.arw [arw] |
| #7ba0ff | #2b2a28 | 10px/700 | 5.68:1 | PASS AA | 4 | payments,expenses,cancellations,former | thead > tr > th.is-sortable.is-sorted [is-sortable is-sorted] |
| #3fbf83 | #213328 | 12.5px/700 | 5.73:1 | PASS AA | 1 | dashboard | div.dash-sec > div.dash-sec__head > span.rt-full [rt-full] |
| #a8b0be | #2e333f | 12px/400 | 5.79:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__label [dl-need__label] |
| #a09d96 | #252320 | 10px/500 | 5.79:1 | PASS AA | 6 | students | td > div.stu-room > div.stu-room__t [stu-room__t] |
| #4a9cf0 | #1f1e1b | 12px/800 | 5.80:1 | PASS AA | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #3fbf83 | #233129 | 11px/600 | 5.83:1 | PASS AA | 1 | dashboard | tr.dash-rp-row > td > span.badge.badge-green [badge badge-green] |
| #5a6675 | #ffffff | 13.5px/400 | 5.85:1 | PASS AA | 1 | login | div#login-card > section.lg-form > p.lg-p [lg-p] |
| #5a6675 | #ffffff | 13px/550 | 5.85:1 | PASS AA | 1 | login | section.lg-form > div.lg-meta > label.lg-remember [lg-remember] |
| #5a6675 | #ffffff | 11.5px/600 | 5.85:1 | PASS AA | 1 | login | section.lg-form > div.lg-foot > span#login-version.lg-foot__v [lg-foot__v] |
| #a8b0be | #333230 | 9px/700 | 5.87:1 | PASS AA | 5 | dashboard,students | div.dash-kpi__top > div.dash-pill-stack > span.dash-pill.dh-slate [dash-pill dh-slate stu-cov] |
| #a8b0be | #333230 | 9.5px/800 | 5.87:1 | PASS AA | 6 | dashboard | tr.dash-rp-row > td > span.lk-cov.dh-slate [lk-cov dh-slate] |
| #a8b0be | #33303d | 12px/400 | 5.90:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-violet > span.dl-need__label [dl-need__label] |
| #a8b0be | #402d28 | 12px/400 | 5.92:1 | PASS AA | 1 | dashboard | div.dl-needs > button.dl-need.dh-red > span.dl-need__label [dl-need__label] |
| #f0796a | #1f1e1b | 11.5px/700 | 6.07:1 | PASS AA | 1 | dashboard | div.dash-sec.dl-pending > div.dash-sec__head > span.dl-pend__count [dl-pend__count] |
| #f0796a | #1f1e1b | 13px/750 | 6.07:1 | PASS AA | 5 | dashboard | div > div > div.dash-pay__amt [dash-pay__amt] |
| #f0796a | #1f1e1b | 12.5px/700 | 6.07:1 | PASS AA | 7 | dashboard,addpayment | tr.dash-rp-row > td > span.dash-rp-num.dash-rp-num--due [dash-rp-num dash-rp-num--due req] |
| #f0796a | #1f1e1b | 28px/700 | 6.07:1 | PASS AA | 1 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val.is-bad [stu-stat__val is-bad] |
| #a09d96 | #1f1e1b | 11px/400 | 6.16:1 | PASS AA | 70 | dashboard,payments,cancellations,former +9 | div.hdr-greet > span.hdr-greet__b > span.hdr-greet__sub [hdr-greet__sub seat-hd__s dash-pay__room] |
| #a09d96 | #1f1e1b | 10px/700 | 6.16:1 | PASS AA | 28 | dashboard,rooms,students,payments +14 | div#hdr-search-wrap > div.hdr-find > kbd.hdr-kbd [hdr-kbd dash-rp-stat__label stu-stat__label] |
| #a09d96 | #1f1e1b | 9.05658px/600 | 6.16:1 | PASS AA | 5 | dashboard | div.dash-kpi__value > span.money-value.money-value--display > span.money-cur [money-cur] |
| #a09d96 | #1f1e1b | 6.825px/600 | 6.16:1 | PASS AA | 1 | dashboard | div.dsh-card.dh-blue > div.dash-kpi__sub > span.pkr [pkr] |
| #a09d96 | #1f1e1b | 10.5px/400 | 6.16:1 | PASS AA | 59 | dashboard,rooms,payments,expenses +5 | div.dash-kpi__split > span.dash-kpi__srow > span.dash-kpi__slabel [dash-kpi__slabel dnut__sub dash-pay__due] |
| #a09d96 | #1f1e1b | 8px/700 | 6.16:1 | PASS AA | 2 | dashboard | span.dash-kpi__srow > b > span.pkr [pkr] |
| #a09d96 | #1f1e1b | 12px/700 | 6.16:1 | PASS AA | 2 | dashboard | div.dnut__top > span.dnut__fig > span.rt-of [rt-of dnut__cur] |
| #a09d96 | #1f1e1b | 9.5px/400 | 6.16:1 | PASS AA | 3 | dashboard,activitylog,settings | div.dnut > div.dnut__mid > div.dnut__sub [dnut__sub hi-ring__l] |
| #a09d96 | #1f1e1b | 10px/600 | 6.16:1 | PASS AA | 15 | dashboard,addstudent | div.rt-right > div.rt-list__hd > span [rt-list__hd-rooms rt-list__hd-occ asf-secmeta] |
| #a09d96 | #1f1e1b | 11.5px/400 | 6.16:1 | PASS AA | 134 | dashboard,rooms,cancellations,former +8 | div.dl-meth > button.dl-meth__row > span.dl-meth__pct [dl-meth__pct dash-rp-date k] |
| #a09d96 | #1f1e1b | 13px/600 | 6.16:1 | PASS AA | 17 | dashboard,payments,backup,users +1 | div.dl-meth > button.dl-meth__row.is-zero > span.dl-meth__amt [dl-meth__amt cur set-tab] |
| #a09d96 | #1f1e1b | 13.5px/400 | 6.16:1 | PASS AA | 63 | dashboard,activitylog,archive | tr.dash-rp-row > td > span.dash-rp-nil [dash-rp-nil lk-dash num] |
| #a09d96 | #1f1e1b | 11px/600 | 6.16:1 | PASS AA | 9 | rooms,expenses,addpayment | div.rms-stat__top > div > div.rms-stat__label [rms-stat__label exp-stat__l ws__add] |
| #a09d96 | #1f1e1b | 12px/600 | 6.16:1 | PASS AA | 8 | rooms,reports | div > div.rms-stat__val > small [rpt-tile__l] |
| #a09d96 | #1f1e1b | 10.5px/500 | 6.16:1 | PASS AA | 12 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__sub [stu-stat__sub stu-who__sub lk-statdate] |
| #a09d96 | #1f1e1b | 17.36px/700 | 6.16:1 | PASS AA | 1 | students | div.stu-stat.stu-stat--click > div.stu-stat__val > small [] |
| #a8b0be | #2d2f30 | 12px/500 | 6.16:1 | PASS AA | 2 | students | tbody > tr > td.stu-idc [stu-idc] |
| #a8b0be | #2d2f30 | 10.5px/500 | 6.16:1 | PASS AA | 2 | students | td > span.stu-addr > span.stu-addr__t [stu-addr__t stu-nat] |
| #a09d96 | #1f1e1b | 12.5px/400 | 6.16:1 | PASS AA | 52 | students,payments,expenses,cancellations +8 | div.stu-panel > div.stu-foot > div.stu-foot__size [stu-foot__size stu-foot__info pay-meta__txt] |
| #d9a441 | #332b1b | 11.5px/600 | 6.22:1 | PASS AA | 1 | dashboard | footer.dash-foot > div.dash-foot__r > span.dash-foot__state.is-warn [dash-foot__state is-warn] |
| #d9a441 | #2b2a28 | 10px/700 | 6.38:1 | PASS AA | 1 | rooms | div.rms-occ > span.rms-occ__chip.is-vacating > b.rms-occ__vac [rms-occ__vac] |
| #181715 | #f0796a | 10px/800 | 6.52:1 | PASS AA | 18 | dashboard,rooms,students,payments +14 | nav.sb-nav.sidebar__middle > div.nav-item > span#cancel-badge.nav-badge [nav-badge] |
| #a8b0be | #2b2a28 | 11px/600 | 6.57:1 | PASS AA | 2 | dashboard | div.dash-sec__head > div.trend-range > button.trend-range__b [trend-range__b] |
| #a8b0be | #2b2a28 | 10.5px/400 | 6.57:1 | PASS AA | 6 | rooms | div.rms-occ > span.rms-occ__chip > span [] |
| #7ba0ff | #1f1e1b | 12px/700 | 6.60:1 | PASS AA | 4 | dashboard,support | div.dash-sec > div.dash-sec__head > button.dash-link [dash-link sup-big__a] |
| #a09d96 | #181715 | 12px/400 | 6.62:1 | PASS AA | 5 | dashboard,rooms,addstudent | footer.dash-foot > div.dash-foot__l > span [dash-foot__tag dash-foot__stamp pager-info] |
| #3a2500 | #f59e0b | 12px/600 | 6.77:1 | PASS AA | 2 | rooms | div.rms-card__body.dh-green > div.rms-acts > button.rms-force [rms-force] |
| #3fbf83 | #1f1e1b | 11px/800 | 7.14:1 | PASS AAA | 1 | dashboard | button.dl-glance__row > span.dl-glance__body > span.dl-glance__sub.dl-money [dl-glance__sub dl-money] |
| #3fbf83 | #1f1e1b | 28px/700 | 7.14:1 | PASS AAA | 1 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val.is-good [stu-stat__val is-good] |
| #3fbf83 | #1f1e1b | 11px/700 | 7.14:1 | PASS AAA | 1 | payments | div.pay-stat.pay-stat--click > div.pay-stat__foot > span.pay-stat__delta [pay-stat__delta] |
| #a8b0be | #252320 | 9px/600 | 7.18:1 | PASS AAA | 3 | dashboard | div.seat-inline > span.seat-inline__k > span [] |
| #a8b0be | #252320 | 13px/700 | 7.18:1 | PASS AAA | 2 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.n [n] |
| #a8b0be | #252320 | 10.5px/650 | 7.18:1 | PASS AAA | 2 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.c [c] |
| #a8b0be | #252320 | 11.5px/600 | 7.18:1 | PASS AAA | 13 | dashboard,payments,expenses | tr.dash-rp-row > td > span.pm-chip [pm-chip exp-meth] |
| #a8b0be | #252320 | 12px/600 | 7.18:1 | PASS AAA | 3 | rooms | div.pager > div.pager-controls > button.pager-btn [pager-btn] |
| #c8a84b | #1f1e1b | 12px/800 | 7.27:1 | PASS AAA | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #d9a441 | #1f1e1b | 11.5px/650 | 7.41:1 | PASS AAA | 5 | dashboard | div.dash-pay > div > span.dash-status.dh-slate [dash-status dh-slate] |
| #d9a441 | #1f1e1b | 11px/700 | 7.41:1 | PASS AAA | 1 | payments | div.pay-stat.pay-stat--click > div.pay-stat__foot > span.pay-stat__delta [pay-stat__delta] |
| #fafafa | #525252 | 13.5px/650 | 7.49:1 | PASS AAA | 17 | dashboard,rooms,students,payments +13 | nav.sb-nav.sidebar__middle > div.nav-item.active > span.nav-label [nav-label] |
| #a8b0be | #1f1e1b | 10px/700 | 7.64:1 | PASS AAA | 7 | dashboard,addpayment | div.dsh-card.dh-blue > div.dash-kpi__top > div.dash-kpi__label [dash-kpi__label ap-card__h] |
| #a8b0be | #1f1e1b | 10.5px/600 | 7.64:1 | PASS AAA | 5 | dashboard | div.dash-kpi-grid > div.dsh-card.dh-blue > div.dash-kpi__sub [dash-kpi__sub kbar__pct seat-key__k] |
| #a8b0be | #1f1e1b | 11px/600 | 7.64:1 | PASS AAA | 31 | dashboard,settings,support,addpayment | div.dsh-card.dh-blue > div.kbar.kbar--blue > div.kbar__pct [kbar__pct seat-foot__b rt-row__rooms] |
| #a8b0be | #1f1e1b | 10px/600 | 7.64:1 | PASS AAA | 2 | dashboard | div.dash-sec__head > div.dash-legend > span.dash-legend__k.dh-blue [dash-legend__k dh-blue dh-slate] |
| #a8b0be | #1f1e1b | 10.5px/650 | 7.64:1 | PASS AAA | 40 | dashboard | div.dash-room-wrap > div.dash-room.dh-violet > div.c [c] |
| #a8b0be | #1f1e1b | 11.5px/600 | 7.64:1 | PASS AAA | 38 | dashboard,settings,support,addstudent | div.dl-glance__row.dl-glance__row--static > span.dl-glance__body > span.dl-glance__label [dl-glance__label set-btn set-btn--sm] |
| #a8b0be | #1f1e1b | 12.5px/600 | 7.64:1 | PASS AAA | 45 | dashboard,rooms,students,payments +7 | div.dl-meth > button.dl-meth__row > span.dl-meth__name [dl-meth__name rms-btn pay-money] |
| #a8b0be | #1f1e1b | 12.5px/700 | 7.64:1 | PASS AAA | 13 | dashboard,payments,support | tr.dash-rp-row > td > span.dash-rp-room [dash-rp-room sup-empty__t] |
| #a8b0be | #1f1e1b | 12px/600 | 7.64:1 | PASS AAA | 43 | rooms,students,payments,reports | div.rms-tools > div.rms-seg > button [stu-btn pay-stat__label rpt-card__a] |
| #a8b0be | #1f1e1b | 12px/500 | 7.64:1 | PASS AAA | 10 | students | tbody > tr > td.stu-idc [stu-idc] |
| #a8b0be | #1f1e1b | 10.5px/500 | 7.64:1 | PASS AAA | 10 | students | td > span.stu-addr > span.stu-addr__t [stu-addr__t stu-nat] |
| #a8b0be | #1f1e1b | 13px/600 | 7.64:1 | PASS AAA | 31 | payments,cancellations,former,issues +9 | div.pay-tools > div > button.pay-btn [pay-btn lk-btn set-btn] |
| #f0a030 | #1f1e1b | 12px/800 | 7.76:1 | PASS AAA | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #2ec98a | #1f1e1b | 12px/800 | 7.81:1 | PASS AAA | 1 | dashboard | div.rt-right > div.rt-row > span.rt-row__pct [rt-row__pct] |
| #b3b3b3 | #201f1e | 11px/400 | 7.85:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div#sb-user.sb-user > div.sb-user__id > div#sb-user-role.sb-user__role [sb-user__role] |
| #181715 | #d9a441 | 10px/800 | 7.97:1 | PASS AAA | 18 | dashboard,rooms,students,payments +14 | nav.sb-nav.sidebar__middle > div.nav-item > span#issues-badge.nav-badge [nav-badge] |
| #a8b0be | #181715 | 12px/650 | 8.21:1 | PASS AAA | 2 | dashboard | footer.dash-foot > div.dash-foot__l > span.dash-foot__brand [dash-foot__brand] |
| #afaeae | #131211 | 10px/800 | 8.45:1 | PASS AAA | 95 | dashboard,rooms,students,payments +15 | aside#sidebar > nav.sb-nav.sidebar__middle > div.sb-section [sb-section] |
| #afaeae | #131211 | 13.5px/500 | 8.45:1 | PASS AAA | 268 | dashboard,rooms,students,payments +15 | nav.sb-nav.sidebar__middle > div.nav-item > span.nav-label [nav-label] |
| #e7eaf0 | #3d3321 | 15px/800 | 10.29:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-amber > span.dl-need__n [dl-need__n] |
| #e7eaf0 | #3d3321 | 11px/600 | 10.29:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-amber > span.dl-act__label [dl-act__label] |
| #e7eaf0 | #24382c | 11px/600 | 10.39:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-green > span.dl-act__label [dl-act__label] |
| #e7eaf0 | #2e333f | 15px/800 | 10.49:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-blue > span.dl-need__n [dl-need__n] |
| #e7eaf0 | #2e333f | 11px/600 | 10.49:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-blue > span.dl-act__label [dl-act__label] |
| #e7eaf0 | #33303d | 15px/800 | 10.68:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-violet > span.dl-need__n [dl-need__n] |
| #e7eaf0 | #33303d | 11px/600 | 10.68:1 | PASS AAA | 1 | dashboard | div.dl-acts.dl-acts--4 > button.dl-act.dh-violet > span.dl-act__label [dl-act__label] |
| #e7eaf0 | #402d28 | 15px/800 | 10.73:1 | PASS AAA | 1 | dashboard | div.dl-needs > button.dl-need.dh-red > span.dl-need__n [dl-need__n] |
| #e7eaf0 | #2d2f30 | 12.5px/700 | 11.16:1 | PASS AAA | 2 | students | div.stu-who > div > div.stu-who__name [stu-who__name stu-charge] |
| #e7eaf0 | #2d2f30 | 11.5px/500 | 11.16:1 | PASS AAA | 1 | students | tr > td > div.stu-contact [stu-contact] |
| #e7eaf0 | #2d2f30 | 11px/500 | 11.16:1 | PASS AAA | 1 | students | span.stu-cnic > span.cnic-r > span.cnic-r__m [cnic-r__m] |
| #e7eaf0 | #252320 | 12px/700 | 13.00:1 | PASS AAA | 25 | dashboard,rooms,students,payments +15 | div.sb-month-picker__header > div.sb-month-picker__display > span#sb-cal-today-lbl.sb-month-picker__label [sb-month-picker__label stu-room__n] |
| #e7eaf0 | #252320 | 11px/700 | 13.00:1 | PASS AAA | 1 | dashboard | div.dash-sec__head > div.trend-range > button.trend-range__b.is-on [trend-range__b is-on] |
| #e7eaf0 | #252320 | 14px/800 | 13.00:1 | PASS AAA | 2 | dashboard | div.seat-inline > span.seat-inline__k > b [] |
| #e7eaf0 | #1f1e1b | 26px/700 | 13.83:1 | PASS AAA | 18 | dashboard,rooms,students,payments +14 | div.hdr-left > div.hdr-title-wrap > div#hdr-title.page-title [page-title] |
| #e7eaf0 | #1f1e1b | 12.5px/700 | 13.83:1 | PASS AAA | 52 | dashboard,students,payments,expenses +4 | div.hdr-greet > span.hdr-greet__b > span.hdr-greet__hi [hdr-greet__hi dash-pay__name dash-rp-num] |
| #e7eaf0 | #1f1e1b | 26.637px/700 | 13.83:1 | PASS AAA | 5 | dashboard | div.dash-kpi__value > span.money-value.money-value--display > span.money-amt [money-amt] |
| #e7eaf0 | #1f1e1b | 10.5px/700 | 13.83:1 | PASS AAA | 2 | dashboard | div.dash-kpi__split > span.dash-kpi__srow > b [] |
| #e7eaf0 | #1f1e1b | 13px/700 | 13.83:1 | PASS AAA | 54 | dashboard,payments,issues,settings +4 | div.dash-sec > div.dash-sec__head > span.dash-sec__title [dash-sec__title dl-glance__n dl-meth__amt] |
| #e7eaf0 | #1f1e1b | 14.5px/700 | 13.83:1 | PASS AAA | 7 | dashboard,reports | div.dash-sec__head.seat-head > div.seat-hd > div.seat-hd__t [seat-hd__t rpt-card__h] |
| #e7eaf0 | #1f1e1b | 21px/800 | 13.83:1 | PASS AAA | 12 | dashboard,reports,backup,settings +1 | div.dnut__mid > div.dnut__top > span.dnut__fig [dnut__fig mov__t set-head__t] |
| #e7eaf0 | #1f1e1b | 12px/700 | 13.83:1 | PASS AAA | 6 | dashboard,reports | div.rt-right > div.rt-row > span.rt-row__name [rt-row__name rpt-brow__v] |
| #e7eaf0 | #1f1e1b | 24px/800 | 13.83:1 | PASS AAA | 4 | dashboard,activitylog | div.dnut__mid > div.dnut__top > span.dnut__fig [dnut__fig al-kpi__v] |
| #e7eaf0 | #1f1e1b | 17px/800 | 13.83:1 | PASS AAA | 4 | dashboard | div.dash-rp-stat.dh-blue > div.dash-rp-stat__body > div.dash-rp-stat__val [dash-rp-stat__val] |
| #e7eaf0 | #1f1e1b | 20px/700 | 13.83:1 | PASS AAA | 5 | rooms,settings | div.rms-stat__top > div > div.rms-stat__val [rms-stat__val hi-id__name] |
| #e7eaf0 | #1f1e1b | 15px/700 | 13.83:1 | PASS AAA | 31 | rooms | div.rms-shell > div.rms-head > div.rms-head__t [rms-head__t rms-card__num] |
| #e7eaf0 | #1f1e1b | 11.5px/700 | 13.83:1 | PASS AAA | 74 | rooms,activitylog,settings,support +1 | div.rms-card__body.dh-green > div.rms-row > span.v [v hi-store__v al-user__v] |
| #e7eaf0 | #1f1e1b | 28px/700 | 13.83:1 | PASS AAA | 4 | students | div.stu-stats > div.stu-stat.stu-stat--click > div.stu-stat__val [stu-stat__val] |
| #e7eaf0 | #1f1e1b | 11.5px/500 | 13.83:1 | PASS AAA | 5 | students | tr > td > div.stu-contact [stu-contact] |
| #e7eaf0 | #1f1e1b | 11px/500 | 13.83:1 | PASS AAA | 5 | students | span.stu-cnic > span.cnic-r > span.cnic-r__m [cnic-r__m] |
| #e7eaf0 | #1f1e1b | 26px/800 | 13.83:1 | PASS AAA | 4 | payments | div.pay-stats > div.pay-stat.dh-green > div.pay-stat__val [pay-stat__val] |
| #f5f5f5 | #201f1e | 13px/700 | 15.09:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div#sb-user.sb-user > div.sb-user__id > div#sb-user-name.sb-user__name [sb-user__name] |
| #16202e | #f4f6f8 | 25px/800 | 15.14:1 | PASS AAA | 2 | login | div.lg-brand > span > span.lg-brand__n [lg-brand__n lg-h2] |
| #16202e | #f4f6f8 | 13.5px/700 | 15.14:1 | PASS AAA | 4 | login | li.lg-feat > span > b [] |
| #ffffff | #1b2433 | 10.5px/600 | 15.59:1 | PASS AAA | 30 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__beds [rms-card__beds] |
| #16202e | #ffffff | 27px/800 | 16.40:1 | PASS AAA | 1 | login | div#login-card > section.lg-form > h1.lg-h [lg-h] |
| #16202e | #ffffff | 13.5px/700 | 16.40:1 | PASS AAA | 1 | login | section.lg-form > p.lg-p > b#login-hostel-name [] |
| #16202e | #ffffff | 12.5px/650 | 16.40:1 | PASS AAA | 2 | login | div#login-card > section.lg-form > label.lg-lbl [lg-lbl] |
| #ffffff | #ffffff (over linear-gradient(90deg, rgb(59, 130, 246), rgb(37, ) | 15px/700 | n/a | UNKNOWN | 1 | login | div#login-card > section.lg-form > button#login-btn |
| #16202e | #ffffff | 12.5px/600 | 16.40:1 | PASS AAA | 1 | login | div.lg-safe > span > b [] |
| #2ec98a | #f7f9fb (over radial-gradient(1100px 620px at 12% -10%, rgb(238,) | 9px/400 | n/a | UNKNOWN | 1 | login | body.has-titlebar.hz-tb-autohide > div#login-screen > div#license-badge |
| #9b8cf0 | #33303d | 11.5px/800 | 4.54:1 | PASS AA | 2 | payments,complaints | td > div.pay-who > div.pay-who__av.dh-violet [pay-who__av dh-violet lk-who__av] |
| #404040 | #d9a441 | 10px/800 | 4.61:1 | PASS AA | 1 | issues | nav.sb-nav.sidebar__middle > div.nav-item.active > span#issues-badge.nav-badge [nav-badge] |
| #a09d96 | #29334d | 8.5px/700 | 4.63:1 | PASS AA | 1 | settings | div.hi-id__top > button#hi-logo.hi-logo > span.hi-logo__hint [hi-logo__hint] |
| #7ba0ff | #31384a | 12.5px/700 | 4.63:1 | PASS AA | 1 | archive | div.arc-bar > div.arc-years > button.is-on [is-on] |
| #4a9cf0 | #252f37 | 11px/700 | 4.74:1 | PASS AA | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #a09d96 | #23352a | 11px/400 | 4.81:1 | PASS AA | 1 | support | div.conn-sum.is-online > span > small [] |
| #181715 | #4e7dff | 12px/650 | 4.86:1 | PASS AA | 1 | reports | div.rpt-bar > div.rpt-bar__end > button.rpt-print [rpt-print] |
| #181715 | #4e7dff | 10.5px/800 | 4.86:1 | PASS AA | 6 | addpayment | div.ws > div.ws__row > div.ws__n [ws__n] |
| #181715 | #4e7dff | 11.5px/600 | 4.86:1 | PASS AA | 1 | addpayment | div.ws__d > div#f-pmess-seg.ws__seg > button.ws__seg-b.is-on [ws__seg-b is-on] |
| #181715 | #4e7dff | 11px/800 | 4.86:1 | PASS AA | 1 | addpayment | div.ap-mrail > div#ap-chips.ap-chips > button.ap-chip.is-on [ap-chip is-on is-now] |
| #a09d96 | #31302c | 10.5px/700 | 4.88:1 | PASS AA | 4 | payments | tr > td > span.pay-pill.dh-slate [pay-pill dh-slate] |
| #a09d96 | #31302c | 11px/600 | 4.88:1 | PASS AA | 1 | expenses | div.exp-stat__c > div.exp-stat__vrow > span.exp-stat__trend.is-none [exp-stat__trend is-none] |
| #a09d96 | #2d2f30 | 10.5px/400 | 4.97:1 | PASS AA | 2 | payments | div.pay-who > div > div.pay-who__meta [pay-who__meta pay-room__t] |
| #a09d96 | #2d2f30 | 12.5px/400 | 4.97:1 | PASS AA | 5 | payments,former,issues | tr > td.pay-col-x > span.pay-dash [pay-dash lk-empty__s lk-dash] |
| #a09d96 | #2d2f30 | 11px/400 | 4.97:1 | PASS AA | 5 | cancellations,issues,users | div.lk-who.dh-violet > div > div.lk-who__s [lk-who__s lk-sub] |
| #a09d96 | #2d2f30 | 11.5px/400 | 4.97:1 | PASS AA | 1 | users | div.usr-who > div > div.usr-who__s [usr-who__s] |
| #a09d96 | #2d2f30 | 13.5px/400 | 4.97:1 | PASS AA | 1 | users | tr > td > span.lk-dash [lk-dash] |
| #7ba0ff | #2b3245 | 12.5px/700 | 5.05:1 | PASS AA | 1 | archive | div#content > div.arc-tabs > button.is-on [is-on] |
| #a09d96 | #2f2c28 | 12.5px/400 | 5.13:1 | PASS AA | 6 | settings | div.set-row.is-locked > div.set-row__c > span.set-dead [set-dead] |
| #a8b0be | #393b3b | 11px/700 | 5.16:1 | PASS AA | 2 | cancellations,issues | tr > td > span.lk-chip.lk-chip--flat [lk-chip lk-chip--flat] |
| #a09d96 | #3b2723 | 11px/400 | 5.17:1 | PASS AA | 1 | backup | div.bk-health.dh-red > span > small [] |
| #f0796a | #2b2a28 | 13.5px/800 | 5.22:1 | PASS AA | 1 | archive | tbody > tr.arc-sub > td.num [num] |
| #a09d96 | #2b2a28 | 10.5px/700 | 5.30:1 | PASS AA | 12 | backup,settings | div.set-head > div.set-head__end > span.set-lock [set-lock] |
| #a09d96 | #2b2a28 | 11.5px/400 | 5.30:1 | PASS AA | 1 | support | div.set-card > div.sup-note > span [] |
| #a09d96 | #2b2a28 | 12px/400 | 5.30:1 | PASS AA | 4 | support | div.sup-grid > div.sup-row > span.sup-row__l [sup-row__l] |
| #a09d96 | #2b2a28 | 11px/400 | 5.30:1 | PASS AA | 8 | archive,addstudent | div.arc-panel > div.arc-panel__head > span.arc-panel__n [arc-panel__n arc-legend__i] |
| #a09d96 | #2b2a28 | 11.5px/600 | 5.30:1 | PASS AA | 1 | addpayment | div.ws__d > div#f-pmess-seg.ws__seg > button.ws__seg-b [ws__seg-b] |
| #a09d96 | #2b2a28 | 11px/700 | 5.30:1 | PASS AA | 1 | addpayment | div#ap-summary > div.ap-stub__bal.is-none > span [] |
| #a09d96 | #2b2a28 | 16px/800 | 5.30:1 | PASS AA | 1 | addpayment | div#ap-summary > div.ap-stub__bal.is-none > b [] |
| #5db872 | #283427 | 10.5px/700 | 5.32:1 | PASS AA | 1 | payments | tr > td > span.pay-pill.dh-green [pay-pill dh-green] |
| #5db872 | #283427 | 11.5px/600 | 5.32:1 | PASS AA | 1 | settings | div.set-head > div.set-head__end > span#hi-savestate.hi-live [hi-live] |
| #7ba0ff | #2d2f30 | 11px/600 | 5.33:1 | PASS AA | 1 | cancellations | div.lk-who.dh-violet > div > div.lk-who__id [lk-who__id] |
| #3fbf83 | #24382c | 11px/700 | 5.36:1 | PASS AA | 2 | activitylog,settings | tr > td > span.lk-chip.dh-green [lk-chip dh-green hi-id__st] |
| #7ba0ff | #272d3f | 13px/700 | 5.42:1 | PASS AA | 3 | issues,maintenance,complaints | div#content > div.iss-tabs > button.iss-tab.is-on [iss-tab is-on] |
| #5db872 | #2d2f30 | 12.5px/700 | 5.49:1 | PASS AA | 1 | payments | tr > td.pay-money.pay-money--in > span [] |
| #d9a441 | #3d3321 | 11.5px/800 | 5.51:1 | PASS AA | 1 | payments | td > div.pay-who > div.pay-who__av.dh-amber [pay-who__av dh-amber] |
| #d9a441 | #3d3321 | 11.5px/700 | 5.51:1 | PASS AA | 1 | expenses | tr > td > span.exp-cat.dh-amber [exp-cat dh-amber] |
| #3fbf83 | #23352a | 11.5px/700 | 5.57:1 | PASS AA | 3 | support | div.conn-rows > div.conn-row.is-online > span.conn-pill [conn-pill] |
| #a09d96 | #252422 | 12.5px/600 | 5.73:1 | PASS AA | 9 | reports | div#content > div.rpt-tabs > button.rpt-tab [rpt-tab] |
| #a09d96 | #252422 | 12px/400 | 5.73:1 | PASS AA | 1 | support | div.sup > div.sup-foot > span [] |
| #c8a84b | #353021 | 11px/700 | 5.74:1 | PASS AA | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #a8b0be | #29334d | 12px/400 | 5.74:1 | PASS AA | 1 | backup | div.set-card > div.bk-warn.is-info > span [] |
| #a8b0be | #29334d | 11.5px/400 | 5.74:1 | PASS AA | 5 | backup,users,settings | div.set-card > div.cfg-note > span [] |
| #a8b0be | #29334d | 11.5px/700 | 5.74:1 | PASS AA | 3 | backup,users,settings | div.cfg-note > span > b [] |
| #a09d96 | #252320 | 11px/500 | 5.79:1 | PASS AA | 11 | payments,cancellations,issues,maintenance +1 | td > span.lk-room > span.lk-room__t [lk-room__t] |
| #a09d96 | #252320 | 11.5px/400 | 5.79:1 | PASS AA | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__s [bk-drop__s] |
| #a09d96 | #252320 | 11.5px/700 | 5.79:1 | PASS AA | 1 | support | div.conn-rows > div.conn-row.is-unconfigured > span.conn-pill [conn-pill] |
| #7ba0ff | #24292d | 11px/600 | 5.81:1 | PASS AA | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.badge.badge-blue [badge badge-blue] |
| #a09d96 | #222324 | 13.5px/400 | 5.82:1 | PASS AA | 6 | archive | tr > td.nm > span [num] |
| #9b8cf0 | #1f1e1b | 14px/800 | 5.88:1 | PASS AA | 1 | reports | div.mov__cv > span.money-value.money-value--body > span.money-amt [money-amt] |
| #9b8cf0 | #1f1e1b | 22px/800 | 5.88:1 | PASS AA | 1 | reports | div.rpt-tile.dh-violet > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #a8b0be | #38301a | 12px/400 | 5.99:1 | PASS AA | 1 | backup | div.set-card > div.bk-warn > span [] |
| #f0796a | #1f1e1b | 14px/800 | 6.07:1 | PASS AA | 2 | reports,archive | div.mov__cv > span.money-value.money-value--body > span.money-amt [money-amt] |
| #f0a030 | #3b2f1e | 11px/700 | 6.07:1 | PASS AA | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #f0796a | #1f1e1b | 22px/800 | 6.07:1 | PASS AA | 1 | reports | div.rpt-tile.dh-red > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #f0796a | #1f1e1b | 13px/600 | 6.07:1 | PASS AA | 1 | activitylog | div.bk-head > div.al-head__acts > button.set-btn.set-btn--danger [set-btn set-btn--danger] |
| #f0796a | #1f1e1b | 13.5px/400 | 6.07:1 | PASS AA | 1 | archive | tbody > tr.is-click > td.num [num] |
| #f0796a | #1f1e1b | 11.5px/600 | 6.07:1 | PASS AA | 5 | addstudent | div.sf-f > label > span.req [req] |
| #f0796a | #1f1e1b | 9px/700 | 6.07:1 | PASS AA | 2 | addpayment | div.pf-f > label > span.req [req] |
| #2ec98a | #21352a | 11px/700 | 6.12:1 | PASS AA | 1 | reports | tr > td > span.rpt-tbl__chip [rpt-tbl__chip] |
| #3fbf83 | #2b2a28 | 13.5px/800 | 6.14:1 | PASS AA | 2 | archive | tbody > tr.arc-sub > td.num [num] |
| #a8b0be | #2d2f30 | 12.5px/400 | 6.16:1 | PASS AA | 2 | payments,cancellations | tr > td.pay-mo > span.pay-mo__abbr [pay-mo__abbr lk-prose] |
| #a8b0be | #2d2f30 | 12.5px/700 | 6.16:1 | PASS AA | 1 | payments | td.pay-money > span > span [] |
| #a09d96 | #1f1e1b | 13px/400 | 6.16:1 | PASS AA | 3 | expenses,archive,addpayment | tr > td > span.exp-dash [exp-dash arc-empty] |
| #a8b0be | #2d2f30 | 14px/700 | 6.16:1 | PASS AA | 1 | former | td > div.lk-empty > div.lk-empty__t [lk-empty__t] |
| #a09d96 | #1f1e1b | 6.3px/600 | 6.16:1 | PASS AA | 11 | reports,archive | div.rpt-stat__val > span.money-value.money-value--body > span.money-cur [money-cur] |
| #a09d96 | #1f1e1b | 10.5px/700 | 6.16:1 | PASS AA | 6 | reports,archive | div.rpt-stat.dh-blue > div.rpt-stat__sub > span.rpt-delta.rpt-delta--flat [rpt-delta rpt-delta--flat arc-tabs__n] |
| #a09d96 | #1f1e1b | 12px/400 | 6.16:1 | PASS AA | 11 | reports,settings,support,addpayment | div.rpt-legend > div.rpt-legend__r > span.rpt-legend__v [rpt-legend__v hi-id__tag hi-fact__l] |
| #a09d96 | #1f1e1b | 12.5px/500 | 6.16:1 | PASS AA | 1 | reports | div.rpt-card.rpt-hi > div.rpt-card__h > span.rpt-card__hs [rpt-card__hs] |
| #a09d96 | #1f1e1b | 11px/500 | 6.16:1 | PASS AA | 5 | reports,settings | div.rpt-card.rpt-quick > div.rpt-card__h > span.rpt-quick__note [rpt-quick__note opt] |
| #a09d96 | #1f1e1b | 24px/800 | 6.16:1 | PASS AA | 1 | activitylog | div.al-kpi.dh-slate > div > div.al-kpi__v [al-kpi__v] |
| #a09d96 | #1f1e1b | 19px/800 | 6.16:1 | PASS AA | 1 | users | div.usr-kpi.dh-slate > div > div.usr-kpi__v [usr-kpi__v] |
| #a09d96 | #1f1e1b | 12.5px/600 | 6.16:1 | PASS AA | 1 | settings | div.hi-facts > div.hi-fact.is-locked > span.hi-fact__v [hi-fact__v] |
| #a09d96 | #1f1e1b | 11px/700 | 6.16:1 | PASS AA | 12 | archive | div#content > div.arc-bar > span.arc-bar__lbl [arc-bar__lbl arc-kpi__l] |
| #a09d96 | #1f1e1b | 10px/400 | 6.16:1 | PASS AA | 24 | archive | div.arc-chart__b > div.arc-axis > span [] |
| #a09d96 | #1f1e1b | 15px/700 | 6.16:1 | PASS AA | 4 | addpayment | div.ws__row > div.ws__a > span#ws-a-02.ws__amt.is-muted [ws__amt is-muted] |
| #a09d96 | #1f1e1b | 9px/700 | 6.16:1 | PASS AA | 11 | addpayment | div.ws__fields > div.pf-f > label [ap-key__i] |
| #a09d96 | #1f1e1b | 9px/400 | 6.16:1 | PASS AA | 1 | addpayment | div.pf-f > label > span.opt [opt] |
| #a09d96 | #1f1e1b | 9.5px/700 | 6.16:1 | PASS AA | 4 | addpayment | div.ap-stub__r > span > i [] |
| #d9a441 | #2b2a28 | 13.5px/800 | 6.38:1 | PASS AA | 1 | archive | tbody > tr.arc-sub > td.num [num] |
| #a8b0be | #2b2a28 | 13px/700 | 6.57:1 | PASS AA | 6 | issues,maintenance,complaints | div#content > div.iss-tabs > button.iss-tab [iss-tab] |
| #a8b0be | #2b2a28 | 11px/700 | 6.57:1 | PASS AA | 3 | issues,maintenance,complaints | tr > td > span.lk-chip.lk-chip--flat [lk-chip lk-chip--flat] |
| #a8b0be | #2b2a28 | 12.5px/400 | 6.57:1 | PASS AA | 1 | backup | div.set-card > div.set-note > span [] |
| #a8b0be | #2b2a28 | 12.5px/700 | 6.57:1 | PASS AA | 3 | backup,addstudent | div.set-note > span > b [sf-prefix] |
| #a8b0be | #2b2a28 | 13px/600 | 6.57:1 | PASS AA | 1 | addstudent | div.sf-sec > div.asf-photo-acts > button#add-student-cam-btn.sf-btn.sf-btn--ghost [sf-btn sf-btn--ghost] |
| #a8b0be | #2b2a28 | 11.5px/600 | 6.57:1 | PASS AA | 2 | addpayment | header.tsk-head > div.tsk-head__r > span.tsk-chip [tsk-chip tsk-chip--state] |
| #7ba0ff | #1f1e1b | 11px/600 | 6.60:1 | PASS AA | 1 | cancellations | div.lk-banner.dh-violet > div > div.lk-banner__a [lk-banner__a] |
| #7ba0ff | #1f1e1b | 17px/800 | 6.60:1 | PASS AA | 1 | reports | div.mov__cell.dh-blue > div > div.mov__cv [mov__cv] |
| #7ba0ff | #1f1e1b | 22px/800 | 6.60:1 | PASS AA | 1 | reports | div.rpt-tile.dh-blue > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #7ba0ff | #1f1e1b | 13px/700 | 6.60:1 | PASS AA | 3 | backup,users,settings | div.set-tabs-wrap > div.set-tabs > div.set-tab.is-on [set-tab is-on] |
| #7ba0ff | #1f1e1b | 11px/700 | 6.60:1 | PASS AA | 1 | support | div.sup-hero > div.sup-hero__b > span.sup-hero__k [sup-hero__k] |
| #7ba0ff | #1f1e1b | 24px/800 | 6.60:1 | PASS AA | 3 | archive | div.arc-kpis > div.arc-kpi.dh-blue > div.arc-kpi__v [arc-kpi__v] |
| #7ba0ff | #1f1e1b | 15px/700 | 6.60:1 | PASS AA | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.asf-rec__v.asf-num [asf-rec__v asf-num asf-num--id] |
| #7ba0ff | #1f1e1b | 12.5px/700 | 6.60:1 | PASS AA | 4 | addstudent | div.sf-sec > div.sf-sec__h > span.asf-n [asf-n] |
| #7ba0ff | #1f1e1b | 10px/700 | 6.60:1 | PASS AA | 1 | addpayment | div.ap-card > div.ap-card__h > button.ap-card__lnk [ap-card__lnk] |
| #a09d96 | #181715 | 12.5px/400 | 6.62:1 | PASS AA | 3 | activitylog,backup,users | div.bk-head > div.set-head__mid > div.bk-head__s [bk-head__s] |
| #a09d96 | #181715 | 11.5px/600 | 6.62:1 | PASS AA | 2 | addstudent | div > nav.asf-crumb > span [] |
| #a09d96 | #181715 | 10px/700 | 6.62:1 | PASS AA | 1 | addstudent | div.asf-head > div.asf-meter > span.asf-meter__l [asf-meter__l] |
| #a8b0be | #21273a | 12.5px/400 | 6.79:1 | PASS AA | 1 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__s [sup-hero__s] |
| #a8b0be | #21273a | 11.5px/700 | 6.79:1 | PASS AA | 1 | support | div.sup-hero__b > div.sup-pop > span.sup-pop__l [sup-pop__l] |
| #5db872 | #1f1e1b | 12.5px/700 | 6.80:1 | PASS AA | 5 | payments | tr > td.pay-money.pay-money--in > span [pay-money pay-money--in] |
| #7ba0ff | #181715 | 11.5px/700 | 7.09:1 | PASS AAA | 1 | addstudent | div > nav.asf-crumb > b [] |
| #a8b0be | #252422 | 13px/600 | 7.10:1 | PASS AAA | 2 | reports | div.rpt-bar > div.rpt-seg > button [] |
| #a8b0be | #252422 | 12.5px/600 | 7.10:1 | PASS AAA | 5 | archive | div#content > div.arc-tabs > button [] |
| #3fbf83 | #1f1e1b | 14px/800 | 7.14:1 | PASS AAA | 4 | reports,archive | div.rpt-stat__val > span.money-value.money-value--body > span.money-amt [money-amt] |
| #3fbf83 | #1f1e1b | 22px/800 | 7.14:1 | PASS AAA | 1 | reports | div.rpt-tile.dh-green > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #3fbf83 | #1f1e1b | 13.5px/400 | 7.14:1 | PASS AAA | 2 | archive | tbody > tr.is-click > td.num [num] |
| #3fbf83 | #1f1e1b | 24px/800 | 7.14:1 | PASS AAA | 2 | archive | div.arc-kpis > div.arc-kpi.dh-green > div.arc-kpi__v [arc-kpi__v] |
| #3fbf83 | #1f1e1b | 9px/700 | 7.14:1 | PASS AAA | 1 | addpayment | div.ap-card > div.ap-card__h > span.ap-live [ap-live] |
| #a8b0be | #252320 | 12.5px/600 | 7.18:1 | PASS AAA | 4 | expenses | div.exp-foot > div.exp-pager > button [] |
| #d9a441 | #1f1e1b | 22px/800 | 7.41:1 | PASS AAA | 1 | reports | div.rpt-tile.dh-amber > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #d9a441 | #1f1e1b | 14px/800 | 7.41:1 | PASS AAA | 1 | archive | div.arc-kpi__v > span.money-value.money-value--body > span.money-amt [money-amt] |
| #d9a441 | #1f1e1b | 13.5px/400 | 7.41:1 | PASS AAA | 1 | archive | tbody > tr.is-click > td.num [num] |
| #d9a441 | #1f1e1b | 24px/800 | 7.41:1 | PASS AAA | 1 | archive | div.arc-kpis > div.arc-kpi.dh-amber > div.arc-kpi__v [arc-kpi__v] |
| #a8b0be | #1f1e1b | 12.5px/400 | 7.64:1 | PASS AAA | 5 | payments | tr > td.pay-mo > span.pay-mo__abbr [pay-mo__abbr] |
| #a8b0be | #1f1e1b | 12.5px/650 | 7.64:1 | PASS AAA | 2 | expenses | div#content > div.exp-tools > button.exp-catadd [exp-catadd] |
| #a8b0be | #1f1e1b | 13px/400 | 7.64:1 | PASS AAA | 2 | expenses | tbody > tr > td.exp-date [exp-date exp-desc] |
| #a8b0be | #1f1e1b | 13px/700 | 7.64:1 | PASS AAA | 4 | expenses,reports,backup | tr > td.exp-amt > span [bk-empty__t] |
| #a8b0be | #1f1e1b | 11px/700 | 7.64:1 | PASS AAA | 21 | cancellations,former,issues,maintenance +2 | div.lk-stat.lk-stat--click > div.lk-stat__top > div.lk-stat__label [lk-stat__label] |
| #a8b0be | #1f1e1b | 12px/400 | 7.64:1 | PASS AAA | 9 | reports,activitylog,backup | div.mov__bar > div.mov__legend > span.mov__k [mov__k rpt-brow__n al-det] |
| #a8b0be | #1f1e1b | 22px/800 | 7.64:1 | PASS AAA | 1 | reports | div.rpt-tile.dh-slate > div.rpt-tile__x > div.rpt-tile__v [rpt-tile__v] |
| #a8b0be | #1f1e1b | 11.5px/400 | 7.64:1 | PASS AAA | 14 | activitylog,settings,support,addpayment | div.hi-store__b > div.hi-store__r > span.hi-store__k [hi-store__k al-user__n sup-urgent__p] |
| #a8b0be | #1f1e1b | 12px/700 | 7.64:1 | PASS AAA | 4 | activitylog,settings,addpayment | div.al-foot > div.al-pager > span.al-pager__n [al-pager__n] |
| #a8b0be | #1f1e1b | 11.5px/700 | 7.64:1 | PASS AAA | 3 | support | div.conn-foot > span > b [] |
| #a8b0be | #1f1e1b | 11px/800 | 7.64:1 | PASS AAA | 1 | addpayment | div.ws__chips > button.ws__chip > b#ws-q-full [] |
| #a8b0be | #181715 | 13px/800 | 8.21:1 | PASS AAA | 1 | addstudent | div.asf-head > div.asf-meter > span#asf-meter-pct.asf-meter__v [asf-meter__v] |
| #e7eaf0 | #29334d | 12px/700 | 10.40:1 | PASS AAA | 2 | backup | div.bk-warn.is-info > span > b [] |
| #e7eaf0 | #23352a | 12.5px/700 | 10.80:1 | PASS AAA | 1 | support | div.conn-sum.is-online > span > b [] |
| #e7eaf0 | #38301a | 12px/700 | 10.85:1 | PASS AAA | 1 | backup | div.bk-warn > span > b [] |
| #e7eaf0 | #2d2f30 | 13px/700 | 11.16:1 | PASS AAA | 4 | payments,cancellations,issues | div.pay-who > div > div.pay-who__name [pay-who__name lk-who__n iss-t] |
| #e7eaf0 | #2d2f30 | 12px/400 | 11.16:1 | PASS AAA | 4 | cancellations,issues,users | tr > td > div.lk-when [lk-when al-when] |
| #e7eaf0 | #2d2f30 | 12px/800 | 11.16:1 | PASS AAA | 1 | issues | tr > td.iss-c-ref > div.iss-ref [iss-ref] |
| #e7eaf0 | #2d2f30 | 13.5px/700 | 11.16:1 | PASS AAA | 1 | users | div.usr-who > div > div.usr-who__n [usr-who__n] |
| #e7eaf0 | #3b2723 | 13px/700 | 11.61:1 | PASS AAA | 1 | backup | div.bk-health.dh-red > span > b [] |
| #e7eaf0 | #2b2a28 | 12.5px/750 | 11.90:1 | PASS AAA | 6 | reports | tbody > tr.rpt-tbl__tot > td [] |
| #e7eaf0 | #2b2a28 | 12.5px/600 | 11.90:1 | PASS AAA | 4 | support | div.sup-grid > div.sup-row > span.sup-row__v [sup-row__v is-mono] |
| #e7eaf0 | #2b2a28 | 13.5px/800 | 11.90:1 | PASS AAA | 7 | archive | div.arc-panel > div.arc-panel__head > span.arc-panel__t [arc-panel__t num] |
| #e7eaf0 | #21273a | 22px/800 | 12.31:1 | PASS AAA | 1 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__t [sup-hero__t] |
| #e7eaf0 | #252320 | 13.5px/800 | 13.00:1 | PASS AAA | 11 | payments,cancellations,issues,maintenance +1 | td > span.lk-room > span.lk-room__n [lk-room__n] |
| #e7eaf0 | #252320 | 13.5px/700 | 13.00:1 | PASS AAA | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__t [bk-drop__t] |
| #e7eaf0 | #222324 | 13.5px/700 | 13.06:1 | PASS AAA | 1 | archive | tbody > tr > td.nm [nm] |
| #e7eaf0 | #1f1e1b | 19px/800 | 13.83:1 | PASS AAA | 12 | expenses,backup,users | div.exp-stat__v > span > span [exp-stat__v bk-stat__v usr-kpi__v] |
| #e7eaf0 | #1f1e1b | 28px/800 | 13.83:1 | PASS AAA | 20 | cancellations,former,issues,maintenance +1 | div.lk-stats > div.lk-stat.lk-stat--click > div.lk-stat__val [lk-stat__val] |
| #e7eaf0 | #1f1e1b | 13.5px/700 | 13.83:1 | PASS AAA | 12 | cancellations,archive | div.lk-banner__l > div > div.lk-banner__t [lk-banner__t nm] |
| #e7eaf0 | #1f1e1b | 30px/800 | 13.83:1 | PASS AAA | 1 | cancellations | div.lk-banner.dh-violet > div > div.lk-banner__v [lk-banner__v] |
| #e7eaf0 | #1f1e1b | 15px/650 | 13.83:1 | PASS AAA | 2 | cancellations,former | div.lk-panel > div.lk-head > div.lk-head__t [lk-head__t] |
| #e7eaf0 | #1f1e1b | 14px/800 | 13.83:1 | PASS AAA | 4 | reports,addpayment | div.rpt-stat__val > span.money-value.money-value--body > span.money-amt [money-amt] |
| #e7eaf0 | #1f1e1b | 15.5px/800 | 13.83:1 | PASS AAA | 2 | reports | div.rpt-stats > div.rpt-stat.dh-blue > div.rpt-stat__val [rpt-stat__val] |
| #e7eaf0 | #1f1e1b | 14px/700 | 13.83:1 | PASS AAA | 17 | reports,activitylog,backup,settings +1 | div.mov__chart > div.mov__bar > span.mov__bart [mov__bart hi-id__ttl sup-big__t] |
| #e7eaf0 | #1f1e1b | 13.5px/800 | 13.83:1 | PASS AAA | 1 | reports | div.rpt-donut__c > div.rpt-donut__mid > b [] |
| #e7eaf0 | #1f1e1b | 12.5px/600 | 13.83:1 | PASS AAA | 10 | reports,support,addstudent | div.rpt-legend > div.rpt-legend__r > span.rpt-legend__n [rpt-legend__n sup-row__v is-mono] |
| #e7eaf0 | #1f1e1b | 13px/900 | 13.83:1 | PASS AAA | 1 | reports | div.rpt-card > div.rpt-btot > b [] |
| #e7eaf0 | #1f1e1b | 12.5px/400 | 13.83:1 | PASS AAA | 25 | reports | tbody > tr > td [rpt-tbl__z] |
| #e7eaf0 | #1f1e1b | 12px/800 | 13.83:1 | PASS AAA | 3 | issues,maintenance,complaints | tr > td.iss-c-ref > div.iss-ref [iss-ref] |
| #e7eaf0 | #1f1e1b | 12px/400 | 13.83:1 | PASS AAA | 4 | issues,activitylog,maintenance,complaints | tr > td > div.lk-when [lk-when al-when] |
| #e7eaf0 | #1f1e1b | 13px/800 | 13.83:1 | PASS AAA | 2 | activitylog,settings | div.hi-ring > div.hi-ring__c > div.hi-ring__v [hi-ring__v] |
| #e7eaf0 | #1f1e1b | 13.5px/400 | 13.83:1 | PASS AAA | 3 | activitylog,archive | tbody > tr > td [num] |
| #e7eaf0 | #1f1e1b | 11.5px/600 | 13.83:1 | PASS AAA | 3 | addstudent | div.asf-doc > span.asf-doc__x > span.asf-doc__n [asf-doc__n] |
| #e7eaf0 | #1f1e1b | 13px/600 | 13.83:1 | PASS AAA | 1 | addpayment | div.tsk-head__l > nav.tsk-crumb > b [] |
| #e7eaf0 | #181715 | 22px/800 | 14.87:1 | PASS AAA | 4 | activitylog,backup,users,addstudent | div.bk-head > div.set-head__mid > div.bk-head__t [bk-head__t asf-title] |
| #f5f5f5 | #131211 | 16px/800 | 17.16:1 | PASS AAA | 19 | dashboard,rooms,students,payments +15 | div.sb-logo-mark > div.sb-logo-text > div.name [name] |

Placeholder text (dark) — 9 combinations:

| Placeholder | Background | Size | Ratio | Result (4.5:1) | Pages | Sample |
|---|---|---|---|---|---|---|
| #94a3b0 | #ffffff | 14px | 2.58 | FAIL | login | section.lg-form > div.lg-field > input#login-user.lg-in |
| #a09d96 | #1f1e1b | 13px | 6.16 | PASS AA | dashboard,rooms,students,payments | div#hdr-search-wrap > div.hdr-find > input#dash-global-search |
| #a09d96 | #1f1e1b | 12.5px | 6.16 | PASS AA | rooms,addpayment | div.rms-tools > div.rms-search > input#search-rooms.lk-sin |
| #a09d96 | #1f1e1b | 11.5px | 6.16 | PASS AA | students,users,addpayment | div.stu-tools > div.stu-search > input#search-students.lk-sin |
| #a09d96 | #252320 | 13px | 5.79 | PASS AA | expenses | div.exp-tools > div.exp-search > input#search-expenses.lk-sin |
| #a09d96 | #252320 | 13.5px | 5.79 | PASS AA | activitylog,settings,support | div.al-filters > div.al-search > input#al-q.form-control |
| #757575 | #1f1e1b | 13px | 3.62 | FAIL | support | div.sup-hero__b > div.sup-hero__find > input#sup-find.sup-hero__in |
| #a09d96 | #2b2a28 | 13px | 5.30 | PASS AA | addstudent | div.asf-fg.asf-fg--2 > div.sf-f > input#f-tfloor.sf-in.sf-in--ro |
| #757575 | #1f1e1b | 12.5px | 3.62 | FAIL | addpayment | div.ws__row > div.ws__d.ws__d--span > textarea#f-pnotes-main.pf-ta |

Disabled controls (dark) — 7 combinations (WCAG exempts disabled controls; ratio reported as found):

| Text | Background | Opacity | Ratio | Pages | Sample |
|---|---|---|---|---|---|
| #595b5f | #252320 | 0.4 | 2.30 | rooms | div.pager > div.pager-controls > button.pager-btn |
| #56585c | #1f1e1b | 0.4 | 2.34 | students,payments,cancellations,former | div.stu-foot > div.stu-pager > button |
| #595b5f | #252320 | 0.4 | 2.30 | expenses | div.exp-foot > div.exp-pager > button |
| #64676d | #1f1e1b | 0.5 | 2.94 | activitylog,backup,users,settings | div.al-foot > div.al-pager > button.set-btn |
| #51504e | #353532 | 0.45 | 1.53 | backup,settings | div.set-head > div.set-head__end > button.set-tog |
| #334a8a | #4e7dff | 0.5 | 2.29 | settings | div.set-head > div.set-head__end > button#hi-save.set-btn.set-btn--go |
| #668fff | #4e7dff | 0.45 | 1.22 | settings | div.set-row.is-locked > div.set-row__c > button.set-tog.is-on |

Borders against their background (dark) — 31 combinations; 21 below 3:1. Decorative dividers are included (WCAG 1.4.11 applies only where the border identifies a control or state — not determinable statically).

| Border | Background | Ratio | Elements | Pages | Sample |
|---|---|---|---|---|---|
| #1f1e1b | #1f1e1b | 1.00 | 18 | dashboard,rooms,students | div > button#hdr-bell.hdr-btn > span#hdr-bell-count.hdr-btn__count |
| #35322d | #353532 | 1.04 | 3 | backup,settings | div.set-head__end > button.set-tog > span.set-tog__k |
| #35322d | #373633 | 1.06 | 3 | issues | td > div.lk-acts > button.lk-act.lk-act--icon |
| #35322d | #2b2a28 | 1.12 | 1 | dashboard | div.dash-sec__head > div.trend-range > button.trend-range__b.is-on |
| #dbeafe | #f4f6f8 | 1.13 | 1 | login | div#login-card > aside.lg-side > span.lg-badge |
| #e7eaee | #f7f9fb | 1.14 | 1 | login | body.has-titlebar.hz-tb-autohide > div#login-screen > div#login-card |
| #e7eaee | #ffffff | 1.21 | 2 | login | section.lg-form > div.lg-field > input#login-input.lg-in |
| #262524 | #131211 | 1.22 | 57 | dashboard,rooms,students | aside#sidebar > div.sb-logo > button#sidebar-collapse-btn.sidebar-collapse-btn |
| #2a2a28 | #181715 | 1.25 | 161 | dashboard,rooms,students | div#content > div.dash-kpi-grid > div.dsh-card.dh-blue |
| #31302d | #1f1e1b | 1.26 | 201 | dashboard,rooms,students | div.dash-kpi-grid > div.dsh-card.dsh-card--click > div.dash-kpi__split |
| #363532 | #252320 | 1.28 | 1 | backup | div.set-card > div#bk-drop.bk-drop > div.bk-drop__i |
| #32394a | #21273a | 1.29 | 6 | support | div.sup-hero > div.sup-hero__b > div.sup-hero__find |
| #3e4041 | #2d2f30 | 1.29 | 11 | students,payments,cancellations | tr > td > div.stu-room |
| #35322d | #1f1e1b | 1.31 | 303 | dashboard,rooms,students | header#header > div#hdr-search-wrap > div.hdr-find |
| #35322d | #181715 | 1.40 | 12 | reports,activitylog,users | div#content > div.rpt-bar > select.rpt-mo |
| #2c3948 | #1f1e1b | 1.42 | 1 | addstudent | div.asf-rec > div.asf-rec__r > span.badge.badge-blue |
| #cbd5e1 | #ffffff | 1.48 | 1 | login | div.lg-meta > label.lg-remember > span.lg-check |
| #2f4053 | #1f1e1b | 1.57 | 5 | dashboard | tr.dash-rp-row > td > span.badge.badge-gold |
| #52443a | #1f1e1b | 1.78 | 1 | activitylog | div.al-filters > div.al-search > input#al-q.form-control |
| #294e3d | #1f1e1b | 1.79 | 1 | dashboard | tr.dash-rp-row > td > span.badge.badge-green |
| #525252 | #131211 | 2.39 | 17 | dashboard,rooms,students | aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active |
| #3b82f6 | #ffffff | 3.68 | 1 | login | section.lg-form > div.lg-field > input#login-user.lg-in |
| #4e7dff | #252422 | 4.21 | 1 | reports | div#content > div.rpt-tabs > button.rpt-tab.is-on |
| #4e7dff | #1f1e1b | 4.53 | 53 | rooms,students,payments | div.rms-panel > div.rms-tools > select.rms-select.is-set |
| #4e7dff | #181715 | 4.86 | 2 | reports,users | div.rpt-bar > div.rpt-bar__end > button.rpt-print |
| #d9a441 | #2b2a28 | 6.38 | 1 | rooms | div.rms-card > div.rms-card__pic.dh-green > span.rms-card__vac |
| #7ba0ff | #1f1e1b | 6.60 | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue |
| #7ba0ff | #181715 | 7.09 | 1 | rooms | div.pager > div.pager-controls > button.pager-btn.active |
| #3fbf83 | #1f1e1b | 7.14 | 1 | payments | div.pay-tools > div.pay-tools__end > button.pay-btn.pay-btn--hue |
| #d9a441 | #1f1e1b | 7.41 | 1 | rooms | div.rms-card__body.dh-green > div.rms-occ > span.rms-occ__chip.is-vacating |
| #f59e0b | #1f1e1b | 7.76 | 2 | rooms | div.rms-card__body.dh-green > div.rms-acts > button.rms-force |

### 3.3 Focus ring (light theme; first four Tab stops per page)

| Page | Focused element | outline (style width colour) | outline-offset | box-shadow | element background |
|---|---|---|---|---|---|
| dashboard | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| dashboard | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| dashboard | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| dashboard | button.btn.btn-primary | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(36, 81, 214) |
| rooms | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| rooms | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| rooms | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| rooms | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| students | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| students | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| students | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| students | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| payments | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| payments | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| payments | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| payments | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| expenses | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| expenses | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| expenses | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| expenses | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| cancellations | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| cancellations | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| cancellations | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(248, 248, 248) |
| cancellations | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| former | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| former | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| former | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(238, 238, 238) |
| former | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| reports | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| reports | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| reports | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| reports | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| issues | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| issues | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| issues | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(197, 197, 196) |
| issues | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(253, 253, 253) |
| activitylog | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| activitylog | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| activitylog | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(238, 238, 238) |
| activitylog | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| backup | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| backup | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| backup | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(253, 253, 253) |
| backup | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| users | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| users | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| users | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(222, 222, 222) |
| users | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(253, 253, 253) |
| settings | div.set-tab | solid 2px rgb(36, 81, 214) | -3px | none | rgba(0, 0, 0, 0) |
| settings | div.set-tab | solid 2px rgb(36, 81, 214) | -3px | none | rgba(0, 0, 0, 0) |
| settings | div.set-tab | solid 2px rgb(36, 81, 214) | -3px | none | rgba(0, 0, 0, 0) |
| settings | div.set-tab | solid 2px rgb(36, 81, 214) | -3px | none | rgba(0, 0, 0, 0) |
| support | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| support | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| support | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(197, 197, 196) |
| support | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(248, 248, 248) |
| archive | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| archive | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| archive | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| archive | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| maintenance | button.btn.btn-primary | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(63, 110, 241) |
| maintenance | button.iss-tab | solid 2px rgb(36, 81, 214) | -2px | none | rgba(247, 248, 251, 0.863) |
| maintenance | button.iss-tab.is-on | solid 2px rgb(36, 81, 214) | -2px | none | rgba(37, 82, 215, 0.08) |
| maintenance | button.iss-tab | solid 2px rgb(36, 81, 214) | -2px | none | rgb(247, 248, 251) |
| complaints | button.iss-tab | solid 2px rgb(36, 81, 214) | -2px | none | rgba(255, 255, 255, 0.055) |
| complaints | button.iss-tab | solid 2px rgb(36, 81, 214) | -2px | none | rgba(247, 248, 251, 0.757) |
| complaints | button.iss-tab.is-on | solid 2px rgb(36, 81, 214) | -2px | none | rgba(39, 84, 216, 0.082) |
| complaints | input.lk-sin | none 3px rgb(23, 35, 58) | 2px | none | rgba(0, 0, 0, 0) |
| addstudent | button.hdr-back | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| addstudent | input | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.08) 0px 0px 0px 3px | rgb(255, 255, 255) |
| addstudent | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| addstudent | button.hdr-btn | solid 2px rgba(59, 130, 246, 0.7) | 2px | none | rgb(255, 255, 255) |
| addpayment | button.tsk-back | solid 2px rgb(36, 81, 214) | 2px | none | rgb(109, 108, 106) |
| addpayment | a | solid 2px rgb(36, 81, 214) | 2px | none | rgba(0, 0, 0, 0) |
| addpayment | input.pf-in | none 3px rgb(23, 35, 58) | 2px | rgba(36, 81, 214, 0.047) 0px 0px 0px 1.72752px | rgb(255, 255, 255) |
| addpayment | button.ws__seg-b.is-on | solid 2px rgb(36, 81, 214) | 2px | none | rgb(36, 81, 214) |

Ring-vs-adjacent ratio: the ring colour is in the table; the adjacent colour is the element background and the page ground behind it. A ring of `none 0px` with no box-shadow is a focus state with no visible indicator.

## 4. Spacing

7554 side values (shorthand expanded to sides) from 3217 declarations; 68 distinct values.

| Value | Count | Locations |
|---|---|---|
| 0 | 1003 | renderer/activitylog.css:70,70,110 (+5); renderer/archive.css:23,23,31 (+9); renderer/backup.css:86,101,101 (+11); +46 files |
| 12px | 736 | renderer/activitylog.css:18,18,53 (+8); renderer/archive.css:13,13,13 (+17); renderer/backup.css:41,41,45 (+5); +35 files |
| 10px | 697 | renderer/archive.css:11,11,86 (+9); renderer/backup.css:24,24,62 (+2); renderer/cancellations.css:36,36,51 (+14); +35 files |
| 8px | 591 | renderer/activitylog.css:70,70,109 (+2); renderer/archive.css:17,17; renderer/backup.css:116,122,122; +35 files |
| 14px | 562 | renderer/activitylog.css:19,54,85 (+2); renderer/archive.css:41,41,54 (+14); renderer/backup.css:13,13,14 (+7); +30 files |
| 6px | 374 | renderer/archive.css:56,147,177 (+3); renderer/chrome.css:230,489,489 (+7); renderer/dashboard.css:112,112,155 (+78); +33 files |
| 4px | 359 | renderer/activitylog.css:37,44,44; renderer/archive.css:19,19,19 (+11); renderer/backup.css:117; +27 files |
| 9px | 349 | renderer/activitylog.css:10,10,72 (+5); renderer/archive.css:104,104; renderer/backup.css:67,67,93 (+2); +27 files |
| 16px | 342 | renderer/activitylog.css:23,23,146; renderer/archive.css:13,13,54 (+7); renderer/chrome.css:155,155,161 (+3); +28 files |
| 2px | 290 | renderer/archive.css:135; renderer/backup.css:33,126; renderer/cancellations.css:59,83,122 (+8); +26 files |
| 11px | 272 | renderer/archive.css:139,139; renderer/backup.css:23,23,68 (+3); renderer/cancellations.css:88,88,139 (+3); +24 files |
| 7px | 269 | renderer/activitylog.css:68,144,144; renderer/archive.css:42,42,72 (+4); renderer/cancellations.css:37,37,102 (+1); +24 files |
| 5px | 266 | renderer/activitylog.css:31,31,59 (+1); renderer/archive.css:205,205; renderer/backup.css:124,124; +25 files |
| 3px | 213 | renderer/activitylog.css:33,98,141; renderer/archive.css:60,142,185 (+1); renderer/backup.css:17,59,91; +26 files |
| 13px | 189 | renderer/activitylog.css:22,22; renderer/archive.css:23,23,31 (+2); renderer/backup.css:68,68; +23 files |
| 20px | 166 | renderer/archive.css:124,124; renderer/chrome.css:356,356,641 (+6); renderer/dashboard.css:183,183,3156 (+1); +19 files |
| 18px | 157 | renderer/activitylog.css:133,133,133 (+5); renderer/archive.css:210,210; renderer/backup.css:79,79; +22 files |
| auto | 145 | renderer/activitylog.css:10; renderer/archive.css:17,91,119 (+1); renderer/backup.css:22,86,86; +25 files |
| 1px | 116 | renderer/activitylog.css:97; renderer/archive.css:78,78; renderer/backup.css:72,108,111; +25 files |
| 24px | 67 | renderer/backup.css:114,114; renderer/forms.css:59,59,59 (+1); renderer/login.css:196,292; +7 files |
| 15px | 61 | renderer/activitylog.css:23,23; renderer/backup.css:24,24; renderer/cancellations.css:70,70; +15 files |
| 22px | 54 | renderer/chrome.css:551,551; renderer/dashboard.css:521,521; renderer/login.css:231,280; +13 files |
| 26px | 35 | renderer/backup.css:79,79; renderer/dashboard.css:1264,1264; renderer/expenses.css:156; +9 files |
| 28px | 28 | renderer/login.css:33,33,33 (+4); renderer/onboarding.css:61,61,67 (+3); renderer/rooms.css:79; +5 files |
| 32px | 19 | renderer/activitylog.css:89; renderer/archive.css:31; renderer/expenses.css:68; +7 files |
| 46px | 17 | renderer/login.css:66,66,66 (+4); renderer/settings.css:155; renderer/style.css:3141; +1 files |
| 40px | 16 | renderer/login.css:215,292,292; renderer/pw-eye.css:21; renderer/style.css:2899; +3 files |
| 44px | 16 | renderer/archive.css:124,124; renderer/chrome.css:155; renderer/dashboard.css:3156,3156; +6 files |
| var(--space-2) | 15 | renderer/components.css:21,21,74 (+12) |
| 30px | 12 | renderer/dashboard.css:1416,1416; renderer/forms.css:218; renderer/login.css:287,292; +5 files |
| 36px | 10 | renderer/payments.css:304; renderer/students.css:305; renderer/style.css:1587,2659,2659 (+3); +1 files |
| var(--space-5) | 10 | renderer/components.css:160,160,160 (+7) |
| -1px | 8 | renderer/dashboard.css:2600,2600,2600 (+1); renderer/login.css:169,169,169 (+1) |
| var(--space-3) | 7 | renderer/components.css:144,144,213 (+4) |
| 48px | 6 | renderer/listkit.css:185,185; renderer/src/modules/nav.js:484,484,493 (+1) |
| var(--sec-pad-x) | 6 | renderer/dashboard.css:108,108,298 (+3) |
| -24px | 5 | renderer/style.css:1799,1799; renderer/src/modules/dashboard.js:2743,2743,2743 |
| 34px | 5 | renderer/archive.css:210,210; renderer/reports.css:152,152; renderer/rooms.css:313 |
| 56px | 5 | renderer/style.css:2075,2075; renderer/app.js:84; renderer/src/modules/archive.js:180,180 |
| -2px | 4 | renderer/dashboard.css:1417,1881; renderer/listkit.css:308; renderer/style.css:1509 |
| 10mm | 4 | renderer/src/modules/dashboard.js:2415,2415,2415 (+1) |
| 52px | 4 | renderer/expenses.css:143,143; renderer/rooms.css:235,235 |
| var | 4 | renderer/src/export/engine.js:522,522,522 (+1) |
| var(--space-4) | 4 | renderer/components.css:75,75,254 (+1) |
| -6px | 3 | renderer/dashboard.css:3133; renderer/expenses.css:261; renderer/payments.css:1003 |
| -16px | 2 | renderer/dashboard.css:463,463 |
| -22px | 2 | renderer/license.html:288,288 |
| -46px | 2 | renderer/license.html:219,219 |
| 1.5px | 2 | renderer/src/modules/dashboard.js:2514,2514 |
| 17px | 2 | renderer/whatsapp.css:55,55 |
| 4.5px | 2 | renderer/src/export/engine.js:610,610 |
| 7mm | 2 | renderer/src/modules/students.js:4987,4987 |
| 9mm | 2 | renderer/src/modules/students.js:4987,4987 |
| var(--space-1) | 2 | renderer/components.css:20,20 |
| var(--space-6) | 2 | renderer/components.css:144,144 |
| -14px | 1 | renderer/dashboard.css:463 |
| -20px | 1 | renderer/style.css:1799 |
| -4px | 1 | renderer/dashboard.css:2082 |
| * | 1 | renderer/dashboard.css:401 |
| 12vh | 1 | renderer/style.css:5091 |
| calc(-1 | 1 | renderer/dashboard.css:401 |
| calc(var(--titlebar-h) + 16px) | 1 | renderer/license.html:308 |
| calc(var(--titlebar-h) + 26px) | 1 | renderer/license.html:346 |
| var(--sec-pad-x,16px)) | 1 | renderer/dashboard.css:401 |
| var(--sidebar-w-collapsed) | 1 | renderer/style.css:4870 |
| var(--sidebar-w) | 1 | renderer/style.css:623 |
| var(--titlebar-offset) | 1 | renderer/titlebar.css:105 |
| w+'px | 1 | renderer/src/modules/theme.js:61 |

Base-unit check on 6305 positive whole-pixel side values: greatest common divisor = 1px. Share divisible by: 2px 72%, 3px 31%, 4px 38%, 5px 19%, 6px 22%, 8px 17%, 10px 14%, 12px 13%, 16px 6%. Non-integer px side values: 4. Non-px side values (rem/em/%/var/calc/auto): 213.

Off-scale one-off values (used 1–2 times): 23

| Value | Count | Locations |
|---|---|---|
| -16px | 2 | renderer/dashboard.css:463,463 |
| -22px | 2 | renderer/license.html:288,288 |
| -46px | 2 | renderer/license.html:219,219 |
| 1.5px | 2 | renderer/src/modules/dashboard.js:2514,2514 |
| 17px | 2 | renderer/whatsapp.css:55,55 |
| 4.5px | 2 | renderer/src/export/engine.js:610,610 |
| 7mm | 2 | renderer/src/modules/students.js:4987,4987 |
| 9mm | 2 | renderer/src/modules/students.js:4987,4987 |
| var(--space-1) | 2 | renderer/components.css:20,20 |
| var(--space-6) | 2 | renderer/components.css:144,144 |
| -14px | 1 | renderer/dashboard.css:463 |
| -20px | 1 | renderer/style.css:1799 |
| -4px | 1 | renderer/dashboard.css:2082 |
| * | 1 | renderer/dashboard.css:401 |
| 12vh | 1 | renderer/style.css:5091 |
| calc(-1 | 1 | renderer/dashboard.css:401 |
| calc(var(--titlebar-h) + 16px) | 1 | renderer/license.html:308 |
| calc(var(--titlebar-h) + 26px) | 1 | renderer/license.html:346 |
| var(--sec-pad-x,16px)) | 1 | renderer/dashboard.css:401 |
| var(--sidebar-w-collapsed) | 1 | renderer/style.css:4870 |
| var(--sidebar-w) | 1 | renderer/style.css:623 |
| var(--titlebar-offset) | 1 | renderer/titlebar.css:105 |
| w+'px | 1 | renderer/src/modules/theme.js:61 |

## 5. Size, layout and density

### 5.1 Fixed pixel sizes — 1288 declarations with a px value

| Property | Value | Count | Locations |
|---|---|---|---|
| height | 32px | 40 | renderer/activitylog.css:89; renderer/archive.css:23; renderer/backup.css:28; +13 files |
| height | 34px | 37 | renderer/archive.css:71; renderer/dashboard.css:261; renderer/expenses.css:26,156; +13 files |
| height | 30px | 33 | renderer/activitylog.css:110; renderer/cancellations.css:215; renderer/chrome.css:493,546,723; +15 files |
| height | 26px | 29 | renderer/cancellations.css:240; renderer/dashboard.css:126,434,569 (+5); renderer/forms.css:460; +9 files |
| height | 14px | 25 | renderer/dashboard.css:453,1211,1505 (+4); renderer/forms.css:503; renderer/listkit.css:340,392; +8 files |
| width | 14px | 25 | renderer/dashboard.css:137,453,1211 (+5); renderer/forms.css:503; renderer/listkit.css:340,392; +7 files |
| width | 26px | 25 | renderer/cancellations.css:240; renderer/chrome.css:493; renderer/dashboard.css:126,434,569 (+3); +10 files |
| width | 30px | 25 | renderer/activitylog.css:110; renderer/cancellations.css:215; renderer/chrome.css:546,723; +14 files |
| height | 28px | 24 | renderer/chrome.css:650; renderer/dashboard.css:829,1205,1388; renderer/former.css:103; +7 files |
| width | 32px | 23 | renderer/backup.css:28; renderer/dashboard.css:234,874; renderer/issues.css:104; +12 files |
| height | 38px | 22 | renderer/archive.css:31,41; renderer/backup.css:50; renderer/chrome.css:165; +10 files |
| height | 40px | 22 | renderer/activitylog.css:136; renderer/chrome.css:426,464,481 (+1); renderer/dashboard.css:71; +9 files |
| height | 13px | 20 | renderer/dashboard.css:132,865,1073 (+3); renderer/settings.css:817; renderer/students.css:498,756,767 (+3); +6 files |
| width | 13px | 20 | renderer/dashboard.css:132,865,1073 (+3); renderer/settings.css:817; renderer/students.css:498,756,767 (+3); +5 files |
| height | 12px | 19 | renderer/activitylog.css:47; renderer/dashboard.css:814,1109,1391 (+5); renderer/former.css:22,92; +6 files |
| width | 12px | 19 | renderer/activitylog.css:47; renderer/dashboard.css:814,1109,1391 (+5); renderer/former.css:22,92; +6 files |
| width | 28px | 19 | renderer/chrome.css:650; renderer/dashboard.css:829,1205,2999; renderer/former.css:103; +7 files |
| width | 34px | 18 | renderer/dashboard.css:261; renderer/expenses.css:26; renderer/forms.css:140; +9 files |
| height | 15px | 17 | renderer/dashboard.css:522,1153; renderer/forms.css:302,464; renderer/payments.css:112,149; +5 files |
| height | 6px | 17 | renderer/chrome.css:675,703; renderer/dashboard.css:83,170,550 (+5); renderer/former.css:40; +4 files |
| width | 15px | 17 | renderer/dashboard.css:522,1153; renderer/forms.css:302,464; renderer/payments.css:112,149; +5 files |
| width | 36px | 16 | renderer/chrome.css:326; renderer/components.css:173; renderer/dashboard.css:873; +8 files |
| height | 18px | 15 | renderer/chrome.css:285; renderer/dashboard.css:474,774,1114; renderer/expenses.css:30; +7 files |
| height | 22px | 15 | renderer/dashboard.css:813,998,1197 (+3); renderer/forms.css:257; renderer/payments.css:1512; +6 files |
| height | 36px | 15 | renderer/chrome.css:326; renderer/components.css:174; renderer/dashboard.css:87,92; +6 files |
| height | 42px | 15 | renderer/activitylog.css:27; renderer/cancellations.css:74; renderer/settings.css:81,144,163 (+3); +3 files |
| height | 44px | 15 | renderer/dashboard.css:76,310; renderer/listkit.css:53; renderer/rooms.css:254,303,323 (+1); +5 files |
| height | 24px | 14 | renderer/chrome.css:197,669; renderer/dashboard.css:864,1050,2090; renderer/listkit.css:391; +7 files |
| width | 38px | 14 | renderer/backup.css:50; renderer/chrome.css:165; renderer/dashboard.css:470; +5 files |
| width | 22px | 13 | renderer/dashboard.css:813,2503,2663; renderer/forms.css:257; renderer/payments.css:1512; +6 files |
| width | 44px | 13 | renderer/dashboard.css:76,246,310; renderer/listkit.css:53; renderer/rooms.css:254,291; +5 files |
| height | 11px | 12 | renderer/activitylog.css:42,103; renderer/dashboard.css:64,1003,1088 (+2); renderer/listkit.css:315; +3 files |
| height | 16px | 12 | renderer/cancellations.css:122; renderer/dashboard.css:2262; renderer/pw-eye.css:12; +5 files |
| height | 3px | 12 | renderer/components.css:217; renderer/dashboard.css:137; renderer/listkit.css:30; +6 files |
| height | 8px | 12 | renderer/activitylog.css:75; renderer/archive.css:206; renderer/dashboard.css:1200,1435; +4 files |
| width | 11px | 12 | renderer/activitylog.css:42,103; renderer/dashboard.css:64,1003,1088 (+2); renderer/listkit.css:315; +3 files |
| width | 16px | 12 | renderer/cancellations.css:122; renderer/dashboard.css:2262; renderer/pw-eye.css:12; +5 files |
| height | 1px | 11 | renderer/chrome.css:531; renderer/listkit.css:345; renderer/login.css:169; +5 files |
| height | 9px | 10 | renderer/dashboard.css:162,167,1290 (+1); renderer/reports.css:195,315; renderer/settings.css:981,1148; +1 files |
| width | 18px | 10 | renderer/chrome.css:285; renderer/dashboard.css:474,1114; renderer/expenses.css:30; +4 files |
| width | 24px | 10 | renderer/chrome.css:197; renderer/dashboard.css:864,1050; renderer/listkit.css:391; +5 files |
| width | 9px | 10 | renderer/dashboard.css:162,167,1290 (+1); renderer/reports.css:195,315; renderer/settings.css:981,1148; +1 files |
| height | 7px | 9 | renderer/dashboard.css:214,243,1908; renderer/reports.css:208; renderer/style.css:2354,4719; +1 files |
| width | 40px | 9 | renderer/activitylog.css:136; renderer/chrome.css:464; renderer/dashboard.css:71,172; +5 files |
| height | 20px | 8 | renderer/dashboard.css:75,1087,2054; renderer/listkit.css:307; renderer/rooms.css:349; +3 files |
| height | 5px | 8 | renderer/dashboard.css:318,334; renderer/payments.css:666,1331; renderer/rooms.css:172; +1 files |
| height | 10px | 7 | renderer/dashboard.css:675,683,1115 (+1); renderer/settings.css:317; renderer/students.css:1652; +1 files |
| height | 2px | 7 | renderer/style.css:1680,1689,1853 (+4) |
| height | 4px | 7 | renderer/payments.css:626; renderer/rooms.css:40; renderer/style.css:2679,4071,4793; +2 files |
| width | 10px | 7 | renderer/dashboard.css:683,1115,2462; renderer/forms.css:99; renderer/settings.css:317; +2 files |
| width | 20px | 7 | renderer/dashboard.css:75,1087,2054; renderer/listkit.css:307; renderer/rooms.css:349; +2 files |
| width | 46px | 7 | renderer/archive.css:129; renderer/backup.css:86; renderer/reports.css:292; +4 files |
| width | 6px | 7 | renderer/chrome.css:675,703; renderer/dashboard.css:1554; renderer/former.css:40; +3 files |
| width | 8px | 7 | renderer/archive.css:206; renderer/dashboard.css:1200; renderer/reports.css:206; +2 files |
| width | 5px | 6 | renderer/payments.css:666; renderer/rooms.css:172; renderer/style.css:595,829,2192 (+1) |
| width | 7px | 6 | renderer/dashboard.css:214; renderer/style.css:2354,4719; renderer/src/modules/dashboard.js:3540,3541,3542 |
| height | 21px | 5 | renderer/dashboard.css:77,311,2224 (+1); renderer/onboarding.css:40 |
| height | 46px | 5 | renderer/archive.css:129; renderer/backup.css:86; renderer/reports.css:292; +2 files |
| height | 52px | 5 | renderer/login.css:104; renderer/settings.css:67,842; renderer/license.html:319,320 |
| min-width | 140px | 5 | renderer/expenses.css:271; renderer/issues.css:64,198; renderer/payments.css:1574; +1 files |
| min-width | 150px | 5 | renderer/archive.css:31; renderer/expenses.css:68; renderer/listkit.css:65; +1 files |
| min-width | 200px | 5 | renderer/activitylog.css:87; renderer/style.css:1586,2345,3555; renderer/whatsapp.css:34 |
| min-width | 34px | 5 | renderer/listkit.css:206; renderer/payments.css:256,1331; renderer/students.css:220,631 |
| width | 150px | 5 | renderer/dashboard.css:345,853,1243; renderer/payments.css:1582; renderer/students.css:621 |
| width | 21px | 5 | renderer/dashboard.css:77,311,2224 (+1); renderer/onboarding.css:40 |
| width | 42px | 5 | renderer/activitylog.css:27; renderer/cancellations.css:74; renderer/settings.css:248,1238; +1 files |
| width | 96px | 5 | renderer/payments.css:519,1483; renderer/support.css:40; renderer/users.css:238; +1 files |
| height | 17px | 4 | renderer/chrome.css:471; renderer/forms.css:150; renderer/settings.css:1091; +1 files |
| max-width | 118px | 4 | renderer/dashboard.css:1636,1784,3048; renderer/students.css:1110 |
| max-width | 170px | 4 | renderer/activitylog.css:90; renderer/src/modules/cancellations.js:223; renderer/src/modules/settings.js:583,585 |
| max-width | 240px | 4 | renderer/dashboard.css:1415; renderer/payments.css:72,387; renderer/registers-center.css:81 |
| min-width | 18px | 4 | renderer/listkit.css:96; renderer/payments.css:102; renderer/students.css:99; +1 files |
| width | 1px | 4 | renderer/dashboard.css:210; renderer/login.css:169; renderer/students.css:1714; +1 files |
| width | 3px | 4 | renderer/chrome.css:813; renderer/style.css:1041,4288; renderer/whatsapp.css:102 |
| width | 4px | 4 | renderer/payments.css:626; renderer/style.css:4071; renderer/src/export/engine.js:634; +1 files |
| width | 76px | 4 | renderer/listkit.css:104; renderer/onboarding.css:141; renderer/students.css:374,1758 |
| width | 92px | 4 | renderer/dashboard.css:170; renderer/reports.css:24,213; renderer/settings.css:1170 |
| height | 150px | 3 | renderer/dashboard.css:345,853,1243 |
| height | 27px | 3 | renderer/issues.css:100; renderer/payments.css:527,536 |
| height | 76px | 3 | renderer/onboarding.css:141; renderer/students.css:374,1758 |
| height | 96px | 3 | renderer/support.css:40; renderer/users.css:238; renderer/license.html:85 |
| max-width | 460px | 3 | renderer/style.css:2731; renderer/users.css:161; renderer/src/modules/archive.js:183 |
| min-height | 15px | 3 | renderer/onboarding.css:88; renderer/payments.css:1006; renderer/students.css:804 |
| min-height | 16px | 3 | renderer/style.css:3209; renderer/src/license.js:117,118 |
| min-height | 64px | 3 | renderer/forms.css:219; renderer/rooms.css:394; renderer/students.css:1815 |
| min-width | 190px | 3 | renderer/chrome.css:405; renderer/settings.css:150; renderer/students.css:68 |
| width | 110px | 3 | renderer/style.css:2237; renderer/src/modules/settings.js:520,525 |
| width | 120px | 3 | renderer/style.css:1768; renderer/src/modules/students.js:4647; renderer/src/modules/dashboard.js:3127 |
| width | 140px | 3 | renderer/dashboard.css:223; renderer/reports.css:174; renderer/students.css:433 |
| width | 17px | 3 | renderer/forms.css:150; renderer/settings.css:1091; renderer/users.css:269 |
| width | 70px | 3 | renderer/dashboard.css:222,239; renderer/style.css:1781 |
| width | 84px | 3 | renderer/dashboard.css:334; renderer/issues.css:66; renderer/src/modules/students.js:3516 |
| height | 118px | 2 | renderer/dashboard.css:1636,3048 |
| height | 19px | 2 | renderer/chrome.css:272,298 |
| height | 48px | 2 | renderer/style.css:2076,3069 |
| height | 56px | 2 | renderer/listkit.css:186; renderer/settings.css:294 |
| height | 58px | 2 | renderer/license.html:159,188 |
| height | 80px | 2 | renderer/style.css:3855,3868 |
| height | 84px | 2 | renderer/activitylog.css:150; renderer/src/modules/students.js:3516 |
| max-height | 158px | 2 | renderer/dashboard.css:740,2483 |
| max-height | 200px | 2 | renderer/style.css:2211; renderer/src/modules/students.js:2769 |
| max-height | 236px | 2 | renderer/payments.css:310; renderer/students.css:340 |
| max-width | 1120px | 2 | renderer/login.css:54; renderer/style.css:1545 |
| max-width | 1180px | 2 | renderer/students.css:234; renderer/license.html:269 |
| max-width | 130px | 2 | renderer/dashboard.css:2071; renderer/settings.css:771 |
| max-width | 1420px | 2 | renderer/payments.css:332; renderer/students.css:593 |
| max-width | 150px | 2 | renderer/dashboard.css:853,1742 |
| max-width | 168px | 2 | renderer/dashboard.css:1524; renderer/payments.css:492 |
| max-width | 190px | 2 | renderer/former.css:26; renderer/listkit.css:353 |
| max-width | 200px | 2 | renderer/payments.css:1574; renderer/support.css:217 |
| max-width | 300px | 2 | renderer/activitylog.css:99; renderer/listkit.css:65 |
| max-width | 380px | 2 | renderer/chrome.css:594; renderer/expenses.css:54 |
| max-width | 420px | 2 | renderer/style.css:2892; renderer/license.html:99 |
| max-width | 600px | 2 | renderer/students.css:1235; renderer/style.css:1543 |
| max-width | 716px | 2 | renderer/license.html:75,283 |
| min-height | 112px | 2 | renderer/dashboard.css:2146,2435 |
| min-height | 120px | 2 | renderer/dashboard.css:922; renderer/login.css:247 |
| min-height | 136px | 2 | renderer/dashboard.css:1778,2145 |
| min-height | 152px | 2 | renderer/dashboard.css:1773,2144 |
| min-height | 2px | 2 | renderer/activitylog.css:65; renderer/archive.css:195 |
| min-height | 58px | 2 | renderer/payments.css:858; renderer/students.css:827 |
| min-height | 76px | 2 | renderer/dashboard.css:1106; renderer/settings.css:445 |
| min-height | 78px | 2 | renderer/dashboard.css:2436; renderer/students.css:295 |
| min-width | 132px | 2 | renderer/payments.css:83; renderer/students.css:1108 |
| min-width | 170px | 2 | renderer/expenses.css:54; renderer/settings.css:154 |
| min-width | 180px | 2 | renderer/cancellations.css:130; renderer/students.css:380 |
| min-width | 40px | 2 | renderer/dashboard.css:1809; renderer/reports.css:208 |
| min-width | 62px | 2 | renderer/chrome.css:411; renderer/dashboard.css:1466 |
| min-width | 74px | 2 | renderer/cancellations.css:41; renderer/dashboard.css:555 |
| width | 104px | 2 | renderer/reports.css:207; renderer/users.css:218 |
| width | 112px | 2 | renderer/payments.css:1578; renderer/students.css:243 |
| width | 118px | 2 | renderer/dashboard.css:1636,3048 |
| width | 130px | 2 | renderer/dashboard.css:2071; renderer/license-settings.html:130 |
| width | 190px | 2 | renderer/chrome.css:405; renderer/students.css:250 |
| width | 48px | 2 | renderer/style.css:2076,3069 |
| width | 50px | 2 | renderer/dashboard.css:867,876 |
| width | 52px | 2 | renderer/settings.css:67,842 |
| width | 54px | 2 | renderer/login.css:70; renderer/license.html:109 |
| width | 56px | 2 | renderer/listkit.css:186; renderer/settings.css:294 |
| width | 62px | 2 | renderer/chrome.css:411; renderer/settings.css:1134 |
| width | 64px | 2 | renderer/dashboard.css:169; renderer/license.html:310 |
| width | 72px | 2 | renderer/issues.css:60; renderer/style.css:2950 |
| height | 108px | 1 | renderer/activitylog.css:59 |
| height | 112px | 1 | renderer/rooms.css:126 |
| height | 120px | 1 | renderer/style.css:1727 |
| height | 128px | 1 | renderer/students.css:243 |
| height | 130px | 1 | renderer/dashboard.css:2071 |
| height | 132px | 1 | renderer/archive.css:178 |
| height | 140px | 1 | renderer/reports.css:174 |
| height | 168px | 1 | renderer/dashboard.css:3032 |
| height | 170px | 1 | renderer/dashboard.css:185 |
| height | 177px | 1 | renderer/dashboard.css:2950 |
| height | 180px | 1 | renderer/style.css:2333 |
| height | 198px | 1 | renderer/dashboard.css:353 |
| height | 2.5px | 1 | renderer/settings.css:57 |
| height | 200px | 1 | renderer/dashboard.css:3031 |
| height | 23px | 1 | renderer/settings.css:1084 |
| height | 244px | 1 | renderer/dashboard.css:3030 |
| height | 250px | 1 | renderer/reports.css:149 |
| height | 254px | 1 | renderer/dashboard.css:2938 |
| height | 25px | 1 | renderer/expenses.css:222 |
| height | 288px | 1 | renderer/reports.css:316 |
| height | 29px | 1 | renderer/students.css:504 |
| height | 300px | 1 | renderer/style.css:2881 |
| height | 31px | 1 | renderer/dashboard.css:337 |
| height | 33px | 1 | renderer/expenses.css:165 |
| height | 400px | 1 | renderer/style.css:2874 |
| height | 460px | 1 | renderer/license.html:68 |
| height | 500px | 1 | renderer/style.css:2867 |
| height | 50px | 1 | renderer/chrome.css:639 |
| height | 520px | 1 | renderer/license.html:64 |
| height | 54px | 1 | renderer/login.css:150 |
| height | 60px | 1 | renderer/login.css:70 |
| height | 62px | 1 | renderer/settings.css:1134 |
| height | 64px | 1 | renderer/license.html:310 |
| height | 68px | 1 | renderer/src/license.js:95 |
| height | 72px | 1 | renderer/style.css:2950 |
| height | 92px | 1 | renderer/settings.css:1170 |
| max-height | 104px | 1 | renderer/dashboard.css:154 |
| max-height | 108px | 1 | renderer/dashboard.css:1095 |
| max-height | 112px | 1 | renderer/dashboard.css:2435 |
| max-height | 118px | 1 | renderer/dashboard.css:2485 |
| max-height | 120px | 1 | renderer/dashboard.css:3110 |
| max-height | 132px | 1 | renderer/dashboard.css:773 |
| max-height | 139px | 1 | renderer/dashboard.css:3109 |
| max-height | 140px | 1 | renderer/dashboard.css:354 |
| max-height | 146px | 1 | renderer/dashboard.css:2484 |
| max-height | 148px | 1 | renderer/dashboard.css:2555 |
| max-height | 160px | 1 | renderer/settings.css:1154 |
| max-height | 167px | 1 | renderer/dashboard.css:2431 |
| max-height | 180px | 1 | renderer/src/modules/settings.js:3012 |
| max-height | 190px | 1 | renderer/cancellations.css:33 |
| max-height | 210px | 1 | renderer/payments.css:773 |
| max-height | 232px | 1 | renderer/cancellations.css:203 |
| max-height | 240px | 1 | renderer/login.css:247 |
| max-height | 260px | 1 | renderer/settings.css:1198 |
| max-height | 288px | 1 | renderer/src/modules/dashboard.js:1421 |
| max-height | 300px | 1 | renderer/src/modules/settings.js:178 |
| max-height | 340px | 1 | renderer/src/modules/settings.js:3496 |
| max-height | 34px | 1 | renderer/src/export/engine.js:540 |
| max-height | 400px | 1 | renderer/src/modules/dashboard.js:2746 |
| max-height | 420px | 1 | renderer/index.html:707 |
| max-height | 76px | 1 | renderer/dashboard.css:801 |
| max-height | 78px | 1 | renderer/dashboard.css:2436 |
| max-height | 82px | 1 | renderer/dashboard.css:1112 |
| max-height | 92px | 1 | renderer/dashboard.css:2489 |
| max-height | calc(100dvh - 40px) | 1 | renderer/forms.css:124 |
| max-height | calc(100vh - 120px) | 1 | renderer/chrome.css:518 |
| max-height | calc(100vh - 340px) | 1 | renderer/users.css:75 |
| max-height | calc(94vh - 300px) | 1 | renderer/users.css:192 |
| max-height | min(56vh, 520px) | 1 | renderer/dashboard.css:3152 |
| max-width | 100px | 1 | renderer/issues.css:201 |
| max-width | 104px | 1 | renderer/settings.css:732 |
| max-width | 110px | 1 | renderer/src/export/engine.js:540 |
| max-width | 112px | 1 | renderer/issues.css:106 |
| max-width | 116px | 1 | renderer/dashboard.css:1792 |
| max-width | 1360px | 1 | renderer/style.css:1546 |
| max-width | 14px | 1 | renderer/archive.css:193 |
| max-width | 210px | 1 | renderer/payments.css:1052 |
| max-width | 220px | 1 | renderer/settings.css:1154 |
| max-width | 250px | 1 | renderer/rooms.css:54 |
| max-width | 280px | 1 | renderer/app.js:90 |
| max-width | 320px | 1 | renderer/students.css:1795 |
| max-width | 340px | 1 | renderer/issues.css:144 |
| max-width | 360px | 1 | renderer/users.css:183 |
| max-width | 480px | 1 | renderer/login.css:278 |
| max-width | 520px | 1 | renderer/settings.css:235 |
| max-width | 560px | 1 | renderer/support.css:46 |
| max-width | 660px | 1 | renderer/license-settings.html:79 |
| max-width | 74px | 1 | renderer/users.css:243 |
| max-width | 860px | 1 | renderer/style.css:1544 |
| max-width | 880px | 1 | renderer/onboarding.css:17 |
| max-width | 92px | 1 | renderer/reports.css:185 |
| max-width | 940px | 1 | renderer/style.css:2490 |
| max-width | calc(100vw - 32px) | 1 | renderer/app.js:89 |
| max-width | min(100%, 400px) | 1 | renderer/payments.css:436 |
| max-width | min(46%, 420px) | 1 | renderer/titlebar.css:156 |
| max-width | min(560px, calc(100vw - 32px)) | 1 | renderer/style.css:2038 |
| min-height | 118px | 1 | renderer/dashboard.css:1780 |
| min-height | 145px | 1 | renderer/dashboard.css:1938 |
| min-height | 146px | 1 | renderer/dashboard.css:2535 |
| min-height | 150px | 1 | renderer/dashboard.css:1320 |
| min-height | 167px | 1 | renderer/dashboard.css:2431 |
| min-height | 168px | 1 | renderer/dashboard.css:2123 |
| min-height | 18px | 1 | renderer/settings.css:1001 |
| min-height | 34px | 1 | renderer/dashboard.css:1107 |
| min-height | 36px | 1 | renderer/forms.css:215 |
| min-height | 38px | 1 | renderer/forms.css:333 |
| min-height | 420px | 1 | renderer/settings.css:542 |
| min-height | 56px | 1 | renderer/chrome.css:689 |
| min-height | 80px | 1 | renderer/style.css:1499 |
| min-height | 81px | 1 | renderer/dashboard.css:2051 |
| min-height | 82px | 1 | renderer/rooms.css:309 |
| min-height | 88px | 1 | renderer/dashboard.css:2270 |
| min-height | 96px | 1 | renderer/dashboard.css:1071 |
| min-width | 1000px | 1 | renderer/issues.css:57 |
| min-width | 100px | 1 | renderer/style.css:2316 |
| min-width | 110px | 1 | renderer/src/receipt.js:307 |
| min-width | 112px | 1 | renderer/payments.css:1578 |
| min-width | 118px | 1 | renderer/listkit.css:76 |
| min-width | 120px | 1 | renderer/former.css:61 |
| min-width | 130px | 1 | renderer/style.css:2372 |
| min-width | 152px | 1 | renderer/settings.css:188 |
| min-width | 160px | 1 | renderer/rooms.css:54 |
| min-width | 174px | 1 | renderer/dashboard.css:442 |
| min-width | 17px | 1 | renderer/chrome.css:471 |
| min-width | 186px | 1 | renderer/listkit.css:329 |
| min-width | 19px | 1 | renderer/chrome.css:298 |
| min-width | 210px | 1 | renderer/src/modules/dashboard.js:1209 |
| min-width | 216px | 1 | renderer/chrome.css:503 |
| min-width | 224px | 1 | renderer/titlebar.css:73 |
| min-width | 230px | 1 | renderer/src/modules/students.js:3529 |
| min-width | 232px | 1 | renderer/listkit.css:260 |
| min-width | 240px | 1 | renderer/style.css:5168 |
| min-width | 24px | 1 | renderer/dashboard.css:550 |
| min-width | 250px | 1 | renderer/students.css:102 |
| min-width | 262px | 1 | renderer/payments.css:106 |
| min-width | 26px | 1 | renderer/dashboard.css:1442 |
| min-width | 32px | 1 | renderer/style.css:5042 |
| min-width | 33px | 1 | renderer/expenses.css:165 |
| min-width | 340px | 1 | renderer/issues.css:181 |
| min-width | 41px | 1 | renderer/dashboard.css:330 |
| min-width | 44px | 1 | renderer/dashboard.css:155 |
| min-width | 4px | 1 | renderer/archive.css:193 |
| min-width | 58px | 1 | renderer/students.css:902 |
| min-width | 78px | 1 | renderer/src/export/engine.js:557 |
| min-width | 84px | 1 | renderer/settings.css:736 |
| min-width | 860px | 1 | renderer/settings.css:115 |
| min-width | 8px | 1 | renderer/style.css:1742 |
| min-width | 92px | 1 | renderer/payments.css:1354 |
| min-width | 96px | 1 | renderer/support.css:278 |
| min-width | 980px | 1 | renderer/students.css:1138 |
| width | 144px | 1 | renderer/issues.css:73 |
| width | 148px | 1 | renderer/students.css:1778 |
| width | 170px | 1 | renderer/dashboard.css:185 |
| width | 19px | 1 | renderer/chrome.css:272 |
| width | 210px | 1 | renderer/chrome.css:419 |
| width | 220px | 1 | renderer/license-settings.html:280 |
| width | 230px | 1 | renderer/payments.css:510 |
| width | 25px | 1 | renderer/expenses.css:222 |
| width | 262px | 1 | renderer/license.html:235 |
| width | 27px | 1 | renderer/issues.css:100 |
| width | 280px | 1 | renderer/index.html:441 |
| width | 29px | 1 | renderer/students.css:504 |
| width | 300px | 1 | renderer/style.css:2881 |
| width | 31px | 1 | renderer/dashboard.css:337 |
| width | 400px | 1 | renderer/style.css:2874 |
| width | 460px | 1 | renderer/license.html:68 |
| width | 500px | 1 | renderer/style.css:2867 |
| width | 520px | 1 | renderer/license.html:64 |
| width | 68px | 1 | renderer/src/license.js:95 |
| width | 78px | 1 | renderer/reports.css:261 |
| width | 80px | 1 | renderer/style.css:3868 |
| width | 82px | 1 | renderer/reports.css:260 |
| width | 86px | 1 | renderer/dashboard.css:243 |
| width | 90px | 1 | renderer/dashboard.css:877 |
| width | field==='description'?'200px':'120px | 1 | renderer/src/modules/dashboard.js:3157 |
| width | min(1040px, calc(100vw - 32px)) | 1 | renderer/forms.css:122 |
| width | min(430px, 100%) | 1 | renderer/activitylog.css:127 |
| width | min(460px, 100vw) | 1 | renderer/users.css:161 |
| width | min(460px,calc(100vw - 32px)) | 1 | renderer/index.html:707 |
| width | min(560px, 92vw) | 1 | renderer/style.css:5094 |
| width | min(600px, 100vw) | 1 | renderer/students.css:1235 |
| width | min(920px, calc(100vw - 32px)) | 1 | renderer/forms.css:118 |

Flagged — width or min-width above 900px (the main window minWidth, main.js:1195): 2

| Property | Value | Selector | Location |
|---|---|---|---|
| min-width | 1000px | .iss-table | renderer/issues.css:57 |
| min-width | 980px | .stu-table | renderer/students.css:1138 |

`overflow: hidden|clip` declarations: 199 — renderer/activitylog.css:63,74,75; renderer/archive.css:84; renderer/cancellations.css:32,170,222 (+1); renderer/chrome.css:178,246,291 (+1); renderer/components.css:220,247; renderer/dashboard.css:65,83,168 (+26); renderer/expenses.css:23,32,39 (+1); renderer/former.css:26; renderer/forms.css:43,60,160 (+3); renderer/issues.css:19,106,147; +24 files.

### 5.2 Content max-widths — 88 declarations

| Value | Count | Locations |
|---|---|---|
| 100% | 10 | renderer/dashboard.css:1557,1560; renderer/expenses.css:287; renderer/rooms.css:166; +3 files |
| none | 7 | renderer/forms.css:119,123; renderer/issues.css:181; renderer/payments.css:438; +2 files |
| 118px | 4 | renderer/dashboard.css:1636,1784,3048; renderer/students.css:1110 |
| 170px | 4 | renderer/activitylog.css:90; renderer/src/modules/cancellations.js:223; renderer/src/modules/settings.js:583,585 |
| 240px | 4 | renderer/dashboard.css:1415; renderer/payments.css:72,387; renderer/registers-center.css:81 |
| 460px | 3 | renderer/style.css:2731; renderer/users.css:161; renderer/src/modules/archive.js:183 |
| 1120px | 2 | renderer/login.css:54; renderer/style.css:1545 |
| 1180px | 2 | renderer/students.css:234; renderer/license.html:269 |
| 130px | 2 | renderer/dashboard.css:2071; renderer/settings.css:771 |
| 1420px | 2 | renderer/payments.css:332; renderer/students.css:593 |
| 150px | 2 | renderer/dashboard.css:853,1742 |
| 168px | 2 | renderer/dashboard.css:1524; renderer/payments.css:492 |
| 190px | 2 | renderer/former.css:26; renderer/listkit.css:353 |
| 200px | 2 | renderer/payments.css:1574; renderer/support.css:217 |
| 300px | 2 | renderer/activitylog.css:99; renderer/listkit.css:65 |
| 380px | 2 | renderer/chrome.css:594; renderer/expenses.css:54 |
| 420px | 2 | renderer/style.css:2892; renderer/license.html:99 |
| 600px | 2 | renderer/students.css:1235; renderer/style.css:1543 |
| 716px | 2 | renderer/license.html:75,283 |
| 100px | 1 | renderer/issues.css:201 |
| 104px | 1 | renderer/settings.css:732 |
| 110px | 1 | renderer/src/export/engine.js:540 |
| 112px | 1 | renderer/issues.css:106 |
| 116px | 1 | renderer/dashboard.css:1792 |
| 1360px | 1 | renderer/style.css:1546 |
| 14px | 1 | renderer/archive.css:193 |
| 210px | 1 | renderer/payments.css:1052 |
| 220px | 1 | renderer/settings.css:1154 |
| 250px | 1 | renderer/rooms.css:54 |
| 280px | 1 | renderer/app.js:90 |
| 320px | 1 | renderer/students.css:1795 |
| 340px | 1 | renderer/issues.css:144 |
| 360px | 1 | renderer/users.css:183 |
| 44ch | 1 | renderer/login.css:228 |
| 480px | 1 | renderer/login.css:278 |
| 520px | 1 | renderer/settings.css:235 |
| 560px | 1 | renderer/support.css:46 |
| 62ch | 1 | renderer/support.css:36 |
| 660px | 1 | renderer/license-settings.html:79 |
| 74px | 1 | renderer/users.css:243 |
| 860px | 1 | renderer/style.css:1544 |
| 880px | 1 | renderer/onboarding.css:17 |
| 90vw | 1 | renderer/license-settings.html:229 |
| 92px | 1 | renderer/reports.css:185 |
| 940px | 1 | renderer/style.css:2490 |
| calc(100vw - 32px) | 1 | renderer/app.js:89 |
| min(100%, 400px) | 1 | renderer/payments.css:436 |
| min(46%, 420px) | 1 | renderer/titlebar.css:156 |
| min(560px, calc(100vw - 32px)) | 1 | renderer/style.css:2038 |

### 5.3 Tables as rendered (per page, light theme, 1366×768)

| Page | Table class | Body rows | First row height (px) | td padding | td font-size | th padding | th height | th font / weight / transform |
|---|---|---|---|---|---|---|---|---|
| dashboard | dash-rp | 6 | 53 | 11px 16px | 13.5px | 0px 16px 9px | 25 | 10px 600 uppercase |
| students | stu-table | 6 | 61 | 8px 0px 8px 8px | 12px | 8px 0px 8px 8px | 41 | 9.5px 700 uppercase |
| payments | pay-table | 6 | 92 | 11px 3px 11px 8px | 12.5px | 11px 3px 11px 8px | 42 | 10px 700 uppercase |
| expenses | exp-table | 1 | 52 | 11px 16px | 13px | 12px 16px | 40 | 10px 700 uppercase |
| cancellations | lk-table | 1 | 81 | 12px | 12.5px | 11px 12px | 38 | 10px 700 uppercase |
| former | lk-table | 1 | 188 | 12px | 12.5px | 11px 12px | 38 | 10px 700 uppercase |
| reports | rpt-tbl | 6 | 48 | 11px 12px | 12.5px | 10px 12px | 36 | 10px 700 uppercase |
| issues | lk-table iss-table | 2 | 71 | 10px 7px | 12.5px | 11px 7px | 38 | 10px 700 uppercase |
| activitylog | set-table al-table | 1 | 69 | 12px 14px | 11.5px | 12px 14px | 40 | 10px 700 uppercase |
| users | set-table usr-table | 1 | 64 | 12px 14px | 13.5px | 12px 14px | 40 | 10px 700 uppercase |
| archive | arc-table | 13 | 39 | 9px 12px | 13.5px | 10px 12px | 36 | 10px 700 uppercase |
| maintenance | lk-table iss-table | 1 | 70 | 10px 7px | 12.5px | 11px 7px | 38 | 10px 700 uppercase |
| complaints | lk-table iss-table | 1 | 70 | 10px 7px | 12.5px | 11px 7px | 38 | 10px 700 uppercase |

### 5.4 Form controls as rendered (per page, light theme)

| Page | Control | Classes | Height | Padding | Font-size | Radius | Label→field gap | Count |
|---|---|---|---|---|---|---|---|---|
| dashboard | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| rooms | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| rooms | input[text] | lk-sin | 15 | 0px | 12.5px | 0px | no label found | 1 |
| rooms | select[select-one] | rms-select | 34 | 0px 28px 0px 10px | 12.5px | 7px | no label found | 2 |
| rooms | select[select-one] | rms-select is-set | 34 | 0px 28px 0px 10px | 12.5px | 7px | no label found | 1 |
| students | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| students | input[text] | lk-sin | 14 | 0px | 11.5px | 0px | no label found | 1 |
| students | select[select-one] | stu-select is-set | 34 | 0px 28px 0px 10px | 12.5px | 7px | no label found | 1 |
| students | select[select-one] | stu-select | 34 | 0px 28px 0px 10px | 12.5px | 7px | no label found | 3 |
| students | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| payments | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| payments | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| payments | select[select-one] | pay-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 2 |
| payments | select[select-one] | pay-select pay-select--mo | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 1 |
| payments | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| expenses | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| expenses | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| expenses | select[select-one] | exp-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 2 |
| expenses | select[select-one] |  | 38 | 0px 6px 0px 0px | 13px | 0px | no label found | 1 |
| expenses | select[select-one] |  | 34 | 0px 26px 0px 11px | 12.5px | 9px | no label found | 1 |
| cancellations | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| cancellations | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| cancellations | select[select-one] | lk-select is-set | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 1 |
| cancellations | select[select-one] | lk-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 2 |
| cancellations | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| former | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| former | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| former | select[select-one] | lk-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 4 |
| former | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| reports | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| reports | select[select-one] | rpt-mo | 34 | 0px 30px 0px 12px | 12.5px | 10px | no label found | 1 |
| issues | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| issues | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| issues | select[select-one] | lk-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 5 |
| issues | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| activitylog | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| activitylog | input[text] | form-control | 32 | 10px 14px 10px 32px | 13.5px | 8px | no label found | 1 |
| activitylog | select[select-one] | set-sel | 32 | 0px 10px | 12.5px | 9px | no label found | 3 |
| activitylog | input[date] | set-sel | 32 | 0px 10px | 12.5px | 9px | no label found | 2 |
| backup | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| users | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| users | input[text] | lk-sin | 14 | 0px | 11.5px | 0px | no label found | 1 |
| users | select[select-one] | set-sel | 32 | 0px 10px | 12.5px | 9px | no label found | 3 |
| settings | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| settings | input[text] | form-control | 36 | 10px 14px | 13.5px | 0px | 7 | 7 |
| settings | select[select-one] | set-sel | 32 | 0px 10px | 12.5px | 9px | no label found | 1 |
| support | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| support | input[text] | sup-hero__in | 42 | 0px | 13px | 0px | no label found | 1 |
| support | select[select-one] | form-control | 36 | 10px 32px 10px 14px | 13.5px | 0px | 7 | 2 |
| support | input[text] | form-control | 36 | 10px 14px | 13.5px | 0px | 7 | 1 |
| support | textarea[textarea] | form-control | 84 | 10px 14px | 13.5px | 0px | 7 | 1 |
| archive | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| archive | select[select-one] | arc-select | 38 | 0px 32px 0px 13px | 13px | 11px | no label found | 1 |
| maintenance | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| maintenance | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| maintenance | select[select-one] | lk-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 5 |
| maintenance | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| complaints | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| complaints | input[text] | lk-sin | 16 | 0px | 13px | 0px | no label found | 1 |
| complaints | select[select-one] | lk-select | 40 | 0px 32px 0px 13px | 13px | 11px | no label found | 5 |
| complaints | select[select-one] |  | 32 | 0px 26px 0px 10px | 12.5px | 9px | no label found | 1 |
| addstudent | input[text] |  | 16 | 0px | 13px | 0px | no label found | 1 |
| addstudent | input[text] | sf-in | 42 | 0px 12px | 13px | 10px | 6 | 11 |
| addstudent | input[text] | sf-in | 42 | 0px 12px 0px 36px | 13px | 10px | 6 | 4 |
| addstudent | select[select-one] | sf-sel | 42 | 0px 32px 0px 12px | 13px | 10px | 6 | 5 |
| addstudent | input[text] | sf-in sf-in--ro | 42 | 0px 12px | 13px | 10px | 6 | 2 |
| addstudent | textarea[textarea] | sf-ta | 82 | 10px 12px | 13px | 10px | 6 | 1 |
| addpayment | input[text] | pf-in | 34 | 0px 11px 0px 36px | 12.5px | 9px | no label found | 1 |
| addpayment | input[text] | ws__amt is-muted | 19 | 0px | 15px | 0px | no label found | 1 |
| addpayment | input[number] | pf-in | 32 | 0px 11px | 12.5px | 0px | no label found | 3 |
| addpayment | input[text] | pf-in ws__wide | 32 | 0px 11px | 11.5px | 9px | no label found | 1 |
| addpayment | select[select-one] | pf-sel | 34 | 0px 32px 0px 11px | 12.5px | 9px | 3 | 2 |
| addpayment | input[text] | pf-in cdp-trigger | 34 | 0px 36px 0px 11px | 12.5px | 9px | 3 | 2 |
| addpayment | textarea[textarea] | pf-ta | 58 | 9px 11px | 12.5px | 10px | no label found | 1 |
| addpayment | select[select-one] | ap-mrail__sel | 30 | 0px 4px | 16px | 0px | no label found | 1 |

### 5.5 Layout mechanism per screen (computed display values under #content, light theme)

| Page | flex | inline-flex | grid | table / table-row / table-cell | block | inline / inline-block | position:absolute | position:fixed | float |
|---|---|---|---|---|---|---|---|---|---|
| dashboard | 252 | 24 | 18 | 1/7/63 | 449 | 279/8 | 6 | 0 | 0 |
| rooms | 336 | 0 | 2 | 0/0/0 | 419 | 388/1 | 61 | 0 | 0 |
| students | 51 | 19 | 1 | 1/7/84 | 156 | 89/14 | 0 | 0 | 0 |
| payments | 49 | 25 | 1 | 1/7/91 | 137 | 142/8 | 0 | 0 | 0 |
| expenses | 25 | 2 | 1 | 1/2/14 | 79 | 55/2 | 0 | 0 | 0 |
| cancellations | 31 | 4 | 1 | 1/2/16 | 80 | 63/1 | 0 | 0 | 0 |
| former | 20 | 0 | 1 | 1/2/10 | 60 | 42/2 | 0 | 0 | 0 |
| reports | 109 | 12 | 8 | 1/7/42 | 178 | 154/0 | 5 | 0 | 0 |
| issues | 34 | 10 | 2 | 1/3/30 | 105 | 82/1 | 0 | 0 | 0 |
| activitylog | 53 | 1 | 2 | 1/2/16 | 84 | 66/2 | 2 | 0 | 0 |
| backup | 50 | 0 | 2 | 0/0/0 | 84 | 102/2 | 1 | 0 | 0 |
| users | 35 | 3 | 2 | 1/2/12 | 72 | 65/1 | 0 | 0 | 0 |
| settings | 134 | 3 | 15 | 0/0/0 | 214 | 281/11 | 6 | 0 | 0 |
| support | 80 | 1 | 14 | 0/0/0 | 154 | 114/2 | 0 | 0 | 0 |
| archive | 52 | 4 | 3 | 1/14/84 | 177 | 17/0 | 0 | 0 | 0 |
| maintenance | 27 | 5 | 2 | 1/2/20 | 90 | 61/1 | 0 | 0 | 0 |
| complaints | 28 | 5 | 2 | 1/2/20 | 92 | 60/1 | 0 | 0 | 0 |
| addstudent | 93 | 0 | 8 | 0/0/0 | 269 | 184/18 | 4 | 0 | 0 |
| addpayment | 64 | 0 | 10 | 0/0/0 | 124 | 22/4 | 2 | 0 | 0 |

### 5.6 z-index stack — 30 distinct values, 68 declarations

| z-index | Count | Selectors | Locations |
|---|---|---|---|
| 0 | 2 | .bg-art ; .bg-art-2 | renderer/license.html:65,69 |
| 1 | 10 | .arc-table th ; .modal-header, .modal-footer ; .pf-wrapin > svg ; .rpt-stat__top, .rpt-stat__val, .rpt-stat__sub ; .cfg-grid .cfg-table thead th | renderer/archive.css:99; renderer/forms.css:93; renderer/payments.css:303; +5 files |
| 2 | 8 | .iss-table thead th:nth-child(10), .iss-table tbody td:nth-child(10) ; .lk-table thead th ; .pay-table thead th ; .rms-list th ; .stu-table thead th | renderer/issues.css:94; renderer/listkit.css:134; renderer/payments.css:133; +3 files |
| 3 | 2 | .iss-table thead th:nth-child(10) ; .table-wrap th.col-actions | renderer/issues.css:98; renderer/style.css:5139 |
| 5 | 2 | #sidebar .sidebar-collapse-btn ; .sidebar-collapse-btn | renderer/chrome.css:190; renderer/style.css:4900 |
| 20 | 4 | .set-tabs-wrap ; .asf-foot ; .settings-topnav-wrap ; .arch-hb | renderer/settings.css:24; renderer/students.css:825; renderer/style.css:1803,2344 |
| 30 | 2 | .tsk-head ; .tsk-foot | renderer/chrome.css:638,688 |
| 40 | 1 | .caf-drop | renderer/cancellations.css:202 |
| 50 | 2 | #header ; .pdf-bar | renderer/style.css:632; renderer/app.js:86 |
| 60 | 2 | .dash-rp-menu ; .tb-menu | renderer/dashboard.css:441; renderer/listkit.css:258 |
| 99 | 2 | #sidebar-overlay ; .toast | renderer/style.css:1957; renderer/license-settings.html:229 |
| 100 | 2 | #sidebar | renderer/style.css:617,1984 |
| 300 | 2 | .pf-results ; .arch-modal-overlay | renderer/payments.css:309; renderer/style.css:2474 |
| 330 | 1 | .stu-pan__scrim | renderer/students.css:1213 |
| 331 | 2 | .al-panel-wrap ; .stu-pan | renderer/activitylog.css:122; renderer/students.css:1231 |
| 350 | 1 | .modal-overlay | renderer/style.css:1517 |
| 400 | 2 | .city-suggestions ; .arch-edit-overlay | renderer/style.css:2210,2715 |
| 600 | 2 | .sf-drop-list ; [style] | renderer/students.css:339; renderer/src/modules/students.js:2769 |
| 900 | 2 | .pay-pop ; .stu-pop | renderer/payments.css:106; renderer/students.css:102 |
| 999 | 1 | [style] | renderer/index.html:441 |
| 1200 | 1 | .lk-rmenu | renderer/listkit.css:329 |
| 9000 | 2 | #login-screen ; #onb | renderer/login.css:31; renderer/onboarding.css:9 |
| 9998 | 1 | .dnut-tip | renderer/dashboard.css:1583 |
| 9999 | 4 | .hdr-menu ; #toast-container ; [style] | renderer/chrome.css:502; renderer/style.css:2031; renderer/index.html:707; +1 files |
| 99990 | 1 | [js cssText] | renderer/src/license.js:59 |
| 99997 | 1 | .confetti-particle | renderer/style.css:3318 |
| 99998 | 2 | .success-flash-overlay ; .error-flash-overlay | renderer/style.css:3296,3306 |
| 99999 | 1 | #login-screen | renderer/style.css:2827 |
| 100000 | 2 | .cmdk-overlay ; #hz-titlebar | renderer/style.css:5089; renderer/titlebar.css:21 |
| 100001 | 1 | .hz-drop | renderer/titlebar.css:76 |

## 6. Radius, borders, elevation

### 6.1 border-radius — 49 distinct values, 918 declarations

| Value | Count | Selectors (sample) | Locations |
|---|---|---|---|
| 10px | 113 | .arc-note ; .bk-health__i ; .bk-warn | renderer/archive.css:159; renderer/backup.css:28,68; renderer/cancellations.css:21,32,52 (+2); +24 files |
| 8px | 105 | .hdr-month-picker .sb-month-picker__arrow ; #header .hdr-back ; .dash-btn | renderer/chrome.css:493,723; renderer/dashboard.css:115,126,330 (+15); renderer/former.css:103; +22 files |
| 9px | 91 | .arc-years button ; .arc-tabs button ; .caf-opt__av | renderer/archive.css:23,71; renderer/cancellations.css:215,235; renderer/chrome.css:522,541,546; +20 files |
| 12px | 85 | .al-kpi__i ; .al-panel__i ; .arc-years | renderer/activitylog.css:27,136; renderer/archive.css:20,67,139; renderer/backup.css:24; +23 files |
| 11px | 71 | .arc-select ; .arc-btn ; .bk-stat__i | renderer/archive.css:31,41; renderer/backup.css:50; renderer/cancellations.css:89,99,119 (+2); +16 files |
| 50% | 67 | #sidebar .sidebar-collapse-btn ; .sb-user__av ; .tsk-chip--state::before | renderer/chrome.css:197,326,675 (+1); renderer/dashboard.css:167,205,214 (+6); renderer/former.css:40; +17 files |
| 999px | 54 | .al-user__t ; .al-user__f ; .arc-tabs .arc-tabs__n | renderer/activitylog.css:75,76; renderer/archive.css:78; renderer/chrome.css:298,472,669; +15 files |
| 7px | 51 | .lk-acts--widget .lk-act ; .dash-rp-more__btn ; .dash-row-c .dl-need__ic | renderer/cancellations.css:240; renderer/dashboard.css:434,813,961 (+5); renderer/expenses.css:287; +12 files |
| 14px | 38 | .al-kpi ; .arc-grand ; .arc-sd-av | renderer/activitylog.css:23; renderer/archive.css:115,129; renderer/backup.css:46,79,86; +14 files |
| 6px | 33 | .hdr-kbd ; .hdr-find #dash-search-clear ; .tsk-back | renderer/chrome.css:448,455,650; renderer/dashboard.css:675,676,975 (+1); renderer/login.css:131; +12 files |
| 16px | 23 | .arc-bar ; .arc-kpi ; .arc-panel | renderer/archive.css:12,53,83; renderer/dashboard.css:108,298; renderer/listkit.css:22,47,62 (+1); +9 files |
| 20px | 23 | .exp-stat__trend ; .pay-arrear-tag ; .pay-cov | renderer/expenses.css:192; renderer/payments.css:157,1031; renderer/style.css:573,774,953 (+6); +4 files |
| 2px | 19 | .stat-card-ent__progress ; .stat-card-ent__progress-fill ; .dash-legend__k i | renderer/components.css:219,231; renderer/dashboard.css:137; renderer/settings.css:57; +2 files |
| 3px | 19 | .arc-legend__i i ; .dash-key i ; .dl-occ__sw | renderer/archive.css:206; renderer/dashboard.css:162,683,2462 (+2); renderer/rooms.css:40,43; +3 files |
| var(--radius) | 15 | .rms-stat ; .rms-panel ; .rms-shell | renderer/rooms.css:25,47,111; renderer/students.css:22,60; renderer/style.css:1210,1255,1346 (+7) |
| 13px | 14 | .dash-chip--lg ; .pay-pop ; .pf-sum | renderer/dashboard.css:76,310; renderer/payments.css:107,867; renderer/reports.css:244; +6 files |
| 4px | 12 | .dl-meth__bar ; .dl-meth__bar > i ; .seat-inline__k:focus-visible | renderer/dashboard.css:550,551,1739 (+1); renderer/students.css:162; renderer/style.css:1600,1926,2110 (+3); +1 files |
| var(--radius-sm) | 11 | .sb-stat ; .nav-item ; .btn | renderer/style.css:789,995,1108 (+7); renderer/src/modules/rooms.js:512 |
| 5px | 9 | .al-bar ; .al-bar__f ; .arc-cbar | renderer/activitylog.css:63,65; renderer/archive.css:189; renderer/chrome.css:660; +5 files |
| 0 | 6 | .hf-in > .form-control ; .lk-sin, .lk-sin:focus, body.light-theme .lk-sin, body.light-theme .lk-sin:focus ; .ws__mini > .pf-in | renderer/forms.css:308; renderer/listkit.css:246; renderer/payments.css:506; +2 files |
| inherit | 6 | [style] | renderer/src/modules/students.js:3280,3352,3372 (+2); renderer/src/utils.js:559 |
| var(--r-xl) | 6 | .card ; .table-wrap ; .filter-bar | renderer/style.css:4330,4467,4560 (+3) |
| 18px | 4 | .onb-box ; .mov ; .arch-modal | renderer/onboarding.css:19; renderer/reports.css:278; renderer/style.css:2488; +1 files |
| var(--r-md) | 4 | .form-control ; .ftab ; .avatar | renderer/style.css:4526,4571,4763 (+1) |
| 100px | 3 | .btn-pill ; .user-chip ; .pay-chip | renderer/style.css:3429,3586,3889 |
| var(--r-full) | 3 | .nav-item ; .badge ; .stat-trend | renderer/style.css:4258,4506,4819 |
| 0 3px 3px 0 | 2 | #sidebar .nav-item.active::before ; .nav-item.active::before | renderer/chrome.css:814; renderer/style.css:1042 |
| 12px 12px 0 0 | 2 | .stu-pan__ledger ; .sb-logo-icon::before | renderer/students.css:1510; renderer/style.css:703 |
| 15px | 2 | .rpt-stat ; .hi-logo | renderer/reports.css:42; renderer/settings.css:1134 |
| 17px | 2 | .onb-logo-pick .hi-logo ; [style] | renderer/onboarding.css:141; renderer/src/license.js:95 |
| 22px | 2 | #login-screen #login-card ; [style] | renderer/login.css:57; renderer/src/license.js:91 |
| 28px | 2 | #login-card ; #login-card::after | renderer/style.css:2898,2945 |
| 4px 4px 0 0 | 2 | .chart-bar ; .inline-edit:hover, .inline-edit:focus | renderer/style.css:1741,1945 |
| 99px | 2 | .rpt-brow__t ; .rpt-brow__f | renderer/reports.css:208,212 |
| var(--radius-lg) | 2 | .stat-card-ent ; .card-ent | renderer/components.css:159,245 |
| var(--radius-md) | 2 | .btn-ent ; .stat-card-ent__icon | renderer/components.css:78,175 |
| 0 10px 10px 0 | 1 | .sf-prefix + .sf-in | renderer/students.css:311 |
| 0 2px 2px 0 | 1 | .nav-item.active::before | renderer/style.css:4289 |
| 0 8px 8px 0 | 1 | .hf-in > .pw-eye__btn | renderer/pw-eye.css:17 |
| 10px 0 0 10px | 1 | .sf-prefix | renderer/students.css:308 |
| 19px | 1 | .login-logo-wrap img | renderer/style.css:2972 |
| 20px 20px 0 0 | 1 | .modal.modal-lg, .modal.modal-xl | renderer/style.css:2006 |
| 22px 22px 0 0 | 1 | [style] | renderer/src/license.js:94 |
| 24px | 1 | .empty-state-icon | renderer/style.css:3869 |
| 26px | 1 | .logo | renderer/license.html:86 |
| 3px 3px 0 0 | 1 | .arc-cbar__b | renderer/archive.css:194 |
| var(--r-2xl) | 1 | .modal | renderer/style.css:4594 |
| var(--radius-card) | 1 | .stat-card | renderer/style.css:4350 |
| varpx | 1 | [style] | renderer/src/modules/dashboard.js:599 |

### 6.2 Borders — 1282 declarations

| Property | Value | Count | Locations |
|---|---|---|---|
| border | 1px solid var(--border) | 237 | renderer/activitylog.css:24; renderer/archive.css:12,20,53 (+4); renderer/backup.css:25,47,69 (+1); +26 files |
| border | 1px solid var(--border2) | 125 | renderer/archive.css:32,43; renderer/cancellations.css:22,32,52 (+1); renderer/chrome.css:425,447,466 (+3); +18 files |
| border-color | var(--accent) | 114 | renderer/archive.css:38,47; renderer/backup.css:84; renderer/chrome.css:729; +16 files |
| border-bottom | 1px solid var(--border) | 97 | renderer/activitylog.css:133; renderer/archive.css:87,100,104; renderer/backup.css:101; +26 files |
| border | none | 90 | renderer/archive.css:24,73; renderer/cancellations.css:195; renderer/chrome.css:168,435,485 (+2); +24 files |
| border-top | 1px solid var(--border) | 39 | renderer/chrome.css:692; renderer/dashboard.css:61,464,485 (+3); renderer/expenses.css:151; +12 files |
| border-bottom | none | 38 | renderer/archive.css:106; renderer/backup.css:103; renderer/cancellations.css:212; +17 files |
| border-color | var(--border2) | 28 | renderer/cancellations.css:242; renderer/chrome.css:469; renderer/dashboard.css:40,232,1212 (+1); +7 files |
| border | 1px solid transparent | 24 | renderer/chrome.css:244; renderer/components.css:79; renderer/dashboard.css:128,155,270 (+1); +8 files |
| border-color | var(--border) | 18 | renderer/dashboard.css:159; renderer/reports.css:49; renderer/rooms.css:344; +4 files |
| border-color | var(--dh) | 15 | renderer/dashboard.css:131,150,271 (+1); renderer/expenses.css:140; renderer/former.css:53; +7 files |
| border | 0 | 15 | renderer/dashboard.css:528,562,960 (+2); renderer/listkit.css:336; renderer/login.css:170; +3 files |
| border-color | transparent | 13 | renderer/cancellations.css:239; renderer/chrome.css:254; renderer/components.css:119; +4 files |
| border-color | var(--red) | 13 | renderer/activitylog.css:12; renderer/dashboard.css:3206,3212; renderer/payments.css:574,1494; +5 files |
| border-right | none | 13 | renderer/forms.css:403; renderer/issues.css:27,165; renderer/login.css:261; +7 files |
| border-right | 1px solid var(--border) | 12 | renderer/forms.css:300,396; renderer/issues.css:23; renderer/onboarding.css:26; +5 files |
| border | 1px solid #e2e8f0 | 11 | renderer/src/modules/dashboard.js:2443,2484; renderer/src/modules/students.js:3535,3541,3550 (+6) |
| border-color | var(--accent-strong) | 10 | renderer/archive.css:48; renderer/listkit.css:94; renderer/payments.css:846,889; +5 files |
| border-left | 1px solid var(--border) | 9 | renderer/activitylog.css:128; renderer/dashboard.css:467,1145; renderer/issues.css:96; +3 files |
| border | var(--hairline) | 9 | renderer/style.css:4329,4349,4466 (+6) |
| border-top | none | 8 | renderer/users.css:81; renderer/src/modules/activitylog.js:368; renderer/src/modules/backup-page.js:480; +2 files |
| border | 1px solid var(--accent) | 8 | renderer/payments.css:717,817,842 (+1); renderer/reports.css:535; renderer/students.css:1270; +2 files |
| border-bottom | 0 | 7 | renderer/cancellations.css:40; renderer/dashboard.css:532,565; renderer/students.css:1551,1560,1586; +1 files |
| border-color | var(--green) | 7 | renderer/style.css:2285,2421,2627 (+2); renderer/license.html:146,174 |
| border | 1px solid var | 7 | renderer/src/export/engine.js:545,557,566 (+2); renderer/src/modules/reports.js:68,154 |
| border-bottom | 1px solid var | 5 | renderer/src/export/engine.js:568,576,582 (+2) |
| border-left | none | 5 | renderer/dashboard.css:484; renderer/payments.css:397; renderer/settings.css:221,230,1017 |
| border | 1px dashed var(--border2) | 5 | renderer/payments.css:537; renderer/settings.css:1105,1136; renderer/students.css:1761; +1 files |
| border | 1px solid var(--line) | 5 | renderer/license.html:77,236,248; renderer/recovery.html:26,45 |
| border-bottom | 1px solid #d7c3b5 | 4 | renderer/style.css:4314,4496,4497 (+1) |
| border-bottom | var(--hairline) | 4 | renderer/style.css:4306,4481,4486 (+1) |
| border-color | var(--blue) | 4 | renderer/style.css:5054,5059; renderer/license.html:145,170 |
| border | 1.5px dashed var(--border2) | 4 | renderer/backup.css:80; renderer/students.css:251,700,763 |
| border | 1px solid rgba(248,113,113,0.2) | 4 | renderer/style.css:2433,3200,3421 (+1) |
| border | 1px solid rgba(37,99,235,0.3) | 4 | renderer/src/modules/dashboard.js:3056,3106; renderer/src/modules/reports.js:224; renderer/src/modules/students.js:4679 |
| border | 2px solid var(--border2) | 4 | renderer/archive.css:115; renderer/settings.css:484; renderer/students.css:1721; +1 files |
| border-bottom | 1px solid var(--surface-divider) | 3 | renderer/components.css:255,291,298 |
| border-color | #d7c3b5 | 3 | renderer/style.css:4547,4567,4781 |
| border-color | rgba(0, 0, 0, 0.2) | 3 | renderer/style.css:425,1175,1668 |
| border-color | rgba(0,0,0,0.2) | 3 | renderer/style.css:3473,4701,4906 |
| border-color | var(--ant-warning-fg) | 3 | renderer/cancellations.css:176; renderer/dashboard.css:3219,3227 |
| border-color | var(--sb-active) | 3 | renderer/chrome.css:203,324,430 |
| border-color | var44 | 3 | renderer/src/modules/dashboard.js:2846,2898; renderer/src/modules/reports.js:228 |
| border-right | 1px solid var | 3 | renderer/src/export/engine.js:567,607,611 |
| border-style | dashed | 3 | renderer/rooms.css:187,410; renderer/style.css:2179 |
| border-style | solid | 3 | renderer/payments.css:540; renderer/settings.css:1142; renderer/users.css:251 |
| border-top | 1px solid #e2e8f0 | 3 | renderer/src/modules/dashboard.js:2519; renderer/src/modules/students.js:3564,5070 |
| border-top | 1px solid var | 3 | renderer/src/export/engine.js:629,653; renderer/src/modules/dashboard.js:3543 |
| border-top | 1px solid var(--border2) | 3 | renderer/cancellations.css:63; renderer/payments.css:1011; renderer/reports.css:631 |
| border | 1px solid #d7c3b5 | 3 | renderer/style.css:4342,4625,4673 |
| border | 1px solid rgba(224,82,82,0.3) | 3 | renderer/src/modules/reports.js:62,116; renderer/src/modules/settings.js:3470 |
| border | 1px solid rgba(46,201,138,0.3) | 3 | renderer/src/modules/reports.js:57,223; renderer/src/modules/settings.js:3488 |
| border | 1px solid rgba(52,211,153,0.2) | 3 | renderer/style.css:2431,3420,3903 |
| border | 1px solid var(--accent-dim) | 3 | renderer/former.css:114,164; renderer/forms.css:537 |
| border | 1px solid var(--dh) | 3 | renderer/payments.css:125; renderer/settings.css:920; renderer/students.css:112 |
| border | 1px solid var(--lg-line) | 3 | renderer/login.css:56,250,258 |
| border-bottom | 1px solid #e2e8f0 | 2 | renderer/src/modules/students.js:3552,3557 |
| border-bottom | 1px solid #f1f5f9 | 2 | renderer/src/modules/dashboard.js:2487; renderer/src/modules/students.js:3544 |
| border-bottom | 1px solid #f8fafc | 2 | renderer/src/modules/dashboard.js:2500; renderer/src/modules/students.js:3558 |
| border-bottom | 1px solid var(--border2) | 2 | renderer/cancellations.css:38; renderer/style.css:1362 |
| border-bottom | 2px solid transparent | 2 | renderer/students.css:1397; renderer/style.css:2588 |
| border-color | rgba(0,0,0,0.1) | 2 | renderer/style.css:4336,4670 |
| border-color | rgba(255, 255, 255, 0.12) | 2 | renderer/components.css:54,108 |
| border-color | rgba(37,99,235,0.35) | 2 | renderer/style.css:1842,4690 |
| border-color | rgba(96,165,250,0.2) | 2 | renderer/style.css:4381,4586 |
| border-color | var(--gray-300) | 2 | renderer/components.css:57,99 |
| border-color | var(--lg-brand) | 2 | renderer/login.css:110,140 |
| border-color | var(--wa-green) | 2 | renderer/whatsapp.css:61,118 |
| border-right | 1px solid var(--lg-line) | 2 | renderer/login.css:216,260 |
| border-top | 2px solid var(--border) | 2 | renderer/users.css:156,215 |
| border |  | 2 | renderer/src/modules/payments.js:1984,1987 |
| border | 1px solid #1e293b | 2 | renderer/src/modules/students.js:5045,5067 |
| border | 1px solid #d9e2f2 | 2 | renderer/app.js:88,96 |
| border | 1px solid #dbeafe | 2 | renderer/login.css:223; renderer/src/modules/students.js:3514 |
| border | 1px solid rgba(0,0,0,.12) | 2 | renderer/settings.css:139,193 |
| border | 1px solid rgba(0,0,0,0.1) | 2 | renderer/style.css:3422,4826 |
| border | 1px solid rgba(0,0,0,0.15) | 2 | renderer/style.css:1421,1422 |
| border | 1px solid rgba(0,0,0,0.2) | 2 | renderer/style.css:2430,2960 |
| border | 1px solid rgba(0,0,0,0.3) | 2 | renderer/style.css:2461,2533 |
| border | 1px solid rgba(192,132,252,0.25) | 2 | renderer/style.css:1424,4518 |
| border | 1px solid rgba(248, 113, 113, 0.3) | 2 | renderer/style.css:1181,2244 |
| border | 1px solid rgba(251,191,36,0.25) | 2 | renderer/style.css:1426,4520 |
| border | 1px solid rgba(255,77,109,0.3) | 2 | renderer/src/modules/students.js:4336,4647 |
| border | 1px solid rgba(74,156,240,0.3) | 2 | renderer/src/modules/reports.js:120,225 |
| border | 1px solid var(--blue-line) | 2 | renderer/license.html:116,139 |
| border | 1px solid var(--green) | 2 | renderer/payments.css:718; renderer/students.css:318 |
| border | 1px solid var(--sb-divider) | 2 | renderer/chrome.css:200,318 |
| border | 1px solid var(--surface-border) | 2 | renderer/components.css:158,244 |
| border | 1px solid var(--warning-border) | 2 | renderer/settings.css:421; renderer/students.css:444 |
| border-bottom | 1.4px solid var | 1 | renderer/src/export/engine.js:607 |
| border-bottom | 1px dashed transparent | 1 | renderer/style.css:2107 |
| border-bottom | 1px dashed var(--border2) | 1 | renderer/style.css:1931 |
| border-bottom | 1px dotted var(--border2, #cfcfcf) | 1 | renderer/components.css:336 |
| border-bottom | 1px solid transparent | 1 | renderer/style.css:5166 |
| border-bottom | 1px solid var(--line) | 1 | renderer/recovery.html:36 |
| border-bottom | 1px solid var(--sb-divider) | 1 | renderer/chrome.css:157 |
| border-bottom | 2px dashed #bbb | 1 | renderer/src/receipt.js:148 |
| border-bottom | 2px solid #1e293b | 1 | renderer/src/modules/dashboard.js:2430 |
| border-bottom | 2px solid #dbeafe | 1 | renderer/src/modules/students.js:3543 |
| border-bottom | 2px solid var | 1 | renderer/src/export/engine.js:529 |
| border-bottom | 3px solid #2563eb | 1 | renderer/src/modules/students.js:3509 |
| border-color | \'#7c3aed\'" onblur="this.style.bordercolor=\'#1e3050\'" | 1 | renderer/src/license.js:114 |
| border-color | #bbf7d0 | 1 | renderer/src/modules/students.js:3524 |
| border-color | #bfdbfe | 1 | renderer/src/modules/students.js:3525 |
| border-color | #d97706 | 1 | renderer/rooms.css:218 |
| border-color | #e2e8f0 | 1 | renderer/src/modules/students.js:3526 |
| border-color | #f59e0b | 1 | renderer/rooms.css:217 |
| border-color | currentcolor | 1 | renderer/students.css:1383 |
| border-color | rgba(0, 0, 0, 0.15) | 1 | renderer/style.css:1635 |
| border-color | rgba(0,0,0,0.06) | 1 | renderer/style.css:3398 |
| border-color | rgba(0,0,0,0.12) | 1 | renderer/style.css:2911 |
| border-color | rgba(0,0,0,0.3) | 1 | renderer/style.css:2422 |
| border-color | rgba(0,0,0,0.35) | 1 | renderer/style.css:3160 |
| border-color | rgba(14, 165, 233, 0.15) | 1 | renderer/style.css:326 |
| border-color | rgba(14,165,233,0.3) | 1 | renderer/style.css:3063 |
| border-color | rgba(248,113,113,0.3) | 1 | renderer/style.css:3778 |
| border-color | rgba(255, 255, 255, .10) | 1 | renderer/chrome.css:267 |
| border-color | rgba(255,180,171,0.20) | 1 | renderer/style.css:4671 |
| border-color | rgba(52,211,153,0.2) | 1 | renderer/style.css:2420 |
| border-color | rgba(56, 189, 248, 0.15) | 1 | renderer/style.css:1033 |
| border-color | rgba(56,189,248,0.25) | 1 | renderer/style.css:3051 |
| border-color | rgba(56,189,248,0.4) | 1 | renderer/style.css:3057 |
| border-color | rgba(56,189,248,0.5) | 1 | renderer/style.css:3082 |
| border-color | rgba(59,130,246, 0.2) | 1 | renderer/style.css:435 |
| border-color | rgba(59,130,246, 0.35) | 1 | renderer/style.css:2175 |
| border-color | rgba(59,130,246,0.35) | 1 | renderer/style.css:3560 |
| border-color | rgba(96,165,250,0.20) | 1 | renderer/style.css:4664 |
| border-color | rgba(96,165,250,0.28) | 1 | renderer/style.css:4853 |
| border-color | var(--accent-600) | 1 | renderer/components.css:90 |
| border-color | var(--accent-700) | 1 | renderer/components.css:94 |
| border-color | var(--accent)'" onmouseout="this.style.bordercolor='var(--border)'"> | 1 | renderer/src/modules/settings.js:222 |
| border-color | var(--amber) | 1 | renderer/rooms.css:187 |
| border-color | var(--ant-success-fg) | 1 | renderer/students.css:1670 |
| border-color | var(--blue-line) | 1 | renderer/license.html:259 |
| border-color | var(--danger-bd) | 1 | renderer/license-settings.html:189 |
| border-color | var(--danger-border) | 1 | renderer/students.css:512 |
| border-color | var(--danger-fg) | 1 | renderer/components.css:133 |
| border-color | var(--dh, var(--accent)) | 1 | renderer/expenses.css:169 |
| border-color | var(--gray-500) | 1 | renderer/chrome.css:854 |
| border-color | var(--gray-600) | 1 | renderer/chrome.css:851 |
| border-color | var(--info-bd) | 1 | renderer/license-settings.html:194 |
| border-color | var(--lg-brand-2) | 1 | renderer/login.css:137 |
| border-color | var(--sb-active-edge) | 1 | renderer/chrome.css:801 |
| border-color | var(--seat-tile-br) | 1 | renderer/dashboard.css:2310 |
| border-color | var(--success-border) | 1 | renderer/students.css:510 |
| border-color | var(--text3) | 1 | renderer/chrome.css:450 |
| border-color | var(--wa-green-2) | 1 | renderer/whatsapp.css:60 |
| border-color | var(--warning-bd) | 1 | renderer/license-settings.html:184 |
| border-left | 1px solid var | 1 | renderer/src/export/engine.js:539 |
| border-left | 1px solid var(--border2) | 1 | renderer/rooms.css:191 |
| border-left | 2px solid var(--border) | 1 | renderer/src/modules/dashboard.js:2710 |
| border-left | 2px solid var(--border2) | 1 | renderer/style.css:5131 |
| border-left | 6px solid var(--toast-tone) | 1 | renderer/style.css:2048 |
| border-right | 1px solid #d7c3b5 | 1 | renderer/style.css:4242 |
| border-right | 1px solid var(--border2) | 1 | renderer/rooms.css:71 |
| border-right | 1px solid var(--sb-border) | 1 | renderer/chrome.css:144 |
| border-right | var(--hairline) | 1 | renderer/style.css:4236 |
| border-top | 0 | 1 | renderer/users.css:170 |
| border-top | 1.5px var #888 | 1 | renderer/src/receipt.js:135 |
| border-top | 1px dashed #94a3b8 | 1 | renderer/src/modules/students.js:3567 |
| border-top | 1px dashed #e2e8f0 | 1 | renderer/src/modules/dashboard.js:2513 |
| border-top | 1px solid #666 | 1 | renderer/src/receipt.js:307 |
| border-top | 1px solid rgba(255,255,255,.28) | 1 | renderer/src/modules/students.js:3532 |
| border-top | 1px solid var(--lg-line) | 1 | renderer/login.css:204 |
| border-top | 1px solid var(--line-soft) | 1 | renderer/license.html:220 |
| border-top | 1px solid var(--sb-divider) | 1 | renderer/chrome.css:281 |
| border-top | 2px dashed #bbb | 1 | renderer/src/receipt.js:324 |
| border-top | 3px solid var | 1 | renderer/src/modules/dashboard.js:2743 |
| border | 1.5px solid #cbd5e1 | 1 | renderer/login.css:133 |
| border | 1.5px solid #ccc | 1 | renderer/src/receipt.js:162 |
| border | 1.5px solid rgba(224,82,82,0.5) | 1 | renderer/src/modules/payments.js:2223 |
| border | 1.5px solid rgba(255,255,255,0.06) | 1 | renderer/style.css:3036 |
| border | 1.5px solid rgba(255,255,255,0.08) | 1 | renderer/style.css:3143 |
| border | 1.5px solid rgba(37,99,235,.5) | 1 | renderer/src/auth-nev.js:741 |
| border | 1.5px solid var(--accent) | 1 | renderer/payments.css:642 |
| border | 1.5px solid var(--border2) | 1 | renderer/rooms.css:351 |
| border | 1.5px solid var(--lg-line) | 1 | renderer/login.css:105 |
| border | 1.5px solid var(--line) | 1 | renderer/license.html:162 |
| border | 1px dashed rgba(37,99,235,0.4) | 1 | renderer/src/modules/dashboard.js:2251 |
| border | 1px dashed var | 1 | renderer/src/export/engine.js:644 |
| border | 1px solid | 1 | renderer/src/modules/students.js:3523 |
| border | 1px solid #1e3c6a | 1 | renderer/src/license.js:91 |
| border | 1px solid #52443a | 1 | renderer/style.css:4525 |
| border | 1px solid #bfdbfe | 1 | renderer/login.css:184 |
| border | 1px solid #ddd | 1 | renderer/style.css:4091 |
| border | 1px solid #fecaca | 1 | renderer/login.css:176 |
| border | 1px solid rgba(224,164,114,0.2) | 1 | renderer/style.css:3912 |
| border | 1px solid rgba(240,160,48,.35) | 1 | renderer/payments.css:159 |
| border | 1px solid rgba(240,160,48,0.3) | 1 | renderer/src/modules/reports.js:112 |
| border | 1px solid rgba(240,160,48,0.35) | 1 | renderer/src/modules/settings.js:2942 |
| border | 1px solid rgba(248,113,113,0.25) | 1 | renderer/style.css:1420 |
| border | 1px solid rgba(251,191,36,.32) | 1 | renderer/whatsapp.css:68 |
| border | 1px solid rgba(251,191,36,0.2) | 1 | renderer/style.css:3906 |
| border | 1px solid rgba(255,180,171,0.2) | 1 | renderer/style.css:4825 |
| border | 1px solid rgba(255,180,171,0.25) | 1 | renderer/style.css:4514 |
| border | 1px solid rgba(255,255,255,0.05) | 1 | renderer/style.css:3269 |
| border | 1px solid rgba(255,255,255,0.06) | 1 | renderer/style.css:3393 |
| border | 1px solid rgba(255,77,109,0.35) | 1 | renderer/src/modules/students.js:4669 |
| border | 1px solid rgba(45,212,191,0.25) | 1 | renderer/style.css:1423 |
| border | 1px solid rgba(46,201,138,0.2) | 1 | renderer/src/modules/students.js:4336 |
| border | 1px solid rgba(52, 211, 153, 0.3) | 1 | renderer/style.css:1192 |
| border | 1px solid rgba(52,211,153,0.25) | 1 | renderer/style.css:1419 |
| border | 1px solid rgba(52,211,153,0.4) | 1 | renderer/style.css:2547 |
| border | 1px solid rgba(59,130,246, 0.2) | 1 | renderer/style.css:772 |
| border | 1px solid rgba(59,130,246, 0.35) | 1 | renderer/style.css:680 |
| border | 1px solid rgba(59,130,246,0.18) | 1 | renderer/style.css:2897 |
| border | 1px solid rgba(68,226,205,0.25) | 1 | renderer/style.css:4517 |
| border | 1px solid rgba(69,223,164,.40) | 1 | renderer/payments.css:930 |
| border | 1px solid rgba(69,223,164,0.2) | 1 | renderer/style.css:4824 |
| border | 1px solid rgba(69,223,164,0.25) | 1 | renderer/style.css:4513 |
| border | 1px solid rgba(96,165,250,0.20) | 1 | renderer/style.css:4516 |
| border | 1px solid rgba(96,165,250,0.25) | 1 | renderer/style.css:4515 |
| border | 1px solid var(--amber) | 1 | renderer/rooms.css:183 |
| border | 1px solid var(--danger-bd) | 1 | renderer/license-settings.html:121 |
| border | 1px solid var(--danger-border, var(--border)) | 1 | renderer/payments.css:1488 |
| border | 1px solid var(--danger) | 1 | renderer/recovery.html:52 |
| border | 1px solid var(--gray-300) | 1 | renderer/components.css:49 |
| border | 1px solid var(--info-bd) | 1 | renderer/license-settings.html:152 |
| border | 1px solid var(--ok) | 1 | renderer/recovery.html:53 |
| border | 1px solid var(--success-bd) | 1 | renderer/license-settings.html:120 |
| border | 1px solid var(--success-border) | 1 | renderer/settings.css:368 |
| border | 2.4px solid rgba(255,255,255,.35) | 1 | renderer/license.html:208 |
| border | 2px solid rgba(56,189,248,0.2) | 1 | renderer/style.css:3078 |
| border | 2px solid var | 1 | renderer/src/modules/reports.js:192 |
| border | 2px solid var(--amber) | 1 | renderer/src/modules/payments.js:1981 |
| border | 2px solid var(--bg) | 1 | renderer/style.css:3542 |
| border | 2px solid var(--card) | 1 | renderer/chrome.css:475 |
| border | 3px solid #bfdbfe | 1 | renderer/src/modules/students.js:3517 |
| border | 3px solid var(--card) | 1 | renderer/forms.css:103 |
| border | var | 1 | renderer/src/modules/sidebar_calendar.js:117 |

### 6.3 box-shadow — 110 distinct values, 183 declarations

| Value (verbatim) | Count | Selectors (sample) | Locations |
|---|---|---|---|
| 0 0 0 3px var(--accent-dim) | 23 | .arc-select:focus ; .exp-search:focus-within ; .exp-select:focus | renderer/archive.css:38; renderer/expenses.css:59,75; renderer/listkit.css:70,83; +6 files |
| none | 18 | #sidebar, body.light-theme #sidebar ; #sidebar .sb-logo-icon ; #sidebar .sidebar-collapse-btn | renderer/chrome.css:145,168,201 (+4); renderer/dashboard.css:966,2221,2603; renderer/forms.css:313,327; +4 files |
| var(--shadow) | 18 | .hdr-menu ; .dash-rp-menu ; .lk-stat--click:hover | renderer/chrome.css:505; renderer/dashboard.css:444; renderer/listkit.css:26,265; +8 files |
| var(--shadow-sm) | 6 | .stat-card-ent ; .card-ent ; .ap-idn | renderer/components.css:161,246; renderer/payments.css:362,407,590 (+1) |
| var(--shadow-indigo-sm) | 4 | .sb-stat:hover ; .btn-secondary:hover ; .card:hover | renderer/style.css:798,1176,1217 (+1) |
| 0 0 0 0.5px rgba(0,0,0,0.15) | 3 | .mac-dot.red ; .mac-dot.yellow ; .mac-dot.green | renderer/style.css:3518,3519,3520 |
| var(--shadow-lg) | 3 | .cmdk-box ; .card ; [style] | renderer/style.css:5098; renderer/license.html:79; renderer/index.html:707 |
| 0 0 0 3px rgba(56,189,248,0.12) | 2 | .editing-cell ; .form-control:focus | renderer/style.css:2128,4539 |
| 0 0 0 3px var(--accent-soft) | 2 | .modal .form-control:focus ; .hf-in:focus-within | renderer/forms.css:225,292 |
| 0 32px 80px rgba(0,0,0,0.6) | 2 | .arch-modal ; .arch-edit-box | renderer/style.css:2493,2734 |
| var(--s-elev-2) | 2 | .card:hover ; .quick-action-btn:hover | renderer/style.css:4337,4857 |
| var(--s-elev-3) | 2 | .stat-card:hover ; .room-card:hover | renderer/style.css:4383,4666 |
| -18px 0 48px rgba(15,23,42,.16) | 1 | .stu-pan | renderer/students.css:1238 |
| 0 -4px 14px rgba(0, 0, 0, .30) | 1 | body:not(.light-theme) .tsk-foot | renderer/chrome.css:695 |
| 0 -4px 14px rgba(21, 34, 56, .05) | 1 | .tsk-foot | renderer/chrome.css:693 |
| 0 -6px 18px rgba(0,0,0,.34) | 1 | body:not(.light-theme) .asf-foot | renderer/students.css:832 |
| 0 -6px 18px rgba(15,23,42,.06) | 1 | .asf-foot | renderer/students.css:830 |
| 0 0 0 0 rgba(56, 189, 248, 0.4) | 1 | 0%, 100% | renderer/style.css:471 |
| 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent) | 1 | .stu-search:focus-within | renderer/students.css:1119 |
| 0 0 0 3px rgba(0, 0, 0, 0.1) | 1 | .form-control:focus | renderer/style.css:1484 |
| 0 0 0 3px rgba(52,211,153,0.1) | 1 | .arch-search-inp:focus | renderer/style.css:2627 |
| 0 0 0 3px rgba(56,189,248,0.10) | 1 | .hdr-search:focus-within | renderer/style.css:3561 |
| 0 0 0 3px rgba(59,130,246,.12) | 1 | .hdr-find:focus-within | renderer/chrome.css:431 |
| 0 0 0 3px rgba(59,130,246,0.10) | 1 | body.light-theme .form-control:focus | renderer/style.css:4552 |
| 0 0 0 3px var(--red-dim) | 1 | .form-control.is-invalid:focus, input.is-invalid:focus | renderer/ui-kit.css:111 |
| 0 0 0 4px rgba(220,38,38,.10) | 1 | .key-input.error | renderer/license.html:173 |
| 0 0 0 4px rgba(37, 99, 235, .12) | 1 | .key-input:focus | renderer/license.html:171 |
| 0 0 0 4px rgba(5,150,105,.12) | 1 | .key-input.success | renderer/license.html:174 |
| 0 0 0 4px rgba(56,189,248,0.08) | 1 | body.light-theme #login-input:focus | renderer/style.css:3167 |
| 0 0 0 4px rgba(56,189,248,0.12), 0 2px 12px rgba(0,0,0,0.2) | 1 | #login-input:focus | renderer/style.css:3161 |
| 0 0 0 4px rgba(59,130,246,.10) | 1 | #login-screen .lg-in:focus | renderer/login.css:110 |
| 0 0 0 4px rgba(59,130,246,.16) | 1 | .lg-remember input:focus-visible + .lg-check | renderer/login.css:140 |
| 0 0 0 6px rgba(56, 189, 248, 0) | 1 | 50% | renderer/style.css:474 |
| 0 0 12px rgba(14,165,233,0.06) | 1 | body.light-theme .login-warden-btn.selected | renderer/style.css:3065 |
| 0 0 16px rgba(56,189,248,0.08) | 1 | .login-warden-btn.selected | renderer/style.css:3059 |
| 0 0 4px var(--green) | 1 | .pay-chip.paid::before | renderer/style.css:3904 |
| 0 0 6px var(--green) | 1 | .status-dot.active | renderer/style.css:4724 |
| 0 10px 26px rgba(15, 23, 42, .14) | 1 | .caf-drop | renderer/cancellations.css:205 |
| 0 10px 26px rgba(37, 99, 235, .28) | 1 | .logo | renderer/license.html:88 |
| 0 10px 30px rgba(15,23,42,.14) | 1 | .lk-rmenu | renderer/listkit.css:331 |
| 0 12px 28px rgba(37, 99, 235, .34) | 1 | .activate-btn:hover:not(:disabled) | renderer/license.html:199 |
| 0 12px 32px rgba(0, 0, 0, .28) | 1 | .hz-drop | renderer/titlebar.css:75 |
| 0 12px 32px rgba(0, 0, 0, 0.5) | 1 | .city-suggestions | renderer/style.css:2213 |
| 0 12px 32px rgba(15, 23, 42, .16) | 1 | .toast | renderer/style.css:2054 |
| 0 12px 40px rgba(0,0,0,0.5) | 1 | [style] | renderer/index.html:441 |
| 0 12px 48px rgba(0, 0, 0, 0.12) | 1 | body.light-theme .modal-box, body.light-theme .modal | renderer/style.css:375 |
| 0 16px 48px rgba(0,0,0,0.12) | 1 | body.light-theme .modal | renderer/style.css:4626 |
| 0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px var(--border) | 1 | body.light-theme .modal | renderer/style.css:3966 |
| 0 1px 0 #d7c3b5 | 1 | body.light-theme #header | renderer/style.css:4315 |
| 0 1px 0 rgba(0, 0, 0, 0.1) | 1 | #header | renderer/style.css:641 |
| 0 1px 0 rgba(0,0,0,0.08) | 1 | #header | renderer/style.css:4307 |
| 0 1px 0 var(--border) | 1 | body.light-theme .header | renderer/style.css:338 |
| 0 1px 0 var(--border), 0 4px 20px rgba(0,0,0,0.04) | 1 | body.light-theme #header | renderer/style.css:3956 |
| 0 1px 2px rgba(15, 23, 42, .10) | 1 | .trend-range__b.is-on | renderer/dashboard.css:2601 |
| 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04), 0 0 0 1px var(--border) | 1 | body.light-theme .card | renderer/style.css:3951 |
| 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(59,130,246,0.05) | 1 | body.light-theme .stat-card | renderer/style.css:4459 |
| 0 1px 3px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.04), 0 0 0 1px var(--border) | 1 | body.light-theme .stat-card | renderer/style.css:3942 |
| 0 1px 3px rgba(15, 23, 42, .07) | 1 | body.light-theme #sidebar .nav-item.active | renderer/chrome.css:835 |
| 0 1px 4px rgba(0, 0, 0, 0.06), 0 0 0 1px var(--border) | 1 | body.light-theme .card, body.light-theme .stat-card, body.light-theme .dash-card | renderer/style.css:333 |
| 0 1px 4px rgba(0,0,0,0.05) | 1 | body.light-theme .card | renderer/style.css:4343 |
| 0 1px 6px rgba(37,99,235,0.12) | 1 | .settings-tab.active | renderer/style.css:1843 |
| 0 24px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9) | 1 | body.light-theme #login-card | renderer/style.css:2912 |
| 0 24px 70px rgba(19, 32, 48, .10) | 1 | #login-screen #login-card | renderer/login.css:58 |
| 0 2px 10px rgba(0, 0, 0, 0.2) | 1 | body.light-theme .btn-primary | renderer/style.css:387 |
| 0 2px 10px rgba(37,99,235,.28) | 1 | .btn-primary:hover, body.light-theme .btn-primary:hover | renderer/chrome.css:583 |
| 0 2px 10px rgba(96,165,250,0.35) | 1 | .nav-item.active | renderer/style.css:4281 |
| 0 2px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8) | 1 | body.light-theme .sb-logo-icon | renderer/style.css:426 |
| 0 2px 12px rgba(0, 0, 0, 0.3) | 1 | 0%, 100% | renderer/style.css:480 |
| 0 2px 12px rgba(0,0,0,0.18) | 1 | .settings-topnav-wrap | renderer/style.css:1800 |
| 0 2px 12px rgba(248, 113, 113, 0.25) | 1 | .btn-danger:hover | renderer/style.css:1187 |
| 0 2px 16px rgba(0, 0, 0, 0.4) | 1 | 50% | renderer/style.css:483 |
| 0 2px 6px color-mix(in srgb, var(--kpi-b) 26%, transparent) | 1 | .dash-kpi-grid .dash-chip | renderer/dashboard.css:2207 |
| 0 2px 8px rgba(0,0,0,0.06) | 1 | body.light-theme .settings-topnav-wrap | renderer/style.css:4695 |
| 0 2px 8px rgba(15, 23, 42, .06) | 1 | .dsh-card | renderer/dashboard.css:30 |
| 0 32px 80px rgba(0, 0, 0, 0.7) | 1 | .modal | renderer/style.css:1534 |
| 0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03) | 1 | .modal | renderer/style.css:4595 |
| 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 60px rgba(0,0,0,0.06) | 1 | #login-card | renderer/style.css:2900 |
| 0 4px 12px rgba(15, 23, 42, .08) | 1 | .dsh-card--click:hover | renderer/dashboard.css:39 |
| 0 4px 14px rgba(21,94,239,.28) | 1 | .pdf-print-btn | renderer/app.js:95 |
| 0 4px 16px rgba(0,0,0,0.3) | 1 | #hostel-list > div:hover | renderer/style.css:2808 |
| 0 4px 20px rgba(0,0,0,0.2) | 1 | .empty-state-icon | renderer/style.css:3877 |
| 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.06) | 1 | body.light-theme .stat-card:hover | renderer/style.css:3946 |
| 0 4px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.15) | 1 | #login-btn | renderer/style.css:3228 |
| 0 4px 20px rgba(16,185,129,0.4) | 1 | #login-btn.success | renderer/style.css:3258 |
| 0 6px 18px rgba(0, 0, 0, .14) | 1 | body.hz-tb-autohide.hz-tb-show #hz-titlebar | renderer/titlebar.css:134 |
| 0 6px 20px rgba(15,23,42,.16) | 1 | .pdf-bar | renderer/app.js:88 |
| 0 8px 20px rgba(27, 63, 174, .28) | 1 | #sidebar .nav-item.active | renderer/chrome.css:268 |
| 0 8px 20px rgba(37,99,235,.26) | 1 | #login-screen #login-btn | renderer/login.css:154 |
| 0 8px 22px rgba(37, 99, 235, .28) | 1 | .activate-btn | renderer/license.html:192 |
| 0 8px 22px rgba(5, 150, 105, .28) | 1 | .activate-btn.success-btn | renderer/license.html:204 |
| 0 8px 24px rgba(0, 0, 0, 0.08) | 1 | body.light-theme .arch-hb | renderer/style.css:453 |
| 0 8px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.1) | 1 | .login-logo-wrap | renderer/style.css:2961 |
| 0 8px 24px rgba(15, 23, 42, .16) | 1 | .dnut-tip | renderer/dashboard.css:1587 |
| 0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.15) | 1 | #login-btn:hover | renderer/style.css:3244 |
| 0 8px 32px rgba(0,0,0,.5) | 1 | .arch-hb | renderer/style.css:2346 |
| 1px 0 0 #52443a | 1 | #sidebar | renderer/style.css:4237 |
| 1px 0 0 var(--border) | 1 | #sidebar | renderer/style.css:619 |
| 1px 0 0 var(--border), 4px 0 24px rgba(0,0,0,0.04) | 1 | body.light-theme #sidebar | renderer/style.css:3961 |
| 2px 0 16px rgba(0, 0, 0, 0.06) | 1 | body.light-theme .sidebar | renderer/style.css:320 |
| 2px 0 16px rgba(0,0,0,0.04) | 1 | body.light-theme #sidebar | renderer/style.css:4243 |
| 8px 0 40px rgba(0, 0, 0, 0.5), 4px 0 20px rgba(0,0,0,0.1) | 1 | #sidebar.open | renderer/style.css:1988 |
| inset 0 -2px 0 0 var(--accent) | 1 | .set-table tbody tr.is-over-down td | renderer/settings.css:127 |
| inset 0 2px 0 0 var(--accent) | 1 | .set-table tbody tr.is-over-up td | renderer/settings.css:126 |
| inset 0 2px 0 var(--accent) | 1 | .hf-switch__b.is-on | renderer/forms.css:409 |
| inset 3px 0 0 var(--amber) | 1 | .pay-table tbody tr.is-arrear td:first-child | renderer/payments.css:155 |
| var(--glow-gold) | 1 | .btn-gold:hover | renderer/style.css:1163 |
| var(--s-elev-1) | 1 | .stat-card | renderer/style.css:4352 |
| var(--shadow-accent) | 1 | .btn-gold | renderer/style.css:1157 |
| var(--shadow-md) | 1 | .stat-card-ent:hover | renderer/components.css:167 |
| var(--shadow), 0 0 16px rgba(0,0,0,0.06) | 1 | .arch-month-card:hover | renderer/style.css:2417 |

### 6.4 Shadow vs elevation (rendered, light theme)

Floating = computed position fixed, or absolute with z-index ≥ 10.

| Page | Non-floating elements with a shadow | Floating elements with a shadow | Floating elements (>4000px²) without a shadow — samples | Non-floating with shadow — samples |
|---|---|---|---|---|
| dashboard | 12 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon ; div#content > div.dash-kpi-grid > div.dsh-card.dh-blue ; div.dsh-card.dh-blue > div.dash-kpi__top > div.dash-chip ; div#content > div.dash-kpi-grid > div.dsh-card.dh-amber ; div.dsh-card.dh-amber > div.dash-kpi__top > div.dash-chip ; div#content > div.dash-kpi-grid > div.dsh-card.dh-green |
| rooms | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| students | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| payments | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| expenses | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| cancellations | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| former | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| reports | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| issues | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| activitylog | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| backup | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| users | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| settings | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| support | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| archive | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| maintenance | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| complaints | 1 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon |
| addstudent | 2 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon ; div#content > div.asf > footer.asf-foot |
| addpayment | 6 | 0 | html > body.has-titlebar.hz-tb-autohide > div#hz-titlebar ; html > body.has-titlebar.hz-tb-autohide > aside#sidebar | div.sb-logo > div.sb-logo-mark > div#sb-logo-icon.sb-logo-icon ; div.ap-cols > div.ap-main > div.ws ; div.ap-cols > aside#ap-side.ap-side > div.ap-mrail ; div.ap-cols > aside#ap-side.ap-side > div.ap-card ; div.ap-cols > aside#ap-side.ap-side > div.ap-card ; div#main > div#content > footer.tsk-foot |

## 7. Motion

### 7.1 transition declarations — 261

| Value | Count | Locations |
|---|---|---|
| transition: var(--transition) | 124 | renderer/archive.css:25,44,74 (+1); renderer/backup.css:82; renderer/chrome.css:201,467,524 (+2); +16 files |
| transition: border-color .15s ease, box-shadow .15s ease | 13 | renderer/chrome.css:427; renderer/expenses.css:57; renderer/listkit.css:68; +6 files |
| transition: none | 10 | renderer/dashboard.css:1258,1598,1916; renderer/payments.css:1338; renderer/students.css:1244; +2 files |
| transition: background .12s ease | 7 | renderer/dashboard.css:1286,1501; renderer/expenses.css:110; renderer/listkit.css:147; +2 files |
| transition: border-color .15s ease | 5 | renderer/dashboard.css:229; renderer/rooms.css:119; renderer/settings.css:190; +2 files |
| transition: var(--transition-bounce) | 5 | renderer/style.css:1257,1653,2378 (+2) |
| transition: width .5s ease | 5 | renderer/dashboard.css:84,171,245; renderer/payments.css:1336; renderer/reports.css:212 |
| transition: background .14s ease | 4 | renderer/dashboard.css:530,563,976 (+1) |
| transition: all .15s | 3 | renderer/license-settings.html:87,144,178 |
| transition: all 0.15s | 3 | renderer/style.css:876,892,957 |
| transition: all 0.2s ease | 3 | renderer/style.css:1826,3149,4846 |
| transition: background .12s ease, color .12s ease | 3 | renderer/style.css:3364; renderer/titlebar.css:47,95 |
| transition: background .12s ease, color .12s ease, border-color .12s ease | 3 | renderer/chrome.css:727; renderer/dashboard.css:1209,2094 |
| transition: background .14s ease, border-color .14s ease, color .14s ease | 3 | renderer/login.css:134; renderer/students.css:905,1360 |
| transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease | 3 | renderer/listkit.css:23; renderer/payments.css:22; renderer/reports.css:43 |
| transition: all 0.2s cubic-bezier(0.4,0,0.2,1) | 2 | renderer/style.css:3039,3225 |
| transition: background 0.12s | 2 | renderer/src/modules/dashboard.js:3888; renderer/src/modules/sidebar_calendar.js:117 |
| transition: color 0.15s | 2 | renderer/style.css:1602,3183 |
| transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1) | 2 | renderer/style.css:4453,4758 |
| transition-duration: 0.01ms | 1 | renderer/style.css:543 |
| transition: all 0.15s ease | 1 | renderer/style.css:4577 |
| transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) | 1 | renderer/style.css:4264 |
| transition: background .12s ease, border-color .12s ease | 1 | renderer/dashboard.css:1309 |
| transition: background .14s ease, border-color .14s ease | 1 | renderer/students.css:1538 |
| transition: background .14s ease, color .14s ease | 1 | renderer/dashboard.css:963 |
| transition: background .14s ease, color .14s ease, border-color .14s ease | 1 | renderer/students.css:1092 |
| transition: background .15s ease, border-color .15s ease | 1 | renderer/chrome.css:322 |
| transition: background .15s ease, color .15s ease | 1 | renderer/chrome.css:247 |
| transition: background 0.15s | 1 | renderer/src/modules/payments.js:1367 |
| transition: background 0.15s ease | 1 | renderer/style.css:1376 |
| transition: background 0.15s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease | 1 | renderer/style.css:4353 |
| transition: background 0.15s ease, transform 0.2s ease, border-color 0.2s ease | 1 | renderer/style.css:4659 |
| transition: background 0.15s, border-color 0.15s, color 0.15s | 1 | renderer/style.css:5051 |
| transition: background 0.1s | 1 | renderer/style.css:2225 |
| transition: background 0.2s | 1 | renderer/style.css:4076 |
| transition: background 120ms ease, border-color 120ms ease | 1 | renderer/components.css:81 |
| transition: border-color .14s ease, color .14s ease, background .14s ease | 1 | renderer/dashboard.css:2764 |
| transition: border-color .15s ease, background .15s ease | 1 | renderer/rooms.css:342 |
| transition: border-color .16s ease, color .16s ease, background .16s ease | 1 | renderer/ui-kit.css:123 |
| transition: border-color .16s, background .16s | 1 | renderer/license.html:256 |
| transition: border-color .16s, box-shadow .16s | 1 | renderer/license.html:166 |
| transition: border-color .16s, color .16s, background .16s | 1 | renderer/license.html:143 |
| transition: border-color 0.2s | 1 | renderer/src/modules/settings.js:222 |
| transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.15s ease | 1 | renderer/style.css:4531 |
| transition: box-shadow .12s ease, border-color .12s ease | 1 | renderer/dashboard.css:31 |
| transition: color .14s ease | 1 | renderer/pw-eye.css:10 |
| transition: color .14s ease, border-color .14s ease, background .14s ease | 1 | renderer/dashboard.css:1001 |
| transition: color .15s ease | 1 | renderer/settings.css:45 |
| transition: color 0.12s | 1 | renderer/style.css:5116 |
| transition: filter .15s ease, transform .15s ease | 1 | renderer/login.css:155 |
| transition: filter 0.15s, transform 0.15s | 1 | renderer/style.css:3514 |
| transition: height 0.5s cubic-bezier(0.4, 0, 0.2, 1) | 1 | renderer/style.css:1743 |
| transition: margin-left 0.28s cubic-bezier(0.4,0,0.2,1) | 1 | renderer/style.css:4867 |
| transition: opacity .12s ease, transform .12s ease | 1 | renderer/dashboard.css:1590 |
| transition: opacity .14s ease | 1 | renderer/dashboard.css:2733 |
| transition: opacity 0.12s | 1 | renderer/style.css:5119 |
| transition: opacity 0.2s ease | 1 | renderer/src/modules/nav.js:421 |
| transition: opacity 0.3s ease | 1 | renderer/style.css:4365 |
| transition: stroke-dasharray .7s cubic-bezier(.22, 1, .36, 1), transform .16s ease, opacity .14s ease | 1 | renderer/dashboard.css:2712 |
| transition: stroke-width .14s ease, opacity .14s ease | 1 | renderer/dashboard.css:1253 |
| transition: transform .14s, box-shadow .16s, opacity .16s | 1 | renderer/license.html:195 |
| transition: transform .15s ease | 1 | renderer/dashboard.css:155 |
| transition: transform .16s ease, box-shadow .16s ease | 1 | renderer/titlebar.css:130 |
| transition: transform .18s ease, border-color .18s ease | 1 | renderer/listkit.css:48 |
| transition: transform .24s cubic-bezier(.32,.72,0,1) | 1 | renderer/students.css:1240 |
| transition: transform .3s cubic-bezier(0.22,1,0.36,1), opacity .3s | 1 | renderer/license-settings.html:228 |
| transition: transform 0.25s | 1 | renderer/style.css:913 |
| transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) | 1 | renderer/style.css:1983 |
| transition: transform 0.25s ease | 1 | renderer/style.css:4909 |
| transition: transform 0.2s ease | 1 | renderer/style.css:4405 |
| transition: transform 120ms ease, box-shadow 120ms ease | 1 | renderer/components.css:163 |
| transition: width .25s ease | 1 | renderer/students.css:626 |
| transition: width .3s ease | 1 | renderer/dashboard.css:1914 |
| transition: width .4s ease | 1 | renderer/rooms.css:44 |
| transition: width 0.28s cubic-bezier(0.4,0,0.2,1) | 1 | renderer/style.css:4866 |
| transition: width 0.5s | 1 | renderer/src/modules/dashboard.js:2283 |
| transition: width 0.5s ease | 1 | renderer/style.css:1708 |
| transition: width 300ms ease | 1 | renderer/components.css:232 |

### 7.2 Durations (transition + animation) — 39 distinct

| Duration | Count | Locations |
|---|---|---|
| .15s | 27 | renderer/chrome.css:247,322,427; renderer/dashboard.css:155,229; renderer/expenses.css:57; +8 files |
| .14s | 23 | renderer/dashboard.css:530,563,963 (+9); renderer/login.css:134,134; renderer/pw-eye.css:10; +2 files |
| .12s | 19 | renderer/chrome.css:727,727; renderer/dashboard.css:31,1209,1209 (+6); renderer/expenses.css:110; +5 files |
| 0.15s | 15 | renderer/style.css:876,892,957 (+11); renderer/src/modules/payments.js:1367 |
| 0.2s | 14 | renderer/style.css:1826,3039,3149 (+9); renderer/src/modules/settings.js:222; renderer/src/modules/nav.js:421 |
| .16s | 10 | renderer/titlebar.css:130; renderer/ui-kit.css:123,123; renderer/license.html:143,143,166 (+2); +1 files |
| .18s | 8 | renderer/listkit.css:23,23,48; renderer/payments.css:22,22; renderer/reports.css:43,43; +1 files |
| 0.5s | 8 | renderer/style.css:1708,1743,1129 (+4); renderer/src/modules/dashboard.js:2283 |
| 1.2s | 6 | renderer/style.css:4453,4758,3319 (+2); renderer/license-settings.html:237 |
| .5s | 5 | renderer/dashboard.css:84,171,245; renderer/payments.css:1336; renderer/reports.css:212 |
| 0.25s | 5 | renderer/style.css:913,1983,4909 (+2) |
| 2s | 5 | renderer/style.css:1063,3543,3907 (+2) |
| 0.12s | 4 | renderer/style.css:5116,5119; renderer/src/modules/dashboard.js:3888; renderer/src/modules/sidebar_calendar.js:117 |
| 0.6s | 4 | renderer/style.css:1026,1271,3299 (+1) |
| 3s | 4 | renderer/style.css:688,712,2964 (+1) |
| .3s | 3 | renderer/dashboard.css:1914; renderer/license-settings.html:228; renderer/license.html:212 |
| 0.3s | 3 | renderer/style.css:4365,3483,3488 |
| 0.4s | 3 | renderer/style.css:3202,3262,3285 |
| 1.5s | 3 | renderer/style.css:3378,3849,3910 |
| .24s | 2 | renderer/students.css:1240; renderer/forms.css:452 |
| .7s | 2 | renderer/dashboard.css:2712; renderer/license.html:209 |
| 0.01ms | 2 | renderer/style.css:543,542 |
| 0.28s | 2 | renderer/style.css:4866,4867 |
| 120ms | 2 | renderer/components.css:81,163 |
| 1s | 2 | renderer/style.css:693,4215 |
| .22s | 1 | renderer/forms.css:447 |
| .25s | 1 | renderer/students.css:626 |
| .26s | 1 | renderer/style.css:2055 |
| .2s | 1 | renderer/style.css:2057 |
| .4s | 1 | renderer/rooms.css:44 |
| 0.1s | 1 | renderer/style.css:2225 |
| 0.65s | 1 | renderer/style.css:4744 |
| 0.8s | 1 | renderer/style.css:3404 |
| 12s | 1 | renderer/style.css:2844 |
| 15s | 1 | renderer/style.css:2870 |
| 18s | 1 | renderer/style.css:2877 |
| 20s | 1 | renderer/style.css:2884 |
| 300ms | 1 | renderer/components.css:232 |
| 4s | 1 | renderer/style.css:2932 |

### 7.3 Easing curves — 15 distinct

| Easing | Count | Locations |
|---|---|---|
| ease | 155 | renderer/chrome.css:247,247,322 (+6); renderer/components.css:81,81,163 (+2); renderer/dashboard.css:31,31,84 (+34); +14 files |
| ease-out | 14 | renderer/forms.css:446,451; renderer/style.css:693,1026,1129 (+9) |
| ease-in-out | 12 | renderer/style.css:688,712,1063 (+9) |
| cubic-bezier(0.4,0,0.2,1) | 7 | renderer/style.css:3039,3225,4866 (+4) |
| cubic-bezier(0.4, 0, 0.2, 1) | 5 | renderer/style.css:1743,1983,4264 (+2) |
| cubic-bezier(0.34, 1.56, 0.64, 1) | 3 | renderer/style.css:1540,2494,2735 |
| linear | 3 | renderer/style.css:2932,3378; renderer/license.html:209 |
| cubic-bezier(.2, .7, .3, 1) | 2 | renderer/forms.css:447,452 |
| cubic-bezier(.2,.9,.3,1.4) | 1 | renderer/license.html:212 |
| cubic-bezier(.22, 1, .36, 1) | 1 | renderer/dashboard.css:2712 |
| cubic-bezier(.32, .72, 0, 1) | 1 | renderer/style.css:2055 |
| cubic-bezier(.32,.72,0,1) | 1 | renderer/students.css:1240 |
| cubic-bezier(0.22,1,0.36,1) | 1 | renderer/license-settings.html:228 |
| cubic-bezier(0.34,1.56,0.64,1) | 1 | renderer/style.css:2905 |
| cubic-bezier(0.4,0,1,1) | 1 | renderer/style.css:3285 |

### 7.4 animation declarations — 57; @keyframes blocks — 48 (39 distinct names)

| animation value | Selector | Location |
|---|---|---|
| hz-scrim-in .16s ease-out both | .modal-overlay | renderer/forms.css:446 |
| hz-panel-in .22s cubic-bezier(.2, .7, .3, 1) both | .modal | renderer/forms.css:447 |
| hz-scrim-in .16s ease-out both | .al-panel-wrap | renderer/forms.css:451 |
| hz-slide-in .24s cubic-bezier(.2, .7, .3, 1) both | .al-panel | renderer/forms.css:452 |
| stuPanFade .18s ease | .stu-pan__scrim | renderer/students.css:1219 |
| none | .stu-pan__scrim | renderer/students.css:1245 |
| none | body.no-transition, body.no-transition *, body.no-transition *::before, body.no-transition *::after | renderer/style.css:215 |
| logoGlow 3s ease-in-out infinite | .sb-logo-icon | renderer/style.css:688 |
| indigoPulse 1s ease-out | .sb-logo-icon:hover | renderer/style.css:693 |
| shimmerSweep 3s ease-in-out infinite | .sb-logo-icon::after | renderer/style.css:712 |
| shimmerSweep 0.6s ease-out forwards | .nav-item:hover::after | renderer/style.css:1026 |
| pulseDot 2s ease-in-out infinite | .nav-badge | renderer/style.css:1063 |
| shimmerSweep 0.5s ease-out forwards | .btn:hover::before | renderer/style.css:1129 |
| shimmerSweep 0.6s ease-out forwards | .stat-card:hover::after | renderer/style.css:1271 |
| fadeIn 0.15s ease | .modal-overlay | renderer/style.css:1526 |
| slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) | .modal | renderer/style.css:1540 |
| shimmerSweep 0.5s ease-out forwards | .room-card:hover::after | renderer/style.css:1673 |
| toastIn .26s cubic-bezier(.32, .72, 0, 1) | .toast | renderer/style.css:2055 |
| toastOut .2s ease forwards | .toast.is-going | renderer/style.css:2057 |
| none | .toast | renderer/style.css:2059 |
| none | .toast.is-going | renderer/style.css:2060 |
| slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) | .arch-modal | renderer/style.css:2494 |
| slideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) | .arch-edit-box | renderer/style.css:2735 |
| loginBgShift 12s ease-in-out infinite alternate | #login-bg | renderer/style.css:2844 |
| orbFloat1 15s ease-in-out infinite alternate | #login-orb-1 | renderer/style.css:2870 |
| orbFloat2 18s ease-in-out infinite alternate | #login-orb-2 | renderer/style.css:2877 |
| orbFloat3 20s ease-in-out infinite alternate | #login-orb-3 | renderer/style.css:2884 |
| loginCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) | #login-card | renderer/style.css:2905 |
| rainbowSlide 4s linear infinite | #login-card::before | renderer/style.css:2932 |
| logoGlow 3s ease-in-out infinite | .login-logo-wrap | renderer/style.css:2964 |
| shakeX 0.4s ease | #login-error | renderer/style.css:3202 |
| shimmerSweep 0.5s ease-out forwards | #login-btn:hover::before | renderer/style.css:3247 |
| shakeX 0.4s ease | #login-btn.error-shake | renderer/style.css:3262 |
| loginCardOut 0.4s cubic-bezier(0.4,0,1,1) forwards | #login-screen.logging-in #login-card | renderer/style.css:3285 |
| successFlash 0.6s ease-out forwards | .success-flash-overlay | renderer/style.css:3299 |
| errorFlash 0.5s ease-out forwards | .error-flash-overlay | renderer/style.css:3309 |
| confettiFall var(--dur, 1.2s) ease-out forwards | .confetti-particle | renderer/style.css:3319 |
| toastProgress var(--duration, 1.5s) linear forwards | .toast-progress | renderer/style.css:3378 |
| none | .toast-progress | renderer/style.css:3382 |
| countUp 0.8s cubic-bezier(0.4,0,0.2,1) | .stat-value.counting | renderer/style.css:3404 |
| viewEnter 0.3s cubic-bezier(0.4,0,0.2,1) | .view-enter | renderer/style.css:3483 |
| slideUp 0.3s cubic-bezier(0.4,0,0.2,1) backwards | .view-enter > * | renderer/style.css:3488 |
| pulseDot 2s ease-in-out infinite | .notif-badge | renderer/style.css:3543 |
| rowAddedPulse 1.2s ease-out | tr.row-added td | renderer/style.css:3717 |
| skeletonShimmer 1.5s infinite | .skeleton | renderer/style.css:3849 |
| pulseDot 2s infinite | .pay-chip.pending::before | renderer/style.css:3907 |
| pulseDot 1.5s infinite | .pay-chip.overdue::before | renderer/style.css:3910 |
| pulseBreathing 3s ease-in-out infinite | .dot-breathing | renderer/style.css:4214 |
| pulseRapid 1s ease-in-out infinite | .dot-rapid | renderer/style.css:4215 |
| pulseDot 2s ease-in-out infinite | .dot-pulse | renderer/style.css:4216 |
| shimmerSweep 0.6s ease-out forwards | .stat-card:hover::after | renderer/style.css:4387 |
| pulseDot 2s infinite | .status-dot.pending | renderer/style.css:4725 |
| pulseRapid 1.2s infinite | .status-dot.danger | renderer/style.css:4727 |
| shimmerSweep 0.65s ease-out forwards | .shimmer-card:hover::after | renderer/style.css:4744 |
| shimmer 1.2s infinite | .skeleton | renderer/license-settings.html:237 |
| spin .7s linear infinite | .spinner | renderer/license.html:209 |
| checkPop .3s cubic-bezier(.2,.9,.3,1.4) | .check-wrap | renderer/license.html:212 |

| @keyframes | Defined at | Referenced by an animation declaration |
|---|---|---|
| hz-scrim-in | renderer/forms.css:436 | yes |
| hz-panel-in | renderer/forms.css:437 | yes |
| hz-slide-in | renderer/forms.css:441 | yes |
| stuPanFade | renderer/students.css:1221 | yes |
| indigoPulse | renderer/style.css:469 | yes |
| logoGlow | renderer/style.css:478 | yes |
| shimmerSweep | renderer/style.css:488 | yes |
| floatUp | renderer/style.css:494 | NO |
| fadeIn | renderer/style.css:500 | yes |
| slideUp | renderer/style.css:505 | yes |
| slideInLeft | renderer/style.css:510 | NO |
| slideLeft | renderer/style.css:516 | NO |
| pulseDot | renderer/style.css:522 | yes |
| ripple | renderer/style.css:528 | NO |
| pulse | renderer/style.css:534 | NO |
| loginBgShift | renderer/style.css:3973 | yes |
| orbFloat1 | renderer/style.css:3978 | yes |
| orbFloat2 | renderer/style.css:3983 | yes |
| orbFloat3 | renderer/style.css:3988 | yes |
| loginCardIn | renderer/style.css:3993 | yes |
| loginCardOut | renderer/style.css:3998; renderer/style.css:4176 | yes |
| rainbowSlide | renderer/style.css:4003 | yes |
| shakeX | renderer/style.css:4008; renderer/style.css:4204 | yes |
| successFlash | renderer/style.css:4016; renderer/style.css:4186 | yes |
| errorFlash | renderer/style.css:4021; renderer/style.css:4191 | yes |
| confettiFall | renderer/style.css:4026; renderer/style.css:4181 | yes |
| viewEnter | renderer/style.css:4031; renderer/style.css:4158 | yes |
| countUp | renderer/style.css:4036; renderer/style.css:4164 | yes |
| rowAddedPulse | renderer/style.css:4041; renderer/style.css:4170 | yes |
| skeletonShimmer | renderer/style.css:4046 | yes |
| toastProgress | renderer/style.css:4051; renderer/style.css:4198 | yes |
| toastIn | renderer/style.css:4058 | yes |
| toastOut | renderer/style.css:4062 | yes |
| pulseBreathing | renderer/style.css:4139 | yes |
| pulseRapid | renderer/style.css:4145 | yes |
| atmosphericDrift | renderer/style.css:4151 | NO |
| shimmer | renderer/license-settings.html:240 | yes |
| spin | renderer/license.html:211 | yes |
| checkPop | renderer/license.html:213 | yes |

Keyframes defined but never referenced: 6 — floatUp, slideInLeft, slideLeft, ripple, pulse, atmosphericDrift.

Animations not attached to a hover/focus/active selector (run when the element renders or when a class is added by script): 49

| Selector | animation | Location |
|---|---|---|
| .modal-overlay | hz-scrim-in .16s ease-out both | renderer/forms.css:446 |
| .modal | hz-panel-in .22s cubic-bezier(.2, .7, .3, 1) both | renderer/forms.css:447 |
| .al-panel-wrap | hz-scrim-in .16s ease-out both | renderer/forms.css:451 |
| .al-panel | hz-slide-in .24s cubic-bezier(.2, .7, .3, 1) both | renderer/forms.css:452 |
| .stu-pan__scrim | stuPanFade .18s ease | renderer/students.css:1219 |
| .stu-pan__scrim | none | renderer/students.css:1245 |
| body.no-transition, body.no-transition *, body.no-transition *::before, body.no-transition *::after | none | renderer/style.css:215 |
| .sb-logo-icon | logoGlow 3s ease-in-out infinite | renderer/style.css:688 |
| .sb-logo-icon::after | shimmerSweep 3s ease-in-out infinite | renderer/style.css:712 |
| .nav-badge | pulseDot 2s ease-in-out infinite | renderer/style.css:1063 |
| .modal-overlay | fadeIn 0.15s ease | renderer/style.css:1526 |
| .modal | slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) | renderer/style.css:1540 |
| .toast | toastIn .26s cubic-bezier(.32, .72, 0, 1) | renderer/style.css:2055 |
| .toast.is-going | toastOut .2s ease forwards | renderer/style.css:2057 |
| .toast | none | renderer/style.css:2059 |
| .toast.is-going | none | renderer/style.css:2060 |
| .arch-modal | slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) | renderer/style.css:2494 |
| .arch-edit-box | slideUp 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) | renderer/style.css:2735 |
| #login-bg | loginBgShift 12s ease-in-out infinite alternate | renderer/style.css:2844 |
| #login-orb-1 | orbFloat1 15s ease-in-out infinite alternate | renderer/style.css:2870 |
| #login-orb-2 | orbFloat2 18s ease-in-out infinite alternate | renderer/style.css:2877 |
| #login-orb-3 | orbFloat3 20s ease-in-out infinite alternate | renderer/style.css:2884 |
| #login-card | loginCardIn 0.5s cubic-bezier(0.34,1.56,0.64,1) | renderer/style.css:2905 |
| #login-card::before | rainbowSlide 4s linear infinite | renderer/style.css:2932 |
| .login-logo-wrap | logoGlow 3s ease-in-out infinite | renderer/style.css:2964 |
| #login-error | shakeX 0.4s ease | renderer/style.css:3202 |
| #login-btn.error-shake | shakeX 0.4s ease | renderer/style.css:3262 |
| #login-screen.logging-in #login-card | loginCardOut 0.4s cubic-bezier(0.4,0,1,1) forwards | renderer/style.css:3285 |
| .success-flash-overlay | successFlash 0.6s ease-out forwards | renderer/style.css:3299 |
| .error-flash-overlay | errorFlash 0.5s ease-out forwards | renderer/style.css:3309 |
| .confetti-particle | confettiFall var(--dur, 1.2s) ease-out forwards | renderer/style.css:3319 |
| .toast-progress | toastProgress var(--duration, 1.5s) linear forwards | renderer/style.css:3378 |
| .toast-progress | none | renderer/style.css:3382 |
| .stat-value.counting | countUp 0.8s cubic-bezier(0.4,0,0.2,1) | renderer/style.css:3404 |
| .view-enter | viewEnter 0.3s cubic-bezier(0.4,0,0.2,1) | renderer/style.css:3483 |
| .view-enter > * | slideUp 0.3s cubic-bezier(0.4,0,0.2,1) backwards | renderer/style.css:3488 |
| .notif-badge | pulseDot 2s ease-in-out infinite | renderer/style.css:3543 |
| tr.row-added td | rowAddedPulse 1.2s ease-out | renderer/style.css:3717 |
| .skeleton | skeletonShimmer 1.5s infinite | renderer/style.css:3849 |
| .pay-chip.pending::before | pulseDot 2s infinite | renderer/style.css:3907 |
| .pay-chip.overdue::before | pulseDot 1.5s infinite | renderer/style.css:3910 |
| .dot-breathing | pulseBreathing 3s ease-in-out infinite | renderer/style.css:4214 |
| .dot-rapid | pulseRapid 1s ease-in-out infinite | renderer/style.css:4215 |
| .dot-pulse | pulseDot 2s ease-in-out infinite | renderer/style.css:4216 |
| .status-dot.pending | pulseDot 2s infinite | renderer/style.css:4725 |
| .status-dot.danger | pulseRapid 1.2s infinite | renderer/style.css:4727 |
| .skeleton | shimmer 1.2s infinite | renderer/license-settings.html:237 |
| .spinner | spin .7s linear infinite | renderer/license.html:209 |
| .check-wrap | checkPop .3s cubic-bezier(.2,.9,.3,1.4) | renderer/license.html:212 |

`prefers-reduced-motion`: 11 occurrences — renderer/dashboard.css:1257,1597,1916 (+1); renderer/payments.css:1338; renderer/students.css:1243; renderer/style.css:540,2058,3381; renderer/titlebar.css:136; renderer/src/modules/dashboard.js:3675.

## 8. Responsiveness

### 8.1 @media queries — 150

| Condition | Rules inside | Declarations inside | Location |
|---|---|---|---|
| (max-width: 1180px) | 1 | 1 | renderer/activitylog.css:56 |
| (max-height: 760px) | 2 | 2 | renderer/activitylog.css:149 |
| (min-width: 1180px) | 2 | 2 | renderer/archive.css:217 |
| (max-width: 1080px) | 1 | 2 | renderer/backup.css:130 |
| (max-width: 560px) | 1 | 1 | renderer/cancellations.css:185 |
| (max-width: 900px) | 3 | 6 | renderer/chrome.css:402 |
| (max-width: 640px) | 5 | 10 | renderer/chrome.css:410 |
| (max-width: 1100px) | 2 | 2 | renderer/chrome.css:601 |
| (max-width: 900px) | 4 | 4 | renderer/chrome.css:710 |
| (max-height: 720px) | 2 | 2 | renderer/chrome.css:765 |
| (max-height: 640px) | 1 | 1 | renderer/chrome.css:772 |
| (max-height: 820px) | 2 | 4 | renderer/chrome.css:896 |
| (max-width:1180px) | 1 | 1 | renderer/dashboard.css:282 |
| (min-width:1330px) | 1 | 1 | renderer/dashboard.css:385 |
| (max-width:880px) | 4 | 8 | renderer/dashboard.css:482 |
| (max-width:1240px) | 1 | 1 | renderer/dashboard.css:513 |
| (max-width:720px) | 1 | 1 | renderer/dashboard.css:514 |
| (max-width:1200px) | 3 | 3 | renderer/dashboard.css:646 |
| (max-width:980px) | 2 | 2 | renderer/dashboard.css:651 |
| (max-width:720px) | 1 | 1 | renderer/dashboard.css:655 |
| (max-width:1200px) | 1 | 1 | renderer/dashboard.css:709 |
| (max-width:900px) | 1 | 1 | renderer/dashboard.css:710 |
| (max-height:900px) | 19 | 27 | renderer/dashboard.css:763 |
| (min-width:1201px) and (max-width:1600px) | 4 | 7 | renderer/dashboard.css:826 |
| (min-width: 1000px) and (max-width: 1200px) | 8 | 11 | renderer/dashboard.css:1027 |
| (max-height: 700px) | 21 | 31 | renderer/dashboard.css:1063 |
| (max-height: 640px) | 17 | 23 | renderer/dashboard.css:1105 |
| (max-width: 1360px) | 1 | 1 | renderer/dashboard.css:1169 |
| (max-width: 1180px) | 1 | 1 | renderer/dashboard.css:1172 |
| (max-width: 900px) | 2 | 2 | renderer/dashboard.css:1222 |
| (prefers-reduced-motion: reduce) | 2 | 2 | renderer/dashboard.css:1257 |
| (max-width: 1150px) | 2 | 3 | renderer/dashboard.css:1333 |
| (prefers-reduced-motion: reduce) | 1 | 1 | renderer/dashboard.css:1597 |
| (max-width:1200px) | 2 | 3 | renderer/dashboard.css:1620 |
| (max-height:720px) | 6 | 15 | renderer/dashboard.css:1625 |
| (max-height:665px) | 7 | 10 | renderer/dashboard.css:1647 |
| (max-height:665px) | 1 | 1 | renderer/dashboard.css:1668 |
| (max-height:720px) | 1 | 1 | renderer/dashboard.css:1778 |
| (max-height:665px) | 5 | 5 | renderer/dashboard.css:1779 |
| (max-height:665px) | 4 | 6 | renderer/dashboard.css:1791 |
| (prefers-reduced-motion: reduce) | 1 | 1 | renderer/dashboard.css:1916 |
| (max-height:720px) | 4 | 12 | renderer/dashboard.css:2005 |
| (max-height:720px) | 2 | 2 | renderer/dashboard.css:2019 |
| (max-height:665px) | 3 | 3 | renderer/dashboard.css:2023 |
| (max-height:760px) | 1 | 1 | renderer/dashboard.css:2144 |
| (max-height:720px) | 1 | 1 | renderer/dashboard.css:2145 |
| (max-height:665px) | 1 | 1 | renderer/dashboard.css:2146 |
| (max-height: 640px) | 1 | 1 | renderer/dashboard.css:2269 |
| (max-height: 640px) | 3 | 3 | renderer/dashboard.css:2281 |
| (max-width: 1200px) | 1 | 2 | renderer/dashboard.css:2393 |
| (max-height: 700px) | 1 | 2 | renderer/dashboard.css:2435 |
| (max-height: 640px) | 1 | 2 | renderer/dashboard.css:2436 |
| (max-height: 720px) | 1 | 1 | renderer/dashboard.css:2484 |
| (max-height: 665px) | 1 | 1 | renderer/dashboard.css:2485 |
| (max-height: 640px) | 1 | 1 | renderer/dashboard.css:2489 |
| (min-height: 721px) and (max-height: 800px) | 6 | 7 | renderer/dashboard.css:2534 |
| (max-width: 1200px) | 1 | 1 | renderer/dashboard.css:2674 |
| (max-height: 640px) | 1 | 2 | renderer/dashboard.css:2689 |
| (prefers-reduced-motion: reduce) | 2 | 3 | renderer/dashboard.css:2723 |
| (max-height: 720px) | 1 | 1 | renderer/dashboard.css:3031 |
| (max-height: 665px) | 1 | 1 | renderer/dashboard.css:3032 |
| (max-height: 720px) | 1 | 1 | renderer/dashboard.css:3110 |
| (max-width: 1100px) | 2 | 3 | renderer/dashboard.css:3231 |
| (max-width:1320px) | 1 | 1 | renderer/expenses.css:43 |
| (max-width:1180px) | 1 | 1 | renderer/expenses.css:45 |
| (max-width: 760px) | 2 | 2 | renderer/former.css:174 |
| (max-width: 900px) | 2 | 2 | renderer/forms.css:243 |
| (max-width: 700px) | 1 | 1 | renderer/forms.css:247 |
| (max-height: 800px) | 1 | 1 | renderer/forms.css:418 |
| (max-width: 880px) | 1 | 1 | renderer/forms.css:545 |
| (max-width:820px) | 2 | 3 | renderer/issues.css:163 |
| (max-width:900px) | 1 | 3 | renderer/listkit.css:215 |
| (max-width: 940px) | 3 | 4 | renderer/login.css:277 |
| (max-height: 780px) | 11 | 13 | renderer/login.css:285 |
| (max-height: 640px) | 4 | 4 | renderer/login.css:298 |
| (max-width:820px) | 6 | 13 | renderer/onboarding.css:171 |
| (max-width:900px) | 1 | 2 | renderer/payments.css:59 |
| (max-width:900px) | 1 | 3 | renderer/payments.css:265 |
| (max-width:1180px) | 1 | 1 | renderer/payments.css:346 |
| (max-width:900px) | 3 | 4 | renderer/payments.css:394 |
| (max-width:820px) | 4 | 5 | renderer/payments.css:576 |
| (max-width:640px) | 1 | 1 | renderer/payments.css:806 |
| (max-width:640px) | 2 | 2 | renderer/payments.css:852 |
| (max-width:1080px) | 1 | 1 | renderer/payments.css:1164 |
| (max-width: 1400px) | 2 | 2 | renderer/payments.css:1249 |
| (max-width: 1400px) | 8 | 15 | renderer/payments.css:1259 |
| (prefers-reduced-motion: reduce) | 1 | 1 | renderer/payments.css:1338 |
| (max-width: 760px) | 1 | 1 | renderer/payments.css:1448 |
| (max-width:1000px) | 1 | 1 | renderer/reports.css:134 |
| (max-width:1100px) | 1 | 2 | renderer/reports.css:253 |
| (max-width:640px) | 4 | 5 | renderer/reports.css:257 |
| (max-width:900px) | 1 | 1 | renderer/reports.css:393 |
| (max-width:900px) | 3 | 3 | renderer/rooms.css:420 |
| (max-width: 1100px) | 1 | 2 | renderer/settings.css:230 |
| (max-width: 1000px) | 1 | 1 | renderer/settings.css:243 |
| (max-width:820px) | 1 | 1 | renderer/settings.css:454 |
| (max-width: 1100px) | 1 | 1 | renderer/settings.css:571 |
| (max-width: 900px) | 2 | 6 | renderer/settings.css:572 |
| (max-height: 760px) | 3 | 3 | renderer/settings.css:761 |
| (max-width: 1080px) | 2 | 4 | renderer/settings.css:1015 |
| (max-height: 760px) | 2 | 2 | renderer/settings.css:1206 |
| (max-width: 1180px) | 2 | 2 | renderer/settings.css:1210 |
| (max-width: 1340px) | 1 | 1 | renderer/settings.css:1222 |
| (max-width:900px) | 1 | 2 | renderer/students.css:55 |
| (max-width:900px) | 1 | 3 | renderer/students.css:229 |
| (max-width:1000px) | 3 | 4 | renderer/students.css:516 |
| (max-width:1320px) | 1 | 1 | renderer/students.css:845 |
| (max-width:1300px) | 1 | 1 | renderer/students.css:860 |
| (max-width:1150px) | 2 | 2 | renderer/students.css:864 |
| (max-width:900px) | 4 | 6 | renderer/students.css:871 |
| (max-width:700px) | 5 | 7 | renderer/students.css:878 |
| (max-width: 1400px) | 2 | 4 | renderer/students.css:1003 |
| (max-width: 1200px) | 1 | 1 | renderer/students.css:1137 |
| (prefers-reduced-motion: reduce) | 2 | 2 | renderer/students.css:1243 |
| (max-width: 880px) | 3 | 4 | renderer/students.css:1679 |
| (prefers-reduced-motion: reduce) | 1 | 2 | renderer/style.css:540 |
| (max-width: 1400px) | 1 | 1 | renderer/style.css:1248 |
| (max-width: 900px) | 9 | 12 | renderer/style.css:1980 |
| (max-width: 600px) | 4 | 10 | renderer/style.css:1999 |
| (prefers-reduced-motion: reduce) | 2 | 3 | renderer/style.css:2058 |
| (max-width:900px) | 1 | 1 | renderer/style.css:2399 |
| (prefers-reduced-motion: reduce) | 1 | 3 | renderer/style.css:3381 |
| print | 4 | 6 | renderer/style.css:4087 |
| (max-width: 900px) | 3 | 3 | renderer/style.css:4912 |
| (max-width: 900px) | 1 | 2 | renderer/style.css:5005 |
| (max-width: 600px) | 1 | 4 | renderer/style.css:5012 |
| (max-width: 900px) | 1 | 1 | renderer/support.css:41 |
| (max-width: 1000px) | 1 | 1 | renderer/support.css:77 |
| (max-width: 1000px) | 1 | 1 | renderer/support.css:104 |
| (prefers-reduced-motion: reduce) | 1 | 1 | renderer/titlebar.css:136 |
| (max-height: 700px) | 1 | 1 | renderer/titlebar.css:170 |
| (max-width: 1200px) | 1 | 1 | renderer/users.css:42 |
| (max-width: 900px) | 1 | 1 | renderer/users.css:111 |
| (max-width: 1100px) | 1 | 1 | renderer/users.css:176 |
| (max-width: 1000px) | 1 | 1 | renderer/users.css:202 |
| (max-width: 900px) | 1 | 1 | renderer/users.css:232 |
| (max-width: 620px) | 1 | 1 | renderer/users.css:235 |
| (max-height: 760px) | 2 | 2 | renderer/users.css:304 |
| (max-width:720px) | 2 | 3 | renderer/whatsapp.css:138 |
| (prefers-color-scheme: light) | 1 | 19 | renderer/license-settings.html:44 |
| (max-width: 620px) | 5 | 6 | renderer/license-settings.html:242 |
| (max-width: 1160px) | 2 | 6 | renderer/license.html:282 |
| (max-width: 620px) | 4 | 7 | renderer/license.html:286 |
| (max-height: 780px) | 15 | 23 | renderer/license.html:306 |
| (max-height: 620px) | 7 | 7 | renderer/license.html:323 |
| screen | 1 | 1 | renderer/app.js:84 |
| print | 2 | 2 | renderer/src/export/engine.js:655 |
| print | 1 | 1 | renderer/src/modules/dashboard.js:2416 |
| print | 2 | 2 | renderer/src/modules/students.js:3569 |
| print | 1 | 2 | renderer/src/modules/students.js:4987 |

### 8.2 Breakpoints — 41 distinct

| Breakpoint | px | Count | Locations |
|---|---|---|---|
| max-height: 620px | 620 | 1 | renderer/license.html:323 |
| max-height: 640px | 640 | 8 | renderer/chrome.css:772; renderer/dashboard.css:1105,2269,2281 (+3); renderer/login.css:298 |
| max-height: 665px | 665 | 8 | renderer/dashboard.css:1647,1668,1779 (+5) |
| max-height: 700px | 700 | 3 | renderer/dashboard.css:1063,2435; renderer/titlebar.css:170 |
| max-height: 720px | 720 | 9 | renderer/chrome.css:765; renderer/dashboard.css:1625,1778,2005 (+5) |
| min-height: 721px | 721 | 1 | renderer/dashboard.css:2534 |
| max-height: 760px | 760 | 5 | renderer/activitylog.css:149; renderer/dashboard.css:2144; renderer/settings.css:761,1206; renderer/users.css:304 |
| max-height: 780px | 780 | 2 | renderer/login.css:285; renderer/license.html:306 |
| max-height: 800px | 800 | 2 | renderer/dashboard.css:2534; renderer/forms.css:418 |
| max-height: 820px | 820 | 1 | renderer/chrome.css:896 |
| max-height: 900px | 900 | 1 | renderer/dashboard.css:763 |
| max-width: 560px | 560 | 1 | renderer/cancellations.css:185 |
| max-width: 600px | 600 | 2 | renderer/style.css:1999,5012 |
| max-width: 620px | 620 | 3 | renderer/users.css:235; renderer/license-settings.html:242; renderer/license.html:286 |
| max-width: 640px | 640 | 4 | renderer/chrome.css:410; renderer/payments.css:806,852; renderer/reports.css:257 |
| max-width: 700px | 700 | 2 | renderer/forms.css:247; renderer/students.css:878 |
| max-width: 720px | 720 | 3 | renderer/dashboard.css:514,655; renderer/whatsapp.css:138 |
| max-width: 760px | 760 | 2 | renderer/former.css:174; renderer/payments.css:1448 |
| max-width: 820px | 820 | 4 | renderer/issues.css:163; renderer/onboarding.css:171; renderer/payments.css:576; renderer/settings.css:454 |
| max-width: 880px | 880 | 3 | renderer/dashboard.css:482; renderer/forms.css:545; renderer/students.css:1679 |
| max-width: 900px | 900 | 22 | renderer/chrome.css:402,710; renderer/dashboard.css:710,1222; renderer/forms.css:243; renderer/listkit.css:215; +8 files |
| max-width: 940px | 940 | 1 | renderer/login.css:277 |
| max-width: 980px | 980 | 1 | renderer/dashboard.css:651 |
| min-width: 1000px | 1000 | 1 | renderer/dashboard.css:1027 |
| max-width: 1000px | 1000 | 6 | renderer/reports.css:134; renderer/settings.css:243; renderer/students.css:516; renderer/support.css:77,104; +1 files |
| max-width: 1080px | 1080 | 3 | renderer/backup.css:130; renderer/payments.css:1164; renderer/settings.css:1015 |
| max-width: 1100px | 1100 | 6 | renderer/chrome.css:601; renderer/dashboard.css:3231; renderer/reports.css:253; renderer/settings.css:230,571; +1 files |
| max-width: 1150px | 1150 | 2 | renderer/dashboard.css:1333; renderer/students.css:864 |
| max-width: 1160px | 1160 | 1 | renderer/license.html:282 |
| max-width: 1180px | 1180 | 6 | renderer/activitylog.css:56; renderer/dashboard.css:282,1172; renderer/expenses.css:45; renderer/payments.css:346; +1 files |
| min-width: 1180px | 1180 | 1 | renderer/archive.css:217 |
| max-width: 1200px | 1200 | 8 | renderer/dashboard.css:646,709,1027 (+3); renderer/students.css:1137; renderer/users.css:42 |
| min-width: 1201px | 1201 | 1 | renderer/dashboard.css:826 |
| max-width: 1240px | 1240 | 1 | renderer/dashboard.css:513 |
| max-width: 1300px | 1300 | 1 | renderer/students.css:860 |
| max-width: 1320px | 1320 | 2 | renderer/expenses.css:43; renderer/students.css:845 |
| min-width: 1330px | 1330 | 1 | renderer/dashboard.css:385 |
| max-width: 1340px | 1340 | 1 | renderer/settings.css:1222 |
| max-width: 1360px | 1360 | 1 | renderer/dashboard.css:1169 |
| max-width: 1400px | 1400 | 4 | renderer/payments.css:1249,1259; renderer/students.css:1003; renderer/style.css:1248 |
| max-width: 1600px | 1600 | 1 | renderer/dashboard.css:826 |

### 8.3 Electron window configuration

The main-window row (main.js:1194) was read directly from main.js:1194-1216; the automated BrowserWindow scan did not capture it. main.js:1517 is the hidden PDF-render window (no size set).

| Location | width | height | minWidth | minHeight | resizable | frame | zoomFactor | backgroundColor |
|---|---|---|---|---|---|---|---|---|
| main.js:978 | 780 | 760 |  |  | (default true) |  | (not set) | '#1a1c1e' |
| main.js:1171 | 760 | 620 | 620 | 480 | (default true) |  | (not set) | '#1a1c1e' |
| main.js:1194 | 1400 | 900 | 900 | 600 | (default true) | false | (not set) | '#1a1c1e' |
| main.js:1517 |  |  |  |  | (default true) |  | (not set) |  |
| main.js:1576 | 1050 | 750 | 600 | 400 | (default true) |  | (not set) | '#ffffff' |

Zoom/DPI handling in code: setZoomLevel( (main.js:1129); setZoomLevel( (main.js:1130). Runtime (scratch profile): zoomFactor 1, minimum size 900×600, resizable true, display scaleFactor 1. Behaviour at scale factors other than the measuring display is UNKNOWN (would need runs on displays at 125%/150%).

### 8.4 Horizontal overflow by window width (light theme, sample data)

Columns per width: page overflow px (document scrollWidth − clientWidth) / #content overflow px / count of inner horizontal scroll containers / count of clipped (overflow hidden) boxes wider than themselves.

Window state at launch on the measuring machine: maximized true, content bounds 1366×728. Window resizing beyond the display width is limited by the OS, so widths the window could not take were applied as an emulated viewport (Playwright page.setViewportSize), which changes the CSS layout width but not the OS window.

Requested width → recorded window.innerWidth (method): 1400 → 1400 (BrowserWindow.setBounds); 1366 → 1366 (BrowserWindow.setBounds); 1280 → 1280 (page.setViewportSize (emulated viewport)); 1100 → 1100 (page.setViewportSize (emulated viewport)); 1024 → 1024 (page.setViewportSize (emulated viewport)); 900 → 900 (page.setViewportSize (emulated viewport)).

| Page | 1400px | 1366px | 1280px | 1100px | 1024px | 900px |
|---|---|---|---|---|---|---|
| dashboard | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 3 | 0 / 0 / 0 / 13 | 0 / 0 / 0 / 17 | 0 / 0 / 0 / 10 |
| rooms | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 1 |
| students | 0 / 0 / 0 / 3 | 0 / 0 / 0 / 4 | 0 / 0 / 0 / 4 | 0 / 0 / 1 / 18 | 0 / 0 / 1 / 18 | 0 / 0 / 1 / 16 |
| payments | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| expenses | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 0 / 0 |
| cancellations | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| former | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| reports | 0 / 0 / 1 / 0 | 0 / 0 / 2 / 0 | 0 / 0 / 2 / 5 | 0 / 11 / 2 / 0 | 0 / 40 / 2 / 4 | 0 / 0 / 2 / 0 |
| issues | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 |
| activitylog | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| backup | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| users | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| settings | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 22 / 1 / 0 | 0 / 0 / 0 / 0 |
| support | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| archive | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| maintenance | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 | 0 / 0 / 1 / 0 |
| complaints | 0 / 0 / 0 / 1 | 0 / 0 / 0 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 | 0 / 0 / 1 / 1 |
| addstudent | 0 / 0 / 0 / 2 | 0 / 0 / 0 / 2 | 0 / 0 / 0 / 2 | 0 / 0 / 0 / 6 | 0 / 0 / 0 / 7 | 0 / 0 / 0 / 0 |
| addpayment | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |

Smallest tested width at which the page itself has no horizontal overflow (criterion: document and #content overflow ≤ 0; inner scroll containers such as panning tables are allowed). Widths tested: 1400, 1366, 1280, 1100, 1024, 900 (900 = window minimum).

| Page | Smallest width meeting the criterion | Inner scroll containers at that width (samples) |
|---|---|---|
| dashboard | 900px |  |
| rooms | 900px |  |
| students | 900px | div.stu-table-wrap (+145px) |
| payments | 900px | div.pay-table-wrap (+251px) |
| expenses | 900px |  |
| cancellations | 900px | div.lk-table-wrap (+113px) |
| former | 900px | div.lk-table-wrap (+62px) |
| reports | 900px | div.rpt-tabs (+273px) ; div.rpt-tbl-wrap (+153px) |
| issues | 900px | div.lk-table-wrap.iss-wrap (+198px) |
| activitylog | 900px | div.set-table-wrap (+45px) |
| backup | 900px |  |
| users | 900px | div.set-table-wrap (+45px) |
| settings | 900px |  |
| support | 900px |  |
| archive | 900px |  |
| maintenance | 900px | div.lk-table-wrap.iss-wrap (+168px) |
| complaints | 900px | div.lk-table-wrap.iss-wrap (+198px) |
| addstudent | 900px |  |
| addpayment | 900px |  |

## 9. Component inventory

Method: a class name belongs to a component when it matches the pattern shown; its "visual signature" is the set of visual declarations (background, colour, border, radius, padding, font-size/weight, height, shadow, text-transform, letter-spacing) from rules where the class is the last compound of the selector with no pseudo-class and no @media. Variants = distinct class names with a non-empty signature. Near-duplicates = signatures that differ by ≤2 declarations (both with ≥3). Re-declarations = rules defining the class.

### button — 104 variants; 8 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| act | padding:14px 16px; border:1px solid var(--border); border-radius:13px; background:var(--surface) | 1 | renderer/license-settings.html |
| act__d | font-size:11.5px; color:var(--text3) | 1 | renderer/license-settings.html |
| act__ico | height:40px; border-radius:11px; background:var(--accent-dim); color:var(--accent) | 4 | renderer/license-settings.html |
| act__t | font-size:13.5px; font-weight:700; color:var(--accent-ink) | 3 | renderer/license-settings.html |
| activate-btn | height:58px; background:linear-gradient(135deg, #059669 0%, #10b981 100%); border:none; border-radius:12px; box-shadow:0 8px 22px rgba(5, 150, 105, .28); font-size:16px; font-weight:700; color:#fff | 2 | renderer/license.html |
| al-act | font-size:11.5px; color:var(--text3) | 1 | renderer/activitylog.css |
| arc-btn | height:38px; padding:0 14px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:13px; font-weight:600 | 1 | renderer/archive.css |
| arc-btn--primary | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/archive.css |
| arch-add-btn | padding:6px 14px; border-radius:8px; border:1px solid rgba(52,211,153,0.4); background:rgba(52,211,153,0.1); color:var(--green); font-size:11px; font-weight:700 | 1 | renderer/style.css |
| arch-back-btn | padding:5px 12px; border-radius:7px; border:1px solid var(--border2); background:transparent; color:var(--text2); font-size:11px; font-weight:600 | 1 | renderer/style.css |
| arch-export-btn | padding:5px 10px; border-radius:7px; border:1px solid var(--border2); background:transparent; color:var(--text2); font-size:11px | 1 | renderer/style.css |
| arch-filter-btn | padding:5px 10px; border-radius:7px; border:1px solid var(--border2); background:transparent; color:var(--text2); font-size:11px; font-weight:600 | 1 | renderer/style.css |
| arch-mc-add-btn | font-size:10px; padding:2px 8px; border-radius:6px; border:1px solid rgba(0,0,0,0.3); background:rgba(0,0,0,0.08); color:var(--accent-strong) | 1 | renderer/style.css |
| arch-print-btn | padding:6px 14px; border-radius:8px; border:1px solid rgba(0,0,0,0.3); background:rgba(0,0,0,0.08); color:var(--accent-strong); font-size:11px; font-weight:700 | 1 | renderer/style.css |
| arch-tab-btn | padding:11px 16px; font-size:12px; font-weight:600; color:var(--green); border:none; border-bottom:2px solid transparent; background:transparent | 2 | renderer/style.css |
| btn | box-shadow:none; min-height:38px; padding:0 15px; border-radius:10px; font-size:13px; font-weight:700; border:1px solid var(--border2); height:38px; background:var(--surface); color:var(--accent-ink); border-color:var(-- | 10 | renderer/forms.css, renderer/style.css, renderer/support.css, renderer/ui-kit.css, renderer/license-settings.html |
| btn-circle | height:36px; border-radius:50%; border:1px solid var(--border2); background:var(--bg3); color:var(--text2); font-size:15px | 1 | renderer/style.css |
| btn-danger | background:var(--red-dim); border:1px solid rgba(248, 113, 113, 0.3); color:var(--red) | 2 | renderer/style.css |
| btn-ent | padding:var(--space-2) var(--space-4); font-size:var(--text-sm); font-weight:var(--weight-medium); border-radius:var(--radius-md); border:1px solid transparent | 1 | renderer/components.css |
| btn-ent--danger | background:var(--danger-fg); color:var(--text-on-accent); border-color:var(--danger-fg) | 1 | renderer/components.css |
| btn-ent--lg | padding:var(--space-3) var(--space-6); font-size:var(--text-base) | 1 | renderer/components.css |
| btn-ent--primary | background:var(--accent-600); color:var(--text-on-accent); border-color:var(--accent-600) | 1 | renderer/components.css |
| btn-ent--secondary | background:rgba(255, 255, 255, 0.04); border-color:rgba(255, 255, 255, 0.12); color:var(--text-primary) | 3 | renderer/components.css |
| btn-ent--sm | padding:2px var(--space-2); font-size:var(--text-xs) | 1 | renderer/components.css |
| btn-ent--tertiary | background:transparent; color:var(--text-secondary); border-color:transparent | 1 | renderer/components.css |
| btn-ghost | background:transparent; border:1px solid var(--border2); color:var(--text2); border-radius:var(--radius-sm); padding:8px 16px; font-size:13px; font-weight:500 | 1 | renderer/style.css |
| btn-gold | background:linear-gradient(135deg, var(--accent), #9a7a1a); color:#0a0a00; box-shadow:var(--shadow-accent) | 1 | renderer/style.css |
| btn-icon | height:32px; padding:0; border-radius:var(--radius-sm) | 1 | renderer/style.css |
| btn-pill | border-radius:100px; padding:8px 20px; letter-spacing:0.2px | 1 | renderer/style.css |
| btn-primary | background:var(--accent); color:var(--text-on-accent); box-shadow:none; height:40px; border-radius:11px; padding:0 16px; font-size:13px; font-weight:600 | 6 | renderer/chrome.css, renderer/style.css |
| btn-secondary | background:var(--bg3); border:1px solid var(--border2); color:var(--text2) | 1 | renderer/style.css |
| btn-sm | padding:6px 12px; font-size:12px | 1 | renderer/style.css |
| btn-success | height:40px; border-radius:11px; padding:0 16px; font-size:13px; font-weight:600; background:var(--green-dim); border:1px solid rgba(52, 211, 153, 0.3); color:var(--green) | 2 | renderer/chrome.css, renderer/style.css |
| copy-btn | height:38px; padding:0 16px; background:#ecfdf5; border:1px solid var(--blue-line); border-radius:10px; font-size:13px; font-weight:650; color:var(--green); border-color:var(--green) | 2 | renderer/license.html |
| dash-btn | font-size:11px; font-weight:600; border-radius:8px; padding:5px 10px; background:var(--card); border:1px solid var(--border2); color:var(--text2) | 1 | renderer/dashboard.css |
| dash-icon-btn | height:30px; border-radius:8px; background:var(--x-slate-tint); color:var(--x-slate-fg); border:none | 3 | renderer/dashboard.css |
| dash-icon-btn--wa | color:var(--x-green); background:var(--x-green-tint) | 2 | renderer/dashboard.css |
| dash-rp-more__btn | height:26px; border-radius:7px; border:none; background:transparent; color:var(--text3) | 1 | renderer/dashboard.css |
| dl-act | padding:13px 6px; border:1px solid var(--border); border-radius:10px; background:var(--dh-bg); color:var(--text2); border-color:transparent | 2 | renderer/dashboard.css |
| dl-act__go | color:var(--dh) | 2 | renderer/dashboard.css |
| dl-act__ic | color:var(--dh) | 2 | renderer/dashboard.css |
| dl-act__label | font-size:11px; font-weight:600; color:var(--text) | 2 | renderer/dashboard.css |
| exp-act | height:30px; border-radius:9px; background:var(--dh-bg); color:var(--dh); border:1px solid transparent | 1 | renderer/expenses.css |
| hdr-btn | height:40px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2) | 1 | renderer/chrome.css |
| hdr-btn__count | height:17px; padding:0 4px; border-radius:999px; background:#ef4444; color:#fff; font-size:10px; font-weight:800; border:2px solid var(--card) | 1 | renderer/chrome.css |
| lic-act | padding:13px 14px; background:var(--bg3); border:1px solid var(--border); border-radius:12px | 1 | renderer/settings.css |
| lic-act__go | height:32px; padding:0 15px; border-radius:9px; background:var(--card); border:1px solid var(--dh); color:var(--dh); font-size:12.5px; font-weight:700 | 1 | renderer/settings.css |
| lic-act__i | height:34px; border-radius:10px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| lic-act__s | font-size:11.5px; color:var(--text3) | 1 | renderer/settings.css |
| lic-act__t | font-size:13px; font-weight:700; color:var(--text) | 1 | renderer/settings.css |
| lk-act | border-color:transparent; background:var(--card); padding:0 10px; height:30px; border-radius:9px; color:var(--text2); border:1px solid var(--border2); font-size:11.5px; font-weight:600 | 2 | renderer/cancellations.css, renderer/listkit.css |
| lk-act--hue | padding:0 9px; font-size:11.5px; font-weight:700; background:var(--dh-bg); color:var(--dh) | 2 | renderer/former.css, renderer/listkit.css |
| lk-act--icon | height:26px; padding:0 | 3 | renderer/issues.css, renderer/listkit.css, renderer/settings.css |
| lk-btn | height:40px; padding:0 14px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:13px; font-weight:600 | 2 | renderer/listkit.css |
| lk-btn--go | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/listkit.css |
| lk-btn--on | border-color:var(--accent); color:var(--accent-strong); background:var(--accent-dim) | 1 | renderer/listkit.css |
| lk-btn__count | height:18px; padding:0 5px; border-radius:999px; background:var(--accent); color:var(--text-on-accent); font-size:10px; font-weight:800 | 1 | renderer/listkit.css |
| lk-kebab | height:28px; padding:0; border-radius:8px; background:var(--bg3); border:1px solid var(--border); color:var(--accent); font-size:12px; font-weight:600; border-color:var(--accent) | 2 | renderer/listkit.css |
| login-warden-btn | padding:14px 10px; border-radius:14px; border:1.5px solid rgba(255,255,255,0.06); background:rgba(14,165,233,0.05); border-color:rgba(14,165,233,0.3); box-shadow:0 0 12px rgba(14,165,233,0.06) | 4 | renderer/style.css |
| p-act | background:#dcfce7; color:#15803d | 1 | renderer/src/modules/students.js |
| pager-btn | padding:5px 9px; font-size:12px; font-weight:600; color:#fff; background:var(--blue); border:1px solid var(--border); border-radius:7px; border-color:var(--blue) | 2 | renderer/style.css |
| pay-act | height:28px; border-radius:8px; background:var(--dh-bg); color:var(--dh); border:1px solid transparent | 2 | renderer/payments.css |
| pay-btn | height:40px; padding:0 14px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:13px; font-weight:600 | 1 | renderer/payments.css |
| pay-btn--hue | color:var(--dh); border-color:var(--dh); background:var(--dh-bg) | 1 | renderer/payments.css |
| pay-btn__count | height:18px; padding:0 5px; border-radius:999px; background:var(--accent); color:var(--text-on-accent); font-size:10px; font-weight:800 | 1 | renderer/payments.css |
| pay-col-act | padding-left:8px; padding-right:8px | 6 | renderer/payments.css |
| pdf-print-btn | padding:9px 16px; background:#155EEF; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700; letter-spacing:0.2px; box-shadow:0 4px 14px rgba(21,94,239,.28) | 3 | renderer/app.js |
| pdf-print-btn--ghost | background:#fff; color:#123B8F; border:1px solid #D9E2F2 | 1 | renderer/app.js |
| pf-btn | height:36px; padding:0 15px; border-radius:10px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:12.5px; font-weight:600 | 1 | renderer/payments.css |
| pf-btn--go | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/payments.css |
| pf-out__btn | height:26px; padding:0 11px; font-size:11px; border-radius:8px; font-weight:700; background:var(--accent); color:var(--text-on-accent); border:1px solid var(--accent) | 3 | renderer/payments.css |
| print-btn | padding:9px 22px; background:#1d4ed8; color:#fff; border:none; border-radius:8px; font-size:13px; font-weight:700 | 1 | renderer/src/modules/dashboard.js |
| pw-eye__btn | padding:0; background:transparent; border:0; border-radius:0 8px 8px 0; color:var(--text); height:30px | 4 | renderer/pw-eye.css |
| quick-action-btn | padding:16px; background:var(--bg3); border:var(--hairline); border-radius:var(--r-xl); font-size:13px; font-weight:600; color:var(--text2) | 1 | renderer/style.css |
| rm-btn | height:30px; padding:0; border-radius:6px; background:var(--red-dim); border:1px solid rgba(248, 113, 113, 0.3); color:var(--red); font-size:14px | 3 | renderer/payments.css, renderer/style.css |
| rms-btn | height:34px; padding:0 11px; border-radius:7px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:12.5px; font-weight:600 | 1 | renderer/rooms.css |
| rms-btn--go | border-color:var(--accent); color:var(--accent) | 1 | renderer/rooms.css |
| set-btn | height:32px; padding:0 18px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:13px; font-weight:600 | 8 | renderer/activitylog.css, renderer/cancellations.css, renderer/expenses.css, renderer/settings.css, renderer/users.css |
| set-btn--danger | color:var(--red) | 1 | renderer/activitylog.css |
| set-btn--go | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/settings.css |
| set-btn--sm | height:28px; padding:0 10px; font-size:11.5px | 1 | renderer/settings.css |
| set-row__i-btn | height:26px; border-radius:8px; background:none; border:1px solid transparent; color:var(--text3) | 1 | renderer/settings.css |
| sf-btn | height:32px; padding:0 10px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:12px; font-weight:600 | 4 | renderer/students.css |
| sf-btn--ghost | background:var(--dash-sunk) | 1 | renderer/students.css |
| sf-btn--go | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/students.css |
| sidebar-collapse-btn | height:22px; border-radius:50%; background:var(--bg3); color:var(--text2); border:1px solid var(--border2); padding:0; box-shadow:none | 2 | renderer/chrome.css, renderer/style.css |
| stu-act | height:24px; border-radius:6px; background:var(--card); color:var(--dh); border:1px solid var(--border2) | 2 | renderer/students.css |
| stu-btn | height:34px; padding:0 11px; border-radius:7px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:12.5px; font-weight:600 | 1 | renderer/students.css |
| stu-btn--hue | background:var(--dh-bg); border-color:var(--dh); color:var(--dh) | 1 | renderer/students.css |
| stu-btn--primary | background:var(--accent); border-color:var(--accent); color:var(--text-on-accent) | 1 | renderer/students.css |
| stu-btn__count | height:18px; padding:0 5px; border-radius:999px; background:var(--accent); color:var(--text-on-accent); font-size:10px; font-weight:800 | 1 | renderer/students.css |
| stu-kebab | height:28px; border-radius:8px; background:var(--bg3); border:1px solid var(--border); color:var(--accent); border-color:var(--accent) | 2 | renderer/students.css |
| stu-pan__act | height:34px; padding:0 8px; border-radius:8px; background:var(--ant-warning-bg); border:1px solid var(--border2); color:var(--danger-fg); font-size:11.5px; font-weight:600; border-color:transparent | 6 | renderer/students.css, renderer/users.css |
| success-btn | background:linear-gradient(135deg, #059669 0%, #10b981 100%); box-shadow:0 8px 22px rgba(5, 150, 105, .28) | 1 | renderer/license.html |
| svw-kebab | height:26px; border-radius:7px; background:var(--bg3); border:1px solid transparent; color:var(--text); border-color:var(--border2) | 2 | renderer/students.css |
| svw-row__act | color:var(--text3) | 1 | renderer/students.css |
| svw-t__kebab | padding:4px 3px | 1 | renderer/students.css |
| usr-act | padding:7px 0; border-bottom:1px solid var(--border) | 1 | renderer/users.css |
| usr-act__d | font-size:11px; font-weight:700; color:var(--text3); letter-spacing:var(--ant-num-track) | 1 | renderer/users.css |
| usr-act__t | font-size:12px; color:var(--text2) | 1 | renderer/users.css |
| wa-btn | height:44px; padding:0 17px; border-radius:11px; background:var(--bg3, var(--card)); border:1px solid var(--border2); color:var(--text2); font-size:13px; font-weight:700 | 1 | renderer/whatsapp.css |
| wa-btn--go | background:var(--wa-green-2); border-color:var(--wa-green-2); color:#fff | 1 | renderer/whatsapp.css |
| wa-note__btn | height:38px; padding:0 15px; border-radius:10px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong, var(--accent)); font-size:12.5px; font-weight:700 | 1 | renderer/whatsapp.css |
| ws__seg-b | height:28px; padding:0 12px; border-radius:7px; background:var(--accent); border:none; color:var(--text-on-accent); font-size:11.5px; font-weight:600 | 2 | renderer/payments.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| set-btn , arc-btn , lk-btn , pay-btn , sf-btn |
| arc-btn--primary , btn-ent--primary , btn-ent--danger , lk-btn--go , lk-btn--on , pf-btn--go , set-btn--go , stu-btn--primary , sf-btn--go |
| dash-btn , arch-filter-btn , arch-export-btn , arch-back-btn |
| dl-act__label , lic-act__t , act__t |
| exp-act , pay-act |
| lk-btn__count , pay-btn__count , stu-btn__count |
| pay-btn--hue , stu-btn--hue |
| rms-btn , stu-btn |

### input — 17 variants; 0 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| arm-input | border:1px solid var(--border2); border-radius:12px; background:var(--dash-sunk) | 3 | renderer/rooms.css |
| arm-input__ico | background:var(--dh-bg); color:var(--dh); border-right:1px solid var(--border); padding-top:12px | 2 | renderer/rooms.css |
| cmdk-input | background:none; border:none; color:var(--text); font-size:15px | 1 | renderer/style.css |
| extra-charge-amt-input | font-weight:700 | 2 | renderer/payments.css |
| field-err | font-size:11.5px; font-weight:600; color:var(--red) | 1 | renderer/ui-kit.css |
| field-label | font-size:11.5px; font-weight:700; letter-spacing:1.3px; text-transform:uppercase; color:var(--ink) | 1 | renderer/license.html |
| form-control | padding-left:32px; height:32px; padding:10px 14px; font-size:13.5px; min-height:80px; border-radius:var(--r-md); padding-right:32px; padding-top:8px; border:1px solid #52443a; background:var(--red-dim); background-color: | 13 | renderer/activitylog.css, renderer/forms.css, renderer/style.css, renderer/support.css, renderer/ui-kit.css |
| hf-in | border:1px solid var(--border); border-radius:9px; background:var(--bg4) | 2 | renderer/forms.css |
| hf-switch--in | border-radius:9px | 1 | renderer/issues.css |
| key-input | height:58px; padding:0 20px; background:var(--card); border:1.5px solid var(--line); border-radius:12px; font-size:17px; font-weight:600; letter-spacing:1.6px; color:var(--ink); border-color:var(--green); box-shadow:0 0  | 3 | renderer/license.html |
| lg-in | height:52px; padding:0 46px; border-radius:12px; background:var(--lg-surface); border:1.5px solid var(--lg-line); color:var(--lg-ink); font-size:14px | 1 | renderer/login.css |
| lk-sin | background:transparent; border:none; border-radius:0; box-shadow:none | 2 | renderer/listkit.css |
| pay-money--in | color:var(--ant-success-fg) | 2 | renderer/payments.css |
| pf-in | height:32px; padding:0 11px; border-radius:0; background:none; border:none; color:var(--text); font-size:12.5px; padding-left:36px; font-weight:700 | 4 | renderer/payments.css |
| set-in | height:30px; padding:0 13px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text); font-size:13px; font-weight:500; padding-right:46px; letter-spacing:var(--ant-num-track) | 3 | renderer/settings.css |
| sf-in | height:42px; padding:0 12px; border-radius:0 10px 10px 0; background:var(--card); border:1px solid var(--border2); color:var(--text); font-size:13px; padding-left:36px | 3 | renderer/students.css |
| sup-hero__in | height:42px; background:none; border:0; font-size:13px; color:var(--text) | 1 | renderer/support.css |

### select — 11 variants; 2 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| ap-mrail__sel | height:30px; padding:0 4px; background:none; border:none; color:var(--text); font-size:16px; font-weight:800; letter-spacing:-.01em | 1 | renderer/payments.css |
| arc-select | height:38px; padding:0 32px 0 13px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--text); font-size:13px; font-weight:600 | 1 | renderer/archive.css |
| exp-select | height:40px; padding:0 32px 0 13px; border-radius:11px; background:var(--bg3, var(--card)); border:1px solid var(--border2); color:var(--accent-strong); font-size:13px; font-weight:600; border-color:var(--accent) | 2 | renderer/expenses.css |
| lk-select | height:40px; padding:0 32px 0 13px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong); font-size:13px; font-weight:600; border-color:var(--accent) | 2 | renderer/listkit.css |
| pay-select | height:40px; padding:0 32px 0 13px; border-radius:11px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong); font-size:13px; font-weight:600; border-color:var(--accent) | 3 | renderer/payments.css |
| pf-sel | height:34px; padding:0 11px; border-radius:9px; background:var(--card); border:1px solid var(--border2); color:var(--text); font-size:12.5px; padding-right:32px; padding-left:36px | 3 | renderer/payments.css |
| rms-select | height:34px; padding:0 28px 0 10px; border-radius:7px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong); font-size:12.5px; font-weight:600; border-color:var(--accent) | 2 | renderer/rooms.css |
| sb-month-picker__year-select | font-size:11px; font-weight:600; color:var(--text2); background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:2px 6px | 1 | renderer/style.css |
| set-sel | height:32px; padding:0 10px; border-radius:9px; background:var(--bg3); border:1px solid var(--border); color:var(--text); font-size:12.5px; font-weight:600 | 2 | renderer/activitylog.css, renderer/settings.css |
| sf-sel | height:42px; padding:0 12px; border-radius:10px; background:var(--card); border:1px solid var(--border2); color:var(--text); font-size:13px; padding-right:32px | 2 | renderer/students.css |
| stu-select | height:34px; padding:0 28px 0 10px; border-radius:7px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong); font-size:12.5px; font-weight:600; border-color:var(--accent) | 4 | renderer/students.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| exp-select , lk-select , pay-select |
| rms-select , stu-select |

### textarea — 0 variants; 0 near-duplicate groups

none found

### checkbox / radio / switch — 7 variants; 1 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| hf-switch | border:1px solid var(--border); border-radius:11px; background:var(--bg3) | 1 | renderer/forms.css |
| hf-switch--in | border-radius:9px | 1 | renderer/issues.css |
| hf-switch__b | padding:6px 10px; border:none; border-right:1px solid var(--border); background:var(--card); color:var(--text); font-size:12px; font-weight:700; box-shadow:inset 0 2px 0 var(--accent) | 3 | renderer/forms.css, renderer/issues.css |
| lg-check | height:18px; border-radius:6px; background:var(--lg-brand-2); border:1.5px solid #CBD5E1; color:#fff; border-color:var(--lg-brand); box-shadow:0 0 0 4px rgba(59,130,246,.16) | 3 | renderer/login.css |
| lic-check | font-size:12.5px; color:var(--red) | 2 | renderer/settings.css |
| pef-messtoggle | font-size:10.5px; color:var(--text2); font-weight:600 | 1 | renderer/payments.css |
| rm-check | font-size:11px; font-weight:700; color:var(--text2) | 1 | renderer/settings.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| pef-messtoggle , rm-check |

### card / panel — 89 variants; 8 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| al-panel | height:100%; background:var(--card); border-left:1px solid var(--border) | 2 | renderer/activitylog.css, renderer/forms.css |
| al-panel-wrap | background:rgba(0, 0, 0, .38) | 2 | renderer/activitylog.css, renderer/forms.css |
| al-panel__b | padding:18px | 1 | renderer/activitylog.css |
| al-panel__h | padding:18px; border-bottom:1px solid var(--border) | 1 | renderer/activitylog.css |
| al-panel__i | height:40px; border-radius:12px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/activitylog.css |
| al-panel__s | font-size:12px; color:var(--text3) | 1 | renderer/activitylog.css |
| al-panel__t | font-size:15px; font-weight:700; color:var(--text) | 1 | renderer/activitylog.css |
| ap-card | background:var(--card); border:1px solid var(--border); border-radius:11px; box-shadow:var(--shadow-sm) | 1 | renderer/payments.css |
| ap-card__h | padding:9px 12px; border-bottom:1px solid var(--border); font-size:10px; font-weight:700; color:var(--text2); text-transform:uppercase; letter-spacing:.7px | 1 | renderer/payments.css |
| ap-card__lnk | padding:0; background:none; border:none; color:var(--accent-strong); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px | 1 | renderer/payments.css |
| arc-panel | background:var(--card); border:1px solid var(--border); border-radius:16px | 1 | renderer/archive.css |
| arc-panel__end | font-size:13px; font-weight:800; letter-spacing:var(--ant-num-track) | 1 | renderer/archive.css |
| arc-panel__head | padding:12px 16px; border-bottom:1px solid var(--border); background:var(--dash-sunk) | 1 | renderer/archive.css |
| arc-panel__n | font-size:11px; color:var(--text3) | 1 | renderer/archive.css |
| arc-panel__t | font-size:13.5px; font-weight:800; color:var(--text) | 1 | renderer/archive.css |
| arch-month-card | background:var(--card); border:var(--hairline); border-radius:var(--r-xl); padding:14px; border-color:#d7c3b5 | 6 | renderer/style.css |
| arch-ov-card | background:var(--card); border:var(--hairline); border-radius:var(--r-xl); padding:13px 14px; border-color:#d7c3b5 | 3 | renderer/style.css |
| arch-s-card | background:var(--card); border:var(--hairline); border-radius:var(--r-xl); padding:13px 16px; border-color:#d7c3b5 | 3 | renderer/style.css |
| arch-stu-card | background:var(--bg2); border:var(--hairline); border-radius:var(--r-xl); padding:10px 12px | 2 | renderer/style.css |
| arch-trend-card | background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:18px 22px | 1 | renderer/style.css |
| arm-card | background:var(--card); border:1px solid var(--border); border-radius:14px; padding:16px 18px | 1 | renderer/rooms.css |
| card | box-shadow:var(--shadow-lg); background:var(--card); border:1px solid var(--line); border-radius:20px; padding:40px 46px 0 | 7 | renderer/style.css, renderer/license-settings.html, renderer/license.html |
| card-ent | background:var(--surface); border:1px solid var(--surface-border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm) | 1 | renderer/components.css |
| card-ent__body | padding:var(--space-5) | 1 | renderer/components.css |
| card-ent__header | padding:var(--space-4) var(--space-5); border-bottom:1px solid var(--surface-divider) | 1 | renderer/components.css |
| card-ent__title | font-size:var(--text-sm); font-weight:var(--weight-semibold); color:var(--text-primary); text-transform:uppercase; letter-spacing:0.03em | 1 | renderer/components.css |
| card-title | font-size:18px; font-weight:700; color:var(--text); letter-spacing:-0.3px | 2 | renderer/style.css |
| card__body | padding:6px 18px 14px | 1 | renderer/license-settings.html |
| card__h | padding:14px 18px; border-bottom:1px solid var(--border); background:var(--surface-2) | 1 | renderer/license-settings.html |
| card__ico | height:30px; border-radius:10px; background:var(--accent-dim); color:var(--accent) | 1 | renderer/license-settings.html |
| card__t | font-size:14px; font-weight:700; color:var(--text) | 1 | renderer/license-settings.html |
| cfg-card | min-height:0; padding:16px | 2 | renderer/settings.css |
| dash-card | box-shadow:0 1px 4px rgba(0, 0, 0, 0.06), 0 0 0 1px var(--border); background:var(--card); border:var(--hairline); border-radius:var(--r-xl); border-color:#d7c3b5 | 3 | renderer/style.css |
| dash-tile__caret | font-size:20px; color:var(--text3) | 1 | renderer/dashboard.css |
| dash-tile__num | font-size:26px; font-weight:800; letter-spacing:var(--ant-num-track); color:var(--text) | 2 | renderer/dashboard.css |
| dsh-card | background:var(--card); border:1px solid var(--border); border-radius:12px; padding:9px 12px 6px; box-shadow:0 2px 8px rgba(15, 23, 42, .06); min-height:0; padding-bottom:8px | 6 | renderer/dashboard.css |
| lk-panel | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:14px 16px | 1 | renderer/listkit.css |
| panel | background:var(--panel); border:1px solid #e2e8f0; border-radius:12px; padding:16px 18px | 2 | renderer/recovery.html, renderer/src/modules/students.js |
| panel__t | font-size:12.5px; font-weight:800; color:#1d4ed8; padding-bottom:8px; border-bottom:2px solid #dbeafe | 1 | renderer/src/modules/students.js |
| pay-panel | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:14px 16px | 1 | renderer/payments.css |
| rms-card | background:var(--card); border:1px solid var(--border); border-radius:10px | 1 | renderer/rooms.css |
| rms-card__beds | padding:3px 8px; border-radius:6px; background:rgba(21,34,56,.72); border:none; color:#fff; font-size:10.5px; font-weight:600; letter-spacing:var(--ant-num-track) | 1 | renderer/rooms.css |
| rms-card__body | padding:12px 13px 13px | 1 | renderer/rooms.css |
| rms-card__num | font-size:15px; font-weight:700; letter-spacing:var(--ant-num-track); color:var(--text) | 1 | renderer/rooms.css |
| rms-card__pic | height:112px; background:var(--dash-sunk); border-bottom:1px solid var(--border); color:var(--text3) | 1 | renderer/rooms.css |
| rms-card__state | padding:3px 9px; border-radius:6px; background:var(--dh-bg); color:var(--dh); font-size:11px; font-weight:700 | 1 | renderer/rooms.css |
| rms-card__type | padding:1px 7px; border-radius:10px; background:var(--accent-dim); color:var(--accent-strong); font-size:11px; font-weight:600 | 1 | renderer/rooms.css |
| rms-card__vac | padding:4px 10px; border-radius:999px; background:var(--amber-dim); border:1px solid var(--amber); color:var(--amber); font-size:10.5px; font-weight:700 | 1 | renderer/rooms.css |
| rms-panel | background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:11px 12px | 1 | renderer/rooms.css |
| room-card | background:var(--card); border:1px solid #d7c3b5; border-radius:var(--r-xl); padding:16px; border-color:rgba(255,180,171,0.20) | 7 | renderer/style.css |
| rpt-card | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:16px 18px | 2 | renderer/reports.css |
| rpt-card__a | height:34px; padding:0 12px; border-radius:9px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:12px; font-weight:600 | 3 | renderer/reports.css |
| rpt-card__h | font-size:14.5px; font-weight:700; color:var(--text) | 1 | renderer/reports.css |
| rpt-card__hs | font-size:12.5px; font-weight:500; color:var(--text3) | 1 | renderer/reports.css |
| rpt-tile | padding:15px 12px; border-radius:13px; background:var(--card); border:1px solid var(--border) | 1 | renderer/reports.css |
| rpt-tile__i | height:34px; border-radius:10px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/reports.css |
| rpt-tile__l | font-size:12px; font-weight:600; text-transform:none; letter-spacing:0; color:var(--text3) | 2 | renderer/reports.css |
| rpt-tile__s | font-size:10.5px; color:var(--text3) | 2 | renderer/reports.css |
| rpt-tile__v | font-size:22px; font-weight:800; color:var(--dh); letter-spacing:var(--ant-num-track) | 2 | renderer/reports.css |
| set-card | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:20px 22px | 1 | renderer/settings.css |
| sf-idcard__l | font-size:11px; color:var(--text3) | 1 | renderer/students.css |
| sf-idcard__note | padding:5px 11px; border-radius:999px; background:var(--accent-dim); color:var(--accent-strong); font-size:11px; font-weight:600 | 1 | renderer/students.css |
| sf-idcard__v | font-size:24px; font-weight:800; letter-spacing:var(--ant-num-track); color:var(--accent-strong) | 1 | renderer/students.css |
| skeleton-card | height:80px; border-radius:var(--radius) | 1 | renderer/style.css |
| stat-card | box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(59,130,246,0.05); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-card); padding:20px; border-color:rgba(0,0,0,0.06) | 7 | renderer/style.css |
| stat-card-ent | background:var(--surface); border:1px solid var(--surface-border); border-radius:var(--radius-lg); padding:var(--space-5); box-shadow:var(--shadow-sm) | 1 | renderer/components.css |
| stat-card-ent__icon | color:var(--gray-400); background:rgba(255, 255, 255, 0.06); height:36px; border-radius:var(--radius-md) | 3 | renderer/components.css |
| stat-card-ent__label | font-size:var(--text-xs); font-weight:var(--weight-medium); color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.04em | 1 | renderer/components.css |
| stat-card-ent__progress | height:3px; background:rgba(255, 255, 255, 0.06); border-radius:2px | 3 | renderer/components.css |
| stat-card-ent__progress-fill | height:100%; background:var(--accent-600); border-radius:2px | 1 | renderer/components.css |
| stat-card-ent__sublabel | font-size:var(--text-sm); color:var(--text-tertiary) | 1 | renderer/components.css |
| stat-card-ent__value | font-size:var(--text-3xl); font-weight:var(--weight-semibold); color:var(--text-primary); letter-spacing:var(--ant-num-track) | 1 | renderer/components.css |
| stu-pan__card | padding:9px 11px; background:var(--card); border:1px solid var(--border); border-radius:11px | 2 | renderer/students.css |
| stu-pan__card__h | font-size:12.5px; font-weight:700; color:var(--text) | 1 | renderer/students.css |
| stu-pan__card__i | height:24px; border-radius:7px; background:var(--ant-success-bg); color:var(--ant-success-fg) | 2 | renderer/students.css |
| stu-panel | background:var(--card); border:1px solid var(--border); border-radius:var(--radius); padding:11px 12px | 1 | renderer/students.css |
| svc-card | border:1px solid var(--border); border-radius:14px; background:var(--card); padding:14px 15px | 1 | renderer/settings.css |
| svc-card__f | font-size:11.5px; color:var(--text3) | 1 | renderer/settings.css |
| svc-card__t | font-size:13px; font-weight:800; color:var(--text) | 1 | renderer/settings.css |
| svw-card | background:var(--card); border:1px solid var(--border); border-radius:14px; padding:6px 16px 10px | 1 | renderer/students.css |
| svw-card--flush | padding:0 | 1 | renderer/students.css |
| svw-card__head | padding:14px 0 12px; border-bottom:1px solid var(--border); font-size:13px; font-weight:700; color:var(--text) | 1 | renderer/students.css |
| svw-card__head--bar | padding:14px 16px; background:var(--dash-sunk); font-size:12px | 2 | renderer/students.css |
| svw-card__ico | height:28px; border-radius:9px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/students.css |
| svw-card__meta | font-size:12px; font-weight:500; color:var(--text3) | 2 | renderer/students.css |
| sxp-card | padding:12px 13px 11px; background:var(--ant-warning-bg); border:1px solid var(--border); border-radius:12px; border-color:var(--ant-warning-fg) | 3 | renderer/dashboard.css |
| wa-card | padding:15px; border-radius:13px; background:var(--card); border:1px solid var(--border) | 1 | renderer/whatsapp.css |
| wa-card__s | font-size:11.5px; color:var(--text3) | 1 | renderer/whatsapp.css |
| wa-card__t | font-size:13.5px; font-weight:700; color:var(--text) | 1 | renderer/whatsapp.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| al-panel__i , rpt-tile__i , svw-card__ico |
| al-panel__t , arc-panel__t , arc-panel__end , dash-tile__num , rpt-card__h , rpt-tile__v , rpt-card__hs , rms-card__num , svc-card__t , sf-idcard__v , svw-card__meta , stu-pan__card__h , card-title , wa-card__t , card__t |
| arc-panel , lk-panel , pay-panel , ap-card , rpt-card , rpt-tile , rms-panel , rms-card , arm-card , set-card , svc-card , stu-panel , svw-card , stu-pan__card , arch-trend-card , wa-card |
| arc-panel__head , card__h |
| stat-card-ent , card-ent |
| stat-card-ent__progress , stat-card-ent__progress-fill |
| rms-card__type , sf-idcard__note |
| dash-card , arch-s-card , arch-month-card , arch-ov-card |

### table — 74 variants; 6 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| arc-table | font-size:12.5px | 1 | renderer/archive.css |
| arch-cat-row | padding:4px 8px; border-radius:6px | 1 | renderer/style.css |
| arch-hb-net-row | font-weight:700 | 1 | renderer/style.css |
| canc-set__row | padding:7px 12px; font-size:12.5px; border-bottom:1px solid var(--border2) | 1 | renderer/cancellations.css |
| conn-row | padding:12px 14px; border-bottom:1px solid var(--border) | 2 | renderer/settings.css |
| conn-row__i | height:38px; border-radius:11px; background:var(--c-bg); color:var(--c-fg) | 1 | renderer/settings.css |
| conn-row__n | font-size:11.5px; color:var(--text3); border-left:1px solid var(--border); padding-left:14px; min-height:18px | 1 | renderer/settings.css |
| conn-row__s | font-size:11.5px; color:var(--text3) | 1 | renderer/settings.css |
| conn-row__t | font-size:13px; font-weight:700; color:var(--text) | 1 | renderer/settings.css |
| dash-row-b | height:254px | 9 | renderer/dashboard.css |
| dl-glance__row | padding:2px 14px; background:none; border:0; border-bottom:1px solid var(--border); color:var(--text2) | 3 | renderer/dashboard.css |
| dl-meth__row | padding:6px 4px; border-radius:8px; background:none; border:none; color:inherit | 4 | renderer/dashboard.css |
| dl-occ__row | font-size:12px; color:var(--text2) | 1 | renderer/dashboard.css |
| dl-rem__row | padding:10px 14px; background:none; border:0; border-bottom:1px solid var(--border) | 1 | renderer/dashboard.css |
| editable-cell | border-bottom:1px dashed transparent; padding:2px 4px; border-radius:4px | 1 | renderer/style.css |
| empty-row | font-size:10px; color:#94a3b8; padding:5px 0 | 1 | renderer/src/modules/dashboard.js |
| help-row | padding:9px 11px; border:1px solid var(--line); border-radius:10px; font-size:11.5px; font-weight:600; color:var(--blue) | 1 | renderer/license.html |
| hi-id__row | padding:7px 0 | 1 | renderer/settings.css |
| lic-enforce__row | padding:5px 0 | 1 | renderer/settings.css |
| lic-row | padding:10px 12px; border-bottom:1px solid var(--border) | 2 | renderer/settings.css |
| lic-row__l | font-size:12px; color:var(--text3) | 1 | renderer/settings.css |
| lic-row__lock | color:var(--text3) | 1 | renderer/settings.css |
| lic-row__v | font-size:12.5px; font-weight:600; color:var(--text3); letter-spacing:.06em | 6 | renderer/settings.css |
| lk-table-wrap | border-radius:12px; border:1px solid var(--border) | 1 | renderer/listkit.css |
| msf-row | padding:7px 0; border-bottom:1px solid var(--border) | 1 | renderer/forms.css |
| msf-row__dash | font-weight:500; color:var(--text3) | 1 | renderer/forms.css |
| msf-row__i | color:var(--text3) | 1 | renderer/forms.css |
| msf-row__k | font-size:11.5px; color:var(--text3) | 1 | renderer/forms.css |
| msf-row__v | font-size:12.5px; font-weight:600; color:var(--text) | 1 | renderer/forms.css |
| pay-pop__row | padding:8px 9px; border-radius:9px; font-size:13px; color:var(--text2) | 1 | renderer/payments.css |
| pay-table-wrap | border-radius:12px; border:1px solid var(--border) | 3 | renderer/payments.css |
| pef-sum__row | padding:8px 13px; font-size:12px; color:var(--text2); border-top:1px solid var(--border) | 2 | renderer/payments.css |
| pf-out__row | padding:7px 9px; background:var(--card); border:1px solid var(--border); border-radius:8px | 2 | renderer/payments.css |
| rms-row | font-size:11.5px | 1 | renderer/rooms.css |
| room-meta-row | font-size:12px | 1 | renderer/style.css |
| room-type-row | background:var(--bg3); border:var(--hairline); border-radius:var(--r-md); padding:12px 14px | 2 | renderer/style.css |
| row | padding:12px 0; border-bottom:1px solid var(--border) | 1 | renderer/license-settings.html |
| row__k | font-size:12.5px; color:var(--text3); font-weight:500 | 1 | renderer/license-settings.html |
| row__v | font-size:11.5px; color:var(--text3); letter-spacing:.6px; font-weight:700 | 5 | renderer/license-settings.html |
| rt-row | padding:2px 10px; border-radius:12px; background:var(--card); border:1px solid var(--border); padding-top:3px; padding-bottom:3px | 6 | renderer/dashboard.css |
| rt-row__bar | height:7px; border-radius:999px; background:var(--dash-track) | 4 | renderer/dashboard.css |
| rt-row__ic | height:22px; border-radius:7px | 3 | renderer/dashboard.css |
| rt-row__name | font-size:12px; font-weight:700; color:var(--text) | 2 | renderer/dashboard.css |
| rt-row__pct | font-size:12px; font-weight:800; letter-spacing:var(--ant-num-track) | 2 | renderer/dashboard.css |
| rt-row__rooms | font-size:11px; color:var(--text2); letter-spacing:var(--ant-num-track); font-weight:600 | 3 | renderer/dashboard.css |
| set-row | padding:12px 14px; border-bottom:1px solid var(--border) | 1 | renderer/settings.css |
| set-row__i | height:38px; border-radius:11px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| set-row__i-btn | height:26px; border-radius:8px; background:none; border:1px solid transparent; color:var(--text3) | 1 | renderer/settings.css |
| set-row__s | font-size:11.5px; color:var(--text3) | 1 | renderer/settings.css |
| set-row__t | font-size:13px; font-weight:700; color:var(--text) | 1 | renderer/settings.css |
| set-row__why | padding:9px 11px; border-radius:9px; background:var(--ant-warning-bg); border:1px solid var(--border); font-size:11.5px; color:var(--text2) | 2 | renderer/settings.css |
| set-table-wrap | border:1px solid var(--border); border-radius:12px; min-height:0 | 2 | renderer/settings.css |
| stu-cn-row | padding:10px 14px; border-bottom:1px solid var(--border) | 1 | renderer/students.css |
| stu-pop__row | padding:8px 9px; border-radius:9px; font-size:13px; color:var(--text2) | 1 | renderer/students.css |
| stu-table-wrap | border-radius:12px; border:1px solid var(--border) | 1 | renderer/students.css |
| student-row | padding:3px 0; border-bottom:1px solid #f8fafc; font-size:10px | 1 | renderer/src/modules/dashboard.js |
| sup-row | padding:10px 14px; border-bottom:1px solid var(--border) | 1 | renderer/support.css |
| sup-row__l | font-size:12px; color:var(--text3) | 1 | renderer/support.css |
| sup-row__v | font-size:12.5px; font-weight:600; color:var(--text); letter-spacing:var(--ant-num-track) | 2 | renderer/support.css |
| svw-row | padding:10px 0; border-bottom:1px solid var(--border) | 1 | renderer/students.css |
| svw-row__act | color:var(--text3) | 1 | renderer/students.css |
| svw-row__k | font-size:12px; color:var(--text3) | 1 | renderer/students.css |
| svw-row__v | font-size:13px; font-weight:500; color:var(--text3) | 2 | renderer/students.css |
| table-ent | font-size:var(--text-sm) | 1 | renderer/components.css |
| table-wrap | border-radius:var(--r-xl); border:var(--hairline); background:var(--card) | 3 | renderer/style.css |
| th-sortable | color:var(--blue) | 2 | renderer/style.css |
| usr-ho-ctable | font-size:12.5px | 1 | renderer/users.css |
| wa-row | padding:13px 15px; border-radius:13px; background:var(--card); border:1px solid var(--border) | 1 | renderer/whatsapp.css |
| wa-row__av | height:44px; border-radius:50%; background:var(--dh-bg); color:var(--dh); font-size:14px; font-weight:800 | 1 | renderer/whatsapp.css |
| wa-row__m | font-size:12px; color:var(--text3) | 1 | renderer/whatsapp.css |
| wa-row__n | font-size:14px; font-weight:800; color:var(--text) | 1 | renderer/whatsapp.css |
| wa-row__nop | color:var(--red); font-weight:600 | 1 | renderer/whatsapp.css |
| wa-row__p | font-size:11.5px; color:var(--text3); letter-spacing:var(--ant-num-track) | 1 | renderer/whatsapp.css |
| ws__row | padding:11px 14px; border-bottom:1px solid var(--border) | 2 | renderer/payments.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| rt-row__name , rt-row__rooms , msf-row__v , lic-row__v , conn-row__t , set-row__t , svw-row__v , sup-row__v , wa-row__n , row__k |
| dl-glance__row , dl-rem__row |
| pay-pop__row , stu-pop__row |
| pf-out__row , wa-row |
| conn-row__i , set-row__i |
| wa-row__p , row__v |

### modal / dialog — 23 variants; 0 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| arch-edit-overlay | background:rgba(0,0,0,.85); padding:20px | 2 | renderer/style.css |
| arch-modal | background:var(--card2); border:1px solid var(--border2); border-radius:18px; box-shadow:0 32px 80px rgba(0,0,0,0.6) | 1 | renderer/style.css |
| arch-modal-body | padding:18px 22px | 1 | renderer/style.css |
| arch-modal-close | height:32px; border-radius:8px; border:1px solid var(--border2); background:transparent; color:var(--text2); font-size:16px | 1 | renderer/style.css |
| arch-modal-header | padding:18px 22px 14px; border-bottom:1px solid var(--border); background:linear-gradient(180deg, rgba(0,0,0,0.04) 0%, transparent 100%) | 1 | renderer/style.css |
| arch-modal-overlay | background:rgba(0, 0, 0, .8); padding:20px | 2 | renderer/style.css |
| arch-modal-sub | font-size:12px; color:var(--text3) | 1 | renderer/style.css |
| arch-modal-summary | border-bottom:1px solid var(--border) | 1 | renderer/style.css |
| arch-modal-tabs | border-bottom:1px solid var(--border); padding:0 22px | 1 | renderer/style.css |
| arch-modal-title | font-size:17px; font-weight:800 | 1 | renderer/style.css |
| cmdk-overlay | background:rgba(0, 0, 0, 0.5); padding-top:12vh | 1 | renderer/style.css |
| error-flash-overlay | background:radial-gradient(ellipse at center, rgba(248,113,113,0.1) 0%, transparent 70%) | 1 | renderer/style.css |
| modal | background:var(--card); border-color:var(--border); box-shadow:0 16px 48px rgba(0,0,0,0.12); border:1px solid #d7c3b5; border-radius:var(--r-2xl) | 13 | renderer/forms.css, renderer/style.css |
| modal-body | min-height:0; padding:24px 28px | 4 | renderer/forms.css, renderer/style.css |
| modal-box | background:var(--card); border-color:var(--border); box-shadow:0 12px 48px rgba(0, 0, 0, 0.12) | 1 | renderer/style.css |
| modal-close | height:32px; border-radius:8px; background:var(--bg3); border:1px solid var(--border); color:var(--text2); font-size:15px | 1 | renderer/style.css |
| modal-footer | background:var(--card); padding:16px 24px; border-top:1px solid var(--border) | 4 | renderer/forms.css, renderer/style.css |
| modal-header | background:linear-gradient(180deg, rgba(59,130,246,0.03) 0%, transparent 100%); padding:20px 24px; border-bottom:1px solid #d7c3b5 | 7 | renderer/forms.css, renderer/style.css |
| modal-overlay | padding:16px; background:rgba(0, 0, 0, 0.75) | 5 | renderer/forms.css, renderer/style.css |
| modal-title | font-size:17px; color:var(--text); font-weight:700; letter-spacing:-0.2px | 3 | renderer/style.css |
| sf-wrap--modal | padding-bottom:0 | 1 | renderer/students.css |
| sidebar-overlay | background:rgba(26, 26, 64, 0.35) | 1 | renderer/style.css |
| success-flash-overlay | background:radial-gradient(ellipse at center, rgba(52,211,153,0.15) 0%, transparent 70%) | 1 | renderer/style.css |

### dropdown / menu — 34 variants; 4 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| bk-drop | padding:26px 18px; border-radius:14px; background:var(--accent-soft); border:1.5px dashed var(--border2); border-color:var(--accent) | 2 | renderer/backup.css |
| bk-drop__i | height:46px; border-radius:14px; background:var(--card); border:1px solid var(--border); color:var(--accent-strong) | 1 | renderer/backup.css |
| bk-drop__n | font-size:12px; font-weight:700; color:var(--accent-strong) | 1 | renderer/backup.css |
| bk-drop__s | font-size:11.5px; color:var(--text3) | 1 | renderer/backup.css |
| bk-drop__t | font-size:13.5px; font-weight:700; color:var(--text) | 1 | renderer/backup.css |
| caf-drop | background:var(--card); border:1px solid var(--border2); border-radius:10px; box-shadow:0 10px 26px rgba(15, 23, 42, .14) | 1 | renderer/cancellations.css |
| dash-rp-menu | padding:5px; background:var(--card); border:1px solid var(--border2); border-radius:11px; box-shadow:var(--shadow) | 2 | renderer/dashboard.css |
| dash-rp-menu__item | padding:8px 10px; border:none; border-radius:8px; background:transparent; color:var(--text2); font-size:12.5px; font-weight:600 | 1 | renderer/dashboard.css |
| dash-rp-menu__item--go | color:var(--green) | 1 | renderer/dashboard.css |
| hdr-menu | padding:6px; background:var(--card); border:1px solid var(--border2); border-radius:12px; box-shadow:var(--shadow) | 2 | renderer/chrome.css |
| hdr-menu__head | padding:9px 11px 7px; border-bottom:1px solid var(--border) | 1 | renderer/chrome.css |
| hdr-menu__item | padding:9px 11px; border-radius:9px; font-size:13px; font-weight:500; color:var(--text2); border:none; background:none | 1 | renderer/chrome.css |
| hdr-menu__item--danger | color:var(--red) | 1 | renderer/chrome.css |
| hdr-menu__sep | height:1px; background:var(--border) | 1 | renderer/chrome.css |
| hz-drop | background:var(--card); border:1px solid var(--border); border-radius:10px; box-shadow:0 12px 32px rgba(0, 0, 0, .28); padding:6px | 2 | renderer/titlebar.css |
| lk-rmenu | padding:5px; background:var(--card); border:1px solid var(--border2); border-radius:10px; box-shadow:0 10px 30px rgba(15,23,42,.14) | 1 | renderer/listkit.css |
| lk-rmenu__hint | font-size:10.5px; font-weight:500; color:var(--text3) | 1 | renderer/listkit.css |
| lk-rmenu__sep | height:1px; background:var(--border2) | 1 | renderer/listkit.css |
| pay-pop | padding:12px; background:var(--card); border:1px solid var(--border2); border-radius:13px; box-shadow:var(--shadow) | 1 | renderer/payments.css |
| pay-pop__row | padding:8px 9px; border-radius:9px; font-size:13px; color:var(--text2) | 1 | renderer/payments.css |
| pay-pop__sep | height:1px; background:var(--border) | 1 | renderer/payments.css |
| pay-pop__t | font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.9px; color:var(--text3) | 1 | renderer/payments.css |
| sf-drop | padding:15px 12px; border-radius:12px; background:var(--accent-dim); border:1.5px dashed var(--border2); color:var(--accent-strong); border-color:var(--accent) | 2 | renderer/students.css |
| sf-drop-item | padding:10px 13px; border-bottom:1px solid var(--border) | 1 | renderer/students.css |
| sf-drop-list | background:var(--card); border:1px solid var(--border2); border-radius:11px; box-shadow:var(--shadow) | 1 | renderer/students.css |
| stu-pop | padding:12px; background:var(--card); border:1px solid var(--border2); border-radius:13px; box-shadow:var(--shadow) | 1 | renderer/students.css |
| stu-pop__chip | padding:5px 9px; border-radius:7px; font-size:11.5px; font-weight:600; background:var(--accent); border:1px solid var(--border2); color:var(--text-on-accent); border-color:var(--accent) | 2 | renderer/students.css |
| stu-pop__fee | padding:2px 4px 8px | 1 | renderer/students.css |
| stu-pop__row | padding:8px 9px; border-radius:9px; font-size:13px; color:var(--text2) | 1 | renderer/students.css |
| stu-pop__sep | height:1px; background:var(--border) | 1 | renderer/students.css |
| stu-pop__t | font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.9px; color:var(--text3) | 1 | renderer/students.css |
| sup-pop__l | font-size:11.5px; font-weight:700; color:var(--text2) | 1 | renderer/support.css |
| tb-menu | padding:5px; border-radius:12px; background:var(--card); border:1px solid var(--border2); box-shadow:var(--shadow) | 2 | renderer/listkit.css |
| tb-menu__i | padding:9px 10px; border:none; border-radius:9px; background:none; color:var(--text) | 1 | renderer/listkit.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| bk-drop__t , bk-drop__n , sup-pop__l |
| caf-drop , hdr-menu , dash-rp-menu , tb-menu , lk-rmenu , pay-pop , stu-pop , sf-drop-list |
| pay-pop__t , stu-pop__t |
| pay-pop__row , stu-pop__row |

### tab — 14 variants; 2 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| arc-tabs | padding:4px; border-radius:12px; background:var(--dash-sunk); border:1px solid var(--border) | 1 | renderer/archive.css |
| arc-tabs__n | font-size:10.5px; font-weight:700; padding:1px 7px; border-radius:999px; background:var(--accent); color:var(--text-on-accent) | 2 | renderer/archive.css |
| arch-modal-tabs | border-bottom:1px solid var(--border); padding:0 22px | 1 | renderer/style.css |
| arch-tab-btn | padding:11px 16px; font-size:12px; font-weight:600; color:var(--green); border:none; border-bottom:2px solid transparent; background:transparent | 2 | renderer/style.css |
| arch-year-tab | padding:5px 14px; border-radius:8px; border:1px solid var(--border2); background:rgba(52, 211, 153, 0.1); color:var(--green); font-size:12px; font-weight:600; border-color:var(--green) | 3 | renderer/style.css |
| iss-tab | padding:14px 12px; border:none; border-right:1px solid var(--border); background:var(--accent-dim); color:var(--accent-strong); font-size:13px; font-weight:700 | 2 | renderer/issues.css |
| iss-tabs | background:var(--card); border:1px solid var(--border); border-radius:14px | 1 | renderer/issues.css |
| rpt-tab | height:32px; padding:0 13px; border-radius:9px; background:var(--accent); border:1px solid transparent; color:var(--text-on-accent); font-size:12.5px; font-weight:600; border-color:var(--accent) | 2 | renderer/reports.css |
| rpt-tabs | padding:4px; border-radius:12px; background:var(--dash-sunk); border:1px solid var(--border) | 1 | renderer/reports.css |
| set-tab | padding:13px 16px; color:var(--accent-strong); font-size:13px; font-weight:700 | 2 | renderer/settings.css |
| set-tabs-wrap | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:4px 6px | 1 | renderer/settings.css |
| settings-tab | background:rgba(0,0,0,0.06); color:var(--accent); padding:9px 16px; border-radius:10px; font-size:12.5px; font-weight:700; border:1px solid transparent; border-color:rgba(0,0,0,0.2); box-shadow:0 1px 6px rgba(37,99,235,0 | 5 | renderer/style.css |
| stu-pan__tab | padding:0 12px; border:0; background:none; font-size:12.5px; font-weight:600; color:var(--accent); border-bottom:2px solid transparent | 2 | renderer/students.css |
| stu-pan__tabs | height:42px; padding:0 12px; border-bottom:1px solid var(--border) | 1 | renderer/students.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| arc-tabs , rpt-tabs |
| iss-tabs , set-tabs-wrap |

### badge / pill / chip — 83 variants; 7 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| ap-chip | height:28px; border-radius:8px; background:var(--accent); border:1px solid var(--border2); color:var(--text-on-accent); font-size:11px; font-weight:800; border-color:var(--accent) | 3 | renderer/payments.css |
| arch-badge-done | background:rgba(52,211,153,0.1); color:var(--green); border:1px solid rgba(52,211,153,0.2) | 1 | renderer/style.css |
| arch-badge-empty | background:rgba(248,113,113,0.1); color:var(--red); border:1px solid rgba(248,113,113,0.2) | 1 | renderer/style.css |
| arch-badge-future | background:rgba(255,255,255,0.04); color:var(--text3); border:1px solid var(--border) | 1 | renderer/style.css |
| arch-badge-live | background:rgba(0,0,0,0.08); color:var(--accent-strong); border:1px solid rgba(0,0,0,0.2) | 1 | renderer/style.css |
| arch-mc-badge | font-size:9px; font-weight:700; padding:2px 7px; border-radius:20px | 1 | renderer/style.css |
| arch-t-badge | background:rgba(0, 0, 0, 0.04); border:1px solid var(--border); border-radius:8px; padding:9px 14px | 1 | renderer/style.css |
| arch-t-badge-label | font-size:10px; color:var(--text3); text-transform:uppercase; letter-spacing:.8px | 1 | renderer/style.css |
| arch-t-badge-val | font-size:16px; font-weight:800; letter-spacing:var(--ant-num-track) | 2 | renderer/style.css |
| badge | font-size:12px; padding:5px 12px; border-radius:999px; font-weight:700; letter-spacing:0.02em; background:var(--surface-sunk); border:1px solid var(--border2); color:var(--text3) | 8 | renderer/students.css, renderer/style.css, renderer/license-settings.html |
| badge-amber | background:rgba(251,191,36,0.10); border:1px solid rgba(251,191,36,0.25); color:var(--amber) | 2 | renderer/style.css |
| badge-blue | background:rgba(96,165,250,0.08); border:1px solid rgba(96,165,250,0.20); color:var(--accent-strong) | 2 | renderer/style.css |
| badge-gold | background:rgba(96,165,250,0.10); border:1px solid rgba(96,165,250,0.25); color:var(--accent) | 2 | renderer/style.css |
| badge-gray | background:var(--bg4); border:1px solid var(--border); color:var(--text3) | 2 | renderer/style.css |
| badge-green | background:rgba(69,223,164,0.10); border:1px solid rgba(69,223,164,0.25); color:var(--green) | 2 | renderer/style.css |
| badge-purple | background:rgba(192,132,252,0.10); border:1px solid rgba(192,132,252,0.25); color:var(--purple) | 2 | renderer/style.css |
| badge-red | background:rgba(255,180,171,0.12); border:1px solid rgba(255,180,171,0.25); color:var(--red) | 2 | renderer/style.css |
| badge-teal | background:rgba(68,226,205,0.10); border:1px solid rgba(68,226,205,0.25); color:var(--teal) | 2 | renderer/style.css |
| brk-chip | height:24px; padding:0 8px; border-radius:7px; background:none; border:1px solid var(--border); color:var(--text3); font-size:11.5px; font-weight:600; letter-spacing:var(--ant-num-track); border-style:dashed | 2 | renderer/rooms.css |
| btn-pill | border-radius:100px; padding:8px 20px; letter-spacing:0.2px | 1 | renderer/style.css |
| chip | padding:4px 12px; border-radius:999px; font-size:11px; font-weight:700; border:1px solid | 1 | renderer/src/modules/students.js |
| chip--ok | background:#dcfce7; color:#166534; border-color:#bbf7d0 | 1 | renderer/src/modules/students.js |
| chip--plain | background:#fff; color:#475569; border-color:#e2e8f0 | 1 | renderer/src/modules/students.js |
| chip--room | background:#dbeafe; color:#1d4ed8; border-color:#bfdbfe | 1 | renderer/src/modules/students.js |
| conn-pill | padding:4px 11px; border-radius:999px; background:var(--c-bg); color:var(--c-fg); border:1px solid var(--border); font-size:11.5px; font-weight:700 | 1 | renderer/settings.css |
| dash-chip | height:40px; border-radius:12px; background:linear-gradient(145deg, var(--kpi-a), var(--kpi-b)); color:#fff; box-shadow:none | 3 | renderer/dashboard.css |
| dash-chip--emoji | background:var(--dash-sunk); border:1px solid var(--border); height:22px; border-radius:7px | 2 | renderer/dashboard.css |
| dash-chip--lg | height:44px; border-radius:13px | 2 | renderer/dashboard.css |
| dash-chip--sm | height:30px; border-radius:9px; background:var(--x-blue-tint); color:var(--x-blue) | 2 | renderer/dashboard.css |
| dash-pill | font-size:10px; font-weight:700; padding:3px 9px; border-radius:999px; background:var(--dh-bg); color:var(--dh) | 2 | renderer/dashboard.css |
| dash-pill-heading | background:var(--bg3); border:1px solid var(--border2); border-radius:20px; padding:4px 12px 4px 8px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.8px; color:var(--text2) | 1 | renderer/style.css |
| dash-pill__ic | height:12px | 1 | renderer/dashboard.css |
| dash-rp-stat__chip | height:38px; border-radius:50%; background:var(--dh-bg); color:var(--dh) | 1 | renderer/dashboard.css |
| dl-head3__tag | font-size:10.5px; font-weight:400; color:var(--text3) | 1 | renderer/dashboard.css |
| dl-monthchip | height:28px; padding:0 10px; border-radius:8px; background:var(--x-blue-tint); border:1px solid var(--border); color:var(--x-blue); font-size:11.5px; font-weight:600; border-color:transparent | 2 | renderer/dashboard.css |
| dl-monthchip__cv | height:12px | 1 | renderer/dashboard.css |
| ex-tag | font-size:7pt; color:VAR; letter-spacing:.4px | 1 | renderer/src/export/engine.js |
| fbadge | height:22px; border-radius:6px; background:#334155; color:#fff; font-size:11px; font-weight:900 | 1 | renderer/src/modules/dashboard.js |
| hi-id__tag | font-size:12px; color:var(--text3) | 1 | renderer/settings.css |
| lg-badge | padding:6px 13px; border-radius:999px; background:var(--lg-brand-soft); border:1px solid #DBEAFE; font-size:12px; font-weight:650; color:var(--lg-brand-2) | 1 | renderer/login.css |
| lk-banner__chip | height:44px; border-radius:12px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/listkit.css |
| lk-chip | padding:4px 11px; border-radius:999px; font-size:11px; font-weight:700; background:var(--dh-bg); color:var(--dh) | 1 | renderer/listkit.css |
| lk-chip--flat | background:var(--dash-sunk); color:var(--text2); border:1px solid var(--border) | 1 | renderer/listkit.css |
| lk-stat__chip | height:24px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 2 | renderer/listkit.css |
| nav-badge | background:var(--red); color:#fff; height:18px; border-radius:9px; font-size:10px; font-weight:700; padding:0 4px | 6 | renderer/chrome.css, renderer/style.css |
| notif-badge | height:16px; border-radius:50%; background:var(--red); color:#fff; font-size:9px; font-weight:800; border:2px solid var(--bg) | 1 | renderer/style.css |
| out-badge | font-size:8px; font-weight:800; background:#fee2e2; color:#dc2626; border-radius:20px; padding:2px 7px | 1 | renderer/src/modules/dashboard.js |
| pay-arrear-tag | padding:1px 7px; border-radius:20px; font-size:9.5px; font-weight:800; letter-spacing:.4px; text-transform:uppercase; color:var(--amber); background:var(--amber-dim); border:1px solid rgba(240,160,48,.35) | 1 | renderer/payments.css |
| pay-chip | padding:4px 10px; border-radius:100px; font-size:11.5px; font-weight:700; letter-spacing:0.2px; background:rgba(224,164,114,0.10); color:var(--accent-strong); border:1px solid rgba(224,164,114,0.2) | 5 | renderer/style.css |
| pay-pill | padding:4px 10px; border-radius:999px; font-size:10.5px; font-weight:700; background:var(--ant-neutral-bg); color:var(--ant-neutral-fg) | 4 | renderer/payments.css |
| pay-pill--od | background:color-mix(in srgb, var(--red) 14%, transparent); color:var(--red) | 1 | renderer/payments.css |
| pay-stat__chip | height:24px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 2 | renderer/payments.css |
| pill | padding:2px 7px; font-size:9px; font-weight:800; border-radius:20px; background:var(--gray-100); color:var(--gray-700); border:none | 5 | renderer/components.css, renderer/src/modules/students.js |
| pill--danger | background:var(--danger-bg); color:var(--danger-fg) | 1 | renderer/components.css |
| pill--info | background:var(--info-bg); color:var(--info-fg) | 1 | renderer/components.css |
| pill--outline | background:transparent; border:1px solid var(--gray-300); color:var(--text-secondary); border-color:var(--gray-300) | 4 | renderer/components.css |
| pill--success | background:var(--success-bg); color:var(--success-fg) | 1 | renderer/components.css |
| pill--warning | background:var(--warning-bg); color:var(--warning-fg) | 1 | renderer/components.css |
| pm-chip | font-size:11.5px; padding:4px 9px; border:1px solid var(--border); border-radius:8px; background:var(--bg3); color:var(--text2); font-weight:600 | 3 | renderer/students.css, renderer/style.css |
| rms-occ__chip | padding:4px 9px; border-radius:999px; background:var(--dash-sunk); border:1px solid var(--border); font-size:10.5px; color:var(--text2); border-color:var(--amber); border-style:dashed | 2 | renderer/rooms.css |
| rms-stat__chip | height:36px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/rooms.css |
| rpt-stat__chip | height:24px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 2 | renderer/reports.css |
| rpt-tbl__chip | padding:4px 11px; border-radius:999px; font-size:11px; font-weight:700 | 1 | renderer/reports.css |
| sb-logo-badge | font-size:9px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:rgba(224, 164, 114, 0.7); background:rgba(0, 0, 0, 0.06); border:1px solid rgba(59,130,246, 0.2); padding:2px 7px; border-radius:20px | 1 | renderer/style.css |
| sb-warden-chip | padding:12px 14px; background:var(--bg3); border:1px solid var(--border); border-radius:12px | 1 | renderer/style.css |
| stu-pan__mechip | background:var(--ant-warning-bg); color:var(--ant-warning-fg) | 2 | renderer/students.css |
| stu-pan__roombadge | padding:2px 8px; border-radius:6px; background:var(--ant-warning-bg); color:var(--ant-warning-fg); font-size:11px; font-weight:600 | 4 | renderer/students.css |
| stu-pan__tl__tag | font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--accent) | 2 | renderer/students.css |
| stu-pill | padding:4px 11px; border-radius:999px; font-size:10px; font-weight:600; background:var(--dh-bg); color:var(--dh) | 3 | renderer/students.css |
| stu-pop__chip | padding:5px 9px; border-radius:7px; font-size:11.5px; font-weight:600; background:var(--accent); border:1px solid var(--border2); color:var(--text-on-accent); border-color:var(--accent) | 2 | renderer/students.css |
| sup-chip | padding:5px 11px; border-radius:9px; background:var(--accent); border:1px solid var(--border); color:var(--text-on-accent); font-size:11.5px; font-weight:600; border-color:var(--accent) | 2 | renderer/support.css |
| sxp-chip | padding:3px 9px; border-radius:999px; font-size:10.5px; font-weight:700; background:var(--card); color:var(--ant-warning-fg) | 3 | renderer/dashboard.css |
| tag-item | background:var(--bg3); border:1px solid var(--border); border-radius:20px; padding:5px 12px; font-size:12.5px; color:var(--text2) | 1 | renderer/style.css |
| tag-remove | height:16px; border-radius:50%; background:var(--red-dim); color:var(--red); border:none; font-size:10px | 1 | renderer/style.css |
| tsk-chip | height:24px; padding:0 10px; border-radius:999px; background:var(--dash-sunk); border:1px solid var(--border); font-size:11.5px; font-weight:600; color:var(--text2) | 1 | renderer/chrome.css |
| user-chip | padding:5px 10px 5px 5px; background:var(--bg3); border:1px solid var(--border); border-radius:100px | 1 | renderer/style.css |
| user-chip-avatar | height:28px; border-radius:50%; background:linear-gradient(135deg, var(--accent), var(--accent-strong)); font-size:11px; font-weight:800; color:var(--text-on-accent) | 1 | renderer/style.css |
| user-chip-name | font-size:12px; font-weight:600; color:var(--text) | 1 | renderer/style.css |
| usr-rail__chips | padding:12px 18px; border-bottom:1px solid var(--border); border-top:1px solid var(--border) | 2 | renderer/users.css |
| wa-pill | height:40px; padding:0 15px; border-radius:11px; font-size:12.5px; font-weight:700; border:1px solid transparent | 1 | renderer/whatsapp.css |
| wa-pill--app | background:var(--wa-tint); color:var(--wa-green) | 1 | renderer/whatsapp.css |
| wa-pill--web | background:var(--dh-bg, rgba(96,165,250,.16)); color:var(--accent) | 1 | renderer/whatsapp.css |
| ws__chip | height:27px; padding:0 10px; border-radius:8px; background:var(--card); border:1px solid var(--border2); color:var(--text2); font-size:11px; font-weight:600 | 1 | renderer/payments.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| dash-pill , lk-chip , rpt-tbl__chip , stu-pill , chip |
| dash-rp-stat__chip , lk-stat__chip , lk-banner__chip , pay-stat__chip , rpt-stat__chip , rms-stat__chip |
| lk-chip--flat , badge-gray , arch-badge-future |
| badge-green , arch-badge-done |
| badge-red , arch-badge-empty |
| badge-blue , arch-badge-live |
| user-chip , sb-warden-chip |

### toast / alert / banner / notice — 65 variants; 5 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| arc-note | padding:10px 14px; border-radius:10px; background:var(--bg3); border:1px solid var(--border); font-size:11.5px; color:var(--text3) | 1 | renderer/archive.css |
| caf-clear-note | padding:11px 14px; border-radius:11px; background:var(--ant-success-bg, var(--bg3)); border:1px solid var(--border); font-size:12px; color:var(--text2) | 1 | renderer/cancellations.css |
| caf-note | padding:11px 14px; border-radius:11px; background:var(--accent-soft); border:1px solid var(--border); font-size:12px; color:var(--text2) | 1 | renderer/cancellations.css |
| caf-note__v | color:var(--ant-warning-fg) | 1 | renderer/cancellations.css |
| canc-set__note | font-size:11.5px; color:var(--text3); border-top:1px solid var(--border2); padding-top:10px | 1 | renderer/cancellations.css |
| cfg-note | padding:7px 10px; border-radius:10px; background:var(--accent-soft); border:1px solid var(--border); font-size:11px; color:var(--text2) | 3 | renderer/settings.css |
| dash-banner | background:var(--dh-bg); border:1px solid transparent; border-radius:14px; padding:12px 16px | 1 | renderer/dashboard.css |
| dash-banner__go | font-size:12px; font-weight:700; color:var(--dh) | 1 | renderer/dashboard.css |
| dash-banner__msg | font-size:13px; font-weight:600; color:var(--dh) | 1 | renderer/dashboard.css |
| dash-kpi__note | padding-top:4px; border-top:1px solid var(--border); font-size:10.5px; color:var(--text3) | 4 | renderer/dashboard.css |
| ex-note | font-size:8pt; color:VAR | 1 | renderer/src/export/engine.js |
| exf-note | padding:12px 14px; border-radius:11px; border:1px solid var(--border); background:var(--accent-soft); font-size:12px; color:var(--text2) | 2 | renderer/expenses.css |
| hdr-note | padding:10px 11px; border-radius:9px | 1 | renderer/chrome.css |
| hdr-note__empty | padding:22px 12px; font-size:12.5px; color:var(--text3) | 1 | renderer/chrome.css |
| hdr-note__ico | height:30px; border-radius:9px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/chrome.css |
| hdr-note__msg | font-size:12.5px; font-weight:500; color:var(--text) | 1 | renderer/chrome.css |
| hi-note | font-size:11px; color:var(--text3) | 1 | renderer/settings.css |
| lg-note | padding:11px 13px; border-radius:10px; background:var(--lg-brand-soft); border:1px solid #BFDBFE; font-size:12.5px; font-weight:500; color:#1E40AF | 2 | renderer/login.css |
| licence-banner | padding:10px 18px; font-size:13px; border-bottom:1px solid transparent | 1 | renderer/style.css |
| licence-banner--error | background:rgba(220, 38, 38, .10); color:#b91c1c; font-weight:600 | 1 | renderer/style.css |
| licence-banner--info | background:rgba(37, 99, 235, .10); color:var(--accent-600, #2563eb) | 1 | renderer/style.css |
| licence-banner--warn | background:rgba(245, 158, 11, .12); color:#b45309 | 1 | renderer/style.css |
| licence-banner__clock | font-weight:600 | 1 | renderer/style.css |
| lk-banner | padding:14px 18px; background:var(--card); border:1px solid var(--border); border-radius:16px; border-color:var(--accent) | 2 | renderer/listkit.css |
| lk-banner__a | font-size:11px; font-weight:600; color:var(--accent-strong) | 1 | renderer/listkit.css |
| lk-banner__chip | height:44px; border-radius:12px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/listkit.css |
| lk-banner__s | font-size:11.5px; color:var(--text3) | 1 | renderer/listkit.css |
| lk-banner__t | font-size:13.5px; font-weight:700; color:var(--text) | 1 | renderer/listkit.css |
| lk-banner__v | font-size:30px; font-weight:800; color:var(--text); letter-spacing:var(--ant-num-track) | 1 | renderer/listkit.css |
| note | background:var(--info-bg); border:1px solid var(--info-bd); border-radius:12px; padding:12px 14px; font-size:10px; color:#94a3b8; font-weight:400 | 3 | renderer/license-settings.html, renderer/recovery.html, renderer/src/modules/students.js |
| note__ico | color:var(--accent) | 1 | renderer/license-settings.html |
| onb-note | font-size:12.5px; color:var(--ant-warning-fg); padding:10px 12px; border-radius:9px; background:var(--ant-warning-bg); font-weight:500 | 2 | renderer/onboarding.css |
| pay-rev__note | font-size:11.5px; color:var(--text3); border-top:1px solid var(--border2); padding-top:10px | 1 | renderer/payments.css |
| pef-note | font-size:10.5px; color:var(--text3) | 1 | renderer/payments.css |
| pf-out__note | font-size:10.5px; color:var(--text3) | 2 | renderer/payments.css |
| rms-vac-note | padding:1px 6px; border-radius:5px; background:var(--amber-dim); color:var(--amber); font-size:10px; font-weight:700 | 1 | renderer/rooms.css |
| rpt-quick__note | font-size:11px; font-weight:500; color:var(--text3); text-transform:none; letter-spacing:0 | 1 | renderer/reports.css |
| rsf-note | padding:10px 13px; border-radius:10px; background:var(--accent-soft); border:1px solid var(--accent-dim); font-size:11.5px; color:var(--text2) | 1 | renderer/former.css |
| rt-note | padding:10px 13px; border-radius:11px; background:var(--dash-sunk); color:var(--text3); font-size:11.5px | 3 | renderer/dashboard.css |
| rt-note__ic | color:var(--accent) | 1 | renderer/dashboard.css |
| set-note | padding:14px 16px; border-radius:12px; background:var(--dash-sunk); border:1px solid var(--border); font-size:12.5px; color:var(--text2) | 1 | renderer/settings.css |
| set-note__i | height:26px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| sf-idcard__note | padding:5px 11px; border-radius:999px; background:var(--accent-dim); color:var(--accent-strong); font-size:11px; font-weight:600 | 1 | renderer/students.css |
| stu-cn-note | color:var(--text3); font-size:12px | 1 | renderer/students.css |
| stu-pan__note | font-size:11px; color:var(--text3) | 1 | renderer/students.css |
| sup-note | padding:10px 12px; border-radius:10px; background:var(--dash-sunk); border:1px solid var(--border); font-size:11.5px; color:var(--text3) | 1 | renderer/support.css |
| svw-note | background:var(--warning-bg); border:1px solid var(--warning-border); border-radius:14px; padding:14px 16px | 1 | renderer/students.css |
| svw-note__ico | color:var(--warning-fg) | 1 | renderer/students.css |
| svw-note__k | font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:var(--warning-fg) | 1 | renderer/students.css |
| svw-note__v | font-size:13px; color:var(--text2) | 1 | renderer/students.css |
| toast | background:var(--surface); border-color:var(--border); border:1px solid var(--border2); border-left:6px solid var(--toast-tone); border-radius:11px; padding:11px 18px; box-shadow:var(--shadow); font-size:13px; font-weigh | 9 | renderer/style.css, renderer/license-settings.html |
| toast-icon | height:42px; border-radius:50%; background:color-mix(in srgb, var(--toast-tone) 12%, transparent) | 1 | renderer/style.css |
| toast-icon__disc | height:28px; border-radius:50%; background:var(--toast-tone); color:var(--bg) | 2 | renderer/style.css |
| toast-msg | font-size:13px; color:var(--text2) | 1 | renderer/style.css |
| toast-progress | height:3px; background:var(--toast-tone) | 2 | renderer/style.css |
| toast-rule | background:var(--border) | 1 | renderer/style.css |
| toast-title | font-size:14px; font-weight:700; color:var(--text) | 1 | renderer/style.css |
| toast-x | height:32px; border-radius:9px; background:var(--bg2); border:1px solid transparent; color:var(--text3); padding:0 | 1 | renderer/style.css |
| tsk-foot__note | font-size:12px; color:var(--text3) | 1 | renderer/chrome.css |
| usr-ho-note | font-size:12px; color:var(--text2) | 1 | renderer/users.css |
| wa-note | padding:14px 15px; border-radius:13px; background:var(--amber-dim, rgba(251,191,36,.12)); border:1px solid rgba(251,191,36,.32) | 1 | renderer/whatsapp.css |
| wa-note__btn | height:38px; padding:0 15px; border-radius:10px; background:var(--card); border:1px solid var(--border2); color:var(--accent-strong, var(--accent)); font-size:12.5px; font-weight:700 | 1 | renderer/whatsapp.css |
| wa-note__ic | color:var(--amber, #fbbf24) | 1 | renderer/whatsapp.css |
| wa-note__s | font-size:11.5px; color:var(--text3) | 1 | renderer/whatsapp.css |
| wa-note__t | font-size:13.5px; font-weight:800; color:var(--text) | 1 | renderer/whatsapp.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| arc-note , sup-note |
| canc-set__note , pay-rev__note |
| caf-note , caf-clear-note , exf-note |
| hdr-note__ico , lk-banner__chip , set-note__i |
| hdr-note__msg , dash-banner__msg , dash-banner__go , lk-banner__t , lk-banner__v , lk-banner__a , toast-title , wa-note__t |

### tooltip — 5 variants; 0 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| dnut-tip | padding:7px 11px; border-radius:9px; background:var(--card); border:1px solid var(--border); box-shadow:0 8px 24px rgba(15, 23, 42, .16); font-size:12px; color:var(--text) | 2 | renderer/dashboard.css |
| dnut-tip__amt | font-weight:700 | 1 | renderer/dashboard.css |
| dnut-tip__dot | height:9px; border-radius:50% | 1 | renderer/dashboard.css |
| dnut-tip__name | font-weight:650 | 1 | renderer/dashboard.css |
| dnut-tip__pct | color:var(--text3) | 1 | renderer/dashboard.css |

### sidebar / nav item — 56 variants; 4 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| ap-mrail__nav | height:28px; border-radius:8px; background:var(--card); border:1px solid var(--border2); color:var(--text3) | 1 | renderer/payments.css |
| msf-rail | padding:14px; background:var(--bg3); border:1px solid var(--border); border-radius:12px | 1 | renderer/forms.css |
| msf-rail__t | font-size:10.5px; font-weight:700; letter-spacing:.06em; text-transform:uppercase; color:var(--text3) | 1 | renderer/forms.css |
| msf-rail__t--2 | padding-top:13px; border-top:1px solid var(--border) | 1 | renderer/forms.css |
| nav-badge | background:var(--red); color:#fff; height:18px; border-radius:9px; font-size:10px; font-weight:700; padding:0 4px | 6 | renderer/chrome.css, renderer/style.css |
| nav-icon | color:#0ea5e9; height:18px | 12 | renderer/chrome.css, renderer/style.css |
| nav-item | padding:11px; border-radius:var(--r-full); border:1px solid transparent; color:#0284c7; font-size:13.5px; font-weight:600; background:rgba(14, 165, 233, 0.08); border-color:transparent; box-shadow:0 2px 10px rgba(96,165, | 17 | renderer/chrome.css, renderer/style.css |
| nav-item--danger | color:var(--red) | 2 | renderer/chrome.css, renderer/style.css |
| onb-rail | padding:24px 20px; background:var(--dash-sunk); border-right:1px solid var(--border) | 1 | renderer/onboarding.css |
| sb-cal-dot | height:5px; border-radius:50%; background:var(--border2) | 4 | renderer/style.css |
| sb-cal-mo | color:var(--text2); font-size:11px; font-weight:700 | 2 | renderer/style.css |
| sb-cal-month | background:var(--accent-dim); border:1px solid var(--border); border-radius:8px; padding:7px 5px 6px; border-color:rgba(59,130,246, 0.35); border-style:dashed | 3 | renderer/style.css |
| sb-cal-title | font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--text3) | 1 | renderer/style.css |
| sb-cal-yr | font-size:9px; color:var(--text3) | 1 | renderer/style.css |
| sb-calendar | padding:12px 14px; border-bottom:1px solid var(--border); background:transparent | 1 | renderer/style.css |
| sb-logo | padding:16px 8px; background:transparent; border-bottom:1px solid var(--border); padding-left:16px | 8 | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css |
| sb-logo-badge | font-size:9px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; color:rgba(224, 164, 114, 0.7); background:rgba(0, 0, 0, 0.06); border:1px solid rgba(59,130,246, 0.2); padding:2px 7px; border-radius:20px | 1 | renderer/style.css |
| sb-logo-divider | height:1px; background:linear-gradient(90deg, rgba(0, 0, 0, 0.15), transparent) | 2 | renderer/style.css |
| sb-logo-icon | height:44px; border-radius:12px; background:linear-gradient(145deg, #252525, #1a1a1a); border:1px solid rgba(59,130,246, 0.35); box-shadow:0 2px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8); border-col | 3 | renderer/chrome.css, renderer/style.css |
| sb-logo-loc | font-size:10px; color:var(--text3) | 1 | renderer/style.css |
| sb-month-picker | border-bottom:1px solid var(--border); padding:0 | 1 | renderer/style.css |
| sb-month-picker__arrow | height:26px; border-radius:6px; border:none; background:transparent; color:var(--text3) | 4 | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css |
| sb-month-picker__body | padding:6px 10px 10px; border-top:1px solid var(--border) | 1 | renderer/style.css |
| sb-month-picker__chevron | color:var(--text3) | 1 | renderer/style.css |
| sb-month-picker__display | padding:4px 10px; color:var(--text); font-size:11px; font-weight:600; border-radius:8px; background:var(--bg3); border:1px solid var(--border) | 4 | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css |
| sb-month-picker__header | background:none; border:none; padding:6px 8px | 4 | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css |
| sb-month-picker__icon | color:var(--accent-strong) | 2 | renderer/chrome.css, renderer/style.css |
| sb-month-picker__label | font-size:11px; font-weight:700; color:var(--text); letter-spacing:0.3px | 2 | renderer/rail-compact.css, renderer/style.css |
| sb-month-picker__month-label | font-size:12px; font-weight:700; color:var(--text) | 1 | renderer/style.css |
| sb-month-picker__reset | font-size:10px; font-weight:600; background:var(--bg3); color:var(--accent-strong); border:1px solid var(--border2); border-radius:20px; padding:2px 10px | 1 | renderer/style.css |
| sb-month-picker__weekend | color:var(--accent-strong) | 1 | renderer/style.css |
| sb-month-picker__year-select | font-size:11px; font-weight:600; color:var(--text2); background:var(--bg3); border:1px solid var(--border); border-radius:6px; padding:2px 6px | 1 | renderer/style.css |
| sb-nav | padding:12px 8px | 3 | renderer/chrome.css, renderer/style.css |
| sb-section | font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.5px; color:var(--text3); padding:8px 10px 4px | 6 | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css |
| sb-stat | background:var(--bg3); border-color:var(--border); border:1px solid var(--border); border-radius:var(--radius-sm); padding:8px 10px | 2 | renderer/style.css |
| sb-stats | padding:14px 16px; border-bottom:1px solid var(--border) | 1 | renderer/style.css |
| sb-user | padding:8px; background:rgba(255,255,255,.055); border:1px solid var(--sb-divider); border-radius:12px | 2 | renderer/chrome.css |
| sb-user__av | height:36px; border-radius:50%; background:var(--sb-avatar); color:var(--text-on-accent); font-size:12.5px; font-weight:800; letter-spacing:.02em | 1 | renderer/chrome.css |
| sb-user__caret | color:var(--sb-fg2) | 2 | renderer/chrome.css |
| sb-user__name | font-size:13px; font-weight:700; color:var(--sb-fg) | 1 | renderer/chrome.css |
| sb-user__role | font-size:11px; color:var(--sb-fg2) | 1 | renderer/chrome.css |
| sb-warden-avatar | height:30px; border-radius:8px; background:linear-gradient(135deg, var(--accent), var(--accent-strong)); font-size:13px; font-weight:800; color:var(--text-on-accent) | 1 | renderer/style.css |
| sb-warden-chip | padding:12px 14px; background:var(--bg3); border:1px solid var(--border); border-radius:12px | 1 | renderer/style.css |
| sb-warden-name | font-size:12.5px; font-weight:600; color:var(--text) | 1 | renderer/style.css |
| sb-warden-role | font-size:10px; color:var(--text3) | 1 | renderer/style.css |
| sidebar | background:var(--sidebar-bg); box-shadow:2px 0 16px rgba(0, 0, 0, 0.06) | 1 | renderer/style.css |
| sidebar-collapse-btn | height:22px; border-radius:50%; background:var(--bg3); color:var(--text2); border:1px solid var(--border2); padding:0; box-shadow:none | 2 | renderer/chrome.css, renderer/style.css |
| sidebar-overlay | background:rgba(26, 26, 64, 0.35) | 1 | renderer/style.css |
| sidebar__bottom | background:var(--sidebar-bg); border-top:1px solid var(--border); padding:2px 10px 3px | 3 | renderer/chrome.css, renderer/style.css |
| sidebar__middle | padding:12px 10px | 1 | renderer/style.css |
| usr-rail | padding:0 | 1 | renderer/users.css |
| usr-rail__b | padding:4px 18px 18px | 1 | renderer/users.css |
| usr-rail__chips | padding:12px 18px; border-bottom:1px solid var(--border); border-top:1px solid var(--border) | 2 | renderer/users.css |
| usr-rail__h | padding:16px 18px 12px; border-bottom:1px solid var(--border) | 1 | renderer/users.css |
| usr-rail__n | font-size:16px; font-weight:800; color:var(--text) | 1 | renderer/users.css |
| usr-rail__s | font-size:12px; color:var(--text3) | 1 | renderer/users.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| sb-logo , sb-calendar |
| sb-section , msf-rail__t , sb-cal-title |
| sb-user__name , sb-month-picker__label , sb-month-picker__month-label , sb-cal-mo , sb-warden-name , usr-rail__n |
| msf-rail , sb-warden-chip |

### pagination — 9 variants; 0 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| al-pager__n | font-size:12px; font-weight:700; color:var(--text2); letter-spacing:var(--ant-num-track) | 1 | renderer/activitylog.css |
| exp-pager__gap | color:var(--text3); padding:0 2px | 1 | renderer/expenses.css |
| lk-pager__gap | color:var(--text3); padding:0 3px | 1 | renderer/listkit.css |
| pager | padding:12px 4px 4px | 1 | renderer/style.css |
| pager-btn | padding:5px 9px; font-size:12px; font-weight:600; color:#fff; background:var(--blue); border:1px solid var(--border); border-radius:7px; border-color:var(--blue) | 2 | renderer/style.css |
| pager-gap | padding:0 4px; color:var(--text3); font-size:12px | 1 | renderer/style.css |
| pager-info | font-size:12px; color:var(--text3) | 1 | renderer/style.css |
| pay-pager__gap | color:var(--text3); padding:0 3px | 1 | renderer/payments.css |
| stu-pager__gap | color:var(--text3); padding:0 3px | 1 | renderer/students.css |

### avatar — 22 variants; 2 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| ap-idn__av | height:38px; border-radius:10px; font-size:13px; font-weight:800; background:var(--dh-bg); color:var(--dh) | 1 | renderer/payments.css |
| arc-sd-av | height:46px; border-radius:14px; background:var(--accent-dim); color:var(--accent-strong); font-size:18px; font-weight:800 | 1 | renderer/archive.css |
| arch-stu-av | height:36px; border-radius:8px; background:rgba(0,0,0,0.08); color:var(--accent-strong); font-weight:900; font-size:15px | 1 | renderer/style.css |
| avatar | height:34px; border-radius:var(--r-md); font-weight:800; font-size:14px | 2 | renderer/style.css |
| caf-opt__av | height:30px; border-radius:9px; background:var(--accent-soft); color:var(--accent-strong); font-weight:800; font-size:12px | 1 | renderer/cancellations.css |
| cef-who__av | height:42px; border-radius:12px; background:var(--dh-bg, var(--accent-soft)); color:var(--accent-strong); font-weight:800; font-size:15px | 1 | renderer/cancellations.css |
| dash-av | height:31px; border-radius:50%; font-size:11px; font-weight:800; background:var(--dh-bg); color:var(--dh) | 2 | renderer/dashboard.css |
| dash-rp-av | height:30px; border-radius:9px; background:var(--accent); color:var(--text-on-accent); font-size:12px; font-weight:800 | 1 | renderer/dashboard.css |
| hero__av | height:84px; border-radius:50%; background:#fff; border:3px solid #bfdbfe; color:#60a5fa | 1 | renderer/src/modules/students.js |
| lk-who__av | height:38px; font-size:12.5px; border-radius:50%; font-weight:800; background:var(--dh-bg); color:var(--dh) | 2 | renderer/issues.css, renderer/listkit.css |
| pay-who__av | height:34px; border-radius:50%; font-size:11.5px; font-weight:800; background:var(--dh-bg); color:var(--dh) | 1 | renderer/payments.css |
| pef-who__av | height:36px; border-radius:50%; background:var(--accent); color:var(--text-on-accent); font-weight:800; font-size:15px | 1 | renderer/payments.css |
| pf-hit__av | height:32px; border-radius:50%; font-size:11px; font-weight:800; background:var(--dh-bg); color:var(--dh) | 1 | renderer/payments.css |
| sb-user__av | height:36px; border-radius:50%; background:var(--sb-avatar); color:var(--text-on-accent); font-size:12.5px; font-weight:800; letter-spacing:.02em | 1 | renderer/chrome.css |
| sb-warden-avatar | height:30px; border-radius:8px; background:linear-gradient(135deg, var(--accent), var(--accent-strong)); font-size:13px; font-weight:800; color:var(--text-on-accent) | 1 | renderer/style.css |
| stu-av | border-radius:7px; background:var(--accent); color:var(--text-on-accent); border:none; font-weight:700; letter-spacing:.02em | 4 | renderer/students.css |
| stu-who__av | height:36px; border-radius:50%; font-size:13px; font-weight:800; background:var(--dh-bg); color:var(--dh) | 1 | renderer/students.css |
| svw-hero__av | height:76px; border-radius:50%; background:var(--accent); color:var(--text-on-accent); font-size:30px; font-weight:800; letter-spacing:-.02em; border:none | 2 | renderer/students.css |
| user-chip-avatar | height:28px; border-radius:50%; background:linear-gradient(135deg, var(--accent), var(--accent-strong)); font-size:11px; font-weight:800; color:var(--text-on-accent) | 1 | renderer/style.css |
| usr-av | border-radius:11px | 1 | renderer/users.css |
| usr-av--ini | background:var(--dh-bg); color:var(--dh); font-weight:800 | 1 | renderer/users.css |
| wa-row__av | height:44px; border-radius:50%; background:var(--dh-bg); color:var(--dh); font-size:14px; font-weight:800 | 1 | renderer/whatsapp.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| caf-opt__av , dash-rp-av |
| dash-av , lk-who__av , pay-who__av , ap-idn__av , pf-hit__av , stu-who__av , wa-row__av |

### icon — 58 variants; 1 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| act__ico | height:40px; border-radius:11px; background:var(--accent-dim); color:var(--accent) | 4 | renderer/license-settings.html |
| ap-mrail__ico | height:30px; border-radius:9px; background:var(--accent-dim); color:var(--accent-strong) | 1 | renderer/payments.css |
| arch-empty-icon | font-size:28px | 1 | renderer/style.css |
| arm-amen__ico | height:26px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/rooms.css |
| arm-guide__ico | color:var(--accent-strong) | 1 | renderer/rooms.css |
| arm-head__ico | height:44px; border-radius:13px; background:var(--accent-dim); color:var(--accent-strong) | 1 | renderer/rooms.css |
| arm-input__ico | background:var(--dh-bg); color:var(--dh); border-right:1px solid var(--border); padding-top:12px | 2 | renderer/rooms.css |
| bkp-head__ico | height:44px; border-radius:13px; background:var(--accent-dim); color:var(--accent-strong) | 1 | renderer/settings.css |
| bkp-safe__ico | color:var(--success-fg) | 1 | renderer/settings.css |
| bkp-sec__ico | height:28px; border-radius:9px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| bkp-stat__ico | height:38px; border-radius:11px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| bkp-warn__ico | color:var(--warning-fg) | 1 | renderer/settings.css |
| btn-icon | height:32px; padding:0; border-radius:var(--radius-sm) | 1 | renderer/style.css |
| card__ico | height:30px; border-radius:10px; background:var(--accent-dim); color:var(--accent) | 1 | renderer/license-settings.html |
| cfg-ico | height:28px; border-radius:9px; background:var(--accent-soft); border:1px solid var(--border); color:var(--accent-strong) | 1 | renderer/settings.css |
| cfg-ico__opt | height:32px; border:1px solid transparent; border-radius:8px; background:var(--accent-soft); color:var(--accent-strong); border-color:var(--accent) | 2 | renderer/settings.css |
| dash-icon-btn | height:30px; border-radius:8px; background:var(--x-slate-tint); color:var(--x-slate-fg); border:none | 3 | renderer/dashboard.css |
| dash-icon-btn--wa | color:var(--x-green); background:var(--x-green-tint) | 2 | renderer/dashboard.css |
| dl-head3__ico | height:26px; border-radius:8px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/dashboard.css |
| dl-ico | height:14px | 3 | renderer/dashboard.css |
| dl-pend__ico | background:var(--x-amber-tint); color:var(--x-amber-fg) | 1 | renderer/dashboard.css |
| empty-state-icon | height:80px; border-radius:24px; background:var(--bg3); border:1px solid var(--border); font-size:36px; box-shadow:0 4px 20px rgba(0,0,0,0.2) | 1 | renderer/style.css |
| fact__ico | height:34px; border-radius:10px; background:var(--accent-dim); color:var(--accent) | 1 | renderer/license-settings.html |
| hdr-find__ico | color:var(--text3) | 1 | renderer/chrome.css |
| hdr-greet__ico | height:26px; border-radius:8px; background:var(--accent-dim, var(--bg2)); color:var(--accent) | 1 | renderer/dashboard.css |
| hdr-note__ico | height:30px; border-radius:9px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/chrome.css |
| head__ico | height:46px; border-radius:14px; background:var(--accent-dim); color:var(--accent) | 1 | renderer/license-settings.html |
| hf-mh__ico | height:34px; border-radius:9px; background:var(--accent); color:var(--text-on-accent) | 1 | renderer/forms.css |
| hf-sec__ico | height:26px; border-radius:8px; background:var(--accent-soft); color:var(--accent-strong) | 1 | renderer/forms.css |
| ico | height:26px; border-radius:8px; background:#fef3c7; color:#b45309 | 12 | renderer/src/modules/dashboard.js, renderer/src/modules/students.js |
| icon | height:14px; color:var(--text3) | 21 | renderer/dashboard.css, renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js |
| icon-box | border-radius:9px; background:var(--bg4); color:var(--text2) | 9 | renderer/style.css |
| icon-box-lg | height:var(--icon-box-lg); border-radius:10px | 1 | renderer/style.css |
| icon-box-md | height:var(--icon-box-md); border-radius:9px | 1 | renderer/style.css |
| icon-box-sm | height:var(--icon-box-sm); border-radius:8px | 1 | renderer/style.css |
| icon-lg | height:18px | 3 | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js |
| icon-md | height:var(--icon-md) | 1 | renderer/style.css |
| icon-sm | height:13px | 4 | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js |
| icon-xl | height:var(--icon-xl) | 1 | renderer/style.css |
| icon-xs | height:11px | 4 | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js |
| lk-act--icon | height:26px; padding:0 | 3 | renderer/issues.css, renderer/listkit.css, renderer/settings.css |
| micon | font-size:inherit | 1 | renderer/style.css |
| mov__ico | height:46px; border-radius:14px; background:var(--accent-dim); color:var(--accent-strong) | 1 | renderer/reports.css |
| nav-icon | color:#0ea5e9; height:18px | 12 | renderer/chrome.css, renderer/style.css |
| note__ico | color:var(--accent) | 1 | renderer/license-settings.html |
| qa-icon | font-size:28px; color:var(--accent) | 2 | renderer/style.css |
| sb-logo-icon | height:44px; border-radius:12px; background:linear-gradient(145deg, #252525, #1a1a1a); border:1px solid rgba(59,130,246, 0.35); box-shadow:0 2px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8); border-col | 3 | renderer/chrome.css, renderer/style.css |
| sb-month-picker__icon | color:var(--accent-strong) | 2 | renderer/chrome.css, renderer/style.css |
| search-icon | color:var(--text3) | 1 | renderer/style.css |
| set-head__ico | height:38px; border-radius:14px; background:var(--dh-bg); color:var(--dh) | 2 | renderer/settings.css |
| set-sub__ico | height:42px; border-radius:12px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/settings.css |
| stat-card-ent__icon | color:var(--gray-400); background:rgba(255, 255, 255, 0.06); height:36px; border-radius:var(--radius-md) | 3 | renderer/components.css |
| stat-icon | height:36px; border-radius:10px; font-size:18px; background:rgba(192,132,252,0.10); color:var(--purple) | 16 | renderer/style.css |
| svw-card__ico | height:28px; border-radius:9px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/students.css |
| svw-note__ico | color:var(--warning-fg) | 1 | renderer/students.css |
| svw-stat__ico | height:40px; border-radius:12px; background:var(--dh-bg); color:var(--dh) | 1 | renderer/students.css |
| toast-icon | height:42px; border-radius:50%; background:color-mix(in srgb, var(--toast-tone) 12%, transparent) | 1 | renderer/style.css |
| toast-icon__disc | height:28px; border-radius:50%; background:var(--toast-tone); color:var(--bg) | 2 | renderer/style.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| hdr-note__ico , hdr-greet__ico , dl-head3__ico , hf-sec__ico , ap-mrail__ico , mov__ico , arm-head__ico , arm-amen__ico , set-head__ico , set-sub__ico , bkp-head__ico , bkp-stat__ico , bkp-sec__ico , svw-stat__ico , svw-card__ico , head__ico , card__ico , act__ico , fact__ico , ico |

### empty state — 54 variants; 3 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| al-none | font-size:11.5px; color:var(--text3); padding:8px 0 | 1 | renderer/activitylog.css |
| ap-empty | padding:16px 13px; font-size:11.5px; color:var(--text3) | 1 | renderer/payments.css |
| arc-chart__empty | padding:34px 18px; font-size:12px; color:var(--text3) | 1 | renderer/archive.css |
| arc-empty | padding:44px 20px; color:var(--text3); font-size:13px | 1 | renderer/archive.css |
| arch-badge-empty | background:rgba(248,113,113,0.1); color:var(--red); border:1px solid rgba(248,113,113,0.2) | 1 | renderer/style.css |
| arch-empty-icon | font-size:28px | 1 | renderer/style.css |
| arch-empty-state | padding:36px 20px; color:var(--text3) | 1 | renderer/style.css |
| bk-empty | padding:24px 12px | 1 | renderer/backup.css |
| bk-empty__s | font-size:11.5px; color:var(--text3) | 1 | renderer/backup.css |
| bk-empty__t | font-size:13px; font-weight:700; color:var(--text2) | 1 | renderer/backup.css |
| caf-opt__empty | padding:13px; font-size:12px; color:var(--text3) | 1 | renderer/cancellations.css |
| canc-set__none | font-size:12.5px; color:var(--text3); padding:10px 12px; background:var(--bg3); border:1px solid var(--border2); border-radius:10px | 1 | renderer/cancellations.css |
| cmdk-empty | padding:24px; color:var(--text3); font-size:13px | 1 | renderer/style.css |
| dash-spark-empty | height:30px; font-size:10px; color:var(--text3) | 3 | renderer/dashboard.css, renderer/reports.css |
| dl-empty | padding:22px 14px; font-size:12px; color:var(--text3) | 1 | renderer/dashboard.css |
| dl-empty--tall | min-height:150px | 1 | renderer/dashboard.css |
| dl-empty__s | font-size:12px; color:var(--text3) | 1 | renderer/dashboard.css |
| dl-empty__t | font-size:13.5px; font-weight:650; color:var(--text2) | 1 | renderer/dashboard.css |
| empty | color:var(--muted) | 1 | renderer/recovery.html |
| empty-row | font-size:10px; color:#94a3b8; padding:5px 0 | 1 | renderer/src/modules/dashboard.js |
| empty-state | padding:56px 24px; color:var(--text3) | 2 | renderer/style.css |
| empty-state-icon | height:80px; border-radius:24px; background:var(--bg3); border:1px solid var(--border); font-size:36px; box-shadow:0 4px 20px rgba(0,0,0,0.2) | 1 | renderer/style.css |
| ex-empty | padding:26px; color:VAR; font-size:9pt; border:1px dashed VAR; border-radius:7px; background:VAR | 1 | renderer/src/export/engine.js |
| ex-none | font-size:11pt; color:#94A3B8 | 1 | renderer/src/export/engine.js |
| exp-empty | padding:52px 20px; color:var(--text3); font-size:13px | 1 | renderer/expenses.css |
| hdr-note__empty | padding:22px 12px; font-size:12.5px; color:var(--text3) | 1 | renderer/chrome.css |
| is-empty | color:#cbd5e1; font-weight:500; letter-spacing:0; border:1px solid var(--border) | 8 | renderer/rooms.css, renderer/settings.css, renderer/students.css, renderer/support.css, renderer/src/modules/students.js |
| is-none | background:#f8fafc; color:#cbd5e1; font-weight:600; border:1px solid var(--border) | 5 | renderer/expenses.css, renderer/payments.css, renderer/students.css, renderer/src/modules/dashboard.js |
| lk-empty | padding:48px 20px; color:var(--text3) | 1 | renderer/listkit.css |
| lk-empty__i | height:56px; border-radius:16px; background:var(--dash-sunk); color:var(--text3) | 1 | renderer/listkit.css |
| lk-empty__s | font-size:12.5px | 1 | renderer/listkit.css |
| lk-empty__t | font-size:14px; font-weight:700; color:var(--text2) | 1 | renderer/listkit.css |
| msf-cur--none | color:var(--text3) | 1 | renderer/forms.css |
| none | padding:26px; color:#94a3b8 | 1 | renderer/src/modules/students.js |
| p-none | background:#f1f5f9; color:#94a3b8 | 1 | renderer/src/modules/students.js |
| pay-empty | padding:44px 20px; color:var(--text3); font-size:13px | 1 | renderer/payments.css |
| rms-empty | padding:52px 20px; color:var(--text3); font-size:13px | 1 | renderer/rooms.css |
| rpt-none | padding:34px 8px; font-size:12.5px; color:var(--text3) | 2 | renderer/reports.css |
| set-empty | padding:44px 20px | 1 | renderer/settings.css |
| set-empty__i | height:56px; border-radius:16px; background:var(--dash-sunk); color:var(--text3) | 1 | renderer/settings.css |
| set-empty__s | font-size:12.5px; color:var(--text3) | 1 | renderer/settings.css |
| set-empty__t | font-size:14px; font-weight:700; color:var(--text2) | 1 | renderer/settings.css |
| stu-empty | padding:44px 20px; color:var(--text3); font-size:13px | 1 | renderer/students.css |
| stu-pan__empty | padding:14px; font-size:12px; color:var(--text3); background:var(--bg3); border-radius:9px | 1 | renderer/students.css |
| sup-empty | padding:6px 2px 2px | 1 | renderer/support.css |
| sup-empty__s | font-size:11.5px; color:var(--text3) | 1 | renderer/support.css |
| sup-empty__t | font-size:12.5px; font-weight:700; color:var(--text2) | 1 | renderer/support.css |
| svw-none | padding:26px 16px; font-size:13px; color:var(--text3) | 1 | renderer/students.css |
| sxp-empty | padding:44px 20px; color:var(--text3); font-size:13px | 1 | renderer/dashboard.css |
| usr-none | font-size:11.5px; color:var(--text3) | 1 | renderer/users.css |
| wa-empty | padding:44px 20px; color:var(--green) | 1 | renderer/whatsapp.css |
| wa-empty__s | font-size:12.5px; color:var(--text3) | 1 | renderer/whatsapp.css |
| wa-empty__t | font-size:15px; font-weight:800; color:var(--text) | 1 | renderer/whatsapp.css |
| ws__none | font-size:11px; color:var(--text3); padding-top:6px | 1 | renderer/payments.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| al-none , arc-empty , arc-chart__empty , caf-opt__empty , hdr-note__empty , dl-empty , sxp-empty , exp-empty , pay-empty , ap-empty , rpt-none , rms-empty , stu-empty , svw-none , cmdk-empty |
| bk-empty__t , dl-empty__t , lk-empty__t , set-empty__t , sup-empty__t |
| lk-empty__i , set-empty__i |

### loading indicator — 5 variants; 0 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| skeleton | background:linear-gradient(90deg, var(--surface-sunk) 25%, var(--border) 50%, var(--surface-sunk) 75%); border-radius:4px; height:13px | 2 | renderer/style.css, renderer/license-settings.html |
| skeleton-card | height:80px; border-radius:var(--radius) | 1 | renderer/style.css |
| skeleton-text | height:14px; border-radius:4px | 1 | renderer/style.css |
| skeleton-title | height:20px; border-radius:6px | 1 | renderer/style.css |
| spinner | height:18px; border-radius:50%; border:2.4px solid rgba(255,255,255,.35) | 1 | renderer/license.html |

### progress bar — 37 variants; 3 near-duplicate groups

| Class | Visual signature | Rules defining it | Files |
|---|---|---|---|
| al-bar | height:100%; background:var(--dash-track); border-radius:5px | 1 | renderer/activitylog.css |
| al-bar__f | background:var(--accent); border-radius:5px; min-height:2px | 1 | renderer/activitylog.css |
| arc-bar | background:var(--card); border:1px solid var(--border); border-radius:16px; padding:12px 16px | 1 | renderer/archive.css |
| arc-bar__lbl | font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.8px; color:var(--text3) | 1 | renderer/archive.css |
| arch-mc-bar | height:3px; background:rgba(0,0,0,0.06); border-radius:2px | 1 | renderer/style.css |
| arch-mc-bar-fill | height:100%; border-radius:2px | 1 | renderer/style.css |
| arch-ov-bar | background:rgba(0,0,0,0.06); height:4px; border-radius:2px | 2 | renderer/style.css |
| arch-ov-bar-fill | height:100%; border-radius:2px | 1 | renderer/style.css |
| asf-meter | padding-bottom:2px | 1 | renderer/students.css |
| asf-meter__l | font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.7px; color:var(--text3) | 1 | renderer/students.css |
| asf-meter__track | height:6px; border-radius:999px; background:var(--dash-sunk); border:1px solid var(--border) | 1 | renderer/students.css |
| asf-meter__v | letter-spacing:var(--ant-num-track); font-weight:800; font-size:13px; color:var(--text2) | 1 | renderer/students.css |
| chart-bar | border-radius:4px 4px 0 0 | 1 | renderer/style.css |
| chart-bar-wrap | height:120px | 1 | renderer/style.css |
| dash-rt__bar | height:5px; border-radius:999px; background:var(--dash-track) | 2 | renderer/dashboard.css |
| dl-meth__bar | height:8px; border-radius:999px; background:var(--x-slate-tint) | 3 | renderer/dashboard.css |
| dl-occ__bar | height:10px; border-radius:6px; background:var(--dash-track) | 1 | renderer/dashboard.css |
| filter-bar | background:var(--card); border:var(--hairline); border-radius:var(--r-xl); padding:12px 16px; border-color:#d7c3b5 | 3 | renderer/style.css |
| kpi-bar | height:2px; background:var(--bg5); border-radius:2px | 1 | renderer/style.css |
| kpi-bar-fill | height:100%; border-radius:2px | 1 | renderer/style.css |
| pdf-bar | padding:7px 9px; border-radius:999px; background:rgba(255,255,255,.97); border:1px solid #D9E2F2; box-shadow:0 6px 20px rgba(15,23,42,.16) | 1 | renderer/app.js |
| pdf-bar__m | font-size:11px; color:#6B7A99; padding:0 4px | 1 | renderer/app.js |
| progress-fill | height:100%; border-radius:2px | 2 | renderer/style.css |
| progress-label | font-size:12.5px; color:var(--text2); font-weight:500 | 1 | renderer/style.css |
| progress-track | height:4px; background:var(--bg5); border-radius:2px | 2 | renderer/style.css |
| progress-value | font-size:12.5px; font-weight:600; color:var(--text) | 1 | renderer/style.css |
| rms-stat__bar | height:4px; border-radius:3px; background:var(--dash-track) | 1 | renderer/rooms.css |
| rt-row__bar | height:7px; border-radius:999px; background:var(--dash-track) | 4 | renderer/dashboard.css |
| set-store__bar | height:8px; border-radius:999px; background:var(--dash-track) | 1 | renderer/settings.css |
| stat-bar | height:2px; background:var(--bg5); border-radius:2px | 1 | renderer/style.css |
| stat-bar-fill | height:100%; border-radius:2px | 1 | renderer/style.css |
| stat-card-ent__progress | height:3px; background:rgba(255, 255, 255, 0.06); border-radius:2px | 3 | renderer/components.css |
| stat-card-ent__progress-fill | height:100%; background:var(--accent-600); border-radius:2px | 1 | renderer/components.css |
| svw-card__head--bar | padding:14px 16px; background:var(--dash-sunk); font-size:12px | 2 | renderer/students.css |
| sxp-bar | height:6px; border-radius:3px; background:var(--dash-sunk) | 1 | renderer/dashboard.css |
| sxp-bar__f | height:100%; border-radius:3px; background:var(--ant-warning-fg) | 3 | renderer/dashboard.css |
| toast-progress | height:3px; background:var(--toast-tone) | 2 | renderer/style.css |

| Near-duplicate group (≤2 declarations apart) |
|---|
| al-bar , stat-card-ent__progress , stat-card-ent__progress-fill , dash-rt__bar , rt-row__bar , dl-meth__bar , dl-occ__bar , sxp-bar , sxp-bar__f , rms-stat__bar , set-store__bar , asf-meter__track , arch-ov-bar , progress-track , arch-mc-bar , stat-bar , kpi-bar |
| arc-bar__lbl , asf-meter__l |
| progress-label , progress-value |

Element selectors defined without a class (count of rules whose last compound is the bare element): button 45, input 39, select 11, textarea 5, table 5, th 57, td 91, a 7, label 9, h1 5, h2 4, h3 2.

## 10. Interaction states

| Component | :hover | :focus | :focus-visible | :focus-within | :active | :disabled | :selected/current | :loading | :error/invalid | :read-only |
|---|---|---|---|---|---|---|---|---|---|---|
| button | 85 | 0 | 8 | 0 | 1 | 17 | 11 | 0 | 0 | 1 |
| input | 0 | 14 | 0 | 2 | 0 | 1 | 0 | 0 | 3 | 3 |
| select | 0 | 9 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| textarea | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| checkbox / radio / switch | 1 | 0 | 2 | 0 | 0 | 0 | 2 | 0 | 0 | 0 |
| card / panel | 30 | 0 | 2 | 0 | 0 | 0 | 3 | 0 | 0 | 0 |
| table | 18 | 0 | 2 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| modal / dialog | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 |
| dropdown / menu | 10 | 0 | 2 | 0 | 0 | 0 | 4 | 0 | 0 | 0 |
| tab | 7 | 0 | 2 | 0 | 0 | 0 | 16 | 0 | 0 | 0 |
| badge / pill / chip | 12 | 0 | 3 | 0 | 0 | 0 | 8 | 0 | 0 | 0 |
| toast / alert / banner / notice | 5 | 0 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | 0 |
| tooltip | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 |
| sidebar / nav item | 21 | 0 | 2 | 0 | 0 | 0 | 27 | 0 | 0 | 0 |
| pagination | 1 | 0 | 0 | 0 | 0 | 2 | 2 | 0 | 0 | 0 |
| avatar | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| icon | 10 | 0 | 3 | 0 | 0 | 0 | 9 | 0 | 0 | 0 |
| empty state | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| loading indicator | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 |
| progress bar | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Counts are rules whose selector subject matches the component pattern (§9) and contains the state marker.

`outline: none|0` declarations: 44; without a same-selector focus replacement: 26

| Selector | Value | Location | Focus replacement |
|---|---|---|---|
| .arc-select:focus | none | renderer/archive.css:38 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .hdr-find input | none | renderer/chrome.css:435 | none found for this selector |
| .exp-search input | none | renderer/expenses.css:62 | none found for this selector |
| .exp-select:focus | none | renderer/expenses.css:75 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .exp-month select | none | renderer/expenses.css:85 | none found for this selector |
| .lk-search input | none | renderer/listkit.css:72 | none found for this selector |
| .lk-select:focus | none | renderer/listkit.css:83 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .lk-range input | none | renderer/listkit.css:104 | none found for this selector |
| .lk-sin, .lk-sin:focus, body.light-theme .lk-sin, body.light-theme .lk-sin:focus | none | renderer/listkit.css:248 | none found for this selector |
| #login-screen .lg-in | none | renderer/login.css:106 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .pay-search input | none | renderer/payments.css:79 | none found for this selector |
| .pay-select:focus | none | renderer/payments.css:90 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .pf-in, .pf-sel | none | renderer/payments.css:290 | none found for this selector |
| input.ws__amt | none | renderer/payments.css:459 | none found for this selector |
| .ap-mrail__sel | none | renderer/payments.css:600 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .pf-ta | none | renderer/payments.css:860 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| #extra-charges-list input | none | renderer/payments.css:909 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .rpt-range input | none | renderer/reports.css:24 | none found for this selector |
| .rms-search input | none | renderer/rooms.css:61 | none found for this selector |
| .rms-select:focus | none | renderer/rooms.css:86 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .arm-input > input, .arm-input > select, .arm-input > textarea | none | renderer/rooms.css:302 | none found for this selector |
| .arm-amen__free | none | renderer/rooms.css:368 | none found for this selector |
| .set-in:focus | none | renderer/settings.css:149 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .set-step input | none | renderer/settings.css:176 | none found for this selector |
| .bkp-file, .bkp-ta | none | renderer/settings.css:434 | none found for this selector |
| .set-sel:focus | none | renderer/settings.css:1116 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .stu-search input | none | renderer/students.css:75 | none found for this selector |
| .stu-select:focus | none | renderer/students.css:86 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .sf-in, .sf-sel, .sf-ta | none | renderer/students.css:290 | none found for this selector |
| button | none | renderer/style.css:603 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .sb-month-picker__year-select | none | renderer/style.css:943 | none found for this selector |
| .form-control:focus | none | renderer/style.css:1482 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .inline-edit:hover, .inline-edit:focus | none | renderer/style.css:1946 | none found for this selector |
| .editing-cell | none | renderer/style.css:2126 | none found for this selector |
| .arch-search-inp | none | renderer/style.css:2623 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| #login-input | none | renderer/style.css:3148 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .hdr-search input | none | renderer/style.css:3568 | none found for this selector |
| .form-control:focus | none | renderer/style.css:4537 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| .cmdk-input | none | renderer/style.css:5103 | none found for this selector |
| .sup-hero__in | none | renderer/support.css:53 | none found for this selector |
| .form-control.is-invalid:focus, input.is-invalid:focus | none | renderer/ui-kit.css:109 | none found for this selector |
| .wa-num__f input | none | renderer/whatsapp.css:46 | none found for this selector |
| .key-input:focus | none | renderer/license.html:170 | yes (same base selector with :focus sets outline/box-shadow/border-color) |
| [style] | none | renderer/src/modules/students.js:4303 | none found for this selector |

Global focus rules (selector is `:focus-visible` / `*:focus…`): 2 — :focus-visible (renderer/style.css:3919); :focus-visible (renderer/style.css:4228).

Components with no :focus or :focus-visible rule of their own: textarea, modal / dialog, tooltip, pagination, avatar, empty state, loading indicator, progress bar.

### Cursor values — 339 declarations

| cursor | On interactive-looking selectors | On other selectors | Locations |
|---|---|---|---|
| pointer | 147 | 144 | renderer/activitylog.css:93; renderer/archive.css:23,31,41 (+2); renderer/backup.css:81; +37 files |
| not-allowed | 13 | 5 | renderer/forms.css:323,327; renderer/listkit.css:211,351; renderer/payments.css:261,769; +5 files |
| default | 6 | 8 | renderer/dashboard.css:586,2441; renderer/expenses.css:170; renderer/login.css:159; +7 files |
| help | 1 | 4 | renderer/activitylog.css:41; renderer/components.css:335; renderer/settings.css:1165,1228,1261 |
| grab | 1 | 3 | renderer/payments.css:213; renderer/settings.css:133,721; renderer/students.css:1697 |
| grabbing | 3 | 1 | renderer/payments.css:214; renderer/settings.css:136,728; renderer/students.css:1698 |
| text | 1 | 1 | renderer/rooms.css:370; renderer/style.css:1947 |
| ok ? '' : 'not-allowed | 0 | 1 | renderer/src/modules/expenses.js:656 |

## 11. Hierarchy

### 11.1 Heading elements in markup — 17

| Tag | Count | Locations |
|---|---|---|
| h2 | 6 | renderer/index.html:133; renderer/recovery.html:67,73; renderer/src/export/engine.js:467; renderer/src/modules/students.js:2666,5139 |
| h1 | 5 | renderer/index.html:228; renderer/license.html:380; renderer/recovery.html:59; renderer/src/modules/dashboard.js:2536; renderer/src/modules/students.js:5079 |
| h3 | 3 | renderer/src/modules/students.js:207,217; renderer/src/modules/users.js:148 |
| h4 | 3 | renderer/src/modules/students.js:1051,1557,1908 |

### 11.2 Headings as rendered (computed font-size at each place, light theme)

| Page | Tag | Text | font-size | weight | family | Element |
|---|---|---|---|---|---|---|
| addstudent | h2 | Student intake | 22px | 800 | Outfit, Inter, Barlow, "Segoe UI", syste | div.asf-head > div > h2.asf-title |

Skipped heading levels in document order: none found

### 11.3 Page-title treatment (largest text inside the header, per page)

| Page | Text | Element | id / classes | font-size | weight | family | letter-spacing |
|---|---|---|---|---|---|---|---|
| dashboard | Dashboard | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| rooms | Rooms | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| students | Students | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| payments | Finance | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| expenses | Expenses | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| cancellations | Cancellations | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| former | Former Students | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| reports | Reports | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| issues | Complaints | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| activitylog | Activity Log | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| backup | Backup & Restore | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| users | User Management | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| settings | Settings | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| support | Help & Support | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| archive | Annual Archive | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| maintenance | Complaints | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| complaints | Complaints | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| addstudent | Students | div | #hdr-title page-title | 26px | 700 | Outfit, Inter, Barlow, "Segoe UI", system-ui, sans | -0.572px |
| addpayment | no header text found |  |  |  |  |  |  |

### 11.4 Section-heading / label / eyebrow class patterns — 204 classes

| Class | font-size | font-weight | text-transform | letter-spacing | Files |
|---|---|---|---|---|---|
| act__t | 13.5px | 700 |  |  | renderer/license-settings.html |
| al-head__acts |  |  |  |  | renderer/activitylog.css |
| al-panel__t | 15px | 700 |  |  | renderer/activitylog.css |
| al-user__t |  |  |  |  | renderer/activitylog.css |
| ap-led__head | 9px | 700 | uppercase | .6px | renderer/payments.css |
| arc-panel__head |  |  |  |  | renderer/archive.css |
| arc-panel__t | 13.5px | 800 |  |  | renderer/archive.css |
| arc-sd-head |  |  |  |  | renderer/archive.css |
| arc-sd-sec | 12px | 800 | uppercase | .7px | renderer/archive.css |
| arch-edit-title | 15px | 800 |  |  | renderer/style.css |
| arch-mc-stat-label |  |  |  |  | renderer/style.css |
| arch-modal-title | 17px | 800 |  |  | renderer/style.css |
| arch-ms-label | 9px |  | uppercase | .8px | renderer/style.css |
| arch-ov-label | 10px |  | uppercase | .7px | renderer/style.css |
| arch-s-label | 10px |  | uppercase | .8px | renderer/style.css |
| arch-t-badge-label | 10px |  | uppercase | .8px | renderer/style.css |
| arch-trend-title | 14px | 700 |  |  | renderer/style.css |
| arm-amen-head |  |  |  |  | renderer/rooms.css |
| arm-amen-head__count | 11.5px | 600 |  |  | renderer/rooms.css |
| arm-amen-head__hint | 11.5px |  |  |  | renderer/rooms.css |
| arm-amen-head__t | 13px | 700 |  |  | renderer/rooms.css |
| arm-guide__t | 13px | 700 |  |  | renderer/rooms.css |
| arm-head |  |  |  |  | renderer/rooms.css |
| arm-head__ico |  |  |  |  | renderer/rooms.css |
| arm-head__s | 12.5px | 500 |  | 0 | renderer/rooms.css |
| arm-head__t | 19px | 800 |  | -.02em | renderer/rooms.css |
| arm-label | 13px | 700 |  |  | renderer/rooms.css |
| asf-head |  |  |  |  | renderer/students.css |
| asf-title | 22px | 800 |  | -.02em | renderer/students.css |
| bk-drop__t | 13.5px | 700 |  |  | renderer/backup.css |
| bk-empty__t | 13px | 700 |  |  | renderer/backup.css |
| bk-head |  |  |  |  | renderer/backup.css |
| bk-head__s | 12.5px |  |  |  | renderer/backup.css |
| bk-head__t | 22px | 800 |  | -.02em | renderer/backup.css |
| bk-mini__t | 12.5px | 600 |  |  | renderer/backup.css |
| bkp-head |  |  |  |  | renderer/settings.css |
| bkp-head__ico |  |  |  |  | renderer/settings.css |
| bkp-head__s | 12.5px | 500 |  | 0 | renderer/settings.css |
| bkp-head__t | 19px | 800 |  | -.02em | renderer/settings.css |
| bkp-label | 11px | 700 | uppercase | .9px | renderer/settings.css |
| bkp-safe__t | 13px | 700 |  |  | renderer/settings.css |
| bkp-sec |  |  |  |  | renderer/settings.css |
| bkp-sec__body |  |  |  |  | renderer/settings.css |
| bkp-sec__head | 12px | 700 | uppercase | 1px | renderer/settings.css |
| bkp-sec__ico |  |  |  |  | renderer/settings.css |
| canc-rf__t | 13px | 700 |  |  | renderer/cancellations.css |
| card-ent__title | var(--text-sm) | var(--weight-semibold) | uppercase | 0.03em | renderer/components.css |
| card-title | 18px | 700 |  | -0.3px | renderer/style.css |
| card__t | 14px | 700 |  |  | renderer/license-settings.html |
| cef-due__t | 13px | 700 |  |  | renderer/cancellations.css |
| chart-label | 10px | 500 |  |  | renderer/style.css |
| conn-row__t | 13px | 700 |  |  | renderer/settings.css |
| dash-kpi__label | 10.5px | 700 | uppercase | .8px | renderer/dashboard.css |
| dash-kpi__slabel |  |  |  |  | renderer/dashboard.css |
| dash-pill-heading | 11px | 700 | uppercase | 0.8px | renderer/style.css |
| dash-rp-stat__label | 10px | 700 | uppercase | .9px | renderer/dashboard.css |
| dash-sec |  |  |  |  | renderer/dashboard.css |
| dash-sec__head |  |  |  |  | renderer/dashboard.css |
| dash-sec__sub | 11px | 600 |  |  | renderer/dashboard.css |
| dash-sec__title | 13px | 700 |  |  | renderer/dashboard.css |
| dash-sec__tools |  |  |  |  | renderer/dashboard.css |
| dash-tile__head |  |  |  |  | renderer/dashboard.css |
| dl-act__label | 11px | 600 |  |  | renderer/dashboard.css |
| dl-empty__t | 13.5px | 650 |  |  | renderer/dashboard.css |
| dl-glance__label | 11.5px | 600 |  |  | renderer/dashboard.css |
| dl-head__total | 12px | 700 |  |  | renderer/dashboard.css |
| dl-need__label | 12px |  |  |  | renderer/dashboard.css |
| doc-head |  |  |  |  | renderer/src/modules/students.js |
| doc-head__d | 11px |  |  |  | renderer/src/modules/students.js |
| doc-head__s | 11px |  |  |  | renderer/src/modules/students.js |
| doc-head__t | 20px | 800 |  |  | renderer/src/modules/students.js |
| esf-head |  |  |  |  | renderer/students.css |
| ex-head |  |  |  |  | renderer/src/export/engine.js |
| ex-sec |  |  |  |  | renderer/src/export/engine.js |
| ex-sec__h |  |  |  |  | renderer/src/export/engine.js |
| ex-sec__m | 7.5pt |  |  |  | renderer/src/export/engine.js |
| exf-rcpt__t | 12.5px | 700 |  |  | renderer/expenses.css |
| exf-rec__t | 13.5px | 700 |  |  | renderer/expenses.css |
| field-label | 11.5px | 700 | uppercase | 1.3px | renderer/license.html |
| floor-head |  |  |  |  | renderer/src/modules/dashboard.js |
| group__t | 9pt | 800 |  |  | renderer/src/export/engine.js |
| has-titlebar |  |  |  |  | renderer/license.html |
| hdr-menu__head |  |  |  |  | renderer/chrome.css |
| hdr-title-wrap |  |  |  |  | renderer/chrome.css |
| head |  |  |  |  | renderer/license-settings.html |
| head__ico |  |  |  |  | renderer/license-settings.html |
| head__s | 12.5px |  |  |  | renderer/license-settings.html |
| head__t | 21px | 800 |  | -.02em | renderer/license-settings.html |
| hf-mh__t | 16px | 700 |  | -0.2px | renderer/forms.css |
| hf-sec |  |  |  |  | renderer/forms.css |
| hf-sec__h |  |  |  |  | renderer/forms.css |
| hf-sec__ico |  |  |  |  | renderer/forms.css |
| hf-sec__s | 11.5px |  |  |  | renderer/forms.css |
| hf-sec__t | 13px | 700 |  |  | renderer/forms.css |
| hi-id__head |  |  |  |  | renderer/settings.css |
| hi-ring__t |  |  |  |  | renderer/settings.css |
| hist__head |  |  |  |  | renderer/src/modules/students.js |
| hist__t | 12.5px | 800 |  |  | renderer/src/modules/students.js |
| hz-tb-title | 12px | 650 |  | .1px | renderer/titlebar.css |
| iss-c-title |  |  |  |  | renderer/issues.css, renderer/registers-center.css |
| kicker | 9.5px | 800 | uppercase | 1.6px | renderer/src/modules/dashboard.js, renderer/src/modules/students.js |
| lic-act__t | 13px | 700 |  |  | renderer/settings.css |
| lic-state__t | 13.5px | 700 |  |  | renderer/settings.css |
| lk-banner__t | 13.5px | 700 |  |  | renderer/listkit.css |
| lk-empty__t | 14px | 700 |  |  | renderer/listkit.css |
| lk-head |  |  |  |  | renderer/listkit.css |
| lk-head__n | var(--fs-meta) | var(--fw-meta) |  |  | renderer/listkit.css |
| lk-head__t | var(--fs-card) | var(--fw-card) |  | -.01em | renderer/listkit.css |
| lk-room__t | 11px | 500 |  |  | renderer/listkit.css |
| lk-stat__label | 11px | 700 | uppercase | .8px | renderer/listkit.css |
| login-system-label | 10px | 600 | uppercase | 2.5px | renderer/style.css |
| machine-label | 11.5px | 700 | uppercase | 1.3px | renderer/license.html |
| modal-title | 17px | 700 |  | -0.2px | renderer/style.css |
| money-value--label | var(--fs-label) |  |  |  | renderer/style.css |
| mov__head |  |  |  |  | renderer/reports.css |
| mov__t | 21px | 800 |  | -.02em | renderer/reports.css |
| msf-next__t | 12.5px | 700 |  |  | renderer/forms.css |
| msf-rail__t | 10.5px | 700 | uppercase | .06em | renderer/forms.css |
| nav-label |  |  |  |  | renderer/chrome.css, renderer/style.css |
| onb-head |  |  |  |  | renderer/onboarding.css |
| onb-head__s | 13px |  |  |  | renderer/onboarding.css |
| onb-head__t | 20px | 800 |  | -.01em | renderer/onboarding.css |
| onb-made__t | 12.5px |  |  |  | renderer/onboarding.css |
| onb-next__t | 12.5px | 800 |  |  | renderer/onboarding.css |
| page-title | 26px | 700 |  | -.022em | renderer/chrome.css |
| panel__t | 12.5px | 800 |  |  | renderer/src/modules/students.js |
| pay-pop__t | 10px | 700 | uppercase | .9px | renderer/payments.css |
| pay-room__t | 10.5px |  |  |  | renderer/payments.css |
| pay-stat__label | 12px | 600 |  |  | renderer/payments.css |
| pef-sec |  |  |  |  | renderer/payments.css |
| pef-sec__hint | 11px | 400 |  |  | renderer/payments.css |
| pef-sec__n | 13px | 700 | none | 0 | renderer/payments.css |
| pef-sec__t |  |  |  |  | renderer/payments.css |
| pef-verdict__t |  | 800 |  |  | renderer/payments.css |
| pf-head |  |  |  |  | renderer/payments.css |
| pf-ledger__t | 10.5px | 700 | uppercase | .7px | renderer/payments.css |
| progress-label | 12.5px | 500 |  |  | renderer/style.css |
| rm-type__t | 11px |  |  |  | renderer/settings.css |
| rms-card__head |  |  |  |  | renderer/rooms.css |
| rms-head |  |  |  |  | renderer/rooms.css |
| rms-head__t | 15px | 700 |  |  | renderer/rooms.css |
| rms-stat__label | 11px | 600 |  |  | renderer/rooms.css |
| rpt-brow__t |  |  |  |  | renderer/reports.css |
| rpt-quick__t | 12.5px | 700 |  |  | renderer/reports.css |
| rpt-stat__label | 12.5px | 600 |  | 0 | renderer/reports.css |
| sb-cal-title | 10px | 700 | uppercase | 1.5px | renderer/style.css |
| sb-month-picker__label | 11px | 700 |  | 0.3px | renderer/rail-compact.css, renderer/style.css |
| sb-month-picker__month-label | 12px | 700 |  |  | renderer/style.css |
| seat-hd__t | 14.5px | 700 |  |  | renderer/dashboard.css |
| seat-head |  |  |  |  | renderer/dashboard.css |
| set-empty__t | 14px | 700 |  |  | renderer/settings.css |
| set-head |  |  |  |  | renderer/settings.css |
| set-head__end |  |  |  |  | renderer/settings.css |
| set-head__ico |  |  |  |  | renderer/settings.css |
| set-head__mid |  |  |  |  | renderer/settings.css |
| set-head__s | 11.5px |  |  |  | renderer/settings.css |
| set-head__t | 16px | 800 |  | -.02em | renderer/settings.css |
| set-row__t | 13px | 700 |  |  | renderer/settings.css |
| set-sub__t | 15px | 700 |  |  | renderer/settings.css |
| settings-section-title | 15px |  |  |  | renderer/style.css |
| sf-head |  |  |  |  | renderer/students.css |
| sf-sec |  |  |  |  | renderer/students.css |
| sf-sec__h | 13px | 700 | none | 0 | renderer/students.css |
| skeleton-title |  |  |  |  | renderer/style.css |
| stat-card-ent__label | var(--text-xs) | var(--weight-medium) | uppercase | 0.04em | renderer/components.css |
| stat-card-ent__sublabel | var(--text-sm) |  |  |  | renderer/components.css |
| stat-label | 11px | 600 | uppercase | 0.08em | renderer/style.css |
| stu-addr__t |  |  |  |  | renderer/registers-center.css, renderer/students.css |
| stu-pan__doc__t |  |  |  |  | renderer/students.css |
| stu-pan__head |  |  |  |  | renderer/students.css |
| stu-pan__sec |  |  |  |  | renderer/students.css |
| stu-pan__sec--flush |  |  |  |  | renderer/students.css |
| stu-pan__title | 15px | 700 |  |  | renderer/students.css |
| stu-pan__tl__t | 13px | 650 |  |  | renderer/students.css |
| stu-pop__t | 10px | 700 | uppercase | .9px | renderer/students.css |
| stu-room__t | 10px | 500 |  |  | renderer/listkit.css, renderer/students.css |
| stu-stat__label | 10px | 700 | uppercase | .04em | renderer/students.css |
| subtitle | 8.5pt | 600 | uppercase | 3.2px | renderer/license.html, renderer/src/export/engine.js |
| subtitle-row |  |  |  |  | renderer/license.html |
| sup-art__t | 12.5px | 600 |  |  | renderer/support.css |
| sup-big__t | 14px | 700 |  |  | renderer/support.css |
| sup-empty__t | 12.5px | 700 |  |  | renderer/support.css |
| sup-hero__t | 22px | 800 |  |  | renderer/support.css |
| sup-res__t | 12.5px | 600 |  |  | renderer/support.css |
| sup-tix__t | 12.5px | 700 |  |  | renderer/support.css |
| sup-touch__t | 12.5px | 700 |  |  | renderer/support.css |
| svc-card__t | 13px | 800 |  |  | renderer/settings.css |
| svw-card__head | 13px | 700 |  |  | renderer/students.css |
| svw-card__head--bar | 12px |  |  |  | renderer/students.css |
| sxp-head |  |  |  |  | renderer/dashboard.css |
| title | 15pt | 800 |  | -.5px | renderer/license.html, renderer/src/export/engine.js |
| toast-title | 14px | 700 |  |  | renderer/style.css |
| tsk-head |  |  |  |  | renderer/chrome.css |
| tsk-head__l |  |  |  |  | renderer/chrome.css |
| tsk-head__r |  |  |  |  | renderer/chrome.css |
| usf-grp__t | 13px | 700 |  |  | renderer/users.css |
| usr-act__t | 12px |  |  |  | renderer/users.css |
| usr-ho-head |  |  |  |  | renderer/users.css |
| usr-sec | 10.5px | 700 | uppercase | .05em | renderer/users.css |
| wa-card__t | 13.5px | 700 |  |  | renderer/whatsapp.css |
| wa-empty__t | 15px | 800 |  |  | renderer/whatsapp.css |
| wa-hd__t | 19px | 800 |  |  | renderer/whatsapp.css |
| wa-note__t | 13.5px | 800 |  |  | renderer/whatsapp.css |
| ws__head | 9.5px | 700 | uppercase | .7px | renderer/payments.css |

### 11.5 Emphasis methods (counts)

| Method | Count |
|---|---|
| weight (font-weight ≥600 or bold) | 996 |
| size (font-size on title/heading/label classes) | 126 |
| colour (color set to an accent variable/literal) | 285 |
| case (text-transform: uppercase) | 156 |
| markup (<b>/<strong> tags) | 263 |

Position as an emphasis method: UNKNOWN (not measurable from declarations).

## 12. Iconography and imagery

| Icon system | Count |
|---|---|
| inline <svg> in markup | 293 |
| icon() helper calls | 506 |
| material-symbols references | 1 |
| .micon elements | 5 |
| emoji characters | 104 |
| <img> elements | 23 |

Inline SVG by file:

| File | <svg> count |
|---|---|
| renderer/src/modules/students.js | 53 |
| renderer/index.html | 45 |
| renderer/src/modules/dashboard.js | 35 |
| renderer/src/modules/payments.js | 30 |
| renderer/src/modules/modals.js | 28 |
| renderer/src/modules/rooms.js | 16 |
| renderer/license.html | 15 |
| renderer/src/modules/expenses.js | 12 |
| renderer/src/modules/reports.js | 10 |
| renderer/src/modules/whatsapp.js | 10 |
| renderer/src/modules/cancellations.js | 8 |
| renderer/src/modules/former.js | 5 |
| renderer/src/modules/nav.js | 5 |
| renderer/src/titlebar.js | 5 |
| renderer/src/modules/settings.js | 2 |
| renderer/src/modules/theme.js | 2 |
| renderer/src/pw-eye.js | 2 |
| renderer/src/utils.js | 2 |
| renderer/license-settings.html | 1 |
| renderer/src/auth-nev.js | 1 |
| renderer/src/concessions.js | 1 |
| renderer/src/handovers.js | 1 |
| renderer/src/icons.js | 1 |
| renderer/src/messExempt.js | 1 |
| renderer/src/modules/activitylog.js | 1 |
| renderer/src/toolbar.js | 1 |

| SVG width×height attribute | Count | Locations |
|---|---|---|
| 15×15 | 60 | renderer/index.html:220,627,679 (+1); renderer/license.html:450; renderer/src/concessions.js:321; +13 files |
| 2×- | 53 | renderer/src/icons.js:140; renderer/src/modules/dashboard.js:804,1085,1315 (+1); renderer/src/modules/former.js:300,301; +5 files |
| -×- | 37 | renderer/index.html:163; renderer/license-settings.html:68; renderer/src/modules/dashboard.js:376,601,668 (+18); +7 files |
| 14×14 | 17 | renderer/license.html:368,372,387 (+1); renderer/src/modules/cancellations.js:182; renderer/src/modules/expenses.js:482,486; +3 files |
| 13×13 | 16 | renderer/index.html:129,400,430 (+2); renderer/license.html:393; renderer/src/modules/cancellations.js:157; +4 files |
| 1.8×- | 15 | renderer/index.html:492,502,511 (+11); renderer/src/modules/dashboard.js:1679 |
| 17×17 | 14 | renderer/index.html:142,146,150 (+6); renderer/license.html:516; renderer/src/modules/cancellations.js:319; +3 files |
| 1.9×- | 11 | renderer/src/modules/dashboard.js:458,459,1905; renderer/src/modules/expenses.js:427,431,434 (+1); renderer/src/modules/students.js:274,1510,2418; +1 files |
| 18×18 | 11 | renderer/index.html:283,591,715 (+1); renderer/license.html:424,587; renderer/src/modules/reports.js:1144,1179,1202 (+2) |
| 19×19 | 10 | renderer/index.html:205,210,215; renderer/src/modules/cancellations.js:237; renderer/src/modules/former.js:125; +2 files |
| 16×16 | 7 | renderer/index.html:637,644; renderer/license.html:431,435,439; renderer/src/auth-nev.js:516; +1 files |
| 2.2×- | 6 | renderer/src/modules/dashboard.js:1419; renderer/src/modules/modals.js:841; renderer/src/modules/students.js:275,2417,2420 (+1) |
| 11×11 | 5 | renderer/index.html:258,435; renderer/src/modules/payments.js:500,501; renderer/src/modules/whatsapp.js:113 |
| 21×21 | 5 | renderer/src/modules/cancellations.js:271; renderer/src/modules/rooms.js:233,244,256 (+1) |
| 3×- | 4 | renderer/src/modules/modals.js:792,793,794 (+1) |
| 12×12 | 3 | renderer/src/modules/cancellations.js:217; renderer/src/modules/dashboard.js:1399; renderer/src/modules/students.js:2645 |
| 26×26 | 2 | renderer/src/modules/cancellations.js:327; renderer/src/modules/students.js:3727 |
| 34×34 | 2 | renderer/src/modules/students.js:3381; renderer/src/modules/whatsapp.js:78 |
| 1.2×- | 1 | renderer/license.html:359 |
| 1.6×- | 1 | renderer/license.html:352 |
| 1.9×12 | 1 | renderer/src/modules/expenses.js:504 |
| 10×10 | 1 | renderer/src/modules/payments.js:753 |
| 2.2×13 | 1 | renderer/src/modules/dashboard.js:1346 |
| 2.4×- | 1 | renderer/src/modules/dashboard.js:1909 |
| 20×20 | 1 | renderer/license.html:621 |
| 22×22 | 1 | renderer/src/modules/students.js:2588 |
| 30×30 | 1 | renderer/src/modules/expenses.js:539 |
| 32×32 | 1 | renderer/src/modules/rooms.js:147 |
| 44×44 | 1 | renderer/src/modules/rooms.js:338 |
| 46×46 | 1 | renderer/src/modules/students.js:3581 |
| 50×56 | 1 | renderer/index.html:116 |
| 88×88 | 1 | renderer/src/modules/activitylog.js:261 |
| 92×92 | 1 | renderer/src/modules/settings.js:1722 |

| icon() size argument | Count |
|---|---|
| xs | 239 |
| sm | 186 |
| (default) | 44 |
| md | 34 |
| lg | 3 |

| stroke-width | Count | Locations |
|---|---|---|
| 2 | 132 | renderer/index.html:196,637,644 (+2); renderer/license.html:368,372,387 (+7); renderer/src/concessions.js:321; +17 files |
| 1.9 | 34 | renderer/index.html:142,146,150 (+4); renderer/src/modules/cancellations.js:157,237,319; renderer/src/modules/dashboard.js:458,459,1905; +7 files |
| 1.8 | 24 | renderer/index.html:220,238,245 (+17); renderer/src/modules/cancellations.js:271; renderer/src/modules/dashboard.js:378,1679; +1 files |
| 2.2 | 24 | renderer/index.html:118,283,430 (+3); renderer/src/modules/dashboard.js:1005,1047,1346 (+1); renderer/src/modules/expenses.js:482; +5 files |
| 1.5 | 9 | renderer/index.html:164,169,189 (+2); renderer/src/modules/dashboard.js:546; renderer/src/modules/expenses.js:539; +1 files |
| 1.6 | 9 | renderer/license.html:352; renderer/src/modules/dashboard.js:553,554; renderer/src/modules/students.js:2588,2689,2787 (+2); +1 files |
| 1.7 | 9 | renderer/index.html:205,210,215; renderer/src/modules/cancellations.js:327; renderer/src/modules/expenses.js:119; +1 files |
| 3 | 5 | renderer/index.html:191; renderer/src/modules/modals.js:792,793,794 (+1) |
| 2.4 | 4 | renderer/src/modules/dashboard.js:1910; renderer/src/modules/payments.js:2729,2732; renderer/src/modules/students.js:2645 |
| 2.5 | 4 | renderer/index.html:435; renderer/license.html:424,587; renderer/src/auth-nev.js:517 |
| 2.6 | 4 | renderer/src/modules/payments.js:225,500,501; renderer/src/modules/students.js:2742 |
| 1 | 3 | renderer/index.html:174,184; renderer/license.html:357 |
| 1.2 | 3 | renderer/license.html:359; renderer/src/titlebar.js:25,26 |
| 1.1 | 2 | renderer/src/titlebar.js:27,27 |
| 2.1 | 2 | renderer/src/modules/cancellations.js:182; renderer/src/modules/dashboard.js:1077 |
| 1.25 | 1 | renderer/src/titlebar.js:28 |
| 1.3 | 1 | renderer/src/modules/rooms.js:147 |
| 1.4 | 1 | renderer/src/modules/rooms.js:338 |
| 2.3 | 1 | renderer/index.html:400 |
| 2.8 | 1 | renderer/license.html:621 |
| 3.2 | 1 | renderer/index.html:117 |
| 3.4 | 1 | renderer/index.html:258 |

| <svg> fill attribute | Count |
|---|---|
| none | 250 |
| (none set) | 23 |
| currentColor | 20 |

| Emoji | Count | Locations |
|---|---|---|
| ⚠️ | 14 | renderer/license.html:457; renderer/app.js:196; renderer/src/license.js:72,73,74 (+1); renderer/src/modules/payments.js:1982,2310,2327 (+1); +4 files |
| ✅ | 12 | renderer/src/license.js:61,200,201; renderer/src/modules/settings.js:3512,3580; renderer/src/modules/students.js:3021,3025,3028 (+1); renderer/src/receipt.js:501; +1 files |
| ➕ | 7 | renderer/src/modules/command-palette.js:26,27,28 (+3); renderer/src/modules/payments.js:2189 |
| ✕ | 6 | renderer/src/modules/modals.js:553,757; renderer/src/modules/reports.js:200; renderer/src/modules/students.js:4306,4647,5263 |
| 📷 | 6 | renderer/src/modules/students.js:3318,3320,3322 (+3) |
| ✓ | 5 | renderer/src/modules/payments.js:2204; renderer/src/modules/reports.js:134; renderer/src/modules/students.js:4893,5199,5240 |
| ❌ | 5 | renderer/src/license.js:204,208; renderer/src/receipt.js:423; renderer/src/storage.js:373; main.js:1108 |
| ✏️ | 3 | renderer/src/modules/reports.js:250,252,1443 |
| 📥 | 3 | renderer/src/modules/command-palette.js:32,33,34 |
| 🔍 | 3 | renderer/src/modules/command-palette.js:90; renderer/src/modules/students.js:4311,4323 |
| 🔑 | 3 | renderer/src/license.js:122,205,209 |
| 🎓 | 2 | renderer/src/modules/command-palette.js:14,53 |
| 🏠 | 2 | renderer/src/modules/command-palette.js:14; renderer/src/modules/students.js:4349 |
| 💰 | 2 | renderer/src/modules/whatsapp.js:95; renderer/src/receipt.js:509 |
| 💳 | 2 | renderer/src/modules/command-palette.js:15; renderer/src/modules/payments.js:2137 |
| 📄 | 2 | renderer/src/receipt.js:353,462 |
| 📉 | 2 | renderer/src/modules/command-palette.js:15; renderer/src/modules/reports.js:162 |
| 📋 | 2 | renderer/src/modules/command-palette.js:16; renderer/src/storage.js:341 |
| 🗄 | 2 | renderer/src/modules/archive.js:181; renderer/src/modules/command-palette.js:18 |
| 🗑 | 2 | renderer/src/modules/reports.js:251,253 |
| ⚙️ | 1 | renderer/src/modules/command-palette.js:18 |
| ⚠ | 1 | renderer/src/modules/students.js:5240 |
| ✉️ | 1 | renderer/src/modules/students.js:4347 |
| ✍️ | 1 | renderer/src/modules/payments.js:1368 |
| 🌓 | 1 | renderer/src/modules/command-palette.js:35 |
| 🎉 | 1 | renderer/src/modules/reports.js:135 |
| 👨 | 1 | renderer/src/modules/students.js:4346 |
| 💼 | 1 | renderer/src/modules/students.js:4348 |
| 📅 | 1 | renderer/src/modules/students.js:4351 |
| 📊 | 1 | renderer/src/modules/command-palette.js:16 |
| 📞 | 1 | renderer/src/modules/students.js:4344 |
| 🔄 | 1 | renderer/src/modules/students.js:4777 |
| 🔐 | 1 | renderer/src/license.js:96 |
| 🕑 | 1 | renderer/src/modules/command-palette.js:17 |
| 🧾 | 1 | renderer/src/receipt.js:356 |
| 🪪 | 1 | renderer/src/modules/students.js:4345 |
| 😕 | 1 | renderer/src/modules/students.js:4328 |
| 🚪 | 1 | renderer/src/modules/command-palette.js:14 |
| 🛠 | 1 | renderer/src/modules/command-palette.js:17 |

### Image and logo assets

| Asset | Format | Dimensions | Size (KB) | Referenced in | References |
|---|---|---|---|---|---|
| assets/icon.ico | ico | 16x16 24x24 32x32 48x48 64x64 128x128 256x256 | 22.6 | package.json | 4 |
| assets/icon.png | png | 512x512 | 50.3 | main.js | 6 |
| assets/logo-mark-light.png | png | 60x69 | 2.1 | — | 0 |
| assets/logo-mark.png | png | 60x69 | 2 | — | 0 |
| assets/logo-wordmark-light.png | png | 130x114 | 5.8 | — | 0 |
| assets/logo-wordmark.png | png | 130x114 | 5.7 | — | 0 |
| assets/logo.ico | ico | 256x256 | 40.1 | — | 0 |
| assets/logo.png | png | 256x256 | 2.9 | — | 0 |
| renderer/vendor/fonts/barlow-400-latin.woff2 | woff2 | n/a (font) | 21.7 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-400-latinext.woff2 | woff2 | n/a (font) | 13.9 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-500-latin.woff2 | woff2 | n/a (font) | 21.5 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-500-latinext.woff2 | woff2 | n/a (font) | 14.1 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-600-latin.woff2 | woff2 | n/a (font) | 22.2 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-600-latinext.woff2 | woff2 | n/a (font) | 14.6 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-700-latin.woff2 | woff2 | n/a (font) | 22.3 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-700-latinext.woff2 | woff2 | n/a (font) | 14.5 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-800-latin.woff2 | woff2 | n/a (font) | 22.4 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-800-latinext.woff2 | woff2 | n/a (font) | 14.7 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-400-latin.woff2 | woff2 | n/a (font) | 20.7 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-400-latinext.woff2 | woff2 | n/a (font) | 13.6 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-600-latin.woff2 | woff2 | n/a (font) | 21.8 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-600-latinext.woff2 | woff2 | n/a (font) | 14.2 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-700-latin.woff2 | woff2 | n/a (font) | 21.9 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/barlow-cond-700-latinext.woff2 | woff2 | n/a (font) | 14.3 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/inter-latin-ext.woff2 | woff2 | n/a (font) | 83.1 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/inter-latin.woff2 | woff2 | n/a (font) | 47.1 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/jetbrains-mono-latin-ext.woff2 | woff2 | n/a (font) | 11.4 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/jetbrains-mono-latin.woff2 | woff2 | n/a (font) | 30.7 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/material-symbols-rounded.woff2 | woff2 | n/a (font) | 5219.9 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/outfit-latin-ext.woff2 | woff2 | n/a (font) | 14.5 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/outfit-latin.woff2 | woff2 | n/a (font) | 31.5 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/roboto-mono-latin-ext.woff2 | woff2 | n/a (font) | 22.4 | renderer/vendor/fonts.css | 1 |
| renderer/vendor/fonts/roboto-mono-latin.woff2 | woff2 | n/a (font) | 32 | renderer/vendor/fonts.css | 1 |
| stitch-prototypes/images/01-dashboard-a.png | png | UNKNOWN (file header is not a PNG/ICO header) | 140.3 | — | 0 |
| stitch-prototypes/images/02-dashboard-b.png | png | UNKNOWN (file header is not a PNG/ICO header) | 145.6 | — | 0 |
| stitch-prototypes/images/03-rooms-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 156.2 | — | 0 |
| stitch-prototypes/images/04-rooms-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 127.8 | — | 0 |
| stitch-prototypes/images/05-students-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 181 | — | 0 |
| stitch-prototypes/images/06-students-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 171.4 | — | 0 |
| stitch-prototypes/images/07-finance-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 176 | — | 0 |
| stitch-prototypes/images/08-finance-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 123.5 | — | 0 |
| stitch-prototypes/images/09-receipt-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 96.3 | — | 0 |
| stitch-prototypes/images/10-receipt-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 85.9 | — | 0 |
| stitch-prototypes/images/11-expenses-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 148.2 | — | 0 |
| stitch-prototypes/images/12-expenses-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 132.7 | — | 0 |
| stitch-prototypes/images/13-cancellation-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 95.8 | — | 0 |
| stitch-prototypes/images/14-cancellation-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 158.8 | — | 0 |
| stitch-prototypes/images/15-reports-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 147.3 | — | 0 |
| stitch-prototypes/images/16-reports-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 135.1 | — | 0 |
| stitch-prototypes/images/17-complaints-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 167.4 | — | 0 |
| stitch-prototypes/images/18-complaints-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 118.3 | — | 0 |
| stitch-prototypes/images/19-activity-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 176.5 | — | 0 |
| stitch-prototypes/images/20-activity-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 126.7 | — | 0 |
| stitch-prototypes/images/21-settings-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 93.9 | — | 0 |
| stitch-prototypes/images/22-settings-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 96.6 | — | 0 |
| stitch-prototypes/images/23-login-light.png | png | UNKNOWN (file header is not a PNG/ICO header) | 41.5 | — | 0 |
| stitch-prototypes/images/24-login-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 44.6 | — | 0 |
| stitch-prototypes/images/25-premium-dashboard-dark.png | png | UNKNOWN (file header is not a PNG/ICO header) | 140.4 | — | 0 |
| .scratch-addpayment-dark.png | png | 1595x1040 | 280.7 | — | 0 |
| .scratch-addpayment-redesign.png | png | 1595x1040 | 278.2 | — | 0 |
| .scratch-cancellations-dark.png | png | 1440x1000 | 152.3 | — | 0 |
| .scratch-cancellations.png | png | 1440x1000 | 174 | — | 0 |
| .scratch-connection.png | png | 1500x950 | 136.9 | — | 0 |
| .scratch-dash-after.png | png | 1600x1000 | 242.7 | — | 0 |
| .scratch-dash-before.png | png | 1600x1000 | 237.1 | — | 0 |
| .scratch-dash-w1100.png | png | 1100x900 | 166.1 | — | 0 |
| .scratch-dash-w1280.png | png | 1280x900 | 195.2 | — | 0 |
| .scratch-dash-w1366.png | png | 1366x900 | 230.3 | — | 0 |
| .scratch-issues.png | png | 1440x1000 | 196.1 | — | 0 |
| .scratch-payments-onerow.png | png | 1440x1000 | 162.7 | — | 0 |
| .scratch-reports-1366.png | png | 1366x768 | 140.7 | — | 0 |
| .scratch-reports-onerow.png | png | 1440x1000 | 161.1 | — | 0 |
| .scratch-reports.png | png | 1440x1000 | 175.6 | — | 0 |
| trend-first.png | png | 1400x800 | 213.1 | — | 0 |
| trend-second.png | png | 1400x800 | 213.6 | — | 0 |

Assets referenced by nothing in the scanned files, package.json or main.js: 48.

| Folder | Unreferenced | Files |
|---|---|---|
| stitch-prototypes/images/ | 25 | 01-dashboard-a.png, 02-dashboard-b.png, 03-rooms-light.png, 04-rooms-dark.png, 05-students-light.png, 06-students-dark.png, 07-finance-light.png, 08-finance-dark.png, 09-receipt-light.png, 10-receipt-dark.png, 11-expenses-light.png, 12-expenses-dark.png, 13-cancellation-light.png, 14-cancellation-dark.png, 15-reports-light.png, 16-reports-dark.png, 17-complaints-light.png, 18-complaints-dark.png, 19-activity-light.png, 20-activity-dark.png, 21-settings-light.png, 22-settings-dark.png, 23-login-light.png, 24-login-dark.png, 25-premium-dashboard-dark.png |
| (repo root) | 17 | .scratch-addpayment-dark.png, .scratch-addpayment-redesign.png, .scratch-cancellations-dark.png, .scratch-cancellations.png, .scratch-connection.png, .scratch-dash-after.png, .scratch-dash-before.png, .scratch-dash-w1100.png, .scratch-dash-w1280.png, .scratch-dash-w1366.png, .scratch-issues.png, .scratch-payments-onerow.png, .scratch-reports-1366.png, .scratch-reports-onerow.png, .scratch-reports.png, trend-first.png, trend-second.png |
| assets/ | 6 | logo-mark-light.png, logo-mark.png, logo-wordmark-light.png, logo-wordmark.png, logo.ico, logo.png |

<img> alt coverage (static): 23 elements; with alt attribute 17; alt="" 13; no alt 6 — renderer/src/auth-nev.js:741; renderer/src/modules/students.js:3280,3352,3372 (+1); renderer/src/receipt.js:163.

## 13. CSS architecture

### 13.1 Stylesheets and load order (renderer/index.html)

| Order | Stylesheet | Link line | Lines |
|---|---|---|---|
| 1 | vendor/fonts.css | renderer/index.html:10 | 249 |
| 2 | tokens.css | renderer/index.html:20 | 676 |
| 3 | components.css | renderer/index.html:21 | 344 |
| 4 | pw-eye.css | renderer/index.html:22 | 23 |
| 5 | style.css | renderer/index.html:23 | 5197 |
| 6 | forms.css | renderer/index.html:27 | 548 |
| 7 | ui-kit.css | renderer/index.html:30 | 127 |
| 8 | listkit.css | renderer/index.html:31 | 441 |
| 9 | dashboard.css | renderer/index.html:32 | 3236 |
| 10 | payments.css | renderer/index.html:33 | 1583 |
| 11 | students.css | renderer/index.html:34 | 1863 |
| 12 | rooms.css | renderer/index.html:35 | 442 |
| 13 | issues.css | renderer/index.html:36 | 209 |
| 14 | reports.css | renderer/index.html:37 | 634 |
| 15 | expenses.css | renderer/index.html:38 | 328 |
| 16 | former.css | renderer/index.html:39 | 178 |
| 17 | cancellations.css | renderer/index.html:40 | 243 |
| 18 | archive.css | renderer/index.html:41 | 222 |
| 19 | whatsapp.css | renderer/index.html:42 | 142 |
| 20 | settings.css | renderer/index.html:43 | 1273 |
| 21 | backup.css | renderer/index.html:44 | 133 |
| 22 | activitylog.css | renderer/index.html:45 | 153 |
| 23 | users.css | renderer/index.html:46 | 308 |
| 24 | onboarding.css | renderer/index.html:47 | 180 |
| 25 | support.css | renderer/index.html:50 | 284 |
| 26 | chrome.css | renderer/index.html:52 | 900 |
| 27 | titlebar.css | renderer/index.html:54 | 171 |
| 28 | login.css | renderer/index.html:56 | 304 |
| 29 | rail-compact.css | renderer/index.html:61 | 57 |
| 30 | registers-center.css | renderer/index.html:66 | 100 |

Other pages: renderer/license.html, renderer/license-settings.html and renderer/recovery.html carry their own <style> blocks (see CSP rows in §1.8 for their locations).

### 13.2 Inline style= attributes — 953

| File (screen) | Count |
|---|---|
| renderer/src/modules/dashboard.js | 222 |
| renderer/src/modules/students.js | 169 |
| renderer/src/modules/reports.js | 134 |
| renderer/src/modules/settings.js | 126 |
| renderer/src/modules/payments.js | 55 |
| renderer/src/receipt.js | 45 |
| renderer/src/modules/archive.js | 40 |
| renderer/src/modules/rooms.js | 31 |
| renderer/index.html | 24 |
| renderer/src/license.js | 15 |
| renderer/src/modules/users.js | 15 |
| renderer/src/modules/nav.js | 10 |
| renderer/src/modules/cancellations.js | 9 |
| renderer/src/modules/modals.js | 8 |
| renderer/src/utils.js | 7 |
| renderer/src/export/xlsx-writer.js | 6 |
| renderer/src/modules/activitylog.js | 5 |
| renderer/src/modules/issues.js | 5 |
| renderer/src/storage.js | 5 |
| renderer/app.js | 4 |
| renderer/license-settings.html | 3 |
| renderer/license.html | 3 |
| renderer/src/export/engine.js | 3 |
| renderer/src/modules/backup-page.js | 2 |
| renderer/src/modules/expenses.js | 2 |
| renderer/src/modules/sidebar_calendar.js | 2 |
| main.js | 1 |
| renderer/src/auth-nev.js | 1 |
| renderer/src/modules/former.js | 1 |

### 13.3 !important — 67

| File | Count | Lines |
|---|---|---|
| renderer/style.css | 39 | 214, 215, 542, 543, 851, 974, 1334, 1990, 1992, 1993, 1994, 1995, 1996, 2000, 2001, 2004, 2005, 2006, 2007, 2008, 2009, 2011, 2011, 2119, 2120, 2806, 2807, 2808, 3429, 3430, 3722, 3726, 4088, 4089, 4090, 4090, 4091, 4091, 4878 |
| renderer/dashboard.css | 11 | 353, 921, 2663, 2663, 2663, 2664, 2664, 2950, 3030, 3031, 3032 |
| renderer/chrome.css | 7 | 273, 404, 407, 408, 454, 457, 599 |
| renderer/src/modules/students.js | 3 | 4989, 5045, 5065 |
| renderer/login.css | 2 | 46, 301 |
| renderer/src/export/engine.js | 2 | 655, 655 |
| renderer/reports.css | 1 | 488 |
| renderer/src/modules/dashboard.js | 1 | 2416 |
| renderer/students.css | 1 | 1814 |

### 13.4 Specificity hot spots — 546 selectors at (0,3,0) or above (or any id)

| Specificity (a,b,c) | Count | Sample selectors | Locations |
|---|---|---|---|
| (2,1,0) | 6 | #login-screen #login-btn:hover ; #login-screen #login-btn:active ; #login-screen #login-btn:disabled | renderer/login.css:157,158,159 (+2); renderer/style.css:3284 |
| (2,0,0) | 6 | #login-screen #login-card ; #login-screen #login-card::before ; #login-screen #login-card::after | renderer/login.css:49,62,62 (+3) |
| (1,4,0) | 3 | #stu-panel .stu-pan__acts > .stu-pan__act:last-child:nth-child(3n+1) ; #stu-panel .stu-pan__acts > .stu-pan__act:last-child:nth-child(3n+2) ; #stu-panel .stu-pan__acts > .stu-pan__act:nth-last-child(2):nth-child(3n+1) | renderer/students.css:1332,1333,1333 |
| (1,3,1) | 3 | body.light-theme #sidebar .nav-item.active ; body.light-theme #sidebar .nav-item.active ; body.light-theme #sidebar .nav-item.active | renderer/chrome.css:835,847,854 |
| (1,3,0) | 8 | #sidebar .sb-nav > .sb-section:first-child ; #sidebar .nav-item.active .nav-icon ; #sidebar .nav-item.active .nav-badge | renderer/chrome.css:233,271,302 (+4); renderer/payments.css:574 |
| (1,2,1) | 7 | body.sidebar-collapsed #sidebar .sb-logo ; body.sidebar-collapsed #sidebar .sb-logo-text ; body.sidebar-collapsed #sidebar .sb-section | renderer/chrome.css:161,338,338 (+1); renderer/rail-compact.css:40; renderer/style.css:3165; +1 files |
| (1,2,0) | 22 | #sidebar .sb-logo-text .name ; #sidebar .sb-logo-text .sub ; #sidebar .sidebar-collapse-btn:hover | renderer/chrome.css:172,176,203 (+12); renderer/login.css:110,116,146; renderer/payments.css:518,569,768; +1 files |
| (1,1,1) | 29 | body.light-theme #sidebar ; body.light-theme #header ; body.chrome-task #header | renderer/chrome.css:141,351,634 (+2); renderer/login.css:40; renderer/payments.css:911; +2 files |
| (1,1,0) | 57 | #sidebar .sb-logo ; #sidebar .sb-logo::after ; #sidebar .sb-logo-mark | renderer/chrome.css:150,162,163 (+29); renderer/former.css:172; renderer/login.css:103,109,111 (+1); +7 files |
| (1,0,1) | 3 | #rs-extra-list > div ; #extra-charges-list input ; #hz-titlebar button | renderer/former.css:171; renderer/payments.css:906; renderer/titlebar.css:27 |
| (1,0,0) | 87 | #sidebar ; #header ; #sidebar | renderer/chrome.css:141,351,403 (+9); renderer/dashboard.css:353,919,1071 (+17); renderer/login.css:20,46,46 (+3); +5 files |
| (0,5,0) | 4 | .dl-pending .dash-icon-btn.dh-green:not(.dash-icon-btn--wa):hover ; .act.warn .btn:hover:not(:disabled) ; .act.danger .btn:hover:not(:disabled) | renderer/dashboard.css:1480; renderer/license-settings.html:185,190,195 |
| (0,4,1) | 7 | .dash-row-b .seat-inline__k.is-free:hover b ; .lk-pager button:hover:not(:disabled):not(.is-on) ; .pay-pager button:hover:not(:disabled):not(.is-on) | renderer/dashboard.css:2444; renderer/listkit.css:210; renderer/payments.css:260; +2 files |
| (0,4,0) | 17 | .dl-pending .dash-icon-btn.dh-green:not(.dash-icon-btn--wa) ; .dl-pending .dash-icon-btn.dh-slate:hover ; .dash-row-b .dash-room.is-full .n | renderer/dashboard.css:1477,1486,1867 (+4); renderer/former.css:53; renderer/payments.css:1345; +3 files |
| (0,3,3) | 7 | .iss-table tbody tr:hover td:nth-child(10) ; .pay-table tbody tr.is-arrear td:first-child ; .pay-table tbody tr.is-arrear:hover td | renderer/issues.css:99; renderer/payments.css:155,1086,1087; renderer/reports.css:633; +2 files |
| (0,3,2) | 12 | .arc-table tbody tr.is-click:hover ; .exp-table thead th.is-sortable:hover ; .exp-table thead th.is-sorted .arw | renderer/archive.css:108; renderer/expenses.css:103,106; renderer/listkit.css:140,143; +3 files |
| (0,3,1) | 50 | .al-pager .set-btn:last-child svg ; .arc-tabs button.is-on .arc-tabs__n ; body.light-theme .btn-primary:hover | renderer/activitylog.css:112; renderer/archive.css:80; renderer/chrome.css:579; +12 files |
| (0,3,0) | 218 | .al-kpi.is-locked .al-kpi__v ; .arc-kpi.dh-green .arc-kpi__v ; .arc-kpi.dh-red .arc-kpi__v | renderer/activitylog.css:40; renderer/archive.css:61,62,63 (+1); renderer/cancellations.css:242; +21 files |

### 13.5 Same selector, same property, different values — 398 conflicts

Winner = the later declaration in stylesheet load order (then line order), unless an earlier one is !important and no later one is. Different selectors reaching the same element are not resolved here.

| Selector | @media | Property | Declarations in order (value @ location) | Winner |
|---|---|---|---|---|
| .arc-table .num |  | text-align | right @ renderer/archive.css:109 → center @ renderer/registers-center.css:53 | center @ renderer/registers-center.css:53 |
| #sidebar .sb-logo |  | padding | 18px 16px 16px 44px @ renderer/chrome.css:155 → 10px 16px 6px 44px @ renderer/rail-compact.css:38 | 10px 16px 6px 44px @ renderer/rail-compact.css:38 |
| #sidebar .sb-section |  | font-weight | 700 @ renderer/chrome.css:229 → 800 @ renderer/chrome.css:867 | 800 @ renderer/chrome.css:867 |
| #sidebar .sb-section |  | letter-spacing | 1.4px @ renderer/chrome.css:230 → 1.1px @ renderer/chrome.css:868 | 1.1px @ renderer/chrome.css:868 |
| #sidebar .sb-section |  | color | var(--sb-fg3) @ renderer/chrome.css:230 → var(--sb-fg2) @ renderer/chrome.css:866 | var(--sb-fg2) @ renderer/chrome.css:866 |
| #sidebar .sb-section |  | padding | 6px 10px 4px @ renderer/chrome.css:230 → 4px 10px 2px @ renderer/rail-compact.css:45 | 4px 10px 2px @ renderer/rail-compact.css:45 |
| #sidebar .sb-section |  | margin-top | 4px @ renderer/chrome.css:231 → 2px @ renderer/rail-compact.css:45 | 2px @ renderer/rail-compact.css:45 |
| #sidebar .nav-item.active |  | background | linear-gradient(135deg, var(--accent-600) 0%, var(--accent-500) 100%) @ renderer/chrome.css:265 → var(--sb-active-surface) @ renderer/chrome.css:799 | var(--sb-active-surface) @ renderer/chrome.css:799 |
| #sidebar .nav-item.active |  | color | var(--sb-active-fg) @ renderer/chrome.css:266 → var(--sb-fg) @ renderer/chrome.css:800 | var(--sb-fg) @ renderer/chrome.css:800 |
| #sidebar .nav-item.active |  | border-color | rgba(255, 255, 255, .10) @ renderer/chrome.css:267 → var(--sb-active-edge) @ renderer/chrome.css:801 | var(--sb-active-edge) @ renderer/chrome.css:801 |
| #sidebar .nav-item.active |  | box-shadow | 0 8px 20px rgba(27, 63, 174, .28) @ renderer/chrome.css:268 → none @ renderer/chrome.css:802 | none @ renderer/chrome.css:802 |
| #sidebar .nav-item.active |  | font-weight | 600 @ renderer/chrome.css:269 → 650 @ renderer/chrome.css:803 | 650 @ renderer/chrome.css:803 |
| #sidebar .nav-item.active .nav-icon |  | color | var(--sb-active-fg) @ renderer/chrome.css:271 → var(--accent) @ renderer/chrome.css:817 → var(--gray-50) @ renderer/chrome.css:856 | var(--gray-50) @ renderer/chrome.css:856 |
| #sidebar .nav-item.active .nav-badge |  | background | rgba(255,255,255,.28) @ renderer/chrome.css:302 → var(--accent) @ renderer/chrome.css:825 → var(--gray-50) @ renderer/chrome.css:857 | var(--gray-50) @ renderer/chrome.css:857 |
| #sidebar | @media (max-width: 900px) | transform | translateX(-100%) @ renderer/style.css:1982 → none !important @ renderer/chrome.css:404 | none @ renderer/chrome.css:404 |
| .hdr-right |  | gap | 10px @ renderer/style.css:1078 → 9px @ renderer/chrome.css:460 | 9px @ renderer/chrome.css:460 |
| .hdr-month-picker .sb-month-picker__header |  | gap | 1px @ renderer/style.css:1088 → 2px @ renderer/chrome.css:485 | 2px @ renderer/chrome.css:485 |
| .hdr-month-picker .sb-month-picker__display |  | padding | 4px 10px @ renderer/style.css:1091 → 0 6px @ renderer/chrome.css:489 | 0 6px @ renderer/chrome.css:489 |
| .hdr-month-picker .sb-month-picker__display |  | font-size | 11px @ renderer/style.css:1093 → 13px @ renderer/chrome.css:489 | 13px @ renderer/chrome.css:489 |
| .hdr-month-picker .sb-month-picker__arrow |  | height | 26px @ renderer/style.css:1097 → 30px @ renderer/chrome.css:493 | 30px @ renderer/chrome.css:493 |
| #sidebar .nav-item.active::before |  | display | block @ renderer/chrome.css:809 → none @ renderer/chrome.css:855 | none @ renderer/chrome.css:855 |
| #sidebar .nav-item.active .nav-badge |  | color | var(--text-on-accent) @ renderer/chrome.css:825 → var(--gray-700) @ renderer/chrome.css:857 | var(--gray-700) @ renderer/chrome.css:857 |
| .dsh-card |  | padding | 16px @ renderer/dashboard.css:27 → 13px 15px @ renderer/dashboard.css:297 | 13px 15px @ renderer/dashboard.css:297 |
| .dash-kpi-grid |  | grid-template-columns | repeat(auto-fit,minmax(212px,1fr)) @ renderer/dashboard.css:44 → repeat(auto-fit,minmax(196px,1fr)) @ renderer/dashboard.css:299 → repeat(5,minmax(0,1fr)) @ renderer/dashboard.css:708 | repeat(5,minmax(0,1fr)) @ renderer/dashboard.css:708 |
| .dash-kpi-grid |  | gap | 12px @ renderer/dashboard.css:44 → 10px @ renderer/dashboard.css:299 | 10px @ renderer/dashboard.css:299 |
| .dash-kpi-grid |  | margin-bottom | 12px @ renderer/dashboard.css:44 → 10px @ renderer/dashboard.css:299 | 10px @ renderer/dashboard.css:299 |
| .dash-kpi__top |  | gap | 10px @ renderer/dashboard.css:47 → 9px @ renderer/dashboard.css:302 | 9px @ renderer/dashboard.css:302 |
| .dash-kpi__top |  | margin-bottom | 12px @ renderer/dashboard.css:47 → 10px @ renderer/dashboard.css:302 → 8px @ renderer/dashboard.css:2888 → 6px @ renderer/dashboard.css:2988 | 6px @ renderer/dashboard.css:2988 |
| .dash-kpi__label |  | font-size | 11px @ renderer/dashboard.css:52 → 10.5px @ renderer/dashboard.css:303 | 10.5px @ renderer/dashboard.css:303 |
| .dash-kpi__label |  | letter-spacing | .9px @ renderer/dashboard.css:52 → .8px @ renderer/dashboard.css:303 | .8px @ renderer/dashboard.css:303 |
| .dash-kpi__label |  | line-height | 1.3 @ renderer/dashboard.css:52 → 1.25 @ renderer/dashboard.css:2893 | 1.25 @ renderer/dashboard.css:2893 |
| .dash-kpi__note |  | margin-top | 8px @ renderer/dashboard.css:60 → 6px @ renderer/dashboard.css:2894 → 5px @ renderer/dashboard.css:2990 → 4px @ renderer/dashboard.css:3018 | 4px @ renderer/dashboard.css:3018 |
| .dash-kpi__note |  | padding-top | 7px @ renderer/dashboard.css:61 → 6px @ renderer/dashboard.css:2894 → 5px @ renderer/dashboard.css:2990 → 4px @ renderer/dashboard.css:3018 | 4px @ renderer/dashboard.css:3018 |
| .dash-kpi__value |  | margin-bottom | 9px @ renderer/dashboard.css:66 → 7px @ renderer/dashboard.css:304 → 5px @ renderer/dashboard.css:2989 | 5px @ renderer/dashboard.css:2989 |
| .dash-kpi__sub |  | font-size | 11px @ renderer/dashboard.css:67 → 10.5px @ renderer/dashboard.css:308 | 10.5px @ renderer/dashboard.css:308 |
| .dash-kpi__sub |  | line-height | 1.55 @ renderer/dashboard.css:67 → 1.5 @ renderer/dashboard.css:308 | 1.5 @ renderer/dashboard.css:308 |
| .dash-track |  | height | 6px @ renderer/dashboard.css:83 → 5px @ renderer/dashboard.css:318 | 5px @ renderer/dashboard.css:318 |
| .dash-spark |  | height | 36px @ renderer/dashboard.css:87 → 30px @ renderer/dashboard.css:316 | 30px @ renderer/dashboard.css:316 |
| .dash-spark-empty |  | height | 36px @ renderer/dashboard.css:92 → 30px @ renderer/dashboard.css:317 | 30px @ renderer/dashboard.css:317 |
| .dash-tile-grid |  | grid-template-columns | repeat(auto-fit,minmax(258px,1fr)) @ renderer/dashboard.css:95 → repeat(auto-fit,minmax(238px,1fr)) @ renderer/dashboard.css:300 | repeat(auto-fit,minmax(238px,1fr)) @ renderer/dashboard.css:300 |
| .dash-tile-grid |  | gap | 12px @ renderer/dashboard.css:95 → 10px @ renderer/dashboard.css:300 | 10px @ renderer/dashboard.css:300 |
| .dash-tile-grid |  | margin-bottom | 12px @ renderer/dashboard.css:95 → 10px @ renderer/dashboard.css:300 | 10px @ renderer/dashboard.css:300 |
| .dash-tile__head |  | gap | 12px @ renderer/dashboard.css:96 → 10px @ renderer/dashboard.css:313 | 10px @ renderer/dashboard.css:313 |
| .dash-tile__head |  | margin-bottom | 11px @ renderer/dashboard.css:96 → 9px @ renderer/dashboard.css:313 | 9px @ renderer/dashboard.css:313 |
| .dash-tile__num |  | font-size | 30px @ renderer/dashboard.css:97 → 26px @ renderer/dashboard.css:314 | 26px @ renderer/dashboard.css:314 |
| .dash-sec |  | padding | 14px var(--sec-pad-x) @ renderer/dashboard.css:108 → 12px var(--sec-pad-x) @ renderer/dashboard.css:298 | 12px var(--sec-pad-x) @ renderer/dashboard.css:298 |
| .dash-sec__head |  | gap | 9px @ renderer/dashboard.css:109 → 8px @ renderer/dashboard.css:320 | 8px @ renderer/dashboard.css:320 |
| .dash-sec__head |  | margin-bottom | 12px @ renderer/dashboard.css:109 → 10px @ renderer/dashboard.css:320 | 10px @ renderer/dashboard.css:320 |
| .dash-sec__title |  | font-size | 14px @ renderer/dashboard.css:110 → 13px @ renderer/dashboard.css:321 | 13px @ renderer/dashboard.css:321 |
| .dash-mini |  | border-radius | 10px @ renderer/dashboard.css:142 → 9px @ renderer/dashboard.css:323 | 9px @ renderer/dashboard.css:323 |
| .dash-mini |  | padding | 7px 11px @ renderer/dashboard.css:142 → 6px 10px @ renderer/dashboard.css:323 | 6px 10px @ renderer/dashboard.css:323 |
| .dash-mini__v |  | font-size | 14px @ renderer/dashboard.css:145 → 13px @ renderer/dashboard.css:324 | 13px @ renderer/dashboard.css:324 |
| .dash-seat-sum |  | gap | 8px @ renderer/dashboard.css:148 → 7px @ renderer/dashboard.css:326 | 7px @ renderer/dashboard.css:326 |
| .dash-seat-sum |  | margin-bottom | 10px @ renderer/dashboard.css:148 → 9px @ renderer/dashboard.css:326 | 9px @ renderer/dashboard.css:326 |
| .dash-seat-sum > div |  | border-radius | 12px @ renderer/dashboard.css:149 → 10px @ renderer/dashboard.css:327 | 10px @ renderer/dashboard.css:327 |
| .dash-seat-sum > div |  | padding | 10px 8px @ renderer/dashboard.css:149 → 8px 6px @ renderer/dashboard.css:327 | 8px 6px @ renderer/dashboard.css:327 |
| .dash-seat-sum .n |  | font-size | 24px @ renderer/dashboard.css:151 → 21px @ renderer/dashboard.css:328 | 21px @ renderer/dashboard.css:328 |
| .dash-room-wrap |  | max-height | 104px @ renderer/dashboard.css:154 → 140px @ renderer/dashboard.css:354 | 140px @ renderer/dashboard.css:354 |
| .dash-room |  | border-radius | 9px @ renderer/dashboard.css:155 → 8px @ renderer/dashboard.css:330 | 8px @ renderer/dashboard.css:330 |
| .dash-room |  | padding | 6px 8px @ renderer/dashboard.css:155 → 5px 7px @ renderer/dashboard.css:330 | 5px 7px @ renderer/dashboard.css:330 |
| .dash-room |  | min-width | 44px @ renderer/dashboard.css:155 → 41px @ renderer/dashboard.css:330 | 41px @ renderer/dashboard.css:330 |
| .dash-rt |  | gap | 11px @ renderer/dashboard.css:165 → 10px @ renderer/dashboard.css:332 | 10px @ renderer/dashboard.css:332 |
| .dash-rt |  | padding | 9px 0 @ renderer/dashboard.css:165 → 7px 0 @ renderer/dashboard.css:332 | 7px 0 @ renderer/dashboard.css:332 |
| .dash-rt__name |  | font-size | 12.5px @ renderer/dashboard.css:168 → 12px @ renderer/dashboard.css:333 | 12px @ renderer/dashboard.css:333 |
| .dash-rt__bar |  | width | 92px @ renderer/dashboard.css:170 → 84px @ renderer/dashboard.css:334 | 84px @ renderer/dashboard.css:334 |
| .dash-rt__bar |  | height | 6px @ renderer/dashboard.css:170 → 5px @ renderer/dashboard.css:334 | 5px @ renderer/dashboard.css:334 |
| .rt-donut |  | width | 170px @ renderer/dashboard.css:185 → 150px @ renderer/dashboard.css:345 | 150px @ renderer/dashboard.css:345 |
| .rt-donut |  | height | 170px @ renderer/dashboard.css:185 → 150px @ renderer/dashboard.css:345 | 150px @ renderer/dashboard.css:345 |
| .dash-pay |  | gap | 11px @ renderer/dashboard.css:259 → 10px @ renderer/dashboard.css:336 | 10px @ renderer/dashboard.css:336 |
| .dash-pay |  | padding | 10px 0 @ renderer/dashboard.css:259 → 8px 0 @ renderer/dashboard.css:336 | 8px 0 @ renderer/dashboard.css:336 |
| .dash-av |  | width | 34px @ renderer/dashboard.css:261 → 31px @ renderer/dashboard.css:337 | 31px @ renderer/dashboard.css:337 |
| .dash-av |  | height | 34px @ renderer/dashboard.css:261 → 31px @ renderer/dashboard.css:337 | 31px @ renderer/dashboard.css:337 |
| .dash-av |  | font-size | 11.5px @ renderer/dashboard.css:261 → 11px @ renderer/dashboard.css:337 | 11px @ renderer/dashboard.css:337 |
| .dash-pay__name |  | font-size | 13px @ renderer/dashboard.css:263 → 12.5px @ renderer/dashboard.css:338 | 12.5px @ renderer/dashboard.css:338 |
| #trend-chart-wrap |  | height | 198px !important @ renderer/dashboard.css:353 → auto !important @ renderer/dashboard.css:921 → 177px !important @ renderer/dashboard.css:2950 → 244px !important @ renderer/dashboard.css:3030 | 244px @ renderer/dashboard.css:3030 |
| .dl-meth |  | gap | 9px @ renderer/dashboard.css:547 → 2px @ renderer/dashboard.css:1278 | 2px @ renderer/dashboard.css:1278 |
| .dl-meth__row |  | grid-template-columns | auto 1fr auto auto @ renderer/dashboard.css:548 → 10px minmax(64px, 96px) minmax(0, 1fr) 44px auto @ renderer/dashboard.css:1281 | 10px minmax(64px, 96px) minmax(0, 1fr) 44px auto @ renderer/dashboard.css:1281 |
| .dl-meth__name |  | font-size | 12px @ renderer/dashboard.css:549 → 12.5px @ renderer/dashboard.css:1291 | 12.5px @ renderer/dashboard.css:1291 |
| .dl-meth__bar |  | border-radius | 4px @ renderer/dashboard.css:550 → 999px @ renderer/dashboard.css:1293 | 999px @ renderer/dashboard.css:1293 |
| .dl-meth__pct |  | font-size | 11px @ renderer/dashboard.css:552 → 11.5px @ renderer/dashboard.css:1295 | 11.5px @ renderer/dashboard.css:1295 |
| .dl-meth__amt |  | font-size | 12px @ renderer/dashboard.css:554 → 12.5px @ renderer/dashboard.css:1297 | 12.5px @ renderer/dashboard.css:1297 |
| .dash-row-b |  | grid-template-columns | 1.45fr 1fr calc((100% - 50px) / 6) @ renderer/dashboard.css:623 → 1.45fr 1fr var(--dash-right-col) @ renderer/dashboard.css:1953 | 1.45fr 1fr var(--dash-right-col) @ renderer/dashboard.css:1953 |
| .dash-row-c |  | grid-template-columns | 2.1fr 1.42fr .68fr @ renderer/dashboard.css:636 → 1.9fr 1.15fr var(--dash-right-col) @ renderer/dashboard.css:1954 | 1.9fr 1.15fr var(--dash-right-col) @ renderer/dashboard.css:1954 |
| .dash-row-c .rt-body |  | grid-template-columns | 150px minmax(0,1fr) @ renderer/dashboard.css:851 → 130px minmax(0,1fr) @ renderer/dashboard.css:2072 → 118px minmax(0, 1fr) @ renderer/dashboard.css:3047 | 118px minmax(0, 1fr) @ renderer/dashboard.css:3047 |
| .dash-row-c .rt-body |  | gap | 16px @ renderer/dashboard.css:851 → 14px @ renderer/dashboard.css:3047 | 14px @ renderer/dashboard.css:3047 |
| .dash-row-c .rt-donut |  | width | 150px @ renderer/dashboard.css:853 → 118px @ renderer/dashboard.css:3048 | 118px @ renderer/dashboard.css:3048 |
| .dash-row-c .rt-donut |  | height | 150px @ renderer/dashboard.css:853 → 118px @ renderer/dashboard.css:3048 | 118px @ renderer/dashboard.css:3048 |
| .dash-row-c .rt-donut |  | max-width | 150px @ renderer/dashboard.css:853 → 168px @ renderer/dashboard.css:1524 → 118px @ renderer/dashboard.css:3048 | 118px @ renderer/dashboard.css:3048 |
| #trend-chart-wrap |  | min-height | 120px @ renderer/dashboard.css:922 → 152px @ renderer/dashboard.css:1773 → 168px @ renderer/dashboard.css:2123 | 168px @ renderer/dashboard.css:2123 |
| .dash-row-b .dash-room-wrap |  | min-height | 0 @ renderer/dashboard.css:939 → 81px @ renderer/dashboard.css:2051 | 81px @ renderer/dashboard.css:2051 |
| .dash-row-b .dash-room-wrap |  | align-content | flex-start @ renderer/dashboard.css:941 → start @ renderer/dashboard.css:1849 | start @ renderer/dashboard.css:1849 |
| .trend-range__b |  | color | var(--text3) @ renderer/dashboard.css:962 → var(--text2) @ renderer/dashboard.css:2591 | var(--text2) @ renderer/dashboard.css:2591 |
| .trend-range__b:hover |  | color | var(--text2) @ renderer/dashboard.css:965 → var(--text) @ renderer/dashboard.css:2592 | var(--text) @ renderer/dashboard.css:2592 |
| .trend-range__b.is-on |  | box-shadow | none @ renderer/dashboard.css:966 → 0 1px 2px rgba(15, 23, 42, .10) @ renderer/dashboard.css:2601 | 0 1px 2px rgba(15, 23, 42, .10) @ renderer/dashboard.css:2601 |
| .seat-inline |  | align-items | baseline @ renderer/dashboard.css:972 → flex-start @ renderer/dashboard.css:1718 | flex-start @ renderer/dashboard.css:1718 |
| .seat-inline |  | gap | 10px @ renderer/dashboard.css:972 → 8px @ renderer/dashboard.css:1719 → 6px @ renderer/dashboard.css:2899 | 6px @ renderer/dashboard.css:2899 |
| .seat-inline__k |  | display | inline-flex @ renderer/dashboard.css:974 → flex @ renderer/dashboard.css:1728 | flex @ renderer/dashboard.css:1728 |
| .seat-inline__k |  | align-items | baseline @ renderer/dashboard.css:974 → center @ renderer/dashboard.css:1728 | center @ renderer/dashboard.css:1728 |
| .seat-inline__k |  | gap | 4px @ renderer/dashboard.css:974 → 0 @ renderer/dashboard.css:1728 | 0 @ renderer/dashboard.css:1728 |
| .seat-inline__k |  | border | 0 @ renderer/dashboard.css:975 → 1px solid var(--border) @ renderer/dashboard.css:1730 | 1px solid var(--border) @ renderer/dashboard.css:1730 |
| .seat-inline__k |  | background | none @ renderer/dashboard.css:975 → var(--bg3) @ renderer/dashboard.css:1730 | var(--bg3) @ renderer/dashboard.css:1730 |
| .seat-inline__k |  | padding | 2px 3px @ renderer/dashboard.css:975 → 3px 8px 4px @ renderer/dashboard.css:1729 → 3px 7px 4px @ renderer/dashboard.css:2900 | 3px 7px 4px @ renderer/dashboard.css:2900 |
| .seat-inline__k |  | border-radius | 6px @ renderer/dashboard.css:975 → 8px @ renderer/dashboard.css:1729 | 8px @ renderer/dashboard.css:1729 |
| .seat-inline__k b |  | font-size | 14px @ renderer/dashboard.css:980 → 17px @ renderer/dashboard.css:1735 → 15px @ renderer/dashboard.css:2902 | 15px @ renderer/dashboard.css:2902 |
| .seat-inline__k b |  | line-height | 1 @ renderer/dashboard.css:981 → 1.1 @ renderer/dashboard.css:1735 | 1.1 @ renderer/dashboard.css:1735 |
| .seat-inline__k span |  | font-size | 9.5px @ renderer/dashboard.css:985 → 10px @ renderer/dashboard.css:1734 → 9px @ renderer/dashboard.css:2901 | 9px @ renderer/dashboard.css:2901 |
| .seat-inline__k span |  | letter-spacing | .7px @ renderer/dashboard.css:986 → .2px @ renderer/dashboard.css:2901 | .2px @ renderer/dashboard.css:2901 |
| .seat-foot__acts |  | display | inline-flex @ renderer/dashboard.css:995 → flex @ renderer/dashboard.css:1517 | flex @ renderer/dashboard.css:1517 |
| .seat-foot__acts |  | gap | 5px @ renderer/dashboard.css:995 → 6px @ renderer/dashboard.css:1517 | 6px @ renderer/dashboard.css:1517 |
| .seat-foot__b |  | gap | 4px @ renderer/dashboard.css:997 → 5px @ renderer/dashboard.css:2089 | 5px @ renderer/dashboard.css:2089 |
| .seat-foot__b |  | height | 22px @ renderer/dashboard.css:998 → 24px @ renderer/dashboard.css:2090 | 24px @ renderer/dashboard.css:2090 |
| .seat-foot__b |  | padding | 0 8px @ renderer/dashboard.css:998 → 0 9px @ renderer/dashboard.css:2090 | 0 9px @ renderer/dashboard.css:2090 |
| .seat-foot__b |  | font-size | 10px @ renderer/dashboard.css:999 → 11px @ renderer/dashboard.css:2092 | 11px @ renderer/dashboard.css:2092 |
| .seat-foot__b |  | font-weight | 700 @ renderer/dashboard.css:999 → 600 @ renderer/dashboard.css:2092 | 600 @ renderer/dashboard.css:2092 |
| .seat-foot__b |  | border | 1px solid var(--border2) @ renderer/dashboard.css:1000 → 1px solid var(--border) @ renderer/dashboard.css:2091 | 1px solid var(--border) @ renderer/dashboard.css:2091 |
| .seat-foot__b |  | background | var(--card) @ renderer/dashboard.css:1000 → var(--bg2) @ renderer/dashboard.css:2091 | var(--bg2) @ renderer/dashboard.css:2091 |
| .seat-foot__b |  | color | var(--text3) @ renderer/dashboard.css:1000 → var(--text2) @ renderer/dashboard.css:2092 | var(--text2) @ renderer/dashboard.css:2092 |
| .seat-foot__b |  | transition | color .14s ease, border-color .14s ease, background .14s ease @ renderer/dashboard.css:1001 → background .12s ease, color .12s ease, border-color .12s ease @ renderer/dashboard.css:2094 | background .12s ease, color .12s ease, border-color .12s ease @ renderer/dashboard.css:2094 |
| .seat-foot__b svg |  | width | 11px @ renderer/dashboard.css:1003 → 12px @ renderer/dashboard.css:2096 | 12px @ renderer/dashboard.css:2096 |
| .seat-foot__b svg |  | height | 11px @ renderer/dashboard.css:1003 → 12px @ renderer/dashboard.css:2096 | 12px @ renderer/dashboard.css:2096 |
| .seat-foot__b:hover |  | background | var(--dash-sunk) @ renderer/dashboard.css:1004 → var(--bg3) @ renderer/dashboard.css:2097 | var(--bg3) @ renderer/dashboard.css:2097 |
| .seat-foot__b:focus-visible |  | outline-offset | 1px @ renderer/dashboard.css:1005 → 2px @ renderer/dashboard.css:2098 | 2px @ renderer/dashboard.css:2098 |
| #trend-chart-wrap | @media (max-height: 640px) | min-height | 76px @ renderer/dashboard.css:1106 → 88px @ renderer/dashboard.css:2270 | 88px @ renderer/dashboard.css:2270 |
| .dash-kpi-grid > .dsh-card | @media (max-height: 640px) | padding | 8px 10px @ renderer/dashboard.css:1122 → 6px 10px @ renderer/dashboard.css:2285 | 6px 10px @ renderer/dashboard.css:2285 |
| .dash-row-b, .dash-row-c, .dash-kpi-grid | @media (max-height: 640px) | margin-bottom | 4px @ renderer/dashboard.css:1126 → 2px @ renderer/dashboard.css:2284 | 2px @ renderer/dashboard.css:2284 |
| .dl-coll__body |  | grid-template-columns | 150px minmax(0, 1fr) @ renderer/dashboard.css:1234 → clamp(180px, 40%, 225px) minmax(0, 1fr) @ renderer/dashboard.css:1411 | clamp(180px, 40%, 225px) minmax(0, 1fr) @ renderer/dashboard.css:1411 |
| .dl-coll__body |  | gap | 18px @ renderer/dashboard.css:1235 → 12px @ renderer/dashboard.css:1412 | 12px @ renderer/dashboard.css:1412 |
| .dnut__seg |  | transition | stroke-width .14s ease, opacity .14s ease @ renderer/dashboard.css:1253 → stroke-dasharray .7s cubic-bezier(.22, 1, .36, 1), transform .16s ease, opacity .14s ease @ renderer/dashboard.css:2712 | stroke-dasharray .7s cubic-bezier(.22, 1, .36, 1), transform .16s ease, opacity .14s ease @ renderer/dashboard.css:2712 |
| .dnut .dnut__seg:hover |  | stroke-width | 30 @ renderer/dashboard.css:1256 → 22 @ renderer/dashboard.css:2719 | 22 @ renderer/dashboard.css:2719 |
| .dash-kpi--split .dash-kpi__value |  | margin-bottom | 7px @ renderer/dashboard.css:1531 → 2px @ renderer/dashboard.css:1981 | 2px @ renderer/dashboard.css:1981 |
| .seat-inline__k b | @media (max-height:665px) | font-size | 13px @ renderer/dashboard.css:1655 → 15px @ renderer/dashboard.css:1783 | 15px @ renderer/dashboard.css:1783 |
| #trend-chart-wrap | @media (max-height:665px) | min-height | 118px @ renderer/dashboard.css:1780 → 112px @ renderer/dashboard.css:2146 | 112px @ renderer/dashboard.css:2146 |
| .dash-row-b .seat-foot |  | margin-top | 5px @ renderer/dashboard.css:1797 → 4px @ renderer/dashboard.css:1894 → 6px @ renderer/dashboard.css:2029 → 5px @ renderer/dashboard.css:2087 | 5px @ renderer/dashboard.css:2087 |
| .dash-row-b .seat-foot |  | gap | 8px @ renderer/dashboard.css:1797 → 6px @ renderer/dashboard.css:2087 | 6px @ renderer/dashboard.css:2087 |
| .dash-row-b .dash-room |  | padding | 3px 7px @ renderer/dashboard.css:1809 → 6px 9px @ renderer/dashboard.css:1853 → 4px 8px @ renderer/dashboard.css:1891 | 4px 8px @ renderer/dashboard.css:1891 |
| .dash-row-b .dash-room |  | min-width | 40px @ renderer/dashboard.css:1809 → 0 @ renderer/dashboard.css:1853 | 0 @ renderer/dashboard.css:1853 |
| .dash-row-b .dash-room .n |  | font-size | 11.5px @ renderer/dashboard.css:1810 → 13px @ renderer/dashboard.css:1860 | 13px @ renderer/dashboard.css:1860 |
| .dash-row-b .dash-room .c |  | font-size | 8.5px @ renderer/dashboard.css:1811 → 10.5px @ renderer/dashboard.css:1863 | 10.5px @ renderer/dashboard.css:1863 |
| .dash-row-b .dash-room-wrap |  | gap | 4px @ renderer/dashboard.css:1812 → 6px @ renderer/dashboard.css:1848 → 5px @ renderer/dashboard.css:1892 | 5px @ renderer/dashboard.css:1892 |
| .dash-row-b .dash-room |  | text-align | left @ renderer/dashboard.css:1853 → center @ renderer/dashboard.css:2309 | center @ renderer/dashboard.css:2309 |
| .dash-row-b .dash-room .c |  | font-weight | 500 @ renderer/dashboard.css:1863 → 650 @ renderer/dashboard.css:2640 | 650 @ renderer/dashboard.css:2640 |
| .dash-row-b .seat-inline |  | margin-top | -2px @ renderer/dashboard.css:1881 → -4px @ renderer/dashboard.css:2082 | -4px @ renderer/dashboard.css:2082 |
| .dash-row-b .seat-foot |  | justify-content | flex-start @ renderer/dashboard.css:1882 → flex-end @ renderer/dashboard.css:2029 → flex-end @ renderer/dashboard.css:2087 | flex-end @ renderer/dashboard.css:2087 |
| .kbar |  | padding-top | 6px @ renderer/dashboard.css:1901 → 3px @ renderer/dashboard.css:2987 → 2px @ renderer/dashboard.css:3019 | 2px @ renderer/dashboard.css:3019 |
| .kbar__pct |  | font-weight | 700 @ renderer/dashboard.css:1903 → 650 @ renderer/dashboard.css:2235 | 650 @ renderer/dashboard.css:2235 |
| .kbar__pct |  | color | var(--kbar-fg) @ renderer/dashboard.css:1904 → var(--text3) @ renderer/dashboard.css:2235 | var(--text3) @ renderer/dashboard.css:2235 |
| .kbar__ends |  | display | flex @ renderer/dashboard.css:1918 → none @ renderer/dashboard.css:2986 | none @ renderer/dashboard.css:2986 |
| .dash-kpi-grid > .dsh-card |  | min-height | 145px @ renderer/dashboard.css:1938 → 0 @ renderer/dashboard.css:1965 | 0 @ renderer/dashboard.css:1965 |
| .dash-kpi-grid .dash-kpi__top |  | margin-bottom | 8px @ renderer/dashboard.css:1939 → 6px @ renderer/dashboard.css:1966 | 6px @ renderer/dashboard.css:1966 |
| .dash-kpi-grid .dash-kpi__value |  | margin-bottom | 4px @ renderer/dashboard.css:1940 → 2px @ renderer/dashboard.css:1967 | 2px @ renderer/dashboard.css:1967 |
| .dash-row-c .dl-need |  | padding | 3px 9px @ renderer/dashboard.css:1957 → 2px 9px @ renderer/dashboard.css:2053 | 2px 9px @ renderer/dashboard.css:2053 |
| .dash-kpi-grid > .dsh-card |  | padding | 12px 14px @ renderer/dashboard.css:1965 → 9px 12px 6px @ renderer/dashboard.css:2978 | 9px 12px 6px @ renderer/dashboard.css:2978 |
| .dash-kpi-grid .kbar |  | padding-top | 5px @ renderer/dashboard.css:1968 → 4px @ renderer/dashboard.css:2106 | 4px @ renderer/dashboard.css:2106 |
| .dash-row-b .seat-inline |  | gap | 14px @ renderer/dashboard.css:2082 → 6px @ renderer/dashboard.css:2665 | 6px @ renderer/dashboard.css:2665 |
| .dash-row-c .dash-sec .rt-right |  | max-height | 158px @ renderer/dashboard.css:2483 → 139px @ renderer/dashboard.css:3109 | 139px @ renderer/dashboard.css:3109 |
| .dash-row-c .dash-sec .rt-right | @media (max-height: 720px) | max-height | 146px @ renderer/dashboard.css:2484 → 120px @ renderer/dashboard.css:3110 | 120px @ renderer/dashboard.css:3110 |
| .dash-row-c .dash-sec .rt-row |  | margin-bottom | 4px @ renderer/dashboard.css:2502 → 2px @ renderer/dashboard.css:3111 | 2px @ renderer/dashboard.css:3111 |
| .dl-act |  | background | var(--card) @ renderer/dashboard.css:2763 → var(--dh-bg) @ renderer/dashboard.css:2871 | var(--dh-bg) @ renderer/dashboard.css:2871 |
| .dl-act:hover |  | border-color | var(--accent) @ renderer/dashboard.css:2766 → var(--dh) @ renderer/dashboard.css:2873 | var(--dh) @ renderer/dashboard.css:2873 |
| .dl-act:hover |  | color | var(--accent) @ renderer/dashboard.css:2766 → var(--text) @ renderer/dashboard.css:2873 | var(--text) @ renderer/dashboard.css:2873 |
| .dl-act:hover |  | background | var(--dash-sunk) @ renderer/dashboard.css:2766 → var(--dh-bg) @ renderer/dashboard.css:2873 | var(--dh-bg) @ renderer/dashboard.css:2873 |
| .dl-act__ic |  | color | var(--accent) @ renderer/dashboard.css:2767 → var(--dh) @ renderer/dashboard.css:2874 | var(--dh) @ renderer/dashboard.css:2874 |
| .dl-need |  | background | transparent @ renderer/dashboard.css:2778 → var(--dh-bg) @ renderer/dashboard.css:2858 | var(--dh-bg) @ renderer/dashboard.css:2858 |
| .dl-need:hover |  | background | var(--dash-sunk) @ renderer/dashboard.css:2782 → var(--dh-bg) @ renderer/dashboard.css:2861 | var(--dh-bg) @ renderer/dashboard.css:2861 |
| .dl-need__verb |  | color | var(--accent) @ renderer/dashboard.css:2797 → var(--dh) @ renderer/dashboard.css:2860 | var(--dh) @ renderer/dashboard.css:2860 |
| .dl-foot--tint |  | margin | 8px 10px 10px @ renderer/dashboard.css:2848 → 2px 10px 8px @ renderer/dashboard.css:2967 | 2px 10px 8px @ renderer/dashboard.css:2967 |
| .dl-foot--tint |  | padding | 6px 10px @ renderer/dashboard.css:2848 → 4px 9px @ renderer/dashboard.css:2967 | 4px 9px @ renderer/dashboard.css:2967 |
| .modal-overlay |  | align-items | flex-start @ renderer/style.css:1522 → center @ renderer/forms.css:58 | center @ renderer/forms.css:58 |
| .modal-overlay |  | padding | 16px @ renderer/style.css:1524 → 24px @ renderer/forms.css:59 | 24px @ renderer/forms.css:59 |
| .modal |  | max-height | 94vh @ renderer/style.css:1535 → 100% @ renderer/forms.css:69 | 100% @ renderer/forms.css:69 |
| .modal |  | margin | auto @ renderer/style.css:1539 → 0 @ renderer/forms.css:70 | 0 @ renderer/forms.css:70 |
| .modal-overlay |  | animation | fadeIn 0.15s ease @ renderer/style.css:1526 → hz-scrim-in .16s ease-out both @ renderer/forms.css:446 | hz-scrim-in .16s ease-out both @ renderer/forms.css:446 |
| .modal |  | animation | slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) @ renderer/style.css:1540 → hz-panel-in .22s cubic-bezier(.2, .7, .3, 1) both @ renderer/forms.css:447 | hz-panel-in .22s cubic-bezier(.2, .7, .3, 1) both @ renderer/forms.css:447 |
| .iss-table .lk-who__n, .iss-table .lk-who__s |  | max-width | 112px @ renderer/issues.css:106 → 100px @ renderer/issues.css:201 | 100px @ renderer/issues.css:201 |
| .iss-c-title |  | max-width | 340px @ renderer/issues.css:144 → none @ renderer/issues.css:181 | none @ renderer/issues.css:181 |
| .iss-c-title |  | width | 100% @ renderer/issues.css:181 → auto @ renderer/issues.css:198 | auto @ renderer/issues.css:198 |
| .iss-c-title |  | min-width | 340px @ renderer/issues.css:181 → 140px @ renderer/issues.css:198 | 140px @ renderer/issues.css:198 |
| #login-screen |  | z-index | 99999 @ renderer/style.css:2827 → 9000 @ renderer/login.css:31 | 9000 @ renderer/login.css:31 |
| #login-screen |  | overflow | hidden @ renderer/style.css:2832 → auto @ renderer/login.css:38 | auto @ renderer/login.css:38 |
| .pay-stat__val |  | font-size | 19px @ renderer/payments.css:50 → 22px @ renderer/payments.css:51 → 26px @ renderer/payments.css:52 | 26px @ renderer/payments.css:52 |
| .pay-stat__foot |  | align-items | flex-end @ renderer/payments.css:54 → center @ renderer/payments.css:1341 | center @ renderer/payments.css:1341 |
| .pay-stat__foot |  | flex-wrap | wrap @ renderer/payments.css:54 → nowrap @ renderer/payments.css:1341 | nowrap @ renderer/payments.css:1341 |
| .pay-tools |  | gap | 10px @ renderer/payments.css:66 → 8px @ renderer/payments.css:1573 | 8px @ renderer/payments.css:1573 |
| .pay-search |  | flex | 0 1 210px @ renderer/payments.css:72 → 0 1 158px @ renderer/payments.css:1574 | 0 1 158px @ renderer/payments.css:1574 |
| .pay-search |  | min-width | 150px @ renderer/payments.css:72 → 140px @ renderer/payments.css:1574 | 140px @ renderer/payments.css:1574 |
| .pay-search |  | max-width | 240px @ renderer/payments.css:72 → 200px @ renderer/payments.css:1574 | 200px @ renderer/payments.css:1574 |
| .pay-select |  | min-width | 132px @ renderer/payments.css:83 → 112px @ renderer/payments.css:1578 | 112px @ renderer/payments.css:1578 |
| .pay-meta |  | margin | 13px 0 4px @ renderer/payments.css:116 → 12px 0 4px @ renderer/payments.css:1319 | 12px 0 4px @ renderer/payments.css:1319 |
| .pay-money |  | font-size | 12.5px @ renderer/payments.css:174 → 12px @ renderer/payments.css:956 | 12px @ renderer/payments.css:956 |
| .pay-acts |  | gap | 5px @ renderer/payments.css:232 → 4px @ renderer/payments.css:1143 | 4px @ renderer/payments.css:1143 |
| .pay-foot__info |  | flex | 1 @ renderer/payments.css:253 → 1 1 auto @ renderer/payments.css:1353 | 1 1 auto @ renderer/payments.css:1353 |
| .pay-foot__info |  | text-align | center @ renderer/payments.css:253 → left @ renderer/payments.css:1353 | left @ renderer/payments.css:1353 |
| .ws__n |  | font-size | 11px @ renderer/payments.css:424 → 10.5px @ renderer/payments.css:1517 | 10.5px @ renderer/payments.css:1517 |
| .ws__n |  | font-weight | 700 @ renderer/payments.css:424 → 800 @ renderer/payments.css:1518 | 800 @ renderer/payments.css:1518 |
| .ws__n |  | color | var(--text3) @ renderer/payments.css:424 → var(--text-on-accent) @ renderer/payments.css:1516 | var(--text-on-accent) @ renderer/payments.css:1516 |
| .ws__n |  | padding-top | 2px @ renderer/payments.css:426 → 0 @ renderer/payments.css:1519 | 0 @ renderer/payments.css:1519 |
| .ws__p b |  | font-size | 11.5px @ renderer/payments.css:429 → 12.5px @ renderer/payments.css:1523 | 12.5px @ renderer/payments.css:1523 |
| .ws__p b |  | text-transform | uppercase @ renderer/payments.css:430 → none @ renderer/payments.css:1524 | none @ renderer/payments.css:1524 |
| .ws__p b |  | letter-spacing | .4px @ renderer/payments.css:430 → 0 @ renderer/payments.css:1525 | 0 @ renderer/payments.css:1525 |
| .pef-top |  | align-items | start @ renderer/payments.css:1163 → stretch @ renderer/payments.css:1385 | stretch @ renderer/payments.css:1385 |
| .pef-sec |  | margin-bottom | 14px @ renderer/payments.css:1168 → 10px @ renderer/payments.css:1420 | 10px @ renderer/payments.css:1420 |
| .pef-sec__n |  | font-size | 11px @ renderer/payments.css:1172 → 13px @ renderer/payments.css:1423 | 13px @ renderer/payments.css:1423 |
| .pef-sec__n |  | font-weight | 800 @ renderer/payments.css:1172 → 700 @ renderer/payments.css:1423 | 700 @ renderer/payments.css:1423 |
| .pef-sec__n |  | letter-spacing | .6px @ renderer/payments.css:1172 → 0 @ renderer/payments.css:1423 | 0 @ renderer/payments.css:1423 |
| .pef-sec__n |  | text-transform | uppercase @ renderer/payments.css:1172 → none @ renderer/payments.css:1424 | none @ renderer/payments.css:1424 |
| .pef-sec__n |  | color | var(--accent-strong) @ renderer/payments.css:1173 → var(--text) @ renderer/payments.css:1424 | var(--text) @ renderer/payments.css:1424 |
| .pef-sec__n |  | align-items | baseline @ renderer/payments.css:1173 → center @ renderer/payments.css:1422 | center @ renderer/payments.css:1422 |
| .pef-sec__n |  | gap | 6px @ renderer/payments.css:1173 → 8px @ renderer/payments.css:1422 | 8px @ renderer/payments.css:1422 |
| .pef-sec__hint |  | margin | 2px 0 10px @ renderer/payments.css:1175 → 3px 0 9px 30px @ renderer/payments.css:1427 | 3px 0 9px 30px @ renderer/payments.css:1427 |
| .pef-sum__hd |  | font-size | 12px @ renderer/payments.css:1182 → 12.5px @ renderer/payments.css:1501 | 12.5px @ renderer/payments.css:1501 |
| .pef-notes-count |  | float | right @ renderer/payments.css:1210 → none @ renderer/payments.css:1497 | none @ renderer/payments.css:1497 |
| .extra-charge-row .rm-btn |  | width | 30px @ renderer/style.css:2240 → 34px @ renderer/payments.css:1486 | 34px @ renderer/payments.css:1486 |
| .extra-charge-row .rm-btn |  | height | 30px @ renderer/style.css:2240 → 34px @ renderer/payments.css:1486 | 34px @ renderer/payments.css:1486 |
| .extra-charge-row .rm-btn |  | display | flex @ renderer/style.css:2247 → inline-flex @ renderer/payments.css:1487 | inline-flex @ renderer/payments.css:1487 |
| .extra-charge-row .rm-btn |  | border | 1px solid rgba(248, 113, 113, 0.3) @ renderer/style.css:2244 → 1px solid var(--danger-border, var(--border)) @ renderer/payments.css:1488 | 1px solid var(--danger-border, var(--border)) @ renderer/payments.css:1488 |
| .extra-charge-row .rm-btn |  | border-radius | 6px @ renderer/style.css:2241 → 8px @ renderer/payments.css:1489 | 8px @ renderer/payments.css:1489 |
| .extra-charge-row .rm-btn |  | background | var(--red-dim) @ renderer/style.css:2243 → var(--ant-danger-bg, var(--bg4)) @ renderer/payments.css:1490 | var(--ant-danger-bg, var(--bg4)) @ renderer/payments.css:1490 |
| .extra-charge-row .rm-btn:hover |  | background | rgba(248, 113, 113, 0.25) @ renderer/style.css:2254 → var(--red) @ renderer/payments.css:1494 | var(--red) @ renderer/payments.css:1494 |
| .sb-month-picker__header |  | padding | 6px 8px @ renderer/style.css:863 → 2px 8px 4px @ renderer/rail-compact.css:50 | 2px 8px 4px @ renderer/rail-compact.css:50 |
| .sb-month-picker__header |  | gap | 2px @ renderer/style.css:862 → 1px @ renderer/rail-compact.css:50 | 1px @ renderer/rail-compact.css:50 |
| .sb-month-picker__arrow |  | width | 28px @ renderer/style.css:866 → 24px @ renderer/rail-compact.css:51 | 24px @ renderer/rail-compact.css:51 |
| .sb-month-picker__arrow |  | height | 28px @ renderer/style.css:867 → 24px @ renderer/rail-compact.css:51 | 24px @ renderer/rail-compact.css:51 |
| .sb-month-picker__display |  | padding | 5px 10px @ renderer/style.css:889 → 0 4px @ renderer/rail-compact.css:52 | 0 4px @ renderer/rail-compact.css:52 |
| .sb-month-picker__label |  | font-size | 11px @ renderer/style.css:905 → 12px @ renderer/rail-compact.css:53 | 12px @ renderer/rail-compact.css:53 |
| .rpt-stat__val |  | font-size | 15.5px @ renderer/reports.css:81 → 17px @ renderer/reports.css:85 → 19px @ renderer/reports.css:86 → 21px @ renderer/reports.css:87 | 21px @ renderer/reports.css:87 |
| .rpt-hi .mov__strip |  | grid-template-columns | repeat(2, 1fr) @ renderer/reports.css:569 → repeat(4, 1fr) @ renderer/reports.css:584 → 1fr @ renderer/reports.css:585 | 1fr @ renderer/reports.css:585 |
| .set-head__end |  | gap | 10px @ renderer/settings.css:77 → 9px @ renderer/settings.css:832 | 9px @ renderer/settings.css:832 |
| .stu-stat |  | padding | 13px 15px @ renderer/students.css:22 → 11px 13px @ renderer/students.css:1857 | 11px 13px @ renderer/students.css:1857 |
| .stu-stat__label |  | font-size | 10.5px @ renderer/students.css:38 → 10px @ renderer/students.css:1046 | 10px @ renderer/students.css:1046 |
| .stu-stat__label |  | font-weight | 600 @ renderer/students.css:38 → 700 @ renderer/students.css:1046 | 700 @ renderer/students.css:1046 |
| .stu-stat__val |  | font-size | 18px @ renderer/students.css:43 → 19px @ renderer/students.css:49 → 21px @ renderer/students.css:50 → 28px @ renderer/students.css:1045 | 28px @ renderer/students.css:1045 |
| .stu-search |  | flex | 1 1 220px @ renderer/students.css:68 → 1 1 150px @ renderer/students.css:1108 | 1 1 150px @ renderer/students.css:1108 |
| .stu-search |  | min-width | 190px @ renderer/students.css:68 → 132px @ renderer/students.css:1108 | 132px @ renderer/students.css:1108 |
| .stu-search:focus-within |  | box-shadow | 0 0 0 3px var(--accent-dim) @ renderer/students.css:73 → 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent) @ renderer/students.css:1119 | 0 0 0 3px color-mix(in srgb, var(--accent) 16%, transparent) @ renderer/students.css:1119 |
| .stu-search input |  | font-size | 12.5px @ renderer/students.css:75 → 11.5px @ renderer/students.css:1109 | 11.5px @ renderer/students.css:1109 |
| .stu-table thead th |  | white-space | nowrap @ renderer/students.css:121 → normal @ renderer/students.css:1016 | normal @ renderer/students.css:1016 |
| .stu-table thead th |  | font-size | 10px @ renderer/students.css:122 → 9.5px @ renderer/students.css:1016 | 9.5px @ renderer/students.css:1016 |
| .stu-table thead th |  | letter-spacing | .7px @ renderer/students.css:122 → .03em @ renderer/students.css:1016 | .03em @ renderer/students.css:1016 |
| .stu-table tbody td |  | font-size | 13.5px @ renderer/students.css:130 → 12px @ renderer/students.css:938 | 12px @ renderer/students.css:938 |
| .stu-who__name |  | font-size | 14.5px @ renderer/students.css:147 → 12.5px @ renderer/students.css:1036 | 12.5px @ renderer/students.css:1036 |
| .stu-who__sub |  | font-size | 12px @ renderer/students.css:148 → 10.5px @ renderer/students.css:1037 | 10.5px @ renderer/students.css:1037 |
| .stu-contact |  | font-size | 13px @ renderer/students.css:160 → 11.5px @ renderer/students.css:1040 | 11.5px @ renderer/students.css:1040 |
| .stu-contact__em |  | font-size | 12.5px @ renderer/students.css:161 → 10.5px @ renderer/students.css:1041 | 10.5px @ renderer/students.css:1041 |
| .stu-pill |  | font-size | 11px @ renderer/students.css:179 → 10px @ renderer/students.css:1043 | 10px @ renderer/students.css:1043 |
| .stu-pill |  | font-weight | 700 @ renderer/students.css:179 → 600 @ renderer/students.css:1043 | 600 @ renderer/students.css:1043 |
| .stu-acts |  | gap | 5px @ renderer/students.css:182 → 3px @ renderer/students.css:990 | 3px @ renderer/students.css:990 |
| .stu-act |  | width | 30px @ renderer/students.css:184 → 24px @ renderer/students.css:991 | 24px @ renderer/students.css:991 |
| .stu-act |  | height | 30px @ renderer/students.css:184 → 24px @ renderer/students.css:991 | 24px @ renderer/students.css:991 |
| .stu-act |  | border-radius | 9px @ renderer/students.css:184 → 6px @ renderer/students.css:991 | 6px @ renderer/students.css:991 |
| .sf-sec__h |  | margin-bottom | 15px @ renderer/students.css:272 → 12px @ renderer/students.css:1832 | 12px @ renderer/students.css:1832 |
| .sf-sec__h |  | font-size | 11px @ renderer/students.css:273 → 13px @ renderer/students.css:1827 | 13px @ renderer/students.css:1827 |
| .sf-sec__h |  | text-transform | uppercase @ renderer/students.css:273 → none @ renderer/students.css:1829 | none @ renderer/students.css:1829 |
| .sf-sec__h |  | letter-spacing | 1.1px @ renderer/students.css:273 → 0 @ renderer/students.css:1830 | 0 @ renderer/students.css:1830 |
| .sf-sec__h |  | color | var(--accent-strong) @ renderer/students.css:274 → var(--text) @ renderer/students.css:1831 | var(--text) @ renderer/students.css:1831 |
| .stu-charge |  | font-weight | 800 @ renderer/students.css:542 → 700 @ renderer/students.css:1042 | 700 @ renderer/students.css:1042 |
| .stu-nat |  | display | inline-block @ renderer/students.css:552 → inline-block @ renderer/students.css:1167 → inline @ renderer/students.css:1177 | inline @ renderer/students.css:1177 |
| .stu-nat |  | padding | 3px 9px @ renderer/students.css:552 → 0 @ renderer/students.css:1177 | 0 @ renderer/students.css:1177 |
| .stu-nat |  | border-radius | 8px @ renderer/students.css:552 → 0 @ renderer/students.css:1177 | 0 @ renderer/students.css:1177 |
| .stu-nat |  | background | var(--bg3) @ renderer/students.css:553 → none @ renderer/students.css:1177 | none @ renderer/students.css:1177 |
| .stu-nat |  | border | 1px solid var(--border) @ renderer/students.css:553 → 0 @ renderer/students.css:1177 | 0 @ renderer/students.css:1177 |
| .stu-nat |  | font-size | 11.5px @ renderer/students.css:554 → 10.5px @ renderer/students.css:1178 | 10.5px @ renderer/students.css:1178 |
| .stu-nat |  | font-weight | 600 @ renderer/students.css:554 → 500 @ renderer/students.css:1178 | 500 @ renderer/students.css:1178 |
| .asf-n |  | color | var(--text3) @ renderer/students.css:673 → var(--accent-strong) @ renderer/students.css:1843 | var(--accent-strong) @ renderer/students.css:1843 |
| body.light-theme #main |  | background | radial-gradient(circle at 80% 0%, rgba(37, 99, 235, 0.045), transparent 32%), var(--bg) @ renderer/style.css:305 → var(--bg) @ renderer/style.css:3937 | var(--bg) @ renderer/style.css:3937 |
| body.light-theme ::-webkit-scrollbar-track |  | background | var(--bg2) @ renderer/style.css:312 → #f0ede9 @ renderer/style.css:4224 | #f0ede9 @ renderer/style.css:4224 |
| body.light-theme ::-webkit-scrollbar-thumb |  | background | var(--border2) @ renderer/style.css:313 → #d7c3b5 @ renderer/style.css:4225 | #d7c3b5 @ renderer/style.css:4225 |
| body.light-theme .form-control |  | border-color | var(--border) @ renderer/style.css:439 → #d7c3b5 @ renderer/style.css:4547 | #d7c3b5 @ renderer/style.css:4547 |
| body.light-theme .form-control |  | color | var(--text) @ renderer/style.css:440 → #1c1b1b @ renderer/style.css:4548 | #1c1b1b @ renderer/style.css:4548 |
| body.light-theme .form-control:focus |  | box-shadow | 0 0 0 3px var(--accent-dim) @ renderer/style.css:444 → 0 0 0 3px rgba(59,130,246,0.10) @ renderer/style.css:4552 | 0 0 0 3px rgba(59,130,246,0.10) @ renderer/style.css:4552 |
| body.light-theme .settings-tab.active |  | background | rgba(0, 0, 0, 0.06) @ renderer/style.css:447 → rgba(0,0,0,0.06) @ renderer/style.css:4699 | rgba(0,0,0,0.06) @ renderer/style.css:4699 |
| ::-webkit-scrollbar |  | width | 5px @ renderer/style.css:595 → 4px @ renderer/style.css:4071 → 5px @ renderer/style.css:4219 | 5px @ renderer/style.css:4219 |
| ::-webkit-scrollbar |  | height | 5px @ renderer/style.css:595 → 4px @ renderer/style.css:4071 → 5px @ renderer/style.css:4219 | 5px @ renderer/style.css:4219 |
| ::-webkit-scrollbar-track |  | background | var(--bg2) @ renderer/style.css:596 → #0e0e0e @ renderer/style.css:4220 | #0e0e0e @ renderer/style.css:4220 |
| ::-webkit-scrollbar-thumb |  | background | var(--border2) @ renderer/style.css:598 → var(--border2) @ renderer/style.css:4074 → #353534 @ renderer/style.css:4221 | #353534 @ renderer/style.css:4221 |
| #sidebar |  | background | var(--sidebar-bg) @ renderer/style.css:613 → var(--bg) @ renderer/style.css:4235 | var(--bg) @ renderer/style.css:4235 |
| #sidebar |  | border-right | 1px solid var(--border) @ renderer/style.css:614 → var(--hairline) @ renderer/style.css:4236 | var(--hairline) @ renderer/style.css:4236 |
| #sidebar |  | box-shadow | 1px 0 0 var(--border) @ renderer/style.css:619 → 1px 0 0 #52443a @ renderer/style.css:4237 | 1px 0 0 #52443a @ renderer/style.css:4237 |
| #header |  | background | rgba(15, 15, 15, 0.98) @ renderer/style.css:634 → rgba(15,15,15,0.98) @ renderer/style.css:4305 | rgba(15,15,15,0.98) @ renderer/style.css:4305 |
| #header |  | border-bottom | 1px solid var(--border) @ renderer/style.css:635 → var(--hairline) @ renderer/style.css:4306 | var(--hairline) @ renderer/style.css:4306 |
| #header |  | box-shadow | 0 1px 0 rgba(0, 0, 0, 0.1) @ renderer/style.css:641 → 0 1px 0 rgba(0,0,0,0.08) @ renderer/style.css:4307 | 0 1px 0 rgba(0,0,0,0.08) @ renderer/style.css:4307 |
| #content |  | padding | 18px 20px @ renderer/style.css:646 → 20px 24px @ renderer/style.css:4321 | 20px 24px @ renderer/style.css:4321 |
| .sb-logo |  | background | linear-gradient(160deg, rgba(0, 0, 0, 0.06) 0%, transparent 60%) @ renderer/style.css:657 → transparent @ renderer/style.css:4247 | transparent @ renderer/style.css:4247 |
| .nav-item |  | padding | 10px 12px @ renderer/style.css:994 → 9px 14px @ renderer/style.css:4262 | 9px 14px @ renderer/style.css:4262 |
| .nav-item |  | border-radius | var(--radius-sm) @ renderer/style.css:995 → var(--r-full) @ renderer/style.css:4258 | var(--r-full) @ renderer/style.css:4258 |
| .nav-item |  | transition | var(--transition) @ renderer/style.css:1000 → all 0.2s cubic-bezier(0.4, 0, 0.2, 1) @ renderer/style.css:4264 | all 0.2s cubic-bezier(0.4, 0, 0.2, 1) @ renderer/style.css:4264 |
| .nav-item:hover |  | background | var(--bg3) @ renderer/style.css:1019 → rgba(56, 189, 248, 0.06) @ renderer/style.css:4270 | rgba(56, 189, 248, 0.06) @ renderer/style.css:4270 |
| .nav-item:hover |  | border-color | var(--border) @ renderer/style.css:1021 → transparent @ renderer/style.css:4272 | transparent @ renderer/style.css:4272 |
| .nav-item.active |  | border-color | rgba(56, 189, 248, 0.15) @ renderer/style.css:1033 → transparent @ renderer/style.css:4279 | transparent @ renderer/style.css:4279 |
| .nav-item.active::before |  | top | 20% @ renderer/style.css:1040 → 0 @ renderer/style.css:4287 | 0 @ renderer/style.css:4287 |
| .nav-item.active::before |  | bottom | 20% @ renderer/style.css:1040 → 0 @ renderer/style.css:4287 | 0 @ renderer/style.css:4287 |
| .nav-item.active::before |  | border-radius | 0 3px 3px 0 @ renderer/style.css:1042 → 0 2px 2px 0 @ renderer/style.css:4289 | 0 2px 2px 0 @ renderer/style.css:4289 |
| .card |  | background | var(--card) @ renderer/style.css:1208 → var(--bg2) @ renderer/style.css:4328 | var(--bg2) @ renderer/style.css:4328 |
| .card |  | border | 1px solid var(--border) @ renderer/style.css:1209 → var(--hairline) @ renderer/style.css:4329 | var(--hairline) @ renderer/style.css:4329 |
| .card |  | border-radius | var(--radius) @ renderer/style.css:1210 → var(--r-xl) @ renderer/style.css:4330 | var(--r-xl) @ renderer/style.css:4330 |
| .card:hover |  | border-color | var(--border2) @ renderer/style.css:1216 → rgba(0,0,0,0.1) @ renderer/style.css:4336 | rgba(0,0,0,0.1) @ renderer/style.css:4336 |
| .card:hover |  | box-shadow | var(--shadow-indigo-sm) @ renderer/style.css:1217 → var(--s-elev-2) @ renderer/style.css:4337 | var(--s-elev-2) @ renderer/style.css:4337 |
| .stat-card |  | background | var(--card) @ renderer/style.css:1253 → var(--surface) @ renderer/style.css:4348 | var(--surface) @ renderer/style.css:4348 |
| .stat-card |  | border | 1px solid var(--border) @ renderer/style.css:1254 → var(--hairline) @ renderer/style.css:4349 | var(--hairline) @ renderer/style.css:4349 |
| .stat-card |  | border-radius | var(--radius) @ renderer/style.css:1255 → var(--radius-card) @ renderer/style.css:4350 | var(--radius-card) @ renderer/style.css:4350 |
| .stat-card |  | padding | 14px 16px @ renderer/style.css:1256 → 20px @ renderer/style.css:4351 | 20px @ renderer/style.css:4351 |
| .stat-card |  | transition | var(--transition-bounce) @ renderer/style.css:1257 → background 0.15s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease @ renderer/style.css:4353 | background 0.15s ease, border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease @ renderer/style.css:4353 |
| .stat-card:hover |  | transform | translateY(-2px) @ renderer/style.css:1264 → translateY(-3px) @ renderer/style.css:4382 | translateY(-3px) @ renderer/style.css:4382 |
| .stat-card:hover |  | box-shadow | var(--shadow) @ renderer/style.css:1265 → var(--s-elev-3) @ renderer/style.css:4383 | var(--s-elev-3) @ renderer/style.css:4383 |
| .stat-icon |  | width | 34px @ renderer/style.css:1284 → 36px @ renderer/style.css:4398 | 36px @ renderer/style.css:4398 |
| .stat-icon |  | height | 34px @ renderer/style.css:1284 → 36px @ renderer/style.css:4398 | 36px @ renderer/style.css:4398 |
| .stat-icon |  | border-radius | 9px @ renderer/style.css:1285 → 10px @ renderer/style.css:4399 | 10px @ renderer/style.css:4399 |
| .stat-icon |  | margin-bottom | 10px @ renderer/style.css:1289 → 12px @ renderer/style.css:4403 | 12px @ renderer/style.css:4403 |
| .stat-icon |  | font-size | 16px @ renderer/style.css:1290 → 18px @ renderer/style.css:4404 | 18px @ renderer/style.css:4404 |
| .stat-icon |  | transition | var(--transition) @ renderer/style.css:1291 → transform 0.2s ease @ renderer/style.css:4405 | transform 0.2s ease @ renderer/style.css:4405 |
| .stat-card:hover .stat-icon |  | transform | scale(1.1) @ renderer/style.css:1294 → scale(1.08) @ renderer/style.css:4408 | scale(1.08) @ renderer/style.css:4408 |
| .stat-card.gold .stat-icon |  | background | var(--accent-dim) @ renderer/style.css:1296 → rgba(96,165,250,0.10) @ renderer/style.css:4410 | rgba(96,165,250,0.10) @ renderer/style.css:4410 |
| .stat-card.green .stat-icon |  | background | var(--green-dim) @ renderer/style.css:1297 → rgba(69,223,164,0.10) @ renderer/style.css:4411 | rgba(69,223,164,0.10) @ renderer/style.css:4411 |
| .stat-card.red .stat-icon |  | background | var(--red-dim) @ renderer/style.css:1298 → rgba(255,180,171,0.12) @ renderer/style.css:4412 | rgba(255,180,171,0.12) @ renderer/style.css:4412 |
| .stat-card.blue .stat-icon |  | background | var(--accent-dim) @ renderer/style.css:1299 → rgba(96,165,250,0.10) @ renderer/style.css:4413 | rgba(96,165,250,0.10) @ renderer/style.css:4413 |
| .stat-card.teal .stat-icon |  | background | var(--teal-dim) @ renderer/style.css:1300 → rgba(68,226,205,0.10) @ renderer/style.css:4414 | rgba(68,226,205,0.10) @ renderer/style.css:4414 |
| .stat-card.purple .stat-icon |  | background | var(--purple-dim) @ renderer/style.css:1301 → rgba(192,132,252,0.10) @ renderer/style.css:4415 | rgba(192,132,252,0.10) @ renderer/style.css:4415 |
| .stat-label |  | letter-spacing | 1px @ renderer/style.css:1307 → 0.08em @ renderer/style.css:4422 | 0.08em @ renderer/style.css:4422 |
| .stat-value |  | font-size | 22px @ renderer/style.css:1313 → var(--fs-display) @ renderer/style.css:4430 | var(--fs-display) @ renderer/style.css:4430 |
| .stat-value |  | font-weight | 800 @ renderer/style.css:1314 → var(--fw-display) @ renderer/style.css:4431 | var(--fw-display) @ renderer/style.css:4431 |
| .table-wrap |  | border-radius | var(--radius) @ renderer/style.css:1346 → var(--r-xl) @ renderer/style.css:4467 | var(--r-xl) @ renderer/style.css:4467 |
| .table-wrap |  | border | 1px solid var(--border) @ renderer/style.css:1347 → var(--hairline) @ renderer/style.css:4466 | var(--hairline) @ renderer/style.css:4466 |
| th |  | font-weight | 700 @ renderer/style.css:1356 → 600 @ renderer/style.css:4475 | 600 @ renderer/style.css:4475 |
| th |  | letter-spacing | 1px @ renderer/style.css:1358 → 0.08em @ renderer/style.css:4477 | 0.08em @ renderer/style.css:4477 |
| th |  | border-bottom | 1px solid var(--border2) @ renderer/style.css:1362 → var(--hairline) @ renderer/style.css:4481 | var(--hairline) @ renderer/style.css:4481 |
| td |  | border-bottom | 1px solid var(--border) @ renderer/style.css:1367 → var(--hairline) @ renderer/style.css:4486 | var(--hairline) @ renderer/style.css:4486 |
| tbody tr:hover td |  | background | rgba(0, 0, 0, 0.04) @ renderer/style.css:1380 → rgba(96,165,250,0.04) @ renderer/style.css:4493 | rgba(96,165,250,0.04) @ renderer/style.css:4493 |
| .avatar |  | border-radius | 10px @ renderer/style.css:1393 → var(--r-md) @ renderer/style.css:4763 | var(--r-md) @ renderer/style.css:4763 |
| .badge |  | padding | 3px 9px @ renderer/style.css:1411 → 3px 10px @ renderer/style.css:4505 | 3px 10px @ renderer/style.css:4505 |
| .badge |  | border-radius | 20px @ renderer/style.css:1412 → var(--r-full) @ renderer/style.css:4506 | var(--r-full) @ renderer/style.css:4506 |
| .badge |  | letter-spacing | 0.3px @ renderer/style.css:1415 → 0.02em @ renderer/style.css:4509 | 0.02em @ renderer/style.css:4509 |
| .badge-green |  | background | var(--green-dim) @ renderer/style.css:1419 → rgba(69,223,164,0.10) @ renderer/style.css:4513 | rgba(69,223,164,0.10) @ renderer/style.css:4513 |
| .badge-green |  | border | 1px solid rgba(52,211,153,0.25) @ renderer/style.css:1419 → 1px solid rgba(69,223,164,0.25) @ renderer/style.css:4513 | 1px solid rgba(69,223,164,0.25) @ renderer/style.css:4513 |
| .badge-red |  | background | var(--red-dim) @ renderer/style.css:1420 → rgba(255,180,171,0.12) @ renderer/style.css:4514 | rgba(255,180,171,0.12) @ renderer/style.css:4514 |
| .badge-red |  | border | 1px solid rgba(248,113,113,0.25) @ renderer/style.css:1420 → 1px solid rgba(255,180,171,0.25) @ renderer/style.css:4514 | 1px solid rgba(255,180,171,0.25) @ renderer/style.css:4514 |
| .badge-gold |  | background | var(--accent-dim) @ renderer/style.css:1421 → rgba(96,165,250,0.10) @ renderer/style.css:4515 | rgba(96,165,250,0.10) @ renderer/style.css:4515 |
| .badge-gold |  | border | 1px solid rgba(0,0,0,0.15) @ renderer/style.css:1421 → 1px solid rgba(96,165,250,0.25) @ renderer/style.css:4515 | 1px solid rgba(96,165,250,0.25) @ renderer/style.css:4515 |
| .badge-gold |  | color | var(--accent-strong) @ renderer/style.css:1421 → var(--accent) @ renderer/style.css:4515 | var(--accent) @ renderer/style.css:4515 |
| .badge-blue |  | background | var(--accent-dim) @ renderer/style.css:1422 → rgba(96,165,250,0.08) @ renderer/style.css:4516 | rgba(96,165,250,0.08) @ renderer/style.css:4516 |
| .badge-blue |  | border | 1px solid rgba(0,0,0,0.15) @ renderer/style.css:1422 → 1px solid rgba(96,165,250,0.20) @ renderer/style.css:4516 | 1px solid rgba(96,165,250,0.20) @ renderer/style.css:4516 |
| .badge-teal |  | background | var(--teal-dim) @ renderer/style.css:1423 → rgba(68,226,205,0.10) @ renderer/style.css:4517 | rgba(68,226,205,0.10) @ renderer/style.css:4517 |
| .badge-teal |  | border | 1px solid rgba(45,212,191,0.25) @ renderer/style.css:1423 → 1px solid rgba(68,226,205,0.25) @ renderer/style.css:4517 | 1px solid rgba(68,226,205,0.25) @ renderer/style.css:4517 |
| .badge-purple |  | background | var(--purple-dim) @ renderer/style.css:1424 → rgba(192,132,252,0.10) @ renderer/style.css:4518 | rgba(192,132,252,0.10) @ renderer/style.css:4518 |
| .badge-amber |  | background | var(--amber-dim) @ renderer/style.css:1426 → rgba(251,191,36,0.10) @ renderer/style.css:4520 | rgba(251,191,36,0.10) @ renderer/style.css:4520 |
| .form-control |  | border | 1px solid var(--border) @ renderer/style.css:1468 → 1px solid #52443a @ renderer/style.css:4525 | 1px solid #52443a @ renderer/style.css:4525 |
| .form-control |  | border-radius | var(--radius-sm) @ renderer/style.css:1469 → var(--r-md) @ renderer/style.css:4526 | var(--r-md) @ renderer/style.css:4526 |
| .form-control |  | padding | 10px 13px @ renderer/style.css:1470 → 10px 14px @ renderer/style.css:4527 | 10px 14px @ renderer/style.css:4527 |
| .form-control |  | transition | var(--transition) @ renderer/style.css:1474 → border-color 0.2s ease, box-shadow 0.2s ease, background 0.15s ease @ renderer/style.css:4531 | border-color 0.2s ease, box-shadow 0.2s ease, background 0.15s ease @ renderer/style.css:4531 |
| .form-control:focus |  | border-color | var(--accent) @ renderer/style.css:1483 → var(--accent-strong) @ renderer/style.css:4538 | var(--accent-strong) @ renderer/style.css:4538 |
| .form-control:focus |  | box-shadow | 0 0 0 3px rgba(0, 0, 0, 0.1) @ renderer/style.css:1484 → 0 0 0 3px rgba(56,189,248,0.12) @ renderer/style.css:4539 | 0 0 0 3px rgba(56,189,248,0.12) @ renderer/style.css:4539 |
| .modal |  | background | var(--card) @ renderer/style.css:1530 → var(--bg2) @ renderer/style.css:4592 | var(--bg2) @ renderer/style.css:4592 |
| .modal |  | border | 1px solid var(--border2) @ renderer/style.css:1531 → var(--hairline) @ renderer/style.css:4593 | var(--hairline) @ renderer/style.css:4593 |
| .modal |  | border-radius | 20px @ renderer/style.css:1532 → var(--r-2xl) @ renderer/style.css:4594 | var(--r-2xl) @ renderer/style.css:4594 |
| .modal |  | box-shadow | 0 32px 80px rgba(0, 0, 0, 0.7) @ renderer/style.css:1534 → 0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03) @ renderer/style.css:4595 | 0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.03) @ renderer/style.css:4595 |
| .modal-header |  | border-bottom | 1px solid var(--border) @ renderer/style.css:1550 → var(--hairline) @ renderer/style.css:4603 | var(--hairline) @ renderer/style.css:4603 |
| .modal-header |  | background | linear-gradient(180deg, rgba(0,0,0,0.04) 0%, transparent 100%) @ renderer/style.css:1555 → linear-gradient(180deg, rgba(96,165,250,0.04) 0%, transparent 100%) @ renderer/style.css:4602 | linear-gradient(180deg, rgba(96,165,250,0.04) 0%, transparent 100%) @ renderer/style.css:4602 |
| .modal-title |  | font-size | 18px @ renderer/style.css:1558 → 17px @ renderer/style.css:4617 | 17px @ renderer/style.css:4617 |
| .filter-bar |  | background | var(--card) @ renderer/style.css:1579 → var(--bg2) @ renderer/style.css:4558 | var(--bg2) @ renderer/style.css:4558 |
| .filter-bar |  | border | 1px solid var(--border) @ renderer/style.css:1580 → var(--hairline) @ renderer/style.css:4559 | var(--hairline) @ renderer/style.css:4559 |
| .filter-bar |  | border-radius | var(--radius) @ renderer/style.css:1581 → var(--r-xl) @ renderer/style.css:4560 | var(--r-xl) @ renderer/style.css:4560 |
| .filter-bar |  | padding | 14px 16px @ renderer/style.css:1582 → 12px 16px @ renderer/style.css:4561 | 12px 16px @ renderer/style.css:4561 |
| .filter-bar |  | margin-bottom | 18px @ renderer/style.css:1583 → 16px @ renderer/style.css:4562 | 16px @ renderer/style.css:4562 |
| .ftab |  | border-radius | var(--radius-sm) @ renderer/style.css:1620 → var(--r-md) @ renderer/style.css:4571 | var(--r-md) @ renderer/style.css:4571 |
| .ftab |  | font-weight | 600 @ renderer/style.css:1622 → 500 @ renderer/style.css:4573 | 500 @ renderer/style.css:4573 |
| .ftab |  | transition | var(--transition) @ renderer/style.css:1625 → all 0.15s ease @ renderer/style.css:4577 | all 0.15s ease @ renderer/style.css:4577 |
| .ftab.active |  | background | var(--accent-dim) @ renderer/style.css:1633 → rgba(96,165,250,0.10) @ renderer/style.css:4584 | rgba(96,165,250,0.10) @ renderer/style.css:4584 |
| .ftab.active |  | color | var(--accent-strong) @ renderer/style.css:1634 → var(--accent) @ renderer/style.css:4585 | var(--accent) @ renderer/style.css:4585 |
| .ftab.active |  | border-color | rgba(0, 0, 0, 0.15) @ renderer/style.css:1635 → rgba(96,165,250,0.2) @ renderer/style.css:4586 | rgba(96,165,250,0.2) @ renderer/style.css:4586 |
| .room-card |  | background | var(--card) @ renderer/style.css:1648 → var(--bg2) @ renderer/style.css:4656 | var(--bg2) @ renderer/style.css:4656 |
| .room-card |  | border | 1px solid var(--border) @ renderer/style.css:1649 → var(--hairline) @ renderer/style.css:4657 | var(--hairline) @ renderer/style.css:4657 |
| .room-card |  | border-radius | var(--radius) @ renderer/style.css:1650 → var(--r-xl) @ renderer/style.css:4658 | var(--r-xl) @ renderer/style.css:4658 |
| .room-card |  | transition | var(--transition-bounce) @ renderer/style.css:1653 → background 0.15s ease, transform 0.2s ease, border-color 0.2s ease @ renderer/style.css:4659 | background 0.15s ease, transform 0.2s ease, border-color 0.2s ease @ renderer/style.css:4659 |
| .room-card:hover |  | border-color | rgba(0, 0, 0, 0.2) @ renderer/style.css:1668 → rgba(96,165,250,0.20) @ renderer/style.css:4664 | rgba(96,165,250,0.20) @ renderer/style.css:4664 |
| .room-card:hover |  | transform | translateY(-4px) @ renderer/style.css:1669 → translateY(-3px) @ renderer/style.css:4665 | translateY(-3px) @ renderer/style.css:4665 |
| .room-card:hover |  | box-shadow | var(--shadow) @ renderer/style.css:1670 → var(--s-elev-3) @ renderer/style.css:4666 | var(--s-elev-3) @ renderer/style.css:4666 |
| .progress-track |  | height | 6px @ renderer/style.css:1772 → 4px @ renderer/style.css:4793 | 4px @ renderer/style.css:4793 |
| .progress-track |  | background | var(--bg4) @ renderer/style.css:1773 → var(--bg5) @ renderer/style.css:4794 | var(--bg5) @ renderer/style.css:4794 |
| .progress-track |  | border-radius | 3px @ renderer/style.css:1774 → 2px @ renderer/style.css:4795 | 2px @ renderer/style.css:4795 |
| .progress-fill |  | border-radius | 3px @ renderer/style.css:1778 → 2px @ renderer/style.css:4799 | 2px @ renderer/style.css:4799 |
| .settings-tab.active |  | background | linear-gradient(135deg, rgba(37,99,235,0.12), rgba(37,99,235,0.06)) @ renderer/style.css:1840 → linear-gradient(135deg, rgba(0,0,0,0.08), rgba(96,165,250,0.05)) @ renderer/style.css:4688 | linear-gradient(135deg, rgba(0,0,0,0.08), rgba(96,165,250,0.05)) @ renderer/style.css:4688 |
| .settings-tab.active |  | color | var(--accent-strong) @ renderer/style.css:1841 → var(--accent) @ renderer/style.css:4689 | var(--accent) @ renderer/style.css:4689 |
| .room-type-row |  | border | 1px solid var(--border) @ renderer/style.css:1920 → var(--hairline) @ renderer/style.css:4787 | var(--hairline) @ renderer/style.css:4787 |
| .room-type-row |  | border-radius | var(--radius-sm) @ renderer/style.css:1921 → var(--r-md) @ renderer/style.css:4788 | var(--r-md) @ renderer/style.css:4788 |
| .stat-trend |  | border-radius | 20px @ renderer/style.css:3415 → var(--r-full) @ renderer/style.css:4819 | var(--r-full) @ renderer/style.css:4819 |
| .stat-trend.up |  | background | rgba(52,211,153,0.12) @ renderer/style.css:3420 → rgba(69,223,164,0.12) @ renderer/style.css:4824 | rgba(69,223,164,0.12) @ renderer/style.css:4824 |
| .stat-trend.up |  | border | 1px solid rgba(52,211,153,0.2) @ renderer/style.css:3420 → 1px solid rgba(69,223,164,0.2) @ renderer/style.css:4824 | 1px solid rgba(69,223,164,0.2) @ renderer/style.css:4824 |
| .stat-trend.down |  | background | rgba(248,113,113,0.12) @ renderer/style.css:3421 → rgba(255,180,171,0.12) @ renderer/style.css:4825 | rgba(255,180,171,0.12) @ renderer/style.css:4825 |
| .stat-trend.down |  | border | 1px solid rgba(248,113,113,0.2) @ renderer/style.css:3421 → 1px solid rgba(255,180,171,0.2) @ renderer/style.css:4825 | 1px solid rgba(255,180,171,0.2) @ renderer/style.css:4825 |
| .stat-trend.flat |  | background | rgba(0,0,0,0.06) @ renderer/style.css:3422 → rgba(96,165,250,0.08) @ renderer/style.css:4826 | rgba(96,165,250,0.08) @ renderer/style.css:4826 |
| .money-value .money-amt |  | letter-spacing | -0.02em @ renderer/style.css:3664 → var(--ant-num-track) @ renderer/ui-kit.css:80 | var(--ant-num-track) @ renderer/ui-kit.css:80 |
| .modal-header::after |  | background | linear-gradient(90deg, rgba(0,0,0,0.2), rgba(0,0,0,0.04), transparent) @ renderer/style.css:3756 → linear-gradient(90deg, rgba(96,165,250,0.25), rgba(96,165,250,0.05), transparent) @ renderer/style.css:4612 | linear-gradient(90deg, rgba(96,165,250,0.25), rgba(96,165,250,0.05), transparent) @ renderer/style.css:4612 |
| :focus-visible |  | outline | 2px solid rgba(59,130,246,0.7) @ renderer/style.css:3920 → 2px solid rgba(96,165,250,0.6) @ renderer/style.css:4229 | 2px solid rgba(96,165,250,0.6) @ renderer/style.css:4229 |
| body.light-theme .stat-card |  | background | var(--card) @ renderer/style.css:3941 → var(--surface) @ renderer/style.css:4457 | var(--surface) @ renderer/style.css:4457 |
| body.light-theme .stat-card |  | box-shadow | 0 1px 3px rgba(0,0,0,0.05), 0 4px 20px rgba(0,0,0,0.04), 0 0 0 1px var(--border) @ renderer/style.css:3942 → 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(59,130,246,0.05) @ renderer/style.css:4459 | 0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(59,130,246,0.05) @ renderer/style.css:4459 |
| body.light-theme .card |  | box-shadow | 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04), 0 0 0 1px var(--border) @ renderer/style.css:3951 → 0 1px 4px rgba(0,0,0,0.05) @ renderer/style.css:4343 | 0 1px 4px rgba(0,0,0,0.05) @ renderer/style.css:4343 |
| body.light-theme #header |  | box-shadow | 0 1px 0 var(--border), 0 4px 20px rgba(0,0,0,0.04) @ renderer/style.css:3956 → 0 1px 0 #d7c3b5 @ renderer/style.css:4315 | 0 1px 0 #d7c3b5 @ renderer/style.css:4315 |
| body.light-theme #sidebar |  | box-shadow | 1px 0 0 var(--border), 4px 0 24px rgba(0,0,0,0.04) @ renderer/style.css:3961 → 2px 0 16px rgba(0,0,0,0.04) @ renderer/style.css:4243 | 2px 0 16px rgba(0,0,0,0.04) @ renderer/style.css:4243 |
| body.light-theme .modal |  | box-shadow | 0 16px 48px rgba(0,0,0,0.12), 0 0 0 1px var(--border) @ renderer/style.css:3966 → 0 16px 48px rgba(0,0,0,0.12) @ renderer/style.css:4626 | 0 16px 48px rgba(0,0,0,0.12) @ renderer/style.css:4626 |
| ::-webkit-scrollbar-thumb:hover |  | background | rgba(255,255,255,0.25) @ renderer/style.css:4080 → #52443a @ renderer/style.css:4222 | #52443a @ renderer/style.css:4222 |

### 13.6 Classes defined in more than one file — 176

| Class | Files | Rules |
|---|---|---|
| is-on | renderer/activitylog.css, renderer/archive.css, renderer/dashboard.css, renderer/expenses.css, renderer/forms.css, renderer/issues.css, renderer/listkit.css, renderer/onboarding.css, renderer/payments.css, renderer/pw-eye.css, renderer/reports.css, renderer/rooms.css, renderer/settings.css, renderer/students.css, renderer/support.css, renderer/users.css | 60 |
| light-theme | renderer/chrome.css, renderer/components.css, renderer/dashboard.css, renderer/listkit.css, renderer/login.css, renderer/payments.css, renderer/students.css, renderer/style.css, renderer/tokens.css, renderer/ui-kit.css, renderer/whatsapp.css | 127 |
| btn | renderer/forms.css, renderer/settings.css, renderer/style.css, renderer/support.css, renderer/ui-kit.css, renderer/license-settings.html | 20 |
| is-warn | renderer/dashboard.css, renderer/forms.css, renderer/onboarding.css, renderer/rooms.css, renderer/settings.css, renderer/students.css | 10 |
| sub | renderer/chrome.css, renderer/style.css, renderer/recovery.html, renderer/src/export/engine.js, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 9 |
| is-set | renderer/expenses.css, renderer/listkit.css, renderer/payments.css, renderer/reports.css, renderer/rooms.css, renderer/students.css | 7 |
| form-control | renderer/activitylog.css, renderer/forms.css, renderer/style.css, renderer/support.css, renderer/ui-kit.css | 23 |
| icon | renderer/dashboard.css, renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 21 |
| is-over | renderer/backup.css, renderer/dashboard.css, renderer/payments.css, renderer/students.css, renderer/src/modules/dashboard.js | 15 |
| set-btn | renderer/activitylog.css, renderer/cancellations.css, renderer/expenses.css, renderer/settings.css, renderer/users.css | 12 |
| dh-green | renderer/archive.css, renderer/dashboard.css, renderer/former.css, renderer/payments.css, renderer/ui-kit.css | 10 |
| is-bad | renderer/payments.css, renderer/rooms.css, renderer/settings.css, renderer/students.css, renderer/users.css | 9 |
| is-empty | renderer/rooms.css, renderer/settings.css, renderer/students.css, renderer/support.css, renderer/src/modules/students.js | 8 |
| is-open | renderer/dashboard.css, renderer/listkit.css, renderer/settings.css, renderer/students.css, renderer/users.css | 7 |
| v | renderer/rooms.css, renderer/style.css, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 13 |
| field | renderer/cancellations.css, renderer/forms.css, renderer/settings.css, renderer/style.css | 10 |
| is-sortable | renderer/expenses.css, renderer/listkit.css, renderer/payments.css, renderer/students.css | 8 |
| arw | renderer/expenses.css, renderer/listkit.css, renderer/payments.css, renderer/students.css | 8 |
| is-sorted | renderer/expenses.css, renderer/listkit.css, renderer/payments.css, renderer/students.css | 8 |
| is-ok | renderer/dashboard.css, renderer/onboarding.css, renderer/students.css, renderer/users.css | 6 |
| is-none | renderer/expenses.css, renderer/payments.css, renderer/students.css, renderer/src/modules/dashboard.js | 6 |
| num | renderer/archive.css, renderer/registers-center.css, renderer/rooms.css, renderer/style.css | 4 |
| l | renderer/dashboard.css, renderer/style.css, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 4 |
| lk-acts | renderer/issues.css, renderer/listkit.css, renderer/registers-center.css, renderer/settings.css | 4 |
| icon-xs | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 4 |
| icon-sm | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 4 |
| active | renderer/chrome.css, renderer/style.css, renderer/license-settings.html | 46 |
| modal | renderer/cancellations.css, renderer/forms.css, renderer/style.css | 25 |
| sidebar-collapsed | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 16 |
| lk-table | renderer/former.css, renderer/listkit.css, renderer/registers-center.css | 16 |
| is-clear | renderer/dashboard.css, renderer/payments.css, renderer/students.css | 13 |
| card | renderer/style.css, renderer/license-settings.html, renderer/license.html | 13 |
| sb-logo | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 11 |
| sb-section | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 9 |
| badge | renderer/students.css, renderer/style.css, renderer/license-settings.html | 9 |
| has-titlebar | renderer/forms.css, renderer/titlebar.css, renderer/license.html | 8 |
| is-due | renderer/payments.css, renderer/students.css, renderer/src/modules/students.js | 8 |
| is-danger | renderer/listkit.css, renderer/students.css, renderer/users.css | 7 |
| sb-month-picker__arrow | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 6 |
| dh-slate | renderer/dashboard.css, renderer/payments.css, renderer/ui-kit.css | 6 |
| is-locked | renderer/activitylog.css, renderer/settings.css, renderer/users.css | 5 |
| dh-amber | renderer/archive.css, renderer/payments.css, renderer/ui-kit.css | 5 |
| sb-month-picker__display | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 5 |
| req | renderer/forms.css, renderer/payments.css, renderer/students.css | 5 |
| is-dragging | renderer/payments.css, renderer/settings.css, renderer/students.css | 5 |
| dh-red | renderer/archive.css, renderer/dashboard.css, renderer/ui-kit.css | 4 |
| dh-blue | renderer/archive.css, renderer/payments.css, renderer/ui-kit.css | 4 |
| sb-month-picker__header | renderer/chrome.css, renderer/rail-compact.css, renderer/style.css | 4 |
| opt | renderer/forms.css, renderer/payments.css, renderer/settings.css | 4 |
| lk-room__n | renderer/issues.css, renderer/listkit.css, renderer/payments.css | 4 |
| is-mono | renderer/settings.css, renderer/students.css, renderer/support.css | 4 |
| note | renderer/license-settings.html, renderer/recovery.html, renderer/src/modules/students.js | 4 |
| is-up | renderer/activitylog.css, renderer/archive.css, renderer/expenses.css | 3 |
| is-down | renderer/activitylog.css, renderer/archive.css, renderer/expenses.css | 3 |
| is-readonly | renderer/forms.css, renderer/rooms.css, renderer/style.css | 3 |
| lk-act--icon | renderer/issues.css, renderer/listkit.css, renderer/settings.css | 3 |
| icon-lg | renderer/style.css, renderer/license-settings.html, renderer/src/modules/dashboard.js | 3 |
| nav-item | renderer/chrome.css, renderer/style.css | 45 |
| pay-table | renderer/payments.css, renderer/registers-center.css | 44 |
| stu-table | renderer/registers-center.css, renderer/students.css | 33 |
| sbox | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 24 |
| exp-table | renderer/expenses.css, renderer/registers-center.css | 16 |
| stu-pan__act | renderer/students.css, renderer/users.css | 13 |
| nav-icon | renderer/chrome.css, renderer/style.css | 12 |
| toast | renderer/style.css, renderer/license-settings.html | 12 |
| ico | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 12 |
| arc-table | renderer/archive.css, renderer/registers-center.css | 11 |
| extra-charge-row | renderer/payments.css, renderer/style.css | 11 |
| hdr-month-picker | renderer/chrome.css, renderer/style.css | 10 |
| sb-logo-text | renderer/chrome.css, renderer/style.css | 9 |
| sb-nav | renderer/chrome.css, renderer/style.css | 9 |
| n | renderer/dashboard.css, renderer/src/modules/students.js | 9 |
| hf-in | renderer/forms.css, renderer/pw-eye.css | 9 |
| btn-primary | renderer/chrome.css, renderer/style.css | 8 |
| modal-overlay | renderer/forms.css, renderer/style.css | 8 |
| modal-header | renderer/forms.css, renderer/style.css | 8 |
| rm-btn | renderer/payments.css, renderer/style.css | 8 |
| set-table | renderer/settings.css, renderer/users.css | 8 |
| header | renderer/style.css, renderer/src/modules/dashboard.js | 8 |
| sb-logo-icon | renderer/chrome.css, renderer/style.css | 7 |
| sidebar-collapse-btn | renderer/chrome.css, renderer/style.css | 7 |
| sidebar__bottom | renderer/chrome.css, renderer/style.css | 7 |
| c | renderer/dashboard.css, renderer/src/modules/students.js | 7 |
| modal-body | renderer/forms.css, renderer/style.css | 7 |
| green | renderer/style.css, renderer/license-settings.html | 7 |
| red | renderer/style.css, renderer/license-settings.html | 7 |
| fact | renderer/license-settings.html, renderer/src/modules/students.js | 7 |
| msg | renderer/license.html, renderer/recovery.html | 7 |
| nav-badge | renderer/chrome.css, renderer/style.css | 6 |
| form-grid | renderer/forms.css, renderer/style.css | 6 |
| hf-switch__b | renderer/forms.css, renderer/issues.css | 6 |
| hi-logo | renderer/onboarding.css, renderer/settings.css | 6 |
| pay-who | renderer/payments.css, renderer/registers-center.css | 6 |
| stu-who | renderer/registers-center.css, renderer/students.css | 6 |
| date | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 6 |
| lk-acts--widget | renderer/cancellations.css, renderer/former.css | 5 |
| is-now | renderer/payments.css, renderer/students.css | 5 |
| is-paid | renderer/payments.css, renderer/src/modules/students.js | 5 |
| stu-who__name | renderer/registers-center.css, renderer/students.css | 5 |
| stu-who__sub | renderer/registers-center.css, renderer/students.css | 5 |
| pm-chip | renderer/students.css, renderer/style.css | 5 |
| danger | renderer/style.css, renderer/license-settings.html | 5 |
| title | renderer/license.html, renderer/src/export/engine.js | 5 |
| is-red | renderer/cancellations.css, renderer/payments.css | 4 |
| lk-act | renderer/cancellations.css, renderer/listkit.css | 4 |
| pill | renderer/components.css, renderer/src/modules/students.js | 4 |
| money-value--display | renderer/dashboard.css, renderer/style.css | 4 |
| is-free | renderer/dashboard.css, renderer/src/modules/dashboard.js | 4 |
| exp-desc | renderer/expenses.css, renderer/registers-center.css | 4 |
| lk-act--hue | renderer/former.css, renderer/listkit.css | 4 |
| modal-footer | renderer/forms.css, renderer/style.css | 4 |
| iss-c-title | renderer/issues.css, renderer/registers-center.css | 4 |
| stu-room__t | renderer/listkit.css, renderer/students.css | 4 |
| stu-pan | renderer/students.css, renderer/titlebar.css | 4 |
| stu-pan__print | renderer/students.css, renderer/users.css | 4 |
| success | renderer/style.css, renderer/license.html | 4 |
| divider | renderer/style.css, renderer/license.html | 4 |
| money-value | renderer/style.css, renderer/ui-kit.css | 4 |
| panel | renderer/recovery.html, renderer/src/modules/students.js | 4 |
| footer | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 4 |
| set-sel | renderer/activitylog.css, renderer/settings.css | 3 |
| is-amber | renderer/cancellations.css, renderer/payments.css | 3 |
| sb-logo-mark | renderer/chrome.css, renderer/style.css | 3 |
| name | renderer/chrome.css, renderer/style.css | 3 |
| nav-label | renderer/chrome.css, renderer/style.css | 3 |
| dash-spark-empty | renderer/dashboard.css, renderer/reports.css | 3 |
| col-full | renderer/forms.css, renderer/style.css | 3 |
| lk-who__n | renderer/issues.css, renderer/listkit.css | 3 |
| lk-who__s | renderer/issues.css, renderer/listkit.css | 3 |
| lk-who | renderer/listkit.css, renderer/registers-center.css | 3 |
| lk-when | renderer/listkit.css, renderer/registers-center.css | 3 |
| stu-room__n | renderer/listkit.css, renderer/students.css | 3 |
| stu-cov | renderer/listkit.css, renderer/students.css | 3 |
| is-picked | renderer/payments.css, renderer/students.css | 3 |
| is-muted | renderer/payments.css, renderer/students.css | 3 |
| has-img | renderer/settings.css, renderer/users.css | 3 |
| stu-pan__scrim | renderer/students.css, renderer/titlebar.css | 3 |
| is-num | renderer/students.css, renderer/users.css | 3 |
| room-grid | renderer/style.css, renderer/src/modules/dashboard.js | 3 |
| error | renderer/style.css, renderer/license.html | 3 |
| money-amt | renderer/style.css, renderer/ui-kit.css | 3 |
| paid | renderer/style.css, renderer/src/modules/students.js | 3 |
| fact__v | renderer/license-settings.html, renderer/src/modules/students.js | 3 |
| grand | renderer/src/export/engine.js, renderer/src/modules/students.js | 3 |
| al-panel-wrap | renderer/activitylog.css, renderer/forms.css | 2 |
| al-panel | renderer/activitylog.css, renderer/forms.css | 2 |
| nm | renderer/archive.css, renderer/src/modules/students.js | 2 |
| is-green | renderer/cancellations.css, renderer/students.css | 2 |
| nav-item--danger | renderer/chrome.css, renderer/style.css | 2 |
| hdr-right | renderer/chrome.css, renderer/style.css | 2 |
| sb-month-picker__icon | renderer/chrome.css, renderer/style.css | 2 |
| btn-success | renderer/chrome.css, renderer/style.css | 2 |
| text-muted | renderer/components.css, renderer/style.css | 2 |
| text-mono | renderer/components.css, renderer/style.css | 2 |
| pkr | renderer/dashboard.css, renderer/style.css | 2 |
| fm-reason | renderer/former.css, renderer/registers-center.css | 2 |
| is-good | renderer/forms.css, renderer/students.css | 2 |
| lk-who__av | renderer/issues.css, renderer/listkit.css | 2 |
| show | renderer/login.css, renderer/license-settings.html | 2 |
| pay-who__name | renderer/payments.css, renderer/registers-center.css | 2 |
| sb-month-picker__label | renderer/rail-compact.css, renderer/style.css | 2 |
| stu-addr | renderer/registers-center.css, renderer/students.css | 2 |
| stu-addr__t | renderer/registers-center.css, renderer/students.css | 2 |
| k | renderer/rooms.css, renderer/style.css | 2 |
| hi-facts | renderer/settings.css, renderer/users.css | 2 |
| skeleton | renderer/style.css, renderer/license-settings.html | 2 |
| inactive | renderer/style.css, renderer/license-settings.html | 2 |
| mono | renderer/license-settings.html, renderer/src/modules/students.js | 2 |
| dim | renderer/license-settings.html, renderer/src/modules/students.js | 2 |
| fact__k | renderer/license-settings.html, renderer/src/modules/students.js | 2 |
| subtitle | renderer/license.html, renderer/src/export/engine.js | 2 |
| no-print | renderer/src/export/engine.js, renderer/src/modules/dashboard.js | 2 |
| kicker | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 2 |
| d | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 2 |
| h | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 2 |
| summary | renderer/src/modules/dashboard.js, renderer/src/modules/students.js | 2 |

### 13.7 Classes defined in CSS and not found as a literal in any HTML/JS — 386 (plus 18 whose prefix is concatenated in JS, so use cannot be ruled out statically)

| Class | Defined at |
|---|---|
| align-center | renderer/style.css:2092 |
| arch-add-btn | renderer/style.css:2544; renderer/style.css:2556 |
| arch-back-btn | renderer/style.css:2773; renderer/style.css:2785 |
| arch-badge-done | renderer/style.css:2431 |
| arch-badge-empty | renderer/style.css:2433 |
| arch-badge-future | renderer/style.css:2432 |
| arch-badge-live | renderer/style.css:2430 |
| arch-cat-row | renderer/style.css:2787; renderer/style.css:2798 |
| arch-chart-wrap | renderer/style.css:2333 |
| arch-edit-box | renderer/style.css:2725 |
| arch-edit-close | renderer/style.css:2747; renderer/style.css:2756 |
| arch-edit-overlay | renderer/style.css:2711; renderer/style.css:2723 |
| arch-edit-title | renderer/style.css:2738 |
| arch-empty-icon | renderer/style.css:2660 |
| arch-empty-state | renderer/style.css:2659 |
| arch-export-btn | renderer/style.css:2644; renderer/style.css:2655 |
| arch-filter-btn | renderer/style.css:2630; renderer/style.css:2642 |
| arch-hb | renderer/style.css:450; renderer/style.css:2335 |
| arch-hb-divider | renderer/style.css:2365 |
| arch-hb-dot | renderer/style.css:2354 |
| arch-hb-left | renderer/style.css:2353 |
| arch-hb-month | renderer/style.css:2349 |
| arch-hb-net-row | renderer/style.css:2366 |
| arch-hb-pct | renderer/style.css:2357 |
| arch-hb-row | renderer/style.css:2351 |
| arch-hb-val | renderer/style.css:2355 |
| arch-leg-dot | renderer/style.css:2310 |
| arch-leg-item | renderer/style.css:2309 |
| arch-mc-add-btn | renderer/style.css:2455; renderer/style.css:2468 |
| arch-mc-badge | renderer/style.css:2428 |
| arch-mc-bar | renderer/style.css:2441 |
| arch-mc-bar-fill | renderer/style.css:2442 |
| arch-mc-divider | renderer/style.css:2438 |
| arch-mc-header | renderer/style.css:2425 |
| arch-mc-hint | renderer/style.css:2444; renderer/style.css:2453 |
| arch-mc-name | renderer/style.css:2426 |
| arch-mc-net | renderer/style.css:2439 |
| arch-mc-stat | renderer/style.css:2435 |
| arch-mc-stat-label | renderer/style.css:2436 |
| arch-mc-stat-val | renderer/style.css:2437 |
| arch-modal | renderer/style.css:2485 |
| arch-modal-actions | renderer/style.css:2508 |
| arch-modal-body | renderer/style.css:2602 |
| arch-modal-close | renderer/style.css:2510; renderer/style.css:2524 |
| arch-modal-header | renderer/style.css:2497 |
| arch-modal-overlay | renderer/style.css:2470; renderer/style.css:2483 |
| arch-modal-sub | renderer/style.css:2507 |
| arch-modal-summary | renderer/style.css:2558 |
| arch-modal-tabs | renderer/style.css:2575 |
| arch-modal-title | renderer/style.css:2506 |
| arch-month-card | renderer/style.css:2403; renderer/style.css:2414; renderer/style.css:2420 (+7) |
| arch-month-grid | renderer/style.css:2392; renderer/style.css:2400 |
| arch-ms-hint | renderer/style.css:2573 |
| arch-ms-item | renderer/style.css:2560; renderer/style.css:2568; renderer/style.css:2569 |
| arch-ms-label | renderer/style.css:2571 |
| arch-ms-val | renderer/style.css:2572; renderer/style.css:3619 |
| arch-ov-bar | renderer/style.css:410; renderer/style.css:2679 |
| arch-ov-bar-fill | renderer/style.css:2680 |
| arch-ov-card | renderer/style.css:2664; renderer/style.css:2673; renderer/style.css:4767 (+2) |
| arch-ov-grid | renderer/style.css:2662 |
| arch-ov-label | renderer/style.css:2675 |
| arch-ov-sub | renderer/style.css:2677 |
| arch-ov-val | renderer/style.css:2676; renderer/style.css:3619 |
| arch-print-btn | renderer/style.css:2530; renderer/style.css:2542 |
| arch-s-card | renderer/style.css:2370; renderer/style.css:2381; renderer/style.css:4767 (+2) |
| arch-s-hint | renderer/style.css:2390 |
| arch-s-label | renderer/style.css:2387 |
| arch-s-sub | renderer/style.css:2389 |
| arch-s-val | renderer/style.css:2388; renderer/style.css:3619 |
| arch-search-bar | renderer/style.css:2606 |
| arch-search-inp | renderer/style.css:2614; renderer/style.css:2627; renderer/style.css:2628 |
| arch-stu-av | renderer/style.css:2698 |
| arch-stu-card | renderer/style.css:2684; renderer/style.css:2696; renderer/style.css:4767 |
| arch-stu-grid | renderer/style.css:2682 |
| arch-summary-bar | renderer/style.css:2368 |
| arch-t-badge | renderer/style.css:2314 |
| arch-t-badge-label | renderer/style.css:2323 |
| arch-t-badge-val | renderer/style.css:2331; renderer/style.css:3619 |
| arch-tab-btn | renderer/style.css:2582; renderer/style.css:2595; renderer/style.css:2597 |
| arch-tab-panel | renderer/style.css:2603; renderer/style.css:2604 |
| arch-tbl-wrap | renderer/style.css:2657 |
| arch-top-bar | renderer/style.css:2259; renderer/style.css:2267; renderer/style.css:2268 |
| arch-trend-badges | renderer/style.css:2312 |
| arch-trend-card | renderer/style.css:2289 |
| arch-trend-header | renderer/style.css:2297 |
| arch-trend-legend | renderer/style.css:2307 |
| arch-trend-sub | renderer/style.css:2306 |
| arch-trend-title | renderer/style.css:2305 |
| arch-year-detail | renderer/style.css:2758 |
| arch-year-detail-hdr | renderer/style.css:2766 |
| arch-year-tab | renderer/style.css:2272; renderer/style.css:2284; renderer/style.css:2287 |
| arch-year-tabs | renderer/style.css:2270 |
| asf-num | renderer/students.css:795 |
| asf-num--id | renderer/students.css:799 |
| asf-rec | renderer/students.css:779 |
| asf-rec__k | renderer/students.css:791 |
| asf-rec__r | renderer/students.css:784; renderer/students.css:788 |
| asf-rec__v | renderer/students.css:793 |
| badge-purple | renderer/style.css:1424; renderer/style.css:4518 |
| badge-teal | renderer/style.css:1423; renderer/style.css:4517 |
| btn-circle | renderer/style.css:3457; renderer/style.css:3471 |
| btn-ent | renderer/components.css:70 |
| btn-ent--danger | renderer/components.css:130; renderer/components.css:135 |
| btn-ent--lg | renderer/components.css:143 |
| btn-ent--primary | renderer/components.css:87; renderer/components.css:92 |
| btn-ent--secondary | renderer/components.css:97; renderer/components.css:102; renderer/components.css:105 (+1) |
| btn-ent--sm | renderer/components.css:139 |
| btn-ent--tertiary | renderer/components.css:116; renderer/components.css:121; renderer/components.css:125 |
| btn-ghost | renderer/style.css:3435; renderer/style.css:3450 |
| btn-gold | renderer/style.css:1154; renderer/style.css:1160 |
| btn-pill | renderer/style.css:3428 |
| card-ent | renderer/components.css:242 |
| card-ent__body | renderer/components.css:266 |
| card-ent__header | renderer/components.css:250 |
| card-ent__title | renderer/components.css:258 |
| chart-bar | renderer/style.css:1739; renderer/style.css:1747 |
| chart-bar-group | renderer/style.css:1729 |
| chart-bar-wrap | renderer/style.css:1727 |
| chart-bars | renderer/style.css:1737 |
| chart-label | renderer/style.css:1749 |
| chart-legend | renderer/style.css:1751 |
| chart-legend-dot | renderer/style.css:1761 |
| chart-legend-item | renderer/style.css:1753 |
| col-actions | renderer/style.css:5127; renderer/style.css:5133; renderer/style.css:5137 (+1) |
| color-picker-wrap | renderer/style.css:1874; renderer/style.css:1876 |
| confetti-particle | renderer/style.css:3313 |
| confirm-name | renderer/style.css:2102 |
| current-month | renderer/style.css:2422 |
| d-flex | renderer/style.css:2091 |
| dash-banner | renderer/dashboard.css:270; renderer/dashboard.css:271 |
| dash-banner__go | renderer/dashboard.css:273 |
| dash-banner__msg | renderer/dashboard.css:272 |
| dash-btn | renderer/dashboard.css:114; renderer/dashboard.css:119 |
| dash-card | renderer/style.css:330; renderer/style.css:4767; renderer/style.css:4772 (+1) |
| dash-chip--lg | renderer/dashboard.css:76; renderer/dashboard.css:77; renderer/dashboard.css:310 (+1) |
| dash-key | renderer/dashboard.css:161; renderer/dashboard.css:162 |
| dash-kpi__note | renderer/dashboard.css:59; renderer/dashboard.css:64; renderer/dashboard.css:65 (+3) |
| dash-mini | renderer/dashboard.css:140; renderer/dashboard.css:323 |
| dash-mini__k | renderer/dashboard.css:144 |
| dash-mini__v | renderer/dashboard.css:145; renderer/dashboard.css:324 |
| dash-mini-row | renderer/dashboard.css:139 |
| dash-pill-heading | renderer/style.css:567 |
| dash-rp-sub | renderer/dashboard.css:426 |
| dash-rt | renderer/dashboard.css:165; renderer/dashboard.css:166; renderer/dashboard.css:332 |
| dash-rt__bar | renderer/dashboard.css:170; renderer/dashboard.css:171; renderer/dashboard.css:334 |
| dash-rt__dot | renderer/dashboard.css:167 |
| dash-rt__meta | renderer/dashboard.css:169 |
| dash-rt__name | renderer/dashboard.css:168; renderer/dashboard.css:333 |
| dash-rt__pct | renderer/dashboard.css:172 |
| dash-seat-legend | renderer/dashboard.css:947 |
| dash-seat-sum | renderer/dashboard.css:148; renderer/dashboard.css:149; renderer/dashboard.css:150 (+8) |
| dash-sec__sub | renderer/dashboard.css:111; renderer/dashboard.css:742; renderer/dashboard.css:1794 (+1) |
| dash-sec__tools | renderer/dashboard.css:112 |
| dash-tile__caret | renderer/dashboard.css:98 |
| dash-tile__head | renderer/dashboard.css:96; renderer/dashboard.css:313 |
| dash-tile__num | renderer/dashboard.css:97; renderer/dashboard.css:314 |
| dash-tile-grid | renderer/dashboard.css:95; renderer/dashboard.css:300; renderer/dashboard.css:393 |
| dash-track | renderer/dashboard.css:83; renderer/dashboard.css:318; renderer/dashboard.css:1064 |
| dash-track__fill | renderer/dashboard.css:84 |
| dl-head__total | renderer/dashboard.css:517 |
| dl-head3__tag | renderer/dashboard.css:2830 |
| dl-rem | renderer/dashboard.css:559 |
| dl-rem__body | renderer/dashboard.css:575; renderer/dashboard.css:576 |
| dl-rem__ic | renderer/dashboard.css:567 |
| dl-rem__ic--due | renderer/dashboard.css:574 |
| dl-rem__row | renderer/dashboard.css:560; renderer/dashboard.css:565; renderer/dashboard.css:566 |
| dl-rem__row--static | renderer/dashboard.css:585; renderer/dashboard.css:587 |
| dl-rem__sub | renderer/dashboard.css:577 |
| dl-row | renderer/dashboard.css:506; renderer/dashboard.css:513; renderer/dashboard.css:514 |
| dot-breathing | renderer/style.css:4214 |
| dot-pulse | renderer/style.css:4216 |
| dot-rapid | renderer/style.css:4215 |
| empty-state-icon | renderer/style.css:3867 |
| error-flash-overlay | renderer/style.css:3303 |
| esf-cam | renderer/students.css:1789; renderer/students.css:1797 |
| esf-cam__acts | renderer/students.css:1798; renderer/students.css:1799 |
| filter-tabs | renderer/style.css:1616 |
| flat | renderer/style.css:3422; renderer/style.css:4826 |
| form-error | renderer/style.css:1509 |
| ftab | renderer/style.css:432; renderer/style.css:1618; renderer/style.css:1630 (+4) |
| future-month | renderer/style.css:2423 |
| fw-800 | renderer/style.css:2086 |
| gap-12 | renderer/style.css:2094 |
| gap-16 | renderer/style.css:2095 |
| gap-8 | renderer/style.css:2093 |
| glass | renderer/style.css:3389; renderer/style.css:3396 |
| gold | renderer/style.css:1275; renderer/style.css:1296; renderer/style.css:4389 (+2) |
| has-data | renderer/style.css:2420; renderer/style.css:2421 |
| has-paid | renderer/style.css:2197; renderer/style.css:2199 |
| has-pending | renderer/style.css:2198; renderer/style.css:2199 |
| hdr-month-picker | renderer/chrome.css:479; renderer/chrome.css:484; renderer/chrome.css:487 (+7) |
| hdr-search | renderer/style.css:3547; renderer/style.css:3559; renderer/style.css:3565 (+1) |
| hdr-user__name | renderer/chrome.css:603 |
| hf-split | renderer/forms.css:241; renderer/forms.css:245 |
| hi-id__logo | renderer/settings.css:841 |
| inline-edit | renderer/style.css:1928; renderer/style.css:1941 |
| kpi-amt | renderer/style.css:5074 |
| kpi-bar | renderer/style.css:4748 |
| kpi-bar-fill | renderer/style.css:4755 |
| lk-btn__count | renderer/listkit.css:96 |
| lk-btn--on | renderer/listkit.css:95 |
| lk-range | renderer/listkit.css:101; renderer/listkit.css:103; renderer/listkit.css:107 (+1) |
| login-app-brand | renderer/style.css:2976 |
| login-app-name | renderer/style.css:2983; renderer/style.css:3002 |
| login-hint-box | renderer/style.css:3266; renderer/style.css:3276; renderer/style.css:3281 |
| login-input-wrap | renderer/style.css:3133 |
| login-logo-wrap | renderer/style.css:2949; renderer/style.css:2967 |
| login-system-label | renderer/style.css:3004 |
| login-warden-btn | renderer/style.css:3033; renderer/style.css:3045; renderer/style.css:3050 (+6) |
| login-warden-grid | renderer/style.css:3026 |
| login-warden-name | renderer/style.css:3094; renderer/style.css:3101; renderer/style.css:3105 |
| login-warden-photo | renderer/style.css:3068; renderer/style.css:3081; renderer/style.css:3088 |
| login-warden-role | renderer/style.css:3109 |
| mac-controls | renderer/style.css:3503 |
| mac-dot | renderer/style.css:3510; renderer/style.css:3517; renderer/style.css:3518 (+2) |
| ml-auto | renderer/style.css:2096 |
| modal-box | renderer/style.css:371 |
| modal-close | renderer/style.css:3760; renderer/style.css:3776 |
| modal-form--wide | renderer/forms.css:121; renderer/forms.css:175; renderer/forms.css:177 (+1) |
| mt-16 | renderer/style.css:2089 |
| mt-20 | renderer/style.css:2090 |
| mt-4 | renderer/style.css:2087 |
| mt-8 | renderer/style.css:2088 |
| nav-item--danger | renderer/chrome.css:273; renderer/style.css:851 |
| notif-badge | renderer/style.css:3530 |
| notif-bell | renderer/style.css:3523 |
| pay-act | renderer/payments.css:233; renderer/payments.css:238; renderer/payments.css:1115 (+2) |
| pay-acts | renderer/payments.css:232; renderer/payments.css:1143; renderer/payments.css:1269 |
| pay-charge__sub | renderer/payments.css:937; renderer/payments.css:958 |
| pay-chip | renderer/style.css:3884; renderer/style.css:3896; renderer/style.css:3903 (+7) |
| pay-meta__acts | renderer/payments.css:119 |
| pay-method | renderer/payments.css:1268 |
| pf-head | renderer/payments.css:276; renderer/payments.css:277; renderer/payments.css:278 |
| pf-sum | renderer/payments.css:865 |
| pf-sum__c | renderer/payments.css:870; renderer/payments.css:871 |
| pf-sum__i | renderer/payments.css:872 |
| pf-sum__l | renderer/payments.css:877 |
| pf-sum__v | renderer/payments.css:878 |
| pill--danger | renderer/components.css:44 |
| pill--info | renderer/components.css:45 |
| pill--outline | renderer/components.css:47; renderer/components.css:52; renderer/components.css:56 |
| pill--success | renderer/components.css:42 |
| pill--warning | renderer/components.css:43 |
| pm-bank | renderer/style.css:2135 |
| pm-cash | renderer/style.css:2132 |
| pm-cheque | renderer/style.css:2136 |
| pm-easypaisa | renderer/style.css:2134 |
| pm-jazzcash | renderer/style.css:2133 |
| progress-fill | renderer/style.css:1778; renderer/style.css:4798 |
| progress-label | renderer/style.css:1768 |
| progress-row | renderer/style.css:1766 |
| progress-track | renderer/style.css:1770; renderer/style.css:4792 |
| progress-value | renderer/style.css:1780 |
| purple | renderer/style.css:1280; renderer/style.css:1301; renderer/style.css:4394 (+2) |
| qa-icon | renderer/style.css:4860; renderer/style.css:4861 |
| quick-action-btn | renderer/style.css:4835; renderer/style.css:4852; renderer/style.css:4860 (+1) |
| quick-actions-grid | renderer/style.css:4829 |
| reports-stat-grid | renderer/style.css:1325; renderer/style.css:1332; renderer/style.css:1333 |
| room-card | renderer/style.css:1647; renderer/style.css:1658; renderer/style.css:1667 (+11) |
| room-meta | renderer/style.css:1700 |
| room-meta-row | renderer/style.css:1701; renderer/style.css:1702; renderer/style.css:1703 |
| room-num | renderer/style.css:1694 |
| room-occ-bar | renderer/style.css:1706 |
| room-rent | renderer/style.css:1704 |
| room-student-name | renderer/style.css:1716 |
| room-students | renderer/style.css:1710 |
| room-type | renderer/style.css:1695 |
| room-type-color | renderer/style.css:1926 |
| room-type-row | renderer/style.css:1915; renderer/style.css:4785 |
| row-added | renderer/style.css:3716 |
| row-overdue | renderer/style.css:3721; renderer/style.css:3725 |
| row-paid | renderer/style.css:3730 |
| rt-donut | renderer/dashboard.css:185; renderer/dashboard.css:189; renderer/dashboard.css:345 (+5) |
| rt-donut__c | renderer/dashboard.css:192 |
| rt-donut__l | renderer/dashboard.css:198; renderer/dashboard.css:736 |
| rt-donut__n | renderer/dashboard.css:196; renderer/dashboard.css:197; renderer/dashboard.css:734 (+1) |
| sb-cal-dot | renderer/style.css:2191; renderer/style.css:2197; renderer/style.css:2198 (+1) |
| sb-cal-header | renderer/style.css:2147 |
| sb-cal-mo | renderer/style.css:2178; renderer/style.css:2181 |
| sb-cal-month | renderer/style.css:2159; renderer/style.css:2171; renderer/style.css:2173 (+5) |
| sb-cal-months | renderer/style.css:2157 |
| sb-cal-title | renderer/style.css:2149 |
| sb-cal-yr | renderer/style.css:2189 |
| sb-calendar | renderer/style.css:2141 |
| sb-logo-badge | renderer/style.css:765 |
| sb-logo-divider | renderer/style.css:743; renderer/style.css:4872 |
| sb-logo-loc | renderer/style.css:755; renderer/style.css:763 |
| sb-logo-meta | renderer/style.css:749; renderer/style.css:4872 |
| sb-stat | renderer/style.css:428; renderer/style.css:786; renderer/style.css:795 (+4) |
| sb-stats | renderer/style.css:778 |
| sb-warden-avatar | renderer/style.css:3804; renderer/style.css:3818 |
| sb-warden-chip | renderer/style.css:3786; renderer/style.css:3799 |
| sb-warden-name | renderer/style.css:3824 |
| sb-warden-role | renderer/style.css:3834 |
| search-clear | renderer/style.css:1589; renderer/style.css:1605; renderer/style.css:1606 |
| search-icon | renderer/style.css:1608 |
| search-wrap | renderer/style.css:1586; renderer/style.css:1587 |
| seat-foot__acts | renderer/dashboard.css:995; renderer/dashboard.css:1515; renderer/dashboard.css:1630 (+1) |
| seat-foot__all | renderer/dashboard.css:2030; renderer/dashboard.css:2035; renderer/dashboard.css:2036 (+1) |
| set-actions | renderer/settings.css:97 |
| set-color | renderer/settings.css:186; renderer/settings.css:192; renderer/settings.css:196 |
| set-color__ch | renderer/settings.css:195 |
| set-color__hex | renderer/settings.css:194 |
| set-color__sw | renderer/settings.css:193 |
| set-grip | renderer/settings.css:129 |
| set-grip__sw | renderer/settings.css:137 |
| set-in--name | renderer/settings.css:150; renderer/settings.css:736 |
| set-money | renderer/settings.css:154; renderer/settings.css:155 |
| set-money__cur | renderer/settings.css:156 |
| settings-nav | renderer/style.css:1805; renderer/style.css:1813; renderer/style.css:1814 |
| settings-section | renderer/style.css:1863 |
| settings-section-title | renderer/style.css:1865 |
| settings-tab | renderer/style.css:446; renderer/style.css:1816; renderer/style.css:1833 (+5) |
| settings-topnav-wrap | renderer/style.css:1794; renderer/style.css:4693 |
| sf-drop | renderer/students.css:249; renderer/students.css:254; renderer/students.css:255 (+2) |
| sf-f--wide | renderer/students.css:281 |
| sf-foot | renderer/students.css:325 |
| sf-grid | renderer/students.css:278; renderer/students.css:1813; renderer/students.css:1814 |
| sf-grid--5 | renderer/students.css:279 |
| sf-head | renderer/students.css:240 |
| sf-idcard | renderer/students.css:259 |
| sf-idcard__l | renderer/students.css:264 |
| sf-idcard__note | renderer/students.css:260 |
| sf-idcard__v | renderer/students.css:265 |
| sf-photo | renderer/students.css:242; renderer/students.css:247 |
| sf-photo-acts | renderer/students.css:248 |
| sf-photo-block | renderer/students.css:241 |
| sf-total | renderer/students.css:316 |
| shimmer-card | renderer/style.css:4730; renderer/style.css:4734; renderer/style.css:4743 |
| sidebar__bottom | renderer/chrome.css:279; renderer/chrome.css:284; renderer/chrome.css:285 (+4) |
| skeleton-card | renderer/style.css:3855 |
| skeleton-text | renderer/style.css:3853 |
| skeleton-title | renderer/style.css:3854 |
| sortable | renderer/style.css:3733; renderer/style.css:3738; renderer/style.css:3739 (+1) |
| stat-bar | renderer/style.css:4442 |
| stat-bar-fill | renderer/style.css:4450 |
| stat-card | renderer/style.css:330; renderer/style.css:460; renderer/style.css:1252 (+43) |
| stat-card-ent | renderer/components.css:156; renderer/components.css:165 |
| stat-card-ent__header | renderer/components.css:209 |
| stat-card-ent__icon | renderer/components.css:170; renderer/components.css:180 |
| stat-card-ent__label | renderer/components.css:186 |
| stat-card-ent__progress | renderer/components.css:216; renderer/components.css:223 |
| stat-card-ent__progress-fill | renderer/components.css:228 |
| stat-card-ent__sublabel | renderer/components.css:204 |
| stat-card-ent__value | renderer/components.css:194 |
| stat-grid | renderer/style.css:1241; renderer/style.css:1249; renderer/style.css:1992 (+1) |
| stat-icon | renderer/style.css:1283; renderer/style.css:1294; renderer/style.css:1296 (+13) |
| stat-sub | renderer/style.css:1320 |
| stat-trend | renderer/style.css:3408; renderer/style.css:3420; renderer/style.css:3421 (+5) |
| stat-value | renderer/style.css:1312; renderer/style.css:1333; renderer/style.css:3403 (+3) |
| status-dot | renderer/style.css:4718; renderer/style.css:4724; renderer/style.css:4725 (+2) |
| stu-act | renderer/students.css:183; renderer/students.css:188; renderer/students.css:991 (+1) |
| stu-acts | renderer/students.css:182; renderer/students.css:990 |
| stu-bar | renderer/students.css:1004 |
| stu-charge__sub | renderer/students.css:543; renderer/students.css:961 |
| stu-id | renderer/students.css:137 |
| stu-money | renderer/students.css:174; renderer/students.css:175 |
| stu-pan__hrow | renderer/students.css:1550; renderer/students.css:1582; renderer/students.css:1586 (+3) |
| stu-pan__hwhen | renderer/students.css:1589 |
| stu-pan__tbl | renderer/students.css:1485; renderer/students.css:1486; renderer/students.css:1491 (+3) |
| stu-who__av | renderer/students.css:144; renderer/students.css:146 |
| stu-who__body | renderer/students.css:986 |
| success-flash-overlay | renderer/style.css:3293 |
| table-ent | renderer/components.css:277; renderer/components.css:283; renderer/components.css:295 (+3) |
| table-sticky | renderer/style.css:3708 |
| tag-remove | renderer/style.css:1899; renderer/style.css:1913 |
| teal | renderer/style.css:1279; renderer/style.css:1300; renderer/style.css:4393 (+2) |
| text-blue | renderer/style.css:2082 |
| text-mono | renderer/components.css:309; renderer/style.css:2084 |
| three-col | renderer/style.css:2099 |
| upcoming | renderer/style.css:2179 |
| user-chip | renderer/style.css:3579; renderer/style.css:3591 |
| user-chip-avatar | renderer/style.css:3596 |
| user-chip-name | renderer/style.css:3609 |
| usf-active | renderer/users.css:264; renderer/users.css:269; renderer/users.css:270 (+1) |
| usf-bulk | renderer/users.css:273 |
| usf-grps | renderer/users.css:279 |
| usf-photo__x | renderer/users.css:255; renderer/users.css:260 |
| usr-rail | renderer/users.css:64 |
| usr-rail__b | renderer/users.css:75; renderer/users.css:81 |
| usr-rail__h | renderer/users.css:65 |
| usr-rail__n | renderer/users.css:69 |
| usr-rail__s | renderer/users.css:70 |
| view-enter | renderer/style.css:3482; renderer/style.css:3487; renderer/style.css:3491 (+5) |
| warden-avatar-svg | renderer/style.css:3086 |
| yellow | renderer/style.css:3519 |

| Possibly dynamic class | Defined at |
|---|---|
| icon-box | renderer/style.css:4970; renderer/style.css:4991; renderer/style.css:4992 |
| icon-box-lg | renderer/style.css:4981; renderer/style.css:4985 |
| icon-box-md | renderer/style.css:4980; renderer/style.css:4984 |
| icon-box-sm | renderer/style.css:4979; renderer/style.css:4983 |
| icon-md | renderer/style.css:4962 |
| is-degraded | renderer/settings.css:964 |
| is-offline | renderer/settings.css:965 |
| is-online | renderer/settings.css:963 |
| is-unconfigured | renderer/settings.css:966 |
| licence-banner--error | renderer/style.css:5181 |
| licence-banner--info | renderer/style.css:5171 |
| licence-banner--warn | renderer/style.css:5176 |
| money-value--body | renderer/style.css:3700 |
| money-value--display | renderer/dashboard.css:307; renderer/style.css:3677; renderer/style.css:3693 |
| money-value--label | renderer/style.css:3701 |
| money-value--section | renderer/style.css:3699 |
| rpt-delta--down | renderer/reports.css:94 |
| rpt-delta--up | renderer/reports.css:93 |

### 13.8 Styles assigned from JavaScript — 354 operations

| Kind | Count | Locations |
|---|---|---|
| style.prop | 196 | renderer/app.js:449,450,509; renderer/src/auth-nev.js:501,502,544 (+7); renderer/src/enforcement-ui.js:121,175,178; renderer/src/license.js:114,130,133 (+7); renderer/src/modules/cancellations.js:708,785,800 (+1); +17 files |
| classList.add | 43 | renderer/app.js:506; renderer/src/auth-nev.js:508,514,528 (+1); renderer/src/modules/backup-page.js:176; renderer/src/modules/dashboard.js:741,2203; renderer/src/modules/modals.js:596,859,871; +11 files |
| classList.remove | 39 | renderer/app.js:499,501,529; renderer/src/auth-nev.js:513,527,529 (+2); renderer/src/modules/backup-page.js:177,497; renderer/src/modules/dashboard.js:726,2179; renderer/src/modules/modals.js:599,873; +11 files |
| className= | 36 | renderer/src/enforcement-ui.js:145,177,182 (+1); renderer/src/modules/command-palette.js:87; renderer/src/modules/dashboard.js:721,3126,3137 (+2); renderer/src/modules/modals.js:829; renderer/src/modules/onboarding.js:299; +8 files |
| classList.toggle | 31 | renderer/src/enforcement-ui.js:214; renderer/src/modules/dashboard.js:3439; renderer/src/modules/expenses.js:655; renderer/src/modules/issues.js:875,876,907 (+1); renderer/src/modules/nav.js:14,15,30 (+3); +9 files |
| cssText | 8 | renderer/src/auth-nev.js:744; renderer/src/license.js:59; renderer/src/modules/payments.js:1976,2223; renderer/src/modules/students.js:4646; renderer/license-settings.html:522; +1 files |
| setProperty | 1 | renderer/src/modules/theme.js:60 |

Inline style= attributes written inside JS template/string markup: 923; in HTML files: 30.

### 13.9 Naming conventions (all 2608 class names defined in CSS)

| Convention (rule used) | Classes | Share |
|---|---|---|
| BEM (__ or --) | 1097 | 42.1% |
| state/utility prefix (is-, has-, dh-, a-, js-, u-) | 96 | 3.7% |
| hyphenated (no BEM) | 1244 | 47.7% |
| single word | 171 | 6.6% |
| camelCase/other | 0 | 0% |

## 14. Text and labelling

### 14.1 Button labels — 485 <button> elements in markup (363 with visible text, 122 icon-only or computed), plus 12 menu-item labels

| Job | Labels used (count) | Total |
|---|---|---|
| save / submit / update / ok / done / confirm / apply | "Save" ×5, "Confirm" ×2, "Save Changes" ×2, "Save changes" ×1, "Done" ×1, "Save a copy" ×1, "Post payment" ×1, "save Save" ×1, "Post Notice" ×1, "Save Inspection" ×1, "Apply" ×1, "Apply to All Students" ×1, "OK" ×1, "Save add another" ×1, "Save as draft" ×1, "Save proceed to payment" ×1, "Submit request" ×1 | 23 |
| cancel / close / back / dismiss | "Cancel" ×38, "Close" ×16, "Cancel Seat" ×2, "close" ×1, "Back to Settings" ×1, "Back" ×1, "Back to Reports" ×1 | 60 |
| delete / remove | "Remove" ×7, "Delete" ×6, "Delete payment" ×3, "Delete Room" ×1, "Delete payment Reverse the collection first" ×1, "Delete user" ×1 | 19 |
| add / new / create | "+ Add Student" ×3, "Add" ×2, "+ Add" ×2, "Create download backup" ×1, "+ Add Cancellation" ×1, "Add to Cancellation List" ×1, "+ Add Fee Record" ×1, "+ Add Expense" ×1, "Add Category" ×1, "Add Issue" ×1, "Add these" ×1, "+ Add charge" ×1, "Add Room" ×1, "Add Rooms" ×1, "Add Fine" ×1, "Add room type" ×1, "Add a charge" ×1, "Add user" ×1 | 22 |
| edit / change / modify | "Edit" ×7, "Change" ×2, "Edit payment" ×1, "Edit Room" ×1, "Edit user" ×1 | 12 |
| export / download / print / save pdf | "Export Excel" ×8, "Export PDF" ×8, "Print" ×5, "Download" ×4, "Print receipt" ×3, "Export selected" ×2, "Download PDF" ×1, "Print this record" ×1, "Download JSON Backup" ×1, "print Print & Add Payment" ×1, "Print save" ×1, "Print / PDF" ×1, "Download Template (.xlsx)" ×1, "Download Template (.csv)" ×1, "Export" ×1, "Print Profile" ×1, "Print / Save PDF" ×1, "PDF" ×1, "print Print" ×1, "Download a copy now" ×1, "Excel workbook .xlsx — figures stay numbers" ×1, "PDF document A4, ready to print" ×1 | 46 |
| approve / accept | "Approve" ×3 | 3 |
| decline / reject | "Decline" ×4 | 4 |
| view / open / details | "View" ×6, "View all" ×2, "View dues" ×2, "View All" ×1, "View All ›" ×1, "View student" ×1, "View Details" ×1, "View All Reports" ×1, "Open the License tab" ×1, "View license agreement" ×1, "View Students" ×1, "Open student record" ×1, "View account" ×1 | 20 |
| reset / clear | "Reset" ×3, "Clear filters" ×2, "Clear" ×2, "Reset password" ×2, "Clear log" ×1, "Reset ( )" ×1, "Clear all filters" ×1, "Reset all to hostel default" ×1, "Reset to default" ×1, "Clear cache" ×1, "Clear all" ×1 | 16 |

| Label | Count | Case | Locations |
|---|---|---|---|
| Cancel | 38 | Sentence case (one word) | renderer/src/modules/backup-page.js:531; renderer/src/modules/cancellations.js:531,756,1059; renderer/src/modules/expenses.js:633,922; +9 files |
| Close | 16 | Sentence case (one word) | renderer/src/modules/archive.js:671,726; renderer/src/modules/backup-page.js:490; renderer/src/modules/dashboard.js:2290; +8 files |
| Export Excel | 8 | Title Case | renderer/src/modules/activitylog.js:145; renderer/src/modules/archive.js:214; renderer/src/modules/dashboard.js:3093; +2 files |
| Export PDF | 8 | Sentence case | renderer/src/modules/activitylog.js:146; renderer/src/modules/archive.js:215; renderer/src/modules/dashboard.js:3094; +2 files |
| Edit | 7 | Sentence case (one word) | renderer/src/modules/dashboard.js:2247; renderer/src/modules/rooms.js:190,218; renderer/src/modules/settings.js:1624; +1 files |
| Remove | 7 | Sentence case (one word) | renderer/src/modules/expenses.js:738; renderer/src/modules/onboarding.js:279; renderer/src/modules/settings.js:1762; +1 files |
| Delete | 6 | Sentence case (one word) | renderer/src/modules/cancellations.js:532; renderer/src/modules/expenses.js:924; renderer/src/modules/payments.js:3457,3458; +2 files |
| View | 6 | Sentence case (one word) | renderer/src/modules/dashboard.js:2246,2851; renderer/src/modules/expenses.js:737; renderer/src/modules/students.js:1526,1559,1561 |
| ✕ | 5 | none | renderer/src/modules/modals.js:553,755; renderer/src/modules/students.js:4305,4647,5263 |
| Print | 5 | Sentence case (one word) | renderer/app.js:118; renderer/src/modules/dashboard.js:1317; renderer/src/modules/rooms.js:312; +1 files |
| Save | 5 | Sentence case (one word) | renderer/src/modules/settings.js:535,1547; renderer/src/modules/support.js:299,499; renderer/src/modules/whatsapp.js:54 |
| Decline | 4 | Sentence case (one word) | renderer/src/modules/users.js:727,770,803 (+1) |
| Download | 4 | Sentence case (one word) | renderer/src/modules/students.js:1527,1560,1562 (+1) |
| + Add Student | 3 | Title Case | renderer/src/modules/dashboard.js:2256,2289; renderer/src/modules/students.js:209 |
| Approve | 3 | Sentence case (one word) | renderer/src/modules/users.js:726,769,934 |
| Mark paid | 3 | Sentence case | renderer/src/modules/dashboard.js:2097; renderer/src/modules/payments.js:687; renderer/src/modules/students.js:1676 |
| Reset | 3 | Sentence case (one word) | renderer/src/modules/settings.js:536; renderer/src/modules/users.js:220,491 |
| ' + ' | 2 | none | renderer/src/modules/students.js:1457; renderer/src/modules/whatsapp.js:123 |
| " alt="">` : ` Add logo `} | 2 | mixed | renderer/src/modules/onboarding.js:199; renderer/src/modules/settings.js:1630 |
| + Add | 2 | Sentence case (one word) | renderer/src/modules/payments.js:2190,3399 |
| ✏️ | 2 | none | renderer/src/modules/reports.js:250,252 |
| 🗑 | 2 | none | renderer/src/modules/reports.js:251,253 |
| Add | 2 | Sentence case (one word) | renderer/index.html:735; renderer/src/modules/settings.js:1266 |
| All | 2 | Sentence case (one word) | renderer/src/modules/support.js:345; renderer/src/modules/users.js:875 |
| Cancel Seat | 2 | Title Case | renderer/src/modules/students.js:1196,3261 |
| Change | 2 | Sentence case (one word) | renderer/src/modules/payments.js:1425,1502 |
| Choose another | 2 | Sentence case | renderer/src/modules/onboarding.js:280; renderer/src/modules/settings.js:1763 |
| Clear | 2 | Sentence case (one word) | renderer/src/modules/payments.js:688; renderer/src/modules/students.js:420 |
| Clear filters | 2 | Sentence case | renderer/src/modules/activitylog.js:199; renderer/src/modules/cancellations.js:332 |
| Confirm | 2 | Sentence case (one word) | renderer/src/modules/cancellations.js:1060; renderer/src/modules/modals.js:89 |
| Copy | 2 | Sentence case (one word) | renderer/license.html:392; renderer/src/modules/support.js:734 |
| Export selected | 2 | Sentence case | renderer/src/modules/payments.js:686; renderer/src/modules/students.js:419 |
| Print receipt | 2 | Sentence case | renderer/src/modules/dashboard.js:2093; renderer/src/modules/students.js:1679 |
| Rent only | 2 | Sentence case | renderer/src/modules/payments.js:2493,2660 |
| Restore | 2 | Sentence case (one word) | renderer/src/modules/backup-page.js:532; renderer/src/modules/former.js:182 |
| Save Changes | 2 | Title Case | renderer/src/modules/payments.js:3459; renderer/src/modules/rooms.js:974 |
| Student | 2 | Sentence case (one word) | renderer/src/modules/issues.js:765; renderer/src/modules/rooms.js:195 |
| Take photo | 2 | Sentence case | renderer/src/modules/students.js:2688,3734 |
| View all | 2 | Sentence case | renderer/src/modules/backup-page.js:295; renderer/src/modules/payments.js:2754 |
| View dues | 2 | Sentence case | renderer/src/modules/cancellations.js:454,866 |
| ' : '') + ' | 1 | none | renderer/src/toolbar.js:230 |
| ' + ' Web | 1 | Sentence case (one word) | renderer/src/modules/whatsapp.js:120 |
| ‹ | 1 | none | renderer/src/modules/modals.js:556 |
| › | 1 | none | renderer/src/modules/modals.js:561 |
| &minus; | 1 | lower case | renderer/src/modules/settings.js:391 |
| ` + ` Delete student | 1 | Sentence case | renderer/src/modules/students.js:1945 |
| ` + ` Edit student | 1 | Sentence case | renderer/src/modules/students.js:1942 |
| ` + ` View profile | 1 | Sentence case | renderer/src/modules/students.js:1940 |
| `:''} | 1 | none | renderer/src/modules/archive.js:250 |
| ← Back to Student | 1 | Title Case | renderer/src/receipt.js:349 |
| + | 1 | none | renderer/src/modules/settings.js:395 |
| + Add Cancellation | 1 | Title Case | renderer/src/modules/cancellations.js:331 |
| + Add charge | 1 | Sentence case | renderer/src/modules/payments.js:2635 |
| + Add Expense | 1 | Title Case | renderer/src/modules/dashboard.js:3085 |
| + Add Fee Record | 1 | Title Case | renderer/src/modules/dashboard.js:3073 |
| + Student | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:2904 |
| = 28 ? 'disabled' : ''}>+ | 1 | lower case | renderer/src/modules/settings.js:3755 |
| = pages ? 'disabled' : ''} onclick="alGo( )"> | 1 | mixed | renderer/src/modules/activitylog.js:340 |
| =cap?'rms-force':'rms-add'}" onclick="showAddStudentModal('  | 1 | mixed | renderer/src/modules/rooms.js:219 |
| − | 1 | none | renderer/src/modules/settings.js:3752 |
| ✅ Import Students | 1 | Title Case | renderer/src/modules/settings.js:3512 |
| ✓ Collect | 1 | Sentence case (one word) | renderer/src/modules/reports.js:134 |
| ✕ Clear | 1 | Sentence case (one word) | renderer/src/modules/reports.js:200 |
| 📄 Save PDF | 1 | Sentence case | renderer/src/receipt.js:353 |
| 🔑 Activate License | 1 | Title Case | renderer/src/license.js:119 |
| 6 Months | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:1197 |
| Activate License | 1 | Title Case | renderer/license.html:423 |
| Add a charge | 1 | Sentence case | renderer/src/modules/students.js:4586 |
| Add Category | 1 | Title Case | renderer/src/modules/expenses.js:634 |
| Add Fine | 1 | Title Case | renderer/src/modules/settings.js:96 |
| Add Issue | 1 | Title Case | renderer/src/modules/issues.js:522 |
| Add Room | 1 | Title Case | renderer/src/modules/rooms.js:676 |
| Add room type | 1 | Sentence case | renderer/src/modules/settings.js:424 |
| Add Rooms | 1 | Title Case | renderer/src/modules/rooms.js:843 |
| Add these | 1 | Sentence case | renderer/src/modules/onboarding.js:397 |
| Add to Cancellation List | 1 | Title Case | renderer/src/modules/cancellations.js:757 |
| Add user | 1 | Sentence case | renderer/src/modules/users.js:180 |
| Advanced Filters `:''} | 1 | Title Case | renderer/src/modules/students.js:373 |
| All guides | 1 | Sentence case | renderer/src/modules/support.js:397 |
| All Issues ( ) | 1 | Title Case | renderer/src/modules/issues.js:449 |
| All Payments PDF | 1 | Title Case | renderer/src/modules/reports.js:992 |
| All Students PDF | 1 | Title Case | renderer/src/modules/reports.js:990 |
| Apply | 1 | Sentence case (one word) | renderer/src/modules/settings.js:476 |
| Apply to All Students | 1 | Title Case | renderer/src/modules/settings.js:586 |
| Attach | 1 | Sentence case (one word) | renderer/src/modules/students.js:1529 |
| Attach another document | 1 | Sentence case | renderer/src/modules/students.js:1565 |
| Audit log | 1 | Sentence case | renderer/src/modules/users.js:183 |
| Back | 1 | Sentence case (one word) | renderer/src/modules/onboarding.js:149 |
| Back to Reports | 1 | Title Case | renderer/src/modules/reports.js:954 |
| Back to Settings | 1 | Title Case | renderer/license-settings.html:256 |
| Bulk Add | 1 | Title Case | renderer/src/modules/rooms.js:306 |
| Category | 1 | Sentence case (one word) | renderer/src/modules/expenses.js:481 |
| Check again | 1 | Sentence case | renderer/src/modules/settings.js:2155 |
| Choose file | 1 | Sentence case | renderer/src/modules/expenses.js:724 |
| Clear all | 1 | Sentence case | renderer/src/toolbar.js:146 |
| Clear all filters | 1 | Sentence case | renderer/src/modules/issues.js:523 |
| Clear cache | 1 | Sentence case | renderer/src/modules/settings.js:1688 |
| Clear log | 1 | Sentence case | renderer/src/modules/activitylog.js:147 |
| close | 1 | lower case | renderer/index.html:686 |
| Collect all | 1 | Sentence case | renderer/src/modules/payments.js:1655 |
| Complaint | 1 | Sentence case (one word) | renderer/src/modules/issues.js:835 |
| Complaints ( open) | 1 | Sentence case | renderer/src/modules/issues.js:455 |
| Concession | 1 | Sentence case (one word) | renderer/src/modules/students.js:895 |
| Continue | 1 | Sentence case (one word) | renderer/src/modules/onboarding.js:152 |
| Copy license key | 1 | Sentence case | renderer/src/modules/settings.js:2425 |
| Copy Machine ID | 1 | Title Case | renderer/src/modules/settings.js:2426 |
| Copy to clipboard | 1 | Sentence case | renderer/src/modules/backup-page.js:160 |
| Copy to Clipboard | 1 | Title Case | renderer/src/modules/modals.js:163 |
| Create download backup | 1 | Sentence case | renderer/src/modules/backup-page.js:158 |
| Custom Range | 1 | Title Case | renderer/src/modules/reports.js:934 |
| Database health | 1 | Sentence case | renderer/src/modules/settings.js:1686 |
| Deactivate | 1 | Sentence case (one word) | renderer/license-settings.html:331 |
| Delete payment | 1 | Sentence case | renderer/src/modules/students.js:1688 |
| Delete payment Reverse the collection first | 1 | mixed | renderer/src/modules/students.js:1686 |
| Delete Room | 1 | Title Case | renderer/src/modules/rooms.js:972 |
| Done | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:3095 |
| Download a copy now | 1 | Sentence case | renderer/src/storage.js:215 |
| Download JSON Backup | 1 | Title Case | renderer/src/modules/modals.js:160 |
| Download PDF | 1 | Sentence case | renderer/app.js:116 |
| Download Template (.csv) | 1 | mixed | renderer/src/modules/settings.js:857 |
| Download Template (.xlsx) | 1 | mixed | renderer/src/modules/settings.js:856 |
| Edit payment | 1 | Sentence case | renderer/src/modules/dashboard.js:2095 |
| Edit Room | 1 | Title Case | renderer/src/modules/rooms.js:513 |
| Excel workbook .xlsx — figures stay numbers | 1 | Sentence case | renderer/src/toolbar.js:83 |
| Expand | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:1313 |
| Expenses ( ) | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:3058 |
| Export | 1 | Sentence case (one word) | renderer/src/modules/settings.js:2378 |
| Fee Records ( ) | 1 | Title Case | renderer/src/modules/dashboard.js:3057 |
| Filters `:''} | 1 | Sentence case (one word) | renderer/src/modules/payments.js:628 |
| Flag discrepancy | 1 | Sentence case | renderer/src/modules/users.js:933 |
| Force Add | 1 | Title Case | renderer/src/modules/rooms.js:192 |
| Forgot Password? | 1 | Title Case | renderer/index.html:262 |
| Full 0 | 1 | Sentence case (one word) | renderer/src/modules/payments.js:2658 |
| Full Reset | 1 | Title Case | renderer/license-settings.html:342 |
| Full Room Details | 1 | Title Case | renderer/src/modules/dashboard.js:2288 |
| Generate Month | 1 | Title Case | renderer/src/modules/payments.js:660 |
| Generate PDF | 1 | Sentence case | renderer/src/modules/students.js:4817 |
| Guide | 1 | Sentence case (one word) | renderer/src/modules/settings.js:2386 |
| Half | 1 | Sentence case (one word) | renderer/src/modules/payments.js:2659 |
| Hand over cash | 1 | Sentence case | renderer/src/modules/users.js:449 |
| Import | 1 | Sentence case (one word) | renderer/src/modules/users.js:184 |
| Logout | 1 | Sentence case (one word) | renderer/index.html:643 |
| Maintenance | 1 | Sentence case (one word) | renderer/src/modules/issues.js:833 |
| Maintenance ( active) | 1 | Sentence case | renderer/src/modules/issues.js:452 |
| Manage storage | 1 | Sentence case | renderer/src/modules/settings.js:1677 |
| Mark Resolved | 1 | Title Case | renderer/src/modules/issues.js:1044 |
| Matches | 1 | Sentence case (one word) | renderer/src/modules/users.js:912 |
| Month | 1 | Sentence case (one word) | renderer/src/modules/reports.js:932 |
| Move Room | 1 | Title Case | renderer/src/modules/students.js:1187 |
| Move student | 1 | Sentence case | renderer/src/modules/students.js:4160 |
| My Account | 1 | Title Case | renderer/index.html:636 |
| Notify Now | 1 | Title Case | renderer/src/modules/whatsapp.js:38 |
| OK | 1 | ALL CAPS | renderer/src/modules/settings.js:3590 |
| Open the License tab | 1 | mixed | renderer/src/modules/settings.js:1698 |
| Payment | 1 | Sentence case (one word) | renderer/src/modules/students.js:1191 |
| payments Add Payment | 1 | mixed | renderer/src/modules/payments.js:2212 |
| PDF | 1 | ALL CAPS | renderer/src/modules/users.js:586 |
| PDF document A4, ready to print | 1 | mixed | renderer/src/toolbar.js:87 |
| Post Notice | 1 | Title Case | renderer/src/modules/settings.js:69 |
| Post payment | 1 | Sentence case | renderer/src/modules/payments.js:2778 |
| Prepare Uninstall | 1 | Title Case | renderer/license-settings.html:353 |
| Preview data | 1 | Sentence case | renderer/src/modules/backup-page.js:159 |
| Print / PDF | 1 | Sentence case | renderer/src/modules/reports.js:997 |
| Print / Save PDF | 1 | Title Case | renderer/src/modules/students.js:5084 |
| print Print | 1 | mixed | renderer/src/receipt.js:354 |
| print Print & Add Payment | 1 | mixed | renderer/src/modules/payments.js:2212 |
| Print Profile | 1 | Title Case | renderer/src/modules/students.js:1125 |
| Print save | 1 | Sentence case | renderer/src/modules/payments.js:2775 |
| Print this record | 1 | Sentence case | renderer/src/modules/archive.js:727 |
| Quarter | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:1196 |
| Re-admit student | 1 | Sentence case | renderer/src/modules/students.js:4634 |
| Rebuild index | 1 | Sentence case | renderer/src/modules/settings.js:1687 |
| Reminders | 1 | Sentence case (one word) | renderer/src/modules/payments.js:664 |
| Rename | 1 | Sentence case (one word) | renderer/src/modules/settings.js:1094 |
| Rent + mess | 1 | Sentence case | renderer/src/modules/payments.js:2492 |
| Reset ( ) | 1 | Sentence case (one word) | renderer/src/modules/former.js:246 |
| Reset all to hostel default | 1 | Sentence case | renderer/src/modules/settings.js:603 |
| Reset password | 1 | Sentence case | renderer/src/modules/users.js:1440 |
| Reset to default | 1 | Sentence case | renderer/src/modules/settings.js:1583 |
| Restore Data from File | 1 | Title Case | renderer/src/modules/modals.js:187 |
| Restore from Pasted JSON | 1 | Title Case | renderer/src/modules/modals.js:194 |
| Restore from pasted text | 1 | Sentence case | renderer/src/modules/backup-page.js:188 |
| Restore Student | 1 | Title Case | renderer/src/modules/students.js:4364 |
| Restore this file | 1 | Sentence case | renderer/src/modules/backup-page.js:187 |
| Reverse | 1 | Sentence case (one word) | renderer/src/modules/payments.js:3662 |
| Review | 1 | Sentence case (one word) | renderer/src/modules/users.js:688 |
| Run the setup guide | 1 | Sentence case | renderer/src/modules/settings.js:840 |
| Save a copy | 1 | Sentence case | renderer/src/modules/expenses.js:813 |
| Save add another | 1 | Sentence case | renderer/src/modules/students.js:2889 |
| Save as draft | 1 | Sentence case | renderer/src/modules/students.js:2892 |
| Save changes | 1 | Sentence case | renderer/src/modules/cancellations.js:533 |
| Save Inspection | 1 | Title Case | renderer/src/modules/settings.js:228 |
| Save proceed to payment | 1 | Sentence case | renderer/src/modules/students.js:2895 |
| save Save | 1 | mixed | renderer/src/modules/reports.js:1467 |
| Send | 1 | Sentence case (one word) | renderer/src/modules/users.js:635 |
| Send again | 1 | Sentence case | renderer/src/modules/support.js:498 |
| Send Rent Reminder ( pending) | 1 | mixed | renderer/src/modules/dashboard.js:1452 |
| Set password | 1 | Sentence case | renderer/src/modules/users.js:1640 |
| Set them now | 1 | Sentence case | renderer/src/modules/support.js:769 |
| Shift Room | 1 | Title Case | renderer/src/modules/students.js:3259 |
| Show every month | 1 | Sentence case | renderer/src/modules/students.js:219 |
| Sign In | 1 | Title Case | renderer/index.html:280 |
| Sign in as user | 1 | Sentence case | renderer/src/modules/users.js:1441 |
| Skip for now | 1 | Sentence case | renderer/src/modules/onboarding.js:138 |
| Staff | 1 | Sentence case (one word) | renderer/src/modules/issues.js:767 |
| Start using | 1 | Sentence case | renderer/src/modules/onboarding.js:151 |
| stroke-linecap="round"> ' + 'Record a payment | 1 | mixed | renderer/src/modules/students.js:1495 |
| Students ( ) | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:3056 |
| Submit request | 1 | Sentence case | renderer/src/modules/support.js:670 |
| System logs | 1 | Sentence case | renderer/src/modules/settings.js:1685 |
| Take back | 1 | Sentence case | renderer/src/modules/users.js:585 |
| This Year | 1 | Title Case | renderer/src/modules/reports.js:933 |
| Tidy up rooms | 1 | Sentence case | renderer/src/modules/settings.js:495 |
| Today | 1 | Sentence case (one word) | renderer/index.html:445 |
| Try saving again | 1 | Sentence case | renderer/src/storage.js:214 |
| Upload Import File | 1 | Title Case | renderer/src/modules/settings.js:859 |
| Upload photo | 1 | Sentence case | renderer/src/modules/students.js:3731 |
| View All | 1 | Title Case | renderer/src/modules/dashboard.js:1419 |
| View All › | 1 | Title Case | renderer/src/modules/dashboard.js:2072 |
| View All Reports | 1 | Title Case | renderer/src/modules/reports.js:1272 |
| View Details | 1 | Title Case | renderer/src/modules/reports.js:1184 |
| View license agreement | 1 | Sentence case | renderer/src/modules/settings.js:2427 |
| View student | 1 | Sentence case | renderer/src/modules/dashboard.js:2092 |
| View Students | 1 | Title Case | renderer/src/modules/whatsapp.js:69 |
| WhatsApp | 1 | mixed | renderer/src/modules/whatsapp.js:119 |
| Year | 1 | Sentence case (one word) | renderer/src/modules/dashboard.js:1198 |

### 14.2 Case style counts

| Element | Total | Sentence case | One word (capitalised) | Title Case | ALL CAPS (in source) | lower case | mixed | no letters |
|---|---|---|---|---|---|---|---|---|
| buttons | 363 | 96 | 160 | 69 | 2 | 3 | 16 | 17 |
| headings (markup) | 13 | 8 | 1 | 2 | 1 | 0 | 1 | 0 |
| labels | 150 | 65 | 54 | 29 | 0 | 0 | 2 | 0 |
| table headers | 346 | 21 | 281 | 33 | 2 | 0 | 1 | 8 |
| menu items | 12 | 11 | 0 | 1 | 0 | 0 | 0 | 0 |

Text rendered in capitals by CSS regardless of source case: 156 `text-transform: uppercase` declarations (§1.6) — e.g. .al-raw__h ; .arc-bar__lbl ; .arc-kpi__l ; .arc-table th ; .arc-grand__l ; .arc-sd-k__l ; .arc-sd-sec ; #sidebar .sb-section ; .stat-card-ent__label ; .card-ent__title ; .table-ent th ; .dash-kpi__label.

### 14.3 Empty-state messages — 220

| Message | Location |
|---|---|
| Looking for backups… | renderer/recovery.html:74 |
| No backups were found next to the database. | renderer/recovery.html:166 |
| Backups could not be listed. | renderer/recovery.html:204 |
| Nothing logged yet | renderer/src/modules/activitylog.js:277 |
| Nothing logged yet | renderer/src/modules/activitylog.js:284 |
|  | renderer/src/modules/archive.js:180 |
| Nobody was on the roster in this period. | renderer/src/modules/archive.js:550 |
| Nothing was spent in this period. | renderer/src/modules/archive.js:600 |
| No cancellations were raised in this period. | renderer/src/modules/archive.js:652 |
| This student record is no longer on file. | renderer/src/modules/archive.js:670 |
| No payment records for this period. | renderer/src/modules/archive.js:701 |
| Nothing recorded yet | renderer/src/modules/backup-page.js:299 |
| Nothing recorded yet | renderer/src/modules/backup-page.js:327 |
|  | renderer/src/modules/cancellations.js:326 |
| No students found | renderer/src/modules/cancellations.js:784 |
| No payment records for this student. | renderer/src/modules/cancellations.js:1036 |
| No matches | renderer/src/modules/command-palette.js:63 |
| not enough history yet | renderer/src/modules/dashboard.js:362 |
| No collections yet | renderer/src/modules/dashboard.js:1921 |
| — Vacant — | renderer/src/modules/dashboard.js:2382 |
| No comparison | renderer/src/modules/expenses.js:398 |
|  | renderer/src/modules/expenses.js:538 |
|  | renderer/src/modules/issues.js:511 |
| All clear — nothing needs attention. | renderer/src/modules/nav.js:739 |
| No payment records match these filters. | renderer/src/modules/payments.js:720 |
| Nothing outstanding from earlier months | renderer/src/modules/payments.js:2679 |
| Pick a student to see their history | renderer/src/modules/payments.js:2757 |
| Pick a student to see their history | renderer/src/modules/payments.js:2957 |
| No ledger entries yet | renderer/src/modules/payments.js:2959 |
|  | renderer/src/modules/payments.js:3376 |
| Pick a start and end month above to build the report. | renderer/src/modules/reports.js:1045 |
| Nothing recorded in this period yet. | renderer/src/modules/reports.js:1122 |
| No payments collected in this period. | renderer/src/modules/reports.js:1157 |
| No expenses recorded in this period. | renderer/src/modules/reports.js:1193 |
| No expenses recorded in this period. | renderer/src/modules/reports.js:1208 |
| No room types configured. | renderer/src/modules/reports.js:1227 |
|  | renderer/src/modules/rooms.js:337 |
| No room types yet | renderer/src/modules/settings.js:437 |
| No room types yet | renderer/src/modules/settings.js:578 |
| Add one under Room Types first. | renderer/src/modules/settings.js:579 |
| No active students | renderer/src/modules/settings.js:627 |
| Admit a student and their charges will be editable here. | renderer/src/modules/settings.js:628 |
| Nothing here yet | renderer/src/modules/settings.js:1158 |
|  | renderer/src/modules/students.js:205 |
|  | renderer/src/modules/students.js:215 |
| No students match these filters. | renderer/src/modules/students.js:515 |
| No room assigned | renderer/src/modules/students.js:1153 |
| No payment records yet | renderer/src/modules/students.js:1489 |
| No room changes recorded for this student. | renderer/src/modules/students.js:1912 |
|  | renderer/src/modules/students.js:2587 |
| No room assigned | renderer/src/modules/students.js:3171 |
| No payment records yet | renderer/src/modules/students.js:3225 |
| No payment records for this resident yet. | renderer/src/modules/students.js:3661 |
| No description was written. | renderer/src/modules/support.js:484 |
|  | renderer/src/modules/support.js:700 |
| Nothing raised yet | renderer/src/modules/support.js:701 |
| Requests you submit above are kept here, with their reference and status, whether or not they have been sent. | renderer/src/modules/support.js:702 |
|  | renderer/src/modules/support.js:766 |
| No support contact is set yet | renderer/src/modules/support.js:767 |
| Whoever installed Hostyllo here can add the number and email this hostel should reach. Requests you raise are still kept until then. | renderer/src/modules/support.js:768 |
| No account matches those filters | renderer/src/modules/users.js:255 |
| Nothing matches those filters | renderer/src/modules/users.js:502 |
| No collections yet | renderer/src/modules/users.js:505 |
| Money you collect from now on appears here, newest first. | renderer/src/modules/users.js:506 |
| Nothing is waiting for approval. | renderer/src/modules/users.js:693 |
| No mess exemption requests are waiting. | renderer/src/modules/users.js:710 |
| No concession requests are waiting. | renderer/src/modules/users.js:749 |
| Nothing collected by this account since the ledger started. | renderer/src/modules/users.js:1287 |
| All rents collected | renderer/src/modules/whatsapp.js:79 |
| Nobody has an outstanding balance right now. | renderer/src/modules/whatsapp.js:80 |
| No internet needed, ever | renderer/index.html:155 |
| No active license was found on this machine. Enter a key in the main window to activate. | renderer/license-settings.html:459 |
| No license found | renderer/license-settings.html:481 |
| No internet required | renderer/license.html:440 |
| No records match the selected scope. | renderer/src/export/engine.js:475 |
| No records match the selected scope. | renderer/src/export/engine.js:876 |
| No vacate date, so there is nothing to pro-rate. | renderer/src/finance.js:562 |
| No refund for a part month | renderer/src/finance.js:613 |
| No activity recorded yet | renderer/src/modules/activitylog.js:204 |
| No further detail was recorded. | renderer/src/modules/activitylog.js:363 |
| No activity matched this view. | renderer/src/modules/activitylog.js:445 |
| No archived records yet | renderer/src/modules/archive.js:182 |
| No payments in this period. | renderer/src/modules/archive.js:587 |
| No room | renderer/src/modules/archive.js:688 |
| No payments in this period. | renderer/src/modules/archive.js:829 |
| No cancellations were raised in this period. | renderer/src/modules/archive.js:890 |
| No records were held in this period. | renderer/src/modules/archive.js:908 |
| No payment records for this period. | renderer/src/modules/archive.js:957 |
| No payment or expense was recorded in | renderer/src/modules/archive.js:1051 |
| No backup taken | renderer/src/modules/backup-page.js:72 |
| No cancellations yet | renderer/src/modules/cancellations.js:328 |
| No active students available to cancel | renderer/src/modules/cancellations.js:665 |
| No room | renderer/src/modules/cancellations.js:790 |
| No room assigned | renderer/src/modules/cancellations.js:813 |
| No cancellations match the selected scope. | renderer/src/modules/cancellations.js:1311 |
| No cancellation records to export | renderer/src/modules/cancellations.js:1317 |
| No cancellation records to export | renderer/src/modules/cancellations.js:1323 |
| No payments recorded for | renderer/src/modules/dashboard.js:1922 |
| No payments yet | renderer/src/modules/dashboard.js:2079 |
| No records | renderer/src/modules/dashboard.js:2149 |
| No phone | renderer/src/modules/dashboard.js:2242 |
| No seats available | renderer/src/modules/dashboard.js:2603 |
| No rooms have been created yet. Add them from the Rooms page, | renderer/src/modules/dashboard.js:2640 |
| No vacant rooms | renderer/src/modules/dashboard.js:2675 |
| No occupied rooms | renderer/src/modules/dashboard.js:2696 |
| No phone | renderer/src/modules/dashboard.js:2714 |
| No active students | renderer/src/modules/dashboard.js:2723 |
| No phone | renderer/src/modules/dashboard.js:2732 |
| No money has been received in ${escHtml(label)} yet. | renderer/src/modules/dashboard.js:2833 |
| No occupied rooms | renderer/src/modules/dashboard.js:2880 |
| No vacant seats available | renderer/src/modules/dashboard.js:2934 |
| No students found | renderer/src/modules/dashboard.js:3065 |
| No fee records | renderer/src/modules/dashboard.js:3077 |
| No expense records | renderer/src/modules/dashboard.js:3089 |
| No payment records in this month. | renderer/src/modules/dashboard.js:3266 |
| No data yet | renderer/src/modules/dashboard.js:3545 |
| No results for | renderer/src/modules/dashboard.js:3859 |
| No expenses match the selected filters. | renderer/src/modules/expenses.js:298 |
| No expenses to export | renderer/src/modules/expenses.js:304 |
| No expenses to export | renderer/src/modules/expenses.js:310 |
| No previous period to compare against | renderer/src/modules/expenses.js:398 |
| No expenses match these filters. | renderer/src/modules/expenses.js:540 |
| No records | renderer/src/modules/former.js:174 |
| No former student matches these filters | renderer/src/modules/former.js:273 |
| No former students match the selected filters. | renderer/src/modules/former.js:401 |
| No complaints or maintenance records match the selected filters. | renderer/src/modules/issues.js:275 |
| No issues logged yet | renderer/src/modules/issues.js:513 |
| No backup has been exported yet | renderer/src/modules/modals.js:169 |
| No access | renderer/src/modules/modals.js:930 |
| No user accounts are configured. | renderer/src/modules/modals.js:975 |
| No charge recorded on this payment | renderer/src/modules/payments.js:269 |
| No longer on the roster | renderer/src/modules/payments.js:746 |
| No records | renderer/src/modules/payments.js:864 |
| No payment records match the selected filters. | renderer/src/modules/payments.js:1155 |
| No payment records to export | renderer/src/modules/payments.js:1176 |
| No payments to export | renderer/src/modules/payments.js:1185 |
| No payments to export | renderer/src/modules/payments.js:1191 |
| No registered student found | renderer/src/modules/payments.js:1366 |
| No phone | renderer/src/modules/payments.js:1385 |
| No charge set | renderer/src/modules/payments.js:2062 |
| No paid transactions this period | renderer/src/modules/reports.js:81 |
| No transactions | renderer/src/modules/reports.js:165 |
| No students found | renderer/src/modules/reports.js:211 |
| No expenses this period | renderer/src/modules/reports.js:291 |
| No paid transactions | renderer/src/modules/reports.js:310 |
| No change | renderer/src/modules/reports.js:653 |
| No change | renderer/src/modules/reports.js:659 |
| No records entered yet | renderer/src/modules/reports.js:689 |
| No payment records in this period. | renderer/src/modules/reports.js:1619 |
| No money moved in this period. | renderer/src/modules/reports.js:1696 |
| No rooms are recorded. | renderer/src/modules/reports.js:1771 |
| No payment records in this period. | renderer/src/modules/reports.js:1905 |
| No departures were filed in this period. | renderer/src/modules/reports.js:1934 |
| No issues were raised in this period. | renderer/src/modules/reports.js:1942 |
| No rooms are recorded. | renderer/src/modules/reports.js:1960 |
| No records in this period. | renderer/src/modules/reports.js:1964 |
| No rooms match these filters. | renderer/src/modules/rooms.js:339 |
| No rooms match the selected filters. | renderer/src/modules/rooms.js:478 |
| No rooms to export | renderer/src/modules/rooms.js:484 |
| No rooms to export | renderer/src/modules/rooms.js:490 |
| No one is on a custom rate right now. | renderer/src/modules/settings.js:614 |
| No tagline set | renderer/src/modules/settings.js:1643 |
| No location set | renderer/src/modules/settings.js:1648 |
| No phone recorded | renderer/src/modules/settings.js:1649 |
| No email recorded | renderer/src/modules/settings.js:1650 |
| No tagline set | renderer/src/modules/settings.js:1850 |
| No location set | renderer/src/modules/settings.js:1851 |
| No phone recorded | renderer/src/modules/settings.js:1852 |
| No email recorded | renderer/src/modules/settings.js:1853 |
| No online services in this build | renderer/src/modules/settings.js:2085 |
| No status reported. | renderer/src/modules/settings.js:2102 |
| No online services are configured | renderer/src/modules/settings.js:2113 |
| No connection to Hostyllo services | renderer/src/modules/settings.js:2116 |
| No licence agreement ships with this build. The terms are the ones your provider gave you. | renderer/src/modules/settings.js:2427 |
| No valid rows found. Check the errors below. | renderer/src/modules/settings.js:3454 |
| No rows could be imported | renderer/src/modules/settings.js:3587 |
| No refund | renderer/src/modules/settings.js:3743 |
| No cut-off — the rule applies whenever they leave. | renderer/src/modules/settings.js:3759 |
| No payment records for this student yet | renderer/src/modules/students.js:183 |
| No charge configured | renderer/src/modules/students.js:598 |
| No students | renderer/src/modules/students.js:662 |
| No document to download | renderer/src/modules/students.js:1728 |
| No document to open | renderer/src/modules/students.js:1767 |
| No document to open | renderer/src/modules/students.js:1770 |
| No room assigned | renderer/src/modules/students.js:1886 |
| No students match the selected filters. | renderer/src/modules/students.js:2240 |
| No students to export | renderer/src/modules/students.js:2262 |
| No students to export | renderer/src/modules/students.js:2271 |
| No students to export | renderer/src/modules/students.js:2277 |
| No rent set | renderer/src/modules/students.js:2843 |
| No rooms configured | renderer/src/modules/students.js:2845 |
| No other rooms have available capacity right now. | renderer/src/modules/students.js:4056 |
| No room assigned | renderer/src/modules/students.js:4117 |
| No former students found | renderer/src/modules/students.js:4328 |
| No history | renderer/src/modules/students.js:4336 |
| No payment records | renderer/src/modules/students.js:4359 |
| No contact recorded | renderer/src/modules/students.js:4479 |
| No rent set for this room type | renderer/src/modules/students.js:5220 |
| No amount paid — auto-pending record created | renderer/src/modules/students.js:5240 |
| No support contact is set for this installation yet — the request is saved | renderer/src/modules/support.js:264 |
| No priority line is set for this installation yet. | renderer/src/modules/support.js:789 |
| No access | renderer/src/modules/users.js:93 |
| No difference | renderer/src/modules/users.js:949 |
| No notes. | renderer/src/modules/users.js:1083 |
| No collections match the selected filters. | renderer/src/modules/users.js:1333 |
| No accounts have collections. | renderer/src/modules/users.js:1373 |
| No phone number on record | renderer/src/modules/whatsapp.js:114 |
| No number | renderer/src/modules/whatsapp.js:122 |
| No phone number on | renderer/src/modules/whatsapp.js:220 |
| No phone on record. Add a number to the student profile or set Default WA Number in Settings → Hostel Info. | renderer/src/receipt.js:485 |
| No photo | renderer/src/utils.js:578 |
| No rent configured — set it in Settings → Rent &amp; Mess | renderer/src/utils.js:661 |
| No data to export | renderer/src/utils.js:857 |
| No database path is known. | main.js:441 |
| No license found on this device. Please activate your license to continue. | main.js:708 |
| No main window | main.js:1382 |
| No main window | main.js:1410 |
| No main window | main.js:1440 |
| No main window | main.js:1494 |
| No window | main.js:1774 |

### 14.4 Error messages (toast type 'error') — 180 (of 391 toast calls)

| Message | Location |
|---|---|
| ⚠️ Allow popups for this app to open PDFs. | renderer/app.js:196 |
| One or more accounts are still using their default password.  | renderer/src/auth-nev.js:462 |
| Your account does not have permission to:  | renderer/src/auth-nev.js:682 |
| Not available in dev mode. | renderer/src/license.js:216 |
| Failed:  | renderer/src/license.js:225 |
| Error communicating with app. Please restart. | renderer/src/license.js:228 |
| The backup could not be created | renderer/src/modules/backup-page.js:441 |
| Only .json backup files can be restored | renderer/src/modules/backup-page.js:500 |
| That file could not be read — use Choose file instead | renderer/src/modules/backup-page.js:508 |
| Student not found | renderer/src/modules/cancellations.js:654 |
| … is already on the cancellation list | renderer/src/modules/cancellations.js:656 |
| … is … — there is no seat to cancel | renderer/src/modules/cancellations.js:659 |
| No active students available to cancel | renderer/src/modules/cancellations.js:665 |
| Please select a student | renderer/src/modules/cancellations.js:919 |
| Student not found | renderer/src/modules/cancellations.js:921 |
| No cancellation records to export | renderer/src/modules/cancellations.js:1317 |
| No cancellation records to export | renderer/src/modules/cancellations.js:1323 |
| That action is unavailable | renderer/src/modules/dashboard.js:2218 |
| No expenses to export | renderer/src/modules/expenses.js:304 |
| No expenses to export | renderer/src/modules/expenses.js:310 |
| Could not save the category — nothing was changed | renderer/src/modules/expenses.js:672 |
| Attach an image or a PDF of the bill | renderer/src/modules/expenses.js:759 |
| That file is over 12MB — pick a smaller one | renderer/src/modules/expenses.js:760 |
| That file is too large to store — try a photo instead of a scan | renderer/src/modules/expenses.js:764 |
| That file could not be read | renderer/src/modules/expenses.js:772 |
| That file is not an image the app can read | renderer/src/modules/expenses.js:777 |
| That image could not be read | renderer/src/modules/expenses.js:790 |
| This build cannot save files | renderer/src/modules/expenses.js:824 |
| Pick a category | renderer/src/modules/expenses.js:974 |
| Enter an amount greater than zero | renderer/src/modules/expenses.js:979 |
| Pick a date | renderer/src/modules/expenses.js:983 |
| Say who spent it or who it was handed to | renderer/src/modules/expenses.js:984 |
| Describe what the money was for | renderer/src/modules/expenses.js:986 |
| Nothing to export | renderer/src/modules/issues.js:288 |
| Nothing to export | renderer/src/modules/issues.js:294 |
| Enter an issue title | renderer/src/modules/issues.js:940 |
| Select the student who raised it | renderer/src/modules/issues.js:948 |
| Enter a subject | renderer/src/modules/issues.js:987 |
| Copy failed — try the Download button instead | renderer/src/modules/modals.js:221 |
| Please select a backup .json file first | renderer/src/modules/modals.js:334 |
| Invalid backup file — not a HOSTYLLO hostel backup | renderer/src/modules/modals.js:343 |
| Could not parse backup file — file may be corrupted | renderer/src/modules/modals.js:378 |
| Please paste JSON data first | renderer/src/modules/modals.js:386 |
| Invalid JSON — not a valid HOSTYLLO hostel backup | renderer/src/modules/modals.js:392 |
| Invalid JSON — check for errors in pasted data | renderer/src/modules/modals.js:415 |
| Name cannot be empty | renderer/src/modules/modals.js:1025 |
| Username cannot be empty | renderer/src/modules/modals.js:1026 |
| Username can use letters, numbers, dot, dash and underscore only | renderer/src/modules/modals.js:1028 |
| That username is already taken | renderer/src/modules/modals.js:1031 |
| This is the only account that can manage users. Give another user that permission first. | renderer/src/modules/modals.js:1046 |
| Set a password for the new user | renderer/src/modules/modals.js:1057 |
| You cannot delete the account you are signed in as | renderer/src/modules/modals.js:1115 |
| The built-in account cannot be deleted | renderer/src/modules/modals.js:1116 |
| This is the only account that can manage users | renderer/src/modules/modals.js:1118 |
| Photo must be under 2MB | renderer/src/modules/modals.js:1144 |
| Enter your hostel name | renderer/src/modules/onboarding.js:309 |
| Pick a floor and a room type | renderer/src/modules/onboarding.js:469 |
| Set a password before continuing | renderer/src/modules/onboarding.js:553 |
| The two passwords do not match | renderer/src/modules/onboarding.js:556 |
| Nothing selected to export | renderer/src/modules/payments.js:1164 |
| No payment records to export | renderer/src/modules/payments.js:1176 |
| No payments to export | renderer/src/modules/payments.js:1185 |
| No payments to export | renderer/src/modules/payments.js:1191 |
| Student not found | renderer/src/modules/payments.js:2301 |
| Please search and select a student or enter a name manually | renderer/src/modules/payments.js:3019 |
| A charge changed — give the reason. It goes on the student ledger. | renderer/src/modules/payments.js:3515 |
| You can reverse up to  | renderer/src/modules/payments.js:3698 |
| Give a reason — it goes on the student ledger | renderer/src/modules/payments.js:3701 |
| Amount and date are required | renderer/src/modules/reports.js:1476 |
| No rooms to export | renderer/src/modules/rooms.js:484 |
| No rooms to export | renderer/src/modules/rooms.js:490 |
| Fill all required fields | renderer/src/modules/rooms.js:696 |
| Room name already exists | renderer/src/modules/rooms.js:697 |
| Pick a floor and a room type | renderer/src/modules/rooms.js:893 |
| Nothing to add — every room in that range exists | renderer/src/modules/rooms.js:900 |
| Room  | renderer/src/modules/rooms.js:992 |
| Cannot delete Room # | renderer/src/modules/rooms.js:1018 |
| Enter a title | renderer/src/modules/settings.js:19 |
| Enter a subject | renderer/src/modules/settings.js:32 |
| Select a student | renderer/src/modules/settings.js:47 |
| Enter a title | renderer/src/modules/settings.js:73 |
| Select a student | renderer/src/modules/settings.js:101 |
| Enter a valid amount | renderer/src/modules/settings.js:102 |
| Select a room | renderer/src/modules/settings.js:232 |
| At least one payment method has to stay active | renderer/src/modules/settings.js:999 |
| Enter a name | renderer/src/modules/settings.js:1103 |
| " | renderer/src/modules/settings.js:1106 |
| Enter a name | renderer/src/modules/settings.js:1274 |
| " | renderer/src/modules/settings.js:1276 |
| That image is over 8MB — pick a smaller one | renderer/src/modules/settings.js:1778 |
| That image could not be read | renderer/src/modules/settings.js:1797 |
| That file is not an image the app can read | renderer/src/modules/settings.js:1800 |
| That file could not be read | renderer/src/modules/settings.js:1803 |
| The health check could not be run | renderer/src/modules/settings.js:1833 |
| Could not reach the clipboard | renderer/src/modules/settings.js:2522 |
| That could not be completed. | renderer/src/modules/settings.js:2591 |
| Enter a valid rent amount | renderer/src/modules/settings.js:2858 |
| Enter a valid mess amount | renderer/src/modules/settings.js:2859 |
| That room type has no rent configured yet | renderer/src/modules/settings.js:2971 |
| Enter a type name | renderer/src/modules/settings.js:3178 |
| Capacity is a whole number of beds, at least one | renderer/src/modules/settings.js:3179 |
| Enter the default rent for this type | renderer/src/modules/settings.js:3183 |
| " | renderer/src/modules/settings.js:3187 |
| Must have at least one room type | renderer/src/modules/settings.js:3211 |
| Cannot remove type: rooms are using it | renderer/src/modules/settings.js:3212 |
| Must keep at least one method | renderer/src/modules/settings.js:3224 |
| Cannot remove " | renderer/src/modules/settings.js:3232 |
| Must keep at least one category | renderer/src/modules/settings.js:3244 |
| Cannot remove " | renderer/src/modules/settings.js:3246 |
| Must keep at least one floor | renderer/src/modules/settings.js:3258 |
| Cannot remove: rooms are on this floor | renderer/src/modules/settings.js:3259 |
| That file is larger than 50 MB — it is not a Hostyllo backup | renderer/src/modules/settings.js:3277 |
| That file is not valid JSON, so it cannot be a backup | renderer/src/modules/settings.js:3284 |
| The backup could not be written — nothing was changed | renderer/src/modules/settings.js:3308 |
| That file could not be read | renderer/src/modules/settings.js:3316 |
| SheetJS library not loaded — check your internet connection and try again. | renderer/src/modules/settings.js:3334 |
| SheetJS library not loaded — connect to the internet and reload the page. | renderer/src/modules/settings.js:3364 |
| Spreadsheet appears empty | renderer/src/modules/settings.js:3376 |
| No valid rows found. Check the errors below. | renderer/src/modules/settings.js:3454 |
| Could not read file:  | renderer/src/modules/settings.js:3462 |
| Student not found | renderer/src/modules/students.js:743 |
| That student is no longer on the roster | renderer/src/modules/students.js:1578 |
| Five documents is the limit for one student record | renderer/src/modules/students.js:1580 |
| "…" is … — the limit is … a file | renderer/src/modules/students.js:1593 |
| Only images and PDFs can be attached | renderer/src/modules/students.js:1598 |
| Could not read " | renderer/src/modules/students.js:1601 |
| That student is no longer on the roster | renderer/src/modules/students.js:1616 |
| That file is not in a format this can save | renderer/src/modules/students.js:1731 |
| Could not save the file:  | renderer/src/modules/students.js:1761 |
| Nothing selected to export | renderer/src/modules/students.js:2249 |
| No students to export | renderer/src/modules/students.js:2262 |
| No students to export | renderer/src/modules/students.js:2271 |
| No students to export | renderer/src/modules/students.js:2277 |
| Five documents is the limit for one student record | renderer/src/modules/students.js:2433 |
| Five documents is the limit for one student record | renderer/src/modules/students.js:2451 |
| "…" is … — the limit is … a file | renderer/src/modules/students.js:2454 |
| Only images and PDFs can be attached | renderer/src/modules/students.js:2462 |
| Could not read " | renderer/src/modules/students.js:2466 |
| Drop an image file | renderer/src/modules/students.js:2933 |
| Fill all required fields | renderer/src/modules/students.js:2953 |
| That room has no rent configured — set it in Settings → Rent & Mess first | renderer/src/modules/students.js:2955 |
| Photo too large (max 5MB) | renderer/src/modules/students.js:3275 |
| Camera not supported on this device | renderer/src/modules/students.js:3295 |
| Camera not ready yet — please wait a moment | renderer/src/modules/students.js:3345 |
| Photo too large (max 5MB) | renderer/src/modules/students.js:3367 |
| Camera not supported on this device | renderer/src/modules/students.js:3387 |
| Camera not ready yet — please wait a moment | renderer/src/modules/students.js:3436 |
| No other rooms have available capacity right now. | renderer/src/modules/students.js:4056 |
| Please select a new room | renderer/src/modules/students.js:4175 |
| Student is already assigned to this room — please select a different one. | renderer/src/modules/students.js:4177 |
| Selected room not found | renderer/src/modules/students.js:4181 |
| That room is now full — please select a different room. | renderer/src/modules/students.js:4190 |
| Please select a room | renderer/src/modules/students.js:4729 |
| That room has no rent configured — set it in Settings → Rent & Mess | renderer/src/modules/students.js:4733 |
| That room is full — pick another | renderer/src/modules/students.js:4735 |
| Could not reach the clipboard on this machine | renderer/src/modules/support.js:212 |
| Give it a short subject | renderer/src/modules/support.js:427 |
| Only the warden or an administrator can export this handover | renderer/src/modules/users.js:1092 |
| Account not found | renderer/src/modules/users.js:1520 |
| Account not found | renderer/src/modules/users.js:1532 |
| You cannot deactivate the account you are signed in as | renderer/src/modules/users.js:1604 |
| This is the only account that can manage users. Give another user that permission first. | renderer/src/modules/users.js:1606 |
| The two passwords do not match | renderer/src/modules/users.js:1648 |
| That student record is no longer here | renderer/src/modules/whatsapp.js:207 |
| That payment record could not be found — it may have been deleted. | renderer/src/receipt.js:343 |
| Receipt not ready | renderer/src/receipt.js:373 |
| ❌ Cannot identify payment for this receipt. | renderer/src/receipt.js:423 |
| Receipt data not found | renderer/src/receipt.js:434 |
| No phone on record. Add a number to the student profile or set Default WA Number in Settings → Hostel Info. | renderer/src/receipt.js:485 |
| ⚠️ Migration failed — existing data preserved in localStorage. | renderer/src/storage.js:88 |
| ❌ Backup export failed:  | renderer/src/storage.js:373 |
| PDF failed:  | renderer/src/storage.js:390 |
| Backup file is too large or invalid | renderer/src/storage.js:410 |
| Invalid backup file — it has no rooms or students | renderer/src/storage.js:423 |
| Backup contains too many student records | renderer/src/storage.js:437 |
| Backup contains too many payment records | renderer/src/storage.js:441 |
| Import failed:  | renderer/src/storage.js:447 |
| Import failed:  | renderer/src/storage.js:461 |
| ⚠️ Popup blocked — allow popups for this page and try again. | renderer/src/utils.js:129 |
| No data to export | renderer/src/utils.js:857 |

### 14.5 Confirmation dialogs (showConfirm) — 30

| Title | Message | Location |
|---|---|---|
| Clear the activity log? | Every entry is deleted permanently. Export it first if you need the record — this is the only copy. | renderer/src/modules/activitylog.js:405 |
| Delete Record | Are you sure you want to permanently delete this cancellation record? The student status will not be changed. | renderer/src/modules/cancellations.js:617 |
| Restore Student | Restore to Active? Their seat will be re-occupied. | renderer/src/modules/cancellations.js:1156 |
| Delete Fee Record | Remove this fee record? This cannot be undone. | renderer/src/modules/dashboard.js:3192 |
| Delete Expense | Remove this expense record? This cannot be undone. | renderer/src/modules/dashboard.js:3204 |
| Delete expense? | This cannot be undone. | renderer/src/modules/expenses.js:940 |
| Delete expense? | This cannot be undone. | renderer/src/modules/expenses.js:1031 |
| Delete? |  | renderer/src/modules/issues.js:1036 |
| Delete? |  | renderer/src/modules/issues.js:1053 |
| Restore Backup? | This will replace ALL current data with backup data ( students). This cannot be undone! | renderer/src/modules/modals.js:346 |
| Restore from Pasted Data? | This will replace ALL current data ( students found in backup). This cannot be undone! | renderer/src/modules/modals.js:395 |
| Delete user? | Remove | renderer/src/modules/modals.js:1120 |
| Skip setup? | You can finish this later from Settings, and nothing you have already entered is lost. | renderer/src/modules/onboarding.js:100 |
| Mark payment as paid? | This collects the outstanding balance on each selected row and stamps today's date. | renderer/src/modules/payments.js:926 |
| Delete payment record? | This cannot be undone. | renderer/src/modules/payments.js:1308 |
| Delete this payment record? | This will remove it from the student\'s financial history permanently. | renderer/src/modules/payments.js:1325 |
| ⚠️ Already Paid | already has a Paid record for ( ). Adding another entry will charge this student twice. Are you absolutely sure? | renderer/src/modules/payments.js:2309 |
| ⚠️ Pending Record Already Exists | already has a Pending payment for . | renderer/src/modules/payments.js:2326 |
| ⚠️ Pending Record Already Exists | already has a Pending payment for . | renderer/src/modules/payments.js:3070 |
| Delete transfer record? | This cannot be undone. | renderer/src/modules/reports.js:1493 |
| Delete Room # ? | This cannot be undone. | renderer/src/modules/rooms.js:1020 |
| Delete Notice? |  | renderer/src/modules/settings.js:85 |
| Delete Fine? |  | renderer/src/modules/settings.js:119 |
| Delete Inspection? |  | renderer/src/modules/settings.js:250 |
| Update rent & mess for ALL students? | Every active student will be set to | renderer/src/modules/settings.js:2901 |
| Import Data? | This will replace all current data with the imported backup. | renderer/src/modules/settings.js:3299 |
| ⚠️ Reset ALL Data? | This will permanently delete all students, payments, expenses, maintenance, complaints, fines, notices, inspections, bill splits, cash handovers and concessions | renderer/src/modules/settings.js:3595 |
| Remove this document? | Remove | renderer/src/modules/students.js:1637 |
| ⚠️ Room Is At Full Capacity | Room # ( ) already has / students. Do you want to force-add anyway? Room capacity display will remain at but this room will show as over-capacity. | renderer/src/modules/students.js:3011 |
| Take this handover back? | The | renderer/src/modules/users.js:652 |

### 14.6 Date formats

| Call | Arguments (locale, options) | Count | Locations |
|---|---|---|---|
| toLocaleString | 'en-PK' | 10 | renderer/license-settings.html:494; renderer/src/export/engine.js:140; renderer/src/modules/payments.js:1982,1996,2289 (+1); +2 files |
| toLocaleTimeString | 'en-IN', { hour: '2-digit', minute: '2-digit' } | 7 | renderer/src/modules/backup-page.js:62; renderer/src/modules/settings.js:2067,2216; renderer/src/modules/support.js:199; +1 files |
| toLocaleString | 'default',{month:'long',year:'numeric'} | 5 | renderer/src/modules/dashboard.js:3733; renderer/src/modules/settings.js:3532; renderer/src/modules/students.js:4656,4790,4829 |
| toLocaleDateString | 'en-PK', { day: '2-digit', month: 'long', year: 'numeric' } | 4 | renderer/src/enforcement-ui.js:200; main.js:736,870,946 |
| toLocaleDateString | 'en-PK',{day:'2-digit',month:'long',year:'numeric'} | 3 | renderer/src/license.js:70; renderer/src/modules/dashboard.js:2300; renderer/src/modules/students.js:4826 |
| toLocaleString | (none) | 3 | renderer/recovery.html:110; main.js:755,755 |
| toLocaleTimeString | 'en-PK', { hour: '2-digit', minute: '2-digit' } | 3 | renderer/src/modules/settings.js:329; renderer/src/modules/students.js:1112; renderer/src/storage.js:336 |
| toLocaleDateString | 'en-IN', { day: '2-digit', month: 'short', year: 'numeric' } | 2 | renderer/src/modules/backup-page.js:61; renderer/src/modules/settings.js:2215 |
| toLocaleDateString | 'en-IN', { day: 'numeric', month: 'short' } | 2 | renderer/src/modules/activitylog.js:230,237 |
| toLocaleDateString | 'en-IN', { month: 'long', year: 'numeric' } | 2 | renderer/src/modules/cancellations.js:87; renderer/src/modules/students.js:105 |
| toLocaleDateString | 'en-PK' | 2 | main.js:1112,1114 |
| toLocaleDateString | 'en-PK', { day: '2-digit', month: 'short', year: 'numeric' } | 2 | renderer/src/utils.js:724,1522 |
| toLocaleDateString | 'en-PK', { day:'2-digit', month:'long', year:'numeric' } | 2 | renderer/license-settings.html:489; renderer/src/receipt.js:87 |
| toLocaleDateString | 'en-PK',{day:'2-digit',month:'short',year:'numeric'} | 2 | renderer/src/license.js:56; renderer/src/modules/dashboard.js:2395 |
| toLocaleString | 'default', { month: 'long', year: 'numeric' } | 2 | renderer/src/modules/payments.js:1579; renderer/src/utils.js:735 |
| toLocaleString | 'default', { month: 'short', year: 'numeric' } | 2 | renderer/src/modules/payments.js:1484; renderer/src/modules/reports.js:470 |
| toLocaleString | 'default',{month:'short'} | 2 | renderer/src/modules/reports.js:805,818 |
| toLocaleString | 'en-PK',{weekday:'short',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'} | 2 | renderer/src/receipt.js:375,436 |
| toLocaleDateString | 'en-GB', { month: 'long', year: 'numeric' } | 1 | renderer/src/modules/archive.js:123 |
| toLocaleDateString | 'en-GB', { month:'long', year:'numeric' } | 1 | renderer/src/modules/expenses.js:564 |
| toLocaleDateString | 'en-IN', { day: '2-digit', month: 'long', year: 'numeric' } | 1 | renderer/src/modules/settings.js:2208 |
| toLocaleDateString | 'en-IN', { month: 'short' } | 1 | renderer/src/modules/activitylog.js:98 |
| toLocaleDateString | 'en-PK', { day: '2-digit', month: 'short' } | 1 | renderer/src/utils.js:1521 |
| toLocaleDateString | 'en-PK', { day:'numeric', month:'long', year:'numeric' } | 1 | renderer/license-settings.html:500 |
| toLocaleDateString | 'en-PK', { weekday:'short', day:'2-digit', month:'short', year:'numeric' } | 1 | renderer/app.js:303 |
| toLocaleDateString | 'en-PK',{weekday:'short',day:'2-digit',month:'short',year:'numeric'} | 1 | renderer/src/modules/theme.js:66 |
| toLocaleDateString | 'en-PK',{year:'numeric',month:'short',day:'2-digit'} | 1 | renderer/src/modules/modals.js:111 |
| toLocaleString | 'default',{month:'long'} | 1 | renderer/src/modules/sidebar_calendar.js:53 |
| toLocaleString | 'default',{weekday:'short',day:'numeric',month:'short'} | 1 | renderer/src/modules/sidebar_calendar.js:48 |
| toLocaleString | 'en-IN' | 1 | renderer/src/modules/settings.js:2535 |
| toLocaleString | 'en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } | 1 | renderer/src/modules/dashboard.js:785 |
| toLocaleString | 'en-IN', { month: 'long', year: 'numeric' } | 1 | renderer/src/utils.js:752 |
| toLocaleString | 'en-IN', { month:'long', year:'numeric' } | 1 | renderer/src/modules/payments.js:484 |
| toLocaleString | 'en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 } | 1 | renderer/src/export/engine.js:138 |
| toLocaleTimeString | 'en-PK', { hour:'2-digit', minute:'2-digit', hour12:true } | 1 | renderer/src/receipt.js:88 |
| toLocaleTimeString | 'en-PK',{hour:'2-digit',minute:'2-digit'} | 1 | renderer/src/modules/modals.js:112 |

| Formatter function defined | Location |
|---|---|
| money | renderer/src/finance.js:79 |
| moneyIsSafe | renderer/src/finance.js:88 |
| moneySum | renderer/src/finance.js:93 |
| moneyPct | renderer/src/finance.js:104 |
| fmtMonthLabel | renderer/src/modules/expenses.js:561 |
| fmtPhone | renderer/src/modules/students.js:5269 |
| fmtCnic | renderer/src/modules/students.js:5274 |
| fmtEmail | renderer/src/modules/students.js:5280 |
| fmtPKR | renderer/src/utils.js:172 |
| fmtNum | renderer/src/utils.js:173 |
| fmtCompact | renderer/src/utils.js:193 |
| fmtCompactK | renderer/src/utils.js:223 |
| fmtPKRk | renderer/src/utils.js:238 |
| moneyValue | renderer/src/utils.js:677 |
| fmtDate | renderer/src/utils.js:720 |
| formatRoomNumber | renderer/src/utils.js:766 |
| fmtDateShort | renderer/src/utils.js:1512 |

Hand-written date pattern strings (e.g. `dd/mm/yyyy` built by string concatenation):

none found

### 14.7 Number and currency rendering

| Form | Occurrences | Locations |
|---|---|---|
| fmtPKR | 431 | renderer/src/concessions.js:150,168; renderer/src/handovers.js:193,210,303 (+6); renderer/src/modules/archive.js:351,451,452 (+45); renderer/src/modules/cancellations.js:451,850,855 (+24); renderer/src/modules/dashboard.js:739,910,992 (+40); +13 files |
| fmtNum | 31 | renderer/src/ledger.js:224; renderer/src/modules/dashboard.js:739,1085,1376 (+8); renderer/src/modules/payments.js:1803,1926,2018 (+5); renderer/src/modules/settings.js:571,675; renderer/src/receipt.js:292,298; +1 files |
| fmtMoneyShort | 8 | renderer/src/modules/dashboard.js:992,1136,1141 (+3); renderer/src/utils.js:193,687 |
| rsLiteral | 49 | renderer/src/config.js:68; renderer/src/export/engine.js:125; renderer/src/modules/dashboard.js:992,1136,1141 (+3); renderer/src/modules/modals.js:283; renderer/src/modules/payments.js:522,585,1104 (+21); +5 files |
| pkrLiteral | 30 | renderer/src/export/engine.js:289; renderer/src/modules/expenses.js:894; renderer/src/modules/payments.js:1982,2154,2160 (+15); renderer/src/modules/reports.js:1126,1453; renderer/src/modules/settings.js:91; +2 files |
| enPK | 38 | renderer/license-settings.html:489,494,500; renderer/app.js:303; renderer/src/enforcement-ui.js:200; renderer/src/export/engine.js:138,140; renderer/src/license.js:56,70; +10 files |
| enIN | 19 | renderer/src/modules/activitylog.js:98,230,237; renderer/src/modules/backup-page.js:61,62; renderer/src/modules/cancellations.js:87; renderer/src/modules/dashboard.js:785; renderer/src/modules/payments.js:484; +5 files |
| enGB | 2 | renderer/src/modules/archive.js:123; renderer/src/modules/expenses.js:564 |
| enUS | 0 |  |
| toFixed2 | 14 | renderer/src/modules/activitylog.js:252,252,253; renderer/src/modules/dashboard.js:633,634,656 (+3); renderer/src/modules/settings.js:890,1715,1715 (+1); renderer/src/utils.js:205 |

### 14.8 Branding and fixed-name strings — 153

| String | Count | Locations |
|---|---|---|
| HOSTYLLO | 76 | renderer/index.html:6,123,170 (+3); renderer/license.html:6,380; renderer/app.js:269,285; renderer/src/config.js:61; renderer/src/export/engine.js:345,797,894 (+2); renderer/src/ledger.js:403,435,441; renderer/src/license.js:98; renderer/src/modules/modals.js:272,343,392; +7 files |
| Hostyllo | 67 | renderer/index.html:410; renderer/license-settings.html:6,451; renderer/license.html:378,447; renderer/recovery.html:8,61,78 (+4); renderer/src/auth-nev.js:175; renderer/src/export/engine.js:226,675,686 (+1); renderer/src/export/xlsx-writer.js:567,569,570 (+2); renderer/src/modules/backup-page.js:246; +8 files |
| Hostel Name | 8 | renderer/src/config.js:62; renderer/src/modules/dashboard.js:2298; renderer/src/modules/modals.js:273; renderer/src/modules/onboarding.js:212; renderer/src/modules/settings.js:1642,2642; renderer/src/modules/students.js:4824; renderer/src/receipt.js:73 |
| HOSTIX | 1 | main.js:1889 |
| Peshawar | 1 | renderer/app.js:471 |

| String | Location | Line text |
|---|---|---|
| Peshawar | renderer/app.js:471 | 'Peshawar','Mardan','Nowshera','Charsadda','Swabi','Swat','Mingora','Abbottabad', |
| Hostel Name | renderer/src/config.js:62 | hostelName:      'Hostel Name', |
| Hostel Name | renderer/src/modules/dashboard.js:2298 | const hostel = DB.settings.hostelName \|\| 'Hostel Name'; |
| Hostel Name | renderer/src/modules/modals.js:273 | if (!d.settings.hostelName) d.settings.hostelName = 'Hostel Name'; |
| Hostel Name | renderer/src/modules/onboarding.js:212 | <input class="form-control" id="onb-name" maxlength="60" value="${v(s.hostelName === 'Hostel Name' ? '' : s.ho |
| Hostel Name | renderer/src/modules/settings.js:1642 | style="font-family:'${hiSafeFace(font)}',var(--font)">${escHtml(s.hostelName \|\| 'Hostel Name')}</div> |
| Hostel Name | renderer/src/modules/settings.js:2642 | prev.textContent = val \|\| 'Hostel Name'; |
| Hostel Name | renderer/src/modules/students.js:4824 | var hostel   = DB.settings.hostelName \|\| 'Hostel Name'; |
| Hostel Name | renderer/src/receipt.js:73 | var hostel    = (DB.settings.hostelName  \|\| 'Hostel Name').toUpperCase(); |
| HOSTIX | main.js:1889 | const RELEASES_URL = 'https://github.com/mushtaqahmaduop/HOSTIX-APP/releases'; |

## 15. Accessibility baseline

### 15.1 Primary actions and keyboard reachability (rendered)

Primary action = visible element with `.btn-primary`, `.is-primary`, `#hdr-action` or a `--primary` class. Reachable = a native button/link/input with tabIndex ≥ 0 and not disabled. Reachability through the full Tab order was not traversed (UNKNOWN beyond the first four stops, §3.3).

| Page | Primary actions: label (tag, reachable) |
|---|---|
| dashboard | Add Student (button, reachable) |
| rooms | Add Room (button, reachable) |
| students | Add Student (button, reachable) ; Export (button, reachable) |
| payments | Add Payment (button, reachable) |
| expenses | Add Expense (button, reachable) |
| cancellations | Add Cancellation (button, reachable) |
| former | none found |
| reports | none found |
| issues | Add Issue (button, reachable) |
| activitylog | none found |
| backup | none found |
| users | none found |
| settings | none found |
| support | Submit request (button, reachable) |
| archive | Export PDF (button, reachable) |
| maintenance | Add Issue (button, reachable) |
| complaints | Add Issue (button, reachable) |
| addstudent | none found |
| addpayment | none found |

### 15.2 Rendered markup checks per page (light theme)

| Page | onclick on non-interactive elements | of which no role | no role and not focusable | Samples | img | img without alt | form controls | controls with no accessible name | placeholder-only | Landmarks / roles present | lang | document title |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| dashboard | 78 | 78 | 78 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 1 | 1 | 1 | header, nav, aside, footer, role=menu, role=menuitem, role=separator, role=img, role=alert, role=group | en | HOSTYLLO \| Hostel Management System |
| rooms | 54 | 54 | 54 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 5 | 2 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| students | 41 | 41 | 41 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 14 | 9 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| payments | 34 | 34 | 34 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 13 | 8 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| expenses | 24 | 24 | 24 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 6 | 2 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| cancellations | 29 | 29 | 29 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active | 1 | 0 | 6 | 3 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| former | 24 | 24 | 24 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 7 | 3 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| reports | 30 | 30 | 30 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 2 | 1 | 1 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert, role=tablist, role=tab | en | HOSTYLLO \| Hostel Management System |
| issues | 21 | 21 | 21 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 8 | 3 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| activitylog | 19 | 19 | 19 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 7 | 5 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| backup | 24 | 19 | 19 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 1 | 1 | 1 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert, role=tablist, role=tab, role=switch | en | HOSTYLLO \| Hostel Management System |
| users | 23 | 20 | 20 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 5 | 5 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert, role=tablist, role=tab | en | HOSTYLLO \| Hostel Management System |
| settings | 24 | 18 | 18 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 9 | 2 | 1 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert, role=tablist, role=tab, role=switch | en | HOSTYLLO \| Hostel Management System |
| support | 18 | 18 | 18 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 6 | 2 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| archive | 19 | 19 | 19 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 2 | 1 | 1 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| maintenance | 21 | 21 | 21 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 8 | 3 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| complaints | 21 | 21 | 21 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 8 | 3 | 2 | header, nav, aside, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| addstudent | 19 | 19 | 19 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item.active ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 24 | 2 | 2 | header, nav, aside, footer, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |
| addpayment | 17 | 17 | 17 | div#sb-calendar-wrap.sb-month-picker > div.sb-month-picker__header > div.sb-month-picker__display ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item ; aside#sidebar > nav.sb-nav.sidebar__middle > div.nav-item | 1 | 0 | 12 | 5 | 3 | header, nav, aside, footer, role=menu, role=menuitem, role=separator, role=img, role=alert | en | HOSTYLLO \| Hostel Management System |

### 15.3 Static markers

| aria attribute | Count | Locations |
|---|---|---|
| aria-label | 60 | renderer/index.html:162,240,247 (+5); renderer/src/modules/activitylog.js:358; renderer/src/modules/backup-page.js:107; renderer/src/modules/cancellations.js:181,710; +10 files |
| aria-hidden | 18 | renderer/index.html:115,129,257 (+1); renderer/license.html:352,359; renderer/src/icons.js:140; renderer/src/modules/activitylog.js:261; +7 files |
| aria-haspopup | 5 | renderer/src/modules/students.js:624,1458; renderer/src/titlebar.js:85; renderer/src/toolbar.js:78,207 |
| aria-selected | 4 | renderer/src/modules/backup-page.js:109; renderer/src/modules/reports.js:1037; renderer/src/modules/settings.js:1928; renderer/src/modules/users.js:305 |
| aria-expanded | 3 | renderer/index.html:262; renderer/src/modules/settings.js:1339; renderer/src/titlebar.js:85 |
| aria-modal | 3 | renderer/src/modules/students.js:1117; renderer/src/modules/users.js:1252,1414 |
| aria-controls | 2 | renderer/index.html:262; renderer/src/toolbar.js:78 |
| aria-current | 2 | renderer/src/modules/payments.js:2523; renderer/src/modules/students.js:2662 |
| aria-disabled | 2 | renderer/src/modules/students.js:1686; renderer/src/toolbar.js:230 |
| aria-live | 2 | renderer/index.html:267; renderer/src/modules/users.js:929 |
| aria-checked | 1 | renderer/src/modules/settings.js:1358 |

| role value | Count | Locations |
|---|---|---|
| menuitem | 14 | renderer/src/modules/settings.js:1136; renderer/src/modules/students.js:1676,1679,1681 (+5); renderer/src/titlebar.js:77; renderer/src/toolbar.js:83,87,230 (+1) |
| tab | 9 | renderer/src/modules/backup-page.js:108; renderer/src/modules/issues.js:765,767,833 (+1); renderer/src/modules/reports.js:1036; renderer/src/modules/settings.js:1927; +2 files |
| tablist | 7 | renderer/src/modules/backup-page.js:107; renderer/src/modules/issues.js:764,832; renderer/src/modules/reports.js:1024; renderer/src/modules/settings.js:1924; +2 files |
| dialog | 4 | renderer/src/modules/activitylog.js:358; renderer/src/modules/students.js:1117; renderer/src/modules/users.js:1252,1414 |
| menu | 3 | renderer/src/modules/settings.js:1135; renderer/src/titlebar.js:87; renderer/src/toolbar.js:82 |
| img | 2 | renderer/index.html:162; renderer/src/modules/dashboard.js:668 |
| alert | 1 | renderer/index.html:269 |
| group | 1 | renderer/src/modules/dashboard.js:1191 |
| separator | 1 | renderer/src/titlebar.js:73 |
| switch | 1 | renderer/src/modules/settings.js:1358 |

Elements with onclick on a non-interactive tag in markup: 86; with a role: 3; with tabindex: 4; with neither: 82.

| Tag | Count | Locations (no role) |
|---|---|---|
| div | 64 | renderer/index.html:390,432,491 (+16); renderer/src/modules/activitylog.js:357; renderer/src/modules/backup-page.js:175; renderer/src/modules/cancellations.js:235,269,791; renderer/src/modules/command-palette.js:65,89; +12 files |
| tr | 12 | renderer/src/modules/activitylog.js:320; renderer/src/modules/archive.js:449,534,572 (+1); renderer/src/modules/dashboard.js:2101; renderer/src/modules/reports.js:74,203,228; renderer/src/modules/rooms.js:209; +1 files |
| td | 6 | renderer/src/modules/payments.js:737; renderer/src/modules/reports.js:127; renderer/src/modules/rooms.js:216; renderer/src/modules/students.js:523,529; renderer/src/modules/users.js:247 |
| span | 4 | renderer/index.html:443; renderer/src/modules/dashboard.js:3002,3015; renderer/src/modules/rooms.js:186 |

Form controls in markup (excluding hidden/submit/button): 325. Associated with <label for> in the same file: 88. aria-label only: 10. Placeholder only: 88. No label/aria-label/placeholder found in the tag or a label[for] in the same file (may still be wrapped by a <label> element or labelled at runtime — see §15.2): 139.

| lang on <html> | Location |
|---|---|
| en | renderer/index.html:2 |
| en | renderer/license-settings.html:2 |
| en | renderer/license.html:2 |
| en | renderer/recovery.html:2 |

| <title> | Location |
|---|---|
| HOSTYLLO \| Hostel Management System | renderer/index.html:6 |
| License Settings — Hostyllo | renderer/license-settings.html:6 |
| HOSTYLLO — Activate License | renderer/license.html:6 |
| Hostyllo — Recovery | renderer/recovery.html:8 |

| Landmark element | Count | Locations |
|---|---|---|
| aside | 15 | renderer/index.html:112,396; renderer/license.html:364; renderer/src/modules/activitylog.js:358; renderer/src/modules/backup-page.js:194,274,413; renderer/src/modules/payments.js:2716; +4 files |
| header | 6 | renderer/index.html:653; renderer/src/export/engine.js:342; renderer/src/modules/payments.js:2514; renderer/src/modules/students.js:1120; renderer/src/modules/users.js:1254,1416 |
| footer | 5 | renderer/license.html:445; renderer/src/modules/dashboard.js:789; renderer/src/modules/payments.js:2771; renderer/src/modules/students.js:1210,2886 |
| nav | 4 | renderer/index.html:461; renderer/src/modules/payments.js:2520; renderer/src/modules/students.js:1202,2656 |
| main | 1 | renderer/license.html:377 |

## 16. Conflicts and inconsistencies

### 16.1 Two rules fighting (identical selector) — 398; full list in §13.5

| Selector | Property | Losing value(s) | Winning value | Why it wins |
|---|---|---|---|---|
| .arc-table .num | text-align | right @ renderer/archive.css:109 | center @ renderer/registers-center.css:53 | later in load/line order |
| #sidebar .sb-logo | padding | 18px 16px 16px 44px @ renderer/chrome.css:155 | 10px 16px 6px 44px @ renderer/rail-compact.css:38 | later in load/line order |
| #sidebar .sb-section | font-weight | 700 @ renderer/chrome.css:229 | 800 @ renderer/chrome.css:867 | later in load/line order |
| #sidebar .sb-section | letter-spacing | 1.4px @ renderer/chrome.css:230 | 1.1px @ renderer/chrome.css:868 | later in load/line order |
| #sidebar .sb-section | color | var(--sb-fg3) @ renderer/chrome.css:230 | var(--sb-fg2) @ renderer/chrome.css:866 | later in load/line order |
| #sidebar .sb-section | padding | 6px 10px 4px @ renderer/chrome.css:230 | 4px 10px 2px @ renderer/rail-compact.css:45 | later in load/line order |
| #sidebar .sb-section | margin-top | 4px @ renderer/chrome.css:231 | 2px @ renderer/rail-compact.css:45 | later in load/line order |
| #sidebar .nav-item.active | background | linear-gradient(135deg, var(--accent-600) 0%, var(--accent-500) 100%) @ renderer/chrome.css:265 | var(--sb-active-surface) @ renderer/chrome.css:799 | later in load/line order |
| #sidebar .nav-item.active | color | var(--sb-active-fg) @ renderer/chrome.css:266 | var(--sb-fg) @ renderer/chrome.css:800 | later in load/line order |
| #sidebar .nav-item.active | border-color | rgba(255, 255, 255, .10) @ renderer/chrome.css:267 | var(--sb-active-edge) @ renderer/chrome.css:801 | later in load/line order |
| #sidebar .nav-item.active | box-shadow | 0 8px 20px rgba(27, 63, 174, .28) @ renderer/chrome.css:268 | none @ renderer/chrome.css:802 | later in load/line order |
| #sidebar .nav-item.active | font-weight | 600 @ renderer/chrome.css:269 | 650 @ renderer/chrome.css:803 | later in load/line order |
| #sidebar .nav-item.active .nav-icon | color | var(--sb-active-fg) @ renderer/chrome.css:271 ; var(--accent) @ renderer/chrome.css:817 | var(--gray-50) @ renderer/chrome.css:856 | later in load/line order |
| #sidebar .nav-item.active .nav-badge | background | rgba(255,255,255,.28) @ renderer/chrome.css:302 ; var(--accent) @ renderer/chrome.css:825 | var(--gray-50) @ renderer/chrome.css:857 | later in load/line order |
| #sidebar @media (max-width: 900px) | transform | translateX(-100%) @ renderer/style.css:1982 | none @ renderer/chrome.css:404 | later in load/line order |
| .hdr-right | gap | 10px @ renderer/style.css:1078 | 9px @ renderer/chrome.css:460 | later in load/line order |
| .hdr-month-picker .sb-month-picker__header | gap | 1px @ renderer/style.css:1088 | 2px @ renderer/chrome.css:485 | later in load/line order |
| .hdr-month-picker .sb-month-picker__display | padding | 4px 10px @ renderer/style.css:1091 | 0 6px @ renderer/chrome.css:489 | later in load/line order |
| .hdr-month-picker .sb-month-picker__display | font-size | 11px @ renderer/style.css:1093 | 13px @ renderer/chrome.css:489 | later in load/line order |
| .hdr-month-picker .sb-month-picker__arrow | height | 26px @ renderer/style.css:1097 | 30px @ renderer/chrome.css:493 | later in load/line order |
| #sidebar .nav-item.active::before | display | block @ renderer/chrome.css:809 | none @ renderer/chrome.css:855 | later in load/line order |
| #sidebar .nav-item.active .nav-badge | color | var(--text-on-accent) @ renderer/chrome.css:825 | var(--gray-700) @ renderer/chrome.css:857 | later in load/line order |
| .dsh-card | padding | 16px @ renderer/dashboard.css:27 | 13px 15px @ renderer/dashboard.css:297 | later in load/line order |
| .dash-kpi-grid | grid-template-columns | repeat(auto-fit,minmax(212px,1fr)) @ renderer/dashboard.css:44 ; repeat(auto-fit,minmax(196px,1fr)) @ renderer/dashboard.css:299 | repeat(5,minmax(0,1fr)) @ renderer/dashboard.css:708 | later in load/line order |
| .dash-kpi-grid | gap | 12px @ renderer/dashboard.css:44 | 10px @ renderer/dashboard.css:299 | later in load/line order |
| .dash-kpi-grid | margin-bottom | 12px @ renderer/dashboard.css:44 | 10px @ renderer/dashboard.css:299 | later in load/line order |
| .dash-kpi__top | gap | 10px @ renderer/dashboard.css:47 | 9px @ renderer/dashboard.css:302 | later in load/line order |
| .dash-kpi__top | margin-bottom | 12px @ renderer/dashboard.css:47 ; 10px @ renderer/dashboard.css:302 ; 8px @ renderer/dashboard.css:2888 | 6px @ renderer/dashboard.css:2988 | later in load/line order |
| .dash-kpi__label | font-size | 11px @ renderer/dashboard.css:52 | 10.5px @ renderer/dashboard.css:303 | later in load/line order |
| .dash-kpi__label | letter-spacing | .9px @ renderer/dashboard.css:52 | .8px @ renderer/dashboard.css:303 | later in load/line order |
| .dash-kpi__label | line-height | 1.3 @ renderer/dashboard.css:52 | 1.25 @ renderer/dashboard.css:2893 | later in load/line order |
| .dash-kpi__note | margin-top | 8px @ renderer/dashboard.css:60 ; 6px @ renderer/dashboard.css:2894 ; 5px @ renderer/dashboard.css:2990 | 4px @ renderer/dashboard.css:3018 | later in load/line order |
| .dash-kpi__note | padding-top | 7px @ renderer/dashboard.css:61 ; 6px @ renderer/dashboard.css:2894 ; 5px @ renderer/dashboard.css:2990 | 4px @ renderer/dashboard.css:3018 | later in load/line order |
| .dash-kpi__value | margin-bottom | 9px @ renderer/dashboard.css:66 ; 7px @ renderer/dashboard.css:304 | 5px @ renderer/dashboard.css:2989 | later in load/line order |
| .dash-kpi__sub | font-size | 11px @ renderer/dashboard.css:67 | 10.5px @ renderer/dashboard.css:308 | later in load/line order |
| .dash-kpi__sub | line-height | 1.55 @ renderer/dashboard.css:67 | 1.5 @ renderer/dashboard.css:308 | later in load/line order |
| .dash-track | height | 6px @ renderer/dashboard.css:83 | 5px @ renderer/dashboard.css:318 | later in load/line order |
| .dash-spark | height | 36px @ renderer/dashboard.css:87 | 30px @ renderer/dashboard.css:316 | later in load/line order |
| .dash-spark-empty | height | 36px @ renderer/dashboard.css:92 | 30px @ renderer/dashboard.css:317 | later in load/line order |
| .dash-tile-grid | grid-template-columns | repeat(auto-fit,minmax(258px,1fr)) @ renderer/dashboard.css:95 | repeat(auto-fit,minmax(238px,1fr)) @ renderer/dashboard.css:300 | later in load/line order |
| .dash-tile-grid | gap | 12px @ renderer/dashboard.css:95 | 10px @ renderer/dashboard.css:300 | later in load/line order |
| .dash-tile-grid | margin-bottom | 12px @ renderer/dashboard.css:95 | 10px @ renderer/dashboard.css:300 | later in load/line order |
| .dash-tile__head | gap | 12px @ renderer/dashboard.css:96 | 10px @ renderer/dashboard.css:313 | later in load/line order |
| .dash-tile__head | margin-bottom | 11px @ renderer/dashboard.css:96 | 9px @ renderer/dashboard.css:313 | later in load/line order |
| .dash-tile__num | font-size | 30px @ renderer/dashboard.css:97 | 26px @ renderer/dashboard.css:314 | later in load/line order |
| .dash-sec | padding | 14px var(--sec-pad-x) @ renderer/dashboard.css:108 | 12px var(--sec-pad-x) @ renderer/dashboard.css:298 | later in load/line order |
| .dash-sec__head | gap | 9px @ renderer/dashboard.css:109 | 8px @ renderer/dashboard.css:320 | later in load/line order |
| .dash-sec__head | margin-bottom | 12px @ renderer/dashboard.css:109 | 10px @ renderer/dashboard.css:320 | later in load/line order |
| .dash-sec__title | font-size | 14px @ renderer/dashboard.css:110 | 13px @ renderer/dashboard.css:321 | later in load/line order |
| .dash-mini | border-radius | 10px @ renderer/dashboard.css:142 | 9px @ renderer/dashboard.css:323 | later in load/line order |
| .dash-mini | padding | 7px 11px @ renderer/dashboard.css:142 | 6px 10px @ renderer/dashboard.css:323 | later in load/line order |
| .dash-mini__v | font-size | 14px @ renderer/dashboard.css:145 | 13px @ renderer/dashboard.css:324 | later in load/line order |
| .dash-seat-sum | gap | 8px @ renderer/dashboard.css:148 | 7px @ renderer/dashboard.css:326 | later in load/line order |
| .dash-seat-sum | margin-bottom | 10px @ renderer/dashboard.css:148 | 9px @ renderer/dashboard.css:326 | later in load/line order |
| .dash-seat-sum > div | border-radius | 12px @ renderer/dashboard.css:149 | 10px @ renderer/dashboard.css:327 | later in load/line order |
| .dash-seat-sum > div | padding | 10px 8px @ renderer/dashboard.css:149 | 8px 6px @ renderer/dashboard.css:327 | later in load/line order |
| .dash-seat-sum .n | font-size | 24px @ renderer/dashboard.css:151 | 21px @ renderer/dashboard.css:328 | later in load/line order |
| .dash-room-wrap | max-height | 104px @ renderer/dashboard.css:154 | 140px @ renderer/dashboard.css:354 | later in load/line order |
| .dash-room | border-radius | 9px @ renderer/dashboard.css:155 | 8px @ renderer/dashboard.css:330 | later in load/line order |
| .dash-room | padding | 6px 8px @ renderer/dashboard.css:155 | 5px 7px @ renderer/dashboard.css:330 | later in load/line order |
| .dash-room | min-width | 44px @ renderer/dashboard.css:155 | 41px @ renderer/dashboard.css:330 | later in load/line order |
| .dash-rt | gap | 11px @ renderer/dashboard.css:165 | 10px @ renderer/dashboard.css:332 | later in load/line order |
| .dash-rt | padding | 9px 0 @ renderer/dashboard.css:165 | 7px 0 @ renderer/dashboard.css:332 | later in load/line order |
| .dash-rt__name | font-size | 12.5px @ renderer/dashboard.css:168 | 12px @ renderer/dashboard.css:333 | later in load/line order |
| .dash-rt__bar | width | 92px @ renderer/dashboard.css:170 | 84px @ renderer/dashboard.css:334 | later in load/line order |
| .dash-rt__bar | height | 6px @ renderer/dashboard.css:170 | 5px @ renderer/dashboard.css:334 | later in load/line order |
| .rt-donut | width | 170px @ renderer/dashboard.css:185 | 150px @ renderer/dashboard.css:345 | later in load/line order |
| .rt-donut | height | 170px @ renderer/dashboard.css:185 | 150px @ renderer/dashboard.css:345 | later in load/line order |
| .dash-pay | gap | 11px @ renderer/dashboard.css:259 | 10px @ renderer/dashboard.css:336 | later in load/line order |
| .dash-pay | padding | 10px 0 @ renderer/dashboard.css:259 | 8px 0 @ renderer/dashboard.css:336 | later in load/line order |
| .dash-av | width | 34px @ renderer/dashboard.css:261 | 31px @ renderer/dashboard.css:337 | later in load/line order |
| .dash-av | height | 34px @ renderer/dashboard.css:261 | 31px @ renderer/dashboard.css:337 | later in load/line order |
| .dash-av | font-size | 11.5px @ renderer/dashboard.css:261 | 11px @ renderer/dashboard.css:337 | later in load/line order |
| .dash-pay__name | font-size | 13px @ renderer/dashboard.css:263 | 12.5px @ renderer/dashboard.css:338 | later in load/line order |
| #trend-chart-wrap | height | 198px @ renderer/dashboard.css:353 ; auto @ renderer/dashboard.css:921 ; 177px @ renderer/dashboard.css:2950 | 244px @ renderer/dashboard.css:3030 | later in load/line order |
| .dl-meth | gap | 9px @ renderer/dashboard.css:547 | 2px @ renderer/dashboard.css:1278 | later in load/line order |
| .dl-meth__row | grid-template-columns | auto 1fr auto auto @ renderer/dashboard.css:548 | 10px minmax(64px, 96px) minmax(0, 1fr) 44px auto @ renderer/dashboard.css:1281 | later in load/line order |
| .dl-meth__name | font-size | 12px @ renderer/dashboard.css:549 | 12.5px @ renderer/dashboard.css:1291 | later in load/line order |
| .dl-meth__bar | border-radius | 4px @ renderer/dashboard.css:550 | 999px @ renderer/dashboard.css:1293 | later in load/line order |
| .dl-meth__pct | font-size | 11px @ renderer/dashboard.css:552 | 11.5px @ renderer/dashboard.css:1295 | later in load/line order |

### 16.2 A token exists but the raw value is used — 214 occurrences (§2.4)

### 16.3 Same component class styled differently in different files

Classes whose bare selector `.name` is declared in two or more files with a different value for the same property: 26

| Class | Property: value @line file (per file) |
|---|---|
| btn | padding: 9px 18px @1103 renderer/style.css vs 0 15px @174 renderer/license-settings.html \| border-radius: var(--radius-sm) @1103 renderer/style.css vs 10px @174 renderer/license-settings.html \| font-weight: 600 @1103 renderer/style.css vs 700 @174 renderer/license-settings.html \| transition: var(--transition) @1103 renderer/style.css vs all .15s @174 renderer/license-settings.html \| border: none @1103 renderer/style.css vs 1px solid var(--border2) @174 renderer/license-settings.html |
| sub | color: var(--muted) @24 renderer/recovery.html vs VAR @626 renderer/src/export/engine.js vs #64748b @3560 renderer/src/modules/students.js |
| modal | max-height: 100% @68 renderer/forms.css vs 94vh @1529 renderer/style.css \| margin: 0 @68 renderer/forms.css vs auto @1529 renderer/style.css \| animation: hz-panel-in .22s cubic-bezier(.2, .7, .3, 1) both @447 renderer/forms.css vs slideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) @1529 renderer/style.css |
| card | background: var(--bg2) @4327 renderer/style.css vs var(--surface) @102 renderer/license-settings.html vs var(--card) @73 renderer/license.html \| border: var(--hairline) @4327 renderer/style.css vs 1px solid var(--border) @102 renderer/license-settings.html vs 1px solid var(--line) @73 renderer/license.html \| border-radius: var(--r-xl) @4327 renderer/style.css vs 16px @102 renderer/license-settings.html vs 20px @73 renderer/license.html |
| badge | gap: 4px @4501 renderer/style.css vs 6px @116 renderer/license-settings.html \| padding: 3px 10px @4501 renderer/style.css vs 5px 12px @116 renderer/license-settings.html \| border-radius: var(--r-full) @4501 renderer/style.css vs 999px @116 renderer/license-settings.html \| font-size: 11px @4501 renderer/style.css vs 12px @116 renderer/license-settings.html \| font-weight: 600 @4501 renderer/style.css vs 700 @116 renderer/license-settings.html |
| sb-month-picker__arrow | width: 24px @51 renderer/rail-compact.css vs 28px @865 renderer/style.css \| height: 24px @51 renderer/rail-compact.css vs 28px @865 renderer/style.css |
| sb-month-picker__display | padding: 0 4px @52 renderer/rail-compact.css vs 5px 10px @883 renderer/style.css |
| sb-month-picker__header | padding: 2px 8px 4px @50 renderer/rail-compact.css vs 6px 8px @859 renderer/style.css \| gap: 1px @50 renderer/rail-compact.css vs 2px @859 renderer/style.css |
| note | color: var(--text2) @150 renderer/license-settings.html vs var(--muted) @50 renderer/recovery.html |
| toast | position: relative @2042 renderer/style.css vs fixed @222 renderer/license-settings.html \| background: var(--card) @2042 renderer/style.css vs var(--surface) @222 renderer/license-settings.html \| border: 1px solid var(--border) @2042 renderer/style.css vs 1px solid var(--border2) @222 renderer/license-settings.html \| border-radius: 14px @2042 renderer/style.css vs 11px @222 renderer/license-settings.html \| padding: 12px 12px 13px 14px @2042 renderer/style.css vs 11px 18px @222 renderer/license-settings.html \| box-shadow: 0 12px 32px rgba(15, 23, 42, .16) @2042 renderer/style.css vs var(--shadow) @222 renderer/license-settings.html |
| btn-primary | background: var(--sb-active) @563 renderer/chrome.css vs var(--accent) @1142 renderer/style.css |
| modal-overlay | align-items: center @57 renderer/forms.css vs flex-start @1514 renderer/style.css \| padding: 24px @57 renderer/forms.css vs 16px @1514 renderer/style.css \| animation: hz-scrim-in .16s ease-out both @446 renderer/forms.css vs fadeIn 0.15s ease @1514 renderer/style.css |
| modal-header | background: var(--card) @90 renderer/forms.css vs linear-gradient(180deg, rgba(96,165,250,0.04) 0%, transparent 100%) @4601 renderer/style.css |
| fact | gap: 11px @206 renderer/license-settings.html vs 14px @3544 renderer/src/modules/students.js \| padding: 14px 16px @206 renderer/license-settings.html vs 7px 0 @3544 renderer/src/modules/students.js \| border-bottom: 1px solid var(--border) @206 renderer/license-settings.html vs 1px solid #f1f5f9 @3544 renderer/src/modules/students.js |
| msg | margin-top: 0 @177 renderer/license.html vs 14px @51 renderer/recovery.html |
| stu-room__t | font-size: 11px @413 renderer/listkit.css vs 10px @1039 renderer/students.css |
| divider | margin: 20px 0 @2073 renderer/style.css vs 0 auto 30px @108 renderer/license.html |
| panel | border: 1px solid var(--line) @25 renderer/recovery.html vs 1px solid #e2e8f0 @3541 renderer/src/modules/students.js \| border-radius: 10px @25 renderer/recovery.html vs 12px @3541 renderer/src/modules/students.js |
| stu-room__n | font-size: 13.5px @408 renderer/listkit.css vs 12px @1038 renderer/students.css \| font-weight: 800 @408 renderer/listkit.css vs 700 @1038 renderer/students.css |
| stu-cov | padding: 2px 8px @436 renderer/listkit.css vs 2px 5px @996 renderer/students.css \| font-size: 9.5px @436 renderer/listkit.css vs 9px @1044 renderer/students.css \| font-weight: 800 @436 renderer/listkit.css vs 700 @1044 renderer/students.css \| letter-spacing: .3px @436 renderer/listkit.css vs .2px @996 renderer/students.css |
| room-grid | grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)) @1641 renderer/style.css vs repeat(3,1fr) @2483 renderer/src/modules/dashboard.js \| gap: 12px @1641 renderer/style.css vs 8px @2483 renderer/src/modules/dashboard.js |
| fact__v | font-size: 13px @218 renderer/license-settings.html vs 11.5px @3547 renderer/src/modules/students.js |
| hdr-right | gap: 9px @460 renderer/chrome.css vs 10px @1075 renderer/style.css |
| sb-month-picker__label | font-size: 12px @53 renderer/rail-compact.css vs 11px @904 renderer/style.css |
| skeleton | background: linear-gradient(90deg, var(--bg3) 25%, var(--bg4) 50%, var(--bg3) 75%) @3843 renderer/style.css vs linear-gradient(90deg, var(--surface-sunk) 25%, var(--border) 50%, var(--surface-sunk) 75%) @234 renderer/license-settings.html \| animation: skeletonShimmer 1.5s infinite @3843 renderer/style.css vs shimmer 1.2s infinite @234 renderer/license-settings.html \| border-radius: 6px @3843 renderer/style.css vs 4px @234 renderer/license-settings.html |
| fact__k | font-size: 11px @217 renderer/license-settings.html vs 11.5px @3546 renderer/src/modules/students.js \| color: var(--text3) @217 renderer/license-settings.html vs #64748b @3546 renderer/src/modules/students.js |

### 16.4 Same visual element rendered differently across screens

Header page-title rendering variants: 1 — 26px 700 Outfit, Inter, Barlow, "Segoe UI", system-ui, sans on dashboard,rooms,students,payments,expenses,cancellations,former,reports,issues,activitylog,backup,users,settings,support,archive,maintenance,complaints,addstudent.

Rendered table variants (row height / td padding / td font / th padding / th font): 12

| Variant | Tables (page: class) |
|---|---|
| 53 / 11px 16px / 13.5px / 0px 16px 9px / 10px 600 uppercase | dashboard: dash-rp |
| 61 / 8px 0px 8px 8px / 12px / 8px 0px 8px 8px / 9.5px 700 uppercase | students: stu-table |
| 92 / 11px 3px 11px 8px / 12.5px / 11px 3px 11px 8px / 10px 700 uppercase | payments: pay-table |
| 52 / 11px 16px / 13px / 12px 16px / 10px 700 uppercase | expenses: exp-table |
| 81 / 12px / 12.5px / 11px 12px / 10px 700 uppercase | cancellations: lk-table |
| 188 / 12px / 12.5px / 11px 12px / 10px 700 uppercase | former: lk-table |
| 48 / 11px 12px / 12.5px / 10px 12px / 10px 700 uppercase | reports: rpt-tbl |
| 71 / 10px 7px / 12.5px / 11px 7px / 10px 700 uppercase | issues: lk-table iss-table |
| 69 / 12px 14px / 11.5px / 12px 14px / 10px 700 uppercase | activitylog: set-table al-table |
| 64 / 12px 14px / 13.5px / 12px 14px / 10px 700 uppercase | users: set-table usr-table |
| 39 / 9px 12px / 13.5px / 10px 12px / 10px 700 uppercase | archive: arc-table |
| 70 / 10px 7px / 12.5px / 11px 7px / 10px 700 uppercase | maintenance: lk-table iss-table ; complaints: lk-table iss-table |

Rendered text-input variants (height / padding / font / radius): 15

| Variant | Count | Pages |
|---|---|---|
| 16px / 0px / 13px / r0px | 25 | dashboard, rooms, students, payments, expenses, cancellations, former, reports, issues, activitylog, backup, users, settings, support, archive, maintenance, complaints, addstudent |
| 42px / 0px 12px / 13px / r10px | 12 | addstudent |
| 36px / 10px 14px / 13.5px / r0px | 8 | settings, support |
| 42px / 0px 12px 0px 36px / 13px / r10px | 4 | addstudent |
| 32px / 0px 11px / 12.5px / r0px | 3 | addpayment |
| 14px / 0px / 11.5px / r0px | 2 | students, users |
| 32px / 0px 10px / 12.5px / r9px | 2 | activitylog |
| 34px / 0px 36px 0px 11px / 12.5px / r9px | 2 | addpayment |
| 15px / 0px / 12.5px / r0px | 1 | rooms |
| 19px / 0px / 15px / r0px | 1 | addpayment |
| 32px / 0px 11px / 11.5px / r9px | 1 | addpayment |
| 32px / 10px 14px 10px 32px / 13.5px / r8px | 1 | activitylog |
| 34px / 0px 11px 0px 36px / 12.5px / r9px | 1 | addpayment |
| 42px / 0px / 13px / r0px | 1 | support |
| 42px / 0px 12px / 13px / r0px 10px 10px 0px | 1 | addstudent |

### 16.5 Not determinable from static reading

| Item | Count | Measurement that would determine it |
|---|---|---|
| Declarations whose value is built at runtime (`VAR` or a JS expression) | 312 | Log computed styles for the elements those scripts touch |
| Cascade winners between different selectors on the same element | 18597 stylesheet declarations | getComputedStyle on each element per screen and state |
| Text over background images/gradients (contrast) | see §3 UNKNOWN rows | Pixel sampling of rendered screenshots |
| States not present on screen during measurement (hover, open menus, modals, errors) | all §10 states | Scripted measurement with each state forced |
| Behaviour at display scaling other than the measuring machine | — | Runs at 125% / 150% Windows scaling |
