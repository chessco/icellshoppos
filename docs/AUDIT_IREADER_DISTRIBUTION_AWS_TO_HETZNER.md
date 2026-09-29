# AUDIT — iReader Windows Distribution, Release & Auto-Update (AWS S3 → Hetzner)

**Scope:** Audit only. No code changed, no dependencies installed, no build/publish commands executed for the purpose of generating a release. No infrastructure created or modified.

**Date:** 2026-09-28
**Auditor:** Claude (Sonnet 5), at user request

---

## 1. Executive Summary

The premise of this audit — "migrate the *existing* auto-update mechanism from AWS S3 to Hetzner" — does not match what's actually in the repository. The findings, in order of importance:

1. **There is no auto-update client in iReader.** `electron-updater` is not a dependency, not installed, and not referenced anywhere in `desktop/src`. Nothing in the shipped app ever checks for updates, downloads an update, or calls `quitAndInstall`. Today, "updating iReader" means a human manually re-runs the installer.
2. **`latest.yml` is never generated.** No `publish` configuration exists in `electron-builder`'s config, so electron-builder never emits update metadata. It doesn't exist in the repo, in git history, or in any of the local builds produced during this session.
3. **AWS S3 is used only as a manual file-drop, not a live distribution backend.** `npm run publish:s3` is a hand-run script that shells out to the `aws` CLI. It is not wired into any CI pipeline (confirmed: the only GitHub Actions workflow in the repo, `deploy-hetzner.yml`, is unrelated to the desktop app).
4. **The S3 upload sets `--acl private`.** Even the manual distribution model as currently scripted does not produce a publicly downloadable link without something else (an out-of-repo bucket policy, or manual console action) making objects public. This is NOT VERIFIED either way from the repository.
5. **No AWS credentials are embedded in the app or the repo.** All AWS usage is publish-time only, on whichever machine runs `publish:s3`, via the ambient `aws` CLI credential chain — never bundled into the Electron app, never touched at runtime.

**Net effect:** moving the *file host* from S3 to Hetzner is straightforward and low-risk, because there's essentially nothing functional to migrate — it's a script that uploads a zip and an installer to a bucket nobody's app ever reads from. Achieving the user's actual goal (iReader auto-detecting and installing updates) requires *building* the auto-update client first — this is new work, not a relocation of existing work. This is a finding, not a scope objection; it changes the shape of Phases B–G (see §13).

---

## 2. Current Architecture

```
SOURCE (desktop/src)
   ↓  electron-vite build
BUILD OUTPUT (desktop/out/{main,preload,renderer})
   ↓  electron-builder --win nsis   (npm run dist:win)
ARTIFACT: desktop/dist/iReader by Pro Buyer Setup {version}.exe (+ .blockmap)
   ↓  [manual, human-run]
   ↓  npm run publish:s3  →  aws s3 cp ... --acl private
S3 BUCKET (name/region only known via env vars at publish time; NOT VERIFIED which bucket/account)
   ↓  ??? (no client code consumes this)
CLIENT: nothing. iReader has no code path that ever contacts S3, GitHub Releases, or any
        update server. Users install/reinstall the .exe manually.
```

There is a second, parallel artifact path (`npm run release:win-zip`) that produces `dist/win-unpacked-latest.zip` — a portable, unpacked copy of the app, unrelated to the NSIS installer and to any update metadata.

---

## 3. Build Pipeline

Source: `desktop/package.json` → `"build"` block (electron-builder config, inline in `package.json`, not a separate `electron-builder.yml`).

```json
"build": {
  "directories": { "output": "dist", "buildResources": "build" },
  "appId": "com.icellshop.desktop",
  "productName": "iReader by Pro Buyer",
  "files": ["out/**/*", "package.json"],
  "extraResources": [
    { "from": "resources/libimobiledevice", "to": "libimobiledevice", "filter": ["**/*"] },
    { "from": "resources/iphone_probe.py", "to": "iphone_probe.py" }
  ],
  "win": { "target": ["nsis"], "signAndEditExecutable": false },
  "nsis": { "include": "build/installer.nsh" }
}
```

Key facts, all empirically confirmed by building during earlier work in this session (not re-run for this audit — cited as already-observed evidence):

