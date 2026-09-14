import { useState, useRef, useMemo } from "react";
import type { IDiscoveredDevice, InventoryOptionsResponse } from "@ireader/contracts";
import { IntakeApplicationService } from "@ireader/application";

const intakeService = new IntakeApplicationService();

export interface UseDeviceIntakeProps {
  options: InventoryOptionsResponse | null;
  onStatusChange?: (msg: string) => void;
}

export function useDeviceIntake() {
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const [form, setForm] = useState({
    deviceTypeId: "",
    imei: "",
    serialNumber: "",
    model: "",
    capacity: "",
    color: "",
    batteryHealth: "",
    cycleCount: "",
    iosVersion: "",
    dateOfPurchase: today(),
    siteId: "",
    locationSiteId: "",
    carrier: "",
    condition: "",
    grade: "",
    supplier: "",
    cost: "",
    currency: "MXN",
    price: "",
    price2: "",
    price3: "",
    status: "Available",
    comments: "",
  });

  const [autoFilledFields, setAutoFilledFields] = useState<Record<string, "usb" | "derived">>({});
  const lastKeyRef = useRef<string>("");

  const applyDevice = (dev: IDiscoveredDevice, deviceTypes: Array<{ id: string; name: string }>) => {
    const phoneTypeId = intakeService.normalization.resolveDeviceType(dev.modelName || dev.productType || "", deviceTypes);

    setForm((prev) => ({
      ...prev,
      deviceTypeId: prev.deviceTypeId || phoneTypeId || prev.deviceTypeId,
      imei: dev.imei || prev.imei,
      serialNumber: dev.serialNumber || prev.serialNumber,
      model: dev.modelName || prev.model,
      capacity: dev.totalCapacity || prev.capacity,
      color: dev.color || prev.color,
      batteryHealth: dev.batteryHealth || prev.batteryHealth,
      cycleCount: dev.cycleCount || prev.cycleCount,
      iosVersion: dev.iosVersion || prev.iosVersion,
      carrier: dev.carrier || prev.carrier,
    }));

    setAutoFilledFields((prev) => ({
      ...prev,
      ...(phoneTypeId ? { deviceTypeId: "derived" as const } : {}),
      ...(dev.imei ? { imei: "usb" as const } : {}),
      ...(dev.serialNumber ? { serialNumber: "usb" as const } : {}),
      ...(dev.modelName ? { model: "usb" as const } : {}),
      ...(dev.totalCapacity ? { capacity: "usb" as const } : {}),
      ...(dev.color ? { color: "usb" as const } : {}),
      ...(dev.batteryHealth ? { batteryHealth: "usb" as const } : {}),
      ...(dev.cycleCount ? { cycleCount: "usb" as const } : {}),
      ...(dev.iosVersion ? { iosVersion: "usb" as const } : {}),
      ...(dev.carrier ? { carrier: "usb" as const } : {}),
    }));
  };

  const clearPrefilled = () => {
    setForm((prev) => ({
      ...prev,
      imei: "",
      serialNumber: "",
      model: "",
      capacity: "",
      color: "",
      batteryHealth: "",
      cycleCount: "",
      iosVersion: "",
      carrier: "",
      dateOfPurchase: today(),
    }));
    setAutoFilledFields({});
  };

  return {
    form,
    setForm,
    autoFilledFields,
    setAutoFilledFields,
    applyDevice,
    clearPrefilled,
    lastKeyRef,
    intakeService,
  };
}
