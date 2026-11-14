import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const svg = readFileSync(join(here, 'logo-icon.svg'), 'utf8')

const targets = [
  { out: 'public/icons/icon-192.png', size: 192 },
  { out: 'public/icons/icon-512.png', size: 512 },
  { out: 'public/icons/maskable-512.png', size: 512 },
  { out: 'src/app/apple-icon.png', size: 180 },
]

const render = (source, size) => new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng()

for (const { out, size } of targets) {
  const png = render(svg, size)
  writeFileSync(join(root, out), png)
  console.log(`wrote ${out}: ${size}px, ${png.length} bytes`)
}

// favicon.ico from the rounded SVG favicon: an ICO container holding PNG images (16, 32, 48px).
const favicon = readFileSync(join(root, 'src/app/icon.svg'), 'utf8')
const images = [16, 32, 48].map(size => ({ size, png: render(favicon, size) }))
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2)                 // type: icon
header.writeUInt16LE(images.length, 4)
let offset = 6 + 16 * images.length
const entries = images.map(({ size, png }) => {
  const e = Buffer.alloc(16)
  e.writeUInt8(size, 0)                    // width
  e.writeUInt8(size, 1)                    // height
  e.writeUInt16LE(1, 4)                    // colour planes
  e.writeUInt16LE(32, 6)                   // bits per pixel
  e.writeUInt32LE(png.length, 8)
  e.writeUInt32LE(offset, 12)
  offset += png.length
  return e
})
const ico = Buffer.concat([header, ...entries, ...images.map(i => i.png)])
writeFileSync(join(root, 'src/app/favicon.ico'), ico)
console.log(`wrote src/app/favicon.ico: 16/32/48px, ${ico.length} bytes`)
