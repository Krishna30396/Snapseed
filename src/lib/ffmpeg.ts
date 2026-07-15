// webm → mp4 (H.264/AAC) with ffmpeg.wasm. The core is BUNDLED in the
// extension (public/ffmpeg) — no remote code. Lazy-loaded on first use and it
// runs in @ffmpeg/ffmpeg's own worker, so the panel never freezes.

import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

const TARGET_BYTES = 16 * 1024 * 1024
const CRF_LADDER = ['28', '33', '38']

let instance: FFmpeg | null = null

async function load(onProgress: (ratio: number) => void): Promise<FFmpeg> {
  if (!instance) {
    const ff = new FFmpeg()
    await ff.load({
      coreURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.js'),
      wasmURL: chrome.runtime.getURL('ffmpeg/ffmpeg-core.wasm'),
    })
    instance = ff
  }
  instance.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))
  return instance
}

/** Convert to mp4, stepping down quality until it fits under ~16MB. */
export async function webmToMp4(
  webm: Blob,
  onProgress: (ratio: number) => void,
): Promise<Blob> {
  const ff = await load(onProgress)
  await ff.writeFile('input.webm', await fetchFile(webm))
  try {
    for (const crf of CRF_LADDER) {
      // prettier-ignore
      await ff.exec([
        '-i', 'input.webm',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf,
        '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        '-y', 'output.mp4',
      ])
      const data = await ff.readFile('output.mp4')
      const bytes = data as Uint8Array
      if (bytes.byteLength <= TARGET_BYTES || crf === CRF_LADDER[CRF_LADDER.length - 1]) {
        return new Blob([bytes.slice()], { type: 'video/mp4' })
      }
    }
    throw new Error('unreachable')
  } finally {
    await ff.deleteFile('input.webm').catch(() => undefined)
    await ff.deleteFile('output.mp4').catch(() => undefined)
  }
}
