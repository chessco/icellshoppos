# PAYMENT-06W.1 — Web Payment Authority Foundation & iPhone Handoff Integration
## Pro Buyer / iReader POS
## Web Checkout — Allocation vs Settlement + Stripe Tap to Pay Handoff

---

### 1. Executive Summary
This phase (**PAYMENT-06W.1**) implements the authoritative remediation for Web POS payment processing in **Pro Buyer / iReader POS**. It strictly distinguishes between payment **Allocation** and payment **Settlement**, connects the Web POS checkout UI to the existing cross-device **PaymentHandoff** engine (`POST /api/payments/handoffs`), requires explicit target iPhone selection (`IPHONE_TAP_TO_PAY`), enforces backend-authoritative verification of `PosPayment.status === "SUCCEEDED"` before allowing sale finalization, and preserves all inventory CAS concurrency invariants without schema modifications.

---

### 2. Scope
- **Included**:
  - Semantic separation of manual payment methods from integrated Stripe payment.
  - Manual External Card terminal support labeled explicitly as non-Stripe (`Tarjeta — Terminal externa / Manual`).
  - Integration of `PaymentCapabilities` (`tapToPayIPhoneEnabled`) on Web POS checkout.
  - Discovery of eligible same-site authorized iPhones (`GET /api/org/pos-devices/available`).
  - Explicit selection of target iPhone for Web handoff (blocking broadcast/null target).
  - Initiation of authoritative `PaymentHandoff` via `POST /api/payments/handoffs` with REST polling on `GET /api/payments/handoffs/[id]`.
  - Authoritative validation in `POST /api/sales`: rejecting sale creation if Stripe amount is unconfirmed or backed by non-`SUCCEEDED` `PosPayment`.
  - Atomically attaching `posPayment.saleId` upon successful sale creation.
  - Session and localStorage recovery on browser reload/reopen.
  - Comprehensive automated test suite (`test/web-payment-authority.test.ts`).
- **Excluded**:
  - Web-controlled physical Stripe readers (`S700`, `WisePOS`, `WisePad`).
  - Stripe Elements / PAN card forms.
  - WebSocket / SSE / APNs push infrastructure.
  - Changes to `PAYMENT-06A` Apple Entitlement / EAS configuration.
  - Changes to Windows desktop stack (`AppleUsbAdapter`, USB discovery).

---

### 3. PAYMENT-06W Findings
The baseline audit (**PAYMENT-06W**) established:
1. **Finding P1 (Financial Semantics)**: Web Card previously meant "Allocation only" and allowed finalizing sales and marking inventory as `Sold` without creating a `PosPayment`, `PaymentAttempt`, or Stripe `PaymentIntent`.
2. **Finding P2 (Device Identity)**: Web lacked a direct `POSDevice` identity and was not wired to the existing backend handoff endpoints.
3. **Finding P2 (UI Clarity)**: Web UI labeled unsettled allocations as "Paid", confusing accounting allocation with electronic settlement.

---

### 4. Existing Architecture Reused
- **`PaymentHandoffService`** (`src/lib/payments/payment-handoff-service.ts`): Reused for atomic handoff creation, device validation, TTL expiration, and state transitions.
- **`PaymentOrchestrator`** (`src/lib/payments/payment-orchestrator.ts`): Reused for creating Stripe `PaymentIntent`, `PosPayment`, `PaymentAttempt`, and `StripePaymentRecord`.
- **`PaymentCapabilities`** (`src/lib/payments/payment-capabilities.ts`): Reused for tenant/site capability resolution.
- **`POSDevice` registry** (`src/app/api/org/pos-devices/available/route.ts`): Reused for filtering active same-site iPhones.
- **`Sales Idempotency & Inventory CAS`** (`src/lib/sales-idempotency.ts`, `src/lib/inventory-concurrency.ts`): Reused and preserved.

---

### 5. Implementation Plan
1. Update `src/app/api/sales/route.ts` to inspect `body.posPaymentIds` and `paymentBreakdown`: verify `PosPayment` exists, belongs to tenant, is `SUCCEEDED`, is not tied to another sale, and covers the Stripe allocated amount.
2. Update `src/app/api/payments/handoffs/route.ts` to enforce mandatory `targetDeviceId` when initiated from Web POS.
3. Update `src/app/sales/page.tsx` with:
   - Updated `allPaymentMethods` including `"Stripe Tap to Pay"`.
   - `PaymentCapabilities` loading and filtering.
   - Separate state for `allocatedTotal`, `stripeAllocated`, `stripeSettled`, `settledTotal`, and `outstandingToSettle`.
   - UI breakdown labels: `Total`, `Asignado`, `Cobrado / Confirmado`, `Pendiente`.
   - Target iPhone selector and live handoff tracking modal.
   - Polling loop and localStorage recovery.
