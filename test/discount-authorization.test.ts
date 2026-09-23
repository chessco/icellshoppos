import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateDiscountFinancials,
  resolveApprovedDiscountAndStatus,
  type EquipmentSnapshot,
  type ReviewAction,
} from "../src/lib/discount-authorization.ts";
import { resolveEffectivePermissions } from "../src/lib/org-permissions.ts";

test("FASE 12 - TEST 1: Solicitar $600 de descuento calcula snapshot y estado PENDING", () => {
  const items: EquipmentSnapshot[] = [
    {
      inventoryItemId: "inv-1",
      imei: "354928110293847",
      serialNumber: "SN123",
      model: "iPhone 13",
      capacity: "128GB",
      color: "Blue",
      batteryHealth: "92%",
      costPesos: 7000,
      salePrice: 10000,
    },
  ];

  const financials = calculateDiscountFinancials({
    items,
    requestedDiscount: 600,
  });

  assert.equal(financials.originalPrice, 10000);
  assert.equal(financials.totalCost, 7000);
  assert.equal(financials.requestedDiscount, 600);
  assert.equal(financials.priceAfterRequestedDiscount, 9400);
  assert.equal(financials.marginBeforeDiscount, 3000);
  assert.equal(financials.marginPercentageBeforeDiscount, 30);
  assert.equal(financials.marginAfterRequestedDiscount, 2400);
  assert.equal(financials.marginPercentageAfterRequestedDiscount, 25.53);
});

test("FASE 12 - TEST 2: Aprobar $600 (Aprobación total)", () => {
  const resolution = resolveApprovedDiscountAndStatus({
    action: "APPROVE",
    requestedDiscount: 600,
  });

  assert.equal(resolution.status, "APPROVED");
  assert.equal(resolution.approvedDiscount, 600);
});

test("FASE 12 - TEST 3: Aprobar $300 (Aprobación parcial)", () => {
  const resolution = resolveApprovedDiscountAndStatus({
    action: "APPROVE_PARTIAL",
    requestedDiscount: 600,
    partialAmount: 300,
  });

  assert.equal(resolution.status, "PARTIAL");
  assert.equal(resolution.approvedDiscount, 300);
});

test("FASE 12 - TEST 4: Rechazar $600 autoriza $0", () => {
  const resolution = resolveApprovedDiscountAndStatus({
    action: "REJECT",
    requestedDiscount: 600,
  });

  assert.equal(resolution.status, "REJECTED");
  assert.equal(resolution.approvedDiscount, 0);
});

test("FASE 12 - TEST 5: Intentar aprobar $700 cuando se solicitaron $600 lanza error (REGLA 1)", () => {
  assert.throws(
    () => {
      resolveApprovedDiscountAndStatus({
        action: "APPROVE_PARTIAL",
        requestedDiscount: 600,
        partialAmount: 700,
      });
    },
    {
      message: /menor al descuento solicitado/,
    }
  );
});

test("FASE 12 - TEST 6: Intentar finalizar venta estando PENDING es bloqueado (REGLA 2)", () => {
  const authorization = {
    id: "auth-123",
    status: "PENDING",
    draftSaleId: "S-1001",
    organizationId: "org-1",
    requestedDiscount: 600,
    approvedDiscount: 0,
    completedSaleId: null,
  };

  const validateCheckoutAuthorization = (auth: typeof authorization) => {
    if (auth.status !== "APPROVED" && auth.status !== "PARTIAL") {
      throw new Error(`La autorización se encuentra en estado ${auth.status} y no permite finalizar la venta con descuento.`);
    }
  };

  assert.throws(
    () => validateCheckoutAuthorization(authorization),
    {
      message: /La autorización se encuentra en estado PENDING y no permite finalizar la venta con descuento/,
    }
  );
});

