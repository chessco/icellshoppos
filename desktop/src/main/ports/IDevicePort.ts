/**
 * iReader Multiplatform Architecture v2.0 - Core Device Port
 *
 * Platform-independent port definition for hardware inspection,
 * device identity, and diagnostics.
 *
 * Adheres to ADR-007 (Capability-based platform adapters).
 */

export type DeviceSourceConfidence = "full" | "partial" | "id-only" | "unknown";

export type UsbConnectionState =
  | "disconnected"
  | "connected_unpaired"
  | "connected_paired_locked"
  | "connected_paired_unlocked"
  | "recovery_or_dfu"
  | "stale_or_error";

export interface IDeviceIdentity {
  udid: string;
  productType?: string;
  modelName?: string;
  serialNumber?: string;
  imei?: string;
  imei2?: string;
  meid?: string;
  iosVersion?: string;
  totalCapacity?: string;
  color?: string;
  carrier?: string;
  simStatus?: string;
  mlbSerial?: string;
}

export interface IDeviceDiagnostics {
  batteryHealth?: string;
  cycleCount?: string;
}

export interface IDiscoveredDevice extends IDeviceIdentity, IDeviceDiagnostics {
  source: DeviceSourceConfidence;
}

export interface IDeviceAdapterStatus {
  provider: string;
  pipelineVersion: "v1" | "v2";
  available: boolean;
  connectionState: UsbConnectionState;
  message: string;
  lastCheckedAt: string;
  devices: IDiscoveredDevice[];
}

export interface IDevicePort {
  /** Inspects and returns current device connectivity and diagnostics */
  getStatus(): Promise<IDeviceAdapterStatus>;
}
