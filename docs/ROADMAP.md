# iCellShop POS — Engineering & Product Roadmap
**PitayaCode Engineering & Product Protocol**
**Document Version:** 1.0.0
**Date:** September 2026

---

## Roadmap Structure & Prioritization Philosophy

Under the PitayaCode Engineering Protocol, progression follows:
`DATA INTEGRITY > SECURITY > TENANT ISOLATION > BUSINESS CORRECTNESS > OPERATIONAL RELIABILITY > PERFORMANCE > UX > NEW FEATURES`

Every phase is grouped by business justification, technical dependencies, and risk reduction.

---

## P0 — Production Critical (Immediate Stability & Zero-Risk Baseline)

Must be completed before any new features or production deployment cutover:

* **P0.1 Package & Git Baseline:**
  * Initialize git tracking (`git init`) and create baseline clean commit.
  * Add standard `"scripts"` block to `package.json` (`"dev"`, `"build"`, `"start"`, `"lint"`).
* **P0.2 Cloud Deployment Healthcheck Fix:**
  * Update `/api/system-health` to allow unauthenticated basic health probe (`{ status: "ok", db: true }`), allowing Railway / Render deployment health checks to succeed.
  * Keep detailed diagnostic checks for authenticated superadmins under `/api/admin/system-health` or with secret key.
* **P0.3 Inventory & Sale Integrity Hardening:**
  * Enforce in `POST /api/sales` that EVERY item must exist in `InventoryItem`, belong to the caller's `organizationId`, and have `status: 'Available'`.
  * Return HTTP 409 Conflict if an item is missing or not Available.
  * Prevent race conditions on concurrent checkout of the same IMEI.
* **P0.4 Public Inventory Data Exposure Patch:**
  * Fix `/api/public-inventory-by-slug/[slug]` JSON mapper to respect `visibleColumns` strictly, stopping unconditional leakage of `imei`, `sku`, and `cost`.
* **P0.5 Fix Prisma Delete Where Calls:**
  * Update `src/app/api/suppliers/route.ts` and `src/app/api/repair-typical-failures/route.ts` to use `deleteMany` or verified unique where conditions to prevent runtime Prisma exceptions.
* **P0.6 Canonical Stripe Webhook Consolidation:**
  * Retire `/api/billing/stripe-webhook` and funnel all webhook traffic to canonical `/api/billing/webhook`.

---

## P1 — Operational Stability & Architecture Standardization

Necessary for daily operations and reliable team workflows:

* **P1.1 Transactional Trade-In Refactoring:**
  * Eliminate popup `/add-device?popup=trade-in` and unmount `beforeunload` cleanup.
  * Pass trade-in device intake details in the checkout payload of `POST /api/sales`, creating the trade-in inventory item atomically within the checkout database transaction.
* **P1.2 Full Migration from LocalStorage to PostgreSQL:**
  * Transition remaining `localStorage` settings (`icellshop_receipt_logo`, `icellshop_grade_options`, `icellshop_condition_options`, `icellshop_pricing_history`) in `src/lib/sheets.ts` to read/write directly from `Organization` table fields in PostgreSQL.
* **P1.3 Database Index Optimization:**
  * Create non-breaking migration adding indexes to:
    * `Sale(customerId)`
    * `InventoryItem(organizationId, serialNumber)`
    * `SaleItem(imei)`
    * `PurchaseRequest(organizationId, status)`
* **P1.4 Inter-Org Transfer Security & Verification:**
  * Require confirmed recipient consent before cross-organization inventory transfer requests are automatically materialized.
* **P1.5 Automated Unit & Integration Testing Suite:**
  * Install Vitest / Jest and configure testing for critical flows:
    * Tenant Isolation validation
    * POS Sale calculation & double-spend prevention
    * Stripe webhook signature & status transitions
    * Authentication & Role Permission resolution

---

## P2 — Product Evolution & Feature Enhancements

High-value product capabilities to streamline wholesale and retail operations:

* **P2.1 True Supplier Purchase Order Workflow:**
  * Build a formal Supplier PO module (`PurchaseOrder`, `PurchaseOrderItem`, `Receipt` tracking) to manage restocking from wholesale vendors with landed costs and exchange rates.
* **P2.2 Cloud Object Storage for Receipts & Logos:**
  * Integrate S3-compatible cloud object storage (Cloudflare R2 or AWS S3) for organization logos, receipt branding, and customer signed repair intake documents.
* **P2.3 Barcode & Thermal Hardware Integration:**
  * Direct USB / Bluetooth ESC/POS printing support for 80mm receipt printers and 2.4"x2.1" label printers (Zebra, Munbyn, Epson).
* **P2.4 Batch Warranty & Carrier Lookup (Bulk IMEICheck2):**
  * One-click bulk carrier lock, FMI, and iCloud status validation during CSV inventory import.

---

## P3 — Strategic & Intelligence Capabilities (iCellShop AI)

Advanced automation and data intelligence:

* **P3.1 Inventory & Dead-Stock Intelligence:**
  * Automated aging curves, velocity scoring (fast-moving vs slow-moving models), and capital lockup valuation.
* **P3.2 Dynamic Pricing & Margin Recommendations:**
  * Automatic price adjustment suggestions based on USD/MXN exchange fluctuations and competitor price benchmarks.
* **P3.3 iCellShop AI Copilot:**
  * Natural language conversational interface for warehouse managers and executives:
    * *"What 256GB iPhones do I have in stock across all sites?"*
    * *"Which supplier gave me the lowest cost on iPhone 13 Pro last month?"*
    * *"What is my average realized margin per wholesale customer this week?"*
