/**
 * Apple Driver Installer
 *
 * Guides the user through installing "Apple Mobile Device Support" (the
 * driver Windows needs to recognize a connected iPhone/iPad) when
 * AppleUsbAdapter reports it's missing.
 *
 * Strategy: prefer `winget install Apple.AppleDevices` (the official
 * Microsoft Store package, installs per-user without a UAC prompt and stays
 * updated on its own) over bundling/downloading Apple's raw MSI ourselves,
 * which would carry redistribution and staleness risk. If winget isn't
 * available or the install fails, fall back to opening the Store listing so
 * the user can install it with one click.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { shell } from "electron";

const execFileAsync = promisify(execFile);

const APPLE_DEVICES_WINGET_ID = "Apple.AppleDevices";
const APPLE_DEVICES_STORE_URI = "ms-windows-store://pdp/?productid=9NHTM59JLQ7J";

export type DriverInstallMethod = "winget" | "store-fallback" | "unsupported";

export type DriverInstallResult = {
  success: boolean;
  method: DriverInstallMethod;
  message: string;
};

async function isWingetAvailable(): Promise<boolean> {
  try {
    await execFileAsync("winget", ["--version"], { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function installAppleDrivers(): Promise<DriverInstallResult> {
  if (process.platform !== "win32") {
    return {
      success: false,
      method: "unsupported",
      message: "La instalación automática de drivers solo está disponible en Windows.",
    };
  }

  if (await isWingetAvailable()) {
    try {
      await execFileAsync(
        "winget",
        [
          "install",
          "--id",
          APPLE_DEVICES_WINGET_ID,
          "-e",
          "--source",
          "msstore",
          "--accept-package-agreements",
          "--accept-source-agreements",
          "--silent",
        ],
        { windowsHide: true, timeout: 180000 }
      );

      return {
        success: true,
        method: "winget",
        message: "Apple Devices se instaló correctamente. Desconecta y vuelve a conectar el iPhone.",
      };
    } catch {
      // winget is present but the install failed (offline, blocked policy,
      // package already present in a broken state, etc.) — fall through to
      // the Store fallback below instead of surfacing a raw CLI error.
    }
  }

  await shell.openExternal(APPLE_DEVICES_STORE_URI);
  return {
    success: false,
    method: "store-fallback",
    message:
      "No se pudo instalar en automático. Se abrió la página de “Apple Devices” en Microsoft Store — presiona Instalar ahí y luego reconecta el iPhone.",
  };
}
