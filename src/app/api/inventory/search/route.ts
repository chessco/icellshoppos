import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getRequestOrgAccess } from "@/lib/org-permissions";
import type {
  SmartScanSearchRequest,
  SmartScanSearchResponse,
  SmartScanCandidateItem,
  IInventoryListItem,
} from "@ireader/contracts";

function mapToInventoryListItem(item: any): IInventoryListItem {
  return {
    id: item.id,
    imei: item.imei ?? null,
    sku: item.sku ?? null,
    serialNumber: item.serialNumber ?? null,
    model: item.model,
    capacity: item.capacity ?? null,
    color: item.color ?? null,
    carrier: item.carrier ?? null,
    condition: item.condition ?? null,
    grade: item.grade ?? null,
    status: item.status,
    costPesos: Number(item.costPesos || 0),
    costCurrency: item.costCurrency || "MXN",
    price: Number(item.price || 0),
    price2: item.price2 ? Number(item.price2) : null,
    price3: item.price3 ? Number(item.price3) : null,
    batteryHealth: item.batteryHealth ?? null,
    cycleCount: item.cycleCount ?? null,
    iosVersion: item.iosVersion ?? null,
    comments: item.comments ?? null,
    site: item.site ? { id: item.site.id, name: item.site.name } : null,
    deviceType: item.deviceType ? { id: item.deviceType.id, name: item.deviceType.name } : null,
    createdAt: item.createdAt ? item.createdAt.toISOString() : undefined,
    updatedAt: item.updatedAt ? item.updatedAt.toISOString() : undefined,
  };
}

/**
 * Tokenize and score how well an inventory item matches search query text
 */
function scoreItem(
  item: { model: string; capacity?: string | null; color?: string | null; sku?: string | null; comments?: string | null },
  rawTokens: string[]
): number {
  if (rawTokens.length === 0) return 0;

  const itemFullText = [
    item.model,
    item.capacity || "",
    item.color || "",
    item.sku || "",
    item.comments || "",
  ]
    .join(" ")
    .toLowerCase();

  let matchedTokens = 0;
  for (const token of rawTokens) {
    if (itemFullText.includes(token)) {
      matchedTokens += 1;
    }
  }

  // Bonus for model exact or substring match
  const modelLower = item.model.toLowerCase();
  const rawJoined = rawTokens.join(" ");
  let bonus = 0;
  if (rawJoined.includes(modelLower) || modelLower.includes(rawJoined)) {
    bonus = 0.5;
  }

  return (matchedTokens / rawTokens.length) + bonus;
}

