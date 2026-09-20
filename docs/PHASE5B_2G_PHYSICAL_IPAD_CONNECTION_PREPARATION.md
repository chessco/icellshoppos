# iReader POS — Phase 5B-2G: Physical iPad Connection Preparation
**Authoritative Environment Preparation & Operator Manual**  
**Classification:** C — PHYSICAL TEST PARTIALLY READY (Ready for Manual Test)  
**Date:** September 2026  
**Status:** AUDITED — NO CODE CHANGES REQUIRED

---

## 1. Current Environment

| Component | Verified Specification | Source / Location |
| :--- | :--- | :--- |
| **Operating System** | Windows (Host Dev Environment) | Local Dev Machine |
| **Expo SDK** | `~57.0.22` | `apps/mobile/package.json` |
| **React Native** | `0.86.3` | `apps/mobile/package.json` & root `overrides` |
| **React** | `19.2.3` | `apps/mobile/package.json` & root `package.json` |
| **TypeScript** | `~6.0.3` (Mobile) / `^5` (Root) | `apps/mobile/package.json` / `package.json` |
| **Next.js Backend** | `16.1.6` (Node.js App Router) | `package.json` |
| **Mobile App Target** | Physical iPad (Tablet UI mode enabled) | `apps/mobile/app.json` |
| **Test Runner** | Node.js Test Runner (`node --test`) | Mobile & Backend test suites |

---

## 2. Verified Configuration

### 2.1 Manifest & Tablet Capabilities (`apps/mobile/app.json`)
* **Tablet Support:** `"supportsTablet": true` is explicitly configured.
* **Orientation:** `"orientation": "default"` permits responsive iPad rotation between portrait and landscape modes.
* **Bundle Identifier:** `"com.icellshop.ireaderpos"` configured for iOS.
* **Permissions:** `"NSCameraUsageDescription"` is declared for barcode scanning capabilities.

