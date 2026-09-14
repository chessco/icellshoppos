import { createContext, useContext, ReactNode, useState, useEffect } from "react";
import type { IDeviceAdapterStatus } from "@ireader/contracts";

interface UsbContextType {
  usbStatus: IDeviceAdapterStatus | null;
  refreshUsbStatus: () => Promise<IDeviceAdapterStatus | null>;
}

const UsbContext = createContext<UsbContextType | null>(null);

export function UsbProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [usbStatus, setUsbStatus] = useState<IDeviceAdapterStatus | null>(null);

  const refreshUsbStatus = async (): Promise<IDeviceAdapterStatus | null> => {
    try {
      const next = await window.desktop.usb.status();
      setUsbStatus(next);
      return next;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!enabled) {
      setUsbStatus(null);
      return;
    }

    let cancelled = false;
    const poll = async () => {
      try {
        const next = await window.desktop.usb.status();
        if (!cancelled) setUsbStatus(next);
      } catch {
        // Handled silently
      }
    };

    void poll();
    const interval = window.setInterval(poll, 3500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled]);

  return (
    <UsbContext.Provider value={{ usbStatus, refreshUsbStatus }}>
      {children}
    </UsbContext.Provider>
  );
}

export function useUsb(): UsbContextType {
  const ctx = useContext(UsbContext);
  if (!ctx) {
    throw new Error("useUsb must be used within a UsbProvider");
  }
  return ctx;
}
