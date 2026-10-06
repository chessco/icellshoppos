import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

loadEnv();
loadEnv({ path: ".env.local" });

const prisma = new PrismaClient();

async function main() {
            // Seed Device Types
            const deviceTypes = [
              { name: "Phone", description: "Mobile phone" },
              { name: "Tablet", description: "Tablet device" },
              { name: "Computer", description: "Desktop or laptop computer" },
              { name: "Watch", description: "Smartwatch or wearable" },
            ];
            for (const type of deviceTypes) {
              await prisma.deviceType.upsert({
                where: { name: type.name },
                update: { description: type.description },
                create: { name: type.name, description: type.description },
              });
            }
          // Add Free Plan
          await prisma.plan.upsert({
            where: { code: "free" },
            update: {
              name: "Free Trial",
              basePriceCents: 0,
              includedSeats: 1,
              extraSeatPriceCents: 0,
              trialDays: 14,
              active: true,
              stripePriceId: "prod_U300umxEALxSCp",
            },
            create: {
              code: "free",
              name: "Free Trial",
              basePriceCents: 0,
              includedSeats: 1,
              extraSeatPriceCents: 0,
              trialDays: 14,
              active: true,
              stripePriceId: "prod_U300umxEALxSCp",
            },
          });
    // Add Basic Plan
    await prisma.plan.upsert({
      where: { code: "basic" },
      update: {
        name: "Basic",
        basePriceCents: 799,
        includedSeats: 1,
        extraSeatPriceCents: 299,
        trialDays: 14,
        active: true,
        stripePriceId: "prod_U2zyMxuyYAxWuA",
      },
      create: {
        code: "basic",
        name: "Basic",
        basePriceCents: 799,
        includedSeats: 1,
        extraSeatPriceCents: 299,
        trialDays: 14,
        active: true,
        stripePriceId: "prod_U2zyMxuyYAxWuA",
      },
    });

    // Add Pro Plan
    const proPlan = await prisma.plan.upsert({
      where: { code: "pro" },
      update: {
        name: "Pro",
        basePriceCents: 1499,
        includedSeats: 9999,
        extraSeatPriceCents: 0,
        trialDays: 14,
        active: true,
        stripePriceId: "prod_U2zyP4ufWNwjEC",
      },
      create: {
        code: "pro",
        name: "Pro",
        basePriceCents: 1499,
        includedSeats: 9999,
        extraSeatPriceCents: 0,
        trialDays: 14,
        active: true,
        stripePriceId: "prod_U2zyP4ufWNwjEC",
      },
    });

    const plan = proPlan;
  const superAdminEmail =
    process.env.SUPERADMIN_EMAIL?.toLowerCase() ?? "arturo.dltv@gmail.com";
  const superAdminPassword = process.env.SUPERADMIN_PASSWORD ?? "ChangeMeNow!123";
  const hashedPassword = await bcrypt.hash(superAdminPassword, 12);

  // No Starter plan. Only Basic and Pro are seeded above.

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    update: {
      passwordHash: hashedPassword,
      status: "active",
    },
    create: {
      email: superAdminEmail,
      passwordHash: hashedPassword,
      fullName: "Super Admin",
      status: "active",
    },
  });

  const bootstrapOrg = await prisma.organization.upsert({
    where: { slug: "icellshop-bootstrap" },
    update: {
      name: "iCellShop Bootstrap",
      status: "active",
    },
    create: {
      name: "iCellShop Bootstrap",
      slug: "icellshop-bootstrap",
      status: "active",
    },
  });

  await prisma.site.upsert({
    where: {
      organizationId_name: {
        organizationId: bootstrapOrg.id,
        name: "Main",
      },
    },
    update: {
      status: "Active",
    },
    create: {
      organizationId: bootstrapOrg.id,
      name: "Main",
      status: "Active",
    },
  });

  await prisma.membership.upsert({
    where: {
      organizationId_userId: {
        organizationId: bootstrapOrg.id,
        userId: superAdmin.id,
      },
    },
    update: {
      role: "superadmin",
    },
    create: {
      organizationId: bootstrapOrg.id,
      userId: superAdmin.id,
      role: "superadmin",
    },
  });

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const subscription = await prisma.subscription.upsert({
    where: { organizationId: bootstrapOrg.id },
    update: {
      planId: plan.id,
      status: "active",
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
    create: {
      organizationId: bootstrapOrg.id,
      planId: plan.id,
      status: "active",
      trialEndsAt: null,
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    },
  });

  await prisma.subscriptionItem.upsert({
    where: {
      id: `${subscription.id}-base`,
    },
    update: {
      itemType: "base",
      quantity: 1,
      unitPriceCents: 1499,
    },
    create: {
      id: `${subscription.id}-base`,
      subscriptionId: subscription.id,
      itemType: "base",
      quantity: 1,
      unitPriceCents: 1499,
    },
  });

  console.log("Seed complete");
  console.log(`Superadmin: ${superAdminEmail}`);
  // Starter plan removed
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