export async function POST(request: NextRequest) {
  let access: Awaited<ReturnType<typeof getRequestOrgAccess>>;
  try {
    access = await getRequestOrgAccess(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }

  const organizationId = access.organizationId;

  let body: SmartScanSearchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { scanType, rawText, parsedIdentifiers } = body;
  const cleanRawText = String(rawText || "").trim();

  // ─── 1. PRIORITY 1: Direct Identifier Lookup (IMEI, Serial, SKU) ─────────
  if (parsedIdentifiers) {
    const { imei, serial, sku } = parsedIdentifiers;

    if (imei) {
      const match = await db.inventoryItem.findFirst({
        where: {
          organizationId,
          imei: imei.trim(),
          status: { equals: "Available", mode: "insensitive" },
        },
        include: { site: true, deviceType: true },
      });

      if (match) {
        const item = mapToInventoryListItem(match);
        const response: SmartScanSearchResponse = {
          scanType,
          matchType: "EXACT",
          resolvedItem: item,
          candidates: [],
          rawText: cleanRawText,
        };
        return NextResponse.json(response);
      }
    }

    if (serial) {
      const match = await db.inventoryItem.findFirst({
        where: {
          organizationId,
          serialNumber: { equals: serial.trim(), mode: "insensitive" },
          status: { equals: "Available", mode: "insensitive" },
        },
        include: { site: true, deviceType: true },
      });

      if (match) {
        const item = mapToInventoryListItem(match);
        const response: SmartScanSearchResponse = {
          scanType,
          matchType: "EXACT",
          resolvedItem: item,
          candidates: [],
          rawText: cleanRawText,
        };
        return NextResponse.json(response);
      }
    }

    if (sku) {
      const match = await db.inventoryItem.findFirst({
        where: {
          organizationId,
          sku: { equals: sku.trim(), mode: "insensitive" },
          status: { equals: "Available", mode: "insensitive" },
        },
        include: { site: true, deviceType: true },
      });

      if (match) {
        const item = mapToInventoryListItem(match);
        const response: SmartScanSearchResponse = {
          scanType,
          matchType: "EXACT",
          resolvedItem: item,
          candidates: [],
          rawText: cleanRawText,
        };
        return NextResponse.json(response);
      }
    }
  }

  // ─── 2. PRIORITY 2: Authoritative Catalog / Inventory Text Search ────────
  if (!cleanRawText && !parsedIdentifiers?.model) {
    const emptyResponse: SmartScanSearchResponse = {
      scanType,
      matchType: "NOT_FOUND",
      candidates: [],
      rawText: cleanRawText,
    };
    return NextResponse.json(emptyResponse);
  }

  // Tokenize search text (ignore stopwords like 'de', 'para', 'el', 'la', 'con')
  const stopwords = new Set(["de", "del", "para", "por", "con", "el", "la", "los", "las", "un", "una", "the", "for", "with", "and", "a"]);
  const searchBase = [cleanRawText, parsedIdentifiers?.model || "", parsedIdentifiers?.partNumber || ""]
    .join(" ")
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ");

  const tokens = searchBase
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !stopwords.has(t));

  // Retrieve available items in this store
  const availableItems = await db.inventoryItem.findMany({
    where: {
      organizationId,
      status: { equals: "Available", mode: "insensitive" },
    },
    include: { site: true, deviceType: true },
    orderBy: { createdAt: "desc" },
    take: 150,
  });

  if (availableItems.length === 0) {
    const notFoundResponse: SmartScanSearchResponse = {
      scanType,
      matchType: "NOT_FOUND",
      candidates: [],
      rawText: cleanRawText,
    };
    return NextResponse.json(notFoundResponse);
  }

  // Score each item against the search tokens
  const scoredCandidates: Array<{ item: typeof availableItems[0]; score: number }> = [];

  for (const item of availableItems) {
    const score = scoreItem(item, tokens);
    if (score >= 0.4) {
      scoredCandidates.push({ item, score });
    }
  }

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  if (scoredCandidates.length === 0) {
    const notFoundResponse: SmartScanSearchResponse = {
      scanType,
      matchType: "NOT_FOUND",
      candidates: [],
      rawText: cleanRawText,
    };
    return NextResponse.json(notFoundResponse);
  }

  const topCandidates: SmartScanCandidateItem[] = scoredCandidates.slice(0, 5).map(({ item, score }) => ({
    id: item.id,
    model: item.model,
    capacity: item.capacity,
    color: item.color,
    sku: item.sku,
    price: Number(item.price || 0),
    confidence: Math.min(1, Number(score.toFixed(2))),
    matchReason: `Coincidencia de modelo / especificaciones (${Math.round(score * 100)}%)`,
    rawItem: mapToInventoryListItem(item),
  }));

  // Determine if single unambiguous match or ambiguous candidates
  const isSingleConfidentMatch =
    topCandidates.length === 1 ||
    (topCandidates.length > 1 &&
      topCandidates[0].confidence >= 0.85 &&
      topCandidates[0].confidence - (topCandidates[1]?.confidence || 0) >= 0.3);

  if (isSingleConfidentMatch) {
    const best = topCandidates[0];
    const response: SmartScanSearchResponse = {
      scanType,
      matchType: "CANDIDATE",
      resolvedItem: best.rawItem,
      candidates: [best],
      rawText: cleanRawText,
    };
    return NextResponse.json(response);
  }

  // ─── 3. AMBIGUOUS MATCH (Multiple candidates) ───────────────────────────
  const response: SmartScanSearchResponse = {
    scanType,
    matchType: "AMBIGUOUS",
    candidates: topCandidates,
    rawText: cleanRawText,
  };
  return NextResponse.json(response);
}
