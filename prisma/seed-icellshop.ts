import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";

loadEnv();
loadEnv({ path: ".env.local" });

const prisma = new PrismaClient();

interface RawItem {
  model: string;
  color: string;
  capacity: string;
  batteryHealth: string | null;
  carrier: string | null;
  condition: string | null;
  grade: string | null;
  comments: string | null;
  cycleCount: number | null;
}

const rawData: RawItem[] = [
  { model: "Apple Watch Series 11 Aluminum GPS", color: "Jet Black", capacity: "42mm", batteryHealth: "100%", carrier: "Unlocked", condition: "New", grade: "Sealed", comments: null, cycleCount: 0 },
  { model: "iMac 2021 M1", color: "Blue", capacity: "8GB 256GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iMac 2021 M1", color: "Blue", capacity: "16GB 512GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A+", comments: "roto", cycleCount: null },
  { model: "iMac Mini M1", color: "silver", capacity: "256GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: "95%", carrier: "Unlocked", condition: "Used", grade: "AB", comments: null, cycleCount: 3 },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: "92%", carrier: "Unlocked", condition: "Used", grade: "AB", comments: null, cycleCount: 25 },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 10 LTE + Wi-Fi", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 11 LTE + Wi-Fi", color: "Blue", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 11 LTE + Wi-Fi", color: "Blue", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 11 LTE + Wi-Fi", color: "Blue", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 11 LTE + Wi-Fi", color: "Blue", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Silver", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "32GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "32GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "32GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "32GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Black", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 8 WiFi + LTE", color: "Silver", capacity: "32GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Refurbished", grade: "AB", comments: null, cycleCount: 0 },
  { model: "iPad 9 LTE + Wi-Fi", color: "Space Gray", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad 9 LTE + Wi-Fi", color: "Space Gray", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad Air 5th Gen M1 WiFi + LTE", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad Air 5th Gen M1 WiFi + LTE", color: "Blue", capacity: "64GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPad Air M4 11\" LTE + WiFi", color: "Space Gray", capacity: "128GB", batteryHealth: "99%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 32 },
  { model: "iPad Air M4 13\" Wi Fi", color: "Blue", capacity: "128GB", batteryHealth: "100%", carrier: "Unlocked", condition: "New", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPad Air M4 13\" Wi Fi", color: "Starlight", capacity: "256GB", batteryHealth: null, carrier: "Unlocked", condition: "New", grade: "A", comments: null, cycleCount: null },
  { model: "iPad mini (A17 Pro) Wi fi", color: "Starlight", capacity: "128GB", batteryHealth: "100%", carrier: "Unlocked", condition: "New", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPhone 12", color: "Black", capacity: "128GB", batteryHealth: "88%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 653 },
  { model: "iPhone 12 mini", color: "White", capacity: "256GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPhone 12 Pro", color: "Gold", capacity: "128GB", batteryHealth: "76%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 1764 },
  { model: "iPhone 12 Pro", color: "Graphite", capacity: "128GB", batteryHealth: "84%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 875 },
  { model: "iPhone 12 Pro", color: "Graphite", capacity: "128GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPhone 12 Pro Max", color: "Pacific Blue", capacity: "256GB", batteryHealth: "84%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 855 },
  { model: "iPhone 12 Pro Max", color: "Graphite", capacity: "128GB", batteryHealth: "89%", carrier: "Unlocked", condition: "Used", grade: "B", comments: "PENDIENTE REPARAR", cycleCount: 632 },
  { model: "iPhone 12 Pro Max", color: "Graphite", capacity: "128GB", batteryHealth: "97%", carrier: "Unlocked", condition: "Used", grade: "AB", comments: null, cycleCount: 154 },
  { model: "iPhone 12 Pro Max", color: "Pacific Blue", capacity: "128GB", batteryHealth: "78%", carrier: "Unlocked", condition: "Refurbished", grade: "B", comments: "Cancelled from sale: precios", cycleCount: 888 },
  { model: "iPhone 12 Pro Max", color: "Graphite", capacity: "128GB", batteryHealth: "80%", carrier: "Unlocked", condition: "Refurbished", grade: "AB", comments: "FALLA EN CAMARAS", cycleCount: 1250 },
  { model: "iPhone 12 Pro Max", color: "Graphite", capacity: "256GB", batteryHealth: "87%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 881 },
  { model: "iPhone 13", color: "New Green", capacity: "128GB", batteryHealth: "85%", carrier: "Unlocked", condition: "Used", grade: "B-", comments: null, cycleCount: 984 },
  { model: "iPhone 13 Pro", color: "Sierra Blue", capacity: "128GB", batteryHealth: "74%", carrier: "Unlocked", condition: "Used", grade: "A", comments: "MSG EN CAMARA", cycleCount: 1762 },
  { model: "iPhone 13 Pro", color: "New Alpine Green", capacity: "256GB", batteryHealth: "76%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 1554 },
  { model: "iPhone 13 Pro Max", color: "Graphite", capacity: "128GB", batteryHealth: "85%", carrier: "Unlocked", condition: "Used", grade: "B", comments: "TAPA PENDIENTE/ PANTALLA RAYADA", cycleCount: 584 },
  { model: "iPhone 14", color: "Blue", capacity: "128GB", batteryHealth: "96%", carrier: "Unlocked", condition: "Used", grade: "B", comments: null, cycleCount: 203 },
  { model: "iPhone 14 Pro", color: "Space Black", capacity: "128GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPhone 14 Pro", color: "Deep Purple", capacity: "256GB", batteryHealth: "80%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 1056 },
  { model: "iPhone 14 Pro", color: "Deep Purple", capacity: "128GB", batteryHealth: "80%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 987 },
  { model: "iPhone 14 Pro", color: "Deep Purple", capacity: "128GB", batteryHealth: "83%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 626 },
  { model: "iPhone 14 Pro", color: "Deep Purple", capacity: "128GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 0 },
  { model: "iPhone 14 Pro Max", color: "Deep Purple", capacity: "256GB", batteryHealth: "81%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 830 },
  { model: "iPhone 14 Pro Max", color: "Silver", capacity: "256GB", batteryHealth: "87%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 818 },
  { model: "iPhone 14 Pro Max", color: "Gold", capacity: "256GB", batteryHealth: "83%", carrier: "AT&T", condition: "Used", grade: "A", comments: null, cycleCount: 806 },
  { model: "iPhone 15", color: "Blue", capacity: "128GB", batteryHealth: "85%", carrier: "Unlocked", condition: "Refurbished", grade: "B", comments: "MSG EN CAMARA", cycleCount: 835 },
  { model: "iPhone 15 Pro", color: "Gray", capacity: "128GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPhone 15 Pro Max", color: "Black Titanium", capacity: "256GB", batteryHealth: "87%", carrier: "AT&T", condition: "Used", grade: "A", comments: null, cycleCount: 302 },
  { model: "iPhone 15+ (Plus)", color: "Black", capacity: "512GB", batteryHealth: null, carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: null },
  { model: "iPhone 16", color: "Ultramarine", capacity: "128GB", batteryHealth: "72%", carrier: "Unlocked", condition: "Used", grade: "A", comments: "PENDIENTE REPARAR", cycleCount: 995 },
  { model: "iPhone 16 Pro", color: "Black Titanium", capacity: "128GB", batteryHealth: "92%", carrier: "Unlocked", condition: "Used", grade: "B-", comments: null, cycleCount: 382 },
  { model: "iPhone 16e", color: "Black", capacity: "128GB", batteryHealth: "92%", carrier: "T-Mobile", condition: "Used", grade: "A", comments: null, cycleCount: 367 },
  { model: "iPhone 17 Pro", color: "Cosmic Orange", capacity: "256GB", batteryHealth: "100%", carrier: "Verizon Wireless", condition: "New", grade: "Open Box", comments: null, cycleCount: 0 },
  { model: "iPhone 17 Pro", color: "Cosmic Orange", capacity: "256GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 14 },
  { model: "iPhone 17 Pro", color: "Deep Blue", capacity: "256GB", batteryHealth: "100%", carrier: "Unlocked", condition: "Used", grade: "A", comments: "Cancelled from sale: Señal", cycleCount: 3 },
  { model: "iPhone 17 Pro Max", color: "Cosmic Orange", capacity: "256GB", batteryHealth: "100%", carrier: "AT&T", condition: "Used", grade: "A", comments: null, cycleCount: 80 },
  { model: "iPhone SE 2", color: "Red", capacity: "64GB", batteryHealth: "78%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 793 },
  { model: "iPhone SE 3", color: "Midnight", capacity: "64GB", batteryHealth: "90%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 39 },
  { model: "iPhone SE 3", color: "Starlight", capacity: "64GB", batteryHealth: "79%", carrier: "Unlocked", condition: "Used", grade: "A", comments: null, cycleCount: 1933 },
];

function determineDeviceTypeName(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("iphone") || m.includes("phone")) return "Phone";
  if (m.includes("ipad") || m.includes("tablet")) return "Tablet";
  if (m.includes("imac") || m.includes("mac")) return "Computer";
  if (m.includes("watch")) return "Watch";
  return "Phone";
}

function estimatePrice(model: string, capacity: string): number {
  const m = model.toLowerCase();
  const c = capacity.toLowerCase();

  if (m.includes("watch")) return 7999;
  if (m.includes("imac 2021")) {
    return c.includes("512") ? 18499 : 15999;
  }
  if (m.includes("imac mini")) return 9999;
  if (m.includes("ipad 10")) return 7499;
  if (m.includes("ipad 11")) return 10999;
  if (m.includes("ipad 8")) {
    return c.includes("128") ? 4999 : 3999;
  }
  if (m.includes("ipad 9")) return 5499;
  if (m.includes("ipad air 5")) return 9899;
  if (m.includes("ipad air m4 13")) {
    return c.includes("256") ? 19999 : 17499;
  }
  if (m.includes("ipad air m4 11")) return 14999;
  if (m.includes("ipad mini")) return 11999;

  // iPhones
  if (m.includes("iphone 12 mini")) return 5899;
  if (m.includes("iphone 12 pro max")) {
    return c.includes("256") ? 9999 : 9299;
  }
  if (m.includes("iphone 12 pro")) return 7999;
  if (m.includes("iphone 12")) return 6499;

  if (m.includes("iphone 13 pro max")) return 13499;
  if (m.includes("iphone 13 pro")) {
    return c.includes("256") ? 12499 : 11499;
  }
  if (m.includes("iphone 13")) return 8499;

  if (m.includes("iphone 14 pro max")) return 16999;
  if (m.includes("iphone 14 pro")) {
    return c.includes("256") ? 14999 : 13999;
  }
  if (m.includes("iphone 14")) return 10499;

  if (m.includes("iphone 15 pro max")) return 19999;
  if (m.includes("iphone 15 pro")) return 16499;
  if (m.includes("iphone 15+")) return 15999;
  if (m.includes("iphone 15")) return 12999;

  if (m.includes("iphone 16 pro")) return 19999;
  if (m.includes("iphone 16e")) return 14499;
  if (m.includes("iphone 16")) return 15499;

  if (m.includes("iphone 17 pro max")) return 28999;
  if (m.includes("iphone 17 pro")) return 24999;

  if (m.includes("iphone se 3")) return 3999;
  if (m.includes("iphone se 2")) return 2999;

  return 6999;
}

async function seedForOrganization(orgId: string, orgName: string, siteId: string, typeMap: Map<string, string>) {
  console.log(`\n--- Seeding ${rawData.length} items for ${orgName} (${orgId}) ---`);
  let createdCount = 0;
  let updatedCount = 0;

  for (let index = 0; index < rawData.length; index++) {
    const item = rawData[index];
    const itemNum = String(index + 1).padStart(4, "0");
    const sku = `IC-${itemNum}`;
    const isCellular = item.model.toLowerCase().includes("lte") || item.model.toLowerCase().includes("iphone");
    
    // Unique IMEI per organization
    const orgPrefix = orgId.replace(/[^0-9]/g, "").slice(0, 4).padEnd(4, "9");
    const imei = isCellular ? `35${orgPrefix}${itemNum.padStart(9, "0")}` : null;
    const serialNumber = `SER${itemNum}${item.color.slice(0, 2).toUpperCase()}${item.capacity.slice(0, 2).toUpperCase()}`;

    const typeName = determineDeviceTypeName(item.model);
    const deviceTypeId = typeMap.get(typeName) ?? null;

    const basePrice = estimatePrice(item.model, item.capacity);
    const price2 = Math.round(basePrice * 0.95);
    const price3 = Math.round(basePrice * 0.90);
    const costPesos = Math.round(basePrice * 0.72);

    const existing = await prisma.inventoryItem.findFirst({
      where: {
        organizationId: orgId,
        sku,
      },
    });

    const itemData = {
      model: item.model,
      capacity: item.capacity,
      color: item.color,
      carrier: item.carrier,
      condition: item.condition ?? "Used",
      grade: item.grade ?? "A",
      status: "Available",
      batteryHealth: item.batteryHealth,
      cycleCount: item.cycleCount,
      comments: item.comments,
      serialNumber,
      imei,
      costPesos,
      costCurrency: "MXN",
      price: basePrice,
      price2,
      price3,
      deviceTypeId,
      siteId,
      qrRaw: `https://www.probuyer.org/icell-shop/item/${sku}`,
    };

    if (existing) {
      await prisma.inventoryItem.update({
        where: { id: existing.id },
        data: itemData,
      });
      updatedCount++;
    } else {
      await prisma.inventoryItem.create({
        data: {
          ...itemData,
          sku,
          organizationId: orgId,
        },
      });
      createdCount++;
    }
  }

  console.log(`Completed for ${orgName}: ${createdCount} created, ${updatedCount} updated.`);
}

async function main() {
  console.log("=== iCellShop Inventory Seeder ===");

  // Ensure Device Types
  const types = await prisma.deviceType.findMany();
  const typeMap = new Map<string, string>();
  for (const t of types) {
    typeMap.set(t.name, t.id);
  }

  // Find all organizations
  const orgs = await prisma.organization.findMany({
    include: {
      sites: true,
    },
  });

  if (orgs.length === 0) {
    throw new Error("No organizations found in database. Run 'npm run db:seed' first.");
  }

  for (const org of orgs) {
    let defaultSite = org.sites.find((s) => s.name === "Main") ?? org.sites[0];
    if (!defaultSite) {
      defaultSite = await prisma.site.create({
        data: {
          organizationId: org.id,
          name: "Main",
          status: "Active",
        },
      });
    }

    await seedForOrganization(org.id, org.name, defaultSite.id, typeMap);
  }

  const total = await prisma.inventoryItem.count();
  console.log(`\nTotal inventory items now in database: ${total}`);
}

main()
  .catch((e) => {
    console.error("Error seeding inventory:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
