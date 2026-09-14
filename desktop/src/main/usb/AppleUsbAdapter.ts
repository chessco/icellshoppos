/**
 * Apple USB Adapter
 *
 * Reads Apple device data over USB using the platform's native Apple tooling:
 *   - Windows: Apple Mobile Device Support (installed with iTunes)
 *             + iTunes lockdown directory scan (paired device UDIDs)
 *             + PowerShell/WMI all-class VID_05AC enumeration
 *             + idevice_id / ideviceinfo from libimobiledevice for full data
 *   - macOS:  Apple Mobile Device stack is built-in;
 *             idevice_id / ideviceinfo used when available
 *
 * All public methods are async and never throw; errors are captured into the
 * returned status object so the UI always gets a meaningful message.
 */

import { execFile, exec } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
// bplist-parser has no @types package — declare inline
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BplistParser = { parseBuffer: (buf: Buffer) => any[] };
// eslint-disable-next-line @typescript-eslint/no-var-requires
const bplist: BplistParser = require("bplist-parser");

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const PATH_DELIMITER = process.platform === "win32" ? ";" : ":";

function getPlatformToolDirName(): string {
  if (process.platform === "win32") return "win";
  if (process.platform === "darwin") return "mac";
  return "linux";
}

function getBinaryName(tool: string): string {
  if (process.platform === "win32" && !tool.endsWith(".exe")) {
    return `${tool}.exe`;
  }
  return tool;
}

