# PAYMENT-06W.1 - Web Payment Authority Foundation & iPhone Handoff Report
## Pro Buyer / iReader POS

**Date:** 2026-10-02  
**Phase:** PAYMENT-06W.1  
**Status:** COMPLETED (PASS)  

---

## 1. Executive Summary

Phase **PAYMENT-06W.1** was executed to eliminate the financial vulnerability identified in audit **PAYMENT-06W**, in which selecting "Card" in Web POS registered a finalized sale and decremented inventory without electronic proof of payment.

With this implementation:
1. **Semantic Separation:** Web POS checkout now distinguishes between **Manual Card (External Terminal)** and **Stripe (Tap to Pay on iPhone)**.
2. **Authoritative Invariant Enforced:** `CARD ALLOCATED != CARD PAID`. If any funds are allocated to Stripe, the Web POS cannot finalize the sale and cannot decrement inventory until a verified `PosPayment` record with status `SUCCEEDED` exists.
3. **Explicit iPhone Handoff Integration:** Web POS discovers and targets real active `IPHONE_TAP_TO_PAY` devices in the same site/tenant. The handoff creates an authoritative `PosPayment` + `PaymentAttempt` and polls Stripe terminal lifecycle in real-time.
4. **Multi-Tenant & Concurrency Hardening:** Enforces tenant isolation, idempotency keys, atomic inventory CAS transitions, and payment-to-sale association inside `$transaction`.

---

## 2. Scope & Implementation Matrix

| Requirement | Implementation Details | Status |
| :--- | :--- | :---: |
| **Manual vs Stripe Card Separation** | Explicitly separated `Card (Terminal Manual)` vs `Stripe — Tap to Pay en iPhone` in Web POS UI and backend schemas. | **COMPLETED** |
| **Allocation vs Settlement Separation** | Split payment balance tracking treats manual methods as immediate settlement, while Stripe remains an `allocation` until electronic proof is validated. | **COMPLETED** |
| **Web Target Device Discovery** | Integrated `/api/payments/devices` selector in Web POS, discovering active `IPHONE_TAP_TO_PAY` devices for the operator's active site. | **COMPLETED** |
| **Handoff Lifecycle Polling** | Real-time status polling for `PaymentHandoff` (`CREATED` -> `ACCEPTED` -> `PROCESSING` -> `SUCCEEDED` / `FAILED` / `EXPIRED`). | **COMPLETED** |
| **Backend Finalization Guard** | `POST /api/sales` strictly validates `posPaymentIds`: verifies tenant ownership, `SUCCEEDED` status, absence of prior sale association, and sufficient amount coverage. | **COMPLETED** |
| **Inventory CAS & Sale Linkage** | `$transaction` atomicity: validates inventory status is `Available`, marks `Sold`, attaches `posPayment.saleId = sale.id`. | **COMPLETED** |

---

## 3. Automated Test Verification Matrix

All 13 automated tests in `test/web-payment-authority.test.ts` passed cleanly:

| Test ID | Test Description | Result |
| :--- | :--- | :---: |
| **T1** | Stripe allocated with missing `PosPayment` blocks Sale finalization with `UNSETTLED_STRIPE_PAYMENT`. | **PASS** |
| **T2-T6** | `PosPayment` in statuses `CREATED`, `PROCESSING`, `UNKNOWN`, `FAILED`, `CANCELED` blocks Sale finalization. | **PASS** |
| **T7** | `PosPayment` in status `SUCCEEDED` permits Stripe allocation to settle. | **PASS** |
| **T8** | `PosPayment` amount lower than allocated Stripe amount blocks Sale finalization. | **PASS** |
| **T9** | Cross-tenant `PosPayment` reference rejected (multi-tenant boundary preserved). | **PASS** |
| **T10** | Reused `PosPayment` already linked to another completed `Sale` is rejected. | **PASS** |
| **T11** | Manual payment methods (Cash, Transfer, External Card) operate immediately without requiring `PosPayment`. | **PASS** |
| **T12** | Web Handoff requires explicit target iPhone (`targetDeviceId` cannot be null). | **PASS** |
| **T13** | Non-iPhone (`IPAD_POS`) or inactive device is rejected as handoff target. | **PASS** |
| **T14** | Cross-site or cross-tenant iPhone is rejected as handoff target. | **PASS** |
| **T15-T17** | Split Payments (Cash + Stripe, Transfer + Stripe, Manual Card + Stripe) correctly enforce Stripe settlement before checkout. | **PASS** |
| **T18** | Handoff creation idempotency prevents duplicate `PosPayment` creation on retry. | **PASS** |
| **T19-T20** | Inventory CAS transition (`Available` -> `Sold`) and atomic `posPayment.saleId` attachment inside `$transaction`. | **PASS** |

---

## 4. Modified Files & System Integrity

1. [`src/app/api/payments/handoffs/route.ts`](file:///c:/PitayaCode/icellshoppos/src/app/api/payments/handoffs/route.ts):
   - Added validation for explicit `targetDeviceId` when initiated from Web POS.
   - Enforced target device must be active and registered as `IPHONE_TAP_TO_PAY` within the same organization and site.
2. [`src/app/api/sales/route.ts`](file:///c:/PitayaCode/icellshoppos/src/app/api/sales/route.ts):
   - Added authoritative verification for settled Stripe payments (`posPaymentIds`).
   - Integrated atomic attachment of `saleId` to `PosPayment` records within the checkout `$transaction`.
3. [`src/app/sales/page.tsx`](file:///c:/PitayaCode/icellshoppos/src/app/sales/page.tsx):
   - Updated Split Payment modal to separate `Manual Card` from `Stripe — Tap to Pay en iPhone`.
   - Added iPhone selector, target device status monitor, and live handoff state watcher.
   - Disabled "Completar Venta" button until all required Stripe allocations are electronically confirmed as `SUCCEEDED`.
4. [`test/web-payment-authority.test.ts`](file:///c:/PitayaCode/icellshoppos/test/web-payment-authority.test.ts):
   - Comprehensive test suite asserting all invariant guarantees.

---

## 5. Verification & Build Status

- **Unit Tests:** `13/13 passed` (0 failed, 0 skipped).
- **TypeScript Check:** `0 errors`.
- **Next.js Production Build:** `Compiled successfully` with 0 errors.

---

## 6. Conclusion & Next Steps

Phase **PAYMENT-06W.1** is **COMPLETE**. The Web POS payment flow is now strictly authoritative, resilient against ghost sales, and seamlessly integrated with the Tap to Pay on iPhone handoff system.
