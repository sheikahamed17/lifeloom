// `npm run dev:demo`: run Lifeloom locally in DEMO mode, fully seeded, no sign-in.
//
// What it does (all local, nothing touches Cloudflare):
//   1. creates a git-ignored .dev.vars with random local secrets if you have none
//   2. applies the D1 migrations to a local database in .wrangler/state
//   3. starts `next dev` against wrangler.demo.toml (DEMO_MODE=true: auto-signed-in
//      demo user, canned AI, no email/push)
//   4. seeds the demo data through /api/cron/demo-reset once the server is up
//
// Use `npm run dev` instead for your own (non-demo) config.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const PORT = 3000
const STATE = '.wrangler/state'
const hex = n => randomBytes(n).toString('hex')

if (!existsSync('.dev.vars')) {
  writeFileSync(
    '.dev.vars',
    `CRON_SECRET=${hex(24)}\nBETTER_AUTH_SECRET=${hex(24)}\nBETTER_AUTH_URL=http://localhost:${PORT}\n`,
  )
  console.log('[dev:demo] wrote .dev.vars with random local secrets (git-ignored)')
}
const cronSecret = /^CRON_SECRET=(.+)$/m.exec(readFileSync('.dev.vars', 'utf8'))?.[1]?.trim()
if (!cronSecret) {
  console.error('[dev:demo] .dev.vars has no CRON_SECRET; add one (any random string) and retry.')
  process.exit(1)
}

console.log('[dev:demo] applying local migrations...')
const mig = spawnSync(
  process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', 'd1', 'migrations', 'apply', 'DB', '--local', '-c', 'wrangler.demo.toml', '--persist-to', STATE],
  { stdio: 'inherit' },
)
if (mig.status !== 0) process.exit(mig.status ?? 1)

const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(PORT)], {
  stdio: 'inherit',
  env: { ...process.env, LIFELOOM_WRANGLER_CONFIG: 'wrangler.demo.toml', LIFELOOM_LOCAL_STATE: `${STATE}/v3` },
})
next.on('exit', code => process.exit(code ?? 0))
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => next.kill())

// Seed once the server answers. The first request also triggers the first compile.
const base = `http://localhost:${PORT}`
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 2000))
  try {
    const res = await fetch(`${base}/api/cron/demo-reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })
    if (res.ok) {
      console.log(`\n[dev:demo] demo data seeded. Open ${base}/app\n`)
      break
    }
    if (res.status === 403) {
      console.error('[dev:demo] seed refused (403): is something else already running on this port?')
      break
    }
  } catch {
    /* server not up yet */
  }
}
