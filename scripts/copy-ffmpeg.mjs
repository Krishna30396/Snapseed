// Copies the ffmpeg.wasm core into public/ so it ships INSIDE the extension
// (Chrome forbids remote code; local wasm is fine). Runs before every build.
import { cpSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm')
const dest = join(root, 'public', 'ffmpeg')
mkdirSync(dest, { recursive: true })
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  cpSync(join(src, f), join(dest, f))
}
console.log('ffmpeg core copied to public/ffmpeg')
