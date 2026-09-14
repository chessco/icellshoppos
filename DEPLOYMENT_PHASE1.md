# Phase 1 Deployment Runbook (probuyer.org)

This runbook is for the **first production launch**.

## 1) Current Status (done in code)

- Production build now passes locally (`npm run build`).
- TypeScript blockers were fixed across admin pages/routes and billing/register flows.
- `useSearchParams` pages are wrapped with `Suspense` to satisfy Next.js 16 build rules.
- Package versions are aligned (`next@16.1.6`, `tailwindcss@4.x`).

## 2) Environment Variables (Production)

Set these in Railway/Render:

### Required

- `DATABASE_URL` - Postgres connection string
- `SESSION_SECRET` - long random string (32+ chars)
- `STRIPE_SECRET_KEY` - Stripe secret key (live)
- `STRIPE_WEBHOOK_SECRET` - webhook signing secret (live)
- `MAILGUN_API_KEY`
- `MAILGUN_DOMAIN`
- `MAIL_FROM`

### Required for current app behavior

- `NEXT_PUBLIC_APP_URL` = `https://probuyer.org`

### Optional

- `SUPERADMIN_EMAIL`
- `PUBLIC_ORG_ID`

## 3) App Service Setup (Railway/Render)

- Runtime: Node.js (LTS)
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Health endpoint: `/api/system-health`

## 4) Database Migration Step

Run once on each production release:

- `npx prisma migrate deploy`

If your platform supports release/pre-deploy command, use it there.

## 5) Stripe Production Webhook

Use a single canonical endpoint:

- `https://probuyer.org/api/billing/webhook`

Listen to:

- `checkout.session.completed`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `payment_intent.succeeded` (optional in your current flow)

After creating webhook in Stripe dashboard, copy signing secret to `STRIPE_WEBHOOK_SECRET`.

## 6) Domain + DNS (probuyer.org)

- Point `probuyer.org` to your app service target.
- Configure `www` to redirect to apex (`probuyer.org`) or vice versa.
- Keep low TTL during cutover (300s), then increase after stable.

## 7) Post-Deploy Smoke Test

1. Open `https://probuyer.org/login`
2. Login and verify `/dashboard`
3. Verify `/public-inventory-settings`
4. Open one public slug URL (`https://probuyer.org/<slug>`)
5. Trigger a Stripe test/live checkout and verify webhook delivery
6. Check `/api/system-health`

## 8) Known Phase-1 Limitation (planned for Phase 2)

Receipt logo and a few config/history items are still local-browser storage based in parts of the UI. That is acceptable for Phase 1 launch, but Phase 2 should move logo storage to persistent backend/object storage.
