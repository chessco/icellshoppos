import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import type {
  CommissionRule,
  SellerProfile,
  CommissionSaleRecord,
  SaleCommissionSummary,
  SellerCommissionReport,
} from "@ireader/contracts";
import {
  CommissionApplicationService,
  type CommissionCartItemInput,
} from "@ireader/application";
import { MobileSecureStorageAdapter } from "../storage/MobileSecureStorageAdapter";
import { useAuth } from "./AuthContext";

const RULES_STORAGE_KEY = "pos_commission_rules_v2";
const RECORDS_STORAGE_KEY = "pos_commission_records_v2";
const ACTIVE_SELLER_KEY = "pos_commission_active_seller_v2";
const CUSTOM_SELLERS_KEY = "pos_commission_custom_sellers_v2";

const DEFAULT_SELLERS: SellerProfile[] = [
  { id: "seller-1", name: "Carlos Mendoza", role: "Vendedor Senior", avatarColor: "#38bdf8" },
  { id: "seller-2", name: "Ana Morales", role: "Vendedora Especialista", avatarColor: "#f43f5e" },
  { id: "seller-3", name: "Mostrador General", role: "Caja POS", avatarColor: "#10b981" },
];

interface CommissionContextValue {
  rules: CommissionRule[];
  sellers: SellerProfile[];
  activeSeller: SellerProfile;
  setActiveSeller: (seller: SellerProfile) => void;
  addSeller: (name: string, role?: string) => Promise<void>;
  addRule: (rule: Omit<CommissionRule, "id">) => Promise<void>;
  updateRule: (id: string, updates: Partial<CommissionRule>) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;
  deleteRule: (id: string) => Promise<void>;
  resetToDefaultRules: () => Promise<void>;
  calculateEstimate: (items: CommissionCartItemInput[]) => SaleCommissionSummary;
  records: CommissionSaleRecord[];
  recordSale: (
    saleId: string,
    saleNumber: string | undefined,
    items: CommissionCartItemInput[]
  ) => Promise<CommissionSaleRecord>;
  clearRecords: () => Promise<void>;
  sellerReports: SellerCommissionReport[];
}

const CommissionContext = createContext<CommissionContextValue | null>(null);

