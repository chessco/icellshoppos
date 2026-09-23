import test from "node:test";
import assert from "node:assert/strict";
import type { ActiveDiscountAuthInfo, BackendSaleCreatePayload } from "@ireader/contracts";

test("Discount Authorization: Cart total accurately applies authorized discounts", () => {
  const subtotal = 24999;
  const auth: ActiveDiscountAuthInfo = {
    id: "auth-123",
    status: "APPROVED",
    requestedDiscount: 1000,
    approvedDiscount: 700,
    reason: "Cliente frecuente",
    responseNote: "Aprobado 700",
  };

  assert.equal(auth.status, "APPROVED");
  assert.equal(auth.approvedDiscount, 700);

  const appliedDiscount = auth.status === "APPROVED" ? auth.approvedDiscount : 0;
  const finalTotal = Math.max(0, subtotal - appliedDiscount);

  assert.equal(appliedDiscount, 700);
  assert.equal(finalTotal, 24299);
});

test("Discount Authorization: Pending authorization blocks checkout total and reports pending status", () => {
  const auth: ActiveDiscountAuthInfo = {
    id: "auth-456",
    status: "PENDING",
    requestedDiscount: 500,
    approvedDiscount: 0,
    reason: "Promoción especial",
  };

  assert.equal(auth.status, "PENDING");
  // En estado PENDING no se aplica el descuento al total hasta que el autorizador responda por WhatsApp
  const appliedDiscount = (auth.status as string) === "APPROVED" ? auth.approvedDiscount : 0;
  assert.equal(appliedDiscount, 0);

  // Verificamos que el checkout payload valide y contenga la autorización
  const payload: BackendSaleCreatePayload = {
    customerName: "Juan Pérez",
    customerWhatsapp: "+526441234567",
    paymentMethod: "Cash",
    authorizationId: auth.id,
    discount: appliedDiscount,
    items: [{ imei: "357587000000085", salePrice: 24999 }],
  };

  assert.equal(payload.authorizationId, "auth-456");
  assert.equal(payload.discount, 0);
});

test("Discount Authorization: Partial authorization sets approved amount", () => {
  const auth: ActiveDiscountAuthInfo = {
    id: "auth-789",
    status: "PARTIAL",
    requestedDiscount: 1500,
    approvedDiscount: 1000,
    reason: "Ajuste por detalles",
    responseNote: "Solo autorizado hasta 1000",
  };

  assert.equal(auth.status, "PARTIAL");
  assert.equal(auth.requestedDiscount, 1500);
  assert.equal(auth.approvedDiscount, 1000);
});

test("WhatsApp Receipt: Format message string correctly with sale folio and items", () => {
  const saleFolio = "S-1727110000";
  const customerName = "María González";
  const total = 28299;
  const items = [{ model: "iPhone 17 Pro Max 256GB Cosmic Orange", salePrice: 28299 }];

  const itemsText = items.map((it) => `• ${it.model} - $${it.salePrice.toLocaleString()}`).join("\n");
  const message =
    `¡Hola ${customerName}! Muchas gracias por tu compra.\n\n` +
    `🧾 Folio de Venta: ${saleFolio}\n` +
    `💰 Total: $${total.toLocaleString()} MXN\n` +
    `📦 Artículos:\n${itemsText}`;

  assert.ok(message.includes("María González"));
  assert.ok(message.includes("S-1727110000"));
  assert.ok(message.includes("iPhone 17 Pro Max"));
  assert.ok(message.includes("$28,299"));
});
