import { useState } from 'react'
import { Check, ClipboardPaste, Copy, KeyRound } from 'lucide-react'
import { useKalshiKey } from '@/lib/kalshi-key'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// Profile → Kalshi key, iPhone app only: set up the key that lets a parlay be built as one Kalshi combo.
// The usual way: Kalshi makes the key, you copy its private key, and the app reads the clipboard itself (natively,
// never through this page), saves it in the iPhone Keychain and wipes the clipboard. Making a key on the iPhone is
// only for accounts Kalshi lets upload their own public key (Premier and Market Maker).

export function KalshiKey() {
  const k = useKalshiKey()
  const [id, setId] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [sure, setSure] = useState(false)
  const [own, setOwn] = useState(false)
  if (!k.available) return null

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    setErr('')
    try { await f() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) }
    setBusy(false)
  }
  const copy = () => {
    navigator.clipboard?.writeText(k.publicKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }).catch(() => {})
  }
  const btn = 'h-11 rounded-full px-5 text-sm font-bold disabled:opacity-50'

  return (
    <section aria-label='Kalshi key' className='flex flex-col gap-2'>
      <h2 className='px-1 font-display text-[22px] font-extrabold'>Kalshi key</h2>
      <div className='flex flex-col gap-3 rounded-[18px] bg-card px-4 py-3.5 text-sm leading-relaxed'>
        <div className='flex items-start gap-3'>
          <span aria-hidden='true' className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', k.ready ? 'bg-good' : 'bg-muted-foreground/40')} />
          <div className='min-w-0 flex-1'>
            <p className='font-semibold'>{k.ready ? 'Ready: parlays can go to Kalshi as one combo' : 'Send a whole parlay to Kalshi as one combo'}</p>
            <p className='text-muted-foreground'>
              The key stays in the iPhone Keychain, on this iPhone only, unlocked by Face ID each time. DeVig only uses it to
              build the combo; you put the money in and buy on Kalshi.
            </p>
          </div>
        </div>

        {!k.publicKey && !own && (
          <>
            <ol className='flex list-decimal flex-col gap-3 ps-5 marker:font-bold'>
              <li>On Kalshi, open <b>Profile → API Keys → Create New API Key</b>.</li>
              <li>Kalshi shows a private key once. Copy all of it, from the BEGIN line to the END line.</li>
              <li>
                Come back and tap below. iPhone asks to allow the paste. The app reads the key itself, saves it and clears the clipboard;
                the page never sees it.
                <button type='button' disabled={busy} onClick={() => run(k.importKey)} className={cn(btn, 'mt-2 flex w-full items-center justify-center gap-2 bg-devig text-devig-ink')}>
                  <ClipboardPaste className='size-4' aria-hidden='true' /> Paste the key from Kalshi
                </button>
              </li>
            </ol>
            <button type='button' onClick={() => setOwn(true)} className='self-start text-sm font-semibold text-muted-foreground underline underline-offset-4'>
              Premier or Market Maker account? Make a key here instead
            </button>
          </>
        )}

        {!k.publicKey && own && (
          <>
            <p className='text-muted-foreground'>Kalshi only lets Premier and Market Maker accounts add their own public key.</p>
            <button type='button' disabled={busy} onClick={() => run(k.makeKey)} className={cn(btn, 'flex items-center justify-center gap-2 bg-devig text-devig-ink')}>
              <KeyRound className='size-4' aria-hidden='true' /> Make a key on this iPhone
            </button>
            <button type='button' onClick={() => setOwn(false)} className='self-start text-sm font-semibold text-muted-foreground underline underline-offset-4'>
              Back to pasting Kalshi&apos;s key
            </button>
          </>
        )}

        {k.publicKey && !k.ready && k.source === 'kalshi' && (
          <ol className='flex list-decimal flex-col gap-3 ps-5 marker:font-bold' start={4}>
            <li>
              Key saved on this iPhone. Now copy the <b>Key ID</b> Kalshi showed with it and paste it here. The Key ID isn&apos;t secret.
              <div className='mt-2 flex gap-2'>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder='Key ID' aria-label='Kalshi Key ID'
                  autoCapitalize='off' autoCorrect='off' spellCheck={false} className='h-11 flex-1 rounded-xl' />
                <button type='button' disabled={busy || !id.trim()} onClick={() => run(() => k.saveKeyId(id))} className={cn(btn, 'bg-devig text-devig-ink')}>
                  Save
                </button>
              </div>
            </li>
            <li className='text-muted-foreground'>If Kalshi downloaded a key file, delete it from Files so the only copy is here.</li>
          </ol>
        )}

        {k.publicKey && !k.ready && k.source === 'made' && (
          <ol className='flex list-decimal flex-col gap-3 ps-5 marker:font-bold'>
            <li>
              Copy this public key. It isn&apos;t secret.
              <button type='button' onClick={copy} className={cn(btn, 'mt-2 flex w-full items-center justify-center gap-2 border')}>
                {copied ? <Check className='size-4' aria-hidden='true' /> : <Copy className='size-4' aria-hidden='true' />}
                {copied ? 'Copied' : 'Copy public key'}
              </button>
            </li>
            <li>
              On Kalshi, add it as your own public key (Premier and Market Maker accounts only). If Kalshi asks what the key may do,
              allow trading only, never transfers.
            </li>
            <li>
              Kalshi then shows a <b>Key ID</b>. Paste it here.
              <div className='mt-2 flex gap-2'>
                <Input value={id} onChange={(e) => setId(e.target.value)} placeholder='Key ID' aria-label='Kalshi Key ID'
                  autoCapitalize='off' autoCorrect='off' spellCheck={false} className='h-11 flex-1 rounded-xl' />
                <button type='button' disabled={busy || !id.trim()} onClick={() => run(() => k.saveKeyId(id))} className={cn(btn, 'bg-devig text-devig-ink')}>
                  Save
                </button>
              </div>
            </li>
          </ol>
        )}

        {k.ready && (
          <p className='text-muted-foreground'>
            {k.source === 'kalshi' ? 'Kalshi’s key' : 'Key made on this iPhone'} · Key ID <span className='break-all font-mono text-foreground'>{k.keyId}</span>
          </p>
        )}

        {k.publicKey && (
          sure ? (
            <div className='flex flex-col gap-2 rounded-xl bg-bad/10 p-3'>
              <p>Remove the key from this iPhone? Also delete it under API Keys on Kalshi so it can never be used again.</p>
              <div className='flex gap-2'>
                <button type='button' disabled={busy} onClick={() => run(async () => { await k.remove(); setSure(false); setId(''); setOwn(false) })} className={cn(btn, 'flex-1 bg-bad text-white')}>Remove</button>
                <button type='button' onClick={() => setSure(false)} className={cn(btn, 'flex-1 border')}>Keep</button>
              </div>
            </div>
          ) : (
            <button type='button' onClick={() => setSure(true)} className='self-start text-sm font-semibold text-muted-foreground underline underline-offset-4'>
              Remove key
            </button>
          )
        )}
        {err && <p role='alert' className='font-semibold text-bad'>{err}</p>}
      </div>
    </section>
  )
}