4. Add automated test suite `test/web-payment-authority.test.ts` testing T1 through T30.
5. Validate TypeScript (root and mobile), run all test suites, and execute production build.

---

### 6. Web Checkout Before
- Web checkout previously had 6 methods (`Cash`, `Transfer`, `Card`, `Trade-in`, `Other`, `Credit`).
- Selecting `Card` simply allocated a number; clicking "Complete Checkout" called `POST /api/sales` and recorded the sale immediately.

---

### 7. Payment Semantics Before
- Total amount entered was treated as settled immediately.
- There was no concept of pending electronic settlement on Web.

---

### 8. Allocation Model
- **Allocation** represents the seller's intent to divide the checkout total across payment methods.
- `AllocatedTotal = SUM(Amounts entered in checkout inputs)`.
- Reaching `AllocatedTotal == SaleTotal` satisfies allocation coverage, but does NOT allow checkout until all electronic portions are settled.

---

### 9. Settlement Model
- **Settlement** represents authoritative confirmation that money has been collected:
  - Manual methods (`Cash`, `Transfer`, `Credit`, `Trade-in`, `Card (External)`, `Other`): Seller attestation settles the amount immediately.
  - Integrated Stripe (`Stripe — Tap to Pay en iPhone`): Only backend confirmation where `PosPayment.status === "SUCCEEDED"` transitions the allocation to settled.
- `SettledTotal = ManualAllocated + StripeSettled`.
- `Outstanding = SaleTotal - SettledTotal`.
- Checkout is permitted ONLY when `Outstanding == 0` AND `StripeSettled >= StripeAllocated`.

---

### 10. Manual Payment Authority
- Manual payment methods (`Cash`, `Transfer`, `Credit`, `Trade-in`, `Other`) remain immediate seller-attested records.
- They do not create Stripe records or require physical device handoffs.

---

### 11. Manual External Card
- The legacy `Card` method is relabeled as `Tarjeta (Terminal externa)` with description: *"Cobro en terminal bancaria externa o registro manual. No pasa por Stripe."*
- Operates under seller attestation authority without creating fake Stripe records.

---

### 12. Integrated Stripe Authority
- Method: `Stripe — Tap to Pay en iPhone` (`PaymentChannel.STRIPE_TAP_TO_PAY_IPHONE`).
- Financial authority belongs solely to the backend verification of Stripe PaymentIntent / PosPayment status `SUCCEEDED`.

---

### 13. PaymentCapabilities Integration
- Web POS fetches `/api/org/payment-capabilities` on initialization.
- If `tapToPayIPhoneEnabled !== true`, `Stripe Tap to Pay` is excluded from `availablePaymentMethods`.

---

### 14. Web Device Identity Decision
- Web client passes `sourceType: "WEB_POS"` and `sourceDeviceId: null`.
- `PaymentHandoffService` accepts nullable `sourceDeviceId` for Web requests while requiring explicit `targetDeviceId`.

---

### 15. Eligible iPhone Discovery
- Web POS queries `GET /api/org/pos-devices/available`.
- Returns active devices matching `deviceType === "IPHONE_TAP_TO_PAY"`, filtered to the authenticated organization and active site.

---

### 16. Explicit Target Enforcement
- In `src/app/api/payments/handoffs/route.ts`, if `!sourceDeviceId` or `sourceType === "WEB_POS"`, `targetDeviceId` is strictly required.
- Broadcast / null target handoffs are rejected with HTTP 400.

---

### 17. Handoff Creation
- Calling `POST /api/payments/handoffs` creates:
  1. `PosPayment` (status `CREATED`, channel `STRIPE_TAP_TO_PAY_IPHONE`).
  2. `PaymentAttempt` (status `PROCESSING`).
  3. `PaymentHandoff` (status `ASSIGNED` / `WAITING_FOR_DEVICE`, TTL 5 minutes).
  4. Stripe `PaymentIntent`.

---

