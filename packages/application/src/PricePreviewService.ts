import type { PricingRuleEntry } from "@ireader/contracts";

/**
 * Client-side price estimation / UX preview service.
 *
 * IMPORTANT (Rule 3): Final pricing, taxes, and discounts are determined
 * with full authority by the Pro Buyer API on the backend. This service
 * only powers responsive UI autofill and operator guidance.
 */
export class PricePreviewService {
  formatMoney(value: string | number): string {
    const digits = String(value ?? "").replace(/\D/g, "");
    if (!digits) return "";
    const parsed = Number(digits);
    if (!Number.isFinite(parsed)) return "";
    return `$${parsed.toLocaleString("en-US")}`;
  }

  estimatePricing(model: string, capacity: string, rules: PricingRuleEntry[]): { price?: string; price2?: string; price3?: string } {
    if (!model || rules.length === 0) return {};
    const normModel = model.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const normCap = capacity.trim().toUpperCase().replace(/\s+/g, "");

    const scored = rules
      .map((r) => {
        const rModel = r.model.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        const rCap = r.capacity.trim().toUpperCase().replace(/\s+/g, "");
        let score = 0;
        if (rModel === normModel) score += 4;
        else if (normModel.includes(rModel) || rModel.includes(normModel)) score += 2;
        if (normCap && rCap === normCap) score += 3;
        return { r, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    const best = scored[0]?.r;
    if (!best) return {};

    return {
      price: this.formatMoney(best.price),
      price2: this.formatMoney(best.price2 || best.price),
      price3: this.formatMoney(best.price3 || best.price),
    };
  }
}
