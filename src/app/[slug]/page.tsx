"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatBatteryPercentage, formatCurrencyDisplay } from "@/lib/display-format";
import {
  WHATSAPP_COUNTRY_CODES,
  formatWhatsappForDisplay,
  normalizeWhatsappDigits,
  parseWhatsappNumber,
} from "@/lib/whatsapp";

type InventoryItem = {
  id?: string;
  imei: string;
  sku?: string;
  model?: string;
  capacity?: string;
  color?: string;
  carrier?: string;
  condition?: string;
  grade?: string;
  supplier?: string;
  site?: string;
  dateOfPurchase?: string;
  costUsd?: string;
  usdToPesosRate?: string;
  costPesos?: string;
  price2?: string;
  price3?: string;
  status?: string;
  batteryHealth?: string;
  cycleCount?: string;
  iosVersion?: string;
  serialNumber?: string;
  comments?: string;
  price?: string;
  createdAt?: string;
};

type ColumnConfig = {
  key: keyof InventoryItem;
  label: string;
};

type OfferCurrency = "MXN" | "USD";

type ItemOfferInput = {
  offerAmount: string;
  offerCurrency: OfferCurrency;
};

type CustomerData = {
  email: string;
  name: string;
  whatsapp: string;
};

export default function PublicInventoryBySlugPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [companyName, setCompanyName] = useState("");
  const [logoVisible, setLogoVisible] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [offersEnabled, setOffersEnabled] = useState(false);
  const [availableSites, setAvailableSites] = useState<string[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>("All");
  
  // Customer form
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerWhatsappCountryCode, setCustomerWhatsappCountryCode] = useState<(typeof WHATSAPP_COUNTRY_CODES)[number]>("+52");
  const [customerWhatsappNumber, setCustomerWhatsappNumber] = useState("");
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [validatingEmail, setValidatingEmail] = useState(false);
  const [emailValidated, setEmailValidated] = useState(false);
  const [registeringCustomer, setRegisteringCustomer] = useState(false);
  const [isCustomerRegistered, setIsCustomerRegistered] = useState(false);
  
  // Item selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [itemOffers, setItemOffers] = useState<Record<string, ItemOfferInput>>({});
  
  // Purchase request
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");

  useEffect(() => {
    if (!slug) return;
    loadInventory();
  }, [slug]);

  // Always sort by model ascending
  useEffect(() => {
    let base = [...inventory];
    base.sort((a, b) => {
      if (!a.model && !b.model) return 0;
      if (!a.model) return 1;
      if (!b.model) return -1;
      return a.model.localeCompare(b.model);
    });
    
    // Apply site filter
    if (siteFilter !== "All") {
      base = base.filter((item) => item.site === siteFilter);
    }
    
    if (!searchQuery.trim()) {
      setFilteredInventory(base);
      return;
    }
    const query = searchQuery.toLowerCase();
    const filtered = base.filter((item) => {
      const batteryText = formatBatteryPercentage(item.batteryHealth).toLowerCase();
      return (
        item.model?.toLowerCase().includes(query) ||
        item.color?.toLowerCase().includes(query) ||
        item.capacity?.toLowerCase().includes(query) ||
        batteryText.includes(query)
      );
    });
    setFilteredInventory(filtered);
  }, [searchQuery, inventory, siteFilter]);

  const renderCellValue = (item: InventoryItem, key: keyof InventoryItem) => {
    const rawValue = item[key];
    if (["costUsd", "costPesos", "price", "price2", "price3"].includes(key)) {
      return formatCurrencyDisplay(rawValue);
    }
    if (["dateOfPurchase", "createdAt"].includes(key)) {
      if (!rawValue) return "-";
      const parsed = new Date(String(rawValue));
      return Number.isNaN(parsed.getTime())
        ? String(rawValue)
        : parsed.toLocaleDateString("en-US");
    }
    if (key === "batteryHealth") return formatBatteryPercentage(rawValue);
    return rawValue || "-";
  };

  const getInventoryItemIdentifier = (item: InventoryItem) =>
    item.imei || item.serialNumber || item.sku || item.id || "";

  const loadInventory = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public-inventory-by-slug/${slug}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to load inventory");
      }
      const data = await response.json();
      setCompanyName(data.companyName || slug);
      setInventory(data.items || []);
      setFilteredInventory(data.items || []);
      
      // Extract unique sites from inventory
      const sites = new Set<string>();
      (data.items || []).forEach((item: InventoryItem) => {
        if (item.site) sites.add(item.site);
      });
      setAvailableSites(Array.from(sites).sort());
      
      // Build columns from server response
      const availableColumns: ColumnConfig[] = [];
      const columnMap: Record<string, string> = {
        sku: "SKU",
        imei: "IMEI",
        model: "Model",
        capacity: "Capacity",
        color: "Color",
        carrier: "Carrier",
        condition: "Condition",
        grade: "Grade",
        supplier: "Supplier",
        site: "Site",
        dateOfPurchase: "Date Of Purchase",
        costUsd: "Cost USD",
        usdToPesosRate: "USD To Pesos Rate",
        costPesos: "Cost Pesos",
        price2: "Price 2",
        price3: "Price 3",
        status: "Status",
        batteryHealth: "Battery Health",
        cycleCount: "Cycle Count",
        iosVersion: "iOS Version",
        serialNumber: "Serial Number",
        comments: "Comments",
        price: "Price",
        createdAt: "Created",
      };
      
      if (data.columns && Array.isArray(data.columns)) {
        data.columns.forEach((col: string) => {
          if (columnMap[col]) {
            availableColumns.push({ key: col as keyof InventoryItem, label: columnMap[col] });
          }
        });
      } else {
        // Default columns if not specified
        availableColumns.push(
          { key: "sku", label: "SKU" },
          { key: "imei", label: "IMEI" },
          { key: "model", label: "Model" },
          { key: "capacity", label: "Capacity" },
          { key: "color", label: "Color" },
          { key: "batteryHealth", label: "Battery Health" },
          { key: "price", label: "Price" }
        );
      }
      setColumns(availableColumns);
      setOffersEnabled(Boolean(data.offersEnabled));
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  };

  const handleValidateEmail = async () => {
    const email = customerEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setSubmitMessage("Please enter a valid email address");
      return;
    }

    setValidatingEmail(true);
    setSubmitMessage("");
    try {
      const response = await fetch(
        `/api/public-customer-check/${slug}?email=${encodeURIComponent(email)}`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.exists && data.customer) {
          setIsExistingCustomer(true);
          setCustomerName(data.customer.name || "");
          const parsedWhatsapp = parseWhatsappNumber(data.customer.whatsapp || "");
          setCustomerWhatsappCountryCode(parsedWhatsapp.countryCode);
          setCustomerWhatsappNumber(parsedWhatsapp.localNumber);
          setEmailValidated(true);
          setIsCustomerRegistered(true);
          setSubmitMessage("✓ Customer found! You can now select items.");
        } else {
          setIsExistingCustomer(false);
          setCustomerName("");
          setCustomerWhatsappCountryCode("+52");
          setCustomerWhatsappNumber("");
          setEmailValidated(true);
          setIsCustomerRegistered(false);
          setSubmitMessage("Email not found. Please register below.");
        }
      }
    } catch (error) {
      console.error("Failed to validate email:", error);
      setSubmitMessage("Failed to validate email. Please try again.");
    } finally {
      setValidatingEmail(false);
    }
  };

  const handleRegisterCustomer = async () => {
    const name = customerName.trim();
    const whatsappDigits = normalizeWhatsappDigits(customerWhatsappNumber);

    if (!name || whatsappDigits.length !== 10) {
      setSubmitMessage("Please fill in your name and WhatsApp number");
      return;
    }

    setRegisteringCustomer(true);
    setSubmitMessage("");
    try {
      // We'll create the customer when submitting the purchase request
      // For now, just mark as registered
      setIsCustomerRegistered(true);
      setSubmitMessage("✓ Information saved! You can now select items.");
    } catch (error) {
      console.error("Failed to register:", error);
      setSubmitMessage("Failed to save information. Please try again.");
    } finally {
      setRegisteringCustomer(false);
    }
  };

  const toggleItemSelection = (imei: string) => {
    setSelectedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(imei)) {
        newSet.delete(imei);
      } else {
        newSet.add(imei);
      }
      return newSet;
    });
  };

  const updateItemOfferAmount = (imei: string, value: string) => {
    const normalized = value.replace(/[^\d.]/g, "");
    setItemOffers((prev) => ({
      ...prev,
      [imei]: {
        offerAmount: normalized,
        offerCurrency: prev[imei]?.offerCurrency ?? "MXN",
      },
    }));
  };

  const updateItemOfferCurrency = (imei: string, currency: OfferCurrency) => {
    setItemOffers((prev) => ({
      ...prev,
      [imei]: {
        offerAmount: prev[imei]?.offerAmount ?? "",
        offerCurrency: currency,
      },
    }));
  };

  const handleSubmitPurchaseRequest = async () => {
    // Validation
    if (selectedItems.size === 0) {
      return; // Button should be disabled anyway
    }

    if (!isCustomerRegistered) {
      return; // Button should be disabled anyway
    }

    if (
      !customerEmail.trim() ||
      !customerName.trim() ||
      normalizeWhatsappDigits(customerWhatsappNumber).length !== 10
    ) {
      return; // Button should be disabled anyway
    }

    const selectedItemsData = Array.from(selectedItems)
      .map((imei) => inventory.find((item) => item.imei === imei))
      .filter((item): item is InventoryItem => item !== undefined)
      .map((item) => ({
        ...item,
        offerAmount: itemOffers[item.imei]?.offerAmount?.trim() ?? "",
        offerCurrency: itemOffers[item.imei]?.offerCurrency ?? "MXN",
      }));

    if (offersEnabled) {
      const invalidOffer = selectedItemsData.find((item) => {
        const value = String((item as InventoryItem & { offerAmount?: string }).offerAmount ?? "").trim();
        if (!value) return false;
        const parsed = Number(value);
        return !Number.isFinite(parsed) || parsed <= 0;
      });

      if (invalidOffer) {
        setSubmitMessage("Offers must be blank or a valid amount greater than 0.");
        return;
      }
    }

    setSubmitting(true);
    setSubmitMessage("");
    try {
      const response = await fetch(`/api/public-purchase-request/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selectedItemsData,
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerWhatsappCountryCode: customerWhatsappCountryCode,
          customerWhatsappNumber: customerWhatsappNumber,
          offersEnabled,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit purchase request");
      }

      const data = await response.json();
      const formattedWhatsapp = formatWhatsappForDisplay(
        `${customerWhatsappCountryCode}${normalizeWhatsappDigits(customerWhatsappNumber)}`
      );
      setSubmitMessage(
        `✓ Purchase request submitted successfully! (${data.itemCount} item${
          data.itemCount > 1 ? "s" : ""
        }) We will contact you on ${formattedWhatsapp}.`
      );
      setSelectedItems(new Set());
      setItemOffers({});
      
      // Reset form after successful submission
      setTimeout(() => {
        setSubmitMessage("");
      }, 8000);
    } catch (error) {
      console.error(error);
      setSubmitMessage(error instanceof Error ? error.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-lg">Loading inventory...</p>
      </div>
    );
  }

  if (error) {
    const isUnknownSlug = error.toLowerCase().includes("organization not found");

    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
        <div className="w-full max-w-xl rounded-3xl border border-[#d6e4ff] bg-white p-8 text-center shadow-sm">
          <span className="inline-flex rounded-full border border-[#bfd4ff] bg-[#eff5ff] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#2563eb]">
            Public Inventory
          </span>
          <h1 className="mt-4 text-3xl font-bold text-[#0f1f3d]">
            {isUnknownSlug ? "Lost?" : "This page is unavailable."}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#5f7298]">
            {isUnknownSlug
              ? "We could not find a public ProBuyer page for this address."
              : error}
          </p>
          <p className="mt-2 text-sm text-[#6a4d3a]">
            {isUnknownSlug
              ? "Go to www.probuyer.org to continue browsing."
              : "This company may not have public inventory enabled."}
          </p>
          <div className="mt-6 flex justify-center">
            <a
              href="/"
              className="inline-flex rounded-full bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4ed8]"
            >
              Go to www.probuyer.org
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          {logoVisible && (
            <div className="mb-4">
              <img
                src={`/api/public-logo/${slug}`}
                alt={`${companyName} logo`}
                className="h-16 w-auto max-w-[240px] object-contain"
                onError={() => setLogoVisible(false)}
              />
            </div>
          )}
          <h1 className="text-3xl font-bold mb-2">{companyName}</h1>
          <p className="text-gray-600">
            Enter your email, select items, and submit a purchase request
          </p>
        </div>

        {/* Customer Form */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Step 1: Verify Your Information</h2>
          
          {/* Email and Validate Button */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Email Address *</label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  setEmailValidated(false);
                  setIsCustomerRegistered(false);
                  setSubmitMessage("");
                }}
                className="flex-1 border rounded px-4 py-2"
                disabled={emailValidated}
              />
              {!emailValidated && (
                <button
                  onClick={handleValidateEmail}
                  disabled={validatingEmail || !customerEmail.trim()}
                  className="px-6 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {validatingEmail ? "Validating..." : "Validate Email"}
                </button>
              )}
              {emailValidated && (
                <button
                  onClick={() => {
                    setEmailValidated(false);
                    setIsCustomerRegistered(false);
                    setCustomerName("");
                    setCustomerWhatsappCountryCode("+52");
                    setCustomerWhatsappNumber("");
                    setSubmitMessage("");
                  }}
                  className="px-6 py-2 bg-gray-500 text-white rounded font-semibold hover:bg-gray-600 whitespace-nowrap"
                >
                  Change Email
                </button>
              )}
            </div>
          </div>

          {/* Show name and whatsapp after validation */}
          {emailValidated && (
            <>
              <div className="grid gap-4 md:grid-cols-2 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Name * {isExistingCustomer && <span className="text-xs text-gray-500">(From our records)</span>}
                  </label>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className={`w-full border rounded px-4 py-2 ${isExistingCustomer ? 'bg-gray-100' : ''}`}
                    disabled={isExistingCustomer}
                    readOnly={isExistingCustomer}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    WhatsApp Number * {isExistingCustomer && <span className="text-xs text-gray-500">(From our records)</span>}
                  </label>
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <select
                      value={customerWhatsappCountryCode}
                      onChange={(e) =>
                        setCustomerWhatsappCountryCode(
                          e.target.value as (typeof WHATSAPP_COUNTRY_CODES)[number]
                        )
                      }
                      className={`border rounded px-4 py-2 ${isExistingCustomer ? "bg-gray-100" : ""}`}
                      disabled={isExistingCustomer}
                    >
                      {WHATSAPP_COUNTRY_CODES.map((countryCode) => (
                        <option key={countryCode} value={countryCode}>
                          {countryCode}
                        </option>
                      ))}
                    </select>
                    <input
                      type="tel"
                      inputMode="numeric"
                      placeholder="10-digit number"
                      value={customerWhatsappNumber}
                      onChange={(e) => setCustomerWhatsappNumber(normalizeWhatsappDigits(e.target.value))}
                      className={`w-full border rounded px-4 py-2 ${isExistingCustomer ? 'bg-gray-100' : ''}`}
                      disabled={isExistingCustomer}
                      readOnly={isExistingCustomer}
                    />
                  </div>
                </div>
              </div>

              {/* Register button for new customers */}
              {!isExistingCustomer && !isCustomerRegistered && (
                <div>
                  <button
                    onClick={handleRegisterCustomer}
                    disabled={
                      registeringCustomer ||
                      !customerName.trim() ||
                      normalizeWhatsappDigits(customerWhatsappNumber).length !== 10
                    }
                    className="px-6 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {registeringCustomer ? "Saving..." : "Register as Customer"}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Status message */}
          {submitMessage && !submitting && (
            <div className={`mt-4 p-3 rounded-lg ${submitMessage.startsWith("✓") ? "bg-green-50 border border-green-200" : "bg-blue-50 border border-blue-200"}`}>
              <p className={`text-sm font-medium ${submitMessage.startsWith("✓") ? "text-green-700" : "text-blue-700"}`}>
                {submitMessage}
              </p>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Step 2: Browse and Select Items</h2>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Search by model, color, capacity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border rounded px-4 py-2"
            />
            {availableSites.length > 0 && (
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Filter by Site</label>
                  <select
                    value={siteFilter}
                    onChange={(e) => setSiteFilter(e.target.value)}
                    className="w-full border rounded px-4 py-2"
                  >
                    <option value="All">All Sites</option>
                    {availableSites.map((site) => (
                      <option key={site} value={site}>{site}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          {filteredInventory.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {searchQuery ? "No items match your search." : "No items available at this time."}
            </div>
          ) : (
            <>
              {/* Mobile: Card layout */}
              <div className="md:hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selectedItems.size > 0 && selectedItems.size === filteredInventory.length}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItems(new Set(filteredInventory.map((item) => getInventoryItemIdentifier(item))));
                      } else {
                        setSelectedItems(new Set());
                      }
                    }}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-600">Select all</span>
                </div>
                <div className="divide-y">
                  {filteredInventory.map((item, index) => (
                    <div
                      key={getInventoryItemIdentifier(item) || index}
                      className={`px-4 py-3 ${selectedItems.has(getInventoryItemIdentifier(item)) ? "bg-blue-50" : ""}`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(getInventoryItemIdentifier(item))}
                          onChange={() => toggleItemSelection(getInventoryItemIdentifier(item))}
                          className="w-4 h-4 mt-1 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          {columns.map((col) => (
                            <div key={col.key} className="flex justify-between gap-2 py-0.5 text-sm">
                              <span className="text-gray-500 shrink-0">{col.label}</span>
                              <span className="text-right font-medium truncate">{renderCellValue(item, col.key)}</span>
                            </div>
                          ))}
                          {offersEnabled && selectedItems.has(getInventoryItemIdentifier(item)) && (
                            <div className="mt-2 flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Offer (optional)"
                                value={itemOffers[getInventoryItemIdentifier(item)]?.offerAmount ?? ""}
                                onChange={(event) => updateItemOfferAmount(getInventoryItemIdentifier(item), event.target.value)}
                                className="flex-1 rounded border px-2 py-1 text-sm"
                              />
                              <select
                                value={itemOffers[getInventoryItemIdentifier(item)]?.offerCurrency ?? "MXN"}
                                onChange={(event) => updateItemOfferCurrency(getInventoryItemIdentifier(item), event.target.value as OfferCurrency)}
                                className="rounded border px-2 py-1 text-sm"
                              >
                                <option value="MXN">MXN</option>
                                <option value="USD">USD</option>
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Desktop: Table layout */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={
                          selectedItems.size > 0 &&
                          selectedItems.size === filteredInventory.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedItems(
                              new Set(filteredInventory.map((item) => getInventoryItemIdentifier(item)))
                            );
                          } else {
                            setSelectedItems(new Set());
                          }
                        }}
                        className="w-4 h-4"
                      />
                    </th>
                    {columns.map((col) => (
                      <th key={col.key} className="text-left px-4 py-3 font-semibold">
                        {col.label}
                      </th>
                    ))}
                    {offersEnabled && (
                      <th className="text-left px-4 py-3 font-semibold">Offer</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item, index) => (
                    <tr
                      key={getInventoryItemIdentifier(item) || index}
                      className={`border-b hover:bg-gray-50 ${
                        selectedItems.has(getInventoryItemIdentifier(item)) ? "bg-blue-50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(getInventoryItemIdentifier(item))}
                          onChange={() => toggleItemSelection(getInventoryItemIdentifier(item))}
                          className="w-4 h-4"
                        />
                      </td>
                      {columns.map((col) => (
                        <td key={col.key} className="px-4 py-3">
                          {renderCellValue(item, col.key)}
                        </td>
                      ))}
                      {offersEnabled && (
                        <td className="px-4 py-3">
                          {selectedItems.has(getInventoryItemIdentifier(item)) ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Optional"
                                value={itemOffers[getInventoryItemIdentifier(item)]?.offerAmount ?? ""}
                                onChange={(event) => updateItemOfferAmount(getInventoryItemIdentifier(item), event.target.value)}
                                className="w-24 rounded border px-2 py-1 text-sm"
                              />
                              <select
                                value={itemOffers[getInventoryItemIdentifier(item)]?.offerCurrency ?? "MXN"}
                                onChange={(event) => updateItemOfferCurrency(getInventoryItemIdentifier(item), event.target.value as OfferCurrency)}
                                className="rounded border px-2 py-1 text-sm"
                              >
                                <option value="MXN">MXN</option>
                                <option value="USD">USD</option>
                              </select>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Select item</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>

        {/* Purchase Request Button */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Step 3: Submit Purchase Request</h2>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm text-gray-600">
                {selectedItems.size} item(s) selected
              </p>
              {submitting && (
                <p className="text-sm mt-1 text-blue-600">
                  Submitting purchase request...
                </p>
              )}
            </div>
            <button
              onClick={handleSubmitPurchaseRequest}
              disabled={
                submitting ||
                selectedItems.size === 0 ||
                !isCustomerRegistered
              }
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting..." : "Submit Purchase Request"}
            </button>
          </div>
          {!submitting && submitMessage && submitMessage.startsWith("✓") && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-700 font-semibold">{submitMessage}</p>
            </div>
          )}
          {!submitting && submitMessage && !submitMessage.startsWith("✓") && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{submitMessage}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Showing {filteredInventory.length} item(s)</p>
        </div>
      </div>
    </div>
  );
}
