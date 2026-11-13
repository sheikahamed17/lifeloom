import withSerwistInit from '@serwist/next'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

// `next dev` has no Cloudflare runtime, but the middleware and API routes call
// getCloudflareContext(). OpenNext's dev init gives them local D1/R2 bindings
// (miniflare, state under .wrangler/ which is git-ignored). Dev only: builds and
// the deployed Worker are untouched. `npm run dev:demo` points these two env vars
// at the demo config and a seeded local database; plain `npm run dev` uses wrangler.toml.
if (process.env.NODE_ENV === 'development') {
  void initOpenNextCloudflareForDev({
    configPath: process.env.LIFELOOM_WRANGLER_CONFIG ?? 'wrangler.toml',
    ...(process.env.LIFELOOM_LOCAL_STATE ? { persist: { path: process.env.LIFELOOM_LOCAL_STATE } } : {}),
  })
}

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // Dev has no service worker (Serwist doesn't support Turbopack and would rewrite
  // public/sw.js on every compile). The production build still generates it.
  disable: process.env.NODE_ENV !== 'production',
  cacheOnNavigation: true,
  reloadOnOnline: true,
})

export default withSerwist({
  reactStrictMode: true,
  turbopack: {},
  webpack(config) {
    return config
  },
})