function getToolchainCandidateDirs(): string[] {
  const platformDir = getPlatformToolDirName();
  const fromEnv = process.env.LIBIMOBILEDEVICE_DIR;

  const candidates = [
    fromEnv,
    process.resourcesPath ? join(process.resourcesPath, "libimobiledevice", platformDir) : undefined,
    process.resourcesPath ? join(process.resourcesPath, "libimobiledevice") : undefined,
    join(process.cwd(), "desktop", "resources", "libimobiledevice", platformDir),
    join(process.cwd(), "desktop", "resources", "libimobiledevice"),
    join(process.cwd(), "resources", "libimobiledevice", platformDir),
    join(process.cwd(), "resources", "libimobiledevice"),
    join(__dirname, "../../resources/libimobiledevice", platformDir),
    join(__dirname, "../../resources/libimobiledevice"),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return Array.from(new Set(candidates.filter((dir) => existsSync(dir))));
}

function resolveToolPath(tool: string): string {
  const binaryName = getBinaryName(tool);
  for (const dir of getToolchainCandidateDirs()) {
    const candidate = join(dir, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return binaryName;
}

function withToolEnv(executablePath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (executablePath.includes("/") || executablePath.includes("\\")) {
    const toolDir = dirname(executablePath);
    env.PATH = `${toolDir}${PATH_DELIMITER}${env.PATH ?? ""}`;
  }
  return env;
}

async function runToolFile(tool: string, args: string[], timeout: number): Promise<{ stdout: string; stderr: string }> {
  const executable = resolveToolPath(tool);
  return execFileAsync(executable, args, {
    windowsHide: true,
    timeout,
    env: withToolEnv(executable),
  });
}

function getPythonProbeScriptPath(): string | undefined {
  const candidates = [
    process.env.IREADER_PYTHON_PROBE,
    process.resourcesPath ? join(process.resourcesPath, "iphone_probe.py") : undefined,
    join(process.cwd(), "desktop", "resources", "iphone_probe.py"),
    join(process.cwd(), "resources", "iphone_probe.py"),
    join(__dirname, "../../../../resources/iphone_probe.py"),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return undefined;
}

type PythonExecutableCandidate = {
  command: string;
  args: string[];
};

function getPythonExecutableCandidates(): PythonExecutableCandidate[] {
  const configuredExecutable = process.env.IREADER_PYTHON_EXECUTABLE?.trim();
  const windowsCandidates: PythonExecutableCandidate[] = [
    ...(configuredExecutable ? [{ command: configuredExecutable, args: [] }] : []),
    { command: "py", args: ["-3.14"] },
    { command: "py", args: ["-3"] },
    { command: "python", args: [] },
    { command: "python3", args: [] },
    { command: "C:\\Python314\\python.exe", args: [] },
    { command: "C:\\Python313\\python.exe", args: [] },
    { command: "C:\\Python312\\python.exe", args: [] },
  ];

  const unixCandidates: PythonExecutableCandidate[] = [
    ...(configuredExecutable ? [{ command: configuredExecutable, args: [] }] : []),
    { command: "python3", args: [] },
    { command: "python", args: [] },
  ];

  const candidates = process.platform === "win32" ? windowsCandidates : unixCandidates;
  return Array.from(new Map(candidates.map((candidate) => [
    `${candidate.command}\u0000${candidate.args.join("\u0000")}`,
    candidate,
  ])).values());
}

function parsePythonBatteryLifeCycles(value?: string): { batteryHealth?: string; cycleCount?: string } {
  if (!value) return {};
  const match = value.match(/^(.*?)\s*\|\s*(.*)$/);
  if (!match) return {};

  const batteryHealth = match[1]?.trim();
  const cycleCount = match[2]?.trim();
  return {
    batteryHealth: batteryHealth && batteryHealth !== "N/A" ? batteryHealth : undefined,
    cycleCount: cycleCount && cycleCount !== "N/A" ? cycleCount : undefined,
  };
}

type PythonProbeSnapshot = {
  connected?: boolean;
  status_text?: string;
  device_title?: string;
  model_name?: string;
  model_identifier?: string;
  sales_region?: string;
  serial_number?: string;
  imei1?: string;
  imei2?: string;
  ios_version?: string;
  battery_status?: string;
  carrier?: string;
  sim_status?: string;
  color?: string;
  battery_life_cycles?: string;
  hard_disk_available_capacity?: string;
  total_disk_capacity?: string;
  error_message?: string;
};

async function probeDeviceViaPython(): Promise<AppleDevice[] | null> {
  if (process.platform !== "win32") return null;

  const scriptPath = getPythonProbeScriptPath();
  if (!scriptPath) return null;

  for (const pythonExecutable of getPythonExecutableCandidates()) {
    try {
      const { stdout } = await execFileAsync(pythonExecutable.command, [...pythonExecutable.args, scriptPath, "--json-snapshot"], {
        windowsHide: true,
        timeout: 45000,
      });

      const parsed = JSON.parse(stdout.trim()) as PythonProbeSnapshot;
      if (!parsed.connected) {
        return [];
      }

      const batteryParts = parsePythonBatteryLifeCycles(parsed.battery_life_cycles);
      return [
        {
          udid: `python:${parsed.serial_number || parsed.imei1 || parsed.model_identifier || "device"}`,
          productType: parsed.model_identifier,
          modelName: parsed.device_title || parsed.model_name || parsed.model_identifier,
          serialNumber: parsed.serial_number,
          imei: parsed.imei1,
          imei2: parsed.imei2,
          iosVersion: parsed.ios_version,
          batteryHealth: batteryParts.batteryHealth,
          cycleCount: batteryParts.cycleCount,
          totalCapacity: parsed.total_disk_capacity || parsed.hard_disk_available_capacity,
          carrier: parsed.carrier,
          simStatus: parsed.sim_status,
          color: parsed.color,
          source: parsed.serial_number || parsed.imei1 ? "full" : "partial",
        },
      ];
    } catch {
      // Try the next Python executable.
    }
  }

  return null;
}

// ─── Public types ────────────────────────────────────────────────────────────

export type DeviceSourceConfidence = "full" | "partial" | "id-only" | "unknown";

export type UsbConnectionState =
  | "disconnected"
  | "connected_unpaired"
  | "connected_paired_locked"
  | "connected_paired_unlocked"
  | "recovery_or_dfu"
  | "stale_or_error";

export type AdapterDiagnosticEvent = {
  provider: "amds" | "python" | "toolchain" | "pnp" | "lockdown" | "pipeline";
  stage: string;
  elapsedMs: number;
  ok: boolean;
  code?: string;
  detail?: string;
  at: string;
};

export type AppleDevice = {
  udid: string;
  productType?: string;      // e.g. "iPhone16,1"
  modelName?: string;        // friendly name e.g. "iPhone 15 Pro"
  serialNumber?: string;
  imei?: string;
  imei2?: string;
  meid?: string;
  iosVersion?: string;
  batteryHealth?: string;    // percentage string e.g. "87%"
  cycleCount?: string;
  totalCapacity?: string;    // storage e.g. "256GB"
  color?: string;
  carrier?: string;
  simStatus?: string;
  mlbSerial?: string;
  source: DeviceSourceConfidence;
};

export type AdapterProviderStatus = {
  provider: "apple-mobiledevice";
  pipelineVersion: "v1" | "v2";
  available: boolean;
  connectionState: UsbConnectionState;
  message: string;
  lastCheckedAt: string;
  pythonProbePresent: boolean;
  toolchainPresent: boolean;
  appleMdsInstalled: boolean;
  devices: AppleDevice[];
  diagnostics: AdapterDiagnosticEvent[];
};

function isUsbPipelineV2Enabled(): boolean {
  return process.env.USB_PIPELINE_V2 === "1";
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "UNKNOWN";
  const maybeCode = (error as { code?: unknown }).code;
  if (typeof maybeCode === "string" && maybeCode.length > 0) return maybeCode;
  return "UNKNOWN";
}

async function runStage<T>(
  provider: AdapterDiagnosticEvent["provider"],
  stage: string,
  fn: () => Promise<T>
): Promise<{ value: T | undefined; event: AdapterDiagnosticEvent }> {
  const startedAt = Date.now();
  try {
    const value = await fn();
    return {
      value,
      event: {
        provider,
        stage,
        elapsedMs: Date.now() - startedAt,
        ok: true,
        at: new Date().toISOString(),
      },
    };
  } catch (error: unknown) {
    return {
      value: undefined,
      event: {
        provider,
        stage,
        elapsedMs: Date.now() - startedAt,
        ok: false,
        code: getErrorCode(error),
        detail: error instanceof Error ? error.message : "Unexpected error",
        at: new Date().toISOString(),
      },
    };
  }
}

// ─── AMDS detection (Windows registry) ─────────────────────────────────────

async function checkAmdsWindows(): Promise<boolean> {
  if (process.platform !== "win32") return true;

  const candidates = [
    `HKLM\\SOFTWARE\\Apple Inc.\\Apple Mobile Device Support`,
    `HKLM\\SOFTWARE\\WOW6432Node\\Apple Inc.\\Apple Mobile Device Support`,
    `HKLM\\SYSTEM\\CurrentControlSet\\Services\\Apple Mobile Device Service`,
  ];

  for (const key of candidates) {
    try {
      const { stdout } = await execAsync(`reg query "${key}" 2>nul`, { windowsHide: true, timeout: 5000 });
      if (stdout.trim().length > 0) return true;
    } catch {
      // not found – try next key
    }
  }

  return false;
}

// ─── libimobiledevice toolchain ──────────────────────────────────────────────

async function probeIdeviceId(): Promise<boolean> {
  try {
    await runToolFile("idevice_id", ["--version"], 3000);
    return true;
  } catch {
    return false;
  }
}

async function listUdidsViaToolchain(): Promise<string[]> {
  try {
    const { stdout } = await runToolFile("idevice_id", ["-l"], 8000);
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}


// ─── Windows: is any Apple USB device physically present? ────────────────────
// Uses a simple reg query on the USB device tree — avoids PowerShell quoting
// issues entirely and is fast (< 1 s). VID_05AC is Apple's USB vendor ID.

async function isAnyAppleUsbPresent(): Promise<boolean> {
  if (process.platform !== "win32") return true;

  try {
    // Apple device PIDs vary by model and mode. Matching the vendor ID is
    // broader and still constrained to present, healthy devices.
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "(Get-PnpDevice -PresentOnly -Status OK | Where-Object { $_.InstanceId -match 'VID_05AC' -or $_.FriendlyName -match 'Apple|iPhone|iPad|iPod' }).Count"`,
      { windowsHide: true, timeout: 10000 }
    );
    const count = parseInt(stdout.trim(), 10);
    return !isNaN(count) && count > 0;
  } catch {
    return false;
  }
}

async function listConnectedAppleUdidCandidates(): Promise<string[]> {
  if (process.platform !== "win32") return [];

  try {
    const { stdout } = await execAsync(
      `powershell -NoProfile -NonInteractive -Command "Get-PnpDevice -PresentOnly -Status OK | Where-Object { $_.InstanceId -match 'VID_05AC' -or $_.FriendlyName -match 'Apple|iPhone|iPad|iPod' } | Select-Object -ExpandProperty InstanceId"`,
      { windowsHide: true, timeout: 10000 }
    );

    const ids = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const udidCandidates = new Set<string>();
    for (const id of ids) {
      // Example: USB\VID_05AC&PID_12A8\0000815000111C513A03401C
      const segments = id.split("\\");
      const tail = segments[segments.length - 1] ?? "";
      if (/^[0-9A-Fa-f]{24,40}$/.test(tail)) {
        udidCandidates.add(tail.toUpperCase());
      }
    }

    return Array.from(udidCandidates);
  } catch {
    return [];
  }
}

// ─── iTunes lockdown directory ────────────────────────────────────────────────
// iTunes refreshes {UDID}.plist the moment a trusted device connects.
// We sort by mtime descending and return UDIDs whose plist was touched within
// the last N minutes — those are the currently connected devices.

const LOCKDOWN_DIRS = [
  "C:\\ProgramData\\Apple\\Lockdown",
  "C:\\ProgramData\\Apple Computer\\Lockdown",
];

function getRecentLockdownUdids(withinMinutes = 30): Array<{ udid: string; plistPath: string }> {
  if (process.platform !== "win32") return [];

  const cutoff = Date.now() - withinMinutes * 60 * 1000;

  for (const dir of LOCKDOWN_DIRS) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir)
        .filter((f) => f.endsWith(".plist"))
        .map((f) => {
          const udid = f.replace(/\.plist$/i, "").trim();
          if (udid.length < 20) return null;
          try {
            const plistPath = join(dir, f);
            const { mtimeMs } = statSync(plistPath);
            return { udid, mtimeMs, plistPath };
          } catch {
            return null;
          }
        })
        .filter((x): x is { udid: string; mtimeMs: number; plistPath: string } => x !== null)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

      const recent = entries.filter((e) => e.mtimeMs >= cutoff);
      if (recent.length > 0) return recent;
      return [];
    } catch {
      // permission denied
    }
  }
  return [];
}

function normalizeUdidForCompare(value: string): string {
  return value.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

function hasLockdownRecordForUdid(udid: string): boolean {
  if (process.platform !== "win32") return false;
  const normalized = normalizeUdidForCompare(udid);

  for (const dir of LOCKDOWN_DIRS) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir)
        .filter((f) => f.endsWith(".plist"))
        .map((f) => normalizeUdidForCompare(f.replace(/\.plist$/i, "").trim()));
      if (entries.includes(normalized)) {
        return true;
      }
    } catch {
      // ignore and continue checking other lockdown paths
    }
  }

  return false;
}

function findLockdownPlistPathForUdid(udid: string): string | undefined {
  if (process.platform !== "win32") return undefined;
  const normalized = normalizeUdidForCompare(udid);

  for (const dir of LOCKDOWN_DIRS) {
    if (!existsSync(dir)) continue;
    try {
      const entries = readdirSync(dir).filter((f) => f.endsWith(".plist"));
      for (const entry of entries) {
        const entryUdid = normalizeUdidForCompare(entry.replace(/\.plist$/i, "").trim());
        if (entryUdid === normalized) {
          return join(dir, entry);
        }
      }
    } catch {
      // ignore and continue checking other lockdown paths
    }
  }

  return undefined;
}

// ─── Parse lockdown plist for device details ──────────────────────────────────
// iTunes writes a full device record to the lockdown plist when the device
// connects. We can read serial number, model, iOS version, IMEI, capacity,
// color, carrier, etc. directly — no libimobiledevice required.

function parseLockdownPlist(plistPath: string): Partial<AppleDevice> {
  try {
    const buf = readFileSync(plistPath);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let record: Record<string, any> = {};

    if (buf.slice(0, 6).toString() === "bplist") {
      // Binary plist
      const parsed = bplist.parseBuffer(buf);
      if (Array.isArray(parsed) && parsed.length > 0) record = parsed[0] as Record<string, unknown>;
    } else {
      // XML plist — extract key-value pairs with simple regex (no full XML parser needed)
      const xml = buf.toString("utf8");
      const pairs = [...xml.matchAll(/<key>([^<]+)<\/key>\s*<(?:string|integer|real)>([^<]*)<\/(?:string|integer|real)>/g)];
      for (const [, key, val] of pairs) record[key] = val;
    }

    const result: Partial<AppleDevice> = {};
    if (record.SerialNumber)           result.serialNumber  = String(record.SerialNumber);
    if (record.ProductType)            result.productType   = String(record.ProductType);
    if (record.ProductVersion)         result.iosVersion    = String(record.ProductVersion);
    if (record.InternationalMobileEquipmentIdentity)
                                       result.imei          = String(record.InternationalMobileEquipmentIdentity);
    if (record.InternationalMobileEquipmentIdentity2)
                                       result.imei2         = String(record.InternationalMobileEquipmentIdentity2);
    if (record.MobileEquipmentIdentifier)
                                       result.meid          = String(record.MobileEquipmentIdentifier);
    if (record.DeviceColor)            result.color         = String(record.DeviceColor);
    if (record.MLBSerialNumber)        result.mlbSerial     = String(record.MLBSerialNumber);

    // Capacity: plist stores bytes as number
    const cap = record.TotalDiskCapacity ?? record.TotalDataCapacity;
    if (cap) result.totalCapacity = normalizeCapacity(String(cap));

    if (result.productType) result.modelName = resolveModelName(result.productType);

    return result;
  } catch {
    return {};
  }
}

// ─── Full device info via ideviceinfo ────────────────────────────────────────

const DEVICE_INFO_KEYS: Array<[keyof AppleDevice, string]> = [
  ["productType",   "ProductType"],
  ["serialNumber",  "SerialNumber"],
  ["imei",          "InternationalMobileEquipmentIdentity"],
  ["imei2",         "InternationalMobileEquipmentIdentity2"],
  ["meid",          "MobileEquipmentIdentifier"],
  ["iosVersion",    "ProductVersion"],
  ["cycleCount",    "BatteryCycleCount"],
  ["totalCapacity", "TotalDiskCapacity"],
  ["color",         "DeviceColor"],
  ["carrier",       "CarrierName"],
  ["simStatus",     "SIMStatus"],
  ["mlbSerial",     "MLBSerialNumber"],
];

async function getDeviceKey(udid: string, iosKey: string): Promise<string | undefined> {
  try {
    const { stdout } = await runToolFile("ideviceinfo", ["-u", udid, "-k", iosKey], 4000);
    const val = stdout.trim();
    return val.length > 0 ? val : undefined;
  } catch {
    return undefined;
  }
}

async function getBatteryHealth(udid: string): Promise<string | undefined> {
  try {
    const { stdout } = await runToolFile("idevicediagnostics", ["-u", udid, "diagnostics", "IOPowerSources"], 5000);
    const match = stdout.match(/"CurrentCapacity"\s*=\s*(\d+)/i);
    if (match) return `${match[1]}%`;
    return undefined;
  } catch {
    return undefined;
  }
}

const PRODUCT_TYPE_TO_NAME: Record<string, string> = {
  "iPhone17,1": "iPhone 16 Pro Max", "iPhone17,2": "iPhone 16 Pro",
  "iPhone17,3": "iPhone 16 Plus", "iPhone17,4": "iPhone 16",
  "iPhone16,1": "iPhone 15 Pro Max", "iPhone16,2": "iPhone 15 Pro",
  "iPhone16,3": "iPhone 15 Plus", "iPhone16,4": "iPhone 15",
  "iPhone15,2": "iPhone 14 Pro Max", "iPhone15,3": "iPhone 14 Pro",
  "iPhone14,7": "iPhone 14 Plus", "iPhone14,8": "iPhone 14",
  "iPhone14,2": "iPhone 13 Pro Max", "iPhone14,3": "iPhone 13 Pro",
  "iPhone14,4": "iPhone 13 mini", "iPhone14,5": "iPhone 13",
  "iPhone13,1": "iPhone 12 mini", "iPhone13,2": "iPhone 12",
  "iPhone13,3": "iPhone 12 Pro", "iPhone13,4": "iPhone 12 Pro Max",
  "iPhone12,1": "iPhone 11", "iPhone12,3": "iPhone 11 Pro",
  "iPhone12,5": "iPhone 11 Pro Max", "iPhone11,2": "iPhone XS",
  "iPhone11,4": "iPhone XS Max", "iPhone11,6": "iPhone XS Max",
  "iPhone11,8": "iPhone XR", "iPhone10,1": "iPhone 8",
  "iPhone10,4": "iPhone 8", "iPhone10,2": "iPhone 8 Plus",
  "iPhone10,5": "iPhone 8 Plus", "iPhone10,3": "iPhone X",
  "iPhone10,6": "iPhone X",
};

function resolveModelName(productType?: string): string | undefined {
  if (!productType) return undefined;
  return PRODUCT_TYPE_TO_NAME[productType] ?? productType;
}

function normalizeCapacity(bytes?: string): string | undefined {
  if (!bytes) return undefined;
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return bytes;
  const gb = n / 1024 / 1024 / 1024;
  const rounded = [16, 32, 64, 128, 256, 512, 1024].reduce((prev, curr) =>
    Math.abs(curr - gb) < Math.abs(prev - gb) ? curr : prev
  );
  return `${rounded}GB`;
}

async function readFullDeviceInfo(udid: string): Promise<AppleDevice> {
  const device: AppleDevice = { udid, source: "partial" };

  const keyFetches = DEVICE_INFO_KEYS.map(async ([prop, iosKey]) => {
    const val = await getDeviceKey(udid, iosKey);
    if (val) {
      (device as Record<string, unknown>)[prop] = val;
    }
  });

  await Promise.allSettled([
    ...keyFetches,
    getBatteryHealth(udid).then((val) => { if (val) device.batteryHealth = val; }),
  ]);

  device.modelName = resolveModelName(device.productType);
  device.totalCapacity = normalizeCapacity(device.totalCapacity);

  if (device.imei || device.serialNumber) {
    device.source = "full";
  } else if (device.productType) {
    device.source = "partial";
  } else {
    device.source = "id-only";
  }

  return device;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function getAdapterStatus(): Promise<AdapterProviderStatus> {
  const checkedAt = new Date().toISOString();
  const pipelineVersion: "v1" | "v2" = isUsbPipelineV2Enabled() ? "v2" : "v1";
  const diagnostics: AdapterDiagnosticEvent[] = [];
  const pythonProbeScriptPresent = Boolean(getPythonProbeScriptPath());

  const pythonResult = await runStage("python", "probe-pymobiledevice3", probeDeviceViaPython);
  diagnostics.push(pythonResult.event);

  const pythonProbeDevices = pythonResult.value ?? null;
  if (pythonProbeDevices) {
    const totalDetected = pythonProbeDevices.length;

    diagnostics.push({
      provider: "pipeline",
      stage: "finalize-status",
      elapsedMs: 0,
      ok: true,
      detail: `state=${totalDetected > 0 ? "connected_paired_unlocked" : "disconnected"};devices=${totalDetected};python=true`,
      at: new Date().toISOString(),
    });

    return {
      provider: "apple-mobiledevice",
      pipelineVersion,
      available: totalDetected > 0,
      connectionState: totalDetected > 0 ? "connected_paired_unlocked" : "disconnected",
      message: totalDetected > 0
        ? `${totalDetected} Apple device(s) connected. Data read via pymobiledevice3.`
        : "Python probe ready. No Apple devices connected.",
      lastCheckedAt: checkedAt,
      pythonProbePresent: true,
      toolchainPresent: false,
      appleMdsInstalled: false,
      devices: pythonProbeDevices,
      diagnostics,
    };
  }

  const [amdsResult, toolchainProbe] = await Promise.all([
    runStage("amds", "check-installed", checkAmdsWindows),
    runStage("toolchain", "probe-idevice-id", probeIdeviceId),
  ]);
  diagnostics.push(amdsResult.event, toolchainProbe.event);

  const appleMdsInstalled = amdsResult.value ?? false;
  const toolchainPresent = toolchainProbe.value ?? false;

  // ── Step 1: try libimobiledevice toolchain (authoritative connected list) ─
  let toolchainUdids: string[] = [];
  if (toolchainPresent) {
    const listResult = await runStage("toolchain", "list-udids", listUdidsViaToolchain);
    diagnostics.push(listResult.event);
    toolchainUdids = listResult.value ?? [];
  }

  // ── Step 2 (Windows, no toolchain): reg-query USB tree + lockdown mtime ──
  // reg query finds VID_05AC keys in the USB device tree (works even when
  // the device enumerates as WPD/portable in Explorer, not as "USB").
  // The lockdown plist mtime tells us which paired UDID is currently active.
  let fallbackDevices: AppleDevice[] = [];
  let usbPresent = false;
  let pnpUdids: string[] = [];
  let recentLockdownCount = 0;
  let lockdownMatchForConnected = false;

  if (!toolchainPresent && process.platform === "win32") {
    const [usbPresentResult, lockdownResult, pnpResult] = await Promise.all([
      runStage("pnp", "check-live-presence", isAnyAppleUsbPresent),
      runStage("lockdown", "list-recent-udids", async () => getRecentLockdownUdids(30)),
      runStage("pnp", "list-instanceid-udid-candidates", listConnectedAppleUdidCandidates),
    ]);
    diagnostics.push(usbPresentResult.event, lockdownResult.event, pnpResult.event);

    usbPresent = usbPresentResult.value ?? false;
    const recentEntries = lockdownResult.value ?? [];
    recentLockdownCount = recentEntries.length;
    pnpUdids = pnpResult.value ?? [];
    lockdownMatchForConnected = pnpUdids.some((udid) => hasLockdownRecordForUdid(udid));

    if (usbPresent) {
      const byUdid = new Map<string, { udid: string; plistPath?: string }>();
      for (const entry of recentEntries) {
        byUdid.set(entry.udid.toUpperCase(), { udid: entry.udid.toUpperCase(), plistPath: entry.plistPath });
      }
      for (const udid of pnpUdids) {
        if (!byUdid.has(udid)) {
          byUdid.set(udid, { udid, plistPath: findLockdownPlistPathForUdid(udid) });
        } else if (!byUdid.get(udid)?.plistPath) {
          byUdid.set(udid, { udid, plistPath: findLockdownPlistPathForUdid(udid) });
        }
      }

      const merged = Array.from(byUdid.values());

      fallbackDevices = merged.map(({ udid, plistPath }) => {
        const plistData = plistPath ? parseLockdownPlist(plistPath) : {};
        const hasFullData = Boolean(plistData.imei || plistData.serialNumber);
        return {
          udid,
          source: hasFullData ? ("partial" as const) : ("id-only" as const),
          modelName: plistData.modelName ?? "Apple iPhone",
          ...plistData,
        };
      });
    }
  }

  // Build final device list
  const fromToolchain = await Promise.all(toolchainUdids.map((udid) => readFullDeviceInfo(udid)));
  const byUdid = new Map<string, AppleDevice>();
  for (const d of fromToolchain) byUdid.set(d.udid, d);
  for (const d of fallbackDevices) if (!byUdid.has(d.udid)) byUdid.set(d.udid, d);
  const devices: AppleDevice[] = Array.from(byUdid.values());

  const totalDetected = devices.length;
  const hasTrustedMetadata = devices.some((d) => Boolean(d.imei || d.serialNumber || d.productType));
  const hasPairingEvidence = recentLockdownCount > 0 || lockdownMatchForConnected;

  let connectionState: UsbConnectionState = "disconnected";
  if (process.platform === "win32" && !toolchainPresent) {
    if (totalDetected > 0 && hasPairingEvidence) {
      // Without toolchain we cannot reliably detect lock state; treat paired devices
      // as unlocked to avoid false "locked" labels in the UI.
      connectionState = "connected_paired_unlocked";
    } else if (totalDetected > 0 && hasTrustedMetadata) {
      connectionState = "connected_paired_unlocked";
    } else if (totalDetected > 0) {
      connectionState = "connected_unpaired";
    } else if (usbPresent || pnpUdids.length > 0) {
      connectionState = "connected_unpaired";
    }
  } else if (toolchainPresent) {
    if (totalDetected > 0 && hasTrustedMetadata) {
      connectionState = "connected_paired_unlocked";
    } else if (totalDetected > 0) {
      connectionState = "connected_paired_locked";
    }
  }

  if (diagnostics.some((event) => !event.ok) && totalDetected === 0 && connectionState === "disconnected") {
    connectionState = "stale_or_error";
  }

  // ── Status message ────────────────────────────────────────────────────────
  let message: string;
  const pythonProbeFailureDetail = !pythonResult.event.ok ? pythonResult.event.detail || pythonResult.event.code : "";
  if (!appleMdsInstalled && !toolchainPresent) {
    message =
      "Apple Mobile Device Support not detected. Install iTunes or Apple Devices from the Microsoft Store, then reconnect.";
  } else if (totalDetected === 0 && appleMdsInstalled && !toolchainPresent) {
    message =
      "AMDS installed but no device detected. Make sure the iPhone is unlocked, plugged in, and you tapped \u201cTrust\u201d. " +
      "For full field extraction install libimobiledevice (idevice_id, ideviceinfo).";
  } else if (totalDetected === 0 && toolchainPresent) {
    message = "Toolchain ready. No Apple devices connected. Plug in an iPhone/iPad via USB.";
  } else if (totalDetected > 0 && !toolchainPresent) {
    const hasRealData = devices.some((d) => d.imei || d.serialNumber);
    message = hasRealData
      ? `${totalDetected} Apple device(s) connected. Serial and model read from AMDS. Install libimobiledevice for battery and carrier data.`
      : `${totalDetected} Apple device(s) connected. Install libimobiledevice for IMEI, battery, and carrier data.`;
    if (pythonProbeFailureDetail) {
      message = `${message} Python probe failed: ${pythonProbeFailureDetail}.`;
    }
  } else if (totalDetected > 0) {
    message = `${totalDetected} Apple device(s) detected via USB.`;
  } else {
    message = "Checking USB adapter...";
  }

  if (pipelineVersion === "v2") {
    message = `[usbPipelineV2] ${message}`;
  }

  diagnostics.push({
    provider: "pipeline",
    stage: "finalize-status",
    elapsedMs: 0,
    ok: true,
    detail: `state=${connectionState};devices=${totalDetected};toolchain=${toolchainPresent}`,
    at: new Date().toISOString(),
  });

  return {
    provider: "apple-mobiledevice",
    pipelineVersion,
    available: appleMdsInstalled || toolchainPresent,
    connectionState,
    message,
    lastCheckedAt: checkedAt,
    pythonProbePresent: pythonProbeScriptPresent,
    toolchainPresent,
    appleMdsInstalled,
    devices,
    diagnostics,
  };
}
