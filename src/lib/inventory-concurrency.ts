/**
 * iReader Inventory Concurrency Control & Availability Protection
 *
 * Enforces the invariant: ONE INVENTORY ITEM = AT MOST ONE SUCCESSFUL SALE.
 * Protects against race conditions between multiple cashiers selling the same device.
 */

export class InventoryUnavailableError extends Error {
  public readonly unavailableItemIds: string[];

  constructor(
    itemIds: string | string[],
    message = "One or more inventory items are no longer available."
  ) {
    super(message);
    this.name = "InventoryUnavailableError";
    this.unavailableItemIds = Array.isArray(itemIds) ? itemIds : [itemIds];
  }
}

export interface InventoryUnavailableResponse {
  success: false;
  error: "INVENTORY_UNAVAILABLE";
  message: string;
  inventoryItemIds: string[];
  unavailableItemIds: string[];
}

export function buildInventoryUnavailableResponse(
  unavailableItemIds: string[]
): InventoryUnavailableResponse {
  const uniqueIds = Array.from(new Set(unavailableItemIds));
  return {
    success: false,
    error: "INVENTORY_UNAVAILABLE",
    message: "One or more items are no longer available.",
    inventoryItemIds: uniqueIds,
    unavailableItemIds: uniqueIds,
  };
}

export function isInventoryUnavailableError(error: unknown): error is InventoryUnavailableError {
  if (error instanceof InventoryUnavailableError) {
    return true;
  }
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "InventoryUnavailableError"
  );
}

export interface ItemIdentifierCheck {
  inventoryItemId?: string;
  imei?: string;
}

/**
 * Validates that no serialized device appears more than once in a single checkout payload.
 */
export function validateNoDuplicateItemsInPayload(
  items: ItemIdentifierCheck[]
): { valid: boolean; error?: string } {
  const itemIds = items
    .map((item) => String(item.inventoryItemId ?? "").trim())
    .filter(Boolean);

  if (new Set(itemIds).size !== itemIds.length) {
    return {
      valid: false,
      error: "Duplicate inventory items detected in checkout payload.",
    };
  }

  const imeis = items
    .map((item) => String(item.imei ?? "").trim().replace(/\D/g, ""))
    .filter(Boolean);

  if (new Set(imeis).size !== imeis.length) {
    return {
      valid: false,
      error: "Duplicate device IMEIs detected in checkout payload.",
    };
  }

  return { valid: true };
}
