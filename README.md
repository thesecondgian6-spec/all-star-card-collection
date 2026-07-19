# All Star Card Collection

An anime-inspired card collecting idle game: roll packs, build a binder, watch your
cards generate coins over time, collect them, and spend gems on permanent upgrades.
Built with Next.js (App Router) + Supabase, ready to deploy to Vercel.

## How the game works

- **Coins** are the soft currency. Each card generates coins/sec while it sits in
  your binder, up to a storage cap (default 8–24h depending on rarity). Tap a card
  (or "Collect All") to bank whatever it's generated. Coins buy packs.
- **Gems** are the premium currency, earned from achievements and daily logins.
  Gems buy permanent **upgrades**: Auto-Collector (collects for you on a timer),
  Income Multiplier, Vault Expansion (raises the storage cap), Lucky Charm (better
  pack odds).
- All of the above — currency math, pack odds, upgrade costs — is enforced by
  Postgres functions (`supabase/schema.sql`), not the browser. The client only ever
  calls `supabase.rpc(...)`; it never writes coins/gems/cards directly. That's what
  stops someone from opening devtools and editing their own balance.
- The **Admin** tab (gated by `profiles.is_admin`) lets you manage series, cards,
  packs, upgrades, and achievements without touching code.

I couldn't use real anime franchises/characters (copyright), so the game ships with
5 original series and 30 original cards. Use the Admin panel to add your own art via
image URLs, rename things, or add entirely new series.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project.
2. Once it's ready, open **SQL Editor** → New query, paste the entire contents of
   `supabase/schema.sql`, and run it. This creates every table, RLS policy, and
   game-logic function, and seeds the default series/cards/packs/upgrades/achievements.
3. Go to **Authentication → Sign In / Providers** and enable **Anonymous Sign-ins**
   (this is what powers the "Continue as Guest" button).
4. Go to **Authentication → Email**, and turn off "Confirm email" if you want people
   to be able to sign up and play immediately without clicking an email link (optional,
   your call).
5. Go to **Project Settings → API** and copy your **Project URL** and **anon public key**.

## 2. Make yourself an admin

Sign up / play as guest once in the running app first (so your user row exists), then
in Supabase go to **Table Editor → profiles**, find your row, and set `is_admin` to
`true`. The Admin tab will then appear in the app for that account.

## 3. Run it locally

```bash
cp .env.example .env.local
# edit .env.local and paste your Supabase URL + anon key
npm install
npm run dev
```

Visit http://localhost:3000.

## 4. Deploy to Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **New Project → Import** your repo.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. That's it — no server/API routes to configure, the browser talks to
   Supabase directly (protected by the RLS policies and functions in the schema).

## Project structure

```
app/
  login/page.js      – sign up / log in / guest
  play/page.js        – the Binder (main collection page, click-to-collect)
  packs/page.js        – pack shop + reveal animation
  upgrades/page.js     – gem shop
  profile/page.js      – bio, banner, avatar, favorites, titles, stats
  admin/page.js         – CRUD for series/cards/packs/upgrades/achievements
components/AppShell.js  – header/nav wrapper, wallet display
lib/                    – Supabase client, auth context, game math helpers
supabase/schema.sql      – the entire database: tables, RLS, and game logic
```

## Notes / things worth knowing

- **Guest accounts**: guests are real Supabase Auth users (`signInAnonymously`),
  so their progress is fully saved — it's not just local storage. From the Profile
  page, a guest can add an email + password to "claim" their account without losing
  progress.
- **Anti-cheat**: `collect_card`, `collect_all`, `open_pack`, and `purchase_upgrade`
  are all `SECURITY DEFINER` Postgres functions that recompute everything from
  server-stored timestamps. The client-side "pending" numbers you see ticking up are
  just an estimate for feel — the real payout is always calculated fresh on the server.
- **Offline earnings**: because generation is timestamp-based (not a running total),
  there's nothing to "catch up" — the moment you collect, the server looks at how
  long it's been and pays out (capped), whether that's 10 seconds or 10 hours.
- **Scaling the catalog**: everything in Admin — series, cards, packs, upgrades,
  achievements — is just Postgres rows, so you can add as many anime-style series
  and cards as you want without a redeploy.
- I validated the schema (including the RLS policies and every RPC function) against
  a local Postgres instance before handing this off — pack opening, capped income
  collection, upgrade purchases, achievement unlocking, and the daily-login streak
  all behave correctly, and non-admins are blocked from editing the catalog and from
  reading other players' data.
