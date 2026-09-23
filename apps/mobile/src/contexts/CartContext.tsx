import React, { createContext, useContext, useState, useMemo, useEffect } from "react";
import type { IInventoryListItem, ActiveDiscountAuthInfo } from "@ireader/contracts";
import { useAuth } from "./AuthContext";

export interface CartItem {
  inventoryItem: IInventoryListItem;
  salePrice: number;
}

export interface CustomerInfo {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  creditEnabled?: boolean;
  notes?: string;
}

interface CartContextValue {
  items: CartItem[];
  selectedCustomer: CustomerInfo | null;
  discountAmount: number;
  activeDiscountAuth: ActiveDiscountAuthInfo | null;
  subtotal: number;
  totalPreview: number;
  addItem: (item: IInventoryListItem, customPrice?: number) => void;
  removeItem: (itemId: string) => void;
  updateItemPrice: (itemId: string, newPrice: number) => void;
  setCustomer: (customer: CustomerInfo | null) => void;
  setDiscountAmount: (discount: number) => void;
  setActiveDiscountAuth: (auth: ActiveDiscountAuthInfo | null) => void;
  clearDiscount: () => void;
  checkDiscountStatus: () => Promise<void>;
  clearCart: () => void;
  hasItem: (itemId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { apiClient } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);
  const [discountAmount, setDiscountAmountState] = useState<number>(0);
  const [activeDiscountAuth, setActiveDiscountAuth] = useState<ActiveDiscountAuthInfo | null>(null);

  // Polling for live status when discount authorization is PENDING via WhatsApp
  useEffect(() => {
    if (!activeDiscountAuth || activeDiscountAuth.status !== "PENDING") return;

    const interval = setInterval(async () => {
      try {
        const res = await apiClient.getDiscountAuthorization(activeDiscountAuth.id);
        if (!res.ok || !res.data) return;
        const updated = res.data;
        if (updated && updated.status !== "PENDING") {
          const approved = Number(updated.approvedDiscount) || 0;
          setActiveDiscountAuth({
            id: updated.id,
            status: updated.status,
            requestedDiscount: Number(updated.requestedDiscount) || 0,
            approvedDiscount: approved,
            reason: updated.reason,
            responseNote: updated.responseNote,
            draftSaleId: updated.draftSaleId || activeDiscountAuth.draftSaleId,
          });
          if (updated.status === "APPROVED" || updated.status === "PARTIAL") {
            setDiscountAmountState(approved);
          } else {
            setDiscountAmountState(0);
          }
        }
      } catch {
        // silent polling catch
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeDiscountAuth, apiClient]);

  const checkDiscountStatus = async () => {
    if (!activeDiscountAuth) return;
    try {
      const res = await apiClient.getDiscountAuthorization(activeDiscountAuth.id);
      if (res.ok && res.data) {
        const updated = res.data;
        const approved = Number(updated.approvedDiscount) || 0;
        setActiveDiscountAuth({
          id: updated.id,
          status: updated.status,
          requestedDiscount: Number(updated.requestedDiscount) || 0,
          approvedDiscount: approved,
          reason: updated.reason,
          responseNote: updated.responseNote,
          draftSaleId: updated.draftSaleId || activeDiscountAuth.draftSaleId,
        });
        if (updated.status === "APPROVED" || updated.status === "PARTIAL") {
          setDiscountAmountState(approved);
        } else if (updated.status === "REJECTED") {
          setDiscountAmountState(0);
        }
      }
    } catch {
      // ignore
    }
  };

  const addItem = (item: IInventoryListItem, customPrice?: number) => {
    setItems((prev) => {
      // Prevent duplicate serialized items in cart
      if (prev.some((p) => p.inventoryItem.id === item.id)) {
        return prev;
      }
      const rawPrice = customPrice !== undefined
        ? customPrice
        : typeof item.price === "number"
        ? item.price
        : parseFloat(String(item.price || 0)) || 0;
      return [...prev, { inventoryItem: item, salePrice: rawPrice }];
    });
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.inventoryItem.id !== itemId));
  };

  const updateItemPrice = (itemId: string, newPrice: number) => {
    setItems((prev) =>
      prev.map((i) =>
        i.inventoryItem.id === itemId
          ? { ...i, salePrice: Math.max(0, newPrice) }
          : i
      )
    );
  };

  const setCustomer = (customer: CustomerInfo | null) => {
    setSelectedCustomer(customer);
  };

  const setDiscountAmount = (discount: number) => {
    setDiscountAmountState(Math.max(0, discount));
  };

  const clearDiscount = () => {
    setActiveDiscountAuth(null);
    setDiscountAmountState(0);
  };

  const clearCart = () => {
    setItems([]);
    setSelectedCustomer(null);
    clearDiscount();
  };

  const hasItem = (itemId: string) => items.some((i) => i.inventoryItem.id === itemId);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.salePrice, 0);
  }, [items]);

  const totalPreview = useMemo(() => {
    return Math.max(0, subtotal - discountAmount);
  }, [subtotal, discountAmount]);

  return (
    <CartContext.Provider
      value={{
        items,
        selectedCustomer,
        discountAmount,
        activeDiscountAuth,
        subtotal,
        totalPreview,
        addItem,
        removeItem,
        updateItemPrice,
        setCustomer,
        setDiscountAmount,
        setActiveDiscountAuth,
        clearDiscount,
        checkDiscountStatus,
        clearCart,
        hasItem,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