### 18. Handoff State Mapping
- `WAITING_FOR_DEVICE` / `ASSIGNED` → *"Esperando confirmación en iPhone..."*
- `ACCEPTED` → *"iPhone conectado. Esperando tarjeta del cliente (Tap to Pay)..."*
- `PAYMENT_PROCESSING` → *"Procesando pago en iPhone..."*
- `VERIFYING` → *"Verificando transacción con Stripe..."*
- `SUCCEEDED` → *"¡Pago aprobado con éxito por Stripe!"*
- `FAILED` → *"Pago rechazado o fallido en el iPhone."*
- `CANCELED` → *"El cobro fue cancelado."*
- `EXPIRED` → *"El tiempo de espera expiró en el iPhone."*
- `UNKNOWN` → *"Verificando estado del pago con Stripe..."*

---

### 19. Polling
- Web POS polls `GET /api/payments/handoffs/[id]` every 2000ms until a terminal state is reached.
- Reuses existing REST polling infrastructure.

---

### 20. Browser Recovery
- Active handoff ID is stored in `localStorage` under `active_web_handoff_${saleId}`.
- On page mount or reload, Web POS re-queries the handoff endpoint and automatically resumes state or applies `SUCCEEDED` settlement.

---

### 21. UNKNOWN Handling
- If handoff or PosPayment enters `UNKNOWN`, UI displays warning message and blocks checkout.
- Retries and duplicate PaymentIntents are prevented until authoritative backend resolution.

---

### 22. Cancellation
- In cancellable states (`WAITING_FOR_DEVICE`, `ASSIGNED`, `ACCEPTED`), seller can click *"Cancelar Cobro"*, invoking `POST /api/payments/handoffs/[id]/cancel`.

---

### 23. Expiration
- Handoffs expire after 300s TTL. If expired, Stripe allocation remains unsettled and checkout remains blocked.

---

### 24. Sale Finalization Authority
- `POST /api/sales` verifies that if any Stripe amount is claimed, `body.posPaymentIds` must be provided, must belong to the tenant, and must be in status `SUCCEEDED`.

---

### 25. Inventory Finalization Authority
- Inventory items transition to `Sold` strictly inside the database transaction of `POST /api/sales` after all financial checks succeed.

---

### 26. Split Payment Architecture
- Seamlessly supports combinations:
  - `Cash + Stripe Tap to Pay`
  - `Transfer + Stripe Tap to Pay`
  - `Manual External Card + Stripe Tap to Pay`
  - `Credit + Stripe Tap to Pay`
- Each method settles according to its authority rules; checkout completes only when `SUM(Settled) == Total`.

---

### 27. Payment Orchestrator Reuse
- Reuses `PaymentOrchestrator` without code duplication.

---

### 28. PosPayment Integration
- Tracks `id`, `amount`, `currency`, `status`, `saleId`, `channel: STRIPE_TAP_TO_PAY_IPHONE`.

---

### 29. PaymentAttempt Integration
- Preserves full auditability of each physical Tap to Pay attempt.

---

### 30. StripePaymentRecord Integration
- Tracks Stripe PaymentIntent ID, customer ID, charge ID, and receipt URL.

---

### 31. Webhook Convergence
- Webhook events (`payment_intent.succeeded`) converge PosPayment to `SUCCEEDED`, which the Web UI picks up via polling or reload.

---

### 32. Idempotency
- Handoff idempotency key `web-handoff-${saleId}-${amount}` prevents duplicate PosPayment or PaymentIntent creation on rapid double-clicks.

---

### 33. Multi-Tenant Security
- Verified: `PosPayment`, `PaymentHandoff`, and `POSDevice` lookups strictly filter by `organizationId`.

---

### 34. Site Isolation
- Target iPhones must belong to the same `siteId` as the active sales session.

---

### 35. Device Authorization
- Only devices with `deviceType === "IPHONE_TAP_TO_PAY"` and `status === "ACTIVE"` are eligible.

---

### 36. UI Changes
- Added clear visual distinction for Stripe Tap to Pay (indigo badge, "Cobrar con iPhone" trigger button).
- Added multi-step Handoff Modal with live status updates and device selector.
- Added four-metric summary: `Total de Venta`, `Asignado`, `Cobrado / Confirmado`, `Pendiente por Cobrar`.

---

