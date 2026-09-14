"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import AppSidebar from "@/components/AppSidebar";
import { defaultCarrierOptions, fetchCarrierOptions, resolveCarrierOption } from "@/lib/carrier-options";
import { fetchModelCatalog, type ModelCatalog } from "@/lib/modelCatalog";

type IntegrationState = {
  linked: boolean;
  email?: string;
};

type ServiceItem = {
  id: number;
  name: string;
  price?: number;
};

type HistoryItem = {
  id: string;
  serviceId: number;
  imei: string | null;
  imeis: string[] | null;
  orderId: number | null;
  status: string | null;
  charged: number | null;
  balance: number | null;
  response: unknown;
  createdAt: string;
};

type ParsedResultLine = {
  label: string;
  value: string;
  color?: string;
};

type AddDevicePrefill = {
  imei: string;
  model: string;
  capacity: string;
  color: string;
  carrier: string;
  serialNumber: string;
  comments: string;
};

function normalizeComparable(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeWithCatalog(prefill: AddDevicePrefill, catalog: ModelCatalog): AddDevicePrefill {
  const entries = Object.keys(catalog);
  if (entries.length === 0) return prefill;

  const modelComparable = normalizeComparable(prefill.model);
  const directModel = entries.find((key) => normalizeComparable(key) === modelComparable);
  const canonicalModel = directModel || prefill.model;

  const modelEntry = catalog[canonicalModel];
  if (!modelEntry) {
    return {
      ...prefill,
      model: canonicalModel,
    };
  }

  const capacityComparable = normalizeComparable(prefill.capacity);
  const canonicalCapacity =
    modelEntry.capacities.find((value) => normalizeComparable(value) === capacityComparable) || prefill.capacity;

  const colorComparable = normalizeComparable(prefill.color);
  const canonicalColor =
    modelEntry.colors.find((value) => normalizeComparable(value) === colorComparable) || prefill.color;

  return {
    ...prefill,
    model: canonicalModel,
    capacity: canonicalCapacity,
    color: canonicalColor,
  };
}

function parseServices(payload: unknown): ServiceItem[] {
  const source = payload as { services?: unknown; data?: { services?: unknown } };
  const raw = Array.isArray(source?.services)
    ? source.services
    : Array.isArray(source?.data?.services)
      ? source.data.services
      : [];

  return raw
    .map((item) => {
      const value = item as Record<string, unknown>;
      const id = Number(value.service_id ?? value.id ?? 0);
      const name = String(value.service_name ?? value.name ?? "").trim();
      const priceRaw = Number(value.price ?? value.cost);
      return {
        id,
        name,
        price: Number.isFinite(priceRaw) ? priceRaw : undefined,
      };
    })
    .filter((item) => item.id > 0 && item.name.length > 0);
}

function parseBalance(payload: unknown): number | null {
  const value = payload as {
    balance?: unknown;
    available_balance?: unknown;
    account?: { balance?: unknown; available_balance?: unknown };
  };

  const candidates = [
    Number(value?.balance),
    Number(value?.available_balance),
    Number(value?.account?.balance),
    Number(value?.account?.available_balance),
  ];

  for (const candidate of candidates) {
    if (Number.isFinite(candidate)) {
      return candidate;
    }
  }

  return null;
}

function decodeHtmlText(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function parseFormattedResult(payload: unknown): ParsedResultLine[] {
  const source = payload as { results?: Array<{ result?: unknown }> };
  const rawHtml = String(source?.results?.[0]?.result ?? "").trim();
  if (!rawHtml) return [];

  const lines = rawHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .flatMap((line) => {
      const fontMatch = line.match(/<font[^>]*color\s*=\s*["']?([^"'>\s]+)["']?[^>]*>(.*?)<\/font>/i);
      const color = fontMatch?.[1];
      const replacedFont = fontMatch ? line.replace(fontMatch[0], fontMatch[2]) : line;
      const plain = decodeHtmlText(replacedFont.replace(/<[^>]+>/g, "").trim());
      if (!plain) return [];

      const colonIndex = plain.indexOf(":");
      if (colonIndex <= 0) {
        return [{ label: "", value: plain, color } satisfies ParsedResultLine];
      }

      return [{
        label: plain.slice(0, colonIndex).trim(),
        value: plain.slice(colonIndex + 1).trim(),
        color,
      } satisfies ParsedResultLine];
    });
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function extractKeyValueMap(lines: ParsedResultLine[]) {
  const map = new Map<string, string>();
  for (const line of lines) {
    if (!line.label) continue;
    map.set(normalizeLabel(line.label), line.value.trim());
  }
  return map;
}

function extractModelBits(rawModel: string) {
  const trimmed = rawModel.trim();
  const capacityMatch = trimmed.match(/\b(\d{2,4}\s?GB|1\s?TB|2\s?TB)\b/i);
  const capacity = capacityMatch ? capacityMatch[1].replace(/\s+/g, "").toUpperCase() : "";

  let color = "";
  if (capacityMatch) {
    const tail = trimmed.slice((capacityMatch.index ?? 0) + capacityMatch[0].length).trim();
    const colorMatch = tail.match(/^([A-Za-z][A-Za-z\s]{1,24}?)(?=\s*(\[|\(|$))/);
    color = colorMatch ? colorMatch[1].trim() : "";
  }

  let model = trimmed
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\([^\)]*\)/g, "")
    .replace(/\b\d{2,4}\s?GB\b/gi, "")
    .replace(/\b1\s?TB\b/gi, "")
    .replace(/\b2\s?TB\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (color) {
    const escapedColor = color.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    model = model.replace(new RegExp(`\\b${escapedColor}\\b`, "i"), "").replace(/\s+/g, " ").trim();
  }

  return {
    model,
    capacity,
    color,
  };
}

function parseInventoryPrefillFromResponse(
  payload: unknown,
  serviceName: string,
  carrierOptions: readonly string[],
): AddDevicePrefill | null {
  const source = payload as {
    success?: unknown;
    results?: Array<{ imei?: unknown; result?: unknown; object?: unknown }>;
  };

  if (source?.success === false) {
    return null;
  }

  const lines = parseFormattedResult(payload);
  const map = extractKeyValueMap(lines);
  const firstResult = Array.isArray(source?.results) ? source.results[0] : null;
  const firstObject = (firstResult?.object ?? {}) as Record<string, unknown>;

  const imei = String(
    map.get("imei") ||
      map.get("imei number") ||
      firstResult?.imei ||
      firstObject?.imei ||
      "",
  ).trim();

  const serialNumber = String(
    map.get("serial number") ||
      map.get("sn") ||
      firstObject?.serialNumber ||
      "",
  ).trim();

  const modelRaw = String(
    map.get("model") ||
      map.get("model name") ||
      firstObject?.model ||
      "",
  ).trim();

  const carrierRaw = String(
    map.get("sim-lock") ||
      map.get("sim-lock status") ||
      map.get("carrier") ||
      map.get("network") ||
      "",
  ).trim();

  const modelBits = extractModelBits(modelRaw);

  const prefill: AddDevicePrefill = {
    imei,
    model: modelBits.model,
    capacity: modelBits.capacity,
    color: modelBits.color,
    carrier: resolveCarrierOption(carrierRaw, carrierOptions),
    serialNumber,
    comments: `Imported from IMEICHECK2 history (${serviceName})`,
  };

  if (!prefill.imei && !prefill.model && !prefill.serialNumber) {
    return null;
  }

  return prefill;
}

export default function ImeiCheck2Page() {
  const pathname = usePathname();
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({});
  const [carrierOptions, setCarrierOptions] = useState<string[]>([...defaultCarrierOptions]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [integration, setIntegration] = useState<IntegrationState>({ linked: false });
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [imei, setImei] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState("");
  const [requestResponse, setRequestResponse] = useState<unknown>(null);
  const [view, setView] = useState<"request" | "history">("request");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    void (async () => {
      const loadedCatalog = await fetchModelCatalog();
      setModelCatalog(loadedCatalog);
    })();

    fetchCarrierOptions()
      .then((options) => setCarrierOptions(options))
      .catch(() => setCarrierOptions([...defaultCarrierOptions]));
  }, []);

  const load = useCallback(async (isRefresh: boolean) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");
    setWarning("");
    try {
      const integrationRes = await fetch("/api/org/integrations/imeicheck2", { cache: "no-store" });

      const integrationPayload = await integrationRes.json().catch(() => ({}));
      if (!integrationRes.ok) {
        setError(integrationPayload?.error ?? "Failed to load integration status.");
        return;
      }

      const linked = Boolean(integrationPayload?.linked);
      setIntegration({
        linked,
        email: integrationPayload?.email ? String(integrationPayload.email) : undefined,
      });

      if (!linked) {
        setServices([]);
        setBalance(null);
        return;
      }

      const servicesRes = await fetch("/api/org/integrations/imeicheck2/services", { cache: "no-store" });

      const servicesPayload = await servicesRes.json().catch(() => ({}));
      if (!servicesRes.ok) {
        setError(servicesPayload?.error ?? "Failed to load services.");
        return;
      }

      if (servicesPayload?.warning) {
        setWarning(String(servicesPayload.warning));
      }

      const parsedServices = parseServices(servicesPayload);
      setServices(parsedServices);
      setBalance(parseBalance(servicesPayload));
      if (!serviceId && parsedServices.length > 0) {
        setServiceId(String(parsedServices[0].id));
      }
    } catch {
      setError("Failed to load IMEICHECK2 data.");
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [serviceId]);

  useEffect(() => {
    void load(false);
  }, [load]);

  const selectedService = useMemo(
    () => services.find((item) => String(item.id) === serviceId),
    [services, serviceId],
  );

  const serviceNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const service of services) {
      map.set(service.id, service.name);
    }
    return map;
  }, [services]);

  const latestResultLines = useMemo(() => parseFormattedResult(requestResponse), [requestResponse]);

  const openAddToInventoryPopup = useCallback((prefill: AddDevicePrefill) => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams({
      prefill: "1",
      imei: prefill.imei,
      model: prefill.model,
      capacity: prefill.capacity,
      color: prefill.color,
      carrier: prefill.carrier,
      serialNumber: prefill.serialNumber,
      comments: prefill.comments,
    });

    const popup = window.open(
      `/add-device?${params.toString()}`,
      "imeicheck2-add-inventory",
      "popup=yes,width=1500,height=980,resizable=yes,scrollbars=yes",
    );

    if (!popup) {
      setError("Popup blocked. Allow popups and try Add to inventory again.");
      return;
    }

    popup.focus();
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/org/integrations/imeicheck2/history?limit=100", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.error ?? "Failed to load service history.");
        return;
      }

      setHistory(Array.isArray(payload?.history) ? payload.history : []);
    } catch {
      setError("Failed to load service history.");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!integration.linked || view !== "history") return;
    void loadHistory();
  }, [integration.linked, view, loadHistory]);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setStatus("");
    setRequestResponse(null);

    const nextServiceId = Number(serviceId);
    const nextImei = imei.trim();

    if (!Number.isFinite(nextServiceId) || nextServiceId <= 0) {
      setError("Select a valid service.");
      return;
    }

    if (!nextImei) {
      setError("IMEI is required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/org/integrations/imeicheck2/imei-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: nextServiceId,
          imei: nextImei,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      setRequestResponse(payload);

      const semanticSuccess = Boolean(payload?.success) && String(payload?.status ?? "").toLowerCase() !== "failed";

      if (!response.ok || !semanticSuccess) {
        setError(payload?.error ?? "Service request failed.");
        return;
      }

      setStatus("Service request completed.");
      void load(true);
      if (view === "history") {
        void loadHistory();
      }
    } catch {
      setError("Service request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="app-shell">
        <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.92)] px-6 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-2 text-sm font-semibold text-[#1f3563]">
            <span>IMEICHECK2.COM</span>
          </div>
        </nav>
        <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
          <AppSidebar pathname={pathname} />
          <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
            <div className="mx-auto w-full max-w-5xl px-1 text-sm text-[#5f7298]">Loading IMEICHECK2...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <nav className="sticky top-0 z-30 border-b border-[#d6e4ff] bg-[rgba(255,255,255,0.92)] px-6 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-2 text-sm font-semibold text-[#1f3563]">
          <span>IMEICHECK2.COM</span>
        </div>
      </nav>

      <div className="grid w-full md:grid-cols-[190px_minmax(0,1fr)]">
        <AppSidebar pathname={pathname} />
        <main className="flex min-w-0 flex-col gap-6 px-6 py-10">
          <div className="mx-auto w-full max-w-5xl space-y-5">
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold text-[#1f3563]">IMEICHECK2.COM</h1>
              <p className="text-sm text-[#5f7298]">
                {integration.linked
                  ? <>Linked as <span className="font-medium text-[#1f3563]">{integration.email ?? "Unknown"}</span></>
                  : "Integration is not linked yet."}
              </p>
            </header>

            {!integration.linked && (
              <div className="rounded-xl border border-[#d6e4ff] bg-white px-4 py-4 text-sm text-[#1f3563]">
                IMEICHECK2 integration is not linked. Link it first in Data Admin → Integrations.
              </div>
            )}

            {integration.linked && (
              <>

                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-[#d6e4ff] bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Account Balance</p>
                    <p className="mt-2 text-2xl font-semibold text-[#1f3563]">
                      {balance === null ? "Not provided" : `$${balance.toFixed(2)}`}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#d6e4ff] bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#4b6292]">IMEICHECK2</p>
                      <button
                        type="button"
                        onClick={() => void load(true)}
                        disabled={refreshing}
                        className="rounded-full border border-[#bfd4ff] px-3 py-1 text-xs font-semibold text-[#1f3563] disabled:opacity-60"
                      >
                        {refreshing ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    <div className="mt-3 inline-flex rounded-full border border-[#d6e4ff] bg-[#f7fbff] p-1 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setView("request")}
                        className={`rounded-full px-3 py-1 ${view === "request" ? "bg-[#1f3563] text-white" : "text-[#1f3563]"}`}
                      >
                        Request
                      </button>
                      <button
                        type="button"
                        onClick={() => setView("history")}
                        className={`rounded-full px-3 py-1 ${view === "history" ? "bg-[#1f3563] text-white" : "text-[#1f3563]"}`}
                      >
                        History
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-[#1f3563]">{services.length} service(s) available</p>
                  </div>
                </section>

                {view === "request" && (
                <section className="rounded-xl border border-[#d6e4ff] bg-white p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Service Request</h2>
                  <form className="mt-3 grid gap-3" onSubmit={submitRequest}>
                    <label className="grid gap-1 text-sm text-[#3b2a1e]">
                      Service
                      <select
                        value={serviceId}
                        onChange={(event) => setServiceId(event.target.value)}
                        className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      >
                        {services.length === 0 && <option value="">No services available</option>}
                        {services.map((service) => (
                          <option key={service.id} value={String(service.id)}>
                            {service.name}
                            {typeof service.price === "number" ? ` - $${service.price.toFixed(2)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="grid gap-1 text-sm text-[#3b2a1e]">
                      IMEI
                      <input
                        type="text"
                        value={imei}
                        onChange={(event) => setImei(event.target.value)}
                        placeholder="359998765432100"
                        className="rounded-xl border border-[#bfd4ff] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                      />
                    </label>

                    {selectedService && (
                      <p className="text-xs text-[#5f7298]">
                        Selected: <span className="font-medium text-[#1f3563]">{selectedService.name}</span>
                        {typeof selectedService.price === "number" ? ` · $${selectedService.price.toFixed(2)}` : ""}
                      </p>
                    )}

                    <div>
                      <button
                        type="submit"
                        disabled={submitting || services.length === 0}
                        className="rounded-full bg-[#1f1a16] px-5 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
                      >
                        {submitting ? "Requesting..." : "Request Service"}
                      </button>
                    </div>
                  </form>
                </section>
                )}

                {warning && <p className="rounded-xl border border-[#fde68a] bg-[#fff8dd] px-4 py-3 text-sm text-[#92400e]">{warning}</p>}
                {error && <p className="rounded-xl border border-[#ffd3d3] bg-[#fff1f1] px-4 py-3 text-sm text-[#b42318]">{error}</p>}
                {status && <p className="rounded-xl border border-[#b8f0c9] bg-[#ecfff2] px-4 py-3 text-sm text-[#166534]">{status}</p>}

                {view === "request" && (
                <section className="rounded-xl border border-[#d6e4ff] bg-white p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Latest Response</h2>
                  {latestResultLines.length === 0 ? (
                    <p className="mt-3 rounded-lg bg-[#f7fbff] p-3 text-sm text-[#5f7298]">No service request yet.</p>
                  ) : (
                    <div className="mt-3 space-y-2 rounded-lg bg-[#f7fbff] p-3 text-sm text-[#1f3563]">
                      <p className="font-semibold text-[#0f1f3d]">Result:</p>
                      {latestResultLines.map((line, index) => (
                        <p key={`${line.label}-${line.value}-${index}`}>
                          {line.label ? <span className="font-medium text-[#0f1f3d]">{line.label}: </span> : null}
                          <span style={line.color ? { color: line.color } : undefined}>{line.value}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </section>
                )}

                {view === "history" && (
                <section className="rounded-xl border border-[#d6e4ff] bg-white p-4">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#4b6292]">Service History</h2>
                  {historyLoading ? (
                    <p className="mt-3 text-sm text-[#5f7298]">Loading history...</p>
                  ) : history.length === 0 ? (
                    <p className="mt-3 text-sm text-[#5f7298]">No previous responses yet.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {history.map((item) => {
                        const lines = parseFormattedResult(item.response);
                        const serviceName = serviceNameById.get(item.serviceId) ?? `#${item.serviceId}`;
                        const rawPrefill = parseInventoryPrefillFromResponse(item.response, serviceName, carrierOptions);
                        const prefill = rawPrefill ? normalizeWithCatalog(rawPrefill, modelCatalog) : null;
                        return (
                          <article key={item.id} className="rounded-xl border border-[#e3ecff] bg-[#f9fbff] p-3">
                            <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#5f7298]">
                              <span>{new Date(item.createdAt).toLocaleString()}</span>
                              <span>Service: {serviceName}</span>
                              {item.charged !== null && <span>Charged: ${item.charged.toFixed(2)}</span>}
                              {item.balance !== null && <span>Balance: ${item.balance.toFixed(2)}</span>}
                            </div>
                            <div className="mb-2">
                              <button
                                type="button"
                                onClick={() => prefill && openAddToInventoryPopup(prefill)}
                                disabled={!prefill}
                                className="rounded-full bg-[#1f1a16] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Add to inventory
                              </button>
                            </div>
                            {lines.length === 0 ? (
                              <pre className="max-h-[220px] overflow-auto rounded-lg bg-white p-2 text-xs text-[#1f3563]">
                                {JSON.stringify(item.response, null, 2)}
                              </pre>
                            ) : (
                              <div className="space-y-1 text-sm text-[#1f3563]">
                                {lines.map((line, index) => (
                                  <p key={`${item.id}-${line.label}-${line.value}-${index}`}>
                                    {line.label ? <span className="font-medium text-[#0f1f3d]">{line.label}: </span> : null}
                                    <span style={line.color ? { color: line.color } : undefined}>{line.value}</span>
                                  </p>
                                ))}
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
