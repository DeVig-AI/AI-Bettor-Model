import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { type ShareLeg, type ShareText } from '@/lib/share-math'
import { cn } from '@/lib/utils'

// A finished parlay as an image to post: how many legs hit, Kalshi's odds at kickoff, DeVig's grade, every leg with
// its result, and whether DeVig's weakest leg was the one that sank it. Drawn on a canvas (always in the dark theme)
// so it shares as a real image file from a phone.

const W = 1080
const C = { bg: '#0a0b0f', card: '#12151c', fg: '#f2f4f8', muted: '#9aa3b5', good: '#8ef0b4', bad: '#ffa3a3', devig: '#ffb547', line: '#262b36' }
const F = { display: "'Big Shoulders Display', 'Barlow Semi Condensed', sans-serif", cond: "'Barlow Semi Condensed', 'Barlow', sans-serif", body: "'Barlow', sans-serif" }
const GRADE: Record<string, string> = { A: C.good, B: C.good, C: C.devig, D: C.bad, F: C.bad }

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const t = line ? `${line} ${w}` : w
    if (ctx.measureText(t).width > max && line) { out.push(line); line = w } else line = t
  }
  if (line) out.push(line)
  return out
}
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text
  let t = text
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}
function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

async function draw(t: ShareText, legs: ShareLeg[], letter: string | null, won: boolean): Promise<HTMLCanvasElement> {
  await Promise.all([`900 100px ${F.display}`, `700 40px ${F.cond}`, `500 40px ${F.body}`, `700 40px ${F.body}`].map((f) => document.fonts.load(f).catch(() => null)))
  const P = 84, inner = W - P * 2
  const m = document.createElement('canvas').getContext('2d')!
  m.font = `500 42px ${F.body}`
  const subLines = wrap(m, t.sub, inner)
  m.font = `600 36px ${F.body}`
  const weakLines = t.weak ? wrap(m, t.weak, inner - 40) : []
  const H = Math.max(1350, 640 + subLines.length * 56 + legs.length * 128 + (weakLines.length ? weakLines.length * 48 + 90 : 0) + 230)

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, W * 0.9)
  glow.addColorStop(0, won ? 'rgba(142,240,180,0.16)' : 'rgba(255,181,71,0.14)')
  glow.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  let y = P + 20
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = C.muted
  ctx.font = `700 34px ${F.cond}`
  ctx.fillText(t.kicker.toUpperCase(), P, y)

  // the result, big
  y += 150
  ctx.fillStyle = won ? C.good : C.fg
  ctx.font = `900 150px ${F.display}`
  ctx.fillText(fit(ctx, t.head, inner - (letter ? 170 : 0)), P, y)
  if (letter) {
    const s = 136, gx = W - P - s, gy = y - 130
    pill(ctx, gx, gy, s, s, 30)
    ctx.fillStyle = C.card
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = GRADE[letter] ?? C.devig
    ctx.stroke()
    ctx.fillStyle = GRADE[letter] ?? C.devig
    ctx.font = `900 96px ${F.display}`
    ctx.textAlign = 'center'
    ctx.fillText(letter, gx + s / 2, gy + 100)
    ctx.font = `700 24px ${F.cond}`
    ctx.fillStyle = C.muted
    ctx.fillText('DEVIG GRADE', gx + s / 2, gy + s + 34)
    ctx.textAlign = 'left'
  }
  y += 30
  ctx.fillStyle = C.fg
  ctx.globalAlpha = 0.86
  ctx.font = `500 42px ${F.body}`
  for (const l of subLines) { y += 56; ctx.fillText(l, P, y) }
  ctx.globalAlpha = 1

  // the legs
  y += 64
  for (const l of legs) {
    pill(ctx, P, y, inner, 108, 26)
    ctx.fillStyle = C.card
    ctx.fill()
    const tone = l.result === 'won' ? C.good : l.result === 'lost' ? C.bad : C.muted
    const word = l.result === 'won' ? 'Won' : l.result === 'lost' ? 'Lost' : 'Open'
    ctx.font = `700 30px ${F.body}`
    const pw = ctx.measureText(word).width + 44
    pill(ctx, W - P - 28 - pw, y + 32, pw, 46, 23)
    ctx.fillStyle = tone
    ctx.globalAlpha = 0.16
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = tone
    ctx.fillText(word, W - P - 28 - pw + 22, y + 65)
    const tw = inner - 56 - pw - 24
    ctx.fillStyle = C.fg
    ctx.font = `700 40px ${F.cond}`
    ctx.fillText(fit(ctx, l.label, tw), P + 28, l.score ? y + 50 : y + 66)
    if (l.score) {
      ctx.fillStyle = C.muted
      ctx.font = `500 28px ${F.body}`
      ctx.fillText(fit(ctx, l.score, tw), P + 28, y + 88)
    }
    if (l.weakest) {
      ctx.fillStyle = C.devig
      ctx.fillRect(P, y + 22, 6, 64)
    }
    y += 128
  }

  // DeVig's weakest leg
  if (weakLines.length) {
    y += 10
    ctx.fillStyle = C.devig
    ctx.fillRect(P, y, 6, weakLines.length * 48 + 4)
    ctx.font = `600 36px ${F.body}`
    let wy = y + 36
    for (const l of weakLines) { ctx.fillText(l, P + 40, wy); wy += 48 }
    y = wy
  }

  // crop to what was drawn (no shorter than square), then the footer
  const out = document.createElement('canvas')
  out.width = W
  out.height = Math.max(W, Math.ceil(y + 210))
  const o = out.getContext('2d')!
  o.fillStyle = C.bg
  o.fillRect(0, 0, W, out.height)
  o.drawImage(cv, 0, 0)
  const fy = out.height - P - 10
  o.fillStyle = C.line
  o.fillRect(P, fy - 78, inner, 2)
  o.fillStyle = C.devig
  o.font = `900 54px ${F.display}`
  o.fillText('devigai.pages.dev', P, fy)
  o.fillStyle = C.muted
  o.font = `500 32px ${F.body}`
  o.textAlign = 'right'
  o.fillText('Odds, read straight.', W - P, fy)
  return out
}

