import { NextRequest } from "next/server";
import { handleImeiCheckUnlinkWebhook } from "../_unlink-handler";

export async function POST(request: NextRequest) {
  return handleImeiCheckUnlinkWebhook(request);
}
