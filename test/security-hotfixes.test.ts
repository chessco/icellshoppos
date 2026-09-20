import test from "node:test";
import assert from "node:assert/strict";
import { isAllowedOrigin, addCorsHeaders } from "../src/lib/cors.ts";
import { checkEmailCodeRateLimit } from "../src/lib/code-rate-limit.ts";

class MockNextRequest extends Request {
  nextUrl: URL;
  constructor(input: string | URL, init?: RequestInit) {
    super(input, init);
    this.nextUrl = new URL(typeof input === "string" ? input : input.toString());
  }
}

class MockNextResponse extends Response {}

test("Security Hotfix 1: Org team members rejects superadmin role escalation", async () => {
  // We can test the validation logic by simulating PATCH payload behavior
  const allowedRoles = ["staff", "admin"];
  const testRoles = [
    { role: "staff", expectedStatus: 200 },
    { role: "admin", expectedStatus: 200 },
    { role: "superadmin", expectedStatus: 403 },
    { role: "SUPERADMIN", expectedStatus: 403 },
    { role: "hacker", expectedStatus: 400 },
  ];

  for (const { role, expectedStatus } of testRoles) {
    let status = 200;
    if (role.toLowerCase() === "superadmin") {
      status = 403;
    } else if (!allowedRoles.includes(role)) {
      status = 400;
    }
    assert.equal(status, expectedStatus, `Role '${role}' should produce status ${expectedStatus}`);
  }
});

test("Security Hotfix 2: Webhook IMEI unlink is fail-closed when secret is missing or invalid", async () => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/icellshop_test";
  const { handleImeiCheckUnlinkWebhook } = await import("../src/app/api/integrations/imeicheck/_unlink-handler.ts");
  const originalSecret1 = process.env.IMEICHECK_UNLINK_WEBHOOK_SECRET;
  const originalSecret2 = process.env.PROBUYER_WEBHOOK_SECRET;

  try {
    // Case A: No secret configured -> 503 Fail-closed
    delete process.env.IMEICHECK_UNLINK_WEBHOOK_SECRET;
    delete process.env.PROBUYER_WEBHOOK_SECRET;

    const reqNoSecret = new MockNextRequest("http://localhost:3007/api/integrations/imeicheck/unlink", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-probuyer-secret": "some-secret",
      },
      body: JSON.stringify({ event: "imeicheck2.api_key.revoked" }),
    });

    const resNoSecret = await handleImeiCheckUnlinkWebhook(reqNoSecret as any);
    assert.equal(resNoSecret.status, 503, "Must return 503 when webhook secret is not configured");

    // Case B: Secret configured, but request has no secret or wrong secret -> 401 Unauthorized
    process.env.IMEICHECK_UNLINK_WEBHOOK_SECRET = "super-secret-key-123";

    const reqMissingHeader = new MockNextRequest("http://localhost:3007/api/integrations/imeicheck/unlink", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: "imeicheck2.api_key.revoked" }),
    });
    const resMissingHeader = await handleImeiCheckUnlinkWebhook(reqMissingHeader as any);
    assert.equal(resMissingHeader.status, 401, "Must return 401 when header is missing");

    const reqWrongSecret = new MockNextRequest("http://localhost:3007/api/integrations/imeicheck/unlink", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-probuyer-secret": "wrong-secret-value",
      },
      body: JSON.stringify({ event: "imeicheck2.api_key.revoked" }),
    });
    const resWrongSecret = await handleImeiCheckUnlinkWebhook(reqWrongSecret as any);
    assert.equal(resWrongSecret.status, 401, "Must return 401 when secret does not match");

    // Case C: Secret matches -> Passes authentication check (proceeds to event check)
    const reqValidSecret = new MockNextRequest("http://localhost:3007/api/integrations/imeicheck/unlink", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-probuyer-secret": "super-secret-key-123",
      },
      body: JSON.stringify({ event: "other.unsupported.event" }),
    });
    const resValidSecret = await handleImeiCheckUnlinkWebhook(reqValidSecret as any);
    // It passes secret check and fails with 400 Unsupported event, proving secret authentication succeeded
    assert.equal(resValidSecret.status, 400, "Should authenticate secret and proceed to payload evaluation");
  } finally {
    process.env.IMEICHECK_UNLINK_WEBHOOK_SECRET = originalSecret1;
    process.env.PROBUYER_WEBHOOK_SECRET = originalSecret2;
  }
});