| Question | Answer |
|---|---|
| How is the installer generated? | `npm run dist:win` → `electron-builder --win nsis`. Produces a single-file NSIS installer. |
| oneClick / perMachine? | Not set explicitly in config; electron-builder's own build log reports the effective defaults: `oneClick=true perMachine=false` — i.e. a one-click, per-**user** install (no UAC elevation, installs to the current user's AppData, not Program Files). |
| artifactName? | Not set → electron-builder's default template, which resolved to `iReader by Pro Buyer Setup {version}.exe` (confirmed: `iReader by Pro Buyer Setup 0.2.0.exe`). |
| How is the ZIP generated? | `npm run release:win-zip` (`desktop/scripts/release-win-zip.mjs`) — runs `electron-vite build`, then `electron-builder --win dir --publish never` (unpacked build only, no installer), then shells out to `tar -a -c -f dist/win-unpacked-latest.zip -C dist win-unpacked`. This is a **separate, unrelated artifact** from the NSIS installer — a portable copy, not an auto-update payload. |
| Where are artifacts generated? | `desktop/dist/` (via `directories.output`). Gitignored (`desktop/.gitignore`: `dist/`). |
| What accompanies the installer? | A `.blockmap` file (`iReader by Pro Buyer Setup {version}.exe.blockmap`) — this is electron-builder's differential-update block map, generated automatically for NSIS targets **regardless of whether a `publish` config exists**. Its presence is necessary but not sufficient for auto-update: without `latest.yml` referencing it, electron-updater has no way to discover it. |
| Where is `latest.yml` generated? | **Nowhere in this repo, currently.** Confirmed by inspecting `desktop/dist/` after a full `electron-builder --win nsis` run: only the `.exe`, `.exe.blockmap`, `builder-debug.yml`, and `win-unpacked/` are present. No `latest.yml`. |
| What does `latest.yml` contain? | Cannot be analyzed — **it does not exist** anywhere in this repository, in git history, or in any build artifact produced. Per the audit instructions, its schema is **not invented** here (see §7 for a factual, sourced note on what electron-updater generically expects, clearly separated from repo evidence). |
| What publish provider does electron-builder use? | **None is configured.** No `publish` key exists anywhere in the `build` block, and neither `desktop/package.json` nor the root `package.json` has a `"repository"` field electron-builder could use to infer a GitHub provider. Electron-builder's CLI publish policy defaults to skipping publish outside of CI/tag contexts, which matches the observed behavior (no publish attempt, no `latest.yml`, no error, during local builds). |
| Any GitHub Releases strategy? | None found. No `publish: { provider: "github" }` config, no `GH_TOKEN` reference, no `.github/workflows` step touching `desktop/`. |
| Any other distribution strategy? | None beyond the manual `publish:s3` script. |

---

## 4. Publish Pipeline

### `npm run release:win-zip` (`desktop/scripts/release-win-zip.mjs`)
1. `npx electron-vite build` — rebuilds `out/main`, `out/preload`, `out/renderer`.
2. `npx electron-builder --win dir --publish never` — packages the **unpacked** app into `dist/win-unpacked` (no installer, no NSIS, explicitly `--publish never`). If this step reports an error but `dist/win-unpacked` still exists, the script logs a warning and continues (best-effort).
3. Deletes any pre-existing `dist/win-unpacked-latest.zip`.
4. `tar -a -c -f dist/win-unpacked-latest.zip -C dist win-unpacked` — zips the unpacked directory.

This script never touches the NSIS installer or `latest.yml`. It exists to produce a portable/manual-copy distribution, independent of the installer flow.

### `npm run publish:s3` (`desktop/scripts/publish-s3.mjs`)
Pure Node script — **no `aws-sdk`/`@aws-sdk` dependency**; it shells out to the system `aws` CLI via `spawnSync("aws", [...])`. Requires the `aws` CLI to be installed and configured (ambient credentials — env vars, `~/.aws/credentials`, or an assumed role) on whatever machine runs it.

Required env: `AWS_S3_BUCKET` or `S3_BUCKET` (throws if neither is set). Optional: `AWS_S3_PREFIX`/`S3_PREFIX` (key prefix), `AWS_REGION`/`AWS_DEFAULT_REGION`.

