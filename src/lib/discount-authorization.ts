export type EquipmentSnapshot = {
  inventoryItemId: string;
  imei: string;
  serialNumber?: string | null;
  model: string;
  capacity: string;
  color: string;
  batteryHealth?: string | null;
  costPesos: number;
  salePrice: number;
};

export type FinancialSnapshot = {
  totalCost: number;
  originalPrice: number;
  requestedDiscount: number;
  priceAfterRequestedDiscount: number;
  marginBeforeDiscount: number;
  marginPercentageBeforeDiscount: number;
  marginAfterRequestedDiscount: number;
  marginPercentageAfterRequestedDiscount: number;
};

export type AuthorizationSnapshot = {
  customer: {
    id?: string | null;
    name: string;
    email?: string | null;
    whatsapp?: string | null;
  };
  seller: {
    id: string;
    name: string;
    email: string;
  };
  items: EquipmentSnapshot[];
  financials: FinancialSnapshot;
};

export function calculateDiscountFinancials(params: {
  items: EquipmentSnapshot[];
  requestedDiscount: number;
}): FinancialSnapshot {
  const totalCost = params.items.reduce((sum, item) => sum + (Number(item.costPesos) || 0), 0);
  const originalPrice = params.items.reduce((sum, item) => sum + (Number(item.salePrice) || 0), 0);
  const requestedDiscount = Math.max(0, Number(params.requestedDiscount) || 0);

  const priceAfterRequestedDiscount = Math.max(0, originalPrice - requestedDiscount);
  const marginBeforeDiscount = originalPrice - totalCost;
  const marginPercentageBeforeDiscount =
    originalPrice > 0 ? Number(((marginBeforeDiscount / originalPrice) * 100).toFixed(2)) : 0;

  const marginAfterRequestedDiscount = priceAfterRequestedDiscount - totalCost;
  const marginPercentageAfterRequestedDiscount =
    priceAfterRequestedDiscount > 0
      ? Number(((marginAfterRequestedDiscount / priceAfterRequestedDiscount) * 100).toFixed(2))
      : 0;

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    originalPrice: Math.round(originalPrice * 100) / 100,
    requestedDiscount: Math.round(requestedDiscount * 100) / 100,
    priceAfterRequestedDiscount: Math.round(priceAfterRequestedDiscount * 100) / 100,
    marginBeforeDiscount: Math.round(marginBeforeDiscount * 100) / 100,
    marginPercentageBeforeDiscount,
    marginAfterRequestedDiscount: Math.round(marginAfterRequestedDiscount * 100) / 100,
    marginPercentageAfterRequestedDiscount,
  };
}

export type ReviewAction = "APPROVE" | "APPROVE_PARTIAL" | "REJECT";

export function resolveApprovedDiscountAndStatus(params: {
  action: ReviewAction;
  requestedDiscount: number;
  partialAmount?: number;
}): {
  status: "APPROVED" | "PARTIAL" | "REJECTED";
  approvedDiscount: number;
} {
  const requested = Math.max(0, Number(params.requestedDiscount) || 0);

  if (params.action === "APPROVE") {
    // REGLA 4: APPROVED significa approvedDiscount = requestedDiscount
    return {
      status: "APPROVED",
      approvedDiscount: requested,
    };
  }

  if (params.action === "REJECT") {
    // REGLA 3: REJECTED significa approvedDiscount = 0
    return {
      status: "REJECTED",
      approvedDiscount: 0,
    };
  }

  if (params.action === "APPROVE_PARTIAL") {
    const partial = Number(params.partialAmount);
    if (!Number.isFinite(partial) || partial <= 0) {
      throw new Error("El monto parcial debe ser mayor a 0.");
    }
    // REGLA 1: approvedDiscount nunca puede ser mayor que requestedDiscount
    if (partial >= requested) {
      throw new Error(
        "El monto aprobado parcialmente debe ser menor al descuento solicitado. Para aprobar el total utilice la acción de APROBAR."
      );
    }
    // REGLA 5: PARTIAL significa 0 < approvedDiscount < requestedDiscount
    return {
      status: "PARTIAL",
      approvedDiscount: Math.round(partial * 100) / 100,
    };
  }

  throw new Error("Acción no válida.");
}
