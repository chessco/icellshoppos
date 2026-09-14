/**
 * iReader Multiplatform Architecture v2.0 - Future Device Bridge Capability
 *
 * iPadOS does NOT possess entitlements or private APIs to directly inspect
 * other connected iOS devices over USB/Lockdown (libimobiledevice / usbmuxd).
 *
 * This capability outlines the architecture states for communicating with
 * a companion Device Bridge (e.g. iReader Windows, macOS Companion, or Network Bridge).
 */

export type DeviceBridgeStatus =
  | "SUPPORTED"
  | "UNAVAILABLE"
  | "REQUIRES_BRIDGE"
  | "NOT_PERMITTED"
  | "FUTURE";

export interface IDeviceBridgeCapability {
  getStatus(): DeviceBridgeStatus;
  getBridgeUrl(): string | null;
}

export class MobileDeviceBridgeCapability implements IDeviceBridgeCapability {
  getStatus(): DeviceBridgeStatus {
    // iPad does not perform direct USB lockdown inspection.
    // Device intake with hardware probe is delegated to Windows/Mac Bridge.
    return "REQUIRES_BRIDGE";
  }

  getBridgeUrl(): string | null {
    return null;
  }
}
