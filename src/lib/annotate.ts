// One-canvas annotation editor: arrow, rect, text, blur (pixelate), undo.
// No libraries. Ops are replayed over the base image so undo is a pop().

export type Tool = 'arrow' | 'rect' | 'text' | 'blur'

interface ShapeOp {
  tool: 'arrow' | 'rect' | 'blur'
  x1: number
  y1: number
  x2: number
  y2: number
}
interface TextOp {
  tool: 'text'
  x: number
  y: number
  text: string
}
type Op = ShapeOp | TextOp

const ACCENT = '#FF3B30'
const STROKE = 3

export interface Annotator {
  canvas: HTMLCanvasElement
  setTool(tool: Tool): void
  undo(): boolean
  hasOps(): boolean
  toDataUrl(): string
  /** fires after any op is committed or undone */
  onChange: (() => void) | null
}

export function createAnnotator(image: HTMLImageElement): Annotator {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const ctx = mustContext(canvas)

  const ops: Op[] = []
  let tool: Tool = 'arrow'
  let draft: ShapeOp | null = null

  const api: Annotator = {
    canvas,
    setTool: (t) => {
      tool = t
    },
    undo: () => {
      const popped = ops.pop() !== undefined
      if (popped) {
        render()
        api.onChange?.()
      }
      return popped
    },
    hasOps: () => ops.length > 0,
    toDataUrl: () => canvas.toDataURL('image/png'),
    onChange: null,
  }

  function render(extra?: Op): void {
    ctx.drawImage(image, 0, 0)
    for (const op of ops) drawOp(ctx, image, op)
    if (extra) drawOp(ctx, image, extra)
  }

  function toImageXY(ev: PointerEvent | MouseEvent): { x: number; y: number } {
    const r = canvas.getBoundingClientRect()
    return {
      x: ((ev.clientX - r.left) / r.width) * canvas.width,
      y: ((ev.clientY - r.top) / r.height) * canvas.height,
    }
  }

  canvas.addEventListener('pointerdown', (ev) => {
    const p = toImageXY(ev)
    if (tool === 'text') {
      // Keep the press from stealing focus out of the input we're about to place.
      ev.preventDefault()
      placeTextInput(canvas, ev, (text) => {
        ops.push({ tool: 'text', x: p.x, y: p.y, text })
        render()
        api.onChange?.()
      })
      return
    }
    draft = { tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y }
    canvas.setPointerCapture(ev.pointerId)
  })
  canvas.addEventListener('pointermove', (ev) => {
    if (!draft) return
    const p = toImageXY(ev)
    draft.x2 = p.x
    draft.y2 = p.y
    render(draft)
  })
  canvas.addEventListener('pointerup', () => {
    if (!draft) return
    const done = draft
    draft = null
    if (Math.hypot(done.x2 - done.x1, done.y2 - done.y1) < 3) {
      render()
      return
    }
    ops.push(done)
    render()
    api.onChange?.()
  })

  render()
  return api
}

function drawOp(ctx: CanvasRenderingContext2D, image: HTMLImageElement, op: Op): void {
  if (op.tool === 'text') {
    const size = Math.max(16, ctx.canvas.width / 30)
    ctx.font = `600 ${size}px system-ui, sans-serif`
    ctx.fillStyle = ACCENT
    ctx.strokeStyle = 'rgba(255,255,255,.9)'
    ctx.lineWidth = 3
    ctx.strokeText(op.text, op.x, op.y)
    ctx.fillText(op.text, op.x, op.y)
    return
  }
  if (op.tool === 'blur') {
    pixelate(ctx, image, op)
    return
  }
  ctx.strokeStyle = ACCENT
  ctx.lineWidth = STROKE
  ctx.lineCap = 'round'
  if (op.tool === 'rect') {
    ctx.strokeRect(op.x1, op.y1, op.x2 - op.x1, op.y2 - op.y1)
  } else {
    drawArrow(ctx, op)
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, op: ShapeOp): void {
  const angle = Math.atan2(op.y2 - op.y1, op.x2 - op.x1)
  const head = Math.max(10, STROKE * 4)
  ctx.beginPath()
  ctx.moveTo(op.x1, op.y1)
  ctx.lineTo(op.x2, op.y2)
  for (const side of [-1, 1]) {
    ctx.moveTo(op.x2, op.y2)
    ctx.lineTo(
      op.x2 - head * Math.cos(angle + (side * Math.PI) / 7),
      op.y2 - head * Math.sin(angle + (side * Math.PI) / 7),
    )
  }
  ctx.stroke()
}

function pixelate(ctx: CanvasRenderingContext2D, image: HTMLImageElement, op: ShapeOp): void {
  const x = Math.max(0, Math.min(op.x1, op.x2))
  const y = Math.max(0, Math.min(op.y1, op.y2))
  const w = Math.min(Math.abs(op.x2 - op.x1), ctx.canvas.width - x)
  const h = Math.min(Math.abs(op.y2 - op.y1), ctx.canvas.height - y)
  if (w < 2 || h < 2) return
  const block = 12
  const small = document.createElement('canvas')
  small.width = Math.max(1, Math.round(w / block))
  small.height = Math.max(1, Math.round(h / block))
  const sctx = small.getContext('2d')
  if (!sctx) return
  sctx.drawImage(image, x, y, w, h, 0, 0, small.width, small.height)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h)
  ctx.imageSmoothingEnabled = true
}

function mustContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  return ctx
}

function placeTextInput(
  canvas: HTMLCanvasElement,
  ev: MouseEvent,
  commit: (text: string) => void,
): void {
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'annotate-text-input'
  input.placeholder = 'Type, then Enter'
  const host = canvas.parentElement ?? document.body
  const hostRect = host.getBoundingClientRect()
  input.style.left = `${ev.clientX - hostRect.left}px`
  input.style.top = `${ev.clientY - hostRect.top}px`
  host.append(input)
  requestAnimationFrame(() => input.focus())
  let done = false
  const finish = (save: boolean) => {
    if (done) return
    done = true
    const text = input.value.trim()
    input.remove()
    if (save && text) commit(text)
  }
  input.addEventListener('keydown', (ke) => {
    if (ke.key === 'Enter') finish(true)
    if (ke.key === 'Escape') finish(false)
  })
  input.addEventListener('blur', () => finish(true))
}
