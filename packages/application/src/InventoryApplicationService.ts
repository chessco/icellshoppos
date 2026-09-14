import type { ProBuyerApiClient } from "@ireader/api-client";
import type {
  InventoryCheckRequest,
  InventoryCheckResponse,
  InventoryOptionsResponse,
  IInventoryListItem,
} from "@ireader/contracts";

export class InventoryApplicationService {
  constructor(private readonly apiClient: ProBuyerApiClient) {}

  async checkDuplicate(req: InventoryCheckRequest): Promise<InventoryCheckResponse> {
    const res = await this.apiClient.checkDuplicate(req);
    return res.data || { exists: false };
  }

  async loadOptions(): Promise<InventoryOptionsResponse | null> {
    const res = await this.apiClient.getInventoryOptions();
    return res.data || null;
  }

  async loadInventory(status?: string): Promise<{ ok: boolean; items: IInventoryListItem[]; error?: string }> {
    const res = await this.apiClient.getInventoryList(status);
    return { ok: res.ok, items: res.data || [], error: res.error };
  }

  async saveItem(data: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
    const res = await this.apiClient.addInventoryItem(data);
    return { ok: res.ok, error: res.error };
  }
}