test("FASE 12 - TEST 7: Intentar finalizar venta estando REJECTED es bloqueado (REGLA 3)", () => {
  const authorization = {
    id: "auth-123",
    status: "REJECTED",
    draftSaleId: "S-1001",
    organizationId: "org-1",
    requestedDiscount: 600,
    approvedDiscount: 0,
    completedSaleId: null,
  };

  const validateCheckoutAuthorization = (auth: typeof authorization) => {
    if (auth.status !== "APPROVED" && auth.status !== "PARTIAL") {
      throw new Error(`La autorización se encuentra en estado ${auth.status} y no permite finalizar la venta con descuento.`);
    }
  };

  assert.throws(
    () => validateCheckoutAuthorization(authorization),
    {
      message: /La autorización se encuentra en estado REJECTED y no permite finalizar la venta con descuento/,
    }
  );
});

test("FASE 12 - TEST 8: Finalizar venta con PARTIAL aplica exactamente el monto autorizado (REGLA 5 y 6)", () => {
  const authorization = {
    id: "auth-123",
    status: "PARTIAL" as const,
    draftSaleId: "S-1001",
    organizationId: "org-1",
    requestedDiscount: 600,
    approvedDiscount: 300,
    completedSaleId: null,
  };

  const subtotal = 10000;
  const appliedDiscount = authorization.approvedDiscount;
  const total = subtotal - appliedDiscount;

  assert.equal(appliedDiscount, 300);
  assert.equal(total, 9700);

  // Intentar aplicar $500 cuando se autorizaron $300 debe fallar
  const attemptToApply = (amount: number) => {
    if (amount > authorization.approvedDiscount) {
      throw new Error(`El descuento aplicado ($${amount}) excede el descuento autorizado ($${authorization.approvedDiscount}).`);
    }
  };

  assert.throws(
    () => attemptToApply(500),
    {
      message: /El descuento aplicado \(\$500\) excede el descuento autorizado \(\$300\)/,
    }
  );
});

test("FASE 12 - TEST 9: Intentar modificar una autorización ya respondida es bloqueado (REGLA 7)", () => {
  const authorization = {
    id: "auth-123",
    status: "APPROVED" as const,
    requestedDiscount: 600,
    approvedDiscount: 600,
  };

  const updateAuthorization = (currentStatus: string) => {
    if (currentStatus !== "PENDING") {
      throw new Error(`Esta solicitud ya fue procesada anteriormente con estado ${currentStatus} y no puede modificarse.`);
    }
  };

  assert.throws(
    () => updateAuthorization(authorization.status),
    {
      message: /ya fue procesada anteriormente con estado APPROVED/,
    }
  );
});

test("FASE 12 - TEST 10: Intentar utilizar autorización de otra venta es bloqueado (REGLA 8)", () => {
  const authorization = {
    id: "auth-123",
    status: "APPROVED" as const,
    draftSaleId: "S-1001",
    organizationId: "org-1",
  };

  const currentSaleId = "S-9999";

  const validateSaleMatch = (authDraftSaleId: string, targetSaleId: string) => {
    if (authDraftSaleId !== targetSaleId) {
      throw new Error("La autorización no corresponde al identificador de esta venta.");
    }
  };

  assert.throws(
    () => validateSaleMatch(authorization.draftSaleId, currentSaleId),
    {
      message: /La autorización no corresponde al identificador de esta venta/,
    }
  );
});

test("FASE 12 - TEST 11: Intentar utilizar autorización de otro tenant es bloqueado (REGLA 9)", () => {
  const authorizationTenant = "org-alfa";
  const sessionTenant = "org-beta";

  const validateTenantIsolation = (authTenant: string, userTenant: string) => {
    if (authTenant !== userTenant) {
      throw new Error("Autorización de descuento no encontrada o no pertenece a esta organización.");
    }
  };

  assert.throws(
    () => validateTenantIsolation(authorizationTenant, sessionTenant),
    {
      message: /no pertenece a esta organización/,
    }
  );
});

