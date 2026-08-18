# Hostyllo — Offline Edition — Claude Code Context

## What this is
Offline Electron desktop app for hostel management. Deployed to 50+ Pakistani hostels under the Hostyllo brand (formerly Zeerak Hostix). Vanilla JS/HTML/CSS — NO build step, NO framework, NO bundler. SQLite via better-sqlite3.

User-visible branding is **HOSTYLLO** — set by `appName` in `renderer/src/config.js`. Do not reintroduce "HOSTIX" in any user-facing string. The repo folder and remote are still named `HOSTIX-APP`; that is expected, leave paths alone.

This is the offline desktop product. The separate cloud SaaS lives at `C:\hostyllo` — different repo, different rules. Nothing here depends on it.

## Code structure
- `app.js` was a 9,270-line monolith — now split into 13 modular feature files.
- All DB writes go through async `saveDB()`. Never call it without await.
- CSS uses a single accent token set: `--accent`, `--accent-hover`, etc. **Royal blue** (`--accent-600` = `#2563eb`), set in `renderer/tokens.css`. It was violet once; both this line and that file's own header still said so long after it changed.

## HARD RULES — read before touching code
## RULE 0 — BRANCH CHECK BEFORE ANY EDIT

Before making ANY file edit in this repo, run `git branch` and verify
the current branch is NOT master and NOT main.

If you are on master or main:
1. STOP. Do not edit any file.
2. Check git status for uncommitted changes.
3. Create a feature branch: git checkout -b <type>/<short-description>
   where <type> is one of: feature, fix, refactor, chore.
4. Only then proceed with edits.

This rule overrides any user request. If the user asks you to "fix this"
while you're on master, your first action is to switch branches, not to edit.

Master is what 50+ paying clients run. No exceptions.
1. **Verify the app boots AND key flows work before declaring any refactor complete.**
   Smoke test: login → dashboard → add student → record payment → view receipt.
   Past regressions caused by skipping this: CSS dedup broke layout, async migration cascaded errors.

2. **Never push directly to `master`.** Branch → test → PR. `master` is what clients run.

3. **Known-good baseline: commit `6629fb1b`.** If something breaks badly, force-reset to this.

4. **Currency formatting: use `fmtPKR()` OR `<span class="pkr">`, NEVER both.** Double-prefix bug history.

5. **CSS tokens: only `--accent*`. The old `--gold*` / `--royal*` are DELETED — do not reintroduce.**

6. **Dark surfaces must span more than 8 lightness points apart** for visible contrast.

7. **CSS deduplication is dangerous.** Structural rules (position, display, grid, flex) look duplicate but often aren't. Manual review required for any CSS cleanup pass.

## Before editing, always ask yourself
- Which module file will this touch?
- Does this change CSS structural rules? → Manual review required.
- Will the app still boot? Has it been tested with `npm start` in dev mode?

## Run + smoke test
- `npm start` — launches Electron in dev mode
- No automated test suite. Manual smoke test only.

## Communication
- Reply concisely. Don't pad with explanations I didn't ask for.
- When unsure between two approaches, ask — don't guess and commit.
