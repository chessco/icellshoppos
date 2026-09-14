# iCellShop POS — Business Rules & Domain Logic Specification
**PitayaCode Engineering & Product Protocol**
**Document Version:** 1.0.0
**Date:** September 2026

---

## 1. Multi-Tenancy & Licensing Rules

* **BR-ORG-001 (Tenant Isolation):** Every operational record (Inventory, Sales, Customers, Suppliers, Sites, Price Rules, Credit Ledger, Repair Tickets, Audit Logs) must belong to exactly one `Organization` (`organizationId`). Cross-tenant access is prohibited unless mediated by an explicit Inter-Org Transfer workflow.
* **BR-ORG-002 (Organization Identification):** Each organization must have a globally unique `slug` for public storefront routing (`/[slug]`).
* **BR-ORG-003 (Subscription Lifecycle & Gates):**
  * Organizations default to a 14-day Free Trial upon registration.
  * An organization can operate while subscription status is `trialing` (before `trialEndsAt`) or `active`.
  * If the subscription is `past_due`, `canceled`, or `unpaid`, critical write operations (such as processing sales in `/api/sales` and viewing public inventory in `/[slug]`) are locked.
* **BR-ORG-004 (Seat Allocation Enforcement):** Each subscription plan provides a defined number of included seats (`includedSeats`). Additional active users beyond the quota require paid extra seats (`extra_seat`). Inviting or accepting new members beyond seat availability is blocked with HTTP 402.
* **BR-ORG-005 (Superadmin Privilege):** Users designated as `superadmin` bypass single-organization membership restrictions and can inspect all organizations, audit logs, and global billing records.

---

## 2. Inventory & Hardware Identification Rules

* **BR-INV-001 (Device Uniqueness):**
  * Within a single organization, each device must be uniquely identified by `[organizationId, imei]`.
  * If a device lacks an IMEI (e.g., WiFi-only iPads, accessories), it must possess a unique `serialNumber` or `sku` within that organization.
* **BR-INV-002 (Device Status States):**
  * Devices exist in one of the primary status states: `Available`, `Reserved`, `Sold`, `Returned to Supplier`, `Defective`, `Lost`, `Deleted`.
  * Soft-deleted devices have their status updated to `Deleted` with a reason prepended to `comments`.
* **BR-INV-003 (Inventory Cost Basis):**
  * Each device records its purchase cost in Pesos (`costPesos`).
  * Currency defaults to MXN (`costCurrency`). If purchased in USD, conversion rate (`usdToPesosRate`) and `costUsd` are captured historically.
* **BR-INV-004 (Multi-Site Allocation):** Every inventory item must be assigned to a valid `Site` within the organization. If unspecified, it defaults to the organization's `Main` site.
* **BR-INV-005 (Trade-in Intake):** A customer trade-in device accepted during POS checkout enters the organization's inventory as an `Available` item with supplier set to "Trade-in" and cost equal to the agreed trade-in valuation.

---

## 3. Pricing Engine & Tiers

* **BR-PRC-001 (Three-Tier Price Matrix):**
  * Pricing supports three distinct tiers: `Price` (Retail / Base Tier), `Price 2` (Wholesale Tier 1), and `Price 3` (VIP / Bulk Wholesale Tier).
* **BR-PRC-002 (Price Hierarchy Fallback):**
  * If a device or model does not have an explicit `Price 2` configured, it falls back to `Price`.
  * If it lacks `Price 3`, it falls back to `Price`.
* **BR-PRC-003 (Pricing Rule Matrix):**
  * Organizations can define catalog price rules per `[organizationId, model, capacity]`.
  * An individual inventory item may override the matrix price upon intake.
* **BR-PRC-004 (Historical Sale Immutability):**
  * When a sale is completed, the applied price and item cost are frozen into `SaleItem.salePrice` and `SaleItem.cost`.
  * Future modifications to inventory prices or pricing rule matrices MUST NEVER alter historical sale lines or historical profit margin calculations.

---

## 4. Sales & POS Checkout Rules

