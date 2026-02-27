# Garden OS

Production-oriented Astro + Tailwind + Netlify app for custom-space garden planning, timeline generation, reminders, and monetization (Blueprint + subscriptions).

## Stack

- Astro (SSR)
- Tailwind CSS
- Netlify deploy + Netlify Functions + Scheduled Functions
- Neon Postgres
- Clerk auth
- Stripe (one-time + subscriptions)

## Features

- Custom garden spaces with multiple areas (name/type/sqft/sun/notes)
- ZIP-based location profile cache (zone + frost windows)
- Plant library and planner with capacity warnings
- Schedule engine: frost-relative rules -> concrete tasks (with ranges)
- Task actions: complete + snooze
- Blueprint purchase (Stripe checkout) + generated PDF with permanent URL
- Subscription tiers and feature gates (BASIC, PLUS, ULTRA)
- Daily scheduled reminder emails for PLUS/ULTRA with duplicate prevention
- Push notification groundwork (service worker + push_subscriptions table)

## Project Structure

- `src/pages`: Astro routes (marketing + app)
- `src/lib`: DB, services, schedule engine
- `netlify/functions`: API + webhook + scheduled jobs + blueprint generation
- `db/migrations`: SQL schema
- `db/seeds`: starter plants + task templates
- `tests`: schedule engine tests

## Environment Variables

Set these in Netlify and locally (`.env`):

- `DATABASE_URL`
- `CLERK_SECRET_KEY`, `PUBLIC_CLERK_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BLUEPRINT`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_PLUS`, `STRIPE_PRICE_ULTRA`
- `ZONE_API_KEY`, `FROST_API_KEY`
- `EMAIL_PROVIDER_KEY`, `EMAIL_FROM`
- `STORAGE_BUCKET`, `STORAGE_PUBLIC_BASE_URL`
- `APP_URL`

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run migrations:
   ```bash
   npm run db:migrate
   ```
3. Seed plant/task data:
   ```bash
   npm run db:seed
   ```
4. Start dev server:
   ```bash
   npm run dev
   ```

## Stripe Setup

- Create products/prices for Blueprint, Basic, Plus, Ultra.
- Put price IDs in env vars.
- Configure webhook endpoint:
  - `/.netlify/functions/stripe-webhook`
- Subscribe to events:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

## Netlify Deploy

1. Connect repo to Netlify.
2. Ensure build settings from `netlify.toml` are used.
3. Add all env vars in Netlify UI.
4. Deploy.
5. Scheduled reminders run daily via:
   - `netlify/functions/send-reminders` at `0 13 * * *`.

## Pricing / Tier Gating

- Blueprint PDF download requires completed Blueprint purchase.
- Reminders require PLUS or ULTRA.
- Ultra-specific insights require ULTRA.

## Schedule Engine Rules

`task_templates.offset_days_from_event` applies to `LAST_FROST` or `FIRST_FROST` date ranges from `location_profiles`.

- Example:
  - Tomatoes: `-49` days from last frost (6-8 weeks)
  - Cucumbers: `+10` days from last frost (1-2 weeks)
  - Bell peppers: `-63` days from last frost (8-10 weeks)

Engine output includes `due_start`, `due_end`, and midpoint `due_date`.

## Notes

- External zone/frost providers are pluggable; current service stubs include expected shape and fallback heuristics.
- Email uses Resend API format by default in `src/lib/services/email.ts`.
- Blob storage uses `@netlify/blobs` for public PDF URL persistence.
# garden
