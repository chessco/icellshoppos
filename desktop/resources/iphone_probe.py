import argparse
import asyncio
import inspect
import json
import sys

try:
    from pymobiledevice3.exceptions import NoDeviceConnectedError
except ImportError:
    NoDeviceConnectedError = Exception

try:
    from pymobiledevice3.exceptions import NotPairedError
except ImportError:
    NotPairedError = RuntimeError

try:
    from pymobiledevice3.lockdown import create_using_usbmux
except ImportError:
    create_using_usbmux = None

try:
    from pymobiledevice3.services.diagnostics import DiagnosticsService
except ImportError:
    DiagnosticsService = None

try:
    from pymobiledevice3.irecv_devices import IRECV_DEVICES
except ImportError:
    IRECV_DEVICES = ()

PRODUCT_TYPE_TO_NAME = {
    device.product_type: device.display_name
    for device in IRECV_DEVICES
    if getattr(device, "product_type", None) and getattr(device, "display_name", None)
}

COMMON_MARKET_CAPACITIES_GB = [16, 32, 64, 128, 256, 512, 1024, 2048]

# Curated MCC/MNC mapping used when the device only exposes PLMN identifiers.
# This can be expanded over time as new operator codes are observed.
MCC_MNC_CARRIER_MAP = {
    ("310", "260"): "T-Mobile US",
    ("310", "410"): "AT&T",
    ("311", "480"): "Verizon Wireless",
    ("311", "490"): "Verizon Wireless",
    ("311", "270"): "Verizon Wireless",
    ("310", "120"): "Sprint",
    ("311", "870"): "Boost Mobile",
}

# Fallback palette by model identifier. This is intentionally approximate: it
# communicates valid colors for the model when a specific unit color is not
# exposed by the connected iPhone.
MODEL_COLOR_OPTIONS = {
    "iPhone14,2": ["Silver", "Graphite", "Gold", "Sierra Blue"],
    "iPhone14,3": ["Silver", "Graphite", "Gold", "Sierra Blue"],
    "iPhone18,1": ["Silver", "Cosmic Orange", "Deep Blue"],
    "iPhone18,2": ["Silver", "Cosmic Orange", "Deep Blue"],
}


def maybe_await(value):
    if inspect.isawaitable(value):
        return await_value(value)
    return value


async def await_value(value):
    return await value


async def make_lockdown_client():
    if create_using_usbmux is not None:
        return await maybe_await(create_using_usbmux(autopair=True))
    raise RuntimeError("pymobiledevice3 create_using_usbmux is unavailable")


async def close_lockdown_client(lockdown):
    if lockdown is None:
        return
    close_method = getattr(lockdown, "close", None)
    if close_method is None:
        return
    try:
        await maybe_await(close_method())
    except Exception:
        pass


async def get_lockdown_value(lockdown, domain=None, key=None):
    getter = getattr(lockdown, "get_value", None)
    if getter is None:
        return None
    kwargs = {}
    if domain is not None:
        kwargs["domain"] = domain
    if key is not None:
        kwargs["key"] = key
    return await maybe_await(getter(**kwargs))


async def get_all_values(lockdown):
    all_values = getattr(lockdown, "all_values", None)
    if isinstance(all_values, dict) and all_values:
        return all_values
    values = await get_lockdown_value(lockdown)
    return values if isinstance(values, dict) else {}


def get_nested_value(data, *keys):
    if isinstance(data, dict):
        for key in keys:
            value = data.get(key)
            if value not in (None, ""):
                return value
        for value in data.values():
            nested_value = get_nested_value(value, *keys)
            if nested_value not in (None, ""):
                return nested_value
    if isinstance(data, list):
        for item in data:
            nested_value = get_nested_value(item, *keys)
            if nested_value not in (None, ""):
                return nested_value
    return None


def to_percent_text(value):
    if value in (None, "", "N/A", "Unknown"):
        return "N/A" if value in (None, "", "N/A") else "Unknown"
    text = str(value).strip()
    return text if text.endswith("%") else f"{text}%"


