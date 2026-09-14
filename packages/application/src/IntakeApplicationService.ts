import { DeviceNormalizationService } from "./DeviceNormalizationService.js";
import { IntakeValidationService } from "./IntakeValidationService.js";
import { PricePreviewService } from "./PricePreviewService.js";
import type { IDiscoveredDevice, PricingRuleEntry } from "@ireader/contracts";

/**
 * Orchestrates intake without becoming a God Object.
 * Delegates to specialized services:
 *  - DeviceNormalizationService
 *  - IntakeValidationService
 *  - PricePreviewService
 */
export class IntakeApplicationService {
  public readonly normalization: DeviceNormalizationService;
  public readonly validation: IntakeValidationService;
  public readonly pricing: PricePreviewService;

  constructor(
    normalization = new DeviceNormalizationService(),
    validation = new IntakeValidationService(),
    pricing = new PricePreviewService()
  ) {
    this.normalization = normalization;
    this.validation = validation;
    this.pricing = pricing;
  }

  processDeviceForIntake(
    device: IDiscoveredDevice,
    availableTypes: Array<{ id: string; name: string }>,
    rules: PricingRuleEntry[]
  ) {
    const rawModel = device.modelName || device.productType || "";
    const deviceTypeId = this.normalization.resolveDeviceType(rawModel, availableTypes);
    const capacity = device.totalCapacity ? this.normalization.normalizeCapacity(device.totalCapacity) : "";
    const imei = device.imei ? this.normalization.normalizeImei(device.imei) : "";
    const serial = device.serialNumber ? this.normalization.normalizeSerialNumber(device.serialNumber) : "";
    const estimatedPrice = this.pricing.estimatePricing(rawModel, capacity, rules);

    return {
      deviceTypeId,
      model: rawModel,
      capacity,
      imei,
      serialNumber: serial,
      color: device.color || "",
      batteryHealth: device.batteryHealth || "",
      cycleCount: device.cycleCount || "",
      iosVersion: device.iosVersion || "",
      carrier: device.carrier || "",
      ...estimatedPrice,
    };
  }
}