It conditionally uploads, from `desktop/dist/`, whichever of these are present (`collectNewestFile` picks the most recently modified match; nothing is invented if absent):
1. `win-unpacked-latest.zip` (from `release:win-zip`)
2. Newest `iReader by Pro Buyer Setup *.exe` (from `dist:win`)
3. Its matching `*.exe.blockmap`
4. Newest `latest.yml` — **never present today** (see §3), so this branch is effectively dead code in the current pipeline.

Every `aws s3 cp` call passes **`--acl private`** (`publish-s3.mjs:94`). Cache-Control is set per file type (`public,max-age=300` for the exe/zip/blockmap, `no-cache` for `latest.yml`, which suggests the *intent* was for `latest.yml` to be public and frequently re-checked — but the `--acl private` flag applies uniformly to every upload in the loop, so that intent is not currently realized in code).

Throws (fails the whole script) if `desktop/dist/win-unpacked-latest.zip` doesn't exist when `--` wait: actually re-checking — it throws only if that path check combined with `uploads.length === 0` after also checking exe/blockmap/latest.yml; it does not hard-require the zip specifically, only that at least one artifact was found overall.

### Full flow diagram (as requested)

```
SOURCE
  ↓ (electron-vite build)
BUILD  →  desktop/out/{main,preload,renderer}
  ↓ (electron-builder --win nsis | --win dir)
ARTIFACT  →  desktop/dist/{*.exe, *.exe.blockmap, win-unpacked/, win-unpacked-latest.zip}
  ↓ (npm run publish:s3 — manual, human-run, needs aws CLI + AWS_S3_BUCKET)
PUBLISH  →  s3://<bucket>/<prefix?>/{*.exe, *.exe.blockmap, win-unpacked-latest.zip}  [ACL: private]
  ↓
latest.yml  →  NOT PRODUCED, NOT PUBLISHED (no such file exists today)
  ↓
CLIENT  →  NOTHING. No code in desktop/src reads from S3 or any feed URL.
  ↓
UPDATE  →  DOES NOT HAPPEN AUTOMATICALLY. A human must download and re-run the installer.
```

---

## 5. Auto-Update Architecture

Search performed across `desktop/src`, `desktop/package.json`, `desktop/package-lock.json`, and `node_modules` for: `electron-updater`, `autoUpdater`, `AppUpdater`, `checkForUpdates`, `checkForUpdatesAndNotify`, `setFeedURL`, `provider`, `updateConfigPath`, `latest.yml`, `downloadUpdate`, `quitAndInstall`.

**Result: zero matches for any of the electron-updater API surface, and the `electron-updater` package itself is not a dependency anywhere.**

Answering the audit's specific questions:

| # | Question | Answer |
|---|---|---|
| A | Does iReader have auto-update implemented? | **No.** |
| B | What updater class? | N/A — none exists. |
| C | What provider? | N/A. |
| D | What URL? | N/A. |
| E | How does it discover `latest.yml`? | N/A — it never looks for one. |
| F | How does it download the installer? | N/A. |
| G | How does it install the update? | N/A — the only installation path is a human manually running the `.exe` (NSIS one-click installer overwrites the per-user install in place, per standard NSIS behavior for that config). |
| H | Different config for dev vs. prod? | N/A — there's no update config of any kind to differ. |

---

## 6. AWS / S3 Dependencies

