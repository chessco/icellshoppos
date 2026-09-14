import type { ManualContent } from "@/lib/manual/types";

export const manualContentEn: ManualContent = {
  title: "iCellShop User Manual",
  subtitle: "Guide for every main page, core function, and how workflows connect.",
  updatedAt: "2026-03-15",
  sections: [
    {
      id: "dashboard",
      title: "Dashboard",
      summary: "Quick control center with inventory, sales, and pending activity snapshots.",
      features: [
        {
          title: "Business Snapshot",
          description: "View totals and status indicators to understand current store performance.",
          routes: ["/dashboard"],
        },
        {
          title: "Daily Operations Entry",
          description: "Use dashboard shortcuts to move into inventory, checkout, and requests.",
          routes: ["/dashboard", "/inventory", "/sales", "/inventory-requests"],
        },
      ],
      connections: [
        "Inventory and sales updates are reflected in dashboard metrics.",
        "Pending inventory requests shown here are resolved in Inventory Requests.",
      ],
    },
    {
      id: "inventory",
      title: "Inventory Management",
      summary: "Complete inventory lifecycle: add, update, label, import, and transfer-ready stock control.",
      features: [
        {
          title: "Full Inventory",
          description: "Search, filter, and update devices with model, storage, grade, cost, and sale prices.",
          routes: ["/inventory"],
        },
        {
          title: "Add Device",
          description: "Register new devices, detect duplicate IMEI, and update existing records safely.",
          routes: ["/add-device"],
        },
        {
          title: "Label Designer",
          description: "Create and apply printable labels for devices and inventory presentation.",
          routes: ["/label-designer"],
        },
        {
          title: "Data Admin",
          description: "Bulk update/import data and maintain data quality across inventory records.",
          routes: ["/data"],
        },
      ],
      connections: [
        "Devices added in Add Device become available in Full Inventory and Sales Checkout.",
        "Label Designer templates are used when printing inventory labels.",
        "Data Admin imports affect availability, pricing, and reporting in sales and history.",
      ],
    },
    {
      id: "sales",
      title: "Sales and Credit",
      summary: "Checkout flow, cancellation controls, and historical performance analysis.",
      features: [
        {
          title: "Sales Checkout",
          description: "Build cart, assign customer details, and finalize device sales.",
          routes: ["/sales"],
        },
        {
          title: "Cancel Sale",
          description: "Reverse eligible sales and return stock as needed.",
          routes: ["/sales/cancel"],
        },
        {
          title: "Sales History",
          description: "Track transactions with filters by status, search text, and customer plus totals and margin.",
          routes: ["/sales/history"],
        },
        {
          title: "Credit",
          description: "Manage financed sales/payment-related operations in one place.",
          routes: ["/credit"],
        },
      ],
      connections: [
        "Completed checkout records are shown in Sales History with profit metrics.",
        "Sale cancellations impact inventory availability and historical reporting.",
      ],
    },
    {
      id: "purchase-flow",
      title: "Purchase Requests and Offers",
      summary: "Receive customer purchase requests, compare tier pricing vs offers, and approve items.",
      features: [
        {
          title: "Public Inventory and Request Capture",
          description: "Customers submit item requests from your public inventory page.",
          routes: ["/[slug]", "/public-inventory"],
        },
        {
          title: "Purchase Orders",
          description: "Review request items, compare tier and offered prices, accept offers per item, and create cart.",
          routes: ["/purchase-orders"],
        },
        {
          title: "Inventory Requests",
          description: "Handle internal inventory request workflows and pending quantities.",
          routes: ["/inventory-requests"],
        },
      ],
      connections: [
        "When offers are enabled, each offered item must be accepted before cart creation.",
        "Accepted purchase request items move into the sales cart flow.",
      ],
    },
    {
      id: "public-inventory-settings",
      title: "Public Inventory Settings",
      summary: "Control what external customers can see and submit, including optional offer mode.",
      features: [
        {
          title: "Visibility and Columns",
          description: "Choose visible fields, listing behavior, and what information appears publicly.",
          routes: ["/public-inventory-settings"],
        },
        {
          title: "Allow Offers",
          description: "Enable optional per-item offers from customers in MXN or USD.",
          routes: ["/public-inventory-settings", "/purchase-orders"],
        },
      ],
      connections: [
        "Configuration here changes the public storefront experience at your slug route.",
        "Offer settings drive comparison and acceptance logic in Purchase Orders.",
      ],
    },
    {
      id: "imeicheck2",
      title: "IMEICHECK2 Integration",
      summary: "IMEI validation, service checks, request history, and add-to-inventory acceleration.",
      features: [
        {
          title: "Integration Linking",
          description: "Connect organization account and fetch available IMEICHECK2 services.",
          routes: ["/imeicheck2"],
        },
        {
          title: "IMEI Checks and History",
          description: "Submit checks, inspect responses, and keep historical records.",
          routes: ["/imeicheck2"],
        },
        {
          title: "Add to Inventory Prefill",
          description: "Send parsed check data to Add Device to reduce manual entry.",
          routes: ["/imeicheck2", "/add-device"],
        },
      ],
      connections: [
        "IMEI result data can prefill Add Device for faster intake.",
        "Integration status controls whether IMEICHECK2 appears in sidebar.",
      ],
    },
    {
      id: "profile-org",
      title: "Profile, Team, and Organization",
      summary: "Manage user profile, language, password, team permissions, invites, and org branding.",
      features: [
        {
          title: "User Profile",
          description: "Update full name, WhatsApp, and preferred language.",
          routes: ["/profile"],
        },
        {
          title: "Security",
          description: "Change password and manage account session actions.",
          routes: ["/profile"],
        },
        {
          title: "Team and Invites",
          description: "Assign roles/permissions and invite collaborators.",
          routes: ["/profile"],
        },
        {
          title: "Organization Branding",
          description: "Upload or update organization logo used across app and public pages.",
          routes: ["/profile", "/public-inventory", "/dashboard"],
        },
      ],
      connections: [
        "Preferred language applies app-wide through translated interface labels.",
        "Team permissions control access to inventory edits, data admin, and sales actions.",
      ],
    },
    {
      id: "billing-admin",
      title: "Billing and Admin Tools",
      summary: "Subscription lifecycle for orgs plus elevated controls for superadmin users.",
      features: [
        {
          title: "Billing",
          description: "Track subscription status, plan, and period details.",
          routes: ["/billing"],
        },
        {
          title: "Superadmin Billing/Plans/Users",
          description: "Manage organizations, plans, users, and system-level billing operations.",
          routes: ["/admin/billing", "/admin/plans", "/admin/users", "/admin/organizations", "/admin/logs"],
        },
      ],
      connections: [
        "Plan and status influence feature availability at organization level.",
        "Admin tools support support/operations workflows beyond normal member access.",
      ],
    },
  ],
};
