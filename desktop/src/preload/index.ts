import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  platform: process.platform,
  windowControls: {
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  },
  auth: {
    login: (payload: { baseUrl: string; email: string; password: string; verificationCode?: string; organizationId?: string }) =>
      ipcRenderer.invoke("auth:login", payload),
    me: (payload: { baseUrl: string }) => ipcRenderer.invoke("auth:me", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  inventory: {
    check: (payload: { baseUrl: string; imei?: string; serialNumber?: string; sku?: string; id?: string; excludeId?: string }) =>
      ipcRenderer.invoke("inventory:check", payload),
    add: (payload: { baseUrl: string; data: Record<string, unknown> }) =>
      ipcRenderer.invoke("inventory:add", payload),
    options: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("inventory:options", payload),
    pricingRules: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("inventory:pricing-rules", payload),
    list: (payload: { baseUrl: string; status?: string }) =>
      ipcRenderer.invoke("inventory:list", payload),
  },
  labelTemplate: {
    get: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("label-template:get", payload),
    save: (payload: { baseUrl: string; template: Record<string, unknown> }) =>
      ipcRenderer.invoke("label-template:save", payload),
  },
  org: {
    logoDataUrl: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("org:logo-data-url", payload),
  },
  dashboard: {
    overview: (payload: {
      baseUrl: string;
      from?: string;
      to?: string;
      customerType?: "all" | "retail" | "wholesale";
    }) => ipcRenderer.invoke("dashboard:overview", payload),
  },
  checkout: {
    data: (payload: { baseUrl: string }) => ipcRenderer.invoke("checkout:data", payload),
    completeSale: (payload: { baseUrl: string; data: Record<string, unknown> }) =>
      ipcRenderer.invoke("checkout:complete-sale", payload),
  },
  sales: {
    history: (payload: { baseUrl: string }) => ipcRenderer.invoke("sales:history", payload),
    sendReceiptEmail: (payload: { baseUrl: string; saleId: string }) =>
      ipcRenderer.invoke("sales:send-receipt", payload),
    cancel: (payload: {
      baseUrl: string;
      data: {
        saleId: string;
        reason: string;
        fullSale: boolean;
        items: Array<{ saleItemId: string }>;
      };
    }) => ipcRenderer.invoke("sales:cancel", payload),
  },
  credit: {
    ledger: (payload: { baseUrl: string; customerId?: string }) =>
      ipcRenderer.invoke("credit:ledger", payload),
    payables: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("credit:payables", payload),
    reconcileCancelledSale: (payload: {
      baseUrl: string;
      data: { saleNumber: string };
    }) => ipcRenderer.invoke("credit:reconcile-cancelled-sale", payload),
    addPayment: (payload: {
      baseUrl: string;
      data: { customerId: string; amount: number; note?: string; paymentMethod?: string; saleId?: string };
    }) => ipcRenderer.invoke("credit:add-payment", payload),
    updatePayment: (payload: {
      baseUrl: string;
      data: { id: string; amount?: number; note?: string; paymentMethod?: string };
    }) => ipcRenderer.invoke("credit:update-payment", payload),
    deletePayment: (payload: { baseUrl: string; data: { id: string } }) =>
      ipcRenderer.invoke("credit:delete-payment", payload),
  },
  publicInventory: {
    getSettings: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("public-inventory:get-settings", payload),
    saveSettings: (payload: {
      baseUrl: string;
      data: { enabled: boolean; slug: string; columns: string[] };
    }) => ipcRenderer.invoke("public-inventory:save-settings", payload),
  },
  profile: {
    get: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("profile:get", payload),
    summary: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("profile:summary", payload),
    teamMembers: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("profile:team-members", payload),
    updateTeamMember: (payload: {
      baseUrl: string;
      data: { membershipId: string; role: "superadmin" | "admin" | "staff"; permissions: Record<string, boolean> };
    }) => ipcRenderer.invoke("profile:update-team-member", payload),
    invites: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("profile:invites", payload),
    sendInvite: (payload: {
      baseUrl: string;
      data: { email: string; role: "admin" | "staff"; permissions: Record<string, boolean> };
    }) => ipcRenderer.invoke("profile:send-invite", payload),
    revokeInvite: (payload: { baseUrl: string; data: { inviteId: string } }) =>
      ipcRenderer.invoke("profile:revoke-invite", payload),
    uploadLogo: (payload: {
      baseUrl: string;
      data: { fileName: string; mimeType: string; base64: string };
    }) => ipcRenderer.invoke("profile:upload-logo", payload),
    deleteLogo: (payload: { baseUrl: string }) =>
      ipcRenderer.invoke("profile:delete-logo", payload),
    update: (payload: {
      baseUrl: string;
      data: {
        fullName: string;
        whatsappCountryCode: string;
        whatsappNumber: string;
        preferredLanguage: "en" | "es";
      };
    }) => ipcRenderer.invoke("profile:update", payload),
    changePassword: (payload: {
      baseUrl: string;
      data: { currentPassword: string; newPassword: string };
    }) => ipcRenderer.invoke("profile:change-password", payload),
  },
  dataAdmin: {
    suppliers: {
      list: (payload: { baseUrl: string }) => ipcRenderer.invoke("data-admin:suppliers:list", payload),
      create: (payload: { baseUrl: string; data: { name: string; status?: string } }) =>
        ipcRenderer.invoke("data-admin:suppliers:create", payload),
      update: (payload: { baseUrl: string; data: { id: string; name?: string; status?: string } }) =>
        ipcRenderer.invoke("data-admin:suppliers:update", payload),
      delete: (payload: { baseUrl: string; data: { id: string } }) =>
        ipcRenderer.invoke("data-admin:suppliers:delete", payload),
    },
    customers: {
      list: (payload: { baseUrl: string }) => ipcRenderer.invoke("data-admin:customers:list", payload),
      create: (payload: {
        baseUrl: string;
        data: {
          name: string;
          email: string;
          whatsapp: string;
          customerType?: string;
          defaultPriceTier?: string;
          status?: string;
        };
      }) => ipcRenderer.invoke("data-admin:customers:create", payload),
      update: (payload: {
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
      }) => ipcRenderer.invoke("data-admin:customers:update", payload),
      delete: (payload: { baseUrl: string; data: { id: string } }) =>
        ipcRenderer.invoke("data-admin:customers:delete", payload),
    },
    locations: {
      list: (payload: { baseUrl: string }) => ipcRenderer.invoke("data-admin:locations:list", payload),
      create: (payload: { baseUrl: string; data: { name: string } }) =>
        ipcRenderer.invoke("data-admin:locations:create", payload),
      update: (payload: { baseUrl: string; data: { id: string; name?: string; status?: string } }) =>
        ipcRenderer.invoke("data-admin:locations:update", payload),
      delete: (payload: { baseUrl: string; data: { id: string } }) =>
        ipcRenderer.invoke("data-admin:locations:delete", payload),
    },
    pricing: {
      list: (payload: { baseUrl: string }) => ipcRenderer.invoke("data-admin:pricing:list", payload),
      upsert: (payload: { baseUrl: string; data: { model: string; capacity: string; price?: string; price2?: string; price3?: string } }) =>
        ipcRenderer.invoke("data-admin:pricing:upsert", payload),
      delete: (payload: { baseUrl: string; data: { id: string } }) =>
        ipcRenderer.invoke("data-admin:pricing:delete", payload),
    },
  },
  usb: {
    status: () => ipcRenderer.invoke("usb:status"),
    devices: () => ipcRenderer.invoke("usb:devices"),
  },
  notify: (title: string, body: string) => ipcRenderer.invoke("desktop:notify", title, body),
  openExternal: (url: string) => ipcRenderer.invoke("desktop:open-external", url),
});
