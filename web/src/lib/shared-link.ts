// A bet link handed to DeVig from another app: Android's Share menu (the installed app's share target sends
// ?url=…&text=…), or an iPhone Shortcut that opens /v2/?link=…. The Parlay page's Check a bet box reads it once.

let pending: string | null = null

const URL_RE = /https?:\/\/[^\s<>"']+/i
export const isExchange = (s: string) => /(^|\.|\/\/)(kalshi\.com|polymarket\.(com|us))\b/i.test(s)

/** On load: take a shared link out of the address, send the app to Parlay, and keep the link for the box. */
export function catchShared(loc: Location = window.location): boolean {
  const q = new URLSearchParams(loc.search)
  const bits = ['link', 'url', 'text', 'title'].map((k) => q.get(k)).filter((v): v is string => !!v)
  if (!bits.length) return false
  const found = bits.map((b) => URL_RE.exec(b)?.[0]).filter((v): v is string => !!v)
  const link = found.find(isExchange) ?? found[0] ?? null
  if (!link) return false
  pending = link.replace(/[).,!?]+$/, '')
  window.history.replaceState(null, '', `${loc.pathname}#/parlay`)
  return true
}

export const sharedLink = () => pending
export const clearShared = () => { pending = null }
