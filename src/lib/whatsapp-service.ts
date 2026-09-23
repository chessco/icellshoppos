export type SendWhatsAppResult = {
  success: boolean;
  providerMessageId?: string | null;
  mediaUrl?: string | null;
  error?: string;
  webFallbackUrl?: string;
};

export class WhatsAppGatewayService {
  private apiUrl: string;
  private apiKey: string;
  private tenantId: string;

  constructor() {
    this.apiUrl = (process.env.PITAYACORE_API_URL || "https://pitayacore-api.pitayacode.io/api").replace(/\/+$/, "");
    this.apiKey = process.env.PITAYACORE_API_KEY || "";
    this.tenantId = process.env.PITAYACORE_TENANT_ID || "";
  }

  normalizeRecipient(phone: string): { primary: string; secondary: string; cleanDigits: string } {
    const rawDigits = phone.replace(/\D/g, "");
    let primary = rawDigits;
    let secondary = rawDigits;

    if (rawDigits.length === 10) {
      primary = `521${rawDigits}`;
      secondary = `52${rawDigits}`;
    } else if (rawDigits.length === 12 && rawDigits.startsWith("52")) {
      primary = `521${rawDigits.substring(2)}`;
      secondary = rawDigits;
    } else if (rawDigits.length === 13 && rawDigits.startsWith("521")) {
      primary = rawDigits;
      secondary = `52${rawDigits.substring(3)}`;
    }

    return { primary, secondary, cleanDigits: rawDigits };
  }

  extractMediaUrl(content: string): string | undefined {
    const match = content.match(
      /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|webp)|https?:\/\/bwipjs-api[^\s]+|https?:\/\/api\.qrserver[^\s]+)/i
    );
    return match ? match[0] : undefined;
  }

  async sendMessage(toPhone: string, content: string, orgId?: string): Promise<SendWhatsAppResult> {
    let activeApiUrl = this.apiUrl;
    let activeApiKey = this.apiKey;
    let activeTenantId = this.tenantId;
    let activeProvider = "PITAYACORE";

    if (orgId) {
      try {
        const { db } = await import("@/lib/db");
        const rows = await db.systemSetting.findMany({
          where: { key: { startsWith: `integration:${orgId}:` } },
        });
        const map = new Map(rows.map((r) => [r.key.replace(`integration:${orgId}:`, ""), r.value]));

        if (map.get("whatsapp_provider")) activeProvider = map.get("whatsapp_provider")!;
        if (map.get("pitayacore_api_url")) activeApiUrl = map.get("pitayacore_api_url")!.replace(/\/+$/, "");
        if (map.get("pitayacore_api_key")) activeApiKey = map.get("pitayacore_api_key")!;
        if (map.get("pitayacore_tenant_id")) activeTenantId = map.get("pitayacore_tenant_id")!;

        if (activeProvider === "FLOW") {
          if (map.get("flow_api_url")) activeApiUrl = map.get("flow_api_url")!.replace(/\/+$/, "");
          if (map.get("flow_internal_key")) activeApiKey = map.get("flow_internal_key")!;
        }
      } catch (e) {
        // Fallback to default credentials
      }
    }

    const { primary, secondary, cleanDigits } = this.normalizeRecipient(toPhone);
    const mediaUrl = this.extractMediaUrl(content);
    const cleanContent = mediaUrl
      ? content.replace(mediaUrl, "").replace(/\n{3,}/g, "\n\n").trim()
      : content;

    const webFallbackUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(content)}`;

    if (activeProvider === "LINKS") {
      return {
        success: true,
        providerMessageId: "WA_WEB_LINK",
        mediaUrl,
        webFallbackUrl,
      };
    }

    const targetUrl = activeApiUrl.endsWith("/api")
      ? `${activeApiUrl}/whatsapp/send`
      : `${activeApiUrl}/api/whatsapp/send`;

    const sendPayload = async (recipient: string) => {
      const payload: any = {
        to: recipient,
        content: cleanContent,
      };
      if (mediaUrl) {
        payload.imageUrl = mediaUrl;
        payload.mediaUrl = mediaUrl;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

      try {
        const response = await fetch(targetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": activeApiKey,
            "x-tenant-id": activeTenantId,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        const text = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(text);
        } catch {
          // non-json response
        }

        return { ok: response.ok && data.success !== false, data, status: response.status };
      } finally {
        clearTimeout(timeout);
      }
    };

    try {
      console.log(`[PitayaCore WhatsApp] Sending to ${primary} via ${targetUrl}...`);
      let res = await sendPayload(primary);

      if (!res.ok && secondary !== primary) {
        console.log(`[PitayaCore WhatsApp] Primary recipient failed, retrying with ${secondary}...`);
        res = await sendPayload(secondary);
      }

      if (res.ok) {
        return {
          success: true,
          providerMessageId: res.data?.messageId || res.data?.id || "PITAYACORE_SENT",
          mediaUrl,
          webFallbackUrl,
        };
      }

      console.warn(`[PitayaCore WhatsApp] API returned failure:`, res.data);
      return {
        success: false,
        error: res.data?.error || `Status ${res.status}`,
        mediaUrl,
        webFallbackUrl,
      };
    } catch (err: any) {
      console.error(`[PitayaCore WhatsApp] Exception during send:`, err);
      return {
        success: false,
        error: err.message || "Network exception",
        mediaUrl,
        webFallbackUrl,
      };
    }
  }
}

export const whatsAppGateway = new WhatsAppGatewayService();
