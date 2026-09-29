# PHASE B.0 — iReader Server Cloud: Hetzner Primary Distribution + Website Integration

**Predecessors:** `docs/AUDIT_IREADER_DISTRIBUTION_AWS_TO_HETZNER.md`, `docs/PHASE_A6_AUTO_UPDATE_FOUNDATION_REPORT.md` (A — VALIDATED), `docs/PHASE_A7_SECOND_MACHINE_VALIDATION_REPORT.md` (C — BLOCKED, no second environment)
**Date:** 2026-09-29
**Scope:** Implementation, but strictly bounded — no S3, no code signing, no CI/CD, no changes to infrastructure outside what's specific to iReader distribution.

---

## 1. Objective

Replace A.6's local test update feed (`http://127.0.0.1:45280`) with a real, production-capable distribution channel served from the same Hetzner box that already hosts the Pro Buyer web app — and give the website a page where a human can see the current iReader version and download it — without provisioning any new server, subdomain, DNS record, or Nginx Proxy Manager host.

---

## 2. Existing Architecture (as found, before this phase)

- **Desktop app:** `desktop/` — Electron + electron-builder + NSIS, `electron-updater@6.8.10` wired up in Phase A.6, `build.publish` pointing at the local test URL.
- **Website/backend:** `src/app/` — Next.js App Router, deployed as the `icellshop-probuyer` Docker service (`docker-compose.prod.yml`), on Hetzner, via `.github/workflows/deploy-hetzner.yml` (`git pull` → `docker compose build --no-cache` → `up -d` → `prisma migrate deploy`).
- **Confirmed live domain:** `https://probuyer.pitayacode.io` (`docker-compose.prod.yml:40`, `NEXT_PUBLIC_APP_URL`) — the user confirmed this directly as "the transition site during development," i.e. the real, currently-active domain, superseding this session's own earlier (unconfirmed) proposal of `downloads.pitayacode.io` and a separate `probuyer.org` reference found in `desktop/src/renderer/src/App.tsx`'s `DEFAULT_BASE_URL` and `DEPLOYMENT_PHASE1.md` (an apparently earlier/different deployment target, not the one in active use).
- **AWS S3:** `desktop/scripts/publish-s3.mjs` — a manual, human-run script; not wired into CI; per the user's own framing for this phase, "Secondary / Future," no API keys available. **Left completely untouched.**
- **No existing subdomain, Nginx Proxy Manager config, or DNS record for downloads** was found anywhere in this repository (confirmed by the earlier AWS→Hetzner audit and re-confirmed here — nothing new appeared).

---

## 3. Final Architecture (implemented)

The key architectural decision — made explicitly with the user, in response to their own question ("¿Por qué ocupo otro subdominio si estoy en la misma máquina?") — was to **not** create a new subdomain/DNS/Nginx Proxy Manager host at all. Instead:

```
iReader Windows
      │
      ▼
electron-updater  →  publish.url = https://probuyer.pitayacode.io/downloads
      │
      ▼
icellshop-probuyer (the SAME existing Docker container, no new service)
      │
      ├── GET /downloads/latest.yml
      ├── GET /downloads/iReader by Pro Buyer Setup X.Y.Z.exe
      └── GET /downloads/iReader by Pro Buyer Setup X.Y.Z.exe.blockmap
      │
      ▼
reads from /data/ireader-releases  (Docker named volume "ireader_releases",
                                     NOT the git repo, NOT the app's `public/` folder)

Website: https://probuyer.pitayacode.io/ireader
      │
      ├── reads the same /data/ireader-releases/latest.yml server-side
      └── "Download iReader for Windows" → links directly to /downloads/<installer>
```

This required **zero** new DNS records, **zero** new Nginx Proxy Manager proxy hosts, and **zero** new containers — the existing reverse-proxy path to `probuyer.pitayacode.io` already covers `/downloads` and `/ireader` since they're just new routes inside the same app.

