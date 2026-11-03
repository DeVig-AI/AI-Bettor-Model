import { Link, useRouter } from '@tanstack/react-router'

// An address that goes nowhere in the app: most often an old link, or a game that has left the board
export function NotFoundError() {
  const { history } = useRouter()
  return (
    <main className='flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center'>
      <h1 className='font-display text-[40px] leading-none font-black'>Page not found</h1>
      <p className='max-w-xs text-sm leading-relaxed text-muted-foreground'>
        This link doesn&apos;t go anywhere in DeVig. It may be an old link, or a game that&apos;s no longer on the board.
      </p>
      <div className='mt-3 flex gap-2'>
        <button type='button' onClick={() => history.go(-1)}
          className='h-11 rounded-full border px-5 text-sm font-semibold hover:bg-muted/50'>
          Go back
        </button>
        <Link to='/' className='inline-flex h-11 items-center rounded-full bg-devig px-5 text-sm font-bold text-[#0a0b0f] hover:opacity-90'>
          Back to Games
        </Link>
      </div>
    </main>
  )
}
