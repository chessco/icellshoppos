# iCellShop POS — Enterprise Risk Register
**PitayaCode Engineering & Product Protocol**
**Document Version:** 1.0.0
**Date:** September 2026

---

## Risk Severity Matrix & Impact Criteria

* **Severity:** CRITICAL (Data Loss, Security Breach, Billing/Sale Corruption), HIGH (Operational Blocker, Tenant Leak), MEDIUM (Inconsistency, UX Degradation), LOW (Cosmetic, Code Smell).
* **Probability:** HIGH (Frequent occurrence / default state), MEDIUM (Occurs under specific concurrent conditions), LOW (Edge case).

---

## 1. Risk Inventory Table

| ID | Area | Risk Description | Severity | Prob | Impact | Recommendation |
|---|---|---|---|---|---|---|
| **RSK-001** | Inventory / Sales | **Missing Available Status Check in Checkout:** `POST /api/sales` does not verify `status: 'Available'`. A device already marked `Sold` or `Deleted` can be sold repeatedly. | **CRITICAL** | High | High | Add explicit query constraint `status: 'Available'` and reject checkout with HTTP 409 if any item is not available. |
| **RSK-002** | Inventory / Sales | **Sale of Non-Existent Inventory:** In `POST /api/sales`, if an IMEI is not found in inventory, the route creates a `SaleItem` anyway with `inventoryItemId: null`, empty model/capacity/color, and `cost: 0`. | **CRITICAL** | Medium | High | Enforce that all items in checkout must resolve to valid, active inventory items owned by the organization. |
| **RSK-003** | Public Inventory | **IMEI & Serial Data Leak in Public Storefront:** In `/api/public-inventory-by-slug/[slug]`, the response mapping unconditionally includes `imei`, `sku`, and `price` in the JSON payload even when unchecked by org admin. | **HIGH** | High | High | Restructure response mapper so `imei`, `sku`, and sensitive fields are excluded unless explicitly enabled in `visibleColumns`. |
| **RSK-004** | Deployment / Health | **Healthcheck Probe Fails on Cloud Providers:** `/api/system-health` requires an authenticated `superadmin` session. Railway / Render healthchecks do not send cookies and will fail (HTTP 401), crashing or restarting the service. | **CRITICAL** | High | High | Allow unauthenticated health probes on `/api/system-health` with lightweight DB ping (`SELECT 1`), reserving detailed diagnostics for superadmins or internal secret. |
| **RSK-005** | Build / Runtime | **Missing `"scripts"` in `package.json`:** `package.json` lacks `"scripts"` block (`"build"`, `"start"`, `"dev"`, `"lint"`). Deployment pipelines running `npm run build` will fail with missing script error. | **CRITICAL** | High | High | Add standard Next.js npm scripts block to `package.json`. |
| **RSK-006** | Multi-Tenancy | **Unverified Cross-Org Inter-Tenant Transfer Backfill:** In `/api/inventory-requests`, any user loading the page triggers a search across all sales from all organizations matching their user email, creating import requests based purely on unverified customer email strings. | **HIGH** | Medium | High | Require two-factor acceptance or explicit customer organization authorization before sales are transferred across organizations. |
| **RSK-007** | Database / Safety | **Uninitialized Git Repository:** The workspace directory is not a git repository (`fatal: not a git repository`). No local version history or git diff tracking exists. | **HIGH** | High | High | Initialize git tracking (`git init`), create clean initial baseline commit, and verify `.gitignore`. |
| **RSK-008** | POS / UX | **Fragile Trade-in Popup & Zombie Inventory:** Trade-in creates an inventory item via browser popup before sale completion. Unfinished sales rely on `beforeunload` fetch to delete, creating orphaned items if browser crashes. | **HIGH** | Medium | Medium | Refactor trade-in to submit intake payload directly inside `POST /api/sales`, creating the inventory item within the same database transaction. |
| **RSK-009** | Database / Prisma | **Invalid Where Clause in Delete Calls:** `src/app/api/suppliers/route.ts` calls `db.supplier.delete({ where: { id, organizationId } })`, but `Supplier` lacks a compound unique on `[id, organizationId]`. | **HIGH** | High | Medium | Use `db.supplier.deleteMany({ where: { id, organizationId } })` or add compound unique in Prisma schema. |
| **RSK-010** | Storage / Sync | **Settings Stored in LocalStorage Instead of DB:** `src/lib/sheets.ts` stores receipt logo, condition options, grade options, and pricing history in `localStorage`, causing settings not to sync across different workstations. | **MEDIUM** | High | Medium | Migrate remaining `localStorage` helpers in `sheets.ts` to fetch and update `Organization` table fields (`logoData`, `gradeOptionsJson`, `receiptConfigJson`). |
| **RSK-011** | Security / Auth | **Hardcoded Superadmin Fallback Credentials:** `prisma/seed.ts` and `.env.example` include hardcoded default email `arturo.dltv@gmail.com` and password `ChangeMeNow!123`. | **HIGH** | High | High | Require environment variables with no hardcoded fallback password. Force change on initial seed. |
| **RSK-012** | Billing / Stripe | **Duplicate Webhook Endpoints:** Both `/api/billing/webhook` and `/api/billing/stripe-webhook` exist and listen to Stripe events. | **MEDIUM** | Medium | Medium | Consolidate onto canonical `/api/billing/webhook` and redirect/retire the redundant route. |
| **RSK-013** | Database / Perf | **Missing Database Indexes on Critical Foreign Keys:** `Sale` lacks index on `customerId`; `InventoryItem` lacks index on `serialNumber`; `SaleItem` lacks index on `imei`. | **MEDIUM** | Medium | Medium | Add missing Prisma indexes in next non-breaking migration. |
| **RSK-014** | Architecture | **Unindexed JSON Payloads for Purchase Requests:** `PurchaseRequest.payload` contains all order items and `saleId` in raw JSON, requiring in-memory JavaScript filtering across all orders. | **MEDIUM** | Low | Medium | Extract structured fields (`saleId`, `status`) into top-level columns and index them. |
| **RSK-015** | Testing / QA | **Zero Automated Test Coverage:** No Jest, Vitest, Playwright, or Cypress test suites exist in the project. Any refactoring risks regressions. | **HIGH** | High | High | Install Vitest or Jest, set up in-memory DB or integration harness, and cover P0 paths (Auth, Tenancy, Sale Transactions). |
| **RSK-016** | Background Jobs | **Undocumented Cron Secret for Dead Stock Reminders:** `/api/cron/dio-reminders` requires `DIO_CRON_SECRET`, but this variable is not documented in `DEPLOYMENT_PHASE1.md` or `.env.example`. | **LOW** | High | Low | Document `DIO_CRON_SECRET` in `.env.example` and deployment runbooks. |
