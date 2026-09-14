import { app, BrowserWindow, Menu, Notification, dialog, ipcMain, screen, shell } from "electron";
import { join } from "node:path";
import Store from "electron-store";
import { getAdapterStatus } from "./usb/AppleUsbAdapter.js";
import { WindowsSafeStorageAdapter } from "./storage/WindowsSafeStorageAdapter.js";
import type { ISecureStorage } from "./ports/ISecureStorage.js";

type WindowState = {
  x?: number;
  y?: number;
  width: number;
  height: number;
  isMaximized: boolean;
};

const windowStore = new Store<WindowState>({
  name: "window-state",
  defaults: {
    width: 1240,
    height: 820,
    isMaximized: false,
  },
});

let secureStorage: ISecureStorage | null = null;
let sessionCookie = "";
let mainWindow: BrowserWindow | null = null;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

async function initSecureStorage() {
  secureStorage = new WindowsSafeStorageAdapter(app.getPath("userData"));
  const stored = await secureStorage.getItem("session");
  if (stored) {
    sessionCookie = stored;
  }
}

async function saveSessionCookie(cookie: string) {
  sessionCookie = cookie;
  if (secureStorage) {
    await secureStorage.setItem("session", cookie);
  }
}

async function clearSessionCookie() {
  sessionCookie = "";
  if (secureStorage) {
    await secureStorage.removeItem("session");
  }
}

function getIcellshopCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) return "";
  const match = setCookieHeader.match(/icellshop_session=[^;]+/i);
  return match?.[0] ?? "";
}

function normalizeBaseUrl(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Backend URL is required.");
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  return `https://${trimmed}`.replace(/\/$/, "");
}

function withWwwHost(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.hostname.startsWith("www.")) return null;
    const parts = parsed.hostname.split(".");
    if (parts.length < 2) return null;
    parsed.hostname = `www.${parsed.hostname}`;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function withoutWwwHost(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    if (!parsed.hostname.startsWith("www.")) return null;
    parsed.hostname = parsed.hostname.slice(4);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function getTlsFallbackBaseUrls(normalizedBaseUrl: string) {
  const candidates = [withWwwHost(normalizedBaseUrl), withoutWwwHost(normalizedBaseUrl)]
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(candidates));
}

function getTlsCauseCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const cause = (error as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return "";
  return String((cause as { code?: unknown }).code ?? "");
}

function toQueryString(params: Record<string, string>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      search.set(key, normalized);
    }
  });
  return search.toString();
}

const DEFAULT_STATUS_OPTIONS = ["Available", "Sold", "Reserved", "Damaged"];
const DEFAULT_CARRIER_OPTIONS = ["Unlocked", "AT&T", "Verizon", "T-Mobile", "Sprint"];
const DEFAULT_CONDITION_OPTIONS = ["New", "Used", "Refurbished", "For parts"];
const DEFAULT_GRADE_OPTIONS = ["A", "AB", "A+", "B", "B-"];
const DEFAULT_CURRENCIES = ["MXN", "USD"];

function uniqueStrings(values: unknown[], fallback: string[]) {
  const normalized = values
    .map((value) => String(value ?? "").trim())
    .filter((value) => value.length > 0);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback];
}

function toNamedOptions(raw: unknown): Array<{ id: string; name: string; status?: string }> {
  if (!Array.isArray(raw)) return [];
  const options: Array<{ id: string; name: string; status?: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { id?: unknown; name?: unknown; status?: unknown };
    const id = String(row.id ?? "").trim();
    const name = String(row.name ?? "").trim();
    if (!id || !name) continue;
    const status = typeof row.status === "string" ? row.status : undefined;
    options.push({ id, name, status });
  }
  return options;
}

function toModelCatalog(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return {} as Record<string, { capacities: string[]; colors: string[]; deviceTypeId?: string }>;
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const catalog: Record<string, { capacities: string[]; colors: string[]; deviceTypeId?: string }> = {};
  for (const [model, value] of entries) {
    if (!value || typeof value !== "object") continue;
    const row = value as { capacities?: unknown; colors?: unknown; deviceTypeId?: unknown };
    const capacities = Array.isArray(row.capacities)
      ? row.capacities.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    const colors = Array.isArray(row.colors)
      ? row.colors.map((entry) => String(entry ?? "").trim()).filter(Boolean)
      : [];
    if (capacities.length === 0 && colors.length === 0) continue;
    const deviceTypeId = typeof row.deviceTypeId === "string" ? row.deviceTypeId.trim() : "";
    catalog[model] = {
      capacities,
      colors,
      ...(deviceTypeId ? { deviceTypeId } : {}),
    };
  }

  return catalog;
}

