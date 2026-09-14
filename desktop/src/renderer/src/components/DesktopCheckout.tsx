import { useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

type CheckoutPaymentMethod = "Cash" | "Transfer" | "Card" | "Trade-in" | "Other" | "Credit";
type PriceTier = "Price" | "Price 2" | "Price 3";

type CheckoutCartItem = {
  id: string;
  identifier: string;
  model: string;
  capacity: string;
  color: string;
  costPesos: number;
  salePrice: number;
};

const PAYMENT_METHODS: CheckoutPaymentMethod[] = ["Cash", "Transfer", "Card", "Trade-in", "Other", "Credit"];

const parseMoney = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const moneyInputDigits = (value: string | number | null | undefined) =>
  String(value ?? "").replace(/\D/g, "");

const formatMoneyInput = (value: string | number | null | undefined) => {
  const digits = moneyInputDigits(value);
  if (!digits) return "";
  return `$${Number(digits).toLocaleString("en-US")}`;
};

const money = (value: number) => `$${Math.round(value).toLocaleString("en-US")}`;

const normalizeImei = (value: string | null | undefined) => (value ?? "").trim().replace(/\D/g, "");

const getItemIdentifier = (item: DesktopInventoryListItem) => item.imei || item.serialNumber || item.id;

const getTierPrice = (item: DesktopInventoryListItem, tier: PriceTier) => {
  if (tier === "Price 2") return parseMoney(item.price2) || parseMoney(item.price);
  if (tier === "Price 3") return parseMoney(item.price3) || parseMoney(item.price);
  return parseMoney(item.price);
};

const buildSaleId = () => `S-${Date.now()}`;

const buildInitialPaymentAmounts = () =>
  Object.fromEntries(PAYMENT_METHODS.map((method) => [method, ""])) as Record<CheckoutPaymentMethod, string>;

const buildPaymentSummary = (
  methods: CheckoutPaymentMethod[],
  amounts: Record<CheckoutPaymentMethod, string>
) => {
  const entries = methods
    .map((method) => ({ method, value: parseMoney(amounts[method]) }))
    .filter((entry) => entry.value > 0);

  if (entries.length === 0) return "";
  if (entries.length === 1) return entries[0].method;
  return entries.map((entry) => `${entry.method}: ${money(entry.value)}`).join(" | ");
};

export function DesktopCheckout({ baseUrl, signedIn }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [inventory, setInventory] = useState<DesktopInventoryListItem[]>([]);
  const [customers, setCustomers] = useState<DesktopCheckoutCustomer[]>([]);

  const [search, setSearch] = useState("");
  const [imeiBatchInput, setImeiBatchInput] = useState("");

  const [cart, setCart] = useState<CheckoutCartItem[]>([]);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerWhatsappCountryCode, setCustomerWhatsappCountryCode] = useState("+52");
  const [customerWhatsappNumber, setCustomerWhatsappNumber] = useState("");
  const [sendReceiptEmail, setSendReceiptEmail] = useState(true);
  const [notes, setNotes] = useState("");

  const [paymentAmounts, setPaymentAmounts] = useState<Record<CheckoutPaymentMethod, string>>(
    buildInitialPaymentAmounts
  );

  const activeCustomers = useMemo(
    () => customers.filter((customer) => (customer.status || "Active") === "Active"),
    [customers]
  );

  const selectedCustomer = useMemo(() => {
    const normalizedName = customerName.trim().toLowerCase();
    if (!normalizedName) return null;
    return (
      activeCustomers.find((customer) => customer.name.trim().toLowerCase() === normalizedName) ?? null
    );
  }, [activeCustomers, customerName]);

  const selectedTier: PriceTier =
    selectedCustomer?.defaultPriceTier === "Price 2" || selectedCustomer?.defaultPriceTier === "Price 3"
      ? selectedCustomer.defaultPriceTier
      : "Price";

  const availablePaymentMethods = useMemo(
    () =>
      selectedCustomer?.creditEnabled
        ? PAYMENT_METHODS
        : PAYMENT_METHODS.filter((method) => method !== "Credit"),
    [selectedCustomer?.creditEnabled]
  );

  const cartItemIds = useMemo(() => new Set(cart.map((item) => item.id)), [cart]);

  const availableRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((item) => (item.status || "").toLowerCase() === "available")
      .filter((item) => !cartItemIds.has(item.id))
      .filter((item) => {
        if (!q) return true;
        return [item.imei, item.serialNumber, item.model, item.capacity, item.color]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .slice(0, 100);
  }, [cartItemIds, inventory, search]);

  const totals = useMemo(() => {
    const cost = cart.reduce((sum, item) => sum + item.costPesos, 0);
    const sale = cart.reduce((sum, item) => sum + item.salePrice, 0);
    return { cost, sale, margin: sale - cost };
  }, [cart]);

  const paidTotal = useMemo(
    () => availablePaymentMethods.reduce((sum, method) => sum + parseMoney(paymentAmounts[method]), 0),
    [availablePaymentMethods, paymentAmounts]
  );

  const remaining = totals.sale - paidTotal;
  const hasPaymentCoverage = totals.sale <= 0 || Math.abs(remaining) <= 0.01;

  const paymentSummaryLabel = useMemo(
    () => buildPaymentSummary(availablePaymentMethods, paymentAmounts),
    [availablePaymentMethods, paymentAmounts]
  );

  const fullCustomerWhatsapp = useMemo(() => {
    const digits = customerWhatsappNumber.replace(/\D/g, "").slice(0, 10);
    return digits.length === 10 ? `${customerWhatsappCountryCode}${digits}` : "";
  }, [customerWhatsappCountryCode, customerWhatsappNumber]);

  const loadCheckoutData = async () => {
    if (!signedIn) {
      setError("Sign in to use Checkout.");
      setInventory([]);
      setCustomers([]);
      return;
    }

    setBusy(true);
    setError("");
    try {
      const payload = await window.desktop.checkout.data({ baseUrl });
      setInventory(payload.inventoryItems ?? []);
      setCustomers(payload.customers ?? []);
      setStatus("");
    } catch (loadError: unknown) {
      setInventory([]);
      setCustomers([]);
      setError(loadError instanceof Error ? loadError.message : "Failed to load checkout data.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadCheckoutData();
  }, [baseUrl, signedIn]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setCustomerEmail(selectedCustomer.email ?? "");

    const normalized = String(selectedCustomer.whatsapp ?? "").trim();
    if (!normalized) {
      setCustomerWhatsappCountryCode("+52");
      setCustomerWhatsappNumber("");
      return;
    }

    const withPlus = normalized.startsWith("+") ? normalized : `+${normalized}`;
    const country = withPlus.startsWith("+1") ? "+1" : withPlus.startsWith("+52") ? "+52" : "+52";
    setCustomerWhatsappCountryCode(country);
    setCustomerWhatsappNumber(withPlus.replace(/^\+\d{1,3}/, "").replace(/\D/g, "").slice(0, 10));
  }, [selectedCustomer]);

  useEffect(() => {
    if (selectedCustomer?.creditEnabled) return;
    setPaymentAmounts((current) =>
      current.Credit
        ? {
            ...current,
            Credit: "",
          }
        : current
    );
  }, [selectedCustomer?.creditEnabled]);

  const addToCart = (item: DesktopInventoryListItem) => {
    if (cartItemIds.has(item.id)) return;

    setCart((current) => [
      ...current,
      {
        id: item.id,
        identifier: getItemIdentifier(item),
        model: item.model,
        capacity: item.capacity,
        color: item.color,
        costPesos: parseMoney(item.costPesos),
        salePrice: getTierPrice(item, selectedTier),
      },
    ]);
  };

  const handleSearchEnterAdd = () => {
    const raw = search.trim();
    if (!raw) return;

    const normalized = normalizeImei(raw);
    const lowered = raw.toLowerCase();
    const exactMatches = availableRows.filter((item) => {
      if (normalized && normalizeImei(item.imei) === normalized) return true;
      if (item.serialNumber && item.serialNumber.trim().toLowerCase() === lowered) return true;
      return getItemIdentifier(item).trim().toLowerCase() === lowered;
    });

    if (exactMatches.length === 0) {
      setStatus(`${raw} not available in inventory.`);
      return;
    }

    if (exactMatches.length > 1) {
      setStatus(`Multiple devices match ${raw}. Refine your search.`);
      return;
    }

    const item = exactMatches[0];
    addToCart(item);
    setStatus(`Added ${getItemIdentifier(item)} to cart.`);
    setSearch("");
  };

  const handleBatchAdd = () => {
    const lines = imeiBatchInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      setStatus("Paste at least one IMEI (one per line).");
      return;
    }

    let added = 0;
    let missing = 0;
    let duplicates = 0;

    for (const line of lines) {
      const normalized = normalizeImei(line);
      if (!normalized) {
        missing += 1;
        continue;
      }

      const row = inventory.find((item) => {
        if ((item.status || "").toLowerCase() !== "available") return false;
        if (normalizeImei(item.imei) === normalized) return true;
        if (item.serialNumber && item.serialNumber.trim().toLowerCase() === line.trim().toLowerCase()) return true;
        return false;
      });

      if (!row) {
        missing += 1;
        continue;
      }

      if (cartItemIds.has(row.id)) {
        duplicates += 1;
        continue;
      }

      addToCart(row);
      added += 1;
    }

    setStatus(`Batch add complete. Added: ${added}, Missing: ${missing}, Duplicates: ${duplicates}.`);
    setImeiBatchInput("");
  };

  const updateCartPrice = (id: string, value: string) => {
    const parsed = Number(moneyInputDigits(value) || "0");
    setCart((current) =>
      current.map((item) => (item.id === id ? { ...item, salePrice: parsed } : item))
    );
  };

  const removeFromCart = (id: string) => {
    setCart((current) => current.filter((item) => item.id !== id));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) {
      setStatus("Add at least one device to cart.");
      return;
    }

    if (!customerName.trim()) {
      setStatus("Customer name is required.");
      return;
    }

    if (!fullCustomerWhatsapp) {
      setStatus("Customer WhatsApp is required with country code and 10-digit number.");
      return;
    }

    if (!paymentSummaryLabel || !hasPaymentCoverage) {
      setStatus("Payment amounts must fully cover the total sale amount.");
      return;
    }

    const payload = {
      saleId: buildSaleId(),
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim().toLowerCase() || undefined,
      customerWhatsapp: fullCustomerWhatsapp,
      sendReceiptEmail,
      paymentMethod: paymentSummaryLabel,
      paymentBreakdown: Object.fromEntries(
        PAYMENT_METHODS
          .map((method) => [method, parseMoney(paymentAmounts[method])] as const)
          .filter(([, value]) => value > 0)
      ),
      notes: notes.trim() || undefined,
      items: cart.map((item) => ({
        inventoryItemId: item.id,
        imei: item.identifier,
        salePrice: Math.round(item.salePrice),
      })),
    };

    setBusy(true);
    try {
      const response = await window.desktop.checkout.completeSale({
        baseUrl,
        data: payload,
      });

      setStatus(`Sale completed successfully: ${response.saleId ?? payload.saleId}.`);
      setCart([]);
      setNotes("");
      setCustomerName("");
      setCustomerEmail("");
      setCustomerWhatsappCountryCode("+52");
      setCustomerWhatsappNumber("");
      setSendReceiptEmail(true);
      setImeiBatchInput("");
      setPaymentAmounts(buildInitialPaymentAmounts());
      await loadCheckoutData();
    } catch (checkoutError: unknown) {
      setStatus(checkoutError instanceof Error ? checkoutError.message : "Failed to complete checkout.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="checkout-shell">
      <section className="checkout-panel">
        <div className="checkout-top-grid">
          <div className="checkout-customer-column">
            <h2>Customer</h2>
            <div className="checkout-grid checkout-grid--customer">
              <input
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                list="desktop-checkout-customer-list"
                placeholder="Customer name"
              />
              <datalist id="desktop-checkout-customer-list">
                {activeCustomers.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>
              <input
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                placeholder="Customer Email"
              />
              <div className="checkout-whatsapp">
                <select
                  value={customerWhatsappCountryCode}
                  onChange={(event) => setCustomerWhatsappCountryCode(event.target.value)}
                >
                  <option value="+52">+52</option>
                  <option value="+1">+1</option>
                </select>
                <input
                  value={customerWhatsappNumber}
                  onChange={(event) => setCustomerWhatsappNumber(event.target.value.replace(/\D/g, "").slice(0, 10))}
                  placeholder="WhatsApp 10 digits"
                />
              </div>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={2}
                placeholder="Notes"
              />
              <label className="checkout-toggle">
                <input
                  type="checkbox"
                  checked={sendReceiptEmail}
                  onChange={(event) => setSendReceiptEmail(event.target.checked)}
                />
                <span>Send receipt email to customer</span>
              </label>
            </div>
          </div>

          <div className="checkout-batch-column">
            <h2>Batch IMEI Add</h2>
            <label>Batch IMEI Add (one per line)</label>
            <textarea
              value={imeiBatchInput}
              onChange={(event) => setImeiBatchInput(event.target.value)}
              rows={4}
              placeholder="352099001111111\n352099001111112"
            />
            <button type="button" onClick={handleBatchAdd}>Add Batch</button>
          </div>
        </div>
      </section>

      <div className="checkout-main-grid">
        <section className="checkout-panel">
          <div className="checkout-panel__header">
            <h2>Available Devices</h2>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSearchEnterAdd();
                }
              }}
              placeholder="Search available inventory"
            />
          </div>
          <div className="checkout-table-wrap">
            <table className="checkout-table">
              <thead>
                <tr>
                  <th>IMEI / SN</th>
                  <th>Device</th>
                  <th>Tier ({selectedTier})</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {availableRows.map((item) => (
                  <tr key={item.id}>
                    <td>{getItemIdentifier(item)}</td>
                    <td>{item.model} {item.capacity} {item.color}</td>
                    <td>{money(getTierPrice(item, selectedTier))}</td>
                    <td>
                      <button type="button" onClick={() => addToCart(item)}>Add</button>
                    </td>
                  </tr>
                ))}
                {availableRows.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No matching inventory.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="checkout-panel">
          <h2>Cart ({cart.length})</h2>
          <div className="checkout-table-wrap">
            <table className="checkout-table">
              <thead>
                <tr>
                  <th>IMEI / SN</th>
                  <th>Device</th>
                  <th>Cost</th>
                  <th>Sale</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {cart.map((item) => (
                  <tr key={item.id}>
                    <td>{item.identifier}</td>
                    <td>{item.model} {item.capacity} {item.color}</td>
                    <td>{money(item.costPesos)}</td>
                    <td>
                      <input
                        value={formatMoneyInput(item.salePrice)}
                        onChange={(event) => updateCartPrice(item.id, event.target.value)}
                        inputMode="numeric"
                      />
                    </td>
                    <td>
                      <button type="button" onClick={() => removeFromCart(item.id)}>Remove</button>
                    </td>
                  </tr>
                ))}
                {cart.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Cart is empty.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="checkout-totals">
            <div>Cost: <span>{money(totals.cost)}</span></div>
            <div>Sale: <span>{money(totals.sale)}</span></div>
            <div>Margin: <span>{money(totals.margin)}</span></div>
          </div>

          <div className="checkout-payments">
            <p>Split Payment Breakdown</p>
            <div className="checkout-payments-grid">
              {availablePaymentMethods.map((method) => (
                <label key={method}>
                  <span>{method}</span>
                  <input
                    value={formatMoneyInput(paymentAmounts[method])}
                    onChange={(event) =>
                      setPaymentAmounts((prev) => ({
                        ...prev,
                        [method]: formatMoneyInput(event.target.value),
                      }))
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
            <div className="checkout-payments-summary">
              <span>Paid: {money(paidTotal)}</span>
              <span>Remaining: {money(Math.max(remaining, 0))}</span>
            </div>
            {!hasPaymentCoverage ? (
              <p className="checkout-warning">Payment amounts must fully cover the sale total before checkout.</p>
            ) : null}
            <p>Payment method used: <strong>{paymentSummaryLabel || "Not set"}</strong></p>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={busy || !signedIn || cart.length === 0 || !customerName.trim() || !fullCustomerWhatsapp || !hasPaymentCoverage}
          >
            {busy ? "Processing..." : "Complete Checkout"}
          </button>
        </section>
      </div>

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
