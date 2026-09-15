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
- [Itinerary planner and routing providers](#itinerary-planner-and-routing-providers)
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
- **Members without accounts.** Add someone by name and split with them straight
  away — no invitation needed. If they join later, the owner can link the name
  to their account and the recorded history follows, or leave the two separate.
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
- **Settlement, item by item, confirmed by the receiver.** Every expense's
  debts are listed separately — “แพรว → นนท์ ฿2,000 · ตั๋วกระเช้าภูเขา” — so each
  can be settled on its own rather than as one netted lump sum. Pressing
  “โอนแล้ว” on money owed to someone else only files a claim; nothing counts as
  settled until the person being paid confirms it arrived. Undoing a payment
  removes it, so the history only ever lists transfers that stand.
- **Itinerary planner.** Each day is an ordered list of places with a journey
  between every pair. Type a name, when you mean to get there and how long you
  are staying — nothing else is required. Seven ways to travel per leg (เดิน,
  รถส่วนตัว, แท็กซี่, รถสาธารณะ, รถไฟ, เครื่องบิน, เรือ), drag a card by its
  numbered rail to reorder it (with a finger too, not only a mouse), move a
  place to another day, and take one out of the plan without deleting it. The
  list itself stays a list: a card shows only its number, name, arrival and
  departure, and how long you stay. Tapping one opens a dialog holding the
  place and its onward journey together, saved on “ยืนยัน” and thrown away on
  “ยกเลิก” — a failed save keeps the dialog open with the edits intact.
  Arrival and departure times are computed once from the day's start time, the
  travel times and how long you spend at each stop — never stored, never
  guessed. Both a journey with no travel time and a stop whose stay is
  “ไม่ระบุ” are reported as unknown, and every time after them with them,
  rather than being counted as zero.
- **Journeys can become expenses, but never on their own.** A fare a provider
  quotes is labelled “ประมาณการ” and stays out of every total.
  “บันทึกเป็นค่าใช้จ่าย” opens the ordinary expense form prefilled, and nothing
  is recorded until the real amount, payer and split are confirmed. Editing or
  deleting the plan afterwards never changes a recorded expense.
- **Mobile first.** Bottom navigation with safe-area padding, bottom sheets
  instead of dialogs, 44px touch targets, no horizontal scrolling from 188px up.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, TypeScript strict) |
| Styling | Tailwind CSS v4 (lavender brand palette in `src/app/globals.css`) |
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
| `20240101000400_manual_members.sql` | `add_trip_member` (a seat for someone with no account) and `claim_trip_member` (owner links that seat to an account once they join) |
| `20240101000500_expense_settlements.sql` | `settlements.expense_id`, so a payment can record which single expense it cleared |
| `20240101000600_settlement_confirmation.sql` | Trigger enforcing that only the member being paid can mark a debt settled; anyone else's press records a `pending` claim |
| `20240101000700_itinerary.sql` | `itinerary_days`, `itinerary_stops`, `itinerary_leg_preferences`, `itinerary_route_cache`, the itinerary columns on `expenses`, and the trigger that refuses a cross-trip reference |
| `20240101000800_itinerary_rls.sql` | RLS on every itinerary table, plus `bump_itinerary_day`, `reorder_itinerary_stops` and `move_itinerary_stop` |
| `20240101000900_itinerary_budget.sql` | `itinerary_request_budget` and `consume_itinerary_budget` — the server-side daily ceiling on outbound routing calls |
| `20240101001000_save_expense_itinerary.sql` | `save_expense` carries the optional itinerary reference |
| `20240101001100_itinerary_modes.sql` | Adds เครื่องบิน / รถไฟ / เรือ / แท็กซี่ to `transport_mode`, and makes a stop's coordinates optional |
| `20240101001200_optional_visit_duration.sql` | "อยู่ที่นี่นานเท่าไร" may be left unanswered |
| `20240101001300_leg_notes.sql` | A note on the journey itself, not just on the place |
| `20240101001400_rls_performance.sql` | Rewrites every policy to compare against a set built once per query instead of calling a `SECURITY DEFINER` helper per row, and adds the `trip_id` indexes the itinerary queries were missing |
| `20240101001500_write_amplification.sql` | `on_auth_user_created` fires on insert only, and `reorder_itinerary_stops` writes each stop once instead of twice |
| `20240101001600_join_returns_instead_of_raising.sql` | A dead invite token returns null instead of raising, so it neither aborts the transaction nor hides itself from `pg_stat_statements` |

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

