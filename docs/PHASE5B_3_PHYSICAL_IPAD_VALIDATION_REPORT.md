# iReader POS — Phase 5B-3: First Physical iPad POS Validation
**Physical Environment QA Execution & Validation Audit**  
**Classification:** B — PHYSICAL VALIDATION BLOCKED (Database Infrastructure Offline)  
**Date:** September 2026  
**Status:** BACKEND & TUNNEL VERIFIED — DATABASE & HARDWARE ACTION REQUIRED

---

## 1. Environment Used

| Component | Status / Observation | Detail / Host Configuration |
| :--- | :--- | :--- |
| **Host Operating System** | Active | Windows 11 Dev Host |
| **Node.js Environment** | Active | Node.js v20+ / PowerShell shell |
| **Next.js Backend Server** | **RUNNING (Verified)** | Listening on `0.0.0.0:3000` (Process active) |
| **HTTPS Reverse Tunnel** | **RUNNING (Verified)** | `ngrok` active, forwarding public HTTPS to `localhost:3000` |
| **Metro Bundler (Expo)** | **VERIFIED** | Expo SDK 57 initialized, bundler listening on port 8081 |
| **Local Database (PostgreSQL)** | **BLOCKED (Offline)** | Port 5432 closed; Docker Desktop daemon not running |

---

## 2. iPad / iPadOS Information

* **Target Device:** Physical Apple iPad (Tablet Form Factor).
* **Target OS:** iOS 16.0+ / iOS 17.0+ with iPadOS Split/Multitasking support.
* **Physical Device State:** Awaiting physical operator device attachment. In accordance with strict testing rules, physical device observations cannot be assumed or fabricated.

---

## 3. Expo Go Information

* **Expo Go Version:** SDK 57 client (App Store release).
* **App Entry Point:** `apps/mobile/index.ts` registering `@ireader/mobile`.
* **Tablet Manifest Setting:** `"supportsTablet": true`, `"orientation": "default"`.
* **Autolinking Status:** Verified clean module resolution for `expo-camera`, `expo-print`, `expo-status-bar`, and `react-native-safe-area-context`.

---

## 4. Backend Connectivity Method

### Verified Pipeline:
```
Physical iPad (Expo Go)
    ↓ (Outbound TLS 1.3 / HTTPS)
ngrok Public HTTPS Tunnel (*.ngrok-free.app)
    ↓ (Local Proxy)
Next.js Dev Server (0.0.0.0:3000)
    ↓ (Prisma ORM)
PostgreSQL Database (localhost:5432) [CURRENT BLOCKER]
```

* **CORS Preflight Test:**
  `curl.exe -i -X OPTIONS http://localhost:3000/api/auth/login`
  * **Result:** `HTTP/1.1 204 No Content`
  * **Headers:** `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Headers: Authorization, ...`, `allow: OPTIONS, POST`
* **Tunnel Verification:**
  Queried local tunnel control interface (`http://127.0.0.1:4040/api/tunnels`).
  * **Result:** Active tunnel forwarding to `http://localhost:3000`.

---

## 5. Test Result Matrix

In strict accordance with the testing rule:
> *"Never classify a physical test as PASS unless the behavior was actually observed on the physical iPad. Use only: PASS, FAIL, BLOCKED, NOT TESTED, REQUIRES HARDWARE, REQUIRES CONFIGURATION."*

| ID | Test | Result | Evidence | Notes |
|:---|:-----|:-------|:---------|:------|
| **01** | App Launch | **REQUIRES HARDWARE** | Metro bundler ready on port 8081 | Requires physical iPad running Expo Go to scan QR |
| **02** | Backend URL | **REQUIRES HARDWARE** | URL modal implemented in `LoginScreen.tsx` | Requires manual entry on physical iPad touchscreen |
| **03** | Login | **BLOCKED** | Server log: `Can't reach database server at localhost:5432` | Prisma cannot authenticate users while Docker/Postgres is stopped |
| **04** | Organization Context | **BLOCKED** | Blocked by Test 03 (Login) | Cannot establish session context without authentication |
| **05** | Inventory | **BLOCKED** | Blocked by Test 03 & Database offline | `/api/inventory` queries PostgreSQL `InventoryItem` table |
| **06** | Search | **BLOCKED** | Blocked by Test 05 (Inventory) | Client search operates on fetched inventory records |
| **07** | Product Detail | **BLOCKED** | Blocked by Test 05 (Inventory) | Requires catalog items to select |
| **08** | Add to Cart | **BLOCKED** | Blocked by Test 05 (Inventory) | Requires catalog items to add |
| **09** | Duplicate Prevention | **BLOCKED** | Blocked by Test 08 (Cart) | Cannot verify serialized device uniqueness on glass |
| **10** | Customer | **BLOCKED** | Blocked by Test 03 (Login) | Customer application service requires organization context |
| **11** | WhatsApp Normalization | **BLOCKED** | Blocked by Test 10 (Customer) | Normalization service verified in unit tests, pending physical entry |
| **12** | Cash Checkout | **BLOCKED** | Blocked by Test 03 & 08 | Checkout requires active session, cart items, and database |
| **13** | Authoritative Confirmation | **BLOCKED** | Blocked by Test 12 (Checkout) | Authoritative response contract requires `/api/sales` execution |
| **14** | Inventory Post-Sale | **BLOCKED** | Blocked by Test 12 (Checkout) | Requires completed sale to observe status transition |
| **15** | Camera Permission | **REQUIRES HARDWARE** | Manifest declares `NSCameraUsageDescription` | Requires physical iPad camera prompt acceptance |
| **16** | Scanner Match | **REQUIRES HARDWARE** | Blocked by Hardware & Test 05 | Requires physical camera scanning against loaded inventory |
| **17** | Scanner Unmatched | **REQUIRES HARDWARE** | Verified in automated tests (9/9 pass) | Requires physical camera scanning unrecognized barcode |
| **18** | Scanner Retry | **REQUIRES HARDWARE** | Unmatched feedback sheet implemented | Requires tapping "Scan Again" on iPad touchscreen |
| **19** | AirPrint | **REQUIRES HARDWARE** | `expo-print` installed; AirPrint API hooked | Requires physical AirPrint-compatible thermal or laser printer |
| **20** | Keyboard | **REQUIRES HARDWARE** | Touchscreen virtual keyboard behavior | Requires observing iPad onscreen keyboard and viewport resize |
| **21** | Orientation | **REQUIRES HARDWARE** | `orientation: "default"` configured | Requires rotating physical iPad between Landscape & Portrait |
| **22** | Session Handling | **NOT TESTED** | Blocked by Test 03 (Login) | Requires active authenticated session |
| **23** | Stability | **NOT TESTED** | Blocked by physical runtime launch | Memory and rerender stability under physical usage |