def normalize_battery_health_percent(value):
    if value in (None, "", "N/A", "Unknown"):
        return "N/A" if value in (None, "", "N/A") else "Unknown"

    try:
        numeric = float(str(value).replace("%", "").strip())
    except (TypeError, ValueError):
        return to_percent_text(value)

    if numeric < 0:
        numeric = 0
    if numeric > 100:
        numeric = 100

    return f"{int(round(numeric))}%"


def format_storage_capacity(value):
    if value in (None, "", "N/A"):
        return "N/A"
    try:
        size = float(value)
    except (TypeError, ValueError):
        return str(value)

    units = ["B", "KB", "MB", "GB", "TB"]
    unit_index = 0
    while size >= 1024 and unit_index < len(units) - 1:
        size /= 1024
        unit_index += 1
    return f"{size:.2f} {units[unit_index]}"


def normalize_to_market_capacity(raw_capacity_bytes):
    if raw_capacity_bytes in (None, "", "N/A"):
        return "N/A"

    try:
        gb_decimal = float(raw_capacity_bytes) / 1_000_000_000
    except (TypeError, ValueError):
        return "N/A"

    best = min(COMMON_MARKET_CAPACITIES_GB, key=lambda value: abs(value - gb_decimal))
    return f"{best} GB"


def build_part_number(values):
    model_number = str(values.get("ModelNumber") or "").strip().upper()
    region_info = str(values.get("RegionInfo") or "").strip().upper()

    if model_number and region_info:
        if model_number.endswith(region_info):
            return model_number
        return f"{model_number}{region_info}"

    return model_number or "N/A"


def normalize_part_number(part_number):
    if part_number in (None, "", "N/A"):
        return ""

    normalized = str(part_number).strip().upper().replace(" ", "")
    if len(normalized) > 1 and normalized[0] in {"M", "N", "F", "P"}:
        normalized = normalized[1:]
    return normalized


def get_variant_details(values):
    part_number = build_part_number(values)
    normalized_part_number = normalize_part_number(part_number)
    variant = {}

    region = str(values.get("RegionInfo") or "").strip().upper()
    imei2 = values.get("InternationalMobileEquipmentIdentity2")
    has_esim_hint = bool(values.get("EID") or values.get("EUICCChipID"))

    sim_type = variant.get("sim_type")
    if not sim_type:
        if has_esim_hint:
            sim_type = "eSIM"
        elif imei2 not in (None, ""):
            sim_type = "Dual SIM"
        else:
            sim_type = "Unknown"

    return {
        "part_number": part_number,
        "capacity": variant.get("capacity", "N/A"),
        "color": variant.get("color", "N/A"),
        "sim_type": sim_type,
        "sales_region": region or "N/A",
        "marketing_name": variant.get("model_name", "N/A"),
        "normalized_part_number": normalized_part_number,
    }


def build_model_name_code(values):
    model_number = str(values.get("ModelNumber") or "").strip().upper()
    region_info = str(values.get("RegionInfo") or "").strip().upper()
    if model_number and region_info:
        return f"{model_number} {region_info}"
    if model_number:
        return model_number
    return "N/A"


def get_model_name(values):
    product_type = values.get("ProductType")
    for candidate in (
        PRODUCT_TYPE_TO_NAME.get(product_type),
        values.get("DeviceName"),
        values.get("ProductType"),
        values.get("HardwareModel"),
        values.get("ProductName"),
    ):
        if candidate and str(candidate).strip() and str(candidate) != "iPhone OS":
            return str(candidate)
    return "N/A"


def get_color(values, variant_details):
    preferred_candidate = None
    numeric_code = None
    for candidate in (
        variant_details.get("color"),
        values.get("DeviceColor"),
        values.get("HousingColor"),
        values.get("EnclosureColor"),
    ):
        if candidate in (None, "", "N/A"):
            continue
        text = str(candidate).strip()
        if not text:
            continue
        if text.isdigit():
            numeric_code = int(text)
            continue
        preferred_candidate = text
        break

    if preferred_candidate:
        return preferred_candidate

    product_type = str(values.get("ProductType") or "").strip()
    fallback_colors = MODEL_COLOR_OPTIONS.get(product_type)
    if numeric_code is not None and fallback_colors:
        color_index = numeric_code - 1
        if 0 <= color_index < len(fallback_colors):
            return fallback_colors[color_index]

    if fallback_colors:
        return "Possible: " + ", ".join(fallback_colors)

    return "N/A"


