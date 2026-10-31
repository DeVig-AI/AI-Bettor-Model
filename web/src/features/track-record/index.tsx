import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

export function TrackRecord() {
  return (
    <>
      <Header fixed>
        <Search className='me-auto' placeholder='Go to…' />
        <ThemeSwitch />
        <ConfigDrawer />
      </Header>
      <Main className='flex flex-col gap-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Track record</h1>
          <p className='text-muted-foreground'>
            Every locked pick, graded, with profit at Kalshi&apos;s price and fee.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Moving here next</CardTitle>
            <CardDescription>
              This page will show units won or lost at Kalshi (not just
              win–loss) and a calibration chart: when DeVig says 70%, how often
              that side really wins.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant='outline'>
              <a href='../'>
                <ExternalLink />
                Open it in the classic app
              </a>
            </Button>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
