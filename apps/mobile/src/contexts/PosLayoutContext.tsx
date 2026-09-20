import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import { MobileSecureStorageAdapter } from "../storage/MobileSecureStorageAdapter";

export type PosLayoutMode = "apple_touch" | "classic";

interface PosLayoutContextValue {
  layoutMode: PosLayoutMode;
  setLayoutMode: (mode: PosLayoutMode) => void;
  toggleLayoutMode: () => void;
}

const PosLayoutContext = createContext<PosLayoutContextValue | null>(null);

const STORAGE_KEY = "pos_layout_mode";

export function PosLayoutProvider({ children }: { children: React.ReactNode }) {
  // Default to the new Apple Touch POS experience
  const [layoutMode, setLayoutModeState] = useState<PosLayoutMode>("apple_touch");
  const storage = useMemo(() => new MobileSecureStorageAdapter(), []);

  useEffect(() => {
    let isMounted = true;
    async function loadSavedMode() {
      try {
        const saved = await storage.getItem(STORAGE_KEY);
        if (saved && (saved === "apple_touch" || saved === "classic") && isMounted) {
          setLayoutModeState(saved as PosLayoutMode);
        }
      } catch {
        // Fallback to default
      }
    }
    void loadSavedMode();
    return () => {
      isMounted = false;
    };
  }, [storage]);

  const setLayoutMode = (mode: PosLayoutMode) => {
    setLayoutModeState(mode);
    void storage.setItem(STORAGE_KEY, mode);
  };

  const toggleLayoutMode = () => {
    const nextMode: PosLayoutMode = layoutMode === "apple_touch" ? "classic" : "apple_touch";
    setLayoutMode(nextMode);
  };

  const value = useMemo(
    () => ({
      layoutMode,
      setLayoutMode,
      toggleLayoutMode,
    }),
    [layoutMode]
  );

  return <PosLayoutContext.Provider value={value}>{children}</PosLayoutContext.Provider>;
}

export function usePosLayout() {
  const ctx = useContext(PosLayoutContext);
  if (!ctx) {
    throw new Error("usePosLayout must be used within a PosLayoutProvider");
  }
  return ctx;
}
