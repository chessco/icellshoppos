# iCellShop POS - SaaS Conversion Plan

## Overview
Converting internal inventory/sales management app into a multi-tenant SaaS platform for mobile/electronics shops to manage inventory, sales, and pricing.

---

## 1. USER ROLES & HIERARCHY

### Role: SUPER ADMIN
- **Email**: arturo.dltv@gmail.com
- **Access**: 
  - View all organizations/customers
  - Manage admin users
  - Manage subscriptions & billing
  - View usage analytics
  - System-wide settings
  - Cannot access org-specific data (inventory, sales)

### Role: ADMIN (Paying Customer)
- **Access**: 
  - Full access to their own organization's data
  - Manage their own inventory, sales, pricing
  - Add/remove team members (Team Members)
  - View their subscription status
  - Cannot see other organizations' data
  - Cannot access billing/payment settings directly (might need Super Admin)

### Role: TEAM MEMBER (Optional - future)
- **Access**: 
  - Limited access within their admin's organization
  - Can perform sales checkout
  - Can add inventory items
  - Cannot modify pricing rules or delete data
  - Cannot manage users

---

## 2. MULTI-TENANCY ARCHITECTURE

### Data Isolation Strategy
**Option A: Shared Database with Organization ID (SIMPLER)**
- Single Google Sheet for all organizations
- Add `organization_id` column to every data type
- Simpler deployment, lower cost
- Risk: Data breach affects all orgs

**Option B: Separate Database per Organization (SAFER)**
- Each org has their own Google Sheets workspace
- Complete data isolation
- Higher operational complexity
- Higher cost per org

**RECOMMENDATION**: Start with Option A (shared DB with org_id), migrate to Option B later if needed

### Key Tables to Add org_id
- Inventory rows
- Sales rows
- Pricing records
- Deleted devices history
- Suppliers
- Customers (wholesale)
- Status options
- Exchange rates
- Receipt logos

---

## 3. AUTHENTICATION & AUTHORIZATION

### Current State
- Google OAuth sign-in with `access_token` stored in localStorage
- No user management system

### Changes Needed

**Database Schema Addition**
```
Users table:
- user_id (unique)
- email (unique)
- password_hash (encrypted)
- role (superadmin | admin | team_member)
- organization_id (null for superadmin)
- created_at
- status (active | inactive)
- subscription_status (if admin)

Organizations table:
- org_id (unique)
- name
- admin_email
- admin_id (FK to Users)
- subscription_plan (free | starter | pro | enterprise)
- subscription_status (active | paused | cancelled)
- max_team_members
- created_at

Subscriptions table:
- subscription_id
- org_id
- plan_type
- price_per_month
- billing_date
- payment_status (paid | overdue | cancelled)
- stripe_customer_id (if using Stripe)
- created_at
- expires_at
```

### Authentication Flow
1. User logs in with email + password (or Google OAuth for existing users)
2. Generate JWT token with: user_id, role, organization_id
3. Store JWT in httpOnly cookie (more secure than localStorage)
4. Every API call validates JWT + checks organization_id
5. Super Admin can switch org context (view as admin)

---

## 4. SUBSCRIPTION & BILLING MODEL

### Pricing Tiers (PROPOSAL)
- **Free Tier** (14-day trial)
  - Max 100 inventory items
  - Max 10 sales per day
  - No tech support
  - Watermark on reports

- **Starter** ($29/month)
  - Unlimited inventory
  - Unlimited sales
  - 1 team member
  - Basic support
  - No watermarks

- **Pro** ($79/month)
  - Everything in Starter
  - Unlimited team members
  - Priority support
  - Advanced analytics
  - Custom branding options

- **Enterprise** (Custom pricing)
  - Everything in Pro
  - Dedicated support
  - Custom integrations
  - SLA guarantee
  - White-label option

### Payment Processing
- **Option A**: Stripe integration
  - Most professional, takes 2.9% + $0.30 per transaction
  - Handles recurring billing, invoices, customer management
  
- **Option B**: MercadoPago (if targeting Latin America)
  - More relevant for your market
  
- **Option C**: PayPal
  - More friction, not recommended

**RECOMMENDATION**: Stripe (industry standard, good for scaling)