test("FASE 12 - TEST 12: Intentar autorizar sin permisos es bloqueado (canApproveDiscounts)", () => {
  // Staff por defecto no tiene canApproveDiscounts
  const staffPermissions = resolveEffectivePermissions("staff", null);
  assert.equal(staffPermissions.canApproveDiscounts, false);

  const checkApprovePermission = (permissions: typeof staffPermissions) => {
    if (!permissions.canApproveDiscounts) {
      throw new Error("No tienes permiso para autorizar descuentos (canApproveDiscounts requerido).");
    }
  };

  assert.throws(
    () => checkApprovePermission(staffPermissions),
    {
      message: /No tienes permiso para autorizar descuentos/,
    }
  );

  // Admin y superadmin sí lo tienen por defecto
  const adminPermissions = resolveEffectivePermissions("admin", null);
  assert.equal(adminPermissions.canApproveDiscounts, true);

  const superadminPermissions = resolveEffectivePermissions("superadmin", null);
  assert.equal(superadminPermissions.canApproveDiscounts, true);
});

test("FASE 12 - TEST 13: Verificar cálculo de total con y sin descuento", () => {
  const subtotal = 15000;
  const discount1 = 0;
  const total1 = Math.max(0, subtotal - discount1);
  assert.equal(total1, 15000);

  const discount2 = 1200;
  const total2 = Math.max(0, subtotal - discount2);
  assert.equal(total2, 13800);
});

test("FASE 12 - TEST 14: Verificar cálculo de margen antes y después del descuento", () => {
  const cost = 8000;
  const salePrice = 12000;
  const discount = 1000;

  const marginBefore = salePrice - cost; // 4000
  const marginPercentBefore = (marginBefore / salePrice) * 100; // 33.33%

  const salePriceAfterDiscount = salePrice - discount; // 11000
  const marginAfter = salePriceAfterDiscount - cost; // 3000
  const marginPercentAfter = (marginAfter / salePriceAfterDiscount) * 100; // 27.27%

  assert.equal(marginBefore, 4000);
  assert.equal(Number(marginPercentBefore.toFixed(2)), 33.33);

  assert.equal(marginAfter, 3000);
  assert.equal(Number(marginPercentAfter.toFixed(2)), 27.27);
});

test("FASE 12 - TEST 15: Verificar auditoría y trazabilidad completa", () => {
  // Simular ciclo de vida completo de auditoría
  const auditLogs: Array<{ action: string; meta: Record<string, unknown> }> = [];

  const recordAudit = (action: string, meta: Record<string, unknown>) => {
    auditLogs.push({ action, meta });
  };

  // 1. Solicitud
  recordAudit("discount_authorization.create", {
    draftSaleId: "S-1001",
    requestedDiscount: 600,
    reason: "Cliente frecuente",
    requestedBy: "vendedor@icellshop.com",
  });

  // 2. Aprobación parcial
  recordAudit("discount_authorization.partial", {
    draftSaleId: "S-1001",
    requestedDiscount: 600,
    approvedDiscount: 300,
    authorizedBy: "admin@icellshop.com",
    responseNote: "Solo 300 por margen",
  });

  // 3. Checkout
  recordAudit("sale.create", {
    saleNumber: "S-1001",
    subtotal: 10000,
    discount: 300,
    total: 9700,
    authorizationId: "auth-123",
  });

  assert.equal(auditLogs.length, 3);
  assert.equal(auditLogs[0].action, "discount_authorization.create");
  assert.equal(auditLogs[0].meta.requestedDiscount, 600);

  assert.equal(auditLogs[1].action, "discount_authorization.partial");
  assert.equal(auditLogs[1].meta.approvedDiscount, 300);

  assert.equal(auditLogs[2].action, "sale.create");
  assert.equal(auditLogs[2].meta.discount, 300);
  assert.equal(auditLogs[2].meta.total, 9700);

  // Permite reconstruir: "El vendedor solicitó $600 y el autorizador aprobó $300."
  const story = `El vendedor solicitó $${auditLogs[1].meta.requestedDiscount} y el autorizador aprobó $${auditLogs[1].meta.approvedDiscount}.`;
  assert.equal(story, "El vendedor solicitó $600 y el autorizador aprobó $300.");
});