def get_carrier(values):
    for key in ("CarrierName", "SIMCarrierNetworkName", "ServiceProviderName", "OperatorName"):
        direct_carrier = values.get(key)
        if direct_carrier not in (None, "", "N/A"):
            return str(direct_carrier).strip()

    bundle_info = values.get("CarrierBundleInfoArray")
    if isinstance(bundle_info, list):
        for entry in bundle_info:
            if not isinstance(entry, dict):
                continue
            for key in ("CarrierName", "CFBundleDisplayName", "CFBundleName", "CarrierBundleName"):
                candidate = entry.get(key)
                if candidate not in (None, "", "N/A"):
                    return str(candidate).strip()

    mcc = values.get("MobileSubscriberCountryCode") or values.get("MCC")
    mnc = values.get("MobileSubscriberNetworkCode") or values.get("MNC")
    if mcc not in (None, "") and mnc not in (None, ""):
        mcc_text = str(mcc).strip()
        mnc_text = str(mnc).strip().zfill(3)
        mapped_carrier = MCC_MNC_CARRIER_MAP.get((mcc_text, mnc_text))
        if mapped_carrier:
            return mapped_carrier
        mapped_carrier = MCC_MNC_CARRIER_MAP.get((mcc_text, str(mnc).strip()))
        if mapped_carrier:
            return mapped_carrier
        return f"MCC {mcc} / MNC {mnc}"

    if mcc not in (None, ""):
        return f"MCC {mcc}"

    return "N/A"


def get_sim_lock_status(values):
    status_code_map = {
        "kctsimsupportsimstatusready": "Unlocked (SIM Ready)",
        "kctsimsupportsimstatusnotinserted": "No SIM",
        "kctsimsupportsimstatuspinlocked": "Locked (PIN)",
        "kctsimsupportsimstatuspuklocked": "Locked (PUK)",
        "kctsimsupportsimstatusnetworklocked": "Locked (Network)",
        "kctsimsupportsimstatusrestricted": "Locked (Restricted)",
    }

    for key in ("CarrierLock", "SIMStatus", "SimStatus", "SIMStatusCode"):
        raw_value = values.get(key)
        if raw_value in (None, ""):
            continue

        text = str(raw_value).strip()
        lowered = text.lower()
        if lowered in status_code_map:
            return status_code_map[lowered]
        if "unlock" in lowered:
            return "Unlocked"
        if "lock" in lowered:
            return "Locked"
        if "no sim" in lowered or "absent" in lowered:
            return "No SIM"
        return text

    return "Unknown"


async def get_available_capacity(lockdown):
    try:
        disk_usage = await get_lockdown_value(lockdown, domain="com.apple.disk_usage")
        if isinstance(disk_usage, dict):
            available = get_nested_value(
                disk_usage,
                "AmountDataAvailable",
                "TotalDataAvailable",
                "DataAvailable",
            )
            if available not in (None, ""):
                return format_storage_capacity(available)
    except Exception:
        pass
    return "N/A"


async def get_total_disk_capacity(lockdown, values):
    for candidate in (
        values.get("TotalDiskCapacity"),
        values.get("TotalDataCapacity"),
    ):
        if candidate not in (None, ""):
            return normalize_to_market_capacity(candidate)

    try:
        disk_usage = await get_lockdown_value(lockdown, domain="com.apple.disk_usage")
        if isinstance(disk_usage, dict):
            value = get_nested_value(disk_usage, "TotalDiskCapacity", "TotalDataCapacity")
            if value not in (None, ""):
                return normalize_to_market_capacity(value)
    except Exception:
        pass

    return "N/A"


