import { FormEvent, useEffect, useMemo, useState } from "react";

type Props = {
  baseUrl: string;
  signedIn: boolean;
};

type Tab = "suppliers" | "customers" | "locations" | "pricing";

const money = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value || "0";
  return `$${Math.round(parsed).toLocaleString("en-US")}`;
};

export function DesktopDataAdmin({ baseUrl, signedIn }: Props) {
  const [tab, setTab] = useState<Tab>("suppliers");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const [suppliers, setSuppliers] = useState<DesktopSupplier[]>([]);
  const [customers, setCustomers] = useState<DesktopCustomer[]>([]);
  const [locations, setLocations] = useState<DesktopLocation[]>([]);
  const [pricingRules, setPricingRules] = useState<DesktopPricingRule[]>([]);

  const [supplierDraft, setSupplierDraft] = useState("");
  const [customerDraft, setCustomerDraft] = useState({ name: "", email: "", whatsapp: "", customerType: "retail", defaultPriceTier: "Price" });
  const [locationDraft, setLocationDraft] = useState("");
  const [pricingDraft, setPricingDraft] = useState({ model: "", capacity: "", price: "", price2: "", price3: "" });

  const sortedPricingRules = useMemo(
    () => [...pricingRules].sort((a, b) => `${a.model}-${a.capacity}`.localeCompare(`${b.model}-${b.capacity}`)),
    [pricingRules]
  );

  const loadSuppliers = async () => {
    if (!window.desktop?.dataAdmin?.suppliers?.list) return;
    const payload = await window.desktop.dataAdmin.suppliers.list({ baseUrl });
    setSuppliers(payload.suppliers ?? []);
  };

  const loadCustomers = async () => {
    if (!window.desktop?.dataAdmin?.customers?.list) return;
    const payload = await window.desktop.dataAdmin.customers.list({ baseUrl });
    setCustomers(payload.customers ?? []);
  };

  const loadLocations = async () => {
    if (!window.desktop?.dataAdmin?.locations?.list) return;
    const payload = await window.desktop.dataAdmin.locations.list({ baseUrl });
    setLocations(payload.locations ?? []);
  };

  const loadPricing = async () => {
    if (!window.desktop?.dataAdmin?.pricing?.list) return;
    const payload = await window.desktop.dataAdmin.pricing.list({ baseUrl });
    setPricingRules(payload.rules ?? []);
  };

  const loadAll = async () => {
    if (!signedIn) {
      setError("Sign in to use Data Admin.");
      return;
    }

    if (!window.desktop?.dataAdmin) {
      setError("Desktop bridge is outdated. Restart the app to load Data Admin support.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await Promise.all([loadSuppliers(), loadCustomers(), loadLocations(), loadPricing()]);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load Data Admin records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [baseUrl, signedIn]);

  const handleAddSupplier = async (event: FormEvent) => {
    event.preventDefault();
    if (!supplierDraft.trim() || !window.desktop?.dataAdmin?.suppliers?.create) return;
    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.suppliers.create({ baseUrl, data: { name: supplierDraft.trim() } });
      setSupplierDraft("");
      await loadSuppliers();
      setStatus("Supplier added.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add supplier.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSupplierStatus = async (supplier: DesktopSupplier) => {
    if (!window.desktop?.dataAdmin?.suppliers?.update) return;
    const nextStatus = supplier.status === "Active" ? "Inactive" : "Active";
    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.suppliers.update({ baseUrl, data: { id: supplier.id, status: nextStatus } });
      await loadSuppliers();
      setStatus("Supplier updated.");
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update supplier.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.desktop?.dataAdmin?.customers?.create) return;
    if (!customerDraft.name.trim() || !customerDraft.email.trim() || !customerDraft.whatsapp.trim()) {
      setError("Name, email and WhatsApp are required.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.customers.create({
        baseUrl,
        data: {
          name: customerDraft.name.trim(),
          email: customerDraft.email.trim(),
          whatsapp: customerDraft.whatsapp.trim(),
          customerType: customerDraft.customerType,
          defaultPriceTier: customerDraft.defaultPriceTier,
        },
      });
      setCustomerDraft({ name: "", email: "", whatsapp: "", customerType: "retail", defaultPriceTier: "Price" });
      await loadCustomers();
      setStatus("Customer added.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add customer.");
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = async (event: FormEvent) => {
    event.preventDefault();
    if (!locationDraft.trim() || !window.desktop?.dataAdmin?.locations?.create) return;
    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.locations.create({ baseUrl, data: { name: locationDraft.trim() } });
      setLocationDraft("");
      await loadLocations();
      setStatus("Location added.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to add location.");
    } finally {
      setLoading(false);
    }
  };

  const toggleLocationStatus = async (location: DesktopLocation) => {
    if (!window.desktop?.dataAdmin?.locations?.update) return;
    const nextStatus = location.status === "Active" ? "Inactive" : "Active";
    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.locations.update({ baseUrl, data: { id: location.id, status: nextStatus } });
      await loadLocations();
      setStatus("Location updated.");
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Failed to update location.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePricing = async (event: FormEvent) => {
    event.preventDefault();
    if (!window.desktop?.dataAdmin?.pricing?.upsert) return;
    if (!pricingDraft.model.trim() || !pricingDraft.capacity.trim()) {
      setError("Model and capacity are required.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.pricing.upsert({ baseUrl, data: { ...pricingDraft } });
      setPricingDraft({ model: "", capacity: "", price: "", price2: "", price3: "" });
      await loadPricing();
      setStatus("Pricing rule saved.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save pricing rule.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePricing = async (id: string) => {
    if (!window.desktop?.dataAdmin?.pricing?.delete) return;
    setLoading(true);
    setError("");
    try {
      await window.desktop.dataAdmin.pricing.delete({ baseUrl, data: { id } });
      await loadPricing();
      setStatus("Pricing rule removed.");
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete pricing rule.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="data-admin-shell">
      <section className="data-admin-header">
        <div>
          <h2>Data Admin</h2>
          <p>Manage suppliers, customers, locations, and pricing rules.</p>
        </div>
        <button type="button" onClick={() => void loadAll()} disabled={loading}>Refresh</button>
      </section>

      <section className="data-admin-tabs">
        {(["suppliers", "customers", "locations", "pricing"] as Tab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            className={tab === entry ? "data-admin-tab active" : "data-admin-tab"}
            onClick={() => setTab(entry)}
          >
            {entry.charAt(0).toUpperCase() + entry.slice(1)}
          </button>
        ))}
      </section>

      {tab === "suppliers" ? (
        <section className="data-admin-card">
          <h3>Suppliers</h3>
          <form onSubmit={handleAddSupplier} className="data-admin-inline-form">
            <input value={supplierDraft} onChange={(event) => setSupplierDraft(event.target.value)} placeholder="Supplier name" />
            <button type="submit" disabled={loading}>Add</button>
          </form>
          <div className="data-admin-list">
            {suppliers.map((supplier) => (
              <div key={supplier.id} className="data-admin-row">
                <span>{supplier.name}</span>
                <button type="button" onClick={() => void toggleSupplierStatus(supplier)}>{supplier.status}</button>
              </div>
            ))}
            {suppliers.length === 0 ? <p className="hint">No suppliers found.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "customers" ? (
        <section className="data-admin-card">
          <h3>Customers</h3>
          <form onSubmit={handleAddCustomer} className="data-admin-inline-form data-admin-inline-form--wide">
            <input value={customerDraft.name} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Name" />
            <input value={customerDraft.email} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, email: event.target.value }))} placeholder="Email" />
            <input value={customerDraft.whatsapp} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, whatsapp: event.target.value }))} placeholder="WhatsApp" />
            <select value={customerDraft.customerType} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, customerType: event.target.value }))}>
              <option value="retail">Retail</option>
              <option value="wholesale">Wholesale</option>
            </select>
            <select value={customerDraft.defaultPriceTier} onChange={(event) => setCustomerDraft((prev) => ({ ...prev, defaultPriceTier: event.target.value }))}>
              <option value="Price">Price</option>
              <option value="Price 2">Price 2</option>
              <option value="Price 3">Price 3</option>
            </select>
            <button type="submit" disabled={loading}>Add</button>
          </form>
          <div className="data-admin-list data-admin-list--table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>WhatsApp</th>
                  <th>Type</th>
                  <th>Tier</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.email || "-"}</td>
                    <td>{customer.whatsapp || "-"}</td>
                    <td>{customer.customerType}</td>
                    <td>{customer.defaultPriceTier}</td>
                    <td>{customer.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {customers.length === 0 ? <p className="hint">No customers found.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "locations" ? (
        <section className="data-admin-card">
          <h3>Locations</h3>
          <form onSubmit={handleAddLocation} className="data-admin-inline-form">
            <input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} placeholder="Location name" />
            <button type="submit" disabled={loading}>Add</button>
          </form>
          <div className="data-admin-list">
            {locations.map((location) => (
              <div key={location.id} className="data-admin-row">
                <span>{location.name}</span>
                <button type="button" onClick={() => void toggleLocationStatus(location)}>{location.status}</button>
              </div>
            ))}
            {locations.length === 0 ? <p className="hint">No locations found.</p> : null}
          </div>
        </section>
      ) : null}

      {tab === "pricing" ? (
        <section className="data-admin-card">
          <h3>Pricing Rules</h3>
          <form onSubmit={handleSavePricing} className="data-admin-inline-form data-admin-inline-form--wide">
            <input value={pricingDraft.model} onChange={(event) => setPricingDraft((prev) => ({ ...prev, model: event.target.value }))} placeholder="Model" />
            <input value={pricingDraft.capacity} onChange={(event) => setPricingDraft((prev) => ({ ...prev, capacity: event.target.value }))} placeholder="Capacity" />
            <input value={pricingDraft.price} onChange={(event) => setPricingDraft((prev) => ({ ...prev, price: event.target.value }))} placeholder="Price" />
            <input value={pricingDraft.price2} onChange={(event) => setPricingDraft((prev) => ({ ...prev, price2: event.target.value }))} placeholder="Price 2" />
            <input value={pricingDraft.price3} onChange={(event) => setPricingDraft((prev) => ({ ...prev, price3: event.target.value }))} placeholder="Price 3" />
            <button type="submit" disabled={loading}>Save</button>
          </form>
          <div className="data-admin-list data-admin-list--table">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Capacity</th>
                  <th>Price</th>
                  <th>Price 2</th>
                  <th>Price 3</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedPricingRules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.model}</td>
                    <td>{rule.capacity}</td>
                    <td>{money(rule.price)}</td>
                    <td>{money(rule.price2)}</td>
                    <td>{money(rule.price3)}</td>
                    <td>
                      <button type="button" onClick={() => void handleDeletePricing(rule.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sortedPricingRules.length === 0 ? <p className="hint">No pricing rules found.</p> : null}
          </div>
        </section>
      ) : null}

      {error ? <p className="hint">{error}</p> : null}
      {status ? <p className="hint">{status}</p> : null}
    </div>
  );
}