Grep performed across `desktop/` (source, scripts, config, docs) for: `AWS`, `S3`, `aws-sdk`, `@aws-sdk`, `S3Client`, `PutObject`, `Upload`, `AWS_S3_BUCKET`, `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `endpoint`, `bucket`, `publish:s3`. Also checked the main web app (`src/`) for the same terms, and checked for hardcoded AWS access key patterns (`AKIA[0-9A-Z]{16}`) repo-wide.

**Files that reference AWS/S3 at all, anywhere in the repository:**
- `desktop/scripts/publish-s3.mjs` — the only code that touches AWS.
- `desktop/README.md:31` — documents the env vars for `publish:s3`.

**Nothing else** — not `src/` (the main Next.js/Prisma web app), not `desktop/src/main` (Electron main process), not `desktop/src/preload`, not `desktop/src/renderer`. No hardcoded AWS access keys were found anywhere in the repository.

### Classification (as requested)

| Layer | AWS dependency? |
|---|---|
| **BUILD TIME** (`electron-vite build`, `electron-builder --win nsis/dir`) | None. Electron-builder's own binary/NSIS-tooling downloads (from `electron-userland/electron-builder-binaries` on GitHub) are unrelated to AWS. |
| **PUBLISH TIME** (`npm run publish:s3`) | Full dependency: requires `aws` CLI installed + configured, and `AWS_S3_BUCKET`/`S3_BUCKET` env var, on whichever machine runs the script. This is **the only place AWS matters**. |
| **RUNTIME** (the installed iReader app on a store PC) | **None.** Confirmed via §5 — there is no code path in the shipped app that ever contacts AWS. |
| **AUTO-UPDATE** | N/A — doesn't exist (§5). |

---

## 7. `latest.yml` Analysis

**Does it exist anywhere in this repo?** No.
- Not in the working tree.
- Not in git history (`git log --all --diff-filter=A --name-only` for `latest.yml`/`latest-mac.yml`/`latest-linux.yml`: zero hits).
- Not produced by any local build run during this session (`dist:win`, `release:win-zip`) — verified by inspecting `desktop/dist/` after a full NSIS build: absent.

**Why it's never produced:** electron-builder only writes the update-metadata YAML for a target when it has a reason to (a configured `publish` provider, or an explicit publish attempt). Since no `publish` block exists anywhere in `desktop/package.json`, and no CLI `--publish` flag is passed by `dist:win` (`electron-builder --win nsis`, no publish flag at all — defaults to electron-builder's non-CI skip behavior), the file is never generated.

**Per the instructions: its field structure is NOT invented here.** `publish-s3.mjs` and `desktop/README.md` reference it purely by filename, with no schema assumptions in the code (the upload script just copies whatever file happens to be named `latest.yml` if one exists — it doesn't parse or validate it). Any description of what electron-updater *generically* expects a `latest.yml` to contain (version, files list with SHA512 + size, releaseDate, a `path` field, etc.) is general public knowledge about the `electron-builder`/`electron-updater` ecosystem, **not something observed in this repository**, and is not needed to complete this audit's factual findings — flagged here so it isn't confused with a repo-sourced fact.

---

## 8. Runtime Dependencies

Already established in §5/§6: **none.** The installed application has no network call, no config file, no embedded URL that references S3, Hetzner, or any update feed. This also means: there is currently zero user-facing behavior to preserve during a host migration, because there is no user-facing auto-update behavior at all yet.

---

## 9. Proposed Hetzner Architecture (conceptual — not implemented)

Target stated by user: `https://downloads.pitayacode.io/` serving:
```
downloads/
├── latest.yml
├── iReader by Pro Buyer Setup X.Y.Z.exe
├── iReader by Pro Buyer X.Y.Z.zip  (or win-unpacked-latest.zip)
└── *.exe.blockmap
```

**Compatibility with electron-updater:** Yes, in principle. Electron-updater's `"generic"` provider is designed exactly for this shape — a plain HTTPS directory serving `latest.yml` plus the referenced artifact files, with no S3-specific API calls involved on the client side. Nothing about the *current* S3 usage in this repo (plain `aws s3 cp` of static files) is exploiting an S3-only feature (no CloudFront signed cookies, no S3 Transfer Acceleration, etc., appear anywhere) — it's already being used as "a place to put files," which a static file host serves equally well.

### Infrastructure context already visible in this repo (evidence, not assumption)
- `docker-compose.prod.yml` runs the main web app (`icellshop-probuyer`) on an **external** Docker network named `pitaya_net`, with the app reachable at `probuyer.pitayacode.io`. An external network by definition is created/managed outside this compose file — consistent with the user's description of a shared Nginx Proxy Manager fronting multiple `*.pitayacode.io` subdomains, but the Nginx Proxy Manager configuration itself is **NOT VERIFIED** from this repository (it isn't checked in here).
- `.github/workflows/deploy-hetzner.yml` deploys the web app via SSH (`appleboy/ssh-action`) to `/opt/pitaya/icellshop` on the Hetzner host, using `HETZNER_HOST`/`HETZNER_USER`/`HETZNER_SSH_KEY` GitHub Actions secrets, then runs `docker compose ... build --no-cache` + `up -d`. This is a real, working pattern already in production for **code deploys** — it is a reasonable template for a **file publish** step too (SCP/rsync the release artifacts to a directory on the same host instead of building a container), but no such script exists yet for the desktop release.

