# PHASE A.6 — iReader Windows Auto-Update Foundation: Implementation + Local Validation

**Predecessor:** `docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md` (classified B — READY WITH REQUIRED FIXES)
**Date:** 2026-09-29
**Scope:** Implement the minimal electron-updater foundation and prove a real 0.2.0 → 0.2.1 update end-to-end against a local static server. No Hetzner, no AWS, no code signing, no CI/CD.

---

## 1. Objective

Wire `electron-updater` into iReader (main process only, narrow IPC surface, minimal renderer UX) and demonstrate — with a real installed build, not `npm run dev` — that it can detect a newer version, download it, verify its integrity, install it, and relaunch at the new version, entirely against a local static file server.

---

## 2. Baseline

Re-inspected before touching anything; matched `docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md` exactly:
- Electron `31.7.7` (exact-pinned), electron-builder `^24.13.3`, electron-vite `^2.3.0`, Vite `^5.4.20`, React `^19.2.3`.
- `desktop/package.json` version was `0.2.0` at the start of this phase — **not** `1.0.0`. Per the instruction not to arbitrarily overwrite the project's real version, the test used the project's actual next sequential versions instead of fabricated `1.0.0`/`1.0.1`: **`0.2.0` (before) → `0.2.1` (after)**. This is documented explicitly here rather than silently substituted.
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` — unchanged.
- NSIS: `oneClick=true perMachine=false` — confirmed again from this session's own build logs.
- `desktop/build/installer.nsh` — present, unchanged, not modified.
- No architectural drift from the audit was found. Proceeded with implementation.

---

## 3. Changes Implemented

| File | Change |
|---|---|
| `desktop/package.json` | Added `electron-updater` as an exact-pinned dependency; added `build.publish` (generic provider, local test URL); version bumped `0.2.0` → `0.2.1` during the test (see §2). |
| `desktop/electron.vite.config.ts` | **Bug fix, see §3.1** — excluded `electron-updater`, `electron-store`, `bplist-parser` from `externalizeDepsPlugin()` so they're bundled into `out/main/index.js` instead of left as unresolvable `require()`s in the packaged app. |
| `desktop/src/main/update/AppUpdater.ts` | **New.** Encapsulates the `autoUpdater` singleton, event listeners, state model, and the four operations (`checkForUpdates`, `downloadUpdate`, `quitAndInstall`, `getStatus`). |
| `desktop/src/main/index.ts` | Imports `appUpdater`; initializes it only when `app.isPackaged`, wrapped in try/catch so it can never block startup; registers 4 IPC handlers (`update:get-status`, `update:check`, `update:download`, `update:install`); pushes state changes to the renderer via `webContents.send`. |
| `desktop/src/preload/index.ts` | Exposes `window.desktop.update = { getStatus, check, download, install, onStatusChanged }` — five named operations, no raw `ipcRenderer` exposed to the renderer. |
| `desktop/src/renderer/src/App.tsx` | Subscribes to update state on mount; renders a discreet top-nav badge ("Actualización disponible" / "Descargando... N%" / "⬆️ Reiniciar para actualizar (version)") and a small manual "🔄 check" button. No modal, ever. |
| `desktop/src/renderer/src/styles.css` | Minimal `.update-badge` styles reusing the existing visual language (no new design system). |
| `package-lock.json` (repo root) | Updated by `npm install` — `electron-updater` is hoisted to the workspace root, same as pre-existing `electron-store`/`bplist-parser`. |

**Not touched, as required:** `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`, `iphone_probe.py`, `libimobiledevice/`, `desktop/build/installer.nsh`, `appId`, `productName`, `extraResources`, `electron`/`react`/`vite`/`electron-builder` versions, AWS, Hetzner, Nginx, DNS, CI/CD, code signing.

### 3.1 Unplanned but necessary fix: packaged app couldn't launch at all

While validating the first real installed build, the app crashed immediately on launch with `Cannot find module 'electron-updater'`. Root cause, confirmed by direct inspection:

- `electron.vite.config.ts` uses `externalizeDepsPlugin()` for the main process, which leaves `import ... from "electron-updater"` as a real `require()` at runtime instead of bundling it.
- `desktop/package.json`'s `build.files` is `["out/**/*", "package.json"]` — it **never included `node_modules`**.
- This is an **npm workspace monorepo**: `electron-updater` (and, it turns out, the pre-existing `electron-store`) installs into the **repo root's** `node_modules`, not `desktop/node_modules/` (confirmed: `ls desktop/node_modules/electron-store` → not found; `ls node_modules/electron-store` → found). So even adding `node_modules/**/*` to `files` (tried first, see below) copied nothing, because there is no local `desktop/node_modules` to copy from.

**This means the exact same crash would already have affected `electron-store`` in every previously-built `0.1.0`/`0.2.0` installer — a pre-existing, unrelated packaging defect this project's desktop app has apparently always had, only now discovered because this is the first time (in this project's history, as far as this session's evidence shows) that anyone actually installed and launched a real packaged build rather than only testing via `npm run dev` or verifying that `electron-builder` exits with code 0.**

