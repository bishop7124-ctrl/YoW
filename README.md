# YOW

YOW, short for Your Own World, is a local-first worldbuilding and writing workspace for planning novels.
It includes modules for character management, factions, locations, timeline/history, map building, and manuscript drafting.

## Features

- Multi-novel project manager
- Character database and family tree
- Factions and membership linking
- Locations atlas and map markers/regions
- Timeline and world history entries
- Manuscript editor with acts, chapters, scenes, and autosave
- Theme switching (midnight, aubergine, paper, ocean)

## Planning

[docs/ROADMAP.md](docs/ROADMAP.md) is the canonical planning source for launch scope, MVP acceptance criteria, post-launch work, icebox ideas, and confirmed bugs.

New launch features are frozen unless they replace an existing MVP item or fix a launch blocker.

## Tech Stack

- React 19
- Vite 8
- Tailwind CSS
- LocalStorage persistence (no backend required)

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Run lint checks:

```bash
npm run lint
```

## Stripe Subscriptions

Paid membership uses Stripe Checkout, Stripe Billing webhooks, and the Stripe customer portal through Supabase Edge Functions.

Create a monthly recurring Price in Stripe, then set these Supabase function secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=rk_test_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set SITE_URL=http://localhost:5173
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
```

Billing is served by the Vercel API routes in `api/`; the similarly named
Supabase Edge Functions are legacy copies and must not be deployed or wired
to Stripe. Configure the Stripe webhook endpoint to point at the production
Vercel route:

```text
https://www.yourownworld.co.uk/api/stripe-webhook
```

Subscribe it to `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.*` events. Configure the Stripe customer portal in the Stripe Dashboard so members can update payment methods and manage cancellation.

## Data Storage

Application data is saved in browser localStorage under `nf_*` keys.
Clearing browser storage will remove local project data.
