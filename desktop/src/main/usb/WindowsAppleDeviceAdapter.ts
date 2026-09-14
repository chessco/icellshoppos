import type { IDevicePort, IDeviceAdapterStatus } from "../ports/IDevicePort.js";
import { getAdapterStatus } from "./AppleUsbAdapter.js";

/**
 * Windows / Desktop implementation of IDevicePort.
 *
 * Wraps AppleUsbAdapter without altering any of its proven operational logic
 * (AMDS, Lockdown scanning, libimobiledevice, pymobiledevice3).
 */
export class WindowsAppleDeviceAdapter implements IDevicePort {
  async getStatus(): Promise<IDeviceAdapterStatus> {
    const rawStatus = await getAdapterStatus();
    return {
      provider: rawStatus.provider,
      pipelineVersion: rawStatus.pipelineVersion,
      available: rawStatus.available,
      connectionState: rawStatus.connectionState,
      message: rawStatus.message,
      lastCheckedAt: rawStatus.lastCheckedAt,
      devices: rawStatus.devices,
    };
  }
}
