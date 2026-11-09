# Changelog

All notable changes to Lifeloom are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Each release is also published with notes on
[GitHub Releases](https://github.com/sheikahamed17/lifeloom/releases).

## [Unreleased]

Account auto-pick v2 — imported bank/card alerts now land on the right account
with no setup beyond naming it — plus a fix for tags being re-encoded in the
server database, fixes that let the server projection hold every category and
entry in your history, and sign-in locked to the instance's owner. Migrations
`0027`–`0029`, applied automatically on deploy.

### Added
- **Split an entry you've already saved.** The money chip's *⑂ Split* is now available when editing too (long-press → Edit), not only on a brand-new capture. The saved entry becomes the first part, keeping its id, receipt and history, and the other allocations are created alongside it in the same split group — the same N-entries shape a fresh split writes, so budgets, analytics and balances need no special handling. Splitting a part of an existing split adds to that group rather than starting a second one. Pure planner `planSplitOfExisting` in `src/lib/split-edit.ts`, with tests.
- **Account last-4 in the name is auto-matched.** An account named like *"Rewards Card 7392"* now catches alerts for that card with no hints configured; hints remain for extra numbers or keywords (e.g. a bank account's debit-card digits). ([3a0f018](https://github.com/sheikahamed17/lifeloom/commit/3a0f018))
- **"Which account?" for unknown cards.** An imported alert from a card number no account knows shows a `•1188 — which account?` pill; one tap tags it, saves the number as that account's hint, retags the card's other untagged alerts, and offers undo. ([f364d06](https://github.com/sheikahamed17/lifeloom/commit/f364d06))
- **Past-alerts backfill.** Settings → Accounts → *Past alerts* tags earlier SMS/email entries that now match an account; it re-syncs first, never overwrites a chosen account or touches deleted entries, and writes in batches of 50. ([f364d06](https://github.com/sheikahamed17/lifeloom/commit/f364d06), [101c602](https://github.com/sheikahamed17/lifeloom/commit/101c602))
- **Default account.** Star an account in Settings → Accounts; new manual, voice, and receipt entries start on it (an explicit pick — including "No account" — wins; edits and imported alerts never use it). New `accounts.is_default` column, migration `0027`. ([7c76039](https://github.com/sheikahamed17/lifeloom/commit/7c76039))
- The live demo now showcases all of the above: accounts named with their last-4, a starred default, auto-tagged email/SMS alerts, one unknown card, and one untagged past alert.

### Changed
- **New logo: the Lifeloom weave.** The concentric-circle "pulse" mark is replaced by a 3×3 interlace of warp and weft threads in the brand gradient, with transparent gaps at the crossings so it reads on any background. Updated everywhere the mark appears: header and login component, `public/logo.svg`, the SVG favicon, `favicon.ico`, the Apple touch icon and the PWA icons (`scripts/logo-icon.svg` is the source; `pnpm gen:icons` regenerates the PNGs).
- **Renamed to Lifeloom.** The product name shown in the app, PWA manifest, sign-in email, notifications, passkey prompt and docs is now *Lifeloom*. Nothing operational changed: the production and demo URLs, Worker, D1 and R2 names, sign-ins, passkeys, backups (`app: "pulse"`), ingest tokens and the Apps Script/Shortcut names are all untouched. New self-hosted copies are created as `lifeloom` / `lifeloom-receipts` by the template config. The GitHub repository is now `sheikahamed17/lifeloom`; the old URL and existing clones redirect.
- **Stricter, safer account matching.** A card/account number only matches where an alert uses it as one (`ending 7392`, `A/c XX4821`, `**6604`, `Card no. XX…`) — never an amount, date, or UPI reference. A number match beats a keyword match, and an alert that still matches more than one account is now left untagged instead of going to the oldest account. ([3a0f018](https://github.com/sheikahamed17/lifeloom/commit/3a0f018))

### Fixed
- **Buttons inside swipeable rows ignored mouse clicks.** *Set category*, *Delete*, *receipt*, *≈ convert*, *which account?*, task complete and every other control inside a money, task, learning or notes row did nothing when clicked with a mouse (taps on touch screens still worked). The row took pointer capture on every press so a swipe could keep receiving move events, and Chrome retargets the `click` that follows a capture to the capturing element — the row — so the button never saw it. The row now captures the pointer only once a horizontal swipe is under way; taps never capture, so clicks land on the button again. Swipe-to-delete and long-press are unchanged. ([`captureStartsOn`](src/lib/gesture-swipe.ts) with tests.)
- **The demo's "total spend this month" example crashed the page.** The canned demo answer shipped a money query plan with no period, and the answer card filters on `period.from`/`to`, so both the capture bar and the Assistant fell into the error boundary with `Cannot read properties of null (reading 'from')`. The canned plan now carries the current calendar month like a real Groq-built plan does, and `isQueryPlan` rejects any money plan without a period so a malformed response can no longer reach the card. Demo mode only; production never used canned plans.
- **Tags were re-JSON-encoded on every partial update in the server database.** Any update that didn't touch an entry's tags (setting a category or account, completing a task) wrapped the stored tags in another JSON layer, doubling their size each time; the weekly digest then reported characters like `"` and `[` as top learning tags. Writes now encode exactly once, damaged rows heal on their next write (or all at once via Settings → Rebuild server data), and the digest reads any depth correctly. Server projection only — on-device data was never affected. ([e3a02f8](https://github.com/sheikahamed17/lifeloom/commit/e3a02f8))
- **Most categories — and the entries using them — never reached the server.** The server's categories table required a unique name per kind and counted deleted rows, but the op-log legitimately holds same-name categories (each device seeded the defaults under its own ids; the app then deleted the extras). Whichever copy landed first — often one later deleted — blocked the live category of that name, and every money entry or recurring rule pointing at it then failed its category foreign key: on one real history, 551 of 1,218 ops, leaving 0 of 21 live categories and 41 of 310 entries categorised server-side. Budget alerts and the weekly digest lost categories, and voice/receipt capture (which offers the AI your live categories) saw none. Migration `0029` drops the constraint (display already merges same-name categories); run Settings → Rebuild server data once after updating.
- **HTTP 503s on the Workers Free plan.** The Better Auth 1.7 upgrade re-checked the database schema on every request (~4× the CPU of a session check), pushing pages, sync and Settings → Rebuild server data past the free plan's 10 ms CPU limit. The check is now off at runtime and runs in CI against the real migrations instead. ([60f825e](https://github.com/sheikahamed17/lifeloom/commit/60f825e))
- **Rebuild server data stalled partway on the free plan.** Cloudflare only tolerates *occasional* CPU overruns, and every request carries a fixed framework cost above 10 ms, so a long run of small batches got cut off. The rebuild now sends few, large batches (50 ops) spaced 2 s apart; on a 503 it says it's waiting, cools down (15 s → 60 s), retries a smaller batch from the same spot, and grows back once requests succeed. A batch that still fails leaves a *Continue rebuild* button that resumes where it stopped.
- **Voice and receipt capture picked a same-name category at random.** When the server held more than one live category with the same name, capture took whichever row the database returned first, so the same receipt could land on different copies. Capture now uses one category per name and kind, chosen the same way every time: the canonical id the client-side cleanup keeps, otherwise the oldest. The AI is also offered each name only once.
- **Voice transcribe-only requests closed their stream twice** ([#13](https://github.com/sheikahamed17/lifeloom/issues/13), reported by Matt Abate). The second close threw inside the stream. Usually the client still got its transcript and the runtime logged an exception, but if the handler finished before the client started reading, the error dropped the transcript entirely. It now closes once.
- **Responsive layout across all devices and screen sizes.** Two bugs made the app render poorly off phone-width: (1) on `/app`, the grid/flex content column defaulted to `min-width: auto`, so the header (logo + nav icons + Sign out) and capture bar refused to shrink and forced a ~120px horizontal scroll on narrow phones (and pushed the sidebar off-screen at tablet width) — fixed with `min-w-0` + `flex-wrap` so they reflow, plus a global `overflow-x-clip` safety net; (2) every page except `/app` (dashboard, analytics, all of settings, habits, journal, insights) was hardcoded to a fixed 448px column with no responsive breakpoints, stranding content in empty space on tablets/laptops — they now widen to a comfortable centered column on larger screens (`md:max-w-3xl`). On `/app`, the two-column layout (content + sidebar) now starts at `lg` instead of `md`, so tablet-portrait widths get a clean single-column view with the bottom tab bar instead of a cramped, overlapping two-column grid. No behavior or data changes.
- **SPENT · month breakdown no longer truncates category names.** Each row capped the category label to a fixed 48px column with an ellipsis ("Gro…", "Sub…", "Sna…"); labels now render in full (no shrink, no ellipsis) and the progress bar flexes to fit the remaining space. Applies everywhere the card appears (money sidebar, mobile card, dashboard widget).

### Security
- **Only the owner can sign in.** Pulse is single-user, but nothing enforced it: anyone who could reach the login page could request a magic link, and the instance stayed private only because Resend's sandbox sender can't email anyone but the Resend account. Verifying a sending domain would have let anyone create an account.
  - The first account (the setup wizard) is now the only one, and sign-in links go only to that account.
  - For any other address the login page answers the same way, just as fast, so it doesn't reveal yours. To make that hold, the owner's sign-in email is now sent just after the reply: a Resend failure no longer shows on the login page, it's logged as `[magic-link] email send failed` instead. The setup wizard still shows it.
  - Creating a second user is refused outright, including from a link issued before the owner existed.
  - If you share one instance with others, which SELF-HOSTING used to suggest, existing accounts keep signing in, but no new ones can be added.
  - SELF-HOSTING explains how to change the owner's email.
- **Build tooling moved onto glob 14** ([GHSA-3g3m-2fjr-6pw4](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), moderate). OpenNext's Cloudflare adapter, its minifier and both Serwist packages pulled glob 10.x and 13.x, which have no patched release; pnpm overrides move them onto the 14.x the project already uses. Build-time only: glob never ships in the Worker.

## [1.3.0] — 2026-09-16

A public **live demo**, a **first-run setup wizard** for self-hosters,
**GitHub-template** conversion, and a README **screenshot gallery** populated
with eight screens from the live demo. No schema migrations, and production
behavior is unchanged — every demo and setup path is independently gated.

### Added
- **Live demo.** A public, shared, read-mostly demo instance (`pulse-demo`) runs the same codebase behind a `DEMO_MODE` flag: every visitor is auto-signed-in as a shared demo user over realistic seeded data (no login/signup), AI runs on canned responses (no quota used), ingest/push/export are disabled, and a 4-hour cron wipes + reseeds. Its D1/R2 are isolated from production, and every destructive path independently checks `DEMO_MODE`, so production is untouched. Linked from the README. ([496bbf2](https://github.com/sheikahamed17/lifeloom/commit/496bbf2))
- **First-run setup wizard.** A freshly deployed instance routes every request to a `/setup` wizard until an owner account exists in D1, so a new self-hoster's first action is creating their account — not editing files or running commands. Steps: welcome → create account (email magic-link) → verify the Groq key actually works (a real pass/fail check) → optional email auto-import → done, then into the app. The gate is enforced in middleware from the `user` table (not a cookie), so a deep link can't slip past it, and it never reappears once an owner exists. ([a8623aa](https://github.com/sheikahamed17/lifeloom/commit/a8623aa))

### Changed
- Converted the repository to a **GitHub template** — visitors can click "Use this template" to create their own independent copy. Docs (README, SELF-HOSTING, CLAUDE.md) now lead the "get your own copy" path with the template step, complementing the existing one-click deploy and manual paths. ([1c45cb1](https://github.com/sheikahamed17/lifeloom/commit/1c45cb1))
- **README:** added the Pulse logo to the hero and a **Screenshots gallery** — eight screens (capture · money · tasks · learn · notes · habits · analytics · assistant) captured from the live demo and shown expanded near the top, with a capture guide in `docs/screenshots/`. ([02a805d](https://github.com/sheikahamed17/lifeloom/commit/02a805d))

## [1.2.0] — 2026-09-16

One-click "Deploy to Cloudflare" with automatic D1 migrations, two security
sweeps (Dependabot + CodeQL), a crash fix and a scaling fix, render-performance
memoizations, and a bundle-measurement tool. Each change shipped to production
behind the CI + Cloudflare deploy pipeline on merge to `main`.

### Added
- **One-click "Deploy to Cloudflare" button** with **automatic D1 migrations on every deploy** (first and subsequent). The button provisions a fresh, isolated D1 database and R2 bucket in the visitor's own Cloudflare account, prompts for secrets, runs the migrations, and deploys. Implemented via an id-less `wrangler.toml` template plus a `wrangler.prod.toml` for CI, a `deploy` npm script that runs `wrangler d1 migrations apply` before `wrangler deploy`, `.dev.vars.example` for secret prompting, and a `cloudflare.bindings` help block. CI now validates every migration against an ephemeral local D1. ([ac49752](https://github.com/sheikahamed17/lifeloom/commit/ac49752))
- **`pnpm bundle:report`** — a dev tool that measures per-route First Load JS (gzip transfer size, split into framework / polyfill / app code) from the real build output, since Turbopack prints no size table. ([5233e4c](https://github.com/sheikahamed17/lifeloom/commit/5233e4c))

### Changed
- **Performance:** memoized hot render paths — the habits dashboard widget's per-habit streak computation, global search, and the notes/learning list filter+sort. ([e4e92b4](https://github.com/sheikahamed17/lifeloom/commit/e4e92b4))
- **Docs:** README refreshed to cover one-click deploy, auto-detect-account on alert imports, SMS auto-ingest, and manual exchange-rate overrides. ([17bda58](https://github.com/sheikahamed17/lifeloom/commit/17bda58))

### Fixed
- **Crash on tag-filtered learning/notes with legacy or imported rows.** A learning/note row synced or imported without a `tags` field would crash the page when filtered by tag; all tag paths (filters, lists, query-exec) are now guarded with `(tags ?? [])`, with regression tests. ([e4e92b4](https://github.com/sheikahamed17/lifeloom/commit/e4e92b4))
- **`/api/fx/rates` could 500 on many currencies.** The `targets` query parameter was uncapped and could exceed Cloudflare D1's 100-bound-parameter limit; the `IN` query is now chunked to ≤90. ([e4e92b4](https://github.com/sheikahamed17/lifeloom/commit/e4e92b4))

### Security
- **Cleared 11 Dependabot alerts** (4 critical, 2 high, 5 moderate): `next` + `eslint-config-next` `16.2.11 → 16.3.5` (two critical advisories), `vitest` + `@vitest/coverage-v8` `→ 4.1.11`, and transitive floors for `browserslist`, `qs`, and `baseline-browser-mapping`. ([9644522](https://github.com/sheikahamed17/lifeloom/commit/9644522))
- **CodeQL:** added least-privilege `permissions: contents: read` to the CI workflow, clearing a medium "workflow does not contain permissions" finding. ([e4e92b4](https://github.com/sheikahamed17/lifeloom/commit/e4e92b4))

## [1.1.0] — 2026-09-15

Splits, recurring transfers, cards & debts, salary reminder, and the journal
domain, plus two production fixes (sync-500 on large backlogs; money add-form
crash). Schema migrations `0023 → 0026`. Test suite at 1,257.
See the [v1.1.0 release notes](https://github.com/sheikahamed17/lifeloom/releases/tag/v1.1.0).

## [1.0.0] — 2026-08-28

First stable release — the clean starting line.
See the [v1.0.0 release notes](https://github.com/sheikahamed17/lifeloom/releases/tag/v1.0.0).

[Unreleased]: https://github.com/sheikahamed17/lifeloom/compare/v1.3.0...main
[1.3.0]: https://github.com/sheikahamed17/lifeloom/releases/tag/v1.3.0
[1.2.0]: https://github.com/sheikahamed17/lifeloom/releases/tag/v1.2.0
[1.1.0]: https://github.com/sheikahamed17/lifeloom/releases/tag/v1.1.0
[1.0.0]: https://github.com/sheikahamed17/lifeloom/releases/tag/v1.0.0
