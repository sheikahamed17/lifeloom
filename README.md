<div align="center">

<img src="public/logo.svg" alt="Pulse logo" width="88" height="88" />

# Pulse

**A local-first personal life-OS — money, tasks, learning, and notes in one place, captured by voice or plain language and synced across your devices.**

Ask *"how much did I spend on food this month?"* out loud and hear the answer. Snap a thought before it's gone. Get a weekly AI digest of your own life. All of it runs on your own free-tier cloud, offline-first, installable as an app.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%C2%B7%20D1%20%C2%B7%20R2-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com)
[![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8?logo=pwa&logoColor=white)](#install-it)
[![Tests](https://img.shields.io/badge/tests-1259%20passing-3FB950)](#testing)
[![Release](https://img.shields.io/github/v/release/sheikahamed17/pulse?color=6E7BFF&label=release)](https://github.com/sheikahamed17/pulse/releases)

<br/>

**[▶ Try the live demo →](https://pulse-demo.sdsheikahamed.workers.dev)** — fully seeded with sample data, no sign-up. Resets every 4 hours.

<br/>

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sheikahamed17/pulse)

**Deploy your own private instance in one click** — your Cloudflare account, your data, your keys.<br/>
Or [set it up manually →](./SELF-HOSTING.md)

</div>

---

## Why Pulse

Most life-trackers make you fill in forms. Pulse flips it: you **say or type one line** — *"lunch 240"*, *"finish the deck by friday"*, *"idea: batch the FX cron"* — and the AI files it in the right place. Your data lives **in your browser first** (so it's instant and works offline) and syncs to a database **you own**. There's no shared backend, no ads, no data mining — one instance per person, running on free tiers that comfortably fit a single user.

## Screenshots

> Captured from the [live demo](https://pulse-demo.sdsheikahamed.workers.dev) — real synthetic data, one instance, no login. See the [capture guide](docs/screenshots/README.md) to refresh them.

<table>
  <tr>
    <td align="center" width="25%"><img src="docs/screenshots/capture.jpg" alt="Voice & natural-language capture" width="200" /><br/><sub><b>Capture</b> — one line, any domain</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/money.jpg" alt="Money tab: spend breakdown & filters" width="200" /><br/><sub><b>Money</b> — spend, budgets & filters</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/tasks.jpg" alt="Tasks with projects and sub-tasks" width="200" /><br/><sub><b>Tasks</b> — projects & sub-tasks</sub></td>
    <td align="center" width="25%"><img src="docs/screenshots/learn.jpg" alt="Learning notes with tags" width="200" /><br/><sub><b>Learn</b> — tagged learnings</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/notes.jpg" alt="Notes with search and tags" width="200" /><br/><sub><b>Notes</b> — search & tags</sub></td>
    <td align="center"><img src="docs/screenshots/habits.jpg" alt="Habits with streaks" width="200" /><br/><sub><b>Habits</b> — streaks & schedules</sub></td>
    <td align="center"><img src="docs/screenshots/analytics.jpg" alt="Analytics: net worth & unusual spending" width="200" /><br/><sub><b>Analytics</b> — net worth & anomalies</sub></td>
    <td align="center"><img src="docs/screenshots/assistant.jpg" alt="AI assistant: ask your data" width="200" /><br/><sub><b>Assistant</b> — ask your data</sub></td>
  </tr>
</table>

## Highlights

- 🎙️ **Voice & natural-language capture** — one field for everything; the AI routes it to the right domain and fills the fields.
- 💬 **Ask your data** — read-only natural-language questions across all four domains (*"total spend last week"*, *"what's overdue?"*), answered by voice or text — or kept going as a conversation with the AI assistant.
- 💰 **Accounts & net worth** — balances across your accounts (assets and debts), a derived net-worth figure, and how it's moved over time.
- 📴 **Local-first & offline** — every entry is written to on-device storage first, then synced. No spinner waiting on the network.
- 🔐 **Passkey (Face ID) sign-in** — plus a local PIN lock and a durable session; magic-link fallback.
- 📈 **Weekly AI digests** — a browsable history of auto-generated summaries of your week.
- 🏦 **Bank-transaction auto-import** — forward your bank's alert emails and they land as categorized entries on the right card or account, hands-free.
- 📊 **Spending trends** — a dedicated analytics view: spend / income / net over time, top movers, and per-category small multiples.
- 🧩 **Split transactions** — allocate one payment across several categories, so budgets and analytics stay accurate.
- 📲 **Installable PWA** — add to home screen; push notifications for budget alerts and follow-ups.
- 🚀 **One-click deploy** — the *Deploy to Cloudflare* button stands up your own isolated instance (database, storage, and schema migrations) on the free tier in a single click.

## Features

### The four domains
| Domain | What it captures |
|---|---|
| 💸 **Money** | Expenses & income, multi-currency with daily FX, per-category **budgets** with progress bars and 80% / 100% push alerts. |
| ✅ **Tasks** | To-dos with due dates, recurring tasks, projects, tags, and sub-tasks. |
| 📚 **Learning** | What you learned each day — a searchable running log. |
| 📝 **Notes** | Voice quick-capture: verbatim body, AI-generated title & tags, free-text search. |

Plus two non-finance domains that round out daily self-tracking: 🔥 **Habits & streaks** (check off daily or weekday-scheduled habits and build streaks) and 📖 **Journal** (a daily free-text entry with an optional mood) — each on a page of its own.

### Money, in depth
- **Accounts & net worth.** Track balances across accounts (assets and liabilities); Pulse derives your **net worth** and reconstructs how it's moved over time.
- **Default account.** Star one account in Settings → Accounts and every entry you add by hand, voice, or receipt starts on it — change it in the chip when it's a different card.
- **Cash-flow forecast.** Upcoming recurring income and bills projected forward, with a month-end net estimate on your dashboard.
- **Bill reminders.** A push notification before a recurring bill falls due.
- **Savings goals.** Target amounts — linked to an account or tracked manually — with progress bars on your dashboard.
- **Transfers.** Move money between your own accounts (Bank → Savings, or paying down a card) without it distorting your spend/income totals.
- **Recurring transfers.** Schedule those moves — a monthly card payment or savings sweep that posts itself.
- **Split transactions.** Allocate one payment across several categories; each part flows into budgets and analytics as a normal entry.
- **Cards & debts.** A per-card view: what's owed now, this month's spend charged to it, and the last payment made.
- **Salary reminder.** An opt-in monthly nudge on the last working day to log income that arrives with no email trail.
- **Manual exchange rates.** Money is multi-currency with daily ECB FX; for any currency the ECB feed doesn't list, set your own `1 EUR = N` rate so those amounts still convert into your primary currency.

### Intelligence
- **Router → domain agents.** A small model classifies your input into one of ~10 intents; a per-domain agent extracts structured fields.
- **Query agents ("ask your data").** Questions become a *plan* the client executes locally over your own data — the AI never sees your entries, only the shape of the question. Supports totals, breakdowns, period-over-period deltas, and time series for money, plus lookups for tasks, learning, and notes.
- **Voice answers.** Voice question → transcription → route → plan → answer card, with a concise spoken summary read back to you.
- **Conversational assistant.** A persistent chat thread over your data at `/assistant` — follow-ups keep context, work by voice or text, and answers are read back for a hands-free loop. Same privacy model as the query agents: the model sees the question, never your entries.
- **Insights.** Weekly digests generated on a schedule and browsable at `/insights`, with on-demand refresh for the current week.

### Capture & auto-import
- **Manual add** on any tab, with back-dating for money entries.
- **Categorize-on-ingest.** Auto-imported transactions arrive with a one-tap category picker and a push notification.
- **Email auto-ingest.** A Gmail filter + a tiny Google Apps Script forwards bank alerts to your instance — the only truly hands-off path on iOS.
- **Auto-detect the account.** An imported alert is tagged to the right account from the card or account number it mentions — name an account with its last 4 digits (*"Rewards Card 7392"*) and it just works, or add extra numbers/keywords as hints (e.g. a bank account's debit-card digits). Only a real card/account reference counts (`ending 7392`, `A/c XX4821`, `**6604`), never an amount or a UPI ref, and an ambiguous alert is left for you rather than guessed.
- **New cards in one tap.** An alert from a card Pulse doesn't know yet shows **"•1188 — which account?"** — pick the account once and Pulse remembers the number, tags that card's other past alerts, and handles every future one automatically.
- **Backfill past alerts.** Settings → Accounts → *Past alerts* tags earlier imported entries that now match an account (it never overwrites an account you chose). Balances count every tagged entry, so if your opening balance already reflects that history, skip it.
- **SMS auto-ingest (iOS).** For the alerts your bank sends by text instead of email, an Apple Shortcut forwards them to your instance (Settings → Auto-import from SMS).

### Organize & analyze
- **Category management.** Rename, set icons, archive/restore, and **merge duplicates** (reassigning their entries) in Settings → Categories.
- **Filter, sort & timestamps.** Every list filters and sorts (money by category / source / direction / date range, or by amount); every entry shows when it's from.
- **Analytics** (`/analytics`). Spend trend, income vs spend + net, top movers, per-category small multiples, **net worth over time**, and **unusual-spending** detection — inline SVG on a colorblind-validated palette.
- **Global search.** One 🔍 searches all four domains at once and jumps to — and flashes — the matching row.
- **Backup & restore.** Export your full history (plus money as CSV) and re-import it into any instance — a non-destructive, on-device merge.
- **Dashboard.** A `/dashboard` of widgets (accounts, upcoming, goals, habits, …) plus a Getting Started checklist that guides a fresh instance through setup and hides itself once you're rolling.

## How it works

```
                    ┌─────────────────────────── your device ───────────────────────────┐
  voice / text ──▶  │  Router (Groq)  ──▶  domain agent  ──▶  op written to Dexie (local) │
                    │                                                    │                │
                    │            UI reads Dexie live (offline-first)     │  op-log sync   │
                    └────────────────────────────────────────────────────┼───────────────┘
                                                                          ▼
                                          Cloudflare Worker  ──▶  D1 (op-log + projections) · R2 (files)
```

- **Local-first storage.** The UI reads and writes **Dexie** (IndexedDB) directly, so it's instant and fully functional offline.
- **Sync = an op-log with per-field HLC last-writer-wins.** Every change is an append-only operation stamped with a hybrid logical clock. Sync is incremental (bounded per request), so it scales as history grows and converges deterministically across devices — no "who won?" ambiguity.
- **The op-log is the source of truth.** Server tables are projections materialized from the log; they can be rebuilt at any time.
- **AI stays privacy-preserving for queries.** Query agents return a *plan*, not an answer — your entries never leave the device to be "read" by the model.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | **Next.js 16** (App Router) · **React 19** · **Tailwind CSS 4** |
| Client data | **Dexie** (IndexedDB) · offline-first |
| Server data | **Cloudflare D1** (SQLite) + **R2** (files) via **Kysely** |
| Runtime | **OpenNext** on **Cloudflare Workers** · **Serwist** service worker |
| Auth | **Better Auth** — magic link + passkeys (WebAuthn) |
| AI | **Groq** (`gpt-oss`) for the router, domain agents, and Whisper transcription |
| UI | Geist font · lucide icons · dark glassmorphism |
| Tests | **Vitest** · `fake-indexeddb` · `fast-check` |

## Getting started

Pulse is **single-user by design** — you deploy your **own** copy (your data, your API keys, your free-tier quota, fully isolated). Everything you need has a free tier.

**Step 1 — get your own copy.** Click **[Use this template](https://github.com/sheikahamed17/pulse/generate)** at the top of the repo to create an independent copy of Pulse under your own GitHub account.

**Step 2 — stand it up.** From your copy, use either the one-click deploy or the manual path below. *(In a hurry? The one-click **Deploy to Cloudflare** button also creates the copy for you as it deploys, so you can skip Step 1.)*

### One-click deploy (recommended)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/sheikahamed17/pulse)

The button creates a copy of this repo in your GitHub, provisions a **fresh, isolated D1 database and R2 bucket** in your own Cloudflare account, prompts you for the secrets below, **runs the database migrations, and deploys** — then wires up automatic redeploys on every push. You'll be asked for:

- **`GROQ_API_KEY`** — free at [console.groq.com](https://console.groq.com) (voice + natural-language capture, insights)
- **`RESEND_API_KEY`** — free at [resend.com](https://resend.com) (sends your magic-link sign-in email)
- **`BETTER_AUTH_SECRET`** and **`CRON_SECRET`** — any long random strings (`openssl rand -hex 32`)
- **`BETTER_AUTH_URL`** — your instance URL; you can set a placeholder now and fix it after the first deploy prints the real one
- **`VAPID_PUBLIC_KEY`** / **`VAPID_PRIVATE_KEY`** — optional, push only (`node scripts/generate-vapid-keys.mjs`)

Then sign in with your **Resend-account email** (the free sandbox sender only mails you) — no custom domain needed.

> **Push notifications** (budget alerts, bill/salary reminders) also need `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — the **same value** as `VAPID_PUBLIC_KEY` — set as a **build variable** in Workers Builds (your Worker → Settings → Build → *Variables and secrets*), because it's inlined into the app at build time. Everything else works without it.

### Manual setup (advanced)

Prefer to run every step yourself, or have Claude Code do it interactively?

- **A · Let Claude Code do it.** Open this repo in [Claude Code](https://claude.com/claude-code) and ask it to *"set up this project for me."* It reads [`CLAUDE.md`](./CLAUDE.md) — the project's instructions for AI agents — and walks you through creating your Cloudflare / Groq / Resend resources, applying migrations, setting secrets, and deploying.
- **B · Do it by hand.** Follow **[SELF-HOSTING.md](./SELF-HOSTING.md)**: use this template → create D1 + R2 → apply migrations → set secrets → deploy. ~20 minutes.

### Install it

Once deployed, open your instance on your phone and **Add to Home Screen** to install the PWA, then add a passkey (Settings → Security) for Face ID / one-tap sign-in.

## Local development

```bash
pnpm install
pnpm dev          # http://localhost:3000  (magic-link prints to the console when email is unconfigured)
pnpm test         # vitest
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
pnpm cf:build     # Next + OpenNext build for Cloudflare
pnpm cf:preview   # build + run the Worker locally
```

> Requires **Node 22** and **pnpm**. See [SELF-HOSTING.md](./SELF-HOSTING.md) for the full deploy path.

## Project structure

```
src/
  app/            # Next App Router — routes, API handlers, pages (/app, /analytics, /insights, /settings/*)
  lib/            # sync engine, agents, ingest, auth/email, pure helpers (unit-tested)
  components/     # UI: capture chips, domain lists, answer cards, charts
migrations/       # D1 schema, applied in order 0001 → 0029
scripts/          # icon generation, service-worker build, router eval, VAPID keygen
tests/            # vitest suites (agents, api routes, sync, lib)
docs/superpowers/ # design specs and implementation plans
```

## Testing

```bash
pnpm test            # full suite
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage report
pnpm eval:router     # opt-in router-accuracy eval against a labeled dataset
```

The suite covers the sync engine's convergence invariants, the agent/query pipelines, and the API routes. `tsc --noEmit` runs in CI because Vitest (esbuild) does **not** typecheck.

## Status & license

Pulse is an actively developed **personal project**, deployed to production and used daily. It ships behind a CI + Cloudflare deploy pipeline on every push to `main`; changes are recorded in the [changelog](./CHANGELOG.md) and cut as [tagged releases](https://github.com/sheikahamed17/pulse/releases) (semver from `v1.0.0`).

No formal open-source license is attached yet — if you'd like to reuse the code, please ask. You're welcome to self-host your own copy for personal use.
