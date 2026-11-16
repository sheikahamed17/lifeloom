# Security policy

Lifeloom is a single-user, self-hosted app: each person runs their own instance, with their own Cloudflare account, keys and data. A flaw in this code can still affect every instance, so reports are very welcome.

## Reporting a vulnerability

**Please report privately. Don't open a public issue.**

1. Go to the repository's **Security** tab and choose **[Report a vulnerability](https://github.com/sheikahamed17/lifeloom/security/advisories/new)**. This opens a private advisory that only the maintainer can see.
2. Include what you found, how to reproduce it (an instance URL is fine, but never send real data or credentials), and what someone could do with it.

You can expect an acknowledgement within **3 days** and a fix or a plan within **14 days** for anything high or critical. Once a fix ships, it's recorded in the [changelog](./CHANGELOG.md) under **Security**, and you're credited unless you'd rather not be.

## Supported versions

Only the latest release on `main` is supported. Self-hosted copies get fixes by syncing their fork (or redeploying from the template), and the Deploy to Cloudflare pipeline applies any migrations automatically.

## In scope

- Authentication and the single-owner lock (magic link, passkeys, sessions, the `/setup` wizard)
- The sync API and op-log (one user reading or writing another's data, or bypassing per-field last-writer-wins)
- Ingest endpoints (email and SMS import tokens), cron endpoints (`CRON_SECRET`) and receipt storage (R2)
- Anything that sends a user's entries to the AI model when it shouldn't (query agents must return a plan, not read your data)
- The demo instance's isolation from production (`DEMO_MODE` guards on destructive paths)

## Out of scope

- Vulnerabilities in a self-hoster's own Cloudflare, Groq or Resend account configuration
- Denial of service against the free-tier quotas of an instance
- Advisories in build-only or lint-only tooling that never ships in the Worker (still welcome as a regular issue)

## How this repo watches for problems

- **Dependabot** alerts and opens security-fix PRs; `.github/dependabot.yml` adds weekly grouped updates.
- **Security audit** workflow: `pnpm audit` runs on every PR that changes dependencies and every Monday, and fails on any moderate or higher advisory.
- **CodeQL** code scanning (extended security queries) on every push and PR.
- **Secret scanning with push protection**, plus GitGuardian, blocks committed API keys. Secrets belong in Worker secrets (`wrangler secret put`) or GitHub Actions secrets, never in the repo.