export function ShareCard({ t, legs, letter, won }: { t: ShareText; legs: ShareLeg[]; letter: string | null; won: boolean }) {
  const [img, setImg] = useState<{ url: string; blob: Blob } | null>(null)
  const [copied, setCopied] = useState(false)
  const key = JSON.stringify([t, legs, letter, won])
  useEffect(() => {
    let url = '', gone = false
    draw(t, legs, letter, won).then((cv) => cv.toBlob((blob) => {
      if (!blob || gone) return
      url = URL.createObjectURL(blob)
      setImg({ url, blob })
    }, 'image/png'))
    return () => { gone = true; if (url) URL.revokeObjectURL(url) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  const share = async () => {
    if (!img) return
    const file = new File([img.blob], 'devig-parlay.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], text: t.text }) } catch { /* closed the sheet */ }
      return
    }
    const a = document.createElement('a')
    a.href = img.url
    a.download = file.name
    a.click()
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${t.text} devigai.pages.dev`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }

  return (
    <section aria-label='Share card' className='rounded-[18px] bg-card p-4'>
      <h3 className='font-display text-lg font-extrabold'>Share it</h3>
      <div className='mt-3 overflow-hidden rounded-[14px] bg-black'>
        {img
          ? <img src={img.url} alt={`${t.kicker}. ${t.text}`} className='block w-full' />
          : <div className='aspect-[4/5] w-full animate-pulse bg-muted motion-reduce:animate-none' />}
      </div>
      <div className='mt-3 grid grid-cols-2 gap-2'>
        <button type='button' onClick={share} disabled={!img}
          className='flex h-11 items-center justify-center gap-2 rounded-full bg-devig text-sm font-bold text-black disabled:opacity-50'>
          <Share2 className='size-4' aria-hidden='true' />Share image
        </button>
        <button type='button' onClick={copy}
          className={cn('flex h-11 items-center justify-center gap-2 rounded-full bg-muted text-sm font-bold', copied && 'text-good')}>
          {copied ? <Check className='size-4' aria-hidden='true' /> : <Copy className='size-4' aria-hidden='true' />}
          {copied ? 'Copied' : 'Copy text'}
        </button>
      </div>
      <span className='sr-only' aria-live='polite'>{copied ? 'Copied' : ''}</span>
    </section>
  )
}
