# Self-hosting Pulse

Pulse is a **local-first, single-user** personal life-OS (money + tasks + learning + notes, voice/NL capture, weekly digests). Because it's local-first and runs entirely on your own free-tier cloud, the right way to use it is to **deploy your own copy** — your data, your API keys, your quota, fully isolated from anyone else's. This guide takes you from your own copy of the template to a live instance in about 20 minutes.

> **Just want to look around first?** [Try the live demo](https://pulse-demo.sdsheikahamed.workers.dev) — fully seeded, no sign-up, resets every 4 hours.

> **Just want it running?** Use the **[Deploy to Cloudflare button](./README.md#one-click-deploy-recommended)** — it provisions a fresh D1 + R2 in your account, prompts for the secrets, applies the migrations, and deploys, all in one click. This document is the **manual** path, for when you want to run each step yourself (and it's the reference the button and the Claude Code path both mirror).

> **Prefer to let AI do it?** Open the repo in [Claude Code](https://claude.com/claude-code) and ask it to *"set up this project for me."* It follows [`CLAUDE.md`](./CLAUDE.md) (the repo's agent instructions) and runs these same steps with you — you still supply your own Cloudflare / Groq / Resend accounts.

## What you need (all have free tiers)

- A **Cloudflare** account — Workers + D1 (database) + R2 (file storage). The free plan is enough.
- A **Groq** API key ([console.groq.com](https://console.groq.com)) — powers the AI parsing/agents (free daily quota).
- A **Resend** account ([resend.com](https://resend.com)) — sends your sign-in email (free tier).
- **Node 22** + **pnpm**, and the Wrangler CLI: `npm i -g wrangler` then `wrangler login`.

## 1. Get the code

First, click **[Use this template](https://github.com/sheikahamed17/pulse/generate)** at the top of the repo to create your own copy under your GitHub account. Then clone **your** copy:

```bash
git clone https://github.com/<your-username>/pulse.git
cd pulse
pnpm install
```

## 2. Create your Cloudflare resources

```bash
wrangler login
wrangler d1 create pulse                    # note the printed database_id
wrangler r2 bucket create pulse-receipts
```

`wrangler.toml` ships **without** a `database_id` — that's deliberate, and it's what lets the one-click button provision a fresh database per person. Add **your** new id under `[[d1_databases]]`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "pulse"
database_id = "<your new D1 id from the command above>"
migrations_dir = "migrations"
```

(Enable R2 in the Cloudflare dashboard once if prompted.)

> The committed `wrangler.prod.toml` is the **upstream** production config — it carries *this repo's* live id, not yours. Ignore it for a manual deploy. Only touch it if you want GitHub Actions auto-deploy (see Notes), in which case replace its id with yours.

## 3. Apply the database migrations

Apply every file in `migrations/` to your remote D1 with one idempotent command — it tracks which migrations have run (in a `d1_migrations` table) and applies only the pending ones, in order:

```bash
wrangler d1 migrations apply DB --remote
```

This is the exact command the deploy workflow (and the one-click button) run automatically on every deploy, so your database always matches the code.

> If you hit an OAuth `401`, apply the files individually instead — in numeric order, `0001` → the highest — with `wrangler d1 execute pulse --remote --command "<paste that file's SQL>"` (a known Wrangler quirk with OAuth tokens; `--file` can 401 where `--command` succeeds).

## 4. Generate your Web-Push (VAPID) keys

```bash
node scripts/generate-vapid-keys.mjs
```

This prints a **public** and a **private** key. Both are set as secrets in step 5 — you don't edit `wrangler.toml` for these (keeping the file identical across instances so it never conflicts on sync). If you set up auto-deploy (see Notes), also add the public key as the GitHub Actions **variable** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## 5. Set your secrets

```bash
wrangler secret put BETTER_AUTH_SECRET   # any random string, 32+ chars
wrangler secret put BETTER_AUTH_URL      # your instance URL, e.g. https://pulse.<you>.workers.dev
wrangler secret put GROQ_API_KEY         # from console.groq.com
wrangler secret put RESEND_API_KEY       # from resend.com
wrangler secret put VAPID_PUBLIC_KEY     # public key from step 4
wrangler secret put VAPID_PRIVATE_KEY    # private key from step 4
wrangler secret put CRON_SECRET          # any random string
```

Leave `EMAIL_FROM = "Pulse <onboarding@resend.dev>"` in `wrangler.toml` as-is (see step 7).

## 6. Build & deploy

```bash
pnpm cf:build
wrangler deploy
```

Wrangler prints your live URL (e.g. `https://pulse.<you>.workers.dev`). If you hadn't set `BETTER_AUTH_URL` to it yet, set it now (step 5) and `wrangler deploy` again.

## 7. Sign in

> **⚠ Use your Resend-account email.** On Resend's free tier without a verified domain, the sandbox sender `onboarding@resend.dev` **only delivers to the email you signed up to Resend with**. So enter *that* email on the login page — the magic link arrives there. That's all a personal single-user instance needs; **no domain required.**
>
> **The first account is the only account.** Whoever signs in first (the setup wizard) becomes the instance's owner, so sign in as soon as you deploy. After that, no other address can create an account or even receive a sign-in link. The login page answers the same way, just as fast, so it doesn't reveal your address. This holds even if you later verify a domain in Resend: a domain only changes the address the email comes *from*. Anyone else who wants Pulse deploys their own copy.
>
> Once you're the owner, your sign-in emails are sent just *after* the login page replies. So if Resend has a problem (an expired key, or the quota is used up), the page still says "link sent". If no email arrives, check `wrangler tail` for `[magic-link] email send failed`. A passkey sign-in doesn't need email at all.
>
> **Changing your email later:** update the owner row (keep the `lower(...)`, because sign-in matches the lowercase address), then sign in with the new address. Your passkeys keep working.
> `wrangler d1 execute pulse --remote --command "UPDATE user SET email = lower('new@example.com') WHERE email = lower('old@example.com')"`

After signing in, add a **passkey** (Settings → Security) for Face ID / one-tap sign-in on your phone. Then "Add to Home Screen" to install it as a PWA.

## Notes

- **Free-tier reality:** Groq's free *daily* quota is modest but fine for one person; Cloudflare Workers/D1/R2 free tiers are plenty for personal use. This is exactly why one instance *per person* beats a shared one — you each get your own quota.
- **Auto-deploy (optional):** to redeploy on every `git push`, add a `CLOUDFLARE_API_TOKEN` GitHub Actions **secret** and a `NEXT_PUBLIC_VAPID_PUBLIC_KEY` Actions **variable** — the bundled `.github/workflows/deploy.yml` does the rest. The token needs **both** Workers *and* D1 edit scopes: the workflow applies any pending migrations (`wrangler d1 migrations apply`) before deploying, and that fails without the D1 scope. The workflow deploys via `-c wrangler.prod.toml`, so put **your** id in that file (see step 2). (The one-click button uses Cloudflare's own Workers Builds instead and needs none of this.)
- **Transaction auto-import (optional):** Settings → "Auto-import transactions" works on your instance too (Google Apps Script → your endpoint; see the in-app steps).
- **Everything is yours:** your entries live in your browser (Dexie) and sync to *your* D1. Nothing is shared with the upstream repo or its author.