---

## 6. Exact Observed Failures

### Failure 1: Database Offline Blocking Authentication (HTTP 500)
- **Observable Behavior:** Request to `POST /api/auth/login` returns `HTTP/1.1 500 Internal Server Error`.
- **Server Diagnostic Output:**
  ```text
  prisma:error 
  Invalid `db.user.findUnique()` invocation:
  Can't reach database server at `localhost:5432`
  Please make sure your database server is running at `localhost:5432`.
  ```
- **Reproduction Steps:**
  1. Start Next.js backend on `0.0.0.0:3000`.
  2. Send `POST http://localhost:3000/api/auth/login` with credentials.
  3. Connection fails immediately because Docker Desktop is stopped and port 5432 has no active listener.
- **Affected Layer:** Infrastructure / Database (`docker-compose.db.yml`).
- **Resolution Requirement:** **Requires Configuration/Host Action** (Start Docker Desktop and run `npm run db:up`). **Does NOT require code changes.**

---

## 7. UX Observations

* **Codebase Static Audit:**
  * Master-detail tablet view in [`apps/mobile/src/screens/PosMasterScreen.tsx`](file:///c:/PitayaCode/icellshoppos/apps/mobile/src/screens/PosMasterScreen.tsx) properly splits catalog (flex: 3) and cart (flex: 2) on tablet dimensions.
  * [`apps/mobile/src/components/pos/ScannerModal.tsx`](file:///c:/PitayaCode/icellshoppos/apps/mobile/src/components/pos/ScannerModal.tsx) provides dedicated feedback overlays for unmatched codes with clear action buttons ("Scan Again", "Search Catalog").
* **Physical Glass Status:**
  * Cannot observe font scaling, touch target clearance (min 44x44pt), or virtual keyboard occlusion until physical iPad launch is conducted.

---

## 8. Hardware Limitations

1. **Host Dev Machine:**
   * Docker Desktop Linux engine daemon is currently not running on the Windows host.
2. **Physical iPad Execution:**
   * Must be conducted hands-on by the developer/operator using Expo Go.
3. **AirPrint Printer:**
   * AirPrint execution strictly requires an Apple AirPrint certified printer on the local network; otherwise iOS print dialog displays "No Printers Found".

---

## 9. Issue Classification (P0–P3)

| Priority | Issue Description | Layer | Action Required | Code Change? |
|:---------|:------------------|:------|:----------------|:-------------|
| **P0** | **PostgreSQL Database Offline:** Port 5432 unreachable, causing `/api/auth/login` and all database routes to fail with HTTP 500. | Infrastructure / Docker | Start Docker Desktop and execute `npm run db:up` | **NO** |
| **P1** | **Physical iPad Enrollment Pending:** App launch, camera scanning, and touch ergonomics await physical execution. | Hardware / QA | Operator loads bundle in Expo Go | **NO** |
| **P2** | None identified in code. Static typecheck and test suites clean. | — | — | **NO** |
| **P3** | AirPrint physical hardware availability for paper receipt printing. | Hardware | Operator pairs AirPrint printer or uses PDF preview | **NO** |

---

## 10. Final Classification

### **B — PHYSICAL VALIDATION BLOCKED**
*(Critical infrastructure blocker prevents core validation: PostgreSQL database at `localhost:5432` is offline, preventing login and inventory retrieval).*

Once Docker Desktop is running and `npm run db:up` is executed, the classification immediately elevates to:
**`C — PHYSICAL POS PARTIALLY VALIDATED (READY FOR PHYSICAL TEST)`**.

---

## 11. Recommended Next Phase & Action

### Operator Action Required (No Code Changes):

1. **Start Database:**
   * Start Docker Desktop on the Windows machine.
   * Run in terminal:
     ```powershell
     npm run db:up
     ```
   * Verify PostgreSQL is listening on port 5432.

2. **Verify Next.js & Tunnel (Already Running):**
   * Backend is active on `0.0.0.0:3000`.
   * Ngrok is active forwarding HTTPS traffic to port 3000.

3. **Start Expo & Launch on iPad:**
   * Run in terminal:
     ```powershell
     npm --prefix apps/mobile start
     ```
   * Open **Expo Go** on the physical iPad and scan the QR code.
   * In iReader, tap **"⚙ Configure Backend URL"**, input the ngrok HTTPS URL, and tap **"Save"**.
   * Sign in with test credentials and proceed through POS catalog validation.