Two deliberate design choices, both explained to and confirmed by the user before implementation:
1. **Files live outside git and outside `public/`** — in a directory read at request time (`src/lib/ireader-releases.ts`, `IREADER_RELEASES_DIR`, defaulting to `/data/ireader-releases`), mounted into the container as a Docker named volume. This means publishing a new iReader release is copying files onto that volume — it never touches the git repo, never triggers `docker compose build --no-cache`, and never runs a Prisma migration. This was the direct fix for the two real risks flagged when the user asked "¿Es seguro?": indefinite git repo bloat from committing ~80MB binaries, and coupling an iReader release to a full, riskier web-app redeploy.
2. **A custom Route Handler, not Next.js static `public/` serving** — needed because the files live outside the app's build output, and because electron-updater's differential-update path depends on HTTP Range requests (documented in `docs/AUDIT_IREADER_AUTO_UPDATE_FOUNDATION.md` §9/§11), which required implementing Range support explicitly rather than relying on whatever a plain static mount would do.

---

## 4. Distribution Domain

**`https://probuyer.pitayacode.io`** — the user's explicit, direct confirmation, given as the reason for not needing a separate subdomain. No new domain was proposed, reserved, or invented. The earlier-session-proposed `downloads.pitayacode.io` (from the AWS→Hetzner audit, before this domain was confirmed) is **not used** and is superseded by this decision.

---

## 5. DNS

**No DNS change was needed or made.** Since distribution rides on the existing `probuyer.pitayacode.io` A/AAAA record (whatever it already resolves to), there is nothing new to create, and nothing to hand off as a "please create this record" instruction — this was the entire point of the architecture decision in §3.

---

## 6. Nginx Proxy Manager

**No Nginx Proxy Manager change was needed or made**, for the same reason as §5 — `/downloads` and `/ireader` are ordinary routes inside the app already being proxied to `probuyer.pitayacode.io`. Nothing here required touching Nginx Proxy Manager's configuration, other proxy hosts, or certificates.

---

## 7. Hetzner Static Distribution

Implemented as a Route Handler inside the existing Next.js app, not a separate static file server process — per §3's reasoning. Concretely:

- **`src/lib/ireader-releases.ts`** (new): reads `latest.yml` from `IREADER_RELEASES_DIR` (default `/data/ireader-releases`) with a small dedicated parser (electron-builder's `latest.yml` has a fixed, simple shape — confirmed with real samples in Phase A.6 — so a full YAML library dependency wasn't added for this one file). Also provides `resolveReleaseFilePath()`, which rejects any path that would resolve outside the releases directory (directory-traversal protection, tested — see §16).
- **`src/app/downloads/[...path]/route.ts`** (new): serves any file under the releases directory over plain `GET`, with:
  - Correct `Content-Type` (`text/yaml` for `latest.yml`, `application/octet-stream` for binaries).
  - `Cache-Control: no-cache` for `latest.yml` (must always be revalidated) vs. `public, max-age=31536000, immutable` for versioned artifact filenames (safe — a new version is always a new filename, never overwritten in place).
  - **HTTP Range request support** (206 Partial Content, correct `Content-Range` header) — verified working (§16).
  - 404 for missing files; 400/404 for any path containing `..` or resolving outside the releases directory.
- **Docker volume:** `docker-compose.prod.yml` — added `ireader_releases:/data/ireader-releases` to the **existing** `icellshop-probuyer` service only (no other service touched), and declared the named volume `ireader_releases` alongside the existing `icellshop_postgres_data` volume.

No database, no additional API surface beyond this one route, no MinIO, no dynamic application logic — exactly the "simple, static artifact distribution" the task asked for, just hosted inside the existing process instead of a new one.

---

## 8. Electron Configuration

`desktop/package.json`:
```diff
- "url": "http://127.0.0.1:45280"
+ "url": "https://probuyer.pitayacode.io/downloads"
```

Nothing else in the electron-builder or electron-updater configuration changed. **Not touched, as required:** `electron` version (`31.7.7`), `electron-builder` version, `electron-updater` version (`6.8.10`), `appId`, `productName`, `extraResources`, `desktop/build/installer.nsh`, `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`.

