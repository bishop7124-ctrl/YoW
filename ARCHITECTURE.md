# Your Own World — Architecture & Developer Guide

A plain-English reference for how everything fits together. Written so that
future-you (or anyone else) can pick this up after a long gap and understand
what does what without reading the code first.

---

## Table of contents

1. [The one-paragraph summary](#1-the-one-paragraph-summary)
2. [Service map — what lives where](#2-service-map)
3. [Local development](#3-local-development)
4. [Environment variables — complete list](#4-environment-variables)
5. [How auth works](#5-how-auth-works)
6. [How project data saves and loads](#6-how-project-data-saves-and-loads)
7. [How billing works](#7-how-billing-works)
8. [Codebase map](#8-codebase-map)
9. [Common tasks — how do I...](#9-common-tasks)
10. [Deployment](#10-deployment)
11. [Limits and things to watch](#11-limits-and-things-to-watch)

---

## 1. The one-paragraph summary

Your Own World is a **React single-page app** (built with Vite) that writers use
to plan and draft stories. It's hosted on **Vercel**. User accounts, login
sessions, and all story data are stored in **Supabase** (a managed Postgres
database with a built-in auth layer). Subscriptions and payments are handled
by **Stripe**, whose serverless webhook and checkout functions live in
Vercel API routes. The AI assistant calls external AI providers
(OpenRouter / Google / Anthropic) directly from the browser using user-supplied
or app-level API keys.

---

## 2. Service map

```
┌─────────────────────────────────────────────────────────┐
│  VERCEL                                                 │
│                                                         │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │  Static frontend     │   │  API routes (Node.js)  │  │
│  │  React + Vite SPA    │   │                        │  │
│  │  /dist               │   │  /api/                 │  │
│  │                      │   │  ├ create-checkout-    │  │
│  │  Everything in       │   │  │   session.js        │  │
│  │  src/ compiles here  │   │  ├ create-customer-    │  │
│  │                      │   │  │   portal.js         │  │
│  └──────────────────────┘   │  └ stripe-webhook.js   │  │
│                             └────────────────────────┘  │
└──────────────┬──────────────────────┬───────────────────┘
               │ JS client (browser)  │ server-side calls
               ▼                      ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  SUPABASE            │   │  STRIPE                      │
│                      │   │                              │
│  • Auth              │   │  • Subscription products     │
│    Login / signup    │   │  • Checkout sessions         │
│    Sessions          │   │  • Customer portal           │
│    User metadata     │   │  • Webhooks → /api/stripe-   │
│                      │   │    webhook (Vercel)          │
│  • PostgreSQL DB     │   └──────────────────────────────┘
│    user_data table   │
│    scenes table      │   ┌──────────────────────────────┐
│    feedback table    │   │  AI PROVIDERS (browser)      │
│                      │   │                              │
└──────────────────────┘   │  OpenRouter (default)        │
                           │  Google AI Studio (optional) │
                           │  Anthropic (optional)        │
                           └──────────────────────────────┘
```

### Why this split?

| Concern | Why it lives there |
|---|---|
| Frontend on Vercel | Fast CDN, auto-deploys from git, generous free tier |
| API routes on Vercel | Same deployment — no separate service to manage; Vercel's function limits are much more generous than Supabase Edge Functions |
| Auth + DB in Supabase | Supabase's JS client lets the browser query the database directly (via its built-in REST API + row-level security). Replacing this would require rewriting dozens of data access calls and adding a server-side layer for every query |
| Stripe server-side | Stripe's secret key must never reach the browser |
| AI calls from browser | Low latency; no server-side proxying needed; users can bring their own keys |

---

## 3. Local development

### Quick start

```bash
# Install dependencies
npm install

# Copy and fill in env vars (see section 4)
cp .env.example .env.local

# Start the app (Vite only — no API routes)
npm run dev           # → http://localhost:5173
```

`npm run dev` is fine for **all UI work**. The billing buttons will fail
because `/api/*` routes don't exist in Vite's dev server — that's expected
and doesn't affect any other part of the app.

### When you need the API routes (billing)

```bash
# Install Vercel CLI globally if you haven't
npm install -g vercel

# Log in
vercel login

# Link the project (one-time)
vercel link

# Start with API routes enabled
npm run dev:vercel    # → http://localhost:3000
```

`vercel dev` starts a local emulator that serves both the Vite app and the
`/api` routes on the same port (3000). Set `SITE_URL=http://localhost:3000`
in `.env.local` when using this.

For Stripe webhooks in local dev, use the Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```
The CLI prints a webhook secret — put that in `STRIPE_WEBHOOK_SECRET` in
your `.env.local`.

---

## 4. Environment variables

All variables live in `.env.local` for local dev and in the
**Vercel dashboard** (Settings → Environment Variables) for production.

### Client-side (VITE_ prefix — visible in the browser bundle)

| Variable | What it is | Where to get it |
|---|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Supabase → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | Supabase → Settings → API |
| `VITE_CREATE_CHECKOUT_SESSION_URL` | Path to the checkout API route | Always `/api/create-checkout-session` |
| `VITE_CUSTOMER_PORTAL_URL` | Path to the portal API route | Always `/api/create-customer-portal` |
| `VITE_DEV_EMAIL` | Auto-fills login form in dev | Anything — only active when `import.meta.env.DEV` is true |
| `VITE_DEV_PASSWORD` | Auto-fills login form in dev | Anything |

AI provider keys are not environment variables at all: each user enters their own in the app, and they are stored encrypted server-side.

**Important:** Any variable with `VITE_` is bundled into the JavaScript that
users download. Never put a Stripe secret key or Supabase service role key
in a `VITE_` variable.

### Server-side (no prefix — only available in Vercel API routes)

| Variable | What it is | Where to get it |
|---|---|---|
| `SUPABASE_URL` | Same URL as `VITE_SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_ANON_KEY` | Same key as `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key — can bypass RLS and manage users | Supabase → Settings → API → service_role |
| `STRIPE_SECRET_KEY` | Stripe secret key | Stripe → Developers → API keys |
| `STRIPE_PRICE_ID` | The `price_xxx` ID for the membership product | Stripe → Products → your product → price |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret | Stripe → Developers → Webhooks → your endpoint |
| `SITE_URL` | The app's public URL | Your Vercel deployment URL in production |

---

## 5. How auth works

```
User fills in email + password
        │
        ▼
LoginPage.jsx calls signIn() or signUp()
        │
        ▼
AuthContext.jsx → supabase.auth.signInWithPassword() / signUp()
        │
        ▼
Supabase Auth validates credentials and returns a session JWT
        │
        ├── JWT stored in localStorage by the Supabase JS client
        │   (key: sb-{projectRef}-auth-token)
        │
        └── AuthContext listens for onAuthStateChange and sets user state

On page reload:
  AuthContext reads the cached session from localStorage synchronously
  (no network request) so the app renders immediately.
  Then validates in the background via supabase.auth.getSession().
```

### User object shape

The `user` object from `useAuth()` has two sets of metadata:

- `user.user_metadata` — set by the user (profile name, alias, bio, theme, etc.)
- `user.app_metadata` — set server-side only (Stripe subscription fields)

Never trust `app_metadata` from the client. The Stripe webhook is the only
thing that writes to it, via the service role key.

### Membership / trial

`src/utils/membership.js` reads `user.app_metadata.subscription_status`
and the user's `created_at` date to determine if they're:

- **Paid**: `subscription_status` is `active` or `trialing`
- **Trial active**: created less than 28 days ago and not yet paid
- **Read only**: trial expired and no active subscription

If a user hits the read-only limit, the store emits a
`membership-read-only` custom event that App.jsx catches to show a toast.

---

## 6. How project data saves and loads

All story data is stored as a single JSON blob in the `user_data` Supabase
table, plus a separate `scenes` table for manuscript text (which can get large).

```
user_data table:
  user_id  (FK → auth.users)
  data     (JSONB) — contains: novels, characters, locations,
                     lore, timelines, maps, outlines, ideas, etc.

scenes table:
  user_id   (FK → auth.users)
  scene_id  (text)
  data      (JSONB) — individual scene content
```

### Load flow (on login)

```
App.jsx detects user → calls loadUserData(userId)
        │
        ▼
firestoreSync.js queries user_data and scenes tables
        │
        ▼
Returns a flat object → importData() loads it into the Zustand store
        │
        ▼
All components read from useStore() — fully reactive
```

### Save flow (on every change)

The store's `save()` function is debounced and called by every mutation.
It calls `saveAppData(userId, storeSnapshot)` which does an **upsert**
on the `user_data` row. Scenes are saved individually via `saveSceneDoc()`.

### Row Level Security

Both tables have RLS enabled. Users can only read and write their own rows.
The policies check `auth.uid() = user_id`. No admin access is needed for
normal data operations.

---

## 7. How billing works

```
User clicks "Start paid membership"
        │
        ▼
AccountSettings.jsx POSTs to /api/create-checkout-session
  (sends the user's auth JWT in the Authorization header)
        │
        ▼
api/create-checkout-session.js:
  1. Verifies the JWT with Supabase → gets the user object
  2. Creates a Stripe Checkout Session
  3. Returns { url: "https://checkout.stripe.com/..." }
        │
        ▼
Browser redirects to Stripe-hosted checkout page
        │
        ▼ (after payment)
Stripe redirects back to /?billing=success
        │
        └── Meanwhile, Stripe fires webhooks to /api/stripe-webhook

api/stripe-webhook.js:
  1. Verifies the Stripe signature (prevents fake events)
  2. On checkout.session.completed: retrieves the subscription
  3. Writes stripe_customer_id, subscription_status, etc. into
     the user's app_metadata via Supabase Admin API
        │
        ▼
Next time the user's session is refreshed (or they reload),
getMembership() reads the new app_metadata and grants access.
```

### Webhook events handled

| Event | What happens |
|---|---|
| `checkout.session.completed` | Subscription created after first payment |
| `invoice.paid` | Subscription renewed |
| `invoice.payment_failed` | Payment failed (status goes to `past_due`) |
| `customer.subscription.updated` | Plan changed, cancelled, etc. |
| `customer.subscription.deleted` | Subscription ended |

### Updating the Stripe webhook URL

After deploying to Vercel, go to **Stripe → Developers → Webhooks** and
set the endpoint URL to:
```
https://your-app.vercel.app/api/stripe-webhook
```
Copy the new signing secret and set it as `STRIPE_WEBHOOK_SECRET` in
Vercel's environment variables. Redeploy for the change to take effect.

---

## 8. Codebase map

```
yow/
│
├── api/                          Vercel serverless functions (Node.js)
│   ├── create-checkout-session.js   Stripe checkout
│   ├── create-customer-portal.js    Stripe billing portal
│   └── stripe-webhook.js            Stripe event handler
│
├── src/
│   ├── App.jsx                   Root component, auth gate, global state
│   ├── main.jsx                  React entry point
│   ├── index.css                 All CSS — theme variables, layout, components
│   │
│   ├── supabase.js               Supabase client (singleton, used everywhere)
│   │
│   ├── context/
│   │   └── AuthContext.jsx       Auth state, signIn/signUp/signOut, user object
│   │
│   ├── store/
│   │   ├── useStore.js           All story data (Zustand-style), CRUD operations
│   │   └── mapStorage.js         Map-specific storage helpers
│   │
│   ├── utils/
│   │   ├── firestoreSync.js      Load/save story data to Supabase
│   │   ├── membership.js         Trial / paid / read-only status logic
│   │   ├── aiApi.js              AI provider abstraction (streaming)
│   │   ├── cookieConsent.js      document.cookie read/write for consent
│   │   ├── feedback.js           Submit help/feature requests to Supabase
│   │   ├── projectExport.js      Export a project as a ZIP
│   │   └── projectStats.js       Word counts, pacing stats
│   │
│   ├── components/
│   │   ├── Layout.jsx            The main studio shell (sidebar, tabs, AI bar)
│   │   ├── NovelManager.jsx      Project library screen
│   │   │
│   │   ├── auth/
│   │   │   ├── LoginPage.jsx     Home page + login/signup form
│   │   │   └── UserMenu.jsx      Avatar dropdown (account, help, legal links)
│   │   │
│   │   ├── account/
│   │   │   └── AccountSettings.jsx  Profile, membership, preferences/theme
│   │   │
│   │   ├── help/
│   │   │   └── HelpContact.jsx   Support message form → Supabase feedback table
│   │   │
│   │   ├── legal/
│   │   │   ├── CookieBanner.jsx  First-visit cookie consent banner
│   │   │   └── LegalModal.jsx    Privacy / Terms / Ethics / Cookie Policy pages
│   │   │
│   │   ├── about/
│   │   │   └── AboutPage.jsx     About / Roadmap / Feature Request modal
│   │   │
│   │   ├── ai/
│   │   │   ├── AIAssistant.jsx   Inline AI bar at the bottom of each section
│   │   │   └── AIPanel.jsx       Full floating chat panel
│   │   │
│   │   ├── presentation/
│   │   │   └── Studio.jsx        Layout primitives (StudioFrame, StudioWorkspace, etc.)
│   │   │
│   │   ├── dashboard/            Project overview & stats
│   │   ├── Manuscript/           Scene / chapter writing editor
│   │   ├── outline/              Story outline / beat board
│   │   ├── characters/           Character profiles
│   │   ├── familytree/           Relationship map
│   │   ├── Factions/             Factions / organisations
│   │   ├── Locations/            Location profiles
│   │   ├── lore/                 Lore entries
│   │   ├── ideas/                Notes / ideas board
│   │   ├── schedule/             Writing schedule calendar
│   │   ├── timeline/             Story timeline
│   │   ├── worldhistory/         World history
│   │   └── Map/                  Map builder
│   │
│   └── constants/
│       ├── projectTypes.js       Novel / short story / screenplay / etc. configs
│       └── factionIcons.js       SVG icon data for factions
│
├── supabase/
│   ├── functions/                Old Supabase Edge Functions (can be deleted
│   │                             once Vercel functions are confirmed working)
│   └── migrations/
│       └── 20260521_feedback.sql  Feedback table — run once in Supabase SQL editor
│
├── vercel.json                   Vercel config: SPA routing + function runtime
├── .env.example                  Template for all required environment variables
├── vite.config.mjs               Vite build config
└── tailwind.config.js            Tailwind setup
```

---

## 9. Common tasks

### Add a new section to the studio

1. Create `src/components/mysection/MySection.jsx`
2. Add it to `ALL_SECTIONS` in `Layout.jsx` with an `id`, `label`, and `icon`
3. Add the icon SVG paths to the `paths` object in the `Icon` component
4. Add the component to `databaseContent` in `Layout.jsx`
5. Add the section ID to `STUDIO_ROOMS` in `Layout.jsx` under the right room
6. Add the section ID to `ALL_SECTION_IDS` in `src/constants/projectTypes.js`
7. Add any default-on/off behaviour to the project type configs in `projectTypes.js`

### Add a new AI provider

Edit `src/utils/aiApi.js`:
1. Add the provider to the `PROVIDERS` object
2. Implement the `streamMessage` branch for the new provider
3. Add its `VITE_` API key variable to `.env.example`

### Add a new theme preset

In `src/components/Layout.jsx`, add an entry to `PRESET_THEMES`:
```js
{ id: 'mytheme', label: 'My Theme', description: '...', swatches: { bgMain, bgNav, textMain, textMuted, accent, border } }
```
Also add `[data-theme="mytheme"]` CSS variables to `src/index.css`
(follow the existing pattern) and add the preset to `ACCOUNT_PRESET_THEMES`
in `src/components/account/AccountSettings.jsx`.

### Change the trial period

Edit `TRIAL_DAYS` in `src/utils/membership.js`.

### Change the subscription price

1. Create a new price in the Stripe dashboard
2. Update `STRIPE_PRICE_ID` in Vercel's environment variables
3. Update `MEMBERSHIP_PRICE_GBP` in `src/utils/membership.js`

### Add a Vercel API route

Create `api/my-route.js`:
```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  // ... logic
  return res.status(200).json({ result: 'ok' })
}
```
Available at `/api/my-route`. No extra config needed.

### View feedback / support submissions

Log in to **Supabase → Table Editor → feedback**. You can filter by
`type` ('support' or 'feature_request') and `status` ('open', 'reviewed', etc.).

### Update a user's subscription manually

If a webhook misfired or you need to manually grant/revoke access:
1. Supabase dashboard → Authentication → Users → find the user
2. Edit their `app_metadata` directly
3. Set `subscription_status` to `active` (or `none` to revoke)

---

## 10. Deployment

### Automatic (normal workflow)

Push to the `main` branch. Vercel auto-deploys. Done.

### First-time production setup

1. **Connect repo to Vercel**
   - vercel.com → New Project → import your Git repo
   - Framework detected automatically as Vite

2. **Set environment variables in Vercel**
   - Vercel → Project → Settings → Environment Variables
   - Add every variable from `.env.example` that doesn't have a `VITE_DEV_` prefix
   - For `VITE_CREATE_CHECKOUT_SESSION_URL` and `VITE_CUSTOMER_PORTAL_URL`,
     use the relative paths (`/api/create-checkout-session`, etc.)

3. **Update Stripe webhook URL**
   - Stripe → Developers → Webhooks → Add endpoint
   - URL: `https://your-app.vercel.app/api/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.paid`
     - `invoice.payment_failed`
   - Copy the signing secret → set as `STRIPE_WEBHOOK_SECRET` in Vercel

4. **Apply the feedback table migration** (one-time)
   - Supabase → SQL Editor → paste contents of `supabase/migrations/20260521_feedback.sql`

5. **Supabase auth settings**
   - Authentication → URL Configuration → set Site URL to your Vercel URL
   - Add your Vercel URL to the allowed redirect URLs list

6. **Remove old Supabase Edge Functions** (optional, after confirming Vercel works)
   - Supabase → Edge Functions → delete create-checkout-session,
     create-customer-portal, stripe-webhook

---

## 11. Limits and things to watch

### Supabase free tier
| Resource | Limit | Notes |
|---|---|---|
| Database size | 500 MB | All story data is JSONB blobs. One user's data is typically 50–500 KB. ~1,000–10,000 users before this matters |
| Monthly active users | 50,000 | Unlikely to be a constraint |
| Auth emails | 30,000/month | Confirmation + password reset emails |
| Bandwidth | 5 GB/month | The Supabase client fetches data; not a likely constraint |

### Vercel free (Hobby) tier
| Resource | Limit | Notes |
|---|---|---|
| Serverless function invocations | 100 GB-hours / month | Vastly more than Supabase Edge Functions. 3 functions × occasional billing events = negligible |
| Bandwidth | 100 GB/month | Plenty |
| Deployments | Unlimited | |

### Things to monitor
- **Supabase database size**: the main long-term constraint. Manuscript text
  (scenes table) grows fastest. If approaching 500 MB, consider archiving
  old scenes or moving to a paid Supabase plan.
- **Stripe webhook failures**: check Stripe → Developers → Webhooks → your
  endpoint for any failed deliveries. Failed webhooks mean subscription
  status doesn't update.
- **AI API costs**: OpenRouter/Google/Anthropic costs scale with usage.
  Monitor from the respective dashboards.
