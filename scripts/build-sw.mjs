#!/usr/bin/env node
/**
 * Build Service Worker script for Lifeloom
 * This script compiles the TypeScript service worker and injects the precache manifest.
 * Required because Turbopack doesn't support @serwist/next webpack plugin.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildSync } from 'esbuild'
import { globSync } from 'glob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const swSrc = path.join(projectRoot, 'src/app/sw.ts')
const swDest = path.join(projectRoot, 'public/sw.js')
const publicDir = path.join(projectRoot, 'public')

console.log('[build-sw] Building service worker...')

try {
  // Compile the TypeScript service worker
  const result = buildSync({
    entryPoints: [swSrc],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    outfile: swDest,
    target: ['es2020'],
    minify: true,
  })

  if (result.errors.length > 0) {
    console.error('[build-sw] esbuild errors:')
    result.errors.forEach((err) => console.error('  ', err))
    process.exit(1)
  }

  // Get file list for precache manifest.
  // nodir: '**/*' matches directories too — a directory entry (e.g. "icons") becomes
  // a precache URL "/icons" that 404s, and ONE failed precache fetch rejects the whole
  // install → the SW never activates (breaking push subscribe + offline caching).
  const files = globSync('**/*', {
    cwd: publicDir,
    nodir: true,
    ignore: ['sw.js', '**/*.map', '**/manifest*.json'],
  })

  // Create precache manifest. Normalize path separators: glob returns native "\" on
  // Windows, which would emit URLs like "/icons\icon-192.png" that don't resolve.
  const manifest = files.map((file) => ({
    url: `/${file.split(path.sep).join('/')}`,
    revision: null, // In real apps, this would be a hash
  }))

  // Read the generated SW and inject manifest
  let swContent = fs.readFileSync(swDest, 'utf-8')

  // Inject the manifest at the top of the file
  const manifestJson = JSON.stringify(manifest)
  swContent = `self.__SW_MANIFEST = ${manifestJson};\n${swContent}`

  fs.writeFileSync(swDest, swContent)

  const swSize = fs.statSync(swDest).size
  console.log(`[build-sw] Service worker built successfully`)
  console.log(`[build-sw] Output: ${swDest}`)
  console.log(`[build-sw] Size: ${swSize} bytes`)
  console.log(`[build-sw] Precached files: ${manifest.length}`)

  process.exit(0)
} catch (error) {
  console.error('[build-sw] Failed to build service worker:')
  console.error(error)
  process.exit(1)
}