Verified by rebuilding the app: the packaged app's embedded `resources/app-update.yml` now reads:
```yaml
provider: generic
url: https://probuyer.pitayacode.io/downloads
updaterCacheDirName: icellshoppos-desktop-updater
```

---

## 9. Update Channel

Per the task's explicit instruction, only a **conceptual** Primary/Secondary distinction was documented — no code abstraction, no AWS SDK, no fallback logic was introduced:

| Channel | Status |
|---|---|
| **Hetzner** (`https://probuyer.pitayacode.io/downloads`) | **PRIMARY — ACTIVE.** This is what `build.publish.url` points at today. |
| **AWS S3** (`desktop/scripts/publish-s3.mjs`) | **SECONDARY — FUTURE.** Script preserved untouched, functional exactly as before, not referenced by `build.publish`, not connected, no API keys added or required. |

Because `electron-updater`'s `generic` provider only ever reads one `publish.url` at a time, "adding S3 later" will mean either switching that URL or building an actual multi-source fallback in `AppUpdater.ts` — deliberately not attempted here, so as not to design speculative code for a channel with no credentials yet.

---

## 10. Publish Workflow

**`desktop/scripts/publish-hetzner.mjs`** (new) — mirrors `publish-s3.mjs`'s structure and conventions closely:
- Finds the newest `iReader by Pro Buyer Setup *.exe`, its `.blockmap`, and `latest.yml` in `desktop/dist/`.
- Uploads them via `scp`, in that specific order — **installer and blockmap first, `latest.yml` last** — so a client polling mid-publish never sees `latest.yml` reference a file that isn't fully on the server yet (same integrity-ordering rationale documented in the earlier audit).
- Reads `HETZNER_HOST`/`HETZNER_USER` from the environment — **the same variable names** as the web app's own `.github/workflows/deploy-hetzner.yml` deploy secrets, so whoever already has those can reuse them; nothing new to provision. Optional `HETZNER_SSH_KEY_PATH` (a path to a key file, never key contents) and `IREADER_RELEASES_REMOTE_DIR` (defaults to `/data/ireader-releases`, matching §7's Docker volume mount path).
- Added as `npm run publish:hetzner` in `desktop/package.json`, alongside the untouched `publish:s3`.

**This script was not executed against the real server** — see §16/§19 (no SSH credentials/access were available in this session; this was disclosed to the user before implementation began).

---

## 11. Website Integration

Inspected first (§13 of the task): confirmed Next.js App Router (`src/app/*/page.tsx`), Tailwind utility classes, no component library beyond that, i18n via a `cookies()`-based `resolveLocale`/`translate` pattern already used on the homepage (`src/app/page.tsx`). The new page follows this exact pattern — same color tokens (`#0f1f3d`, `#2563eb`, `#d6e4ff`, `#5f7298`), same card/border/shadow conventions, same locale-cookie mechanism — no new design system, no new component library, no changes to the existing homepage or any other route.

