# Public Inventory Feature

## Overview
Each organization with an active or trial subscription can now enable a public-facing inventory page accessible without authentication at a custom URL.

## Setup Instructions

### 1. Configure Public Inventory
- Navigate to **Public Inventory** in the sidebar
- Enable the "Enable Public Inventory" checkbox
- Set a unique **URL slug** (e.g., "acme-phones" → `/acme-phones`)
- Select which **columns** to display publicly:
  - Model
  - Color
  - Capacity
  - Battery Health
  - Price

### 2. Share Your Public URL
- After saving, copy your public URL (e.g., `https://yourdomain.com/acme-phones`)
- Share this URL with customers - no login required
- Only items with "Available" status will be visible

## Technical Architecture

### Database Schema
**Organization table additions:**
- `publicInventoryEnabled` (Boolean): Controls whether public inventory is accessible
- `publicInventoryColumns` (JSON String): Stores array of visible column keys

### Routes
- **Settings Page**: `/public-inventory-settings` (authenticated)
- **Public View**: `/[slug]` (no authentication required)

### API Endpoints
- **GET/POST `/api/public-inventory-settings`**: Manage org settings (authenticated)
- **GET `/api/public-inventory-by-slug/[slug]`**: Fetch public inventory data (public)

### Access Control
Public inventory is only accessible when:
1. Organization subscription status is "trialing" or "active"
2. Organization status is "active" or "suspended" (not "archived")
3. `publicInventoryEnabled` is set to `true`

### Column Customization
Organizations can choose which fields to display:
- Default columns: model, color, capacity, batteryHealth, price
- Stored as JSON array in `publicInventoryColumns`
- Frontend dynamically renders only selected columns

## User Flow

1. **Admin Setup**:
   - Go to Public Inventory settings
   - Enable feature and set slug
   - Choose visible columns
   - Save settings

2. **Customer Access**:
   - Visit `yourdomain.com/[company-slug]`
   - Browse available inventory
   - Search by model, color, capacity
   - No registration or login required

## Migration
Run `prisma migrate dev` to apply the schema changes:
```bash
node node_modules\prisma\build\index.js migrate dev --name add_public_inventory_config
```

## Notes
- Slug must be unique across all organizations
- Only "Available" status items are shown publicly
- Internal fields (like costPesos, imei display) remain private
- Search functionality filters across all visible columns