### Billing Cycle
- Monthly subscription (auto-renew)
- 3-day grace period if payment fails
- Cancel anytime
- Prorated refunds for unused time

---

## 5. DATA STORAGE & SHEET MANAGEMENT

### Current Limitation
- Single Google Sheet workbook
- Can't scale to multiple organizations

### Solution Options

**Option 1: One Master Sheet + Org Tabs**
- Single workbook with tabs for each organization
- Formula: `=FILTER(Data!A:Z, Data!B:B="org123")`
- Simple but becomes unwieldy with many orgs

**Option 2: Separate Workbooks per Organization**
- Each org has their own Google Sheet
- Store workbook_id & sheet_ids in `Organizations` table
- Requires managing multiple API credentials
- Better isolation & performance

**Option 3: Migrate to Real Database (Future)**
- PostgreSQL / Firestore / MongoDB
- Required for serious scaling
- Migration path: Google Sheets → Real DB via ETL

**RECOMMENDATION**: Start with Option 1 (simpler, familiar), plan migration to real DB when you reach 50+ organizations

---

## 6. SUPER ADMIN DASHBOARD

### Features Required
```
Dashboard Page (/admin)
├── Organizations Overview
│   ├── Total active orgs
│   ├── MRR (Monthly Recurring Revenue)
│   ├── Active subscriptions by tier
│   └── Churn rate
│
├── Organization Management
│   ├── List all organizations
│   ├── View each org's:
│   │   - Admin name & email
│   │   - Subscription tier & status
│   │   - Last login
│   │   - Total inventory items
│   │   - Total sales (MoM)
│   ├── Action buttons:
│   │   - View organization as admin (impersonate)
│   │   - Suspend/reactivate
│   │   - Edit subscription tier
│   │   - View audit logs
│   │   - Delete organization (archive)
│
├── User Management
│   ├── Add new admin (send onboarding email)
│   ├── List all admins
│   ├── Reset password
│   ├── Deactivate user
│   ├── Assign/change subscription
│
├── Billing & Revenue
│   ├── Revenue dashboard
│   │   - Daily/monthly revenue graph
│   │   - MRR breakdown by plan
│   │   - Failed payments this month
│   ├── Billing settings
│   │   - Stripe API keys
│   │   - Payment history
│   │   - Refunds log
│
├── System Logs
│   ├── Login attempts
│   ├── Failed payments
│   ├── API errors
│   ├── Data migrations
│
└── Settings
    ├── Pricing tiers (edit prices)
    ├── Email templates
    ├── Feature flags
    ├── Maintenance mode
```

---

## 7. ADMIN (PAYING CUSTOMER) CHANGES

### New Admin Dashboard Pages
```
/dashboard (admin only)
├── Subscription Status
│   ├── Current plan
│   ├── Usage (inventory items, sales count)
│   ├── Next billing date
│   ├── Upgrade/Downgrade options
│
├── Team Management (if enabling team members)
│   ├── Invite team member
│   ├── Manage permissions
│   ├── Remove team member
│
└── Billing (view-only for now)
    ├── Invoice history
    ├── Payment method
    ├── Download receipts
```

### Access Control
- All existing pages get `organization_id` filtering
- Show only their organization's data
- API routes validate org_id from JWT token

---

## 8. ONBOARDING FLOW FOR NEW ADMINS

### Step 1: Sign Up
- Email + Password (or Google SSO)
- Business name
- Country/timezone

### Step 2: Payment
- Choose plan tier
- Enter payment details (Stripe)
- Subscription starts immediately (or 14-day trial for Free tier)

### Step 3: Platform Access
- Welcome email with login link
- Guided intro tour (optional)
- Pre-populated dummy data for testing OR start fresh
- Links to docs/support

### Step 4: Team Invite (Pro+)
- Copy invite link
- Invite team members
- Manage their roles

---

## 9. TECHNICAL IMPLEMENTATION ROADMAP

### Phase 1: Foundation (2-3 weeks)
- [ ] Create Users & Organizations tables in Sheets (or migrate to DB)
- [ ] Build authentication system (JWT, password hashing)
- [ ] Add `organization_id` to all existing data tables
- [ ] Update all API routes to filter by `organization_id`
- [ ] Build login/sign-up pages
- [ ] Super Admin page skeleton

