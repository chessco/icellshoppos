/**
 * tests/superadmin-subscription-upgrade.test.ts
 *
 * Test suite to verify Superadmin Plan Upgrade and Modification capabilities:
 * 1. Security verification: Non-superadmin users are rejected with 403 Forbidden.
 * 2. Plan Upgrade: Superadmin can upgrade any organization plan and status immediately.
 * 3. Database persistence: db.subscription is updated properly with currentPeriodEnd.
 * 4. Audit trail: An audit event SUPERADMIN_UPGRADE_SUBSCRIPTION_PLAN is recorded.
 *
 * Run with:
 *   npx tsx tests/superadmin-subscription-upgrade.test.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { db } from "../src/lib/db";
import { signSessionToken } from "../src/lib/auth";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passedCount++;
  } else {
    console.error(`  ❌ FAIL: ${testName}${details ? ` -> ${details}` : ""}`);
    failedCount++;
  }
}

async function runTestSuite() {
  console.log("\n============================================================");
  console.log(" 👑 TEST SUITE: SUPERADMIN SUBSCRIPTION UPGRADE & CONTROL");
  console.log("============================================================\n");

  const baseUrl = process.env.TEST_APP_URL || "http://localhost:3007";

  // 1. Fetch available plans from DB
  const plans = await db.plan.findMany({ orderBy: { basePriceCents: "asc" } });
  assert(plans.length >= 2, "DB has at least 2 subscription plans (e.g. Free, Pro)", `Found ${plans.length} plans`);

  const freePlan = plans.find((p) => p.code === "free") || plans[0];
  const proPlan = plans.find((p) => p.code === "pro" || p.code === "basic") || plans[plans.length - 1];

  // 2. Fetch a test organization
  const testOrg = await db.organization.findFirst({
    include: { subscriptions: { include: { plan: true } } },
  });
  assert(Boolean(testOrg), "Test organization found in DB", `Org: ${testOrg?.name} (${testOrg?.id})`);
  if (!testOrg) return;

  const originalSub = testOrg.subscriptions[0];
  const originalPlanId = originalSub?.planId || freePlan.id;
  const originalStatus = originalSub?.status || "trialing";

  console.log(`\n📌 Target Organization: "${testOrg.name}"`);
  console.log(`   Initial Plan: ${originalSub?.plan?.name || "None"} (${originalPlanId})`);
  console.log(`   Initial Status: ${originalStatus}\n`);

  // 3. Security test: Non-superadmin token
  console.log("🔒 TEST 1: Security Authorization (Non-superadmin must be rejected)");
  const nonSuperadminToken = await signSessionToken({
    userId: "non-superadmin-user-id",
    email: "regular-user@example.com",
    isSuperadmin: false,
    memberships: [{ organizationId: testOrg.id, role: "admin" }],
    activeOrganizationId: testOrg.id,
  });

  const forbiddenResponse = await fetch(`${baseUrl}/api/admin/subscriptions/upgrade`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `icellshop_session=${nonSuperadminToken}`,
    },
    body: JSON.stringify({
      organizationId: testOrg.id,
      planId: proPlan.id,
      status: "active",
    }),
  });

  assert(
    forbiddenResponse.status === 403,
    "Non-superadmin request returns 403 Forbidden",
    `Status received: ${forbiddenResponse.status}`
  );

  // 4. Superadmin Upgrade Test
  console.log("\n⚡ TEST 2: Superadmin Upgrade to Pro Plan (Active Status)");
  const realUser = await db.user.findFirst();
  const superadminToken = await signSessionToken({
    userId: realUser?.id || "superadmin-test-id",
    email: realUser?.email || "superadmin@example.com",
    isSuperadmin: true,
    memberships: [{ organizationId: testOrg.id, role: "superadmin" }],
    activeOrganizationId: testOrg.id,
  });

  const upgradeResponse = await fetch(`${baseUrl}/api/admin/subscriptions/upgrade`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `icellshop_session=${superadminToken}`,
    },
    body: JSON.stringify({
      organizationId: testOrg.id,
      planId: proPlan.id,
      status: "active",
    }),
  });

  assert(
    upgradeResponse.status === 200,
    "Superadmin upgrade returns 200 OK",
    `Status received: ${upgradeResponse.status}`
  );

  const upgradeData = await upgradeResponse.json();
  assert(upgradeData.success === true, "Response JSON has success: true");
  assert(upgradeData.subscription?.planId === proPlan.id, "Returned subscription has Pro planId");
  assert(upgradeData.subscription?.status === "active", "Returned subscription has status 'active'");

  // 5. Database Verification
  console.log("\n💾 TEST 3: Verify Persistence in Database");
  const updatedSub = await db.subscription.findUnique({
    where: { organizationId: testOrg.id },
    include: { plan: true },
  });

  assert(Boolean(updatedSub), "Subscription exists in DB");
  assert(updatedSub?.planId === proPlan.id, "DB subscription planId matches target plan");
  assert(updatedSub?.status === "active", "DB subscription status is 'active'");
  assert(
    Boolean(updatedSub?.currentPeriodEnd && new Date(updatedSub.currentPeriodEnd) > new Date()),
    "DB subscription currentPeriodEnd extended into future"
  );

  // 6. Audit Trail Verification
  console.log("\n📋 TEST 4: Verify Superadmin Audit Log Entry");
  const auditLog = await db.auditLog.findFirst({
    where: {
      organizationId: testOrg.id,
      action: "SUPERADMIN_UPGRADE_SUBSCRIPTION_PLAN",
    },
    orderBy: { createdAt: "desc" },
  });

  assert(Boolean(auditLog), "Audit log recorded SUPERADMIN_UPGRADE_SUBSCRIPTION_PLAN event");
  if (auditLog?.meta) {
    const meta = typeof auditLog.meta === "string" ? JSON.parse(auditLog.meta) : (auditLog.meta as any);
    assert(meta?.newPlanId === proPlan.id, "Audit metadata includes new planId");
    assert(meta?.status === "active", "Audit metadata includes new status");
  }

  // 7. Cleanup / Revert back to original state if needed
  console.log("\n🔄 Restoring organization to original plan...");
  await fetch(`${baseUrl}/api/admin/subscriptions/upgrade`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `icellshop_session=${superadminToken}`,
    },
    body: JSON.stringify({
      organizationId: testOrg.id,
      planId: originalPlanId,
      status: originalStatus,
    }),
  });
  console.log(`   Restored to: ${originalPlanId} (${originalStatus})`);

  console.log("\n============================================================");
  console.log(` SUMMARY: ${passedCount} PASSED | ${failedCount} FAILED`);
  console.log("============================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTestSuite()
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
