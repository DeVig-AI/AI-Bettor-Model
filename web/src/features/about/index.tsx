import { Link } from '@tanstack/react-router'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ThemeSwitch } from '@/components/theme-switch'

// About: what DeVig is and isn't, in plain words, and what testing has found. Facts here come from the classic
// app's About and the project's dated tests; nothing is added that the record doesn't show.

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className='rounded-[18px] bg-card p-4 md:p-5'>
      <h2 className='font-display text-[22px] font-extrabold'>{title}</h2>
      <div className='mt-2 flex flex-col gap-2.5 text-[15px] leading-relaxed text-muted-foreground [&_b]:text-foreground'>{children}</div>
    </section>
  )
}

export function About() {
  return (
    <>
      <Header>
        <div className='me-auto min-w-0'>
          <h1 className='font-display text-[26px] leading-none font-black'>About</h1>
          <p className='mt-0.5 truncate text-xs text-muted-foreground'>Odds, read straight</p>
        </div>
        <ThemeSwitch />
      </Header>
      <Main className='mx-auto flex w-full max-w-3xl flex-col gap-4'>
        <Block title='Plainly'>
          <p>DeVig shows Kalshi&apos;s prices with the fee gap taken out, so you see the market&apos;s fair chance for each side, and next to it what DeVig&apos;s own models think.</p>
          <p><b>None of DeVig&apos;s models has been proven to beat the betting odds.</b> On past seasons the market&apos;s own prices were more accurate, so treat a pick as one more opinion, not a sure thing. DeVig never takes or places bets.</p>
        </Block>

        <Block title='How the numbers work'>
          <p><b>Fair chance:</b> Kalshi&apos;s price for both sides adds up to a little over 100%. Scaling it back to 100% gives the market&apos;s fair chance.</p>
          <p><b>Prices you see</b> are what you&apos;d really pay on Kalshi, its fee included, written as sportsbook odds.</p>
          <p><b>Picks are locked before the game</b> and graded from the final score. The <Link to='/track-record' className='text-devig'>Track record</Link> counts them at the price they were locked at, wins and losses alike.</p>
        </Block>

        <Block title='What testing has found'>
          <p><b>Who wins:</b> on past seasons the models picked winners well above a coin flip (NFL about 66%, NBA 63.5%, MLB 56%), and their most confident quarter of picks did better (NFL about 77%, NBA 78%, MLB 61%). Favorites win often but pay little, and those picks didn&apos;t make money against real prices.</p>
          <p><b>Spreads:</b> the NFL spread model is about a coin flip (54.6% on held-out games).</p>
          <p><b>Player props:</b> the props model beat a simple hit rate on past seasons but was less accurate than Kalshi&apos;s own prices.</p>
          <p><b>NFL over/unders, key-number spreads and the low-total underdog</b> each looked positive on past seasons without being confirmed, so each is followed live on Kalshi&apos;s prices.</p>
          <p>When a test fails it stays failed and stays visible.</p>
        </Block>

        <Block title='Models compared'>
          <p><Link to='/models' className='text-devig'>Models</Link> grades DeVig&apos;s models next to models other people publish (nfelo, 538 Elo, Blotny NBA, FBS Elo, CFB Rankings) on the same games with the same rules, from each model&apos;s last number before the game. Kalshi&apos;s price is the baseline. Each model&apos;s author, link and license are listed there.</p>
        </Block>

        <Block title='Where the data comes from'>
          <p>Prices from Kalshi. Scores and stats from ESPN (NBA, MLB, college football), the NHL, and nflverse (NFL). Injury reports from each league&apos;s official report. All free and public, unofficial, and updated through the day.</p>
        </Block>
      </Main>
    </>
  )
}