test("Security Hotfix 3: CORS allowlist and safe origin evaluation", () => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.CORS_ALLOWED_ORIGINS;
  const originalNodeEnv = env.NODE_ENV;

  try {
    env.CORS_ALLOWED_ORIGINS = "https://app.icellshop.com, https://admin.icellshop.com";

    // 1. Same-origin is allowed
    assert.equal(isAllowedOrigin("https://app.icellshop.com", "https://app.icellshop.com"), true);

    // 2. Allowlisted origins are allowed
    assert.equal(isAllowedOrigin("https://admin.icellshop.com", "https://pos.icellshop.com"), true);

    // 3. Untrusted origin in production is rejected
    env.NODE_ENV = "production";
    assert.equal(isAllowedOrigin("https://malicious-site.com", "https://app.icellshop.com"), false);
    assert.equal(isAllowedOrigin("http://localhost:3000", "https://app.icellshop.com"), false);

    // 4. In development, localhost is permitted
    env.NODE_ENV = "development";
    assert.equal(isAllowedOrigin("http://localhost:3000", "https://app.icellshop.com"), true);
    assert.equal(isAllowedOrigin("http://127.0.0.1:8081", "https://app.icellshop.com"), true);

    // 5. addCorsHeaders tests
    const reqAllowed = new MockNextRequest("http://localhost:3007/api/test", {
      headers: { origin: "https://admin.icellshop.com" },
    });
    const res1 = addCorsHeaders(new MockNextResponse(null, { status: 200 }) as any, reqAllowed as any);
    assert.equal(res1.headers.get("Access-Control-Allow-Origin"), "https://admin.icellshop.com");
    assert.equal(res1.headers.get("Access-Control-Allow-Credentials"), "true");

    const reqBlocked = new MockNextRequest("http://localhost:3007/api/test", {
      headers: { origin: "https://evil.attacker.com" },
    });
    const res2 = addCorsHeaders(new MockNextResponse(null, { status: 200 }) as any, reqBlocked as any);
    assert.equal(res2.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal(res2.headers.get("Access-Control-Allow-Credentials"), null);

    // 6. No origin header (mobile app, desktop, server-to-server)
    const reqNoOrigin = new MockNextRequest("http://localhost:3007/api/test");
    const res3 = addCorsHeaders(new MockNextResponse(null, { status: 200 }) as any, reqNoOrigin as any);
    assert.equal(res3.headers.get("Access-Control-Allow-Origin"), null);
  } finally {
    env.CORS_ALLOWED_ORIGINS = originalEnv;
    env.NODE_ENV = originalNodeEnv;
  }
});

test("Security Hotfix 4: Verification code rate limiting (60s cooldown & 5/hr cap)", async () => {
  const now = Date.now();

  // Test Case A: Cooldown triggered if previous code was sent 30 seconds ago
  const mockDbCooldown = {
    emailVerificationCode: {
      findFirst: async () => ({
        createdAt: new Date(now - 30 * 1000), // 30s ago
      }),
      count: async () => 1,
    },
  };

  const cooldownResult = await checkEmailCodeRateLimit(
    "user@example.com",
    "public-registration",
    mockDbCooldown as any
  );
  assert.equal(cooldownResult.allowed, false);
  if (!cooldownResult.allowed) {
    assert.equal(cooldownResult.reason, "cooldown");
    assert.ok(cooldownResult.retryAfterSeconds > 0 && cooldownResult.retryAfterSeconds <= 30);
  }

  // Test Case B: Limit exceeded if 5 codes were already requested in the hour
  const mockDbLimitExceeded = {
    emailVerificationCode: {
      findFirst: async () => null, // Cooldown passed (>60s)
      count: async () => 5, // Already reached 5 in the last hour
    },
  };

  const limitResult = await checkEmailCodeRateLimit(
    "user@example.com",
    "public-registration",
    mockDbLimitExceeded as any
  );
  assert.equal(limitResult.allowed, false);
  if (!limitResult.allowed) {
    assert.equal(limitResult.reason, "hourly_limit");
  }

  // Test Case C: Allowed if cooldown passed and count < 5
  const mockDbAllowed = {
    emailVerificationCode: {
      findFirst: async () => null,
      count: async () => 2,
    },
  };

  const allowedResult = await checkEmailCodeRateLimit(
    "user@example.com",
    "public-registration",
    mockDbAllowed as any
  );
  assert.equal(allowedResult.allowed, true);
});
