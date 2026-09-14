# iCellShop POS

Wholesale iPhone POS for scanning QR lines, capturing inventory data, and
managing operations in a PostgreSQL-backed multi-tenant app.

## Features

- **Multi-tenant SaaS**: Organizations with subscription management and 14-day free trials
- **Inventory Management**: Track devices with model, capacity, color, battery health, and pricing
- **Device Guide & Pricing Matrix**: Define valid device configurations and price tiers (Price/Price2/Price3)
- **Sales Checkout**: POS interface with bulk IMEI scanning, customer pricing tiers, and receipt printing
- **Purchase Orders**: Request and track device purchases from suppliers
- **Public Inventory**: Share inventory publicly via custom company URLs (e.g., `/acme-phones`)
- **CSV Import/Export**: Bulk device guide and pricing matrix management
- **Label Printing**: Generate 2.4 x 2.1 inch labels with QR codes for devices

## Setup

1. Install dependencies:
	```bash
	npm install
	```

2. Create a `.env.local` file with:
	```
	DATABASE_URL=your_postgresql_connection_string
	SESSION_SECRET=your_jwt_secret_key
	MAILGUN_API_KEY=your_mailgun_api_key
	MAILGUN_DOMAIN=your_mailgun_domain
	NEXT_PUBLIC_APP_URL=http://localhost:3000
	```

3. Run database migrations:
	```bash
	node node_modules\prisma\build\index.js migrate dev
	```

4. Run the app:
	```bash
	npm run dev
	```

## Public Inventory Setup

Organizations with active subscriptions can enable public inventory:

1. Navigate to **Public Inventory** in the sidebar
2. Enable the feature and set a unique URL slug (e.g., "acme-phones")
3. Select which columns to display: Model, Color, Capacity, Battery Health, Price
4. Share your public URL - no login required for customers

See [PUBLIC_INVENTORY_GUIDE.md](PUBLIC_INVENTORY_GUIDE.md) for detailed setup instructions.

## Production Deployment

Use [DEPLOYMENT_PHASE1.md](DEPLOYMENT_PHASE1.md) for the first production launch checklist (Railway/Render + `probuyer.org`).

## Notes

- The app stores operational config data in the Data tab (suppliers and USD to Pesos history).
- The Sales Checkout page (`/sales`) writes line-level sales records to the Sales tab and marks sold IMEIs as `Sold` in Inventory.
- The Sales History page (`/sales/history`) provides POS-style transaction history with filters (date, customer, payment, search), grouped sale tickets, and margin/sales summaries.
- Sales History supports exporting filtered results to CSV and printing receipt-formatted tickets (use Print dialog to save as PDF).
- Data Admin now manages Wholesale Customers with a default price tier (`Price`, `Price 2`, `Price 3`) used as checkout defaults.
- Sales Checkout supports bulk scan/paste of IMEIs (one IMEI per line) to add multiple items to cart quickly.
- Label printing is sized at 2.4 x 2.1 inches.
- Trial subscriptions automatically expire after 14 days, suspending organization access.