### Phase 2: Super Admin Features (2 weeks)
- [ ] Organization management CRUD
- [ ] Admin user management
- [ ] Subscription tier assignment
- [ ] Analytics dashboard (orgs, revenue, etc.)
- [ ] Impersonation feature (view as admin)

### Phase 3: Billing Integration (2 weeks)
- [ ] Stripe integration
- [ ] Subscription management API
- [ ] Invoice generation
- [ ] Payment tracking in Sheets/DB

### Phase 4: Admin Dashboard (1 week)
- [ ] Admin dashboard pages
- [ ] Subscription status display
- [ ] Team management (if needed now)
- [ ] Usage analytics

### Phase 5: Onboarding & Polish (1 week)
- [ ] Sign-up flow
- [ ] Welcome emails
- [ ] Documentation
- [ ] Error handling & logging

### Phase 6: Testing & Launch (1 week)
- [ ] End-to-end testing
- [ ] Security audit
- [ ] Performance testing
- [ ] Beta launch with select customers

---

## 10. SECURITY CONSIDERATIONS

### Critical
- [ ] Password hashing (bcrypt, never plain text)
- [ ] JWT token expiration (15 min access, 7 day refresh)
- [ ] HTTPS only (never HTTP)
- [ ] httpOnly cookies (prevent XSS attacks)
- [ ] Environment variables for secrets (never commit API keys)
- [ ] SQL injection prevention (if using DB)
- [ ] Rate limiting on login attempts
- [ ] API request validation (org_id always server-verified)

### Important
- [ ] Audit logs (who accessed what, when)
- [ ] User activity logging
- [ ] Payment data compliance (PCI DSS via Stripe)
- [ ] GDPR compliance (export/delete user data)
- [ ] Backup strategy

---

## 11. DEPLOYMENT & HOSTING

### Current Stack
- Next.js (frontend + API routes)
- Google Sheets (data storage)
- Deployed on... (Where is it currently?)

### For SaaS, Consider
- **Frontend**: Vercel (easy Next.js deployment)
- **Backend**: Vercel Serverless or own server
- **Database**: 
  - Keep Google Sheets (cheap, simple) for now
  - Migrate to Firestore/PostgreSQL later
- **Authentication**: Auth0 or NextAuth.js
- **Payment**: Stripe
- **Email**: SendGrid or AWS SES
- **Monitoring**: Sentry (error tracking), LogRocket (session replay)

---

## 12. DECISIONS NEEDED FROM YOU

1. **Database**: Stay with Google Sheets or migrate to real DB?
   - Sheets: Easier initial launch, harder to scale
   - DB: More complex, better for 100+ customers

2. **Pricing Tiers**: Do these prices work for your market?
   - Too high? Too low?
   - Different pricing for Latin America?

3. **Team Members Feature**: Include from day 1?
   - If yes: Need role-based permissions
   - If no: Just Super Admin + Admin for now

4. **Trial Period**: Free 14-day trial or immediate payment?
   - Trial = higher conversion but delayed revenue
   - Immediate payment = lower conversion

5. **Existing Customer Migration**: How to handle current use?
   - Is this replacing your current usage?
   - Do you need to migrate your own data?

6. **Timeline**: How quickly do you want to launch?
   - MVP in 4-6 weeks?
   - Full-featured in 2-3 months?

7. **Compliance**: Do you need:
   - GDPR support (Europe)?
   - SOC 2 certification?
   - Custom integrations?

---

## Summary

**What we're building**:
- Multi-organization inventory/sales management SaaS
- Super Admin control panel for managing customers
- Stripe billing integration
- Team member support

**Risks to address early**:
- Data isolation (Google Sheets won't scale beyond ~100 orgs)
- Security (multi-tenant systems have higher attack surface)
- Customer support (now you have customers with issues)

**Next Steps**:
1. Answer the 7 decision questions above
2. Review this plan together
3. Start Phase 1: Foundation & Authentication
4. Build MVP Super Admin page
5. Stripe integration
6. Beta test with 3-5 pilot customers

Let me know your thoughts!
