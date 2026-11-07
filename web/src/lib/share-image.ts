// Share a drawn card (PNG) from wherever DeVig is open: the iPhone app opens iOS's share sheet natively (its web view
// can't download files), a phone browser uses the share sheet, and a computer downloads the file.
type Bridge = { getPlatform?: () => string; nativePromise?: (plugin: string, method: string, opts: object) => Promise<unknown> }

const toDataUrl = (blob: Blob) => new Promise<string>((ok, bad) => {
  const r = new FileReader()
  r.onload = () => ok(String(r.result))
  r.onerror = () => bad(r.error)
  r.readAsDataURL(blob)
})

export async function shareImage(blob: Blob, name: string, text?: string): Promise<void> {
  const c = (window as unknown as { Capacitor?: Bridge }).Capacitor
  if (c?.getPlatform?.() === 'ios' && typeof c.nativePromise === 'function') {
    try {
      await c.nativePromise('DeVigLive', 'share', { image: await toDataUrl(blob), text: text ?? '' })
      return
    } catch { /* an older app without native sharing: fall through */ }
  }
  const file = new File([blob], name, { type: blob.type || 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share(text ? { files: [file], text } : { files: [file] }) } catch { /* closed the sheet */ }
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
