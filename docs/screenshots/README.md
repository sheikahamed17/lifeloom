# Screenshots

These fill the gallery in the main [README](../../README.md#screenshots). They were
captured from the [live demo](https://pulse-demo.sdsheikahamed.workers.dev) (phone-portrait,
real synthetic data, no login). The gallery references these **exact filenames** — replace
a file in place to refresh that tile, no README edit needed:

| File | Screen |
|---|---|
| `capture.jpg` | Home / **Money** — the month panel, "Needs you", and the capture field above the tab dock |
| `money.jpg` | **Money** tab — where it went, coming up, accounts |
| `people.jpg` | **Settings → People** — shared expenses: who owes you, *Paid into*, and *Mark paid* |
| `tasks.jpg` | **Tasks** — projects, due dates, and nested sub-tasks |
| `learn.jpg` | **Learn** — tagged learnings grouped by week |
| `notes.jpg` | **Notes** — search and tagged notes |
| `habits.jpg` | **Habits** — active habits with streaks and schedules |
| `analytics.jpg` | `/analytics` — net-worth line + unusual-spending anomalies |
| `assistant.jpg` | `/assistant` — the "ask your data" prompt and example questions |

## How these were made

The current set (15 November 2026, the "quiet ledger" look) was captured headlessly from the live demo with Playwright: Chromium mobile emulation, 390×844 viewport at 2× (780×1688 px), JPEG quality 85. `people.jpg` was added on 16 November 2026 the same way, with the demo banner dismissed. Phone screenshots as described below work just as well; keep the filenames.

## How to refresh (iOS PWA)

1. Open the [demo](https://pulse-demo.sdsheikahamed.workers.dev) (or your own instance) and
   navigate to the screen.
2. Take a screenshot (side button + volume-up).
3. AirDrop / email it to your machine and rename it to the filename above.
4. Drop it in this folder (overwrite) and commit — the README gallery updates automatically:

   ```bash
   git add docs/screenshots/*.jpg
   git commit -m "docs: refresh app screenshots"
   git push
   ```

**Notes:** JPEG keeps these photographic screenshots small (~75 KB each vs multi-MB as PNG).
A clean status bar and realistic-but-not-private data read best.