function toPricingRules(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as Array<{ model: string; capacity: string; price: string; price2: string; price3: string }>;
  }

  const rules: Array<{ model: string; capacity: string; price: string; price2: string; price3: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as {
      model?: unknown;
      capacity?: unknown;
      price?: unknown;
      price2?: unknown;
      price3?: unknown;
    };
    const model = String(row.model ?? "").trim();
    const capacity = String(row.capacity ?? "").trim();
    if (!model || !capacity) continue;
    rules.push({
      model,
      capacity,
      price: String(row.price ?? "").trim(),
      price2: String(row.price2 ?? "").trim(),
      price3: String(row.price3 ?? "").trim(),
    });
  }

  return rules;
}

async function readJsonSafe(response: Response) {
  return response.json().catch(() => ({}));
}

async function fetchOptionsEndpoint(baseUrl: string, path: string) {
  try {
    const response = await apiRequest(baseUrl, path, { method: "GET" });
    if (!response.ok) return null;
    return await readJsonSafe(response);
  } catch {
    return null;
  }
}

function buildAppMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: "App",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }],
    },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}



function createWindow() {
  const isMac = process.platform === "darwin";
  const savedX = windowStore.get("x");
  const savedY = windowStore.get("y");
  const savedWidth = windowStore.get("width");
  const savedHeight = windowStore.get("height");
  const xPos = typeof savedX === "number" ? savedX : undefined;
  const yPos = typeof savedY === "number" ? savedY : undefined;

  let useSavedPosition = typeof xPos === "number" && typeof yPos === "number";
  if (useSavedPosition) {
    const displays = screen.getAllDisplays();
    const intersectsAnyDisplay = displays.some((display) => {
      const bounds = display.workArea;
      return (
        xPos! < bounds.x + bounds.width &&
        xPos! + savedWidth > bounds.x &&
        yPos! < bounds.y + bounds.height &&
        yPos! + savedHeight > bounds.y
      );
    });
    useSavedPosition = intersectsAnyDisplay;
  }

  const win = new BrowserWindow({
    x: useSavedPosition ? xPos : undefined,
    y: useSavedPosition ? yPos : undefined,
    width: savedWidth,
    height: savedHeight,
    minWidth: 980,
    minHeight: 680,
    frame: isMac,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    backgroundColor: "#0f1116",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  let didRevealWindow = false;
  const revealWindow = () => {
    if (didRevealWindow) return;
    didRevealWindow = true;
    win.show();
    win.focus();
    if (windowStore.get("isMaximized")) {
      win.maximize();
    }
  };

  win.webContents.on("context-menu", () => {
    const menu = Menu.buildFromTemplate([
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ]);
    menu.popup({ window: win });
  });

  win.once("ready-to-show", revealWindow);
  setTimeout(revealWindow, 2000);

  win.on("close", () => {
    const bounds = win.getBounds();
    windowStore.set({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: win.isMaximized(),
    });
  });

  win.on("closed", () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else if (!app.isPackaged) {
    // Fallback to default Vite URL in dev to avoid loading stale out/renderer artifacts.
    void win.loadURL("http://localhost:5173/");
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}

async function apiRequest(baseUrl: string, path: string, init?: RequestInit) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const url = `${normalizedBaseUrl}${path}`;
  const headers = new Headers(init?.headers ?? {});
  if (sessionCookie) {
    headers.set("cookie", sessionCookie);
  }
  try {
    const response = await fetch(url, {
      ...init,
      headers,
    });
    return response;
  } catch (error: unknown) {
    const code = getTlsCauseCode(error);
    if (code === "ERR_SSL_TLSV1_ALERT_UNRECOGNIZED_NAME") {
      const fallbackBaseUrls = getTlsFallbackBaseUrls(normalizedBaseUrl);
      for (const fallbackBaseUrl of fallbackBaseUrls) {
        const fallbackUrl = `${fallbackBaseUrl}${path}`;
        try {
          return await fetch(fallbackUrl, {
            ...init,
            headers,
          });
        } catch {
          // Try next fallback host variant.
        }
      }

      throw new Error(
        `TLS handshake failed for ${normalizedBaseUrl}. Try explicit host variant (www/non-www) with full HTTPS URL.`
      );
    }

    const reason = error instanceof Error ? error.message : "Unknown network error";
    throw new Error(`Network request failed for ${normalizedBaseUrl}: ${reason}`);
  }
}

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  await initSecureStorage();
  buildAppMenu();
  mainWindow = createWindow();
  void getAdapterStatus();

  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
  });

  ipcMain.handle("window:maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });

  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);

  ipcMain.handle("window:close", async () => {
    if (!mainWindow) return;
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Cancel", "Close"],
      defaultId: 1,
      cancelId: 0,
      title: "Close iReader by Pro Buyer",
      message: "Close the desktop app?",
    });
    if (choice.response === 1) {
      mainWindow.close();
    }
  });

  ipcMain.handle(
    "auth:login",
    async (
      _event,
      payload: { baseUrl: string; email: string; password: string; verificationCode?: string; organizationId?: string }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: payload.email,
          password: payload.password,
          verificationCode: payload.verificationCode,
          organizationId: payload.organizationId,
        }),
      });

      const result = await readJsonSafe(response);

      // Handle 2FA requirement
      if (response.ok && result?.requiresVerification) {
        return {
          requiresVerification: true,
          expiresInMinutes: result.expiresInMinutes,
          cooldownSeconds: result.cooldownSeconds,
          message: result.message ?? "Verification code sent to your email.",
        };
      }

      if (!response.ok) {
        if (result?.requiresVerification) {
          return {
            requiresVerification: true,
            cooldownSeconds: result.cooldownSeconds,
            error: result.error ?? "Verification code required.",
          };
        }
        throw new Error(result?.error || `Login failed with status ${response.status}`);
      }

      const cookie = getIcellshopCookie(response.headers.get("set-cookie"));
      if (cookie) {
        await saveSessionCookie(cookie);
      }

      const meResponse = await apiRequest(payload.baseUrl, "/api/auth/me", { method: "GET" });
      if (!meResponse.ok) {
        throw new Error("Login succeeded but /api/auth/me failed.");
      }

      return meResponse.json();
    }
  );

  ipcMain.handle("auth:me", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/auth/me", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Session check failed (${response.status}): ${text || "Unauthorized"}`);
    }
    return response.json();
  });

  ipcMain.handle("auth:logout", async () => {
    await clearSessionCookie();
  });

  ipcMain.handle(
    "inventory:check",
    async (
      _event,
      payload: {
        baseUrl: string;
        imei?: string;
        serialNumber?: string;
        sku?: string;
        id?: string;
        excludeId?: string;
      }
    ) => {
      const query = toQueryString({
        imei: payload.imei ?? "",
        serialNumber: payload.serialNumber ?? "",
        sku: payload.sku ?? "",
        id: payload.id ?? "",
        excludeId: payload.excludeId ?? "",
      });

      if (!query) {
        return { exists: false };
      }

      const response = await apiRequest(payload.baseUrl, `/api/inventory/check-imei?${query}`, {
        method: "GET",
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Duplicate check failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "inventory:add",
    async (_event, payload: { baseUrl: string; data: Record<string, unknown> }) => {
      const response = await apiRequest(payload.baseUrl, "/api/inventory", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Inventory add failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("inventory:options", async (_event, payload: { baseUrl: string }) => {
    const [
      deviceTypesPayload,
      locationsPayload,
      suppliersPayload,
      carriersPayload,
      conditionPayload,
      gradePayload,
      modelCatalogPayload,
      pricingRulesPayload,
    ] = await Promise.all([
      fetchOptionsEndpoint(payload.baseUrl, "/api/device-types"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/locations"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/suppliers"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/org/carriers"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/org/condition-options"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/org/grade-options"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/org/model-catalog"),
      fetchOptionsEndpoint(payload.baseUrl, "/api/pricing-rules"),
    ]);

    const sites = toNamedOptions((locationsPayload as { locations?: unknown })?.locations)
      .filter((site) => site.status !== "Inactive");
    const suppliers = toNamedOptions((suppliersPayload as { suppliers?: unknown })?.suppliers)
      .filter((supplier) => supplier.status !== "Inactive");

    return {
      deviceTypes: toNamedOptions((deviceTypesPayload as { deviceTypes?: unknown })?.deviceTypes),
      sites,
      suppliers,
      carriers: uniqueStrings(
        Array.isArray((carriersPayload as { options?: unknown })?.options)
          ? ((carriersPayload as { options?: unknown[] }).options ?? [])
          : [],
        DEFAULT_CARRIER_OPTIONS
      ),
      conditions: uniqueStrings(
        Array.isArray((conditionPayload as { options?: unknown })?.options)
          ? ((conditionPayload as { options?: unknown[] }).options ?? [])
          : [],
        DEFAULT_CONDITION_OPTIONS
      ),
      grades: uniqueStrings(
        Array.isArray((gradePayload as { options?: unknown })?.options)
          ? ((gradePayload as { options?: unknown[] }).options ?? [])
          : [],
        DEFAULT_GRADE_OPTIONS
      ),
      statuses: [...DEFAULT_STATUS_OPTIONS],
      currencies: [...DEFAULT_CURRENCIES],
      modelCatalog: toModelCatalog((modelCatalogPayload as { catalog?: unknown })?.catalog),
      pricingRules: toPricingRules((pricingRulesPayload as { rules?: unknown })?.rules),
    };
  });

  ipcMain.handle("inventory:pricing-rules", async (_event, payload: { baseUrl: string }) => {
    const pricingRulesPayload = await fetchOptionsEndpoint(payload.baseUrl, "/api/pricing-rules");
    return {
      pricingRules: toPricingRules((pricingRulesPayload as { rules?: unknown })?.rules),
    };
  });

  ipcMain.handle("inventory:list", async (_event, payload: { baseUrl: string; status?: string }) => {
    const query = toQueryString({
      status: payload.status ?? "",
    });

    const response = await apiRequest(
      payload.baseUrl,
      `/api/inventory${query ? `?${query}` : ""}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Inventory list failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle("label-template:get", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/label-template", {
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Label template load failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle(
    "label-template:save",
    async (_event, payload: { baseUrl: string; template: Record<string, unknown> }) => {
      const response = await apiRequest(payload.baseUrl, "/api/org/label-template", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ template: payload.template }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Label template save failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("org:logo-data-url", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/logo", {
      method: "GET",
    });

    if (response.status === 404) {
      return { logoDataUrl: "" };
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Organization logo load failed (${response.status}): ${text || "Unknown error"}`);
    }

    const mimeType = response.headers.get("content-type") || "image/webp";
    const binary = Buffer.from(await response.arrayBuffer());
    return {
      logoDataUrl: `data:${mimeType};base64,${binary.toString("base64")}`,
    };
  });

  ipcMain.handle(
    "dashboard:overview",
    async (
      _event,
      payload: {
        baseUrl: string;
        from?: string;
        to?: string;
        customerType?: "all" | "retail" | "wholesale";
      }
    ) => {
      const query = toQueryString({
        from: payload.from ?? "",
        to: payload.to ?? "",
        customerType: payload.customerType ?? "all",
      });

      const response = await apiRequest(
        payload.baseUrl,
        `/api/dashboard${query ? `?${query}` : ""}`,
        { method: "GET" }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Dashboard load failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("checkout:data", async (_event, payload: { baseUrl: string }) => {
    const [inventoryResponse, customersResponse, sessionResponse] = await Promise.all([
      apiRequest(payload.baseUrl, "/api/inventory?status=Available", { method: "GET" }),
      apiRequest(payload.baseUrl, "/api/customers", { method: "GET" }),
      apiRequest(payload.baseUrl, "/api/auth/me", { method: "GET" }),
    ]);

    if (!inventoryResponse.ok) {
      const text = await inventoryResponse.text();
      throw new Error(`Checkout inventory load failed (${inventoryResponse.status}): ${text || "Unknown error"}`);
    }

    if (!customersResponse.ok) {
      const text = await customersResponse.text();
      throw new Error(`Checkout customers load failed (${customersResponse.status}): ${text || "Unknown error"}`);
    }

    if (!sessionResponse.ok) {
      const text = await sessionResponse.text();
      throw new Error(`Checkout session load failed (${sessionResponse.status}): ${text || "Unknown error"}`);
    }

    const [inventoryJson, customersJson, sessionJson] = await Promise.all([
      inventoryResponse.json(),
      customersResponse.json(),
      sessionResponse.json(),
    ]);

    return {
      inventoryItems: Array.isArray((inventoryJson as { inventoryItems?: unknown }).inventoryItems)
        ? (inventoryJson as { inventoryItems: unknown[] }).inventoryItems
        : [],
      customers: Array.isArray((customersJson as { customers?: unknown }).customers)
        ? (customersJson as { customers: unknown[] }).customers
        : [],
      session: (sessionJson as Record<string, unknown>)?.session ?? {},
    };
  });

  ipcMain.handle(
    "checkout:complete-sale",
    async (_event, payload: { baseUrl: string; data: Record<string, unknown> }) => {
      const response = await apiRequest(payload.baseUrl, "/api/sales", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Checkout failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("sales:history", async (_event, payload: { baseUrl: string }) => {
    const sessionResponse = await apiRequest(payload.baseUrl, "/api/auth/me", { method: "GET" });
    const sessionPayload = sessionResponse.ok ? await readJsonSafe(sessionResponse) : {};
    const session = (sessionPayload as { session?: { isSuperadmin?: boolean; activeOrganizationId?: string } }).session;
    const isSuperadmin = Boolean(session?.isSuperadmin);
    const activeOrganizationId = String(session?.activeOrganizationId ?? "").trim();

    const salesResponse = await apiRequest(payload.baseUrl, "/api/sales", { method: "GET" });

    if (salesResponse.ok) {
      const salesPayload = await readJsonSafe(salesResponse);
      const sales = Array.isArray((salesPayload as { sales?: unknown[] }).sales)
        ? ((salesPayload as { sales: unknown[] }).sales as unknown[])
        : [];

      if (sales.length > 0 || !isSuperadmin) {
        return salesPayload;
      }
    } else if (!isSuperadmin) {
      const text = await salesResponse.text();
      throw new Error(`Sales history load failed (${salesResponse.status}): ${text || "Unknown error"}`);
    }

    const adminPath = activeOrganizationId
      ? `/api/admin/sales-overview?organizationId=${encodeURIComponent(activeOrganizationId)}`
      : "/api/admin/sales-overview";
    const adminResponse = await apiRequest(payload.baseUrl, adminPath, { method: "GET" });

    if (!adminResponse.ok) {
      const text = await adminResponse.text();
      throw new Error(`Sales history load failed (${adminResponse.status}): ${text || "Unknown error"}`);
    }

    const adminPayload = await readJsonSafe(adminResponse);
    return {
      sales: Array.isArray((adminPayload as { sales?: unknown[] }).sales)
        ? (adminPayload as { sales: unknown[] }).sales
        : [],
    };
  });

  ipcMain.handle(
    "sales:send-receipt",
    async (_event, payload: { baseUrl: string; saleId: string }) => {
      const response = await apiRequest(payload.baseUrl, "/api/sales/send-receipt", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ saleId: payload.saleId }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Send receipt failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "sales:cancel",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: {
          saleId: string;
          reason: string;
          fullSale: boolean;
          items: Array<{ saleItemId: string }>;
        };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/cancel-sale", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Sales cancellation failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("credit:ledger", async (_event, payload: { baseUrl: string; customerId?: string }) => {
    const query = toQueryString({ customerId: payload.customerId ?? "" });
    const response = await apiRequest(
      payload.baseUrl,
      `/api/credit-ledger${query ? `?${query}` : ""}`,
      { method: "GET" }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Credit ledger load failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle("credit:payables", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/credit-ledger/payables", { method: "GET" });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Credit payables load failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle(
    "credit:reconcile-cancelled-sale",
    async (_event, payload: { baseUrl: string; data: { saleNumber: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/credit-ledger/reconcile-cancelled-sale", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Credit reconcile failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "credit:add-payment",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { customerId: string; amount: number; note?: string; paymentMethod?: string; saleId?: string };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/credit-ledger", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Credit payment failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "credit:update-payment",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { id: string; amount?: number; note?: string; paymentMethod?: string };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/credit-ledger", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Credit update failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "credit:delete-payment",
    async (_event, payload: { baseUrl: string; data: { id: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/credit-ledger", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Credit delete failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("public-inventory:get-settings", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/public-inventory-settings", {
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Public inventory settings load failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle(
    "public-inventory:save-settings",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { enabled: boolean; slug: string; columns: string[] };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/public-inventory-settings", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Public inventory settings save failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("profile:get", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/auth/user-profile", {
      method: "GET",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Profile load failed (${response.status}): ${text || "Unknown error"}`);
    }

    return response.json();
  });

  ipcMain.handle("profile:summary", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/summary", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Profile summary load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle("profile:team-members", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/team/members", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Team members load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "profile:update-team-member",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { membershipId: string; role: "superadmin" | "admin" | "staff"; permissions: Record<string, boolean> };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/org/team/members", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Team member update failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("profile:invites", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/invites", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Invites load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "profile:send-invite",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { email: string; role: "admin" | "staff"; permissions: Record<string, boolean> };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/org/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Invite send failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "profile:revoke-invite",
    async (_event, payload: { baseUrl: string; data: { inviteId: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/org/invites", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Invite revoke failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "profile:upload-logo",
    async (
      _event,
      payload: { baseUrl: string; data: { fileName: string; mimeType: string; base64: string } }
    ) => {
      const bytes = Buffer.from(payload.data.base64, "base64");
      const formData = new FormData();
      const blob = new Blob([bytes], { type: payload.data.mimeType || "application/octet-stream" });
      formData.set("file", blob, payload.data.fileName || "logo");

      const response = await apiRequest(payload.baseUrl, "/api/org/logo", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Logo upload failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("profile:delete-logo", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/org/logo", { method: "DELETE" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Logo delete failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "profile:update",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: {
          fullName: string;
          whatsappCountryCode: string;
          whatsappNumber: string;
          preferredLanguage: "en" | "es";
        };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/auth/user-profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Profile update failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle(
    "profile:change-password",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { currentPassword: string; newPassword: string };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/auth/change-password", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Password update failed (${response.status}): ${text || "Unknown error"}`);
      }

      return response.json();
    }
  );

  ipcMain.handle("data-admin:suppliers:list", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/suppliers", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Suppliers load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "data-admin:suppliers:create",
    async (_event, payload: { baseUrl: string; data: { name: string; status?: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/suppliers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supplier create failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:suppliers:update",
    async (_event, payload: { baseUrl: string; data: { id: string; name?: string; status?: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/suppliers", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supplier update failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:suppliers:delete",
    async (_event, payload: { baseUrl: string; data: { id: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/suppliers", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Supplier delete failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("data-admin:customers:list", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/customers", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Customers load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "data-admin:customers:create",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: {
          name: string;
          email: string;
          whatsapp: string;
          customerType?: string;
          defaultPriceTier?: string;
          status?: string;
        };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/customers", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Customer create failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:customers:update",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: {
          id: string;
          name?: string;
          email?: string;
          whatsapp?: string;
          customerType?: string;
          defaultPriceTier?: string;
          status?: string;
          creditEnabled?: boolean;
        };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/customers", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Customer update failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:customers:delete",
    async (_event, payload: { baseUrl: string; data: { id: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/customers", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Customer delete failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("data-admin:locations:list", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/locations", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Locations load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "data-admin:locations:create",
    async (_event, payload: { baseUrl: string; data: { name: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/locations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Location create failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:locations:update",
    async (_event, payload: { baseUrl: string; data: { id: string; name?: string; status?: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/locations", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Location update failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:locations:delete",
    async (_event, payload: { baseUrl: string; data: { id: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/locations", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Location delete failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("data-admin:pricing:list", async (_event, payload: { baseUrl: string }) => {
    const response = await apiRequest(payload.baseUrl, "/api/pricing-rules", { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Pricing rules load failed (${response.status}): ${text || "Unknown error"}`);
    }
    return response.json();
  });

  ipcMain.handle(
    "data-admin:pricing:upsert",
    async (
      _event,
      payload: {
        baseUrl: string;
        data: { model: string; capacity: string; price?: string; price2?: string; price3?: string };
      }
    ) => {
      const response = await apiRequest(payload.baseUrl, "/api/pricing-rules", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Pricing rule save failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle(
    "data-admin:pricing:delete",
    async (_event, payload: { baseUrl: string; data: { id: string } }) => {
      const response = await apiRequest(payload.baseUrl, "/api/pricing-rules", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload.data),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Pricing rule delete failed (${response.status}): ${text || "Unknown error"}`);
      }
      return response.json();
    }
  );

  ipcMain.handle("usb:status", async () => {
    return getAdapterStatus();
  });

  ipcMain.handle("usb:devices", async () => {
    const status = await getAdapterStatus();
    return status.devices;
  });

  ipcMain.handle("desktop:notify", (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body });
      notification.show();
    }
  });

  ipcMain.handle("desktop:open-external", async (_event, url: string) => {
    if (!url || !url.trim()) return;
    await shell.openExternal(url);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
