import test from "node:test";
import assert from "node:assert/strict";
import {
  toMinorUnits,
  validateChargeAmount,
  calculateAuthoritativeCartTotal,
  validateSplitPayments,
  PaymentValidationError,
} from "../src/lib/payments/validation";

test("Payment Validation: toMinorUnits correctly calculates integer cents", () => {
  const mxn1 = toMinorUnits(1500.5);
  assert.equal(mxn1.amountCents, 150050);
  assert.equal(mxn1.decimalAmount, 1500.5);
  assert.equal(mxn1.currency, "mxn");

  // Floating point precision test: 19.99 * 100 often results in 1998.9999999999998
  const mxnFloat = toMinorUnits(19.99);
  assert.equal(mxnFloat.amountCents, 1999);
  assert.equal(mxnFloat.decimalAmount, 19.99);

  // Rejection of negative amounts
  assert.throws(() => toMinorUnits(-50), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "NEGATIVE_AMOUNT";
  });

  // Rejection of non-finite amounts
  assert.throws(() => toMinorUnits(NaN), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "INVALID_AMOUNT";
  });
});

test("Payment Validation: validateChargeAmount strictly rejects 0 or negative", () => {
  assert.throws(() => validateChargeAmount(0), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "ZERO_AMOUNT";
  });

  const valid = validateChargeAmount(100);
  assert.equal(valid.amountCents, 10000);
});

test("Payment Validation: calculateAuthoritativeCartTotal", () => {
  const items = [
    { imei: "111", salePrice: 10000 },
    { imei: "222", salePrice: 5500.5 },
  ];

  const calc = calculateAuthoritativeCartTotal(items, 500.5);
  assert.equal(calc.subtotal, 15500.5);
  assert.equal(calc.discount, 500.5);
  assert.equal(calc.total, 15000.0);
  assert.equal(calc.totalCents, 1500000);

  // Rejection if discount > subtotal
  assert.throws(() => calculateAuthoritativeCartTotal(items, 20000), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "DISCOUNT_EXCEEDS_SUBTOTAL";
  });

  // Rejection if empty items
  assert.throws(() => calculateAuthoritativeCartTotal([], 0), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "EMPTY_CART";
  });
});

test("Payment Validation: validateSplitPayments guards against overflow", () => {
  const saleTotal = 20000;
  const existingPayments = [
    { amount: 10000, status: "SUCCEEDED" },
    { amount: 5000, status: "PROCESSING" },
  ];

  // Exact matching payment
  const valid = validateSplitPayments(saleTotal, existingPayments, 5000);
  assert.equal(valid.remainingTotal, 0);
  assert.equal(valid.newTotalPaid, 20000);

  // Partial matching payment
  const partial = validateSplitPayments(saleTotal, existingPayments, 3000);
  assert.equal(partial.remainingTotal, 2000);
  assert.equal(partial.newTotalPaid, 18000);

  // Overflowing payment (exceeds total of 20000 by 1000)
  assert.throws(() => validateSplitPayments(saleTotal, existingPayments, 6000), (err: any) => {
    return err instanceof PaymentValidationError && err.code === "SPLIT_PAYMENT_OVERFLOW";
  });
});
