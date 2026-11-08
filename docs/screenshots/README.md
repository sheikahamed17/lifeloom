# Screenshots

These fill the gallery in the main [README](../../README.md#screenshots). They were
captured from the [live demo](https://pulse-demo.sdsheikahamed.workers.dev) (phone-portrait,
real synthetic data, no login). The gallery references these **exact filenames** — replace
a file in place to refresh that tile, no README edit needed:

| File | Screen |
|---|---|
| `capture.jpg` | Home / **Money** — the capture bar (mic · +Add · Parse) over budgets & cards |
| `money.jpg` | **Money** tab — spend total, 8-week trend, category breakdown, filters |
| `tasks.jpg` | **Tasks** — projects, due dates, and nested sub-tasks |
| `learn.jpg` | **Learn** — tagged learnings with filter chips |
| `notes.jpg` | **Notes** — search, tag filters, and note cards |
| `habits.jpg` | **Habits** — active habits with 🔥 streaks and schedules |
| `analytics.jpg` | `/analytics` — net-worth line + unusual-spending anomalies |
| `assistant.jpg` | `/assistant` — the "ask your data" prompt and example questions |

## How these were made

The current set (November 2026, after the Lifeloom rename) was captured headlessly from the live demo with Playwright: Chromium mobile emulation, 390×844 viewport at 2× (780×1688 px), dark colour scheme, JPEG quality 85, each tab scrolled to its content. Phone screenshots as described below work just as well; keep the filenames.

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
