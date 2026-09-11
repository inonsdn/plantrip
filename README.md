# TripMate

บันทึกและหารค่าใช้จ่ายทริปกับเพื่อน — เพิ่มรายการได้ในไม่กี่วินาที และรู้ทันทีว่าใครต้องโอนให้ใครเท่าไร

TripMate is a collaborative trip-expense app: a group creates a trip, shares one
invitation link, everyone records what they spent, and the app works out the
smallest set of transfers that settles the group. All user-facing copy is in
Thai; code, schema and this document are in English.

> The product name lives in `src/lib/branding.ts`. Change `APP_NAME` there and
> the whole UI follows.

---

## Table of contents

- [Feature overview](#feature-overview)
- [Tech stack](#tech-stack)
- [Local setup](#local-setup)
- [Supabase project setup](#supabase-project-setup)
- [Running migrations](#running-migrations)
- [Google OAuth](#google-oauth)
- [Environment variables](#environment-variables)
- [Local development](#local-development)
- [Tests and checks](#tests-and-checks)
- [Seeding development data](#seeding-development-data)
- [Deploying to Vercel](#deploying-to-vercel)
- [Security notes](#security-notes)
- [Project structure](#project-structure)
- [How the money maths works](#how-the-money-maths-works)
- [Known limitations](#known-limitations)

---

## Feature overview

- **Google sign-in only.** No passwords to manage.
- **One-link invitations.** `/join/<token>` adds a signed-in visitor to the trip
  with no approval step. The owner can rotate the token; existing members keep
  their access.
- **Fast expense entry.** The default form is amount → description → payer →
  who it is split with → save. Everything else sits behind
  “รายละเอียดเพิ่มเติม”.
- **Five split methods.** Equal, exact amounts, percentages, share units
  (2:1:1), and a personal expense for one member.
- **Expenses that create no debt.** Tick
  “ไม่นำรายการนี้ไปคำนวณยอดที่ต้องโอน” and the amount still counts in trip
  totals, category and daily breakdowns, and each member's spending — but it
  creates no debt between members.
- **Multi-currency.** Each expense stores its own original amount, currency,
  exchange rate and converted base amount. Changing a trip's default rate never
  rewrites past expenses.
- **Settlement.** Net balances plus a debt-simplification pass produce direct
  instructions (“แพรว โอนให้ นนท์ ฿6,787.99”), with a recorded transfer history
  that can be undone.
- **Mobile first.** Bottom navigation with safe-area padding, bottom sheets
  instead of dialogs, 44px touch targets, no horizontal scrolling from 188px up.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4 |
| Database & auth | Supabase (PostgreSQL + Supabase Auth, Google provider) |
| Session handling | `@supabase/ssr` |
| Validation | Zod |
| Icons | Lucide |
| Money maths | integer minor units, `decimal.js` for parsing and conversion |
| Tests | Vitest |
| Hosting | Vercel |

There is no separate backend. Reads go through the Supabase client under Row
Level Security; writes that need server-side authorization go through Next.js
Server Actions and `SECURITY DEFINER` PostgreSQL functions.

---

## Local setup

Requirements: Node.js 20.9+ (22 recommended) and npm.

```bash
git clone <this-repo>
cd plantrip
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev
```

## Supabase project setup

1. Create a project at <https://supabase.com/dashboard>.
2. Open **Project Settings → API** and copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY`
3. Leave the **service_role** key where it is. TripMate does not need it (see
   [Security notes](#security-notes)).

## Running migrations

The migrations are plain SQL in `supabase/migrations/`, applied in filename
order:

| File | What it creates |
| --- | --- |
| `20240101000000_init.sql` | Tables, enums, constraints, indexes, `updated_at` triggers, profile-sync trigger |
| `20240101000100_rls.sql` | Authorization helper functions and every RLS policy |
| `20240101000200_functions.sql` | `create_trip`, `trip_preview_by_token`, `join_trip_by_token`, `regenerate_invite_token`, `remove_trip_member`, `leave_trip`, `delete_trip` |
| `20240101000300_save_expense.sql` | `save_expense` — writes an expense and its splits atomically |

**Option A — Supabase CLI (recommended):**

```bash
npm install -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL editor, no tooling to install:**

```bash
npm run db:bundle     # writes supabase/migrations.bundle.sql
```

Paste that one file into the Supabase SQL editor and run it. It wraps every
migration in a single transaction, so a fresh project either gets the whole
schema or nothing. The bundle is generated on demand and git-ignored — the
migrations stay the only source of truth.

**Option C — psql:**

```bash
for f in supabase/migrations/*.sql; do
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

**Option D — let Claude Code apply them.** `.mcp.json` in this repo configures
Supabase's hosted MCP server. Run Claude Code locally (not in a cloud session —
the OAuth step needs a browser), then:

```bash
claude /mcp     # select "supabase", then Authenticate
```

Once connected, Claude can run the migrations against the project directly.
Delete `.mcp.json` if you would rather not have the server configured.

## Google OAuth

Two different callback URLs are involved, and they go in different places.
Neither one belongs in Vercel — Vercel only gets the environment variables.

```
/login  →  Google consent screen
             redirect_uri = https://<project-ref>.supabase.co/auth/v1/callback   (1)
        →  Supabase receives the code
        →  https://<your-app>.vercel.app/auth/callback?code=…&next=…             (2)
        →  the page the user originally asked for
```

1. In **Google Cloud Console → APIs & Services → Credentials**, create an
   *OAuth client ID* of type **Web application**.
2. **Authorised redirect URIs** — URL (1), the *Supabase* callback, not your
   app's:
   - `https://<your-project-ref>.supabase.co/auth/v1/callback`

   *Authorised JavaScript origins* can be left empty: the browser never calls
   Google's JS SDK, it is a plain top-level redirect from `supabase.co`.
3. Copy the client ID and secret into **Supabase → Authentication → Providers →
   Google**, and enable the provider.
4. In **Supabase → Authentication → URL Configuration** set:
   - **Site URL**: `http://localhost:3000` while developing,
     `https://<your-app>.vercel.app` in production.
   - **Redirect URLs** — URL (2), your *app's* callback, one per environment:
     - `http://localhost:3000/auth/callback`
     - `https://<your-app>.vercel.app/auth/callback`
     - `https://<your-app>-*.vercel.app/auth/callback` for preview deployments

`next` is restricted to same-origin paths, so the callback cannot be used as an
open redirect.

## Environment variables

| Variable | Also accepted | Required | Notes |
| --- | --- | --- | --- |
| `SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Anon key; safe in the browser because RLS protects every table |
| `SITE_URL` | `NEXT_PUBLIC_SITE_URL` | yes | Absolute URL of this deployment. Used to render invitation links on the server, so it must match the domain people actually visit |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **no** | Not used. Joining a trip runs through a `SECURITY DEFINER` function instead |

**No `NEXT_PUBLIC_` prefix is needed.** Only one component talks to Supabase
from the browser — the Google sign-in button — and the sign-in page hands it the
URL and anon key as props. Everything else runs on the server. Both naming
conventions are read (`NEXT_PUBLIC_*` wins if both are set), so either works.

These are read from the server and the proxy (Edge) bundle, where Next.js inlines
them at build time: **changing a value on Vercel requires a redeploy**, not just a
restart.

`.env.example` holds placeholders only; never commit real values.

## Local development

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
npm start          # serve the production build
```

## Tests and checks

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest run
npm run build      # next build
```

The unit tests cover the parts that must never be wrong:

- `tests/money.test.ts` — minor-unit parsing, zero-decimal and three-decimal
  currencies, deterministic rounding, currency conversion, largest-remainder
  allocation.
- `tests/split.test.ts` — equal splits with indivisible satang, exact amounts,
  percentages, share units, personal expenses, and every validation rule.
- `tests/settlement.test.ts` — balances, excluded expenses, “everyone paid their
  own”, recorded settlements, debt simplification, zero-sum invariants, and the
  effect of editing or deleting an expense.
- `tests/trip-stats.test.ts` — the full Singapore demo trip: totals, pre-trip
  split, category and daily breakdowns, per-member figures, and the exact
  transfer instructions.

`tests/fixtures/singapore-trip.ts` is the same data as the development seed, so
the tests assert the numbers you will actually see in the seeded app.

## Seeding development data

The seed builds a 4-day Singapore trip for **นนท์ / มิว / แพรว** in THB with SGD
as a secondary currency at 1 SGD = 26 THB. It includes a shared hotel and
flight, tickets shared by two members only, personal food and shopping, shared
meals, transport where everyone paid individually, and a pre-trip expense that
is excluded from settlement. Total: **฿52,308.00**.

1. Sign in to the running app once with Google (this creates your user).
2. Run the seed against your **development** database:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed/dev_seed.sql
```

The trip is attached to the most recently created user — you. มิว and แพรว are
seeded as members without accounts; they can claim their own membership later
through the invitation link. Re-running the seed replaces the previous demo
trip.

**Never run this against production.** It is not wired into any build step.

## Deploying to Vercel

1. Push this repository to GitHub and import it at
   <https://vercel.com/new>. Vercel detects Next.js automatically.
2. Add the environment variables for **Production**, **Preview** and
   **Development**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SITE_URL` = `https://<your-app>.vercel.app`
3. Deploy.
4. Go back to **Supabase → Authentication → URL Configuration** and add the real
   Vercel URL to **Site URL** and **Redirect URLs**
   (`https://<your-app>.vercel.app/auth/callback`).
5. Add the same origin to the Google OAuth client's **Authorised JavaScript
   origins**.
6. Redeploy after changing any of these variables — they are inlined at build
   time, so a saved change does not reach a running deployment on its own.
7. Verify on the deployed URL: sign in with Google, create a trip, copy the
   invitation link, open it in a different browser profile with a second Google
   account, add expenses from both accounts, and check the settlement page.

`vercel.json` pins the Singapore region; change `regions` if your users are
elsewhere.

## Security notes

- **RLS is on for every user table** (`profiles`, `trips`, `trip_currencies`,
  `trip_members`, `expenses`, `expense_splits`, `settlements`). Authorization is
  enforced in the database, not by hiding buttons.
- **`trip_members` has no INSERT policy.** The only ways to become a member are
  `public.create_trip()` and `public.join_trip_by_token()`, both
  `SECURITY DEFINER` functions that validate `auth.uid()` and the invitation
  token themselves. A client cannot add itself to an arbitrary trip.
- **Cross-trip data is impossible by construction.** `expenses`,
  `expense_splits` and `settlements` reference `trip_members(id, trip_id)` via
  composite foreign keys, so a payer, a split member or a settlement party from
  another trip is rejected by the database — not just by the UI.
- **A malicious client cannot forge a split.** Server Actions recompute every
  split amount from the trip's own member list before writing, and
  `save_expense()` refuses to write unless the splits add up to the expense
  total.
- **Owner-only operations** (rename the trip, rotate the invitation link, remove
  a member, delete the trip) check ownership inside the database function.
- **Members can only rename themselves.** A trigger rejects any attempt by a
  non-owner to change a role, a `user_id`, or a `removed_at` flag.
- **Nothing is hard-deleted.** Trips, expenses and memberships are soft-deleted
  so financial history survives; removing a member keeps every expense they are
  part of.
- **Email addresses are never exposed.** Other members only ever see the display
  name and avatar stored on `profiles` / `trip_members`.
- **No service-role key.** The browser and the server both use the anon key, so
  there is no elevated credential to leak. The anon key reaches the browser only
  as a prop on the sign-in page; no other client bundle references it.
- **Invitation tokens** are 24 random bytes, base64url-encoded, and rotating one
  invalidates the old link immediately.

## Project structure

```
src/
  app/                      routes (App Router)
    auth/callback/          OAuth code exchange + profile sync
    join/[inviteToken]/     invitation landing page
    trips/                  trip list, create, and the trip tabs
  components/
    auth/                   Google sign-in button
    expense/                expense form, split editor, expense list
    nav/                    top bar
    trip/                   shell + navigation, dashboard, settlement, members
    ui/                     button, card, field, sheet, toast, states, avatar
  lib/
    actions/                server actions (trips, expenses, settlements, members)
    queries/                server-side read queries
    supabase/               browser client, server client, session refresh, types
    money.ts                minor units, rounding, allocation, formatting
    split.ts                the five split methods
    settlement.ts           balances and debt simplification
    trip-stats.ts           dashboard aggregations
    validation.ts           Zod schemas
  proxy.ts                  session refresh + route protection
supabase/
  migrations/               schema, RLS, functions
  seed/dev_seed.sql         development-only demo trip
tests/                      Vitest calculation tests
```

## How the money maths works

Every authoritative calculation uses **integer minor units** (satang for THB,
whole yen for JPY, and so on). Floating point is never used for money.

1. The user types an amount in any currency.
2. `convertToBaseMinor()` multiplies it by the exchange rate using `decimal.js`
   and rounds **once**, half away from zero, to the base currency's smallest
   unit.
3. `computeSplits()` divides that integer among members. Indivisible units are
   handed out by the largest-remainder method, ties broken by member order, so
   the result is deterministic and the parts always add back up to the total.
4. `computeBalances()` nets what each member paid against what they owe, applies
   recorded transfers, and `simplifyDebts()` greedily matches the largest
   creditor with the largest debtor — at most *members − 1* transfers.
5. The database stores `numeric(16,2)` amounts and `numeric(20,8)` rates; nothing
   is ever stored as a float.

The database keeps `original_amount`, `currency_code`, `exchange_rate` and
`base_amount` per expense, so updating a trip's default rate changes only what
the *next* expense is pre-filled with.

## Known limitations

- Members added by the seed without a Google account are placeholders. When the
  real person joins through the invitation link they get their own membership
  row rather than claiming the placeholder; move expenses over by editing them.
- There is no realtime channel. Pages revalidate after your own writes and on
  navigation, so another member's change appears on the next load or refresh.
- The trip base currency is fixed after creation. Secondary currencies and their
  rates can be added or changed at any time.
- Debt simplification minimises the number of transfers, which can pair members
  who never directly owed each other. That is the point, but it can surprise
  people expecting a literal “who owes whom” list.
- Soft-deleted trips and expenses stay in the database and are not exposed
  anywhere in the UI; clean-up is a manual database task.