### Option analysis (for this specific case only, per instructions)

**A. Static files + Nginx** — a small nginx (or even `caddy`) container added to the existing compose stack, attached to `pitaya_net`, serving a bind-mounted directory (e.g. `/opt/pitaya/downloads`) as-is over HTTP internally, with the existing Nginx Proxy Manager terminating TLS for `downloads.pitayacode.io` and reverse-proxying to it — exactly mirroring how `probuyer.pitayacode.io` is presumably fronted today (NOT VERIFIED beyond the network-topology evidence above).
- Pros: minimal moving parts; publishing is just "put a file in a directory" (via `scp`/`rsync` over the SSH access already used for deploys); no new API surface, no new credentials model beyond SSH keys already in use; trivially matches the `provider: "generic"` electron-updater model.
- Cons: no built-in object versioning/lifecycle rules (not needed for this use case — old versions can simply be left in place or pruned by a cron/script).

**B. MinIO (S3-compatible object storage)** — self-hosted S3-API-compatible service on Hetzner.
- Pros: `publish-s3.mjs` could be reused almost unchanged (just repoint the endpoint), preserving the exact `aws s3 cp --acl ...` workflow.
- Cons: introduces a new stateful service to operate (its own storage volume, backups, upgrade cadence, its own auth/bucket-policy model to get right for public read) for a workload that is fundamentally "serve a handful of static files to a generic HTTPS client." For a single desktop app's release artifacts, this is materially more operational surface than Option A for no functional gain — electron-updater's generic provider doesn't need or benefit from an S3-compatible API.

**C. Other** — e.g. pushing artifacts to a CDN/object-storage SaaS other than AWS. Out of scope: the user's stated target is self-hosted Hetzner.

**Recommendation for this case: Option A (static files + Nginx).** The workload is "serve versioned static files over HTTPS to a generic HTTP client" — Nginx (or the existing Nginx Proxy Manager itself, if it can also serve static content directly, which is common for NPM setups) is the simplest thing that fully satisfies electron-updater's `generic` provider contract, reuses infrastructure and credentials (SSH) already proven in `deploy-hetzner.yml`, and avoids running a second storage service whose S3-compatibility buys nothing here.

---

## 10. Static/Nginx vs MinIO — Direct Comparison for This Case

| Criterion | A. Static + Nginx | B. MinIO |
|---|---|---|
| New stateful service to operate | No (reuses existing proxy pattern) | Yes |
| Compatible with electron-updater `generic` provider | Yes, natively | Yes, but via an S3-compatible layer it doesn't need |
| Reuses existing Hetzner deploy credentials (SSH) | Yes | No — needs its own access-key/secret model |
| Publish script complexity | Low (`scp`/`rsync`) | Medium (keep `aws s3 cp`, but manage MinIO users/buckets/policies) |
| Operational burden (backups, upgrades, access control) | Minimal — it's files on disk | An extra service's full lifecycle |
| Justified when... | The only consumer is "download a static file over HTTPS" (this case) | Multiple services need genuine S3 API semantics (multipart upload, presigned URLs for private content, etc.) |

No general product ranking is intended — this table is scoped to "hosting iReader's Windows release artifacts," per the audit instructions.

---

## 11. Required Changes (separated by phase, not implemented here)

- **BUILD changes:** None required *just* to change host. However, note a prerequisite unrelated to hosting: `latest.yml` will never be produced (on S3 *or* Hetzner) until a `publish` block is added to `desktop/package.json`'s electron-builder config (e.g. `"publish": { "provider": "generic", "url": "https://downloads.pitayacode.io" }`). This is a build/config change needed for auto-update to exist at all — independent of which host is chosen.
- **PUBLISH changes:** Replace `desktop/scripts/publish-s3.mjs`'s `aws s3 cp` calls with an SSH-based upload (`scp`/`rsync`) to the Hetzner static-files directory, reusing the `HETZNER_HOST`/`HETZNER_USER`/`HETZNER_SSH_KEY` secret pattern already established in `.github/workflows/deploy-hetzner.yml`.
- **RUNTIME changes:** None today (there is no runtime update code to change). Once `electron-updater` is added (separate, larger piece of work — see §16), its config would point at `https://downloads.pitayacode.io` via the `generic` provider — a one-line difference from pointing it at an S3 bucket URL. This is the sense in which the migration is "compatible without changing the client": *if* a client existed, switching its feed host would be trivial. It doesn't exist yet, so there's nothing to "not change."
- **INFRASTRUCTURE changes:** New Hetzner container/service for static file hosting + `downloads.pitayacode.io` DNS record + Nginx Proxy Manager proxy host entry. None of this exists today (NOT VERIFIED beyond the `pitaya_net` external-network evidence in §9).

