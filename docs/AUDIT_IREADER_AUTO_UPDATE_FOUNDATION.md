# AUDIT — iReader Windows Auto-Update Foundation (Phase A.5)

**Scope:** Technical feasibility/design audit only. No code changed, no dependencies installed, no package.json/electron-builder/electron/React changes, no infrastructure touched, no releases published, no `npm audit fix` run.

**Date:** 2026-09-28
**Auditor:** Claude (Sonnet 5), at user request
**Predecessor document:** `docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md` (Phase A)

---

## 1. Executive Summary

This audit inspected the real repository (not assumptions) to determine whether adding `electron-updater` on top of the current Electron 31.7.7 / electron-builder 24.13.3 / NSIS setup is technically sound, and where the design's hard edges are.

**Bottom line: there is no architectural blocker.** The project's existing shape is, if anything, unusually well-suited to this addition:

- The NSIS installer already builds **per-user, one-click** (`oneClick=true perMachine=false`, confirmed from electron-builder's own build log in the prior session) — this is the one NSIS configuration where electron-updater's Windows auto-update path does **not** need to request UAC elevation to replace files. A per-machine installer would have made this meaningfully harder.
- `contextIsolation: true` / `nodeIntegration: false` are already correctly set, and every existing feature (USB, auth, inventory, etc.) already follows a clean "main process owns everything privileged, preload exposes a narrow typed surface, renderer only calls `window.desktop.*`" pattern. The updater fits that exact mold with no redesign.
- `app.isPackaged` is already the app's dev/prod signal (used once today, in `createWindow()`), which is the correct switch to gate "never check for updates in dev."
- Versioning has a single, unambiguous source of truth: `desktop/package.json`'s `"version"` field (manually bumped; no automation exists — confirmed by absence of semantic-release/changesets tooling).

**What genuinely needs a decision before writing code (not blockers, but open questions this audit will not silently resolve):**
1. **Code signing is completely absent** (§13) — not a hard technical blocker for the update mechanism to *function*, but it directly affects whether Windows SmartScreen/AppLocker will interfere with silently-downloaded, silently-installed updates, and how much user trust friction there is on first install.
2. **No `publish` config exists yet anywhere** (confirmed again from the current `desktop/package.json`), so `latest.yml` still doesn't exist — this audit documents exactly what it must contain and how it gets produced, but does not create it.
3. The Apple USB device layer (`AppleUsbAdapter`, `libimobiledevice`, `iphone_probe.py`) is architecturally unaffected by adding an updater — it ships inside the same installed package and updates along with everything else — but it runs short-lived child processes on a 3.5s poll (`UsbContext.tsx`), which is a minor, avoidable timing consideration for *when* an update is allowed to apply (§12).

**Final decision: B — READY WITH REQUIRED FIXES** (see §24 for the precise list). Nothing found here is a P0 blocker for beginning implementation; two P1 items should be resolved before shipping this to real store computers.

---

## 2. Current Electron Architecture

Evidence, with file:line references.

| Aspect | Finding | Source |
|---|---|---|
| Electron version | `31.7.7`, pinned exact (no `^`) as of the previous session's fix | `desktop/package.json` devDependencies |
| electron-builder version | `24.13.3` (range `^24.13.3` in package.json; installed version confirmed via `node_modules/electron-builder/package.json`) | `desktop/package.json`; `desktop/node_modules/electron-builder/package.json` |
| electron-vite / Vite | `electron-vite@^2.3.0`, `vite@^5.4.20` | `desktop/package.json` |
| React | `^19.2.3` | `desktop/package.json` |
| Node version | No `engines` field in either `desktop/package.json` or the root `package.json`; no `.nvmrc` found anywhere in the repo. The Node actually running in this environment is `v24.14.0` — **NOT VERIFIED** that this matches what store computers run. | Repo search; `node --version` in this session |
| App entry point (main) | `desktop/src/main/index.ts` (`"main": "out/main/index.js"` in package.json) | `desktop/package.json:6` |
| Preload | `desktop/src/preload/index.ts`, built to `out/preload/index.mjs`, loaded via `webPreferences.preload` | `desktop/src/main/index.ts:297` |
| Renderer | `desktop/src/renderer/src/App.tsx` + components, built to `out/renderer/index.html` | `desktop/src/main/index.ts:355` |
| Window creation | Single `createWindow()` function, single `mainWindow` reference, single-instance lock enforced (`app.requestSingleInstanceLock()`) | `desktop/src/main/index.ts:30-41, 261-359` |
| IPC pattern | `ipcMain.handle(channel, handler)` in main, mirrored 1:1 by `ipcRenderer.invoke(channel, ...)` wrappers in `desktop/src/preload/index.ts`, exposed via `contextBridge.exposeInMainWorld("desktop", {...})`. Every existing feature (auth, inventory, USB, checkout, credit, data-admin, etc.) follows this exact shape — including the driver-installer feature added in the prior session (`usb:install-drivers`). | `desktop/src/main/index.ts` (40+ `ipcMain.handle` calls); `desktop/src/preload/index.ts` |
| Security-relevant `webPreferences` | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false` | `desktop/src/main/index.ts:296-301` |
| Persistent local state | `electron-store` (`window-state.json` under userData) for window bounds; a custom `WindowsSafeStorageAdapter` (wrapping Electron's `safeStorage`) for the session cookie. No existing "update state" store of any kind. | `desktop/src/main/index.ts:17-24`; `desktop/src/main/storage/WindowsSafeStorageAdapter.ts` |

No assumptions were made — every row above is a direct repository read.

---

## 3. Current Update State

Re-confirmed from the Phase A audit, re-verified in this session by re-grepping the exact same terms:

- `electron-updater`: **not a dependency**, not present in `node_modules`, not referenced in any `.ts`/`.tsx` file under `desktop/src`.
- No `autoUpdater`, `checkForUpdates`, `checkForUpdatesAndNotify`, `setFeedURL`, `quitAndInstall`, `downloadUpdate`, `updateConfigPath` anywhere.
- No `publish` block in `desktop/package.json`'s electron-builder config (re-read in full for this audit — unchanged since Phase A other than the `nsis.include` line added for the (unrelated) driver-install feature).
- No `latest.yml` anywhere in the working tree or git history (already established in Phase A; not re-verified by re-running a build in this audit, per the "no builds" restriction — this audit relies on Phase A's already-recorded evidence for that specific fact rather than re-generating it).

**Conclusion: identical to Phase A's finding.** There is nothing to "migrate" or "reconfigure" — this would be new capability, built from zero.

---

## 4. Electron / electron-updater Compatibility

This section necessarily draws on general, publicly documented facts about the `electron-builder`/`electron-updater` ecosystem (they are maintained in the same GitHub organization, `electron-userland`, with `electron-updater` versioned to track `electron-builder`'s NSIS/artifact conventions). **This is general ecosystem knowledge, not something verifiable by reading this repository** — flagged explicitly so it isn't confused with a repo-sourced fact, consistent with how Phase A handled the `latest.yml` schema question.

- **Electron 31.7.7 compatibility:** `electron-updater` has no hard dependency on a specific Electron version — it's a plain Node/Electron-main-process library that uses standard Electron APIs (`app`, `BrowserWindow`, `autoUpdater`-adjacent event emitters) that have been stable across many major Electron versions. Electron 31 (mid-2024-era) is well within the range covered by any reasonably current `electron-updater` 6.x release.
- **electron-builder ↔ electron-updater relationship:** `electron-updater` is the *consumer* half of the artifact format `electron-builder` *produces* (the NSIS installer + `.blockmap` + `latest.yml`). They are designed as a matched pair — using `electron-builder` 24.13.3 to build and a current `electron-updater` 6.x to consume is the expected, documented pairing; there is no known version-lockstep requirement forcing an exact match beyond "both reasonably current major versions."
- **Risk of updating `electron-updater` independently of Electron:** Low. `electron-updater` is a devDependency/dependency of the *app*, not a fork of Electron — bumping it later (e.g. 6.1 → 6.3) is an ordinary dependency bump, not an Electron upgrade. It does **not** require bumping Electron itself.
- **Would Electron need to change to implement auto-update?** No. Nothing about adding `electron-updater` requires touching the pinned `31.7.7` version.

### A. `electron-updater` + generic provider vs. B. custom update implementation

| Criterion | A. electron-updater + generic | B. Custom |
|---|---|---|
| Matches artifacts electron-builder already produces (`.blockmap`, NSIS installer, differential update format) | Yes, natively — zero extra build work | No — would require reverse-engineering or discarding the `.blockmap` format, or building your own diffing |
| Security-sensitive code (signature/hash verification of downloaded binaries before execution) | Already implemented and battle-tested upstream | Would need to be written and maintained in-house — this is exactly the kind of code where a subtle bug is a real security incident (silently running an unverified downloaded binary) |
| NSIS silent-install invocation, UAC handling, per-user vs per-machine nuances | Already handled | Would need to be reimplemented from scratch |
| Maintenance burden | Tracks upstream Electron/Windows changes automatically via dependency bumps | 100% on this team, indefinitely |
| Fit with this project's existing per-user NSIS config (§7) | Direct fit — this is the scenario electron-updater's Windows path is designed around | N/A — same NSIS quirks would still need handling manually |

**Recommendation: A (electron-updater + generic provider).** This is a technical judgment specific to this project's situation (an existing electron-builder/NSIS pipeline, a small team, no existing update-signature-verification code to build on) — not a general endorsement of the library over all alternatives in the abstract.

---

## 5. Security Model

Direct evidence, `desktop/src/main/index.ts:296-301`:

```ts
webPreferences: {
  preload: join(__dirname, "../preload/index.mjs"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: false,
},
```

- **`contextIsolation: true`** — the renderer's JS context is isolated from the preload script's context; `window.desktop` is the *only* bridge, built via `contextBridge.exposeInMainWorld` (`desktop/src/preload/index.ts:1-3`). The renderer cannot reach into preload internals or Node globals directly. **Correct posture for an updater bridge** — an update-check/download trigger exposed this way is exactly as safe as every other IPC call already in this app.
- **`nodeIntegration: false`** — renderer has no direct `require`/`fs`/`child_process` access. Confirmed no override anywhere (`nodeIntegration: true` does not appear anywhere in the codebase).
- **`sandbox: false`** — the renderer process does **not** run inside Chromium's OS-level sandbox. This is a pre-existing deviation from Electron's own recommended hardening baseline (`sandbox: true` is the modern default/recommendation), **unrelated to auto-update** and out of scope to change here (changing it could affect the entirely-unrelated `qrcode`/other renderer code — not touched, not assessed further, flagged only as a pre-existing condition this audit did not introduce or need to fix).
- **IPC pattern**: every privileged operation (`fs`, network, `child_process`, `shell`) already lives exclusively in `desktop/src/main/`, invoked from the renderer only via named `ipcMain.handle`/`ipcRenderer.invoke` pairs. There is no existing instance anywhere of the renderer being handed a raw filesystem path, a shell command, or a Node child-process handle.

### Where updater logic should live

**Entirely in the main process**, mirroring the existing `usb:*` feature exactly (main: `desktop/src/main/usb/AppleUsbAdapter.ts` + `AppleDriverInstaller.ts`; IPC: `ipcMain.handle("usb:...")`; preload: `usb: { status, devices, installDrivers }`; renderer: calls only `window.desktop.usb.*`).

Concretely, the future implementation should place:
- The `autoUpdater` instance and all its event listeners (`update-available`, `download-progress`, `update-downloaded`, `error`) **only** in `desktop/src/main/index.ts` (or a new `desktop/src/main/update/AppUpdater.ts` module, following the existing `usb/` subfolder convention).
- A small number of **narrow, one-way-intent** IPC channels exposed via preload, e.g. `update:check`, `update:download`, `update:install`, and a **push** channel (main → renderer, via `webContents.send`, the same direction `AgentInboxGateway`-style push isn't used here but Electron natively supports `win.webContents.send(...)`) for status events (`update:status-changed`) so the renderer can reflect progress without polling.
- **The renderer should never**: choose the download URL, touch the filesystem, or invoke `quitAndInstall` through anything except a single named IPC call that the main process fully controls. This mirrors exactly how `handleInstallAppleDrivers` in `App.tsx` already just calls `window.desktop.usb.installDrivers()` and reacts to the return value — it has no ability to run `winget` itself.

**Boundary conclusion:** No new security model is needed — the existing one already correctly supports this. The only discipline required is: don't expose more than `check / download / install-and-restart / status` as IPC verbs, exactly as narrow as the existing `usb.installDrivers()` surface.

---

## 6. App Lifecycle

Full lifecycle inventory, `desktop/src/main/index.ts`:

| Hook | Present? | Location |
|---|---|---|
| `app.requestSingleInstanceLock()` / `second-instance` | Yes | Lines 30-41 |
| `app.whenReady()` | Yes — single top-level `.then(async () => {...})` block that does: init secure storage → build menu → create window → register ~50 `ipcMain.handle` calls → register `app.on("activate")` | Lines 400-1527 |
| `app.on("activate")` | Yes (inside the `whenReady` block) — recreates the window if none exist (mac-style re-open) | Lines 1522-1526 |
| `app.on("window-all-closed")` | Yes — quits on non-mac | Lines 1529-1533 |
| `app.on("before-quit")` | **Not present anywhere.** |
| `app.on("will-quit")` | **Not present anywhere.** |
| Any update/download event handling | **Not present anywhere** (confirmed, §3). |

### Recommended design (not implemented) for where updater hooks belong

- **Initialize the updater** (construct the `autoUpdater`/equivalent object, wire its event listeners) once, inside the existing `app.whenReady()` block, **after** `mainWindow = createWindow()` so status events have a window to push to — guarded by `if (app.isPackaged)` so a `npm run dev` session never attempts a network check (§14).
- **Check for updates**: on a delay after `ready-to-show` (the window already has a `revealWindow()` callback and a 2-second fallback timer at line 329 — an update check piggybacking a few seconds after that, e.g. "after first paint, wait ~5-10s, then check," is a reasonable non-invasive point; NOT a claim that this exact number is correct, only that this is the right *place* in the existing lifecycle to reason about it) and then on a recurring interval (e.g. every few hours) while the app stays open, since this is a POS terminal likely left running for a full business day.
- **Download**: only after an explicit "update available" state — whether it downloads automatically or waits for user confirmation is a UX policy decision (§13/§10 of the audit), not a lifecycle-placement question; either way it's triggered from the main process's updater instance, not from arbitrary renderer code.
- **Install**: must go through `quitAndInstall()`-equivalent, which needs the app to actually quit — there is currently no `before-quit`/`will-quit` handler to interact with. A future implementation should add one **only if** it needs to guard against quitting mid-download or mid-USB-probe (see §12) — this audit flags the need, not the implementation.
- **Restart**: same call as install for NSIS (electron-updater's Windows NSIS path restarts the app after applying the update in one step) — no separate "restart" lifecycle point exists to design around beyond the one quit/relaunch transition.

### Scenario coverage (as requested)

| Scenario | Current lifecycle support | Gap |
|---|---|---|
| First launch | `app.whenReady()` → `createWindow()`, no update check today | Would need the `app.isPackaged`-gated check described above |
| Subsequent launches | Same path, every launch | Same |
| Offline | No network-dependent code runs today except the app's own backend API calls (`apiRequest`, lines 361-398), which already have their own error handling | An update check must fail silently/gracefully — not block window creation or show a scary error on a POS terminal with no internet that day |
| Slow connection | N/A today | Download must be resumable/cancelable in principle — this is `electron-updater`'s job, not something this app's lifecycle currently accounts for either way |
| App closing mid-something | `win.on("close")` only persists window bounds (line 331-340); no "is an update in progress" guard exists | A future implementation needs to decide whether to block close during an active download, or let it cancel silently |
| Update pending (downloaded, not installed) | No concept exists today | Needs new state (§10 UX) — likely a small `electron-store` entry or the updater's own event state, not yet designed here |

---

## 7. Windows NSIS Analysis

Config source: `desktop/package.json` `build.win`/`build.nsis`, and `desktop/build/installer.nsh` (added in the prior, unrelated driver-install session).

```json
"win": { "target": ["nsis"], "signAndEditExecutable": false },
"nsis": { "include": "build/installer.nsh" }
```

- **per-user vs per-machine**: Confirmed via electron-builder's own build log from the prior session (`oneClick=true perMachine=false`) — this is the **effective default** since neither `oneClick` nor `perMachine` is explicitly set in config. Per-user install location is electron-builder's standard `%LocalAppData%\Programs\<productName>` for this configuration (electron-builder default path for a non-perMachine NSIS target) — **NOT independently re-verified in this audit by inspecting an actual installed directory** (that would require running the installer, out of scope), but this is the documented, standard behavior for `oneClick + !perMachine`, consistent with the observed build log flags.
- **Admin privileges needed?** No — per-user installs do not require UAC elevation to install *or*, critically for auto-update, to **self-update** later (the app process already has write access to its own per-user install directory). This is the single most update-friendly property this project already has.
- **Write permissions**: Per-user install directories are writable by the owning user without elevation — consistent with "no UAC prompt" above.
- **Compatibility with auto-update**: **Favorable.** electron-updater's Windows NSIS differential-update path is specifically designed around exactly this per-user, one-click shape; per-machine (Program Files) installs are the harder case (would need elevation-handling this project doesn't have and doesn't need).
- **`installer.nsh` (`desktop/build/installer.nsh`) — does it introduce risk for auto-update?** Its only content is a `!macro customInstall` block that best-effort runs `winget install Apple.AppleDevices ...` via `nsExec::ExecToLog`, swallowing any failure (`Pop $0`, result discarded) — added for the driver-install feature, unrelated to updates. It runs once, during the **initial installer** run. electron-updater's Windows update path for NSIS does **not** re-run the full NSIS installer script for every update by default — it applies the update via its own differential/full-file-replacement mechanism, not by re-invoking `installer.nsh`'s `customInstall` macro. **This is stated with a caveat, not asserted as fully repo-verified**: electron-updater's NSIS update flow *can*, depending on configuration, invoke a lighter "install-mode" NSIS script rather than the full one-click installer UX — the precise behavior around whether `customInstall` re-runs on an *update* (vs. a fresh *install*) is standard `electron-builder`/`electron-updater` NSIS behavior, not something this repository's evidence can settle by inspection alone; flagged as a design point to confirm empirically during Phase A.5 implementation/testing (§18 local test plan), not a blocker.
- **Does `iReader by Pro Buyer Setup {version}.exe` coexist with electron-updater?** Yes, structurally — this *is* the exact artifact electron-updater expects to find referenced from `latest.yml` and download. No renaming or restructuring is needed; the default `artifactName` template already produces a version-stamped filename, which is what `latest.yml` needs to point to.

---

## 8. Versioning

- **Single source of truth**: `desktop/package.json`'s `"version"` field. Confirmed empirically in the prior session: bumping this field from `0.1.0` to `0.2.0` and rebuilding produced `iReader by Pro Buyer Setup 0.2.0.exe` with no other file needing to change — electron-builder reads it directly for both the artifact filename and the embedded app version metadata.
- **No automation**: no semantic-release, no changesets, no git-tag-driven versioning script exists anywhere in `desktop/` (grepped for all three; zero matches). Version bumps are, today, a manual edit.
- **semver compatibility**: `0.2.0` is valid semver; nothing in the current setup violates or constrains semver in any way. electron-updater relies on semver comparison to decide "is the published version newer than mine" — this repo's manual-bump approach is compatible as long as whoever bumps it does so correctly and doesn't accidentally publish a version *lower* than what's already out (a human-process risk, not a tooling one — see §11).
- **What must happen for 1.0.1 after 1.0.0**: bump `desktop/package.json`'s `version`, rebuild (`npm run dist:win`), and — once a `publish` config exists — that build step would need to also regenerate `latest.yml` (it does not today, because no `publish` config exists, per §3). Nothing else in the repo currently reacts to a version bump (no CI, no changelog generation, no tagging automation).
- **What `latest.yml` must contain (general electron-updater knowledge, not observed in-repo — flagged per the same convention as Phase A §7)**: a `version` field, a `files` array (each entry naming the artifact, its `sha512`, and `size`), a top-level `path` (or the newest file's name) for backward compatibility with older electron-updater versions, and a `releaseDate`. This audit does **not** generate this file or assert this is the *exact* schema this project's future config will produce — it is standard, publicly documented electron-builder output shape, noted here only to inform the design, not as a repo fact.

---

## 9. Generic Provider Architecture

Evaluating the shape proposed in Phase A:

```
iReader → electron-updater → generic provider → HTTPS → downloads.pitayacode.io → latest.yml → installer + blockmap
```

- **Is this valid?** Yes — the `generic` provider is electron-updater's provider specifically designed for "any plain HTTPS static file host," with no cloud-provider-specific API calls. Nothing about this project's current artifacts (a `.exe`, a `.exe.blockmap`, and a would-be `latest.yml`) requires anything beyond static file serving.
- **What must be public?** `latest.yml`, the installer `.exe`, and the `.blockmap` all must be reachable by a plain unauthenticated `GET` — electron-updater's generic provider has no mechanism to attach credentials or custom headers by default.
- **What URLs must exist?** At minimum: `https://downloads.pitayacode.io/latest.yml` and whatever filename(s) `latest.yml`'s `files`/`path` entries reference (e.g. `https://downloads.pitayacode.io/iReader%20by%20Pro%20Buyer%20Setup%201.0.1.exe` and its `.blockmap` sibling) — the exact path structure is determined by whatever `publish.url` is configured to (a single flat directory, matching the `downloads/` layout Phase A proposed, is sufficient and simplest).
- **Auth required?** No (§12, Phase A already reached this same conclusion for the same reasons).
- **HTTP headers**: no special headers are required for the generic provider to function at the most basic level. `Content-Type` should be correct for `.yml` (`text/yaml` or `application/x-yaml` / `text/plain` — servers vary; electron-updater parses by content, not strictly by header, but correct MIME types are good practice) and for `.exe` (`application/octet-stream` or `application/x-msdownload`).
- **Range Requests**: **Recommended, not strictly mandatory for a first implementation.** HTTP Range support matters for (a) resuming interrupted downloads of the (typically 50-100MB+) installer over a flaky store Wi-Fi connection, and (b) differential/blockmap-based partial downloads, which specifically fetch byte ranges of the new installer corresponding to changed blocks. **Without Range support, differential updates degrade to full downloads** (§11) — the mechanism still works, just less efficiently. A static-file Nginx setup serves Range requests correctly by default with zero extra config (standard `nginx` `sendfile`/`aio` static serving already honors `Range:` headers) — this is a property of using a normal static-file server, not something that needs to be specially engineered, but it should be explicitly verified once Hetzner hosting exists (Phase B/E of the Phase A plan), not assumed.
- **HTTPS**: effectively mandatory for production — electron-updater does not treat plain HTTP as untrusted by default in all configurations, but shipping a production update channel over unencrypted HTTP would allow trivial man-in-the-middle substitution of the installer, which is a real security exposure for a POS application. This audit recommends treating HTTPS as a hard requirement, not because electron-updater enforces it, but because the SHA512 hash check in `latest.yml` protects file *integrity* from corruption, not from a malicious actor who can also rewrite `latest.yml` itself over plain HTTP.

No Nginx configuration was performed or written — this section documents requirements only, per instructions.

---

## 10. `latest.yml` Requirements

(Distinct from Phase A §7, which established the file doesn't exist; this section focuses on what a future implementation needs to *produce* it correctly — still not generating it here.)

- It must be regenerated on **every** version publish — it is not hand-maintained; electron-builder writes it automatically once a `publish` config exists and the NSIS target is built.
- Its `sha512` values are computed by electron-builder from the actual built artifact — meaning **the exact same build output that gets uploaded must be the one `latest.yml` was generated from**; rebuilding the `.exe` after generating `latest.yml` (e.g., a second unrelated `dist:win` run) would produce a hash mismatch and cause every client to reject the "corrupted" download. This is a process-discipline requirement for whatever publish script eventually replaces `publish-s3.mjs` — worth calling out because the current `publish-s3.mjs` (§4 of Phase A) picks "the newest file matching a pattern" by mtime, which is safe only if the publish step runs immediately after a single build and never mixes artifacts from two different build runs.
- It should be uploaded/refreshed **last**, after the installer and blockmap are already in place at their final URLs — so a client polling mid-deploy never sees a `latest.yml` pointing at a file that isn't there yet.

---

## 11. Blockmap / Differential Update

- **What it's for**: a content-addressed map of the installer's internal file blocks, allowing electron-updater to download only the byte ranges that changed between the installed version and the new one, instead of the full installer.
- **When electron-builder generates it**: automatically, for the NSIS target, on every build — confirmed empirically (§3 of Phase A: the `.blockmap` file was present after every `dist:win` run in the prior session, **regardless of whether a `publish` config existed** — its generation is independent of the `latest.yml`/publish question).
- **How electron-updater uses it**: compares the blockmap of the currently-installed version against the blockmap of the new version (both referenced from `latest.yml`) to compute the minimal set of byte ranges to fetch via HTTP Range requests (§9).
- **Advantage**: much smaller downloads for small code changes — meaningful for store computers on limited/shared internet connections.
- **What happens if it's missing**: electron-updater falls back to a **full download** of the new installer — this is a graceful degradation, not a failure mode. Confirmed as general, documented electron-updater behavior (not repo-observed, since no update client exists yet to exercise this).
- **Server requirements for differential updates specifically**: the host must correctly serve HTTP Range requests (§9) — without that, differential updates cannot partially fetch, and would effectively behave as full downloads anyway (so a server that doesn't support Range doesn't break auto-update, it just removes the bandwidth-saving benefit).

**Recommendation for this project**: start with **full download** as the operative assumption for the first implementation and initial Hetzner rollout — it's the simpler thing to validate end-to-end (fewer moving parts: no dependency on the host's Range-request behavior being exactly correct), and the blockmap/differential path is something electron-builder already produces "for free" regardless, so nothing is lost by not depending on it initially. Once full-download updates are proven working (Phase A.5's local test, §18, and later Phase E/F on Hetzner), differential updates become a pure bandwidth optimization to verify separately, not a new capability to build.

---

## 12. Apple Device Layer Impact

**Explicitly out of scope to modify — audited for impact only, per instructions. `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`, the bundled `libimobiledevice` binaries, `iphone_probe.py`, and `pymobiledevice3`/`usbmuxd`/AMDS integration were not touched.**

Evidence reviewed: `desktop/src/main/usb/AppleUsbAdapter.ts`, `desktop/src/renderer/src/contexts/UsbContext.tsx`, the `extraResources` block in `desktop/package.json`.

- **`extraResources`**: `resources/libimobiledevice/**` and `resources/iphone_probe.py` are copied into the packaged app's `resources/` folder (resolved at runtime via `process.resourcesPath`, `AppleUsbAdapter.ts:50-57`). An update, whether full-download or differential, replaces the entire installed app directory (or the specific changed blocks within it) — `resources/` is part of that same installed package, not something auto-update selectively skips or needs special handling for. **No special risk from adding an updater to this mechanism** — if these files don't change between versions, a differential update simply wouldn't re-download their unchanged blocks (a benefit, not a risk); if they do change (e.g., a `libimobiledevice` binary gets upgraded in a future release), they'd be replaced exactly as any other changed file would be.
- **Binaries/Python scripts/relative paths**: `AppleUsbAdapter.ts` resolves tool paths via `process.resourcesPath` (packaged) with several `process.cwd()`-relative fallbacks for dev (`getToolchainCandidateDirs()`, lines 44-64). Since `process.resourcesPath` always points at *whatever the currently running installed version's* resources directory is, an update that replaces the whole app directory in place does not orphan or break these lookups — there's no hardcoded absolute path baked in anywhere that could point at a stale, deleted previous-version directory. **No risk identified.**
- **Permissions**: no evidence of any of these binaries requiring elevated permissions beyond what the per-user install already has (they're invoked via plain `execFile`/`exec` from the already-running, already-permitted main process) — an update to a per-user-installed app doesn't change this.
- **Child processes and file locking (the one genuine, minor consideration)**: `UsbContext.tsx` polls `window.desktop.usb.status()` every **3.5 seconds** (`setInterval(poll, 3500)`, `UsbContext.tsx:41`) while the "Add Device" screen is visible; each poll spawns short-lived child processes (`idevice_id.exe`, `ideviceinfo.exe`, PowerShell `Get-PnpDevice`, etc., all with explicit timeouts of 3-8 seconds per `AppleUsbAdapter.ts`). These are **one-shot, short-lived** calls — not long-running daemons — so there is no *persistent* file handle held open against these binaries. However, if an update attempts to overwrite `resources/libimobiledevice/win/idevice_id.exe` at the exact moment a poll cycle has that specific exe running, Windows could report the file as briefly locked/in-use. This is a narrow timing window (milliseconds to low seconds), not a structural blocker, and standard practice already mitigates it: **electron-updater's install step requires the app to fully quit first** (`quitAndInstall`) — once the Electron process (and by extension `UsbContext`'s polling `setInterval`) has exited, no new child-process calls can be in flight, eliminating this concern by construction. **This is a design note for the future `before-quit`/install-trigger flow (§6), not a defect in the existing USB code**, and requires zero changes to `AppleUsbAdapter.ts` itself.
- **Installation over an existing install**: consistent with §7 — a per-user NSIS update in place is exactly the scenario this project's install mode already supports without elevation; nothing Apple-USB-specific changes that calculus.

**Conclusion: no risk requiring changes to the Apple device layer.** The one item worth carrying into implementation is procedural (ensure the update-install step happens after full app quit, which is electron-updater's default behavior anyway) — not a code change to this layer.

---

## 13. Update UX

Conceptual design only — no UI implemented.

| State | Recommended behavior for iReader |
|---|---|
| A. No update available | Silent — no UI at all. A POS app should not nag staff when there's nothing to do. |
| B. Update available | Non-blocking indicator (e.g., a small badge near the existing profile/session chip in the top nav, `App.tsx:1225-1231` area) rather than a modal — staff are mid-transaction most of the time this app is open. |
| C. Downloading | Background by default; optionally reflect progress in the same non-blocking indicator. Given this is a POS terminal likely on a shared/limited store connection, downloading should **not** block or slow down foreground use — this argues for background download once available, not "download now, freeze the app." |
| D. Download complete | Indicate "restart to update" — do **not** auto-restart while staff may be mid-sale. |
| E. Restart required | Offer an explicit "Restart now" action; also apply automatically at a safe moment such as app launch if staff closed and reopened it before manually confirming. |
| F. Download error | Log it (main process), fail silently to the user in most cases (retry later, transparently) — a store PC with a bad Wi-Fi day shouldn't alarm the cashier. |
| G. Update error (during install) | Must **not** leave the app in a broken, unusable state — this is the single most important error-handling property for a POS terminal (§14/§15 elaborate). |
| H. Offline | Update checks must fail silently and never block app startup or normal operation (§6 already establishes there's no existing network-dependent gate on window creation — this must remain true). |
| I. User postpones ("Later") | Should be honored for a reasonable window (e.g., don't re-prompt for several hours), not re-nag immediately. |

**Recommended overall policy for iReader specifically**, given it's a point-of-sale terminal (uptime and never-blocking-a-sale outrank "always on the latest version immediately"):
- **Check** automatically and periodically, silently.
- **Download** automatically once available (bandwidth cost is small relative to store operations, and pre-downloading removes friction later) — but only over a background, non-blocking path.
- **Do not** force-install mid-session. Install **on next natural restart**, or via an explicit, low-friction "Restart to update" action the cashier can defer.
- **Never** show a hard-blocking modal that prevents completing a sale.

This is a recommendation for *behavior*, not an implementation — no code was written.

---

## 14. Error Handling

Scenarios requested, with recommended safety mechanisms (design-level only):

| Scenario | Recommended safeguard |
|---|---|
| User installs 1.0.0, server later has 1.0.1 | Normal case — covered by §13's flow. |
| Update check fails (offline, DNS, timeout) | Catch and log in main process; no user-facing error for a routine connectivity blip (§13, row H). |
| Download fails partway | electron-updater's own retry/resume semantics apply (general library behavior, not repo-specific) — app must remain fully usable on the *current* version throughout; a failed download must never partially overwrite the running installation. |
| `latest.yml` is corrupted/malformed | electron-updater should reject it and behave as "no update available" rather than crash — this is expected upstream library behavior; this project's responsibility is solely to ensure the *publish* step (§10) never uploads a malformed file to begin with (i.e., generate it correctly, upload atomically/last). |
| Published version is **lower** than the installed version | This is the "accidental downgrade" scenario — semver comparison (§8) should make electron-updater treat this as "no update available," since it only ever offers versions greater than the current one. The real risk here is **process**, not code: someone manually running the old, unversioned `publish-s3.mjs` (or its future Hetzner equivalent) against a stale `dist/` folder could overwrite a newer live release with an older one. Recommendation for the eventual publish script: always publish from a single, immediately-preceding build, and never re-run publish against an old cached `dist/` output — a process discipline note, not a code fix in scope here. |
| Update fails **during install** | The single highest-severity failure mode for a POS terminal. Recommendation: the app must not be left unable to launch. This generally argues for **not** deleting/replacing the running app files until the newly-downloaded package has already passed its integrity check (SHA512 from `latest.yml`) — which is exactly what electron-updater already does before triggering `quitAndInstall` (general library behavior). This project's obligation is only to not add custom logic that bypasses or races that check — none exists today to worry about. |

---

## 15. Rollback Strategy

Design only — nothing implemented.

- **If a defective release is published**: the fastest mitigation is removing/reverting `latest.yml` at the host (whether S3 today or Hetzner later) so it no longer advertises the bad version — clients that haven't yet checked will simply not see it; clients that already downloaded but haven't installed can, depending on exact electron-updater event wiring (a future implementation detail), potentially be given a chance to re-check before install-time, though this project has not yet designed that specific safety net (flagged as a design gap to close during actual implementation, not resolved here).
- **Stopping distribution**: delete or replace the bad version's entry in `latest.yml`, or simply overwrite `latest.yml` to point back at the last-known-good version's artifacts (which must therefore be retained at the host, not deleted immediately after a new release — a retention-policy requirement for whatever hosting is chosen, Hetzner or otherwise).
- **Reverting installed clients to an older version**: electron-updater does **not** provide automatic downgrade/rollback — it is designed to move forward via semver comparison (§8, §14). A client already updated to a bad version would need either (a) a new, higher-versioned "rollback" release that reintroduces the previous good code (the standard approach for this class of tool), or (b) manual reinstallation of an older installer by a human. **There is no automatic rollback mechanism in this ecosystem** — this must be a documented manual/process-level runbook for PitayaCode, not something the software does for you.
- **Recommended strategy**: treat "rollback" as "ship a new, higher version number that reverts the change" — this is the only mechanism that works *through* the auto-update system rather than around it, and it requires no special tooling beyond normal release discipline.

---

## 16. Code Signing

- **Current state**: **no code signing exists.** Confirmed by exhaustive grep across `desktop/` for `certificateFile`, `certificatePassword`, `CSC_LINK`, `CSC_KEY_PASSWORD`, `signtool`, and any `"sign"` config key — zero matches other than the unrelated `signAndEditExecutable: false` flag (which only controls whether electron-builder stamps the `.exe`'s icon/version-info resources via `rcedit`; it has nothing to do with Authenticode signing).
- **Is it configured?** No.
- **Is it recommended before shipping auto-update to real store computers?** Yes, as a **P1** (recommended before production rollout, not a hard technical blocker to building/testing the mechanism itself — see below).
- **Risk of distributing unsigned binaries**:
  - **Windows SmartScreen**: an unsigned, freshly-downloaded `.exe` with no established reputation will very likely trigger a "Windows protected your PC" SmartScreen warning on first run, requiring a manual "More info → Run anyway" click. For updates applied *silently in-place* by electron-updater (not re-downloaded by a human clicking a browser link), SmartScreen's interactive warning is **less likely to interfere** in the same way (it primarily guards user-initiated downloads/executions via the "Mark of the Web"), but this project has **not verified** exactly how electron-updater's install step behaves with an unsigned NSIS payload against a real, current Windows Defender/SmartScreen configuration — flagged as something to empirically confirm during Phase A.5's local test (§18), not assumed either way.
  - **User trust**: an unsigned installer showing "Unknown Publisher" in the UAC/SmartScreen dialog (for the *initial* manual install, which does still go through normal user-facing SmartScreen behavior) is a legitimate trust concern for a POS application handling payments/inventory — independent of auto-update.
  - **Enterprise/AV policy risk**: some antivirus/EDR products (mentioned as a concern already in this project's own earlier driver-install work, per the prior conversation) are more aggressive about unsigned binaries that silently write to disk and relaunch themselves — exactly the auto-update pattern. This is a real, if unquantified, operational risk for store computers running third-party AV.
- **No certificates were configured, requested, or purchased as part of this audit**, per instructions.

---

## 17. Development vs. Production

- **Existing signal**: `app.isPackaged` (used once today, `createWindow()`, `desktop/src/main/index.ts:351`) is the correct, already-present mechanism to gate "only check for updates in a packaged/installed build" — a `npm run dev` session (which loads from `VITE_DEV_SERVER_URL` or `localhost:5173`, never packaged) must never attempt an update check or it will either error confusingly or, worse, attempt to "update" a dev environment that isn't a real installed app.
- **Preventing a local build from consuming production**: this is really two separate concerns — (a) never checking for updates at all when unpackaged (`app.isPackaged` handles this), and (b) if a *packaged test build* is used for QA and must **not** silently pull from the real production `downloads.pitayacode.io` feed, that requires a distinct "staging" feed URL, which does not exist as a concept anywhere in this repo today (no environment-based `publish.url` switching exists).
- **Channels (dev/beta/stable)**: no channel concept exists anywhere in the repo (confirmed — no `channel` references at all). Given this project has exactly one production deployment target today (`probuyer.pitayacode.io`-style single environment, per Phase A's infra evidence) and no existing internal beta-testing process, **`stable`-only is sufficient for this first implementation.** Introducing `beta`/`dev` channels is a legitimate *future* enhancement (P3, §19) once there's an actual need to test releases against a subset of machines before a full rollout — not a prerequisite to getting basic auto-update working.

---

## 18. Local Test Strategy

Plan only — nothing executed.

```
Build "1.0.0"  (or any starting version)
    ↓  npm run dist:win  (existing script, unmodified)
Serve desktop/dist/ over a throwaway local static file server
    (e.g., `npx http-server desktop/dist -p 8080` — a tool already
    available via npx, no new dependency needs to be *installed* into
    the project; this is a one-off local test utility, not a project dependency)
    ↓
Point electron-updater's dev config at http://localhost:8080 (electron-updater
    supports a `dev-app-update.yml` override specifically for this kind of
    local testing — general library capability, not yet present in this repo)
    ↓
Bump version to "1.0.1", rebuild → new .exe + .blockmap + regenerated latest.yml
    land in the same local static server directory
    ↓
Launch the *installed* 1.0.0 build (not `npm run dev` — per §17, dev mode
    must never check for updates; this test specifically requires a packaged build)
    ↓
Observe: does it detect 1.0.1? Does it download? Does it verify the hash?
    Does quitAndInstall() correctly relaunch as 1.0.1?
```

**What must exist for this test**: two full builds (a "before" and an "after" version), a way to serve them locally over plain HTTP (loopback, so HTTPS is not required for this specific local test — only for the real production feed, §9), and a temporary electron-updater dev-mode config pointing at that local server instead of any real host.

**What should be validated**:
- Update detection correctly compares semver and finds `1.0.1 > 1.0.0`.
- The SHA512 hash check in `latest.yml` passes for a deliberately-correct build, and — as a negative test — is correctly *rejected* if the artifact is tampered with or mismatched (proving the integrity check isn't a no-op).
- `quitAndInstall()` (or equivalent) actually replaces the per-user-installed 1.0.0 with 1.0.1 and relaunches, without requiring UAC (consistent with §7's per-user-install finding).
- The Apple USB polling (`UsbContext.tsx`) does not interfere with or get interfered by the install step, per §12's timing note — specifically worth observing once, not assumed safe purely from static analysis.
- Offline behavior: point the config at an unreachable host and confirm the app still launches normally with no user-facing error (§13/§14).

**Evidence to capture**: console/log output from the main process's updater event listeners at each stage (would need to be added as part of implementation — not present today since no updater exists), and a screen recording or screenshots of the actual relaunch-at-new-version, since that's the ultimate proof the mechanism works end-to-end.

**This validates the update *mechanism* completely independently of Hetzner** — exactly the sequencing this audit recommends in its Final Recommendation (build and prove the client first, against any static host, before investing in production infrastructure).

---

## 19. Hetzner Requirements

Restated/refined from Phase A §13, with the specifics this audit's deeper look adds — nothing configured.

- **DNS**: an A/AAAA record for `downloads.pitayacode.io` → the Hetzner host (external to this repo; NOT VERIFIED).
- **Nginx Proxy Manager**: a proxy host entry routing that domain to wherever the static files end up served from (§9 of Phase A recommended a small dedicated static-file container on `pitaya_net`) — external to this repo; NOT VERIFIED.
- **HTTPS**: required for production, per §9's reasoning here (integrity of `latest.yml` itself, not just the artifacts it references).
- **Static files**: a plain directory of the artifacts (§Phase A §9's proposed `downloads/` layout) — no application logic needed to *serve* them, just correct static-file hosting.
- **Directory structure**: flat is sufficient (`latest.yml`, `*.exe`, `*.exe.blockmap` all at the same level) — no evidence in this repo of any need for per-version subdirectories, though that's a reasonable future refinement for retaining old versions (§15's rollback retention need) rather than overwriting them in place.
- **Permissions**: the serving process needs read access to the directory; the *publish* step (SSH/rsync, per Phase A) needs write access — standard Unix file permissions, nothing special.
- **Public files**: all of them (§9/§12) — no authenticated files in this design.
- **Caching**: `latest.yml` should be served with cache-busting/no-cache semantics (matching the *intent* already visible in the current, non-functional `publish-s3.mjs`'s `Cache-Control: no-cache` for that file, Phase A §4) so clients never see a stale update feed; the versioned installer/blockmap files are safe to cache aggressively since their filenames already include the version (a new version is a new filename, never overwritten).
- **MIME types**: correct `Content-Type` for `.yml` and `.exe` (§9) — standard Nginx MIME-type config covers this by default for most extensions, `.yml` may need an explicit `types` entry added depending on the base Nginx MIME map used (a configuration detail for Phase B/C, not resolved here).
- **Range Requests**: should work out of the box with any standard static-file Nginx config (§9, §11) — should be explicitly tested once real hosting exists, not assumed.
- **Logs**: standard Nginx access/error logs are sufficient to start; no special requirement identified beyond what's presumably already standard for the existing `probuyer.pitayacode.io` setup (NOT VERIFIED, external to this repo).
- **Rollback**: requires retaining previous-version artifacts rather than deleting them on every publish (§15) — a retention/cleanup policy to design during Phase D/B of the Phase A plan, not yet decided.

---

## 20. Release Flow

```
Developer
   ↓ bump "version" in desktop/package.json (manual today, §8)
   ↓ npm run dist:win   (existing, unmodified script)
electron-builder → installer (.exe) + .blockmap
   ↓ [FUTURE, not yet possible] latest.yml generation
   ↓ [FUTURE] publish step (today: manual `npm run publish:s3`; tomorrow: SSH/rsync to Hetzner, per Phase A)
downloads.pitayacode.io (or, today, an S3 bucket nobody reads from)
   ↓ [FUTURE, does not exist yet] iReader's electron-updater checkForUpdates()
   ↓ download
   ↓ install
   ↓ restart
```

**Points that are manual work today** (every single one, since none of the auto-update machinery exists yet):
1. Version bump — manual edit.
2. Build — manual `npm run dist:win` run.
3. `latest.yml` generation — doesn't happen at all today (no `publish` config).
4. Publish — manual script run, requires a human's local AWS credentials.
5. Client-side update check/download/install — doesn't exist at all.

**What could be automated later** (not implemented here, purely identified per the audit's request): CI-triggered builds on a version-tag push (there's already a working CI pattern to model this on, `deploy-hetzner.yml`, though it currently only handles the web app, not desktop); an automated `latest.yml`-aware publish step; and, eventually, the update client itself running unattended once built. All of this is future work this audit surfaces but does not schedule or authorize.

---

## 21. AWS Migration Considerations

Consistent with Phase A, re-confirmed with no new contradicting evidence found in this deeper audit:

- **What stays on AWS during the transition**: everything, unchanged — this audit made zero AWS changes, and Phase A already established AWS is not touched until Phase G of its plan.
- **What eventually moves to Hetzner**: the file-hosting destination only (§19) — once a `publish` config and an update client both exist (this audit's subject), the *target* of publishing changes; the *mechanism* (electron-updater's generic provider) doesn't care which host it is, per Phase A §14.
- **When AWS should be turned off**: only after Phase F of Phase A's plan (a real update-from-an-older-version test succeeds against Hetzner) — unchanged recommendation.
- **How to validate Hetzner before retiring AWS**: exactly the local test strategy in §18 of *this* document, then repeated against the real Hetzner host once it exists (Phase A's Phase E/F) — this audit adds the detail that the *client itself* should first be proven against a trivial local server (§18) before ever being pointed at Hetzner, to avoid conflating "does my updater code work" with "does my new hosting work" as one untested leap.
- **Rollback during transition**: keep the AWS-based (currently non-functional, since nothing reads from it) path untouched until Hetzner is proven — there is, bluntly, no live behavior on AWS to protect today, which makes this the lowest-risk possible transition window this project will ever have for this change.

**No AWS resources were touched, inspected for deletion, or modified in this audit.**

---

## 22. Risk Register

| ID | Finding | Evidence | Impact | Recommendation | Severity |
|---|---|---|---|---|---|
| R1 | No code signing exists for the Windows installer/executable | §16 — exhaustive grep, zero signing config | SmartScreen friction on manual installs; unverified interaction with silent auto-update installs; possible AV/EDR friction | Obtain and configure a code-signing certificate (EV or standard Authenticode) before wide production rollout of auto-update | **P1** |
| R2 | No `publish` config exists → `latest.yml` is never generated | §3, confirmed again in this audit | Auto-update cannot function at all without this | Add a `publish` block (`provider: "generic"`, target URL) as part of implementation — not done in this audit | **P0 relative to implementation** (nothing works without it), but not a *design* blocker — it's a known, straightforward config addition |
| R3 | `sandbox: false` in `webPreferences` | §5, line 300 | Pre-existing, broader-than-ideal renderer attack surface; unrelated to auto-update specifically | Track as a separate hardening item; do not conflate with or block auto-update work on this | **P3** (pre-existing, out of scope to fix here) |
| R4 | No Node version pinned (`engines`/`.nvmrc` absent) | §2 | Build reproducibility risk across dev machines/CI, independent of auto-update | Add an `engines`/`.nvmrc` entry at some point | **P3** |
| R5 | `installer.nsh`'s exact interaction with electron-updater's NSIS update path (does `customInstall` re-run on update?) is not fully repo-verifiable | §7 | Low — the driver-install step is best-effort and swallows its own errors either way, so even an unexpected re-run on update is not destructive; worst case it's a harmless redundant `winget install` call | Confirm empirically during the local test (§18) once an update client exists | **P2** |
| R6 | No existing "update in progress" guard against app quit / no `before-quit` handler | §6 | An update mid-download/mid-install interrupted by a forced quit could, in principle, leave a partial state (mitigated in practice by electron-updater verifying integrity before install, per §14) | Design an explicit before-quit guard as part of implementation if download/installs can span a user-initiated close | **P2** |
| R7 | USB polling (3.5s interval, short-lived child processes) has a narrow theoretical file-lock timing window during an in-place update | §12 | Very low likelihood, no observed structural blocker; mitigated by electron-updater's standard "quit fully, then install" behavior | No code change needed; note as a reason to trust the standard quit-then-install flow rather than attempting a "hot" in-place update while the app is running | **P3** |
| R8 | No rollback/downgrade capability exists in this ecosystem by design | §15 | A bad release requires shipping a *newer* corrective version, not a revert | Document this as a runbook expectation for whoever manages releases — process, not code | **P2** |
| R9 | Manual, unautomated version bump + publish process today | §8, §20 | Human error risk (e.g., accidentally publishing a lower version, or publishing mismatched build+`latest.yml` pairs per §10) | Consider CI automation later, modeled on the existing `deploy-hetzner.yml` pattern | **P3** |

No risks were invented beyond what the evidence supports; each row above cites its source section.

---

## 23. Implementation Prerequisites

Before writing any auto-update code, the following should be explicitly decided (not resolved by this audit, which is audit-only):

1. **Code signing decision** (R1) — at minimum, a documented decision to proceed without it initially (accepting the SmartScreen/trust friction) vs. acquiring a certificate first.
2. **Publish target decision** — confirm whether the *first* working implementation should target a trivial local static server (§18, recommended) before any Hetzner infrastructure work begins, per this audit's sequencing recommendation.
3. **UX policy sign-off** — the recommended "check + download silently, install on next natural restart, never block a sale" policy (§13) should be confirmed as acceptable for this specific business context (a retail POS terminal) before building toward it.
4. **`publish` config values** — even though not created in this audit, someone needs to decide the eventual `publish.url` value (a placeholder is fine for the local test in §18) so the implementation isn't blocked guessing at it.

None of these are technical blockers to *starting* implementation — they're decisions that shape *how* it's implemented, best made explicitly rather than assumed.

---

## 24. Final Decision

**B — READY WITH REQUIRED FIXES.**

No architectural or technical blocker (P0, in the sense of "cannot be done") was found. The project's existing per-user NSIS install, correct `contextIsolation`/`nodeIntegration` posture, and clean main/preload/renderer IPC discipline are all directly favorable to adding `electron-updater` with no redesign.

**Required before this should be considered safe for production rollout to real store computers** (not before writing the first line of code, but before shipping it to end users):
- **R1 (code signing)** — a P1 finding; unsigned auto-updating binaries on POS terminals carry real trust/AV-friction risk that should be a conscious decision, not an oversight.
- **R2 (no `publish` config yet)** — required for the mechanism to function at all; straightforward to add as part of implementation itself, not a separate prerequisite project.

Everything else identified (R3-R9) is P2/P3 — worth tracking, none of it blocking.

**No ambiguity was found that rises to the level of BLOCKED.** The one area with residual uncertainty — exactly how `installer.nsh`'s `customInstall` macro interacts with an *update* (vs. a fresh install) NSIS run (R5) — is low-severity (the macro is already designed to fail silently and harmlessly) and is something to observe empirically during the local test plan in §18, not something that requires stopping to resolve first.

---

## Verification (post-audit, as required)

1. **Only functional-change verification performed**: `git status --short` (below) shows the sole change is this new document.
2. **git status**:
   ```
   ?? docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md
   ```
3. **Files modified**: none. Only this new report file was created.
4. **`AppleUsbAdapter.ts` / Apple device layer**: not modified — confirmed by the same `git status` output showing no changes under `desktop/src/main/usb/`.
5. **Dependencies installed**: none — no `npm install`, no `electron-updater` added to `package.json` or `node_modules`.
6. **Summary**: see below.
7. **Classification**: **B — READY WITH REQUIRED FIXES** (§24).
