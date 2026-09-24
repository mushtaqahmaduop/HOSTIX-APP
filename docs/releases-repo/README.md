# hostyllo-releases

Public home of **Hostyllo Offline** releases. It holds only what installed apps
download — never source code:

| File | What reads it |
|---|---|
| Release assets: `Hostyllo-Offline-Setup-<version>-x64.exe`, `latest.yml` | The app's updater (**Help → Check for Updates** and the check at startup) |
| `control-plane.json` (root of `main`) | Every 6.x install, once a day, to find the licence server |

Builds from 6.0.0 on read this repository. The source lives in a separate,
private repository.

## Publishing a release

1. In the source repository, `npm run build` on the release PC.
2. Here: **Releases → Draft a new release**, tag `v<version>` (e.g. `v6.0.0`),
   and upload from `dist\`:
   - `Hostyllo-Offline-Setup-<version>-x64.exe`
   - `latest.yml`
3. Publish it (not as a pre-release). Installed apps see it at their next check.

`latest.yml` must come from the **same** build as the installer next to it: it
carries the installer's SHA-512, and the updater refuses a file that does not
match.