On a project that already has some migrations applied, bundle only what is
left — re-running an applied migration fails on objects that already exist:

```bash
npm run db:bundle -- --from 20240101000700   # the itinerary planner onwards
```

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
| `SITE_URL` | `NEXT_PUBLIC_SITE_URL` | no | Optional canonical domain. Invitation links are built from the incoming request, so they already match the domain a member is on; this is only a fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **no** | Not used. Joining a trip runs through a `SECURITY DEFINER` function instead |
| `ITINERARY_ROUTE_PROVIDER` | — | no | Routing/places provider id. Unset (or `none`) means routing is switched off and every leg says so |
| `ITINERARY_DAILY_ROUTE_BUDGET` | — | no | Outbound routing calls allowed per UTC day across the whole application. Default `500`; `0` disables routing entirely |

**No `NEXT_PUBLIC_` prefix is needed, and none should be added.** Nothing in
this app talks to Supabase from the browser: sign-in starts in a server action
that builds the Google authorize URL and the PKCE verifier server side, so the
project URL and anon key never leave the server. Both naming conventions are
read (`NEXT_PUBLIC_*` wins if both are set) — but setting the `NEXT_PUBLIC_`
ones would inline the key into the client bundle and undo that.

This matters more than "the anon key is public by design" suggests. The key was
once passed to the sign-in button as a prop, which put it in the HTML of a page
anything can fetch. Row level security meant no data was ever readable with it,
but scrapers still used it to call the REST API: `pg_stat_statements` showed
**25.6 million** PostgREST request set-ups against roughly **6,000** queries
from the application itself, and the project sat at 100% CPU. `tests/
no-client-secrets.test.ts` fails the build if a client component ever reaches
for the Supabase environment again.

If the key has already been scraped, rotate it (Dashboard → Settings → API)
*after* deploying a version that no longer ships it — otherwise the new one is
scraped within days too.

These are read from the server and the proxy (Edge) bundle, where Next.js inlines
them at build time: **changing a value on Vercel requires a redeploy**, not just a
restart.

`.env.example` holds placeholders only; never commit real values.

## Itinerary planner and routing providers

`/trips/<id>/itinerary` ("แผนการเดินทาง") plans each day as an ordered list of
places with the journeys between them.

**Edits do not wait.** List changes — reordering, adding, deleting and its undo,
moving a place to another day — appear immediately and are reconciled in the
background by a serial queue (`use-itinerary-queue.ts`). Requests go out one at
a time because they all bump the same day's `version`; sending two at once would
make the second one's expected version stale and the server would reject an edit
that was in conflict with nothing. When the server refuses, the whole batch is
dropped, the list snaps back to what the server actually holds, and a toast says
what failed and offers to retry it. The edit dialogs still wait for their own
"ยืนยัน", so a failure is shown where the edits are.

Nothing calls `router.refresh()` after a successful action any more:
`revalidatePath` inside a server action already returns the re-rendered page
with its response, so refreshing again rendered the whole route a second time
and doubled the wait for every edit.

**What is stored, and what is derived.** `itinerary_days` holds the day's local
start time, IANA time zone, default transport mode and an optimistic-concurrency
`version`. `itinerary_stops` holds the places, how long to spend at each (null when that
is left unanswered), and when you mean to arrive. Coordinates are optional — a place typed by hand has none — and
are kept only for a future map or routing provider.
`itinerary_leg_preferences` holds one row per **ordered pair of stops** — its
mode, chosen route, manual duration and map visibility. Arrival, departure,
waiting and totals are **never stored**: `src/lib/itinerary/schedule.ts` is the
single calculation and everything on screen comes from it, so there is no second
copy to drift.

Because a leg is keyed by its pair of stops rather than by position, reordering
or disabling a stop can never hand one journey's saved route to a different
journey — the key simply stops matching and the new pair takes the day's default.
Put the order back and the saved settings come back with it.

**"รวมในแผน"** excludes a stop from the plan: the day recomputes as if it were
not there (A→B→C becomes A→C) while the stop and its data stay.

**This deployment runs with no routing provider and no map**, by choice: the
plan is a hand-written list and travel times are entered per leg. Nothing has to
be configured for the planner to work, and there is no third-party bill. The
sections below describe what changes if you ever want to connect a provider.