* **BR-POS-001 (Available Item Pre-Condition):**
  * A device CANNOT be sold unless its current status is `Available`.
  * Re-selling an item already marked `Sold`, `Deleted`, or `Returned` is strictly invalid. *(Audit Finding: Requires backend enforcement in `POST /api/sales`)*.
* **BR-POS-002 (Mandatory Customer Contact):**
  * Every checkout requires a Customer Name and a valid 10-digit WhatsApp number with an international country code (default +52 or +1).
* **BR-POS-003 (Payment Breakdown & Full Coverage):**
  * Total payments collected (Cash + Transfer + Card + Trade-in + Credit + Other) must exactly equal or exceed the total sale amount (`Math.abs(remaining) <= 0.01`).
* **BR-POS-004 (Credit Customer Authorization):**
  * The `Credit` payment method (or split credit amount) can ONLY be selected for customers who have `creditEnabled == true`.
  * Any credit utilized automatically generates a debit entry (`sale_on_credit`) in the `CreditLedger`.
* **BR-POS-005 (Sale Numbering & Uniqueness):**
  * Every completed sale receives a unique identifier formatted as `S-{timestamp}` or a custom assigned number, unique within the organization `[organizationId, saleNumber]`.
* **BR-POS-006 (Partial & Full Sale Cancellation):**
  * When a sale item is cancelled, the `SaleItem` status changes to `Cancelled`, the associated `InventoryItem` reverts from `Sold` to `Available`, and an explanatory note is recorded.
  * If the original sale was made on credit, an automated credit adjustment (`[CANCELLATION] partial_payment`) is logged in `CreditLedger` to deduct the customer's outstanding balance.

---

## 5. Wholesale, Customer Orders & Inter-Org Transfers

* **BR-WHS-001 (Public Storefront Visibility):**
  * A device is publicly visible on `/[slug]` ONLY IF:
    1. The organization's subscription is active or trialing.
    2. The organization status is active or suspended (not archived).
    3. `publicInventoryEnabled` is set to `true`.
    4. The device status is strictly `Available`.
* **BR-WHS-002 (Column Exposure Control):**
  * The public inventory endpoint must ONLY expose attributes explicitly selected in `publicInventoryColumns`.
  * Internal purchase costs (`costPesos`) must NEVER be exposed publicly.
  * Device IMEIs must NEVER be exposed publicly unless specifically enabled. *(Audit Finding: Corrected JSON serialization required)*.
* **BR-WHS-003 (Customer Purchase Request Intake):**
  * External customers placing an order via `/[slug]` generate a `PurchaseRequest` record.
  * The order records the customer's requested items, proposed prices or offers, and contact info.
* **BR-WHS-004 (Automatic Inter-Org Inventory Transfer):**
  * When Organization A sells devices to a customer whose email matches an active user of Organization B, an `InventoryTransferRequest` is generated.
  * Organization B can review the transfer request and import the items directly into their inventory.
  * Upon import into Organization B, the items' intake cost basis (`costPesos`) is set to the sale price charged by Organization A (`sourceSalePrice`). Organization A's internal purchase cost is protected.

---

## 6. Credit Ledger & Receivables Rules

* **BR-CRD-001 (Ledger Balance Calculation):**
  * Customer balance = Sum of debits (`sale_on_credit`) minus sum of credits (`partial_payment`).
* **BR-CRD-002 (Admin Edit Restriction):**
  * Only users with `canManageOrgSettings` (Admins/Superadmins) can manually edit or delete payment entries in the credit ledger. Every edit or deletion is logged in `AuditLog`.

---

## 7. Repair Service Management Rules

* **BR-REP-001 (Repair Ticket Progression):**
  * Repair tickets progress through defined stages: `receive` → `diagnosis` → `repairing` → `ready_for_pickup` → `completed` (or `cancelled`).
  * Every stage or status transition is recorded in `RepairTicketStatusLog`.
* **BR-REP-002 (Repair Ticket Conversion to POS Sale):**
  * A completed repair ticket can be checked out directly into the POS system, converting the repair fee and replacement parts into a finalized `Sale` with invoice and receipt.