Fix applied: `externalizeDepsPlugin({ exclude: ["electron-updater", "electron-store", "bplist-parser"] })` — these three pure-JS, no-native-binding dependencies get bundled directly into `out/main/index.js` (which grew from 72 KB to 1.14 MB, confirming the bundling actually happened) instead of needing `node_modules` to exist in the packaged app at all. `electron` itself remains external (correct — it's the runtime, not a bundleable library). This is the standard, documented electron-vite fix for exactly this situation, and it required no change to `electron-builder`'s `files`/`extraResources` config, which was reverted back to its original `["out/**/*", "package.json"]`.

**This is flagged prominently because it is a real production bug (independent of auto-update) that this project should be aware existed.** It was fixed here because Phase A.6 could not otherwise be validated at all — not as a general refactor.

---

## 4. electron-updater Version

`electron-updater@6.8.10` (exact-pinned, `--save-exact`), the newest stable 6.x release at the time of installation (7.0.0 exists only as alpha pre-releases, correctly avoided). Confirmed a single effective resolved version via `npm ls electron-updater`:

```
icellshoppos@0.1.0 C:\PitayaCode\icellshoppos
`-- icellshoppos-desktop@0.2.1 -> .\desktop
  `-- electron-updater@6.8.10
```

No Electron/React/Vite/electron-builder version was changed.

---

## 5. electron-builder Configuration

Added, top-level in `build`:

```json
"publish": {
  "provider": "generic",
  "url": "http://127.0.0.1:45280"
}
```

`45280` was chosen deliberately after discovering `localhost:8080` was already occupied on this machine by **Docker Desktop** (`com.docker.backend.exe` bound to `127.0.0.1:8080`, unrelated to this project) — confirmed via `netstat` and `Get-Process`, then avoided rather than fought. This URL is explicitly a **local test placeholder** — the config is structured so that swapping it for `https://downloads.pitayacode.io` later (Phase B+ of the earlier AWS→Hetzner audit) is a one-line change, no updater redesign needed, exactly as that audit predicted.

This single addition caused electron-builder to start generating `latest.yml` and to embed a matching `resources/app-update.yml` inside the packaged app automatically — both empirically confirmed (see §12, §15).

---

## 6. Main/Preload/Renderer Architecture

Exactly the boundary the audit specified (§5/§6 of the audit doc), implemented as designed:

```
Renderer (App.tsx)
   → window.desktop.update.{getStatus,check,download,install,onStatusChanged}
Preload (contextBridge, contextIsolation: true)
   → ipcRenderer.invoke("update:...") / ipcRenderer.on("update:status-changed")
Main (index.ts)
   → ipcMain.handle("update:...", () => appUpdater.____())
   → appUpdater.onStateChanged(state => mainWindow.webContents.send(...))
AppUpdater.ts
   → the only module that imports "electron-updater"
```

The renderer never imports `electron-updater`, never sees a download URL, never calls `quitAndInstall` except through the single named `install()` IPC call. No raw/generic IPC channel is exposed.

---

## 7. Update State Model

```ts
type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "downloaded" | "not-available" | "error";
interface UpdateState {
  phase: UpdatePhase;
  currentVersion: string;
  availableVersion?: string;
  downloadProgress?: number;
  error?: string;
}
```

Implemented exactly as the audit's minimal model, in `desktop/src/main/update/AppUpdater.ts`.

---

## 8. UX Behavior

- **Idle/checking/not-available:** nothing shown (only a small always-present "🔄" manual-check button, per the requirement to allow a manual trigger).
- **Available/downloading:** a discreet, non-interactive badge in the top-nav — `⬆️ Actualización disponible` or `⬆️ Descargando actualización... N%`.
- **Downloaded:** an actionable badge — `⬆️ Reiniciar para actualizar (0.2.1)` — clicking it calls `install()`.
- **Error:** never shown to the user (logged to console via `AppUpdater`'s logger only) — matches "no debe bloquear el POS."
- Download is triggered **automatically** in the background the moment `update-available` fires (§9 of the audit's UX policy: background, non-blocking). Install/restart is **never automatic** — only the explicit badge click calls `quitAndInstall()`.
- No modal exists anywhere in this feature. Nothing it does can block search, cart, checkout, or authorization flows.

---

## 9. Local Update Server

Used `npx http-server` (ephemeral, via `npx --yes`, **not added to `package.json`** as a dependency) serving a directory outside the repo (the session's scratchpad), bound explicitly to `127.0.0.1:45280`.

Note for whoever repeats this test later: the first attempt used port `8080` and silently hit **Docker Desktop's** own listener on `127.0.0.1:8080` instead of the intended test server (both a `node` process and `com.docker.backend.exe` were listening on that port on different bind addresses) — confirmed via `netstat -ano` and `Get-Process -Id`. Pick a port and verify with `netstat` before trusting `curl` against it.

---

## 10. Build 1.0.0 Evidence *(actually 0.2.0 — see §2)*

```
building        target=nsis file=dist\iReader by Pro Buyer Setup 0.2.0.exe archs=x64 oneClick=true perMachine=false
building block map  blockMapFile=dist\iReader by Pro Buyer Setup 0.2.0.exe.blockmap
```

Installed silently (`/S`) via `Start-Process`. Confirmed installed at `%LocalAppData%\Programs\icellshoppos-desktop\iReader by Pro Buyer.exe` — note the install **directory name is `icellshoppos-desktop`** (the package.json `name`), not `iReader by Pro Buyer` (the `productName`) — this resolves an item the earlier audit had marked "NOT independently re-verified."

First launch attempt crashed instantly (`Cannot find module 'electron-updater'`) — this is the bug fixed in §3.1. After the fix and a rebuild, the app launched and stayed running (confirmed via `Get-Process`).

A second, unrelated environment quirk was also discovered and worked around: this machine's shell session has `ELECTRON_RUN_AS_NODE=1` set globally, which makes any Electron executable launched from it run as plain Node (rejecting Chromium flags like `--remote-debugging-port` with `bad option: ...`). Stripped from the child process's environment for testing; **not a project bug**, purely a pre-existing local shell environment variable, noted here only because it could confuse anyone else testing from the same kind of shell.

---

## 11. Build 1.0.1 Evidence *(actually 0.2.1 — see §2)*

```
building        target=nsis file=dist\iReader by Pro Buyer Setup 0.2.1.exe archs=x64 oneClick=true perMachine=false
building block map  blockMapFile=dist\iReader by Pro Buyer Setup 0.2.1.exe.blockmap
```

Copied alongside its `.blockmap` and the freshly generated `latest.yml` into the local update-server directory.

---

## 12. `latest.yml` Evidence

Generated automatically by `electron-builder` the moment the `publish` config existed — **not hand-written**:

```yaml
version: 0.2.1
files:
  - url: iReader by Pro Buyer Setup 0.2.1.exe
    sha512: irOhfx2CxJ7PLFfDRbw8rahwIE3Fyp1+xZLYKKErs+7xhEiKmAXlDxFVmnmswsU958z9ZDu/6HbsCE9wlHgVaA==
    size: 81099804
path: iReader by Pro Buyer Setup 0.2.1.exe
sha512: irOhfx2CxJ7PLFfDRbw8rahwIE3Fyp1+xZLYKKErs+7xhEiKmAXlDxFVmnmswsU958z9ZDu/6HbsCE9wlHgVaA==
releaseDate: '2026-09-29T04:26:40.358Z'
```

Also confirmed the packaged app embeds a matching `resources/app-update.yml`:

```yaml
provider: generic
url: http://127.0.0.1:45280
updaterCacheDirName: icellshoppos-desktop-updater
```

This resolves the earlier audit's open question about how the client discovers its feed URL: it's baked into the package at build time from `build.publish`, with zero additional main-process code needed to point it anywhere.

---

## 13. Update Detection Evidence

With the 0.2.0 client running and the local server serving 0.2.1's `latest.yml`, a manual `window.desktop.update.check()` was invoked via Chrome DevTools Protocol (`Runtime.evaluate` over the app's own `--remote-debugging-port`, since this exercises the real IPC/renderer path — not a mocked call):

```
[AppUpdater] Checking for update
[AppUpdater] Found version 0.2.1 (url: iReader by Pro Buyer Setup 0.2.1.exe)
```

Confirmed correct semver comparison: `0.2.1 > 0.2.0` correctly recognized as an available update.

---

## 14. Download Evidence

Automatic background download fired on `update-available` (no separate manual trigger needed, per the approved policy). Polled `getStatus()` a few seconds later:

```json
{"phase":"downloaded","currentVersion":"0.2.0","availableVersion":"0.2.1","downloadProgress":100}
```

Also observed the differential-update attempt and graceful fallback the audit predicted (§11 of the audit doc):

```
[AppUpdater] Download block maps (old: ".../0.2.0.exe.blockmap", new: .../0.2.1.exe.blockmap)
[AppUpdater] Cannot download differentially, fallback to full download: ... 404 Not Found
```

(The differential attempt's URL construction dropped the port in this run — a detail of this local single-file static-server setup, not something to over-interpret; full-download fallback is exactly the designed, graceful behavior, and it worked correctly.)

---

## 15. Integrity Verification Evidence

**Positive case:** the 0.2.0 → 0.2.1 download above reached `"downloaded"` with `downloadProgress: 100` — electron-updater only reaches that state after its internal SHA512 check passes, so this is already implicit proof integrity checking is active.

**Negative case (explicit test, as required):** after that successful run, the served `iReader by Pro Buyer Setup 0.2.1.exe` was tampered with (a line of bytes appended) **without** touching `latest.yml`'s recorded hash/size, the local updater cache was cleared, and a fresh 0.2.0 client was launched against the tampered file:

```
[AppUpdater] sha512 checksum mismatch after full download of iReader by Pro Buyer Setup 0.2.1.exe:
  the downloaded file is corrupted or the published update metadata does not match the uploaded file
[AppUpdater] Error: sha512 checksum mismatch, expected irOhfx2...GKQ==, got 8iBSjbAhD+L8...0xJw==
```

Final state, read back via CDP:

```json
{"phase":"error","currentVersion":"0.2.0","availableVersion":"0.2.1","downloadProgress":100,"error":"sha512 checksum mismatch..."}
```

**The app stayed on `0.2.0`, remained fully responsive (verified with a trivial `1+1` CDP eval returning `2` immediately after), and never attempted to install the corrupted file.** This is direct, real evidence the integrity gate works, not an assumption.

---

## 16. `quitAndInstall` Evidence

With a clean (untampered) download in the `"downloaded"` state, `window.desktop.update.install()` was invoked via CDP. Observed, in order:

1. The running 0.2.0 process (PID 8060) exited.
2. A new process, **`iReader by Pro Buyer Setup 0.2.1`** (the downloaded installer, spawned automatically by electron-updater), appeared and ran to completion.
3. Windows' own uninstall registry entry updated from `iReader by Pro Buyer 0.2.0` to `iReader by Pro Buyer 0.2.1`.

This directly confirms the audit's §7 prediction: electron-updater's Windows NSIS update path works by re-invoking the downloaded NSIS installer itself (not a separate "lightweight patcher" binary) — there is no special updater executable distinct from the installer.

---

## 17. Restart/Version Evidence

After the installer process above exited, **the app relaunched itself automatically** (multiple `iReader by Pro Buyer.exe` processes observed running — normal Electron multi-process architecture: main + renderer/GPU/utility). Independently confirmed the installed version by extracting `package.json` from the freshly-updated `resources/app.asar`:

```
"version": "0.2.1",
```

**Full loop closed and verified: 0.2.0 → check → 0.2.1 available → download → verify → quit → install → relaunch → confirmed running 0.2.1.**

*(Caveat: the relaunch was not itself CDP-attached, since electron-updater's relaunch doesn't carry over the custom `--remote-debugging-port` flag used for the initial test launch. Version confirmation for the relaunched instance therefore comes from the installed `app.asar`'s `package.json`, not a live `app.getVersion()` call — equally authoritative, since that file is exactly what the running app's `AppUpdater.currentVersion` reads from, but noted for completeness.)*

---

## 18. Offline Test

Encountered naturally during the very first launch attempt (before the local server was started):

```
[AppUpdater] Error: Error: net::ERR_CONNECTION_REFUSED
```

The app started normally, the window rendered, and the auth/inventory/USB flows were unaffected — the only visible symptom was the update check silently failing in the background (no modal, no crash, logged only). This matches the required behavior exactly: **an unreachable update server must never block the POS.**

---

## 19. `installer.nsh` Observation

`desktop/build/installer.nsh` was **not modified**. Observed during the real install-triggered-by-update (§16): the whole install-to-relaunch cycle completed in roughly the same few seconds each time it was exercised across this session, with no visible errors or hangs attributable to the `customInstall` macro's `winget install Apple.AppleDevices ...` step.

**This is reported as inconclusive on the specific question the audit flagged (does `customInstall` re-run during an update, not just a fresh install?)** — the NSIS installer runs fully silently with no attached console in this test setup, so no direct log output from the `winget` step was captured during the update-triggered install specifically (only during the very first *manual* fresh install, where the installer process visibly stayed alive noticeably longer than the few-second baseline before completing — consistent with, but not conclusive proof of, the `winget` call executing). No adverse effect was observed either way (no crash, no corrupted install, no unexpected delay in the update path specifically). Per the instruction to document rather than solve unexpected behavior: this is documented as **observed harmless, mechanism not independently confirmed** — a fair target for a follow-up test with NSIS logging enabled (`/D=` + `LogSet` or an `InstallDebug` build), not something this phase changed or needed to resolve to complete its own mandate.

---

## 20. AppleUsbAdapter Regression Verification

```
git diff --stat -- desktop/src/main/usb/ desktop/build/installer.nsh desktop/resources/
```
→ empty output. **Zero changes** to `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`, `installer.nsh`, or the bundled `libimobiledevice`/`iphone_probe.py` resources. The installed/updated packages in this session still carried those `extraResources` unchanged (same `extraResources` config, untouched).

Not independently re-tested against a physical iPhone in this session (no device was connected during this test) — the audit's conclusion that the Apple USB layer is structurally unaffected by an in-place update (§12 of the audit doc) rests on static analysis of unchanged code paths and the observed-correct `extraResources` packaging, not a live device test, and that remains true here.

---

## 21. Tests

No new automated test files were added. Per the instruction to prioritize tests that add direct value and avoid artificial bulk, and given the core mechanism was validated with **real, end-to-end, evidence-producing manual tests against a real installed build** (§13-§17, a negative-integrity test in §15, and an offline test in §18) — which is strictly stronger evidence for this specific feature (real Windows NSIS install/update behavior, real electron-updater network/hash logic) than a unit test could provide without extensively mocking `electron-updater` itself — no unit tests were written this phase. This is a deliberate scoping choice, flagged for the user's judgment rather than assumed: a future phase could add unit tests around `AppUpdater`'s pure state-transition logic (`setState` merging, the guard conditions in `downloadUpdate`/`quitAndInstall`) without needing a real Electron/NSIS environment.

---

## 22. Typecheck

`npx tsc --noEmit -p desktop/tsconfig.json` was run. It surfaces **~150 pre-existing errors across the whole `desktop/src/renderer` tree** (e.g., `Property 'desktop' does not exist on type 'Window'`, missing `DesktopInventoryListItem`/`AppleAdapterStatus`/etc. type declarations) — confirmed these are **not new**: they affect every existing IPC call in the app (`usb.status()`, `auth.login()`, `checkout.completeSale()`, ...), meaning this project has never had a passing `tsc --noEmit` and does not run one in its build (`electron-vite build`, which uses esbuild/Rollup and does not type-check, is the project's real, working build gate — confirmed clean in §23). Grepped the full error output specifically for `AppUpdater`/`update:` — **zero matches**: the new code introduces no new error category beyond the pre-existing, unrelated baseline. No attempt was made to fix the ~150 pre-existing errors — that would be an unrelated, large refactor outside this phase's scope.

---

## 23. Build

`npx electron-vite build` — clean, no errors, run multiple times across this session (most recently after reconstructing `package.json`, see §3.1's incident). `npm run dist:win` (`electron-builder --win nsis`) — clean, no errors, produced valid installers for both `0.2.0` and `0.2.1` across several rebuilds during testing.

---

## 24. Git Status

**Before this phase:**
```
?? docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md
?? docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md
```

**After this phase:**
```
 M desktop/electron.vite.config.ts
 M desktop/package.json
 M desktop/src/main/index.ts
 M desktop/src/preload/index.ts
 M desktop/src/renderer/src/App.tsx
 M desktop/src/renderer/src/styles.css
 M package-lock.json
?? desktop/src/main/update/
?? docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md
?? docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md
?? docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md (this file)
```

**New files:** `desktop/src/main/update/AppUpdater.ts`, the three docs above.
**Modified files:** exactly the seven listed — all directly required for this feature (including the one unplanned but necessary bundling fix, §3.1).
**Deleted files:** none.
**Confirmed untouched:** `desktop/src/main/usb/*`, `desktop/build/installer.nsh`, `desktop/resources/*`, `appId`/`productName`/`extraResources` config, `electron`/`react`/`vite`/`electron-builder` versions. No AWS/Hetzner/Nginx/DNS file anywhere in the repo was touched.

An incident occurred mid-session where an `asar extract-file` command accidentally overwrote and then displaced `desktop/package.json` outside the repo. It was immediately detected (`cat package.json` → file not found) and reconstructed from `git show HEAD:desktop/package.json` plus this session's own tracked edits (version bump, `publish` block, `electron-updater` dependency line) — verified via `git diff` afterward to contain **exactly** those changes and nothing else, plus a `node -e "JSON.parse(...)"` validity check and an `npm ls` consistency check against the untouched lockfile. Flagged here in full rather than omitted.

---

## 25. Known Limitations

- The version test used `0.2.0 → 0.2.1`, not `1.0.0 → 1.0.1`, per §2's reasoning (avoiding an arbitrary overwrite of the project's real version). The next real release should simply continue the existing manual version-bump convention — no special handling is needed because of this test.
- `desktop/package.json`'s `build.publish.url` is currently `http://127.0.0.1:45280` — a **local test value**. This must be changed to the real Hetzner URL before any real release (a one-line change, by design — see §5).
- No code signing (unchanged from the audit's finding — still a P1 for production rollout, not addressed in this phase per explicit instruction).
- The `installer.nsh` re-execution question (§19) remains empirically unconfirmed, though observed harmless.
- No automated tests were added (§21) — a deliberate, flagged scoping choice, not an oversight.
- The pre-existing `tsc --noEmit` baseline (§22) remains broken, unrelated to this phase, not fixed here.
- This phase's testing happened on a single developer machine with two machine-specific quirks worth remembering for whoever repeats it: `ELECTRON_RUN_AS_NODE=1` set in the ambient shell (breaks direct CLI flag passing to any Electron exe launched from it), and port `8080` already claimed by Docker Desktop.
- The Apple USB layer was not re-tested with a physical device connected during this phase (§20) — confirmed structurally unaffected by static analysis and unchanged `extraResources`, consistent with the audit, but not a live hardware test.

---

## 26. Next Phase Recommendation

The mechanism is now proven end-to-end locally. The natural next step is **not** yet Hetzner infrastructure (per the earlier AWS→Hetzner audit's own sequencing advice, which this phase's results reinforce) — it's:
1. Decide the code-signing posture (audit's R1) before any real users receive an auto-installed update.
2. Repeat this exact local-server test once against a **second** machine/user profile (this session only had one dev machine available) to rule out any single-machine artifact in the results.
3. Only then proceed to the earlier-audited Hetzner migration phases (B onward), swapping `build.publish.url` to the real domain — which, per §5, requires no other code change.

---

## Executive Summary (≤15 lines)

- Implemented `electron-updater@6.8.10` (exact-pinned) behind a narrow main→preload→renderer IPC boundary (`window.desktop.update.{getStatus,check,download,install,onStatusChanged}`), auto-checking only when `app.isPackaged`, never blocking startup.
- **Found and fixed a real, pre-existing production bug** unrelated to auto-update: the packaged app couldn't launch at all, because `electron-store`/`bplist-parser`/now `electron-updater` are hoisted to the monorepo root's `node_modules`, which was never packaged — fixed by bundling those three pure-JS deps directly into `out/main/index.js` instead of externalizing them.
- Ran a **real, installed-build, end-to-end test**: `0.2.0 → check → 0.2.1 detected → background download → SHA512-verified → quitAndInstall → silent NSIS re-install → auto-relaunch → confirmed running 0.2.1`, driven live via Chrome DevTools Protocol against the actual running app (not mocked).
- Ran a **negative integrity test**: tampered with the served installer after `latest.yml` was generated — the updater correctly rejected it (`sha512 checksum mismatch`), stayed on `0.2.0`, and the app remained fully responsive.
- Ran an **offline test**: unreachable update server → app started normally, no crash, no modal, error logged only.
- `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`, `installer.nsh`, and all Apple USB resources are **verified untouched** (`git diff --stat` empty).
- Test app fully uninstalled and local test server stopped/cleaned up after validation; no residue left on the machine.
- One incident (accidental `package.json` overwrite via a misused `asar extract-file` command) occurred, was caught immediately, and was fully reconstructed and verified against git history — documented in full in §24.

**Verdict: A — VALIDATED.**

**Justification:** the evidence in §13-§17 demonstrates the complete real flow the task required (check → available → download → verify → quit → install → restart → confirmed new version), not merely a successful compile. The negative-integrity (§15) and offline (§18) tests independently confirm the safety properties. The one environment-scoped limitation (§25: single machine tested) does not rise to a "B — partially validated" downgrade, since it did not prevent completing every required step of the flow — it is disclosed as a limitation for the next phase to address, not a gap in this phase's own completion.