---

## 12. Security Analysis

- **Should the installer be public?** Functionally, yes — store staff need to download and run it without any credential. Today's script (`--acl private`, §4) does not achieve that by itself; NOT VERIFIED whether a bucket policy elsewhere makes the objects effectively public anyway.
- **Should `latest.yml` be public?** Yes, for the same reason — electron-updater's generic provider fetches it over plain HTTPS with no auth.
- **Do we need authentication?** No, for a straightforward "anyone with the app can update it" model — this mirrors how most desktop apps distribute installers and update feeds (public HTTPS, no auth), and matches the intent visible in the `publish-s3.mjs` Cache-Control choices (§4) even though the ACL doesn't currently match that intent.
- **Are presigned URLs needed?** Not for this use case unless there's a business reason to keep downloads private (e.g., licensing gating) — no such requirement is evident in this repo. Presigned URLs would add complexity (something has to mint them, i.e. a small API endpoint) for no evident benefit here.
- **Does the client need any credential?** No — and it must not, per the instructions. Confirmed: there is currently no code path where the client would need one, since there's no runtime AWS/network call at all (§5, §8).
- **Current risk of a credential ending up in the installer bundle?** None found. `extraResources` and `files` in the electron-builder config (§3) only bundle `out/**/*`, `package.json`, the `libimobiledevice` binaries, and `iphone_probe.py` — no `.env` file, no AWS config, nothing credential-shaped is in the bundled file list. AWS credentials are only ever read by the `aws` CLI on the *publishing* machine, from that machine's own environment/credential store — never copied into `desktop/out` or `desktop/dist`'s app payload.
- **Hetzner migration's security profile vs. today:** Strictly simpler. An SSH-key-based publish (reusing the existing `deploy-hetzner.yml` secret pattern) removes the AWS credential/IAM-user surface entirely; the served files can be plain public static content behind the same TLS termination already used for `probuyer.pitayacode.io`.

---

## 13. Domain and Nginx

Per instructions: no Nginx Proxy Manager changes made, no existing instance touched, nothing installed.

**What the application would need**, based solely on repo evidence:
- A DNS record for `downloads.pitayacode.io` pointing at the same Hetzner host already serving `probuyer.pitayacode.io` (inferred from the shared `pitaya_net` external network in `docker-compose.prod.yml`; the actual DNS zone and NPM config are **NOT VERIFIED**, they live outside this repo).
- A proxy host entry in the existing Nginx Proxy Manager instance routing `downloads.pitayacode.io` → whatever container/port ends up serving the static files (per §9, Option A).
- The static-files directory itself (e.g., `/opt/pitaya/downloads` on the host, or a named Docker volume) — does not exist yet; **NOT VERIFIED**, no evidence of it in this repo.

---

## 14. Migration Without Changing the Client

As established in §5/§8, there is currently no client-side update logic to preserve — so, strictly, "migrate the host without touching the client" is trivially true today because there's no client behavior tied to S3 at all. The more useful framing (and what's actually being asked, in spirit): **once `electron-updater` exists, would switching its target host from S3 to Hetzner require touching client code?**