async def get_battery_metrics(lockdown, values):
    metrics = {"cycle_count": "N/A", "battery_health": "N/A", "battery_status": "N/A"}

    try:
        direct_health = get_nested_value(values, "MaximumCapacityPercent", "BatteryHealth")
        if direct_health not in (None, ""):
            metrics["battery_health"] = normalize_battery_health_percent(direct_health)

        battery_data = await get_lockdown_value(lockdown, domain="com.apple.mobile.battery")
        if isinstance(battery_data, dict):
            cycle_count = get_nested_value(battery_data, "CycleCount", "BatteryCycleCount")
            battery_health = get_nested_value(battery_data, "MaximumCapacityPercent", "BatteryHealth")
            if cycle_count not in (None, ""):
                metrics["cycle_count"] = str(cycle_count)
            if battery_health not in (None, ""):
                metrics["battery_health"] = normalize_battery_health_percent(battery_health)

        diagnostics = DiagnosticsService(lockdown) if DiagnosticsService is not None else None
        if diagnostics is not None:
            diagnostics_result = await maybe_await(diagnostics.get_battery())
            if isinstance(diagnostics_result, dict):
                is_charging = get_nested_value(diagnostics_result, "IsCharging", "BatteryIsCharging")
                is_fully_charged = get_nested_value(diagnostics_result, "FullyCharged", "BatteryIsFullyCharged")
                current_capacity = get_nested_value(diagnostics_result, "CurrentCapacity", "BatteryCurrentCapacity")

                status_prefix = "Charging" if is_charging else "Full" if is_fully_charged else "Not Charging"
                if current_capacity not in (None, ""):
                    try:
                        capacity_value = int(float(current_capacity))
                        if 0 <= capacity_value <= 100:
                            metrics["battery_status"] = f"{status_prefix} ({capacity_value}%)"
                        else:
                            metrics["battery_status"] = status_prefix
                    except (TypeError, ValueError):
                        metrics["battery_status"] = status_prefix
                else:
                    metrics["battery_status"] = status_prefix

                if metrics["cycle_count"] == "N/A":
                    cycle_count = get_nested_value(diagnostics_result, "CycleCount", "BatteryCycleCount", "BatteryCycleCnt")
                    if cycle_count not in (None, ""):
                        metrics["cycle_count"] = str(cycle_count)

                if metrics["battery_health"] == "N/A":
                    battery_health = get_nested_value(diagnostics_result, "MaximumCapacityPercent", "BatteryHealth")
                    if battery_health not in (None, ""):
                        metrics["battery_health"] = normalize_battery_health_percent(battery_health)

                if metrics["battery_health"] == "N/A":
                    nominal_capacity = get_nested_value(diagnostics_result, "NominalChargeCapacity", "AppleRawMaxCapacity")
                    design_capacity = get_nested_value(diagnostics_result, "DesignCapacity", "OriginalDesignCapacity")
                    if nominal_capacity not in (None, "") and design_capacity not in (None, ""):
                        try:
                            health_percent = (float(nominal_capacity) / float(design_capacity)) * 100
                            if health_percent > 0:
                                metrics["battery_health"] = normalize_battery_health_percent(health_percent)
                        except (TypeError, ValueError, ZeroDivisionError):
                            pass
    except (BrokenPipeError, NoDeviceConnectedError, NotPairedError, OSError, RuntimeError):
        metrics["cycle_count"] = "Unknown"
        metrics["battery_health"] = "Unknown"
        metrics["battery_status"] = "Unknown"
    except Exception:
        metrics["cycle_count"] = "Unknown"
        metrics["battery_health"] = "Unknown"
        metrics["battery_status"] = "Unknown"

    return metrics


