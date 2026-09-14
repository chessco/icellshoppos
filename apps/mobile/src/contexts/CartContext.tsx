import React, { createContext, useContext, useState, useMemo } from "react";
import type { IInventoryListItem } from "@ireader/contracts";

export interface CartItem {
  inventoryItem: IInventoryListItem;
  salePrice: number;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: IInventoryListItem) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  subtotal: number;
  totalPreview: number;
  hasItem: (itemId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = (item: IInventoryListItem) => {
    setItems((prev) => {
      if (prev.some((p) => p.inventoryItem.id === item.id)) {
        return prev;
      }
      const priceNum = typeof item.price === "number" ? item.price : parseFloat(String(item.price || 0)) || 0;
      return [...prev, { inventoryItem: item, salePrice: priceNum }];
    });
  };

  const removeItem = (itemId: string) => {
    setItems((prev) => prev.filter((i) => i.inventoryItem.id !== itemId));
  };

  const clearCart = () => setItems([]);

  const hasItem = (itemId: string) => items.some((i) => i.inventoryItem.id === itemId);

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + item.salePrice, 0);
  }, [items]);

  const totalPreview = subtotal;

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        clearCart,
        subtotal,
        totalPreview,
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
