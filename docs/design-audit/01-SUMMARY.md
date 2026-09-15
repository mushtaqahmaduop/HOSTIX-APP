# HOSTIX-APP — Design Truth Audit — Summary

Scope: 79 files, 66946 lines (30 CSS, 4 HTML, 45 JS; third-party minified JS and non-renderer tools excluded — list in 02-DETAIL §0). Extracted: 5382 CSS rules, 23217 declarations, 953 inline style attributes, 354 JS style/class operations. Rendered values measured in the running app on 20 screens (dashboard, rooms, students, payments, expenses, cancellations, former, reports, issues, activitylog, backup, users, settings, support, archive, maintenance, complaints, addstudent, addpayment, login), light and dark, viewport 1366×728 CSS px (devicePixelRatio 1); horizontal overflow at viewport widths 1400, 1366, 1280 (emulated), 1100 (emulated), 1024 (emulated), 900 (emulated) px (02-DETAIL §8.4).

## What exists

- **Stylesheets:** 30 linked from renderer/index.html in a fixed order (02-DETAIL §13.1), plus <style> blocks in 3 other HTML files and CSS strings built in JS.
- **Type:** 36 distinct font-family stacks, 67 distinct font-size values, 21 weights, 25 line-heights. 25 font files on disk; 0 not referenced by any @font-face. Network fonts: 0.
- **Colour:** 523 distinct colour literals (1477 occurrences); 120 colour custom properties (9 never referenced). 214 literal uses equal an existing colour variable's value. Theme = `light-theme` class on <body>, light by default.
- **Contrast:** 62 failing text/background combinations in light, 25 in dark (distinct fg/bg/size/weight combinations, WCAG 2.1 AA).
- **Spacing:** 68 distinct side values; 23 used only once or twice. GCD of whole-pixel values: 1px.
- **Shape & depth:** 49 border-radius values, 110 distinct box-shadows, 30 z-index values.
- **Motion:** 39 durations, 15 easing curves, 48 @keyframes (6 unreferenced); prefers-reduced-motion: 11 occurrences.
- **Responsive:** 150 @media queries over 41 distinct breakpoints; main window 1400×900, minimum 900×600 (main.js:1195).
- **Architecture:** 953 inline style attributes, 67 !important, 546 selectors at specificity ≥(0,3,0), 398 identical-selector conflicts, 176 classes defined in more than one file, 386 classes not found in markup/JS (+18 possibly built dynamically).
- **Icons:** 293 inline <svg>, 506 icon() calls, 104 emoji characters, 23 <img>; 48 image assets referenced by nothing (25 in stitch-prototypes/images/, 17 in repo root, 6 in assets/).
- **Text:** 485 <button> elements; 180 error toasts; 30 confirmation dialogs; 220 empty-state strings; currency via fmtPKR 431× and literal "Rs." 49×, "PKR" 30×.
- **Accessibility:** 102 aria-* attributes, 86 onclick handlers on non-interactive tags in markup (83 without a role).

## Variants per component (class names with a visual signature, 02-DETAIL §9)

| Component | Variants |
|---|---|
| button | 104 |
| input | 17 |
| select | 11 |
| textarea | 0 |
| checkbox / radio / switch | 7 |
| card / panel | 89 |
| table | 74 |
| modal / dialog | 23 |
| dropdown / menu | 34 |
| tab | 14 |
| badge / pill / chip | 83 |
| toast / alert / banner / notice | 65 |
| tooltip | 5 |
| sidebar / nav item | 56 |
| pagination | 9 |
| avatar | 22 |
| icon | 58 |
| empty state | 54 |
| loading indicator | 5 |
| progress bar | 37 |

## Headline table

| Dimension | Distinct values found | Where concentrated |
|---|---|---|
| Font families | 36 | renderer/payments.css (47); renderer/students.css (37); renderer/style.css (36) |
| Font sizes | 67 | renderer/dashboard.css (174); renderer/style.css (165); renderer/students.css (155) |
| Font weights | 21 | renderer/students.css (106); renderer/dashboard.css (104); renderer/style.css (98) |
| Line heights | 25 | renderer/dashboard.css (39); renderer/settings.css (25); renderer/students.css (24) |
| Colours (literal) | 523 | renderer/style.css (503); renderer/src/modules/students.js (161); renderer/tokens.css (96) |
| Colour variables | 120 | renderer/tokens.css (125); renderer/dashboard.css (68); renderer/style.css (39) |
| Spacing values | 68 | renderer/dashboard.css (944); renderer/style.css (832); renderer/students.css (645) |
| Border radii | 49 | renderer/style.css (158); renderer/dashboard.css (90); renderer/settings.css (77) |
| Shadows | 110 | renderer/style.css (83); renderer/payments.css (15); renderer/chrome.css (14) |
| Transition durations | 39 | renderer/style.css (84); renderer/dashboard.css (28); renderer/students.css (14) |
| Easing curves | 15 | renderer/style.css (69); renderer/dashboard.css (38); renderer/students.css (20) |
| Breakpoints | 41 | renderer/dashboard.css (50); renderer/payments.css (11); renderer/students.css (11) |
| z-index values | 30 | renderer/style.css (22); renderer/students.css (6); renderer/license.html (5) |
| Button variants | 104 | 26 files define them |
| Input variants | 17 (class signatures); 15 rendered text-input variants | 13 files define them |
| Card variants | 89 | 17 files define them |
| Modal variants | 23 | 3 files define them |
| Table variants | 74 (class signatures); 12 rendered table variants | 17 files define them |
| Inline style attributes | 953 | renderer/src/modules/dashboard.js (222); renderer/src/modules/students.js (169); renderer/src/modules/reports.js (134) |
| `!important` uses | 67 | renderer/style.css (39); renderer/dashboard.css (11); renderer/chrome.css (7) |
| Contrast failures (light) | 62 | dashboard (17); payments (14); reports (7) |
| Contrast failures (dark) | 25 | payments (6); users (5); cancellations (4) |
