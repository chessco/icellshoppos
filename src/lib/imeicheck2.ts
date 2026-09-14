const DEFAULT_IMEICHECK2_BASE_URL = "https://imeicheck-1.onrender.com";

export type InitResponse = {
  success?: boolean;
  confirmed?: boolean;
  email?: string;
  confirmation_token?: string;
  expires_in?: number;
  pricing?: unknown;
  pricing_updated_at?: string;
  balance?: number;
  available_balance?: number;
  error?: string;
};

function getBaseUrl() {
  return (process.env.IMEICHECK2_API_BASE_URL || DEFAULT_IMEICHECK2_BASE_URL).replace(/\/$/, "");
}

export async function callImeiCheck2Init(args: { apiKey: string; email: string }) {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}/api/external/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: args.apiKey,
        email: args.email,
      }),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false as const,
      status: 0,
      error: `Unable to reach IMEI provider at ${getBaseUrl()}. ${error instanceof Error ? error.message : "Network error"}`,
    };
  }

  const rawText = await response.text().catch(() => "");
  let payload: InitResponse = {};
  try { payload = JSON.parse(rawText) as InitResponse; } catch { /* not JSON */ }

  if (!response.ok || !payload?.success || !payload?.confirmation_token) {
    const detail = payload?.error
      ? payload.error
      : rawText.length > 0 && rawText.length < 300
        ? `HTTP ${response.status}: ${rawText}`
        : `HTTP ${response.status}: failed to verify API key (check IMEICHECK2_API_BASE_URL)`;
    return {
      ok: false as const,
      status: response.status,
      error: detail,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    token: payload.confirmation_token,
    expiresIn: Number(payload.expires_in || 600),
    email: String(payload.email || args.email),
    pricing: payload.pricing,
    pricingUpdatedAt: payload.pricing_updated_at,
    balance: Number(payload.balance ?? payload.available_balance),
  };
}

export async function callImeiCheck2Endpoint(
  path: "/api/external/imei-check" | "/api/external/orders" | "/api/external/services",
  body: unknown,
) {
  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: `Unable to reach IMEI provider at ${getBaseUrl()}. ${error instanceof Error ? error.message : "Network error"}`,
      },
    };
  }

  const payload = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}
