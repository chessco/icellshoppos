import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import Stripe from "stripe";

loadEnv();
loadEnv({ path: ".env.local" });

const prisma = new PrismaClient();

async function check() {
  console.log("=== DB: RECENT POS PAYMENTS ===");
  const posPayments = await prisma.posPayment.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      sale: true,
      stripePayment: true,
    },
  });
  console.log(JSON.stringify(posPayments, null, 2));

  console.log("\n=== DB: RECENT STRIPE PAYMENT RECORDS ===");
  const stripeRecords = await prisma.stripePaymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  console.log(JSON.stringify(stripeRecords, null, 2));

  console.log("\n=== DB: RECENT SALES ===");
  const sales = await prisma.sale.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      saleNumber: true,
      total: true,
      paymentMethod: true,
      createdAt: true,
    },
  });
  console.log(JSON.stringify(sales, null, 2));

  console.log("\n=== STRIPE API: DIRECT IN-FLIGHT PAYMENT INTENTS ===");
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    console.log("No STRIPE_SECRET_KEY found in env");
    return;
  }
  const stripe = new Stripe(stripeKey);
  try {
    const paymentIntents = await stripe.paymentIntents.list({ limit: 5 });
    console.log("Latest 5 Stripe PaymentIntents from Stripe API directly:");
    console.log(
      JSON.stringify(
        paymentIntents.data.map((pi) => ({
          id: pi.id,
          amount: pi.amount,
          currency: pi.currency,
          status: pi.status,
          created: new Date(pi.created * 1000).toISOString(),
          payment_method_types: pi.payment_method_types,
          description: pi.description,
          metadata: pi.metadata,
        })),
        null,
        2
      )
    );
  } catch (err) {
    console.error("Error connecting to Stripe API:", err);
  }
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