**No routing provider is configured out of the box.** Without
`ITINERARY_ROUTE_PROVIDER`, `getRouteProvider()` returns a provider that answers
`not_configured` to everything and returns **no** durations, distances or
geometry. That is deliberate: a plausible-looking straight line or a guessed
duration would be indistinguishable from a real answer. A leg with no provider
result and no manual duration is marked unknown, and every arrival after it is
reported as "ยังคำนวณไม่ได้" rather than silently assuming zero. Enter a time
under "ระบุเวลาเอง" to complete the plan by hand.

In this mode the planner makes **no outbound requests at all**: place search is
hidden in favour of typing a name, and an unset travel time reads as
"ยังไม่ได้ระบุเวลาเดินทาง" rather than as a provider failure. A leg is only ever
sent to a provider when both of its places have coordinates.

**Adding a provider.** Implement `RouteProvider`
(`src/lib/itinerary/providers/types.ts`) and register it in
`src/lib/itinerary/providers/index.ts`. Before you do, check that provider's
current terms for the regions you care about:

- Does it cover the countries you plan in, for **each** mode you offer? Map tiles
  are not routing, and OpenStreetMap data on its own is not a transit schedule.
- Does it return public-transport itineraries there, with the departure time
  honoured — and what does it do for a date outside its schedule window? The UI
  has an explicit `outside_schedule_window` state; use it rather than
  substituting a different date.
- What may be cached, and for how long? `cachePolicy` exists so a provider that
  forbids caching is not cached. `itinerary_route_cache` carries the provider,
  an expiry and the attribution, and should only be used where caching is
  permitted.
- What attribution must be displayed? Return it in `attribution`; the panel and
  the map both show it.
- How is the quota enforced — and what happens past it? A free tier is usually a
  billing threshold, not a hard stop, and a billing alert is a notification, not
  a cap.

**Cost controls that are already in place.** Requests are debounced (400 ms) and
answered from an in-memory cache keyed by the exact request; superseded
responses are dropped rather than applied late. Only transit requests include
the departure time in their key (rounded to five minutes), so a duration change
upstream does not re-request every leg behind it. `/api/itinerary/route` and
`/api/itinerary/places` both require a signed-in **member** of the trip,
validate coordinates, and apply a per-user burst limit (30 requests/minute).
`consume_itinerary_budget` then takes one unit of
`ITINERARY_DAILY_ROUTE_BUDGET` **before** the outbound call, so the daily
ceiling cannot be overshot; past it every leg reads "ใช้โควตาการเรียกเส้นทางของ
วันนี้ครบแล้ว".

**Remaining billing risk, honestly.** The burst limit is per server instance and
held in memory, so on a multi-instance deployment the effective burst ceiling is
higher than 30/minute. The daily budget is enforced in Postgres and so is
global, but it counts *our* calls — it cannot know about a provider's own
billing rules, minimum charges, or calls made with the same key by anything
else. Restrict the provider key to your own domain and set a hard spend cap in
the provider's console if it offers one; neither this application nor a billing
alert can stop charges on its own.

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

   `SITE_URL` is optional — see [Environment variables](#environment-variables).
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

**Deployment Protection and invitation links.** If Vercel Deployment Protection
is on, the per-deployment hostname (`project-git-branch-org.vercel.app`) is
behind Vercel's own SSO. Invitation links are built from the request host, so
they point at whatever domain the member is browsing and are unaffected — but
never copy a link out of a *preview* deployment, because that host is the
protected one.

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
- **Only the receiver can confirm a payment.** `guard_settlement_confirmation`
  rejects any attempt to set a settlement to `paid` by anyone other than the
  member being paid, so a debtor cannot declare their own transfer received by
  calling the API directly. Balances count only `paid` rows, so a pending claim
  moves no money. A member added by name has no account to confirm with, so
  their rows stay settleable by whoever keeps the books.
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
4. `computeBalances()` nets what each member paid against what they owe and
   applies recorded payments, while `computeExpenseDebts()` lists each expense's
   debts separately so they can be settled one at a time. Settling every listed
   row clears every balance exactly, which the tests assert.
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
- Settlement lists one row per expense per debtor, so a long trip produces a
  long list. Nothing is netted across expenses: if two people each paid for
  something, both debts are listed rather than offset against each other.
- Soft-deleted trips and expenses stay in the database and are not exposed
  anywhere in the UI; clean-up is a manual database task.