**`src/app/ireader/page.tsx`** (new): a Server Component, `export const dynamic = "force-dynamic"` (so it re-reads the release directory on every request — no rebuild/redeploy needed to reflect a new release, matching §12's "no manual duplication" requirement). Shows the product name, a short description, the current version + release date (read live from `latest.yml`), and a "Download iReader for Windows" button — or a plain "no release published yet" message if the releases directory is empty (verified — see §16).

---

## 12. Version Metadata

No separate `version.json` was introduced. `latest.yml` — already electron-builder's own generated, authoritative artifact — **is** the single source of truth both the update client and the website read from (`src/lib/ireader-releases.ts` is shared, reused as-is by both `src/app/downloads/[...path]/route.ts` and `src/app/ireader/page.tsx`). This directly satisfies §15's instruction ("evitar duplicar manualmente la versión... la fuente de verdad debe ser el release") without inventing a second metadata format the task explicitly said not to copy blindly.

---

## 13. AWS/S3 Status

```
HETZNER:   PRIMARY, ACTIVE
S3:        SECONDARY, FUTURE, NOT IMPLEMENTED, NO API KEYS AVAILABLE
```

`desktop/scripts/publish-s3.mjs` and the `publish:s3` npm script are **fully preserved, unmodified** (confirmed via `git diff --stat` — empty). No AWS credentials, buckets, ACLs, or policies were touched, created, or referenced anywhere in this phase's changes.

---

## 14. Security

- **HTTPS:** inherited from the existing `probuyer.pitayacode.io` TLS termination — nothing new to configure, and nothing in this phase's code assumes or requires anything different.
- **Only public artifacts served:** the route handler resolves paths strictly inside `IREADER_RELEASES_DIR`; nothing else on the container's filesystem is reachable through it.
- **Directory traversal:** explicitly tested (§16) — a `..`-containing request path returns 404, never escapes the releases directory.
- **No credentials anywhere in the repo:** `publish-hetzner.mjs` reads `HETZNER_HOST`/`HETZNER_USER`/`HETZNER_SSH_KEY_PATH` from the environment only; none of these, nor any password/token/key, were written into `package.json`, source code, `README.md`, or any committed `.env` file. `.env.example` only documents the **name** of the one variable the web app itself consumes (`IREADER_RELEASES_DIR`), with no value.
- **Code signing:** **not implemented**, as explicitly instructed. Still pending, exactly as flagged in the Phase A.5 audit (P1, before wide production rollout) — unchanged status, just re-confirmed here.

---

## 15. Build

- `npx electron-vite build` + `npx electron-builder --win nsis` (from `desktop/`) — clean, no errors. Verified the packaged app's `resources/app-update.yml` now correctly embeds `https://probuyer.pitayacode.io/downloads` (§8).
- `npx next build` (root) — clean, no errors, after clearing a stale `.next-local` type-validator cache that was unrelated to this phase's changes (a Next.js dev-cache artifact from before this session, not caused by the new files — confirmed by re-running clean and succeeding). The build output confirms both new routes exist and are server-rendered on demand: `ƒ /downloads/[...path]` and `ƒ /ireader`.
- No pre-existing build commands were "fixed" beyond clearing that one stale cache directory, which is not a code change.

---

## 16. E2E Validation

**Full Hetzner-hosted electron-updater E2E (§23 of the task: an installed Windows client actually detecting and updating via the real `probuyer.pitayacode.io` endpoint) was NOT performed in this phase.** This requires either (a) the change in this phase to actually be deployed to the live Hetzner server first (a `git push` to `main` would trigger `deploy-hetzner.yml`'s full production deploy, including a Prisma migration — a real production action this session did not take without explicit authorization beyond what was asked), or (b) direct SSH/server access this session does not have (see §19). **This is disclosed plainly as not done, not simulated, and not claimed.**

What **was** validated, for real, locally, against the actual new code (not mocked):

| Check | Method | Result |
|---|---|---|
| `/ireader` page renders with no release published | `next start` against an empty `IREADER_RELEASES_DIR` | `200 OK`, correctly shows "No release is currently published" |
| `/ireader` page renders with a real release | `next start` pointed at a directory containing the actual `0.2.1` artifacts validated in Phase A.6 | `200 OK`, correctly displays `0.2.1`, the real release date, and a correctly-encoded download link |
| `/downloads/latest.yml` | `curl` | `200`, `Content-Type: text/yaml; charset=utf-8`, correct byte size |
| `/downloads/<installer>.exe` | `curl -I` | `200`, `Content-Length: 81099804` (matches the real file), `Accept-Ranges: bytes`, `Content-Type: application/octet-stream` |
| HTTP Range request | `curl -H "Range: bytes=0-99"` | `206 Partial Content`, correct `Content-Range: bytes 0-99/81099804` — confirmed the differential-update-critical Range support actually works |
| Directory traversal (`../../package.json`) | `curl` | `404` — blocked |
| `electron-builder` embeds the new URL | Full desktop rebuild + inspecting the packaged `app-update.yml` | Confirmed `url: https://probuyer.pitayacode.io/downloads` |

This is real evidence for every piece of the new *server-side* mechanism this phase built, run against the actual code (not a description of expected behavior) — but it stops at the boundary of "is this deployed and reachable on the real Hetzner box," which this session could not cross (§19).

---

## 17. Regression

```
git diff --stat -- desktop/src/main/usb/ desktop/build/installer.nsh prisma/ src/app/api/
```
→ empty. **Zero changes** to `AppleUsbAdapter.ts`, `AppleDriverInstaller.ts`, `installer.nsh`, Prisma, or any existing backend API route. The only new backend route is the new `src/app/downloads/[...path]/route.ts` itself. `desktop/scripts/publish-s3.mjs` also confirmed untouched (§13).

Apple USB smoke test: **NOT TESTED** — no physical device was connected during this phase, and this phase's changes have no code path anywhere near the USB/device layer, so there was nothing that plausibly needed re-testing beyond the diff check above.

---

## 18. Rollback

- **Website/backend changes** (`src/lib/ireader-releases.ts`, `src/app/downloads/`, `src/app/ireader/`, `docker-compose.prod.yml`'s volume addition): all purely additive — new files and one new `volumes:` entry on one existing service. Reverting is a plain `git revert`/file deletion; the Postgres volume, the app's existing routes, and every other service are untouched by definition.
- **Desktop config** (`build.publish.url`): a one-line change, trivially revertible to the local test URL or any future value (this was the entire point of Phase A.6's architecture — §14 of the earlier audit predicted exactly this).
- **Nothing was deployed**, so there is nothing live to roll back yet — the rollback path that matters is simply "don't merge/deploy this if it's not wanted," which remains fully available since none of it has shipped.

---

## 19. Limitations

- **No SSH/server access to the real Hetzner host was available in this session.** `publish-hetzner.mjs` is prepared and was reviewed for correctness against `publish-s3.mjs`'s proven structure, but it has **not been run against the real server**, and the `ireader_releases` Docker volume has not actually been created on the live host yet (it will be created automatically by Docker the first time the updated `docker-compose.prod.yml` is deployed and the container starts).
- **§16's E2E requirement (a real installed Windows client updating via the live Hetzner URL) is not satisfied** — only the local, non-deployed version of the same code path was validated. This is the direct continuation of the same class of limitation as Phase A.7 (no second environment / no live server access), not a new problem.
- **The change has not been deployed.** `docker-compose.prod.yml` and the new web app code exist only in this working tree — nothing was pushed to `main`, and nothing was deployed to Hetzner. Doing so would trigger the existing `deploy-hetzner.yml` pipeline (full rebuild + Prisma migration), which this session treated as a real production action requiring explicit authorization beyond what was already given.
- Code signing remains not implemented (unchanged, tracked since Phase A.5).
- No CI/CD was added for the publish step, as instructed.

---

## 20. Next Phase

Before this can be called done end-to-end, someone with real access needs to:
1. Deploy this branch's `docker-compose.prod.yml` + web app changes to Hetzner (creates the `ireader_releases` volume automatically).
2. Run `npm run publish:hetzner` (from `desktop/`) with real `HETZNER_HOST`/`HETZNER_USER` to actually place `0.2.1`'s artifacts on the volume for the first time.
3. Verify `https://probuyer.pitayacode.io/downloads/latest.yml` and `https://probuyer.pitayacode.io/ireader` from a real external network (this session could only test against a local, non-deployed copy).
4. Only then attempt the real §16 E2E test: an installed iReader client actually detecting and applying an update through the live Hetzner endpoint — closing the gap this report discloses in §19.

Not scheduled or started automatically, per the task's own stop condition.

---

## Final Response

**1. Resumen ejecutivo:** Se implementó la distribución de iReader usando el mismo dominio y contenedor ya desplegado (`probuyer.pitayacode.io`), sin crear infraestructura nueva (sin subdominio, sin DNS, sin Nginx Proxy Manager nuevo), siguiendo la decisión que tú mismo propusiste al preguntar por qué haría falta otro subdominio. Los releases se sirven desde un volumen Docker fuera del repositorio git, para que publicar una versión de iReader nunca dispare un rebuild completo del sitio ni una migración de Prisma. Se validó localmente, con archivos reales de la Fase A.6, que la ruta de descarga, `latest.yml`, las peticiones Range (críticas para actualizaciones diferenciales) y la protección contra directory traversal funcionan correctamente. **No se desplegó nada al servidor real** — no tengo acceso SSH en este entorno — así que la prueba E2E completa contra Hetzner en vivo queda pendiente para cuando alguien con acceso real ejecute los pasos del §20.

**2. Arquitectura final:** §3 arriba.

**3. Archivos modificados:**
```
 M .env.example
 M desktop/README.md
 M desktop/electron.vite.config.ts   (sin cambios en esta fase — de A.6)
 M desktop/package.json               (publish.url + script publish:hetzner)
 M desktop/src/main/index.ts          (sin cambios en esta fase — de A.6)
 M desktop/src/preload/index.ts       (sin cambios en esta fase — de A.6)
 M desktop/src/renderer/src/App.tsx   (sin cambios en esta fase — de A.6)
 M desktop/src/renderer/src/styles.css (sin cambios en esta fase — de A.6)
 M docker-compose.prod.yml            (+volumen ireader_releases en icellshop-probuyer)
 M package-lock.json                  (sin cambios en esta fase — de A.6)
?? desktop/scripts/publish-hetzner.mjs
?? src/app/downloads/[...path]/route.ts
?? src/app/ireader/page.tsx
?? src/lib/ireader-releases.ts
```
(Los archivos marcados "sin cambios en esta fase" ya estaban modificados desde A.6/A.7 y siguen así — no se tocaron de nuevo aquí; se listan porque `git status` los sigue mostrando como pendientes de commit.)

**4. Infraestructura modificada:** Únicamente el archivo `docker-compose.prod.yml` en este repositorio (un volumen nuevo en un servicio existente). **Nada se modificó en el servidor Hetzner real** — no hay acceso SSH disponible en esta sesión.

**5. Dominio de distribución:** `https://probuyer.pitayacode.io` (confirmado por ti, sin subdominio nuevo).

**6. URL de la página iReader:** `https://probuyer.pitayacode.io/ireader` (una vez desplegado — hoy solo existe en este working tree).

**7. Estado Hetzner:** PRIMARY / ACTIVE en configuración; **no desplegado todavía** al servidor real.

**8. Estado AWS/S3:** SECONDARY / FUTURE / NOT IMPLEMENTED / NO API KEYS — `publish-s3.mjs` intacto.

**9. Resultado E2E:** Validado localmente con artefactos reales de A.6 (servidor, Range requests, traversal, embedding de URL en electron-builder). **E2E contra el Hetzner real: NO ejecutado — sin acceso SSH.**

**10. Git status:** ver bloque arriba (§3).

**11. Limitaciones:** §19 arriba.

**12. Verdict: B — IMPLEMENTED WITH OBSERVATIONS.**

**Justificación:** la implementación en sí está completa, revisada y validada localmente con evidencia real (no simulada) para cada pieza que esta sesión podía alcanzar sin acceso al servidor. La limitación (§19) es de acceso/entorno — igual que en A.7 — no un defecto de diseño o de código. No es "A — HETZNER DISTRIBUTION VALIDATED" porque el criterio de esa clasificación exige la prueba E2E real contra Hetzner en vivo, que esta sesión no puede ejecutar sin credenciales SSH.

**ME DETENGO AQUÍ.** No implementé S3, no implementé code signing, no implementé CI/CD, no avancé a ninguna fase siguiente, y no desplegué nada al servidor real sin tu autorización explícita.
