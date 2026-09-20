import test from "node:test";
import assert from "node:assert/strict";
import { formatCurrency } from "../src/utils/formatters.ts";

test("formatCurrency handles standard positive numbers", () => {
  assert.equal(formatCurrency(3999), "$3,999.00");
  assert.equal(formatCurrency(13500.5), "$13,500.50");
  assert.equal(formatCurrency(120), "$120.00");
});

test("formatCurrency handles string inputs from database/APIs", () => {
  assert.equal(formatCurrency("3999"), "$3,999.00");
  assert.equal(formatCurrency("2879.99"), "$2,879.99");
});

test("formatCurrency handles edge cases, zero, null and undefined without crashing", () => {
  assert.equal(formatCurrency(0), "$0.00");
  assert.equal(formatCurrency(null), "$0.00");
  assert.equal(formatCurrency(undefined), "$0.00");
  assert.equal(formatCurrency(NaN), "$0.00");
  assert.equal(formatCurrency(""), "$0.00");
});

test("formatCurrency handles negative values properly", () => {
  assert.equal(formatCurrency(-500), "-$500.00");
});
