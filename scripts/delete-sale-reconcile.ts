/**
 * One-time script: Hard-delete a sale and reconcile its credit ledger entries.
 *
 * Usage:
 *   npx tsx scripts/delete-sale-reconcile.ts <saleNumber>
 *
 * What it does:
 *   1. Finds the sale by saleNumber.
 *   2. Deletes ALL CreditLedger entries for this sale (both sale_on_credit and partial_payment).
 *   3. Restores linked inventory items to "Available".
 *   4. Hard-deletes the Sale record (SaleItems cascade automatically).
 *
 * Run DRY_RUN=true to preview without applying changes.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === "true";

async function main() {
  const saleNumber = process.argv[2];
  if (!saleNumber) {
    console.error("Usage: npx tsx scripts/delete-sale-reconcile.ts <saleNumber>");
    process.exit(1);
  }

  console.log(`\n=== delete-sale-reconcile ===`);
  console.log(`Target sale number: ${saleNumber}`);
  console.log(`Dry run: ${DRY_RUN}\n`);

  // 1. Load sale with all relations
  const sale = await db.sale.findFirst({
    where: { saleNumber },
    include: {
      items: {
        include: {
          inventoryItem: { select: { id: true, imei: true, serialNumber: true, status: true } },
        },
      },
      creditLedger: true,
      customer: { select: { id: true, name: true } },
    },
  });

  if (!sale) {
    console.error(`Sale "${saleNumber}" not found.`);
    process.exit(1);
  }

  console.log(`Found sale: ${sale.saleNumber} (internal id: ${sale.id})`);
  console.log(`  Organization: ${sale.organizationId}`);
  console.log(`  Customer: ${sale.customer?.name ?? "N/A"} (${sale.customerId ?? "none"})`);
  console.log(`  Total: ${sale.total}`);
  console.log(`  Payment method: ${sale.paymentMethod}`);
  console.log(`  Items: ${sale.items.length}`);
  console.log(`  Credit ledger entries: ${sale.creditLedger.length}`);

  if (sale.creditLedger.length > 0) {
    console.log("\n  Credit ledger entries to DELETE:");
    for (const entry of sale.creditLedger) {
      console.log(`    [${entry.type}] amount=${entry.amount} note="${entry.note ?? ""}"`);
    }
  }

  const inventoryItemsToRestore = sale.items
    .filter((i) => i.inventoryItem !== null)
    .map((i) => i.inventoryItem!);

  if (inventoryItemsToRestore.length > 0) {
    console.log("\n  Inventory items (will NOT be touched — items remain Sold):");
    for (const inv of inventoryItemsToRestore) {
      console.log(`    id=${inv.id} imei=${inv.imei || "N/A"} serial=${(inv as any).serialNumber || "N/A"} current status=${inv.status}`);
    }
  }

  if (DRY_RUN) {
    console.log("\n[DRY RUN] No changes applied. Re-run without DRY_RUN=true to commit.");
    await db.$disconnect();
    return;
  }

  // 2. Execute in a transaction
  await db.$transaction(async (tx) => {
    // Delete all credit ledger entries for this sale
    if (sale.creditLedger.length > 0) {
      const deleted = await tx.creditLedger.deleteMany({
        where: { id: { in: sale.creditLedger.map((e) => e.id) } },
      });
      console.log(`\nDeleted ${deleted.count} credit ledger entry/entries.`);
    }

    // Inventory items intentionally NOT restored — items were sold in another sale.

    // Hard-delete the sale (SaleItems cascade automatically)
    await tx.sale.delete({ where: { id: sale.id } });
    console.log(`Deleted sale ${saleNumber} (id: ${sale.id}).`);
  });

  console.log(`\n✓ Done. Sale ${saleNumber} deleted and credit reconciled. Inventory items left as-is.`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error("Error:", err);
  await db.$disconnect();
  process.exit(1);
});