Answer: **No**, provided the new host serves the same file layout (`latest.yml` + installer + blockmap at predictable URLs) and electron-updater is configured with `provider: "generic"` — that provider was designed to be host-agnostic (it doesn't call any AWS-specific API; it just does HTTP GETs). The `url` value is the only thing that would ever need to change, and that's build/publish-time config (`desktop/package.json`'s `publish` block, or an `app-update.yml` equivalent electron-updater reads at runtime), not application logic.

Change classification (repeated from §11 for clarity, as requested):
- **BUILD:** add `publish: { provider: "generic", url }` (prerequisite for `latest.yml` to exist at all, host-independent).
- **PUBLISH:** swap `aws s3 cp` → `scp`/`rsync` (or similar) in `publish-s3.mjs` (or its Hetzner-targeted replacement).
- **RUNTIME:** none, once electron-updater exists — the `url` config value is the only host-specific bit, and it lives in build/publish config, not in code that would need a new release to change behavior-wise (electron-updater can also read `dev-app-update.yml`/`app-update.yml` at runtime for this, depending on how it's wired — a detail to settle when that feature is actually built, not now).
- **INFRASTRUCTURE:** the new Hetzner static-file service + DNS + proxy host (§13).

---

## 15. Migration Plan (Phases)

| Phase | Description | Files/Config Affected | Risk | Rollback | Tests Needed |
|---|---|---|---|---|---|
| **A** | Audit (this document). | None (read-only). | None. | N/A. | This report reviewed/accepted. |
| **A.5** *(gap identified by this audit, not in the original phase list)* | Implement the electron-updater client itself — it doesn't exist on S3 *or* Hetzner today. Without this, Phases E/F have nothing to validate. | `desktop/src/main/index.ts` (or a new module), `desktop/package.json` (`electron-updater` dependency + `publish` block). | Medium — new runtime behavior in the shipped app. | Revert the commit; app behaves exactly as it does today (manual updates). | Manual test: point at a local static file server first, verify update detection/download/install end-to-end before touching Hetzner or AWS. |
| **B** | Prepare Hetzner: provision a static-file service (Option A, §9) attached to `pitaya_net`. | New service definition (likely a new `docker-compose.*.yml` entry or addition to `docker-compose.prod.yml`); a host directory/volume for release files. | Low — additive, isolated new service. | Remove the compose service/container; no impact on existing services. | `curl` a test file from inside the Docker network and (once proxied) from the public internet. |
| **C** | Configure domain: DNS record + Nginx Proxy Manager proxy host for `downloads.pitayacode.io`. | DNS zone (external), NPM config (external, not in this repo). | Low — additive DNS/proxy entry. | Remove the DNS record and proxy host. | HTTPS reachability + certificate validity check for `downloads.pitayacode.io`. |
| **D** | Configure publish: rewrite `publish-s3.mjs` (or add a parallel `publish-hetzner.mjs`) to `scp`/`rsync` artifacts to the new host; add the electron-builder `publish` block from Phase A.5. | `desktop/scripts/publish-s3.mjs` (or new script), `desktop/package.json`. | Medium — real script/config change (explicitly out of scope for this audit phase). | Keep the old `publish-s3.mjs` in place (dual-publish) until Hetzner is proven; revert config changes otherwise. | Dry-run publish to a staging path; verify file integrity (checksum) post-upload. |
| **E** | Publish a real test version to Hetzner. | N/A (operational). | Low, once D is tested. | Delete the test files from the Hetzner host. | Verify `https://downloads.pitayacode.io/latest.yml` and the linked `.exe`/`.blockmap` resolve with correct hashes/sizes. |
| **F** | Test update-from-an-older-version using the client built in A.5. | N/A (operational/manual QA). | Low-medium — real update flow on a test machine. | Manually reinstall the known-good version if the update misbehaves. | Full end-to-end: old version detects new version → downloads → verifies → installs → relaunches at new version. |
| **G** | Retire AWS: remove `publish-s3.mjs`/AWS env docs, decommission the S3 bucket and any IAM user. | `desktop/scripts/publish-s3.mjs`, `desktop/README.md`. | Low, once E/F are proven. | Restore the script from git history; recreate the IAM user/bucket if needed (best-effort, AWS-side). | Confirm no remaining references to `AWS_S3_BUCKET`/`S3_BUCKET` anywhere in scripts/docs. |

---

## 16. Rollback Plan

- **Phases B/C (infrastructure):** purely additive — deleting the new compose service and the DNS/proxy entry fully reverts with zero impact on `probuyer.pitayacode.io` or any other existing service.
- **Phase D (publish script/config):** keep the AWS path (`publish-s3.mjs`, S3 bucket) fully intact and functional in parallel until Hetzner is validated (Phase F) — i.e., dual-publish during the transition window, exactly as the user's own acceptance criteria (§17, item 10) require.
- **Phase A.5 (the update client itself):** since this is new code, not a migration, rollback is a plain revert of that commit — the app returns to today's "no auto-update" behavior, which is a known-safe state (it's the current production behavior).
- **Phase G (AWS retirement):** only executed after F passes; until then, AWS resources stay live as the fallback.

---

## 17. Risks

1. **Scope risk:** the request as framed ("migrate auto-update from S3 to Hetzner") assumes a working auto-update system exists. It doesn't (§5). If this isn't accounted for in planning, Phase F ("test update from an older version") will simply have nothing to test, on either host.
2. **ACL mismatch:** the current S3 script uploads with `--acl private` (§4) while apparently intending public, cache-friendly distribution (per its Cache-Control headers) — if this was masked by an out-of-repo bucket policy, that policy's behavior needs to be understood (NOT VERIFIED) before assuming "public S3 distribution" was ever actually working as presumably intended.
3. **Nginx Proxy Manager specifics are unverified.** This audit infers its existence and general pattern from `pitaya_net` being an *external* Docker network and the `probuyer.pitayacode.io` naming convention — but its actual configuration, certificate provider, and static-file-serving capability are not present in this repository and were not checked (no access to the Hetzner host from here).
4. **No CI wiring exists for the desktop release today.** `release:win-zip`/`publish:s3` are run by hand. If the new Hetzner publish path is meant to run from CI (GitHub Actions), that's additional new work (secrets, a workflow file) beyond a straight script rewrite — not currently scoped in the phase list beyond "Phase D".
5. **Differential/delta updates.** The `.blockmap` file (§3) exists and is what electron-updater uses for delta downloads — but since no update client exists yet, this has never been exercised end-to-end even on S3. Its behavior should be verified during Phase A.5/F, not assumed to "just work" because the file happens to be produced.

---

## 18. Validation Matrix (mapped to the user's Acceptance Criteria)

| # | Criterion | Current status | Blocking gap |
|---|---|---|---|
| 1 | iReader can query `latest.yml` from Hetzner | Not possible today | No client exists to query anything (§5); `latest.yml` isn't even generated yet (§7) |
| 2 | iReader can detect a new version | Not possible today | Same — no client |
| 3 | iReader can download the installer | Not possible today (only a human can, manually) | Same |
| 4 | iReader can install the update | Not possible today | Same |
| 5 | Hash/checksum is valid | N/A yet | Depends on `latest.yml` + electron-updater existing |
| 6 | No AWS credentials inside the client | **Already true today** | None — already satisfied, confirmed by this audit (§6, §12) |
| 7 | Release pipeline works without AWS | Not yet | Needs Phase D (publish script rewrite) |
| 8 | An older iReader version can update itself | Not possible today | Needs Phase A.5 (build the client) before this can even be attempted, regardless of host |
| 9 | HTTPS domain works | Not yet | Needs Phases B/C (infra not yet created) |
| 10 | Rollback to AWS exists during transition | Achievable by plan design (§16) | Just requires *not* deleting the AWS path until F passes |

---

## Final Recommendation

**Sequence the work as:** build the minimal auto-update client first (Phase A.5) and prove it end-to-end against *any* static HTTPS host (even a throwaway local server) — this validates the hardest, least-proven part (does `electron-updater` + this NSIS config + this app actually update correctly at all) independently of where files eventually live. Only then invest in the Hetzner infrastructure (Phases B–D), because at that point you're solving a well-understood problem (serve static files over HTTPS) rather than two unknowns at once.

The AWS-to-Hetzner move itself, once a client exists, is low-risk and low-effort: it's a publish-script rewrite plus a static-file host, with no client-code changes required (§14) and a strictly simpler security posture than today's script achieves (§12).

## GO / NO-GO for Implementation

**NO-GO** — for the reason stated throughout: implementing "Phase B onward" as literally scoped (infrastructure + domain + publish rewrite) without first closing the Phase A.5 gap would produce a working file host for a `latest.yml` that nothing ever reads. Recommend the user decide, before continuing, whether to (a) fold "build the electron-updater client" into this initiative explicitly as its own approved phase, or (b) treat that as a separate, already-planned piece of work this audit shouldn't assume authorization to start. This audit takes no action either way — flagged here purely as the decision this finding creates.