async def scan_device_snapshot_async():
    lockdown = None
    try:
        lockdown = await make_lockdown_client()
        values = await get_all_values(lockdown)
        battery_metrics = await get_battery_metrics(lockdown, values)
        variant_details = get_variant_details(values)
        model_name = get_model_name(values)
        model_identifier = str(values.get("ProductType") or "N/A")
        ios_version = values.get("ProductVersion") or "N/A"
        available_capacity = await get_available_capacity(lockdown)
        total_capacity = await get_total_disk_capacity(lockdown, values)
        color = get_color(values, variant_details)
        carrier = get_carrier(values)
        sim_lock_status = get_sim_lock_status(values)
        imei1 = str(values.get("InternationalMobileEquipmentIdentity") or values.get("IMEI") or "N/A")
        imei2 = str(values.get("InternationalMobileEquipmentIdentity2") or "N/A")

        battery_life_cycles = f"{battery_metrics['battery_health']} | {battery_metrics['cycle_count']}"
        device_title = " ".join(part for part in [variant_details.get("marketing_name"), variant_details.get("color"), variant_details.get("capacity")] if part and part != "N/A") or model_name

        return {
            "connected": True,
            "status_text": "Connected",
            "device_title": device_title,
            "model_name": build_model_name_code(values),
            "model_identifier": model_identifier,
            "sales_region": variant_details.get("sales_region", "N/A"),
            "serial_number": str(values.get("SerialNumber") or "N/A"),
            "imei1": imei1,
            "imei2": imei2,
            "ios_version": str(ios_version),
            "activation": str(values.get("ActivationState") or "N/A"),
            "jailbreak": "Unknown",
            "id_lock": "Not exposed over USB",
            "icloud": "Not exposed over USB",
            "crash_logs": "Unknown",
            "battery_status": battery_metrics["battery_status"],
            "carrier": carrier,
            "sim_status": sim_lock_status,
            "color": color,
            "screen_status": "Not exposed over USB",
            "front_camera": "Not exposed over USB",
            "rear_camera": "Not exposed over USB",
            "battery_life_cycles": battery_life_cycles,
            "hard_disk_available_capacity": available_capacity,
            "total_disk_capacity": total_capacity,
            "crash_log_entries": [],
            "crash_log_total_files": 0,
            "error_message": "",
        }
    except (BrokenPipeError, NoDeviceConnectedError):
        return {"connected": False, "status_text": "Disconnected", "error_message": "No device found"}
    except NotPairedError:
        return {
            "connected": True,
            "status_text": "Connected (Untrusted)",
            "device_title": "Apple iPhone",
            "model_name": "N/A",
            "model_identifier": "N/A",
            "sales_region": "N/A",
            "serial_number": "N/A",
            "imei1": "N/A",
            "imei2": "N/A",
            "ios_version": "N/A",
            "activation": "N/A",
            "jailbreak": "Unknown",
            "id_lock": "Not exposed over USB",
            "icloud": "Not exposed over USB",
            "crash_logs": "Unknown",
            "battery_status": "Unknown",
            "carrier": "N/A",
            "sim_status": "Unknown",
            "color": "N/A",
            "screen_status": "Not exposed over USB",
            "front_camera": "Not exposed over USB",
            "rear_camera": "Not exposed over USB",
            "battery_life_cycles": "Unknown | Unknown",
            "hard_disk_available_capacity": "N/A",
            "total_disk_capacity": "N/A",
            "crash_log_entries": [],
            "crash_log_total_files": 0,
            "error_message": "Device not trusted. Unlock iPhone and tap Trust, then reconnect USB.",
        }
    except Exception as error:
        message = str(error) or error.__class__.__name__
        if "No device found" in message or "not connected" in message.lower():
            message = "No device found"
        return {"connected": False, "status_text": "Disconnected", "error_message": message}
    finally:
        await close_lockdown_client(lockdown)


def scan_device_snapshot():
    return asyncio.run(scan_device_snapshot_async())


def run_cli():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--json-snapshot", action="store_true", help="Print a single device snapshot as JSON and exit")
    args = parser.parse_args()

    if args.json_snapshot:
        snapshot = scan_device_snapshot()
        sys.stdout.write(json.dumps(snapshot, ensure_ascii=False))
        sys.stdout.write("\n")
        return 0

    import customtkinter as ctk

    ctk.set_appearance_mode("dark")
    ctk.set_default_color_theme("dark-blue")
    app = IReaderApp()
    app.mainloop()
    return 0


# The existing CustomTkinter UI follows below this point.
# The CLI probe path above is intentionally self-contained so the desktop app
# can call it without depending on the temporary workspace copy.


if __name__ == "__main__":
    raise SystemExit(run_cli())
