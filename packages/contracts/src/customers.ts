/**
 * iReader Multiplatform Architecture v2.0 - Customer Contracts
 *
 * Canonical domain & API contracts for customer lookup, credit management,
 * and receipt destinations.
 */

export interface ICustomerListItem {
  id: string;
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  customerType?: "retail" | "wholesale" | string;
  defaultPriceTier?: string | null;
  status?: string | null;
  creditEnabled?: boolean | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomerListResponse {
  customers: ICustomerListItem[];
}

export interface CustomerCreatePayload {
  name: string;
  email?: string;
  whatsapp: string;
  customerType?: "retail" | "wholesale";
  defaultPriceTier?: string;
  status?: string;
}

export interface CustomerCreditSummary {
  id: string;
  name: string;
  email?: string | null;
  whatsapp?: string | null;
  balance: number;
  totalOnCredit: number;
  totalPayments: number;
}
