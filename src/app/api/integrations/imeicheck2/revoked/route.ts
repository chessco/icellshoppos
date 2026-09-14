import { NextRequest } from "next/server";
import { handleImeiCheckUnlinkWebhook } from "../../imeicheck/_unlink-handler";

export async function POST(request: NextRequest) {
  return handleImeiCheckUnlinkWebhook(request);
}
