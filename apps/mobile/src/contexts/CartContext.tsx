import React, { createContext, useContext, useState, useMemo } from "react";
import type { IInventoryListItem } from "@ireader/contracts";

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
  subtotal: number;
  totalPreview: number;
  addItem: (item: IInventoryListItem, customPrice?: number) => void;
  removeItem: (itemId: string) => void;
  updateItemPrice: (itemId: string, newPrice: number) => void;
  setCustomer: (customer: CustomerInfo | null) => void;
  setDiscountAmount: (discount: number) => void;
  clearCart: () => void;
  hasItem: (itemId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerInfo | null>(null);
  const [discountAmount, setDiscountAmountState] = useState<number>(0);

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

  const clearCart = () => {
    setItems([]);
    setSelectedCustomer(null);
    setDiscountAmountState(0);
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
        subtotal,
        totalPreview,
        addItem,
        removeItem,
        updateItemPrice,
        setCustomer,
        setDiscountAmount,
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
