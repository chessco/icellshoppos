/**
 * Pro Buyer POS Payment System - Validation & Money Utilities
 *
 * Implements:
 * - Integer minor units handling (e.g. cents for MXN/USD)
 * - Strict prevention of floating-point inaccuracies
 * - Monetary amount bounds checking (positive, non-zero, non-negative)
 * - Split payment total verification against authoritative sale totals
 */

import { Money, PaymentCartItem } from "./types";

export class PaymentValidationError extends Error {
  constructor(message: string, public readonly code: string = "PAYMENT_VALIDATION_ERROR") {
    super(message);
    this.name = "PaymentValidationError";
  }
}

/**
 * Converts a major currency unit (e.g. 1500.50 MXN) to integer minor units (cents e.g. 150050)
 * Uses Math.round to guard against IEEE 754 floating-point precision artifacts.
 */
export function toMinorUnits(decimalAmount: number, currency = "mxn"): Money {
  if (typeof decimalAmount !== "number" || !Number.isFinite(decimalAmount)) {
    throw new PaymentValidationError(
      `Invalid payment amount: must be a finite number, received ${decimalAmount}`,
      "INVALID_AMOUNT"
    );
  }

  if (decimalAmount < 0) {
    throw new PaymentValidationError(
      `Payment amount cannot be negative: received ${decimalAmount}`,
      "NEGATIVE_AMOUNT"
    );
  }

  // Two-decimal currencies like MXN, USD, EUR: multiply by 100
  // Round to closest integer to avoid 19.99 * 100 = 1998.9999999999998
  const amountCents = Math.round(decimalAmount * 100);

  return {
    amountCents,
    currency: currency.toLowerCase().trim(),
    decimalAmount: Number((amountCents / 100).toFixed(2)),
  };
}

/**
 * Validates that an amount is strictly positive (> 0)
 */
export function validateChargeAmount(amount: number, currency = "mxn"): Money {
  const money = toMinorUnits(amount, currency);
  if (money.amountCents <= 0) {
    throw new PaymentValidationError(
      "Payment amount must be greater than zero.",
      "ZERO_AMOUNT"
    );
  }
  return money;
}

/**
 * Authoritatively calculates sale totals from items and discount
 */
export function calculateAuthoritativeCartTotal(
  items: PaymentCartItem[],
  discount = 0
): { subtotal: number; discount: number; total: number; totalCents: number } {
  if (!items || items.length === 0) {
    throw new PaymentValidationError(
      "Cart must contain at least one item.",
      "EMPTY_CART"
    );
  }

  let subtotalCents = 0;
  for (const item of items) {
    const itemPrice = typeof item.salePrice === "number" ? item.salePrice : Number(item.salePrice);
    if (!Number.isFinite(itemPrice) || itemPrice < 0) {
      throw new PaymentValidationError(
        `Invalid item sale price: ${item.salePrice}`,
        "INVALID_ITEM_PRICE"
      );
    }
    subtotalCents += Math.round(itemPrice * 100);
  }

  const validDiscount = typeof discount === "number" && Number.isFinite(discount) ? Math.max(0, discount) : 0;
  const discountCents = Math.round(validDiscount * 100);

  if (discountCents > subtotalCents) {
    throw new PaymentValidationError(
      `Discount ($${(discountCents / 100).toFixed(2)}) cannot exceed subtotal ($${(subtotalCents / 100).toFixed(2)}).`,
      "DISCOUNT_EXCEEDS_SUBTOTAL"
    );
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  return {
    subtotal: Number((subtotalCents / 100).toFixed(2)),
    discount: Number((discountCents / 100).toFixed(2)),
    total: Number((totalCents / 100).toFixed(2)),
    totalCents,
  };
}

/**
 * Validates that split payments do not exceed the authoritative sale total
 */
export function validateSplitPayments(
  saleTotal: number,
  existingPayments: Array<{ amount: number | { toString: () => string }; status: string }>,
  newPaymentAmount: number
): { remainingTotal: number; newTotalPaid: number } {
  const saleTotalCents = Math.round(saleTotal * 100);
  const newPaymentCents = Math.round(newPaymentAmount * 100);

  let existingPaidCents = 0;
  for (const p of existingPayments) {
    if (p.status === "SUCCEEDED" || p.status === "PROCESSING" || p.status === "CREATED") {
      const amt = typeof p.amount === "number" ? p.amount : Number(p.amount.toString());
      if (Number.isFinite(amt) && amt > 0) {
        existingPaidCents += Math.round(amt * 100);
      }
    }
  }

  const totalAfterNew = existingPaidCents + newPaymentCents;

  if (totalAfterNew > saleTotalCents) {
    const excess = (totalAfterNew - saleTotalCents) / 100;
    throw new PaymentValidationError(
      `Split payments total ($${(totalAfterNew / 100).toFixed(2)}) exceeds sale total ($${(saleTotalCents / 100).toFixed(2)}) by $${excess.toFixed(2)}.`,
      "SPLIT_PAYMENT_OVERFLOW"
    );
  }

  return {
    remainingTotal: Number((Math.max(0, saleTotalCents - totalAfterNew) / 100).toFixed(2)),
    newTotalPaid: Number((totalAfterNew / 100).toFixed(2)),
  };
}
