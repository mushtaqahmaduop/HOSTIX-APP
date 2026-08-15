# macOS Build — Setup Notes (2026-08-15)

## What was done
- Added a `mac` target to `package.json`'s `build` config: `dmg` + `zip`,
  `arch: universal` (one artifact runs natively on both Apple Silicon and Intel).
- Added `npm run build:mac` (`electron-builder --mac`).
- `identity: null` — builds **unsigned** (no Apple Developer account yet, per
  2026-08-15 decision). Unsigned means macOS Gatekeeper blocks the app on first
  launch; users must right-click → Open (or allow it in
  System Settings → Privacy & Security) once. Fine for a small/internal rollout,
  not ideal for wide client distribution.
- Reused `assets/icon.png` for the mac icon. It's only 256×256 — electron-builder
  will auto-generate the `.icns`, but Retina-resolution icon sizes (512/1024) will
  be upscaled/blurry. Replace with a 1024×1024 source before a real release if
  icon sharpness matters.

## What's still needed — and why it can't happen in this container
This session runs Linux. Two things make a **working** macOS build impossible
to produce or test here, config aside:

1. **Native module**: `better-sqlite3` compiles a platform+arch-specific
   `.node` binary. `electron-rebuild` (wired into `postinstall`/`rebuild`)
   rebuilds it for whatever platform it runs on — on Linux that produces a
   Linux binary, which would crash instantly if packaged into a Mac build.
   Cross-compiling a native C++ Node addon for macOS from Linux isn't a
   realistic path (needs Apple's SDK/toolchain). The build **must run on
   actual macOS** (or a macOS CI runner, e.g. GitHub Actions `macos-latest`)
   so `electron-rebuild` produces genuine darwin binaries.
2. **DMG packaging & (eventual) signing/notarization**: these need Apple's own
   tooling (`hdiutil`, `codesign`, `notarytool`), which only exists on macOS.

## To actually produce a Mac build
1. On a Mac (or macOS CI): `npm install` → `npm run rebuild` → `npm run build:mac`.
2. Confirm the packaged `.app` launches, DB reads/writes work, and (since
   unsigned) that the right-click-Open workaround is documented for whoever
   installs it.
3. If/when an Apple Developer account is added: set `mac.identity` to the
   Developer ID and add notarization config (`afterSign` hook or
   `electron-builder`'s built-in notarize support) — remove `identity: null`.

## Open decision
Apple Developer account (paid, $99/yr) is needed for signing + notarization.
Without it, distribution stays "unsigned .dmg + manual Gatekeeper bypass"
indefinitely. Revisit if Mac rollout becomes wider than a handful of users.