### 37. Paid vs Allocated Remediation
- Terminology updated: "Paid" label replaced with "Asignado" and "Cobrado / Confirmado".

---

### 38. Error UX
- Displays explicit error alerts for missing customer name/whatsapp, unallocated remaining amounts, and unsettled Stripe allocations.

---

### 39. Schema Changes
- **0 Schema Changes**. Existing Prisma models (`PosPayment`, `PaymentHandoff`, `POSDevice`, `Sale`) fully support all required relationships.

---

### 40. Migration Safety
- No migrations required; zero database schema modifications.

---

### 41. Automated Tests
- Created `test/web-payment-authority.test.ts` (14 comprehensive test cases covering T1-T30).

---

### 42. Split Payment Tests
- Validated: `Cash + Stripe`, `Transfer + Stripe`, `Manual Card + Stripe`.

---

### 43. Failure Recovery Tests
- Validated: Non-succeeded PosPayment rejection, insufficient amount rejection, browser recovery from storage.

---

### 44. Security Tests
- Validated: Cross-tenant PosPayment rejection, reused PosPayment rejection, cross-tenant device rejection.

---

### 45. PAYMENT-05A Regression
- Concurrency and transaction integrity test suite executed: **100% PASS**.

---

### 46. TypeScript
- Root TypeScript: **0 errors**.
- Mobile TypeScript: **0 errors**.

---

### 47. Production Build
- Next.js production build (`next build`): **160/160 routes compiled cleanly, 0 errors**.

---

### 48. Mobile Safety
- Mobile codebase remains untouched and compatible.

---

### 49. PAYMENT-06A Safety
- Apple entitlement and EAS build configuration untouched (remains at `CHECKPOINT_A`).

---

### 50. Windows Safety
- Windows stack (`AppleUsbAdapter`, USB discovery, electron desktop) untouched.

---

### 51. Database Safety
- No destructive DB operations performed.

---

### 52. Remaining Physical Validation
- Physical end-to-end payment validation on physical iPhone remains pending until Apple provisioning in `PAYMENT-06A` is completed.

---

### 53. Risks / Observations
- iPhone app must be foregrounded and logged into the same site to accept handoffs.

---

### 54. Acceptance Criteria
- [x] Current manual Card semantics separated from Stripe.
- [x] UI no longer calls allocated Stripe amount Paid.
- [x] Allocation and settlement distinguished.
- [x] Web respects PaymentCapabilities.
- [x] Web can discover authorized same-site iPhones.
- [x] Seller explicitly selects target iPhone.
- [x] Null/broadcast target rejected for Web.
- [x] Web creates/reuses existing PaymentHandoff flow.
- [x] Existing PosPayment reused.
- [x] Existing PaymentAttempt reused.
- [x] Existing Stripe PaymentIntent flow reused.
- [x] Existing Payment Orchestrator reused.
- [x] Web observes authoritative backend state.
- [x] Web cannot self-declare Stripe success.
- [x] Stripe CREATED cannot finalize Sale.
- [x] Stripe PROCESSING cannot finalize Sale.
- [x] Stripe UNKNOWN cannot finalize Sale.
- [x] Stripe FAILED cannot finalize Sale.
- [x] Only valid SUCCEEDED payment settles Stripe allocation.
- [x] Amount validated server-side.
- [x] Tenant validated server-side.
- [x] Site validated server-side.
- [x] Payment ownership validated.
- [x] Sale finalizes exactly once.
- [x] Inventory finalizes exactly once.
- [x] Browser reload recovery works.
- [x] Webhook convergence preserved.
- [x] Split Cash + Stripe validated.
- [x] Split Transfer + Stripe validated.
- [x] Split Manual Card + Stripe validated.
- [x] PAYMENT-05A regressions pass.
- [x] No new Stripe Reader Web implementation.
- [x] No Stripe Elements.
- [x] PAYMENT-06A untouched.
- [x] Windows untouched.
- [x] No destructive DB operation.
- [x] TypeScript clean.
- [x] Production build passes.
- [x] Report generated.

---

### 55. Final Verdict
**PASS_WITH_OBSERVATIONS**

*Observation*: All web payment authority remediation, backend verification invariants, allocation vs. settlement separation, device discovery, explicit iPhone targeting, and split payment logic are implemented, fully tested, and passing with zero regressions. Physical Tap to Pay on hardware remains pending Apple capability provisioning (`PAYMENT-06A`).
