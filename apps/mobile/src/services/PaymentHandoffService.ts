/**
 * Pro Buyer Mobile - Payment Handoff Client Service
 *
 * Client adapter for cross-device payment handoffs (iPad POS <-> iPhone Tap to Pay).
 * Communicates strictly with authoritative backend endpoints.
 */

import {
  IPaymentHandoffInfo,
  ICreateHandoffPayload,
  ICreateHandoffResponse,
  IAcceptHandoffPayload,
  IAcceptHandoffResponse,
  IAvailableTargetDevice,
  PaymentHandoffStatusType,
} from "../../../../packages/contracts/src/payments";

export class PaymentHandoffClient {
  private baseUrl: string;
  private getAuthToken: () => Promise<string | null>;

  constructor(
    baseUrl = "",
    getAuthToken: () => Promise<string | null> = async () => null
  ) {
    this.baseUrl = baseUrl;
    this.getAuthToken = getAuthToken;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.getAuthToken();
    return {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  /**
   * Creates a cross-device payment handoff from iPad to an authorized iPhone
   */
  async createHandoff(payload: ICreateHandoffPayload & { siteId?: string }): Promise<ICreateHandoffResponse> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to create payment handoff.");
    }
    return data;
  }

  /**
   * Queries authoritative status for a handoff
   */
  async getHandoff(handoffId: string): Promise<IPaymentHandoffInfo> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs/${handoffId}`, {
      method: "GET",
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to query handoff status.");
    }
    return data.handoff;
  }

  /**
   * Retrieves pending handoffs assigned to this iPhone or site
   */
  async getPendingHandoffs(params: {
    siteId?: string | null;
    targetDeviceId?: string | null;
  } = {}): Promise<IPaymentHandoffInfo[]> {
    const headers = await this.getHeaders();
    const query = new URLSearchParams();
    if (params.siteId) query.append("siteId", params.siteId);
    if (params.targetDeviceId) query.append("targetDeviceId", params.targetDeviceId);

    const res = await fetch(`${this.baseUrl}/api/payments/handoffs?${query.toString()}`, {
      method: "GET",
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to retrieve pending handoffs.");
    }
    return data.handoffs || [];
  }

  /**
   * Target iPhone accepts the handoff
   */
  async acceptHandoff(
    handoffId: string,
    payload: IAcceptHandoffPayload = {}
  ): Promise<IAcceptHandoffResponse> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs/${handoffId}/accept`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to accept payment handoff.");
    }
    return data;
  }

  /**
   * Target iPhone rejects the handoff before card collection
   */
  async rejectHandoff(
    handoffId: string,
    payload: { targetDeviceId?: string; reason?: string } = {}
  ): Promise<{ ok: boolean; handoff: IPaymentHandoffInfo }> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs/${handoffId}/reject`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to reject handoff.");
    }
    return data;
  }

  /**
   * Cancels a pending handoff from iPad
   */
  async cancelHandoff(
    handoffId: string,
    reason?: string
  ): Promise<{ ok: boolean; handoff: IPaymentHandoffInfo }> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs/${handoffId}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reason }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to cancel handoff.");
    }
    return data;
  }

  /**
   * Updates handoff lifecycle status
   */
  async updateHandoffStatus(
    handoffId: string,
    status: PaymentHandoffStatusType
  ): Promise<{ ok: boolean; handoff: IPaymentHandoffInfo }> {
    const headers = await this.getHeaders();
    const res = await fetch(`${this.baseUrl}/api/payments/handoffs/${handoffId}/status`, {
      method: "POST",
      headers,
      body: JSON.stringify({ status }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to update handoff status.");
    }
    return data;
  }

  /**
   * Queries list of available iPhones for target selection on iPad
   */
  async getAvailableTargetDevices(siteId?: string): Promise<IAvailableTargetDevice[]> {
    const headers = await this.getHeaders();
    const query = siteId ? `?siteId=${encodeURIComponent(siteId)}` : "";
    const res = await fetch(`${this.baseUrl}/api/org/pos-devices/available${query}`, {
      method: "GET",
      headers,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to query available devices.");
    }
    return data.devices || [];
  }

  /**
   * Resilient polling fallback for handoff state updates
   */
  pollHandoffStatus(
    handoffId: string,
    onUpdate: (handoff: IPaymentHandoffInfo) => void,
    intervalMs = 1500,
    maxDurationMs = 180000 // 3 minutes
  ): () => void {
    let active = true;
    const startTime = Date.now();

    const interval = setInterval(async () => {
      if (!active) return;
      if (Date.now() - startTime > maxDurationMs) {
        clearInterval(interval);
        return;
      }

      try {
        const handoff = await this.getHandoff(handoffId);
        if (!active) return;
        onUpdate(handoff);

        // Stop polling on terminal states
        if (
          handoff.status === "SUCCEEDED" ||
          handoff.status === "FAILED" ||
          handoff.status === "CANCELED" ||
          handoff.status === "EXPIRED"
        ) {
          clearInterval(interval);
          active = false;
        }
      } catch (err) {
        // Silently retry on transient network errors
      }
    }, intervalMs);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }
}

export const paymentHandoffClient = new PaymentHandoffClient();