export function CommissionProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const service = useMemo(() => new CommissionApplicationService(), []);
  const storage = useMemo(() => new MobileSecureStorageAdapter(), []);

  const [rules, setRules] = useState<CommissionRule[]>(() => service.getDefaultRules());
  const [customSellers, setCustomSellers] = useState<SellerProfile[]>([]);
  const [activeSeller, setActiveSellerState] = useState<SellerProfile>(() => {
    return {
      id: session?.userId || "seller-main",
      name: session?.email ? session.email.split("@")[0] : "Vendedor Principal",
      email: session?.email,
      role: "Vendedor de Turno",
      avatarColor: "#6366f1",
    };
  });
  const [records, setRecords] = useState<CommissionSaleRecord[]>([]);

  // Update default active seller if session changes and no explicit seller was chosen
  useEffect(() => {
    if (session?.email && activeSeller.id === "seller-main") {
      setActiveSellerState({
        id: session.userId || "seller-session",
        name: session.email.split("@")[0],
        email: session.email,
        role: "Usuario en Sesión",
        avatarColor: "#6366f1",
      });
    }
  }, [session, activeSeller.id]);

  // Load persisted data on mount
  useEffect(() => {
    let isMounted = true;
    async function loadStoredData() {
      try {
        const [savedRules, savedRecords, savedSeller, savedCustomSellers] = await Promise.all([
          storage.getItem(RULES_STORAGE_KEY),
          storage.getItem(RECORDS_STORAGE_KEY),
          storage.getItem(ACTIVE_SELLER_KEY),
          storage.getItem(CUSTOM_SELLERS_KEY),
        ]);

        if (isMounted) {
          if (savedRules) {
            try {
              const parsed = JSON.parse(savedRules);
              if (Array.isArray(parsed) && parsed.length > 0) setRules(parsed);
            } catch {}
          }
          if (savedRecords) {
            try {
              const parsed = JSON.parse(savedRecords);
              if (Array.isArray(parsed)) setRecords(parsed);
            } catch {}
          }
          if (savedCustomSellers) {
            try {
              const parsed = JSON.parse(savedCustomSellers);
              if (Array.isArray(parsed)) setCustomSellers(parsed);
            } catch {}
          }
          if (savedSeller) {
            try {
              const parsed = JSON.parse(savedSeller);
              if (parsed?.id && parsed?.name) setActiveSellerState(parsed);
            } catch {}
          }
        }
      } catch {
        // Fallback to in-memory defaults
      }
    }
    void loadStoredData();
    return () => {
      isMounted = false;
    };
  }, [storage]);

  // Combined sellers list
  const sellers = useMemo(() => {
    const list = [...DEFAULT_SELLERS, ...customSellers];
    if (session?.email && !list.some((s) => s.email === session.email)) {
      list.unshift({
        id: session.userId || "seller-session",
        name: session.email.split("@")[0],
        email: session.email,
        role: "Usuario Actual",
        avatarColor: "#6366f1",
      });
    }
    return list;
  }, [customSellers, session]);

  const setActiveSeller = useCallback(
    (seller: SellerProfile) => {
      setActiveSellerState(seller);
      void storage.setItem(ACTIVE_SELLER_KEY, JSON.stringify(seller));
    },
    [storage]
  );

  const addSeller = useCallback(
    async (name: string, role?: string) => {
      if (!name.trim()) return;
      const newSeller: SellerProfile = {
        id: `seller-${Date.now()}`,
        name: name.trim(),
        role: role?.trim() || "Vendedor",
        avatarColor: "#" + Math.floor(Math.random() * 16777215).toString(16),
      };
      const updated = [...customSellers, newSeller];
      setCustomSellers(updated);
      await storage.setItem(CUSTOM_SELLERS_KEY, JSON.stringify(updated));
    },
    [customSellers, storage]
  );

  const saveRules = useCallback(
    async (newRules: CommissionRule[]) => {
      setRules(newRules);
      await storage.setItem(RULES_STORAGE_KEY, JSON.stringify(newRules));
    },
    [storage]
  );

  const addRule = useCallback(
    async (rule: Omit<CommissionRule, "id">) => {
      const newRule: CommissionRule = {
        ...rule,
        id: `rule-${Date.now()}`,
      };
      await saveRules([...rules, newRule]);
    },
    [rules, saveRules]
  );

  const updateRule = useCallback(
    async (id: string, updates: Partial<CommissionRule>) => {
      const updated = rules.map((r) => (r.id === id ? { ...r, ...updates } : r));
      await saveRules(updated);
    },
    [rules, saveRules]
  );

  const toggleRule = useCallback(
    async (id: string) => {
      const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      await saveRules(updated);
    },
    [rules, saveRules]
  );

  const deleteRule = useCallback(
    async (id: string) => {
      const updated = rules.filter((r) => r.id !== id);
      await saveRules(updated);
    },
    [rules, saveRules]
  );

  const resetToDefaultRules = useCallback(async () => {
    const defaults = service.getDefaultRules();
    await saveRules(defaults);
  }, [service, saveRules]);

  const calculateEstimate = useCallback(
    (items: CommissionCartItemInput[]) => {
      return service.calculateSaleCommissions(items, rules, activeSeller);
    },
    [service, rules, activeSeller]
  );

  const recordSale = useCallback(
    async (
      saleId: string,
      saleNumber: string | undefined,
      items: CommissionCartItemInput[]
    ): Promise<CommissionSaleRecord> => {
      const summary = service.calculateSaleCommissions(items, rules, activeSeller);

      const record: CommissionSaleRecord = {
        id: `comrec-${Date.now()}`,
        saleId,
        saleNumber,
        timestamp: new Date().toISOString(),
        sellerId: activeSeller.id,
        sellerName: activeSeller.name,
        totalSale: summary.totalSale,
        totalMargin: summary.totalMargin,
        totalCommission: summary.totalCommission,
        items: summary.items.map((i) => ({
          inventoryItemId: i.inventoryItemId,
          model: i.model,
          salePrice: i.salePrice,
          cost: i.cost,
          commissionAmount: i.commissionAmount,
          appliedRuleName: i.appliedRuleName,
        })),
      };

      const updated = [record, ...records];
      setRecords(updated);
      await storage.setItem(RECORDS_STORAGE_KEY, JSON.stringify(updated));
      return record;
    },
    [service, rules, activeSeller, records, storage]
  );

  const clearRecords = useCallback(async () => {
    setRecords([]);
    await storage.removeItem(RECORDS_STORAGE_KEY);
  }, [storage]);

  const sellerReports = useMemo(() => {
    return service.generateSellerReports(records);
  }, [service, records]);

  return (
    <CommissionContext.Provider
      value={{
        rules,
        sellers,
        activeSeller,
        setActiveSeller,
        addSeller,
        addRule,
        updateRule,
        toggleRule,
        deleteRule,
        resetToDefaultRules,
        calculateEstimate,
        records,
        recordSale,
        clearRecords,
        sellerReports,
      }}
    >
      {children}
    </CommissionContext.Provider>
  );
}

export function useCommission() {
  const ctx = useContext(CommissionContext);
  if (!ctx) {
    throw new Error("useCommission must be used within a CommissionProvider");
  }
  return ctx;
}