### 2.2 Mobile Authentication & API Client
* **API Client:** [`packages/api-client/src/ProBuyerApiClient.ts`](file:///c:/PitayaCode/icellshoppos/packages/api-client/src/ProBuyerApiClient.ts) implements dynamic `setBaseUrl(url)` and prepends the runtime target to `/api/auth/login`, `/api/inventory`, `/api/sales`, etc.
* **Auth Context:** [`apps/mobile/src/contexts/AuthContext.tsx`](file:///c:/PitayaCode/icellshoppos/apps/mobile/src/contexts/AuthContext.tsx) exposes `setServerUrl(url)`. When invoked, it:
  1. Updates `apiClient.setBaseUrl(cleanedUrl)`.
  2. Persists the endpoint into secure storage under key `"base_url"`.
  3. Reloads session state with the new endpoint.
  4. Automatically recovers the saved URL across app cold starts in `restoreSession()`.

### 2.3 Backend Authentication & Middleware
* **Bearer Token Acceptance:** [`middleware.ts`](file:///c:/PitayaCode/icellshoppos/middleware.ts#L131-L135) and [`src/lib/server-auth.ts`](file:///c:/PitayaCode/icellshoppos/src/lib/server-auth.ts#L7-L10) inspect incoming `Authorization: Bearer <jwt>` headers. Mobile requests do not depend on browser session cookies.
* **CORS Configuration:** `middleware.ts` sets standard CORS headers (`Access-Control-Allow-Origin: *` or mirroring request origin) on `/api/*` routes and responds to HTTP `OPTIONS` preflight requests with status 204.
* **Allowed Dev Origins:** [`next.config.ts`](file:///c:/PitayaCode/icellshoppos/next.config.ts) defines `allowedDevOrigins` matching `192.168.*.*`, `*.ngrok-free.app`, `*.ngrok.io`, and `*.loca.lt`.

### 2.4 iOS App Transport Security (ATS)
* Physical iOS devices disallow arbitrary plain HTTP traffic to non-standard domains by default under App Transport Security.
* **LAN IP (`http://192.168.x.x:3000`):** Allowed by iOS for local subnet IPs in dev mode, but subject to host firewall and Wi-Fi access point client-isolation policies.
* **HTTPS Tunnel (`https://xxxx.ngrok-free.app`):** Valid TLS certificate issued by a public authority; passes ATS without any plist modifications.

---

## 3. Network Strategy Analysis

### Comparison

| Evaluation Metric | Option A: LAN IP (`http://192.168.x.x:3000`) | Option B: HTTPS Tunnel (ngrok) — RECOMMENDED |
| :--- | :--- | :--- |
| **Protocol** | Plain HTTP | Authoritative HTTPS / TLS 1.3 |
| **iOS ATS Friction** | Low-Medium (LAN allowed, but sensitive to subnet changes) | **Zero (Native HTTPS compliance)** |
| **Network AP Isolation** | **Fails** if Wi-Fi blocks client-to-client traffic (common on office/guest networks) | **Passes** (Traffic flows via public HTTPS endpoint) |
| **Firewall Setup** | Windows Defender Firewall port 3000 inbound rule required | None required (Outbound reverse tunnel) |
| **Setup Overhead** | Requires detecting host Wi-Fi IPv4 address (`ipconfig`) | Single command (`npx ngrok http 3000`) |
| **Code Changes Needed**| None | None |

> [!TIP]
> **RECOMMENDED STRATEGY: OPTION B (HTTPS Tunnel)**  
> An HTTPS tunnel completely isolates the physical iPad connection test from local Wi-Fi router policies, client isolation, and Windows firewall inbound blocking. It matches `allowedDevOrigins` in `next.config.ts` and requires **zero code changes**.

---

## 4. Expo Go Compatibility Audit

* **Target Runtime:** Physical iPad running **Expo Go (SDK 57)**.
* **Native Dependencies:**
  * `expo-camera` (`~17.0.10`): Fully supported inside standard Expo Go.
  * `expo-print` (`~15.0.8`): Fully supported inside standard Expo Go (AirPrint target).
  * `expo-status-bar` (`~3.0.9`): Standard Expo Go library.
  * `react-native-safe-area-context` (`~5.6.2`): Standard Expo Go library.
* **Native Custom Modules / Dev Client:**
  * No custom iOS Objective-C / Swift native modules or native bridge libraries are required for this phase.
  * `expo-dev-client` is **not** introduced and **not** required for this validation.
* **Secure Storage Fallback:**
  * `MobileSecureStorageAdapter` contains an internal fallback: if `expo-secure-store` is not present, it logs a warning and uses an in-memory storage dictionary without throwing fatal startup exceptions.

---

## 5. Backend URL Mechanism

In [`apps/mobile/src/screens/LoginScreen.tsx`](file:///c:/PitayaCode/icellshoppos/apps/mobile/src/screens/LoginScreen.tsx):
1. Under the main "Sign In" button, there is a dedicated toggle button: `"⚙ Configure Backend URL"`.
2. Tapping it renders a secure text input pre-filled with the current base URL.
3. The operator can type or paste:
   * **LAN IP:** `http://192.168.1.50:3000`
   * **HTTPS Tunnel:** `https://xxxx-xx-xx-xx.ngrok-free.app`
4. Tapping `"Save"` validates format, strips trailing slashes, updates `apiClient.setBaseUrl()`, and writes it to persistence.
5. **Verdict:** **NO CODE CHANGES ARE REQUIRED** to connect to an arbitrary host or tunnel from a physical iPad.

---

## 6. Commands Required for Operator

### Command 1: Start Next.js Development Backend
* **Directory:** Workspace Root (`c:\PitayaCode\icellshoppos`)
* **Command:**
  ```powershell
  npx next dev -H 0.0.0.0 -p 3000
  ```
* **Expected Output:**
  ```text
  ▲ Next.js 16.1.6
  - Local:        http://localhost:3000
  - Network:      http://0.0.0.0:3000
  ✓ Starting...
  ✓ Ready in 1500ms
  ```
* **Failure Indicator:**
  * Error `EADDRINUSE: address already in use :::3000` (Another process occupies port 3000).

---

### Command 2: Expose Next.js via HTTPS Tunnel (Option B - Recommended)
* **Directory:** Workspace Root (`c:\PitayaCode\icellshoppos`) or any shell
* **Command:**
  ```powershell
  npx ngrok http 3000
  ```
  *(Alternative if cloudflared is installed: `cloudflared tunnel --url http://localhost:3000`)*
* **Expected Output:**
  ```text
  Forwarding  https://abc123-your-tunnel.ngrok-free.app -> http://localhost:3000
  ```
* **Failure Indicator:**
  * `ngrok: command not found` or authentication token error.

---

### Command 3: Start Expo Bundler in Tunnel / LAN Mode
* **Directory:** Workspace Root (`c:\PitayaCode\icellshoppos`)
* **Command (Tunnel Mode — matches Option B):**
  ```powershell
  npm --prefix apps/mobile start -- --tunnel
  ```
  *(Or LAN mode if using local Wi-Fi: `npm --prefix apps/mobile start -- --lan`)*
* **Expected Output:**
  ```text
  Starting Metro Bundler
  Tunnel URL: exp://xxxx.tunnel.expo.dev
  [QR Code displayed in terminal]
  › Press a │ open Android
  › Press i │ open iOS simulator
  › Press r │ reload app
  ```
* **Failure Indicator:**
  * Error `Metro bundler process failed` or syntax compilation errors.

---

## 7. Manual iPad Operator Procedure

Follow these sequential steps on the physical iPad:

```
Step 1: Prerequisites
  ├── Ensure iPad is running iOS 16+ or iOS 17+.
  ├── Download and install "Expo Go" from the Apple App Store.
  └── Connect iPad to the internet (or same Wi-Fi subnet as laptop if testing LAN).

Step 2: Load iReader POS in Expo Go
  ├── Open the iPad Camera app or Expo Go app.
  ├── Scan the Metro QR code shown in Command 3 terminal.
  └── Expo Go will download and parse JavaScript bundle (0% -> 100%).
  └── LoginScreen will render on iPad screen.

Step 3: Configure Backend URL
  ├── Locate and tap "⚙ Configure Backend URL" beneath the Sign In button.
  ├── Enter the HTTPS Tunnel URL from Command 2 (e.g. https://xxxx.ngrok-free.app)
  │   (or http://<LAPTOP_LAN_IP>:3000 if testing Option A).
  └── Tap "Save".

Step 4: Authenticate Against Backend
  ├── Enter valid Pro Buyer cashier credentials:
  │   Email: [cashier_email]
  │   Password: [cashier_password]
  └── Tap "Sign In".

Step 5: Verify POS Catalog
  ├── The app navigates to PosMasterScreen (Split tablet view).
  ├── Left pane: Inventory catalog grid loads items from /api/inventory.
  └── Right pane: Empty Cart summary appears with barcode scan input ready.
```

---

## 8. Expected Results Matrix

| Step | Action | Expected Output | Failure Indicator & Diagnostic |
| :--- | :--- | :--- | :--- |
| **1. Bundle Load** | Scan Expo Go QR code | App splash screen displays, bundle loads to 100%, LoginScreen renders | "Could not connect to Metro development server" (Firewall or Expo tunnel down) |
| **2. URL Save** | Tap "Save" on URL input | Server URL displays updated target, modal/input dismisses | Alert: "Please enter a valid URL" |
| **3. Sign In** | Tap "Sign In" | Spinner displays, token stored, transitions to POS screen | "Invalid credentials" (HTTP 401) or "Network request failed" (Host unreachable) |
| **4. Catalog Load** | POS Screen initialization | Catalog grid displays inventory items with prices, stock status | Grid empty or "Failed to load inventory" banner |
| **5. Layout Mode** | iPad landscape/portrait | Grid reflows cleanly, tablet split layout adapts without overflow | Unresponsive clipping or UI elements overlapping |

---

## 9. Known Blockers & Physical Status

In strict accordance with Phase 5B-2G instructions, physical hardware execution cannot be marked as PASS without hands-on verification:

| Checkpoint | Status | Rationale |
| :--- | :--- | :--- |
| **Code Readiness** | **PASS (No Code Changes Needed)** | Verified statically: Dynamic baseUrl, Bearer auth, CORS, and ATS handled |
| **Static Typecheck** | **PASS** | `apps/mobile` tsc: 0 errors; Root backend tsc: 0 errors |
| **Automated Unit Tests** | **PASS** | 33 mobile tests passing; 21 backend tests passing |
| **Physical iPad Launch** | **READY FOR MANUAL TEST** | Awaiting manual launch by operator in Expo Go |
| **Physical iPad Network Connectivity**| **READY FOR MANUAL TEST** | Requires operator running Next.js + Tunnel and tapping Sign In |
| **Physical iPad Camera Scanner** | **READY FOR MANUAL TEST** | Requires operator testing camera on physical barcode/IMEI |
| **Physical iPad AirPrint Receipt** | **READY FOR MANUAL TEST** | Requires operator testing AirPrint dialog against network printer |
| **Physical iPad Touch Behavior** | **READY FOR MANUAL TEST** | Requires manual verification of touch responsiveness on glass |

---

## 10. Security Notes

* **No Secret Leaks:** Do not print or commit:
  * Database credentials or connection strings (`DATABASE_URL`).
  * JWT private secrets (`JWT_SECRET`).
  * Production or staging cashier passwords.
  * Device serial numbers, MAC addresses, or UDIDs.
* **Tunnel Safety:** Ngrok URLs are ephemeral and public. Never commit active tunnel URLs into repository files. Close the tunnel when testing concludes.
* **CORS Scope:** While development middleware permits dev origins, production origins are guarded under authoritative domain whitelists.

---

## 11. Exact Next Action

1. **Operator Action:** Execute **Command 1**, **Command 2**, and **Command 3** in local PowerShell terminals.
2. **iPad Device Action:** Perform the steps in **Section 7 (Manual iPad Operator Procedure)** using a physical iPad with Expo Go.
3. **Report:** Record results (Login, Catalog load, responsiveness) for Phase 5C execution.
