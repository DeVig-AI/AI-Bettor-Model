# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(Also shipped inside Capacitor phone apps and an Electron desktop app that load the same web code; the design language stays web, not native iOS/Android.)

## Users

Anyone who bets on sports or prediction markets, from first-timers to experienced bettors. Experience level differs a lot, so the app asks each person how experienced they are and adapts: newer people get plain-language explanations of what a number means; experienced people get denser numbers without the hand-holding. (Owner decision 2026-10-31: "a version for anyone... ask that to the user".)

Main situation: on a phone, checking a game right before or during it. Computer users researching a full slate must not be left out: wide screens get the full board side by side.

## Product Purpose

DeVig shows what the market's prices really say once the vig/fee is removed, what DeVig's own models think, and how those models have actually done. Success is a bettor trusting the numbers because they can check them, not because the app tells them they'll win.

## Positioning

A transparent tool, not a winning system. DeVig makes no fake promises: every pick is locked before the game, graded afterward and kept in a public, append-only record in the GitHub repo. Track records show profit or loss at the real price after fees, not just win–loss, and calibration (when DeVig says 70%, how often it happens). Competitors don't publish calibration; DeVig does. When a model isn't beating the market, the app says so.

## Operating Context

- Data is public JSON committed every few minutes by GitHub Actions bots (`live/live_lines.json`, `live/game_lines.json`, `{nfl,nba,mlb}/lineboard_export.json`, models and champions exports), read straight from raw.githubusercontent.com. Faster live scores come from the site's own `/api/live`.
- Prices are Kalshi-first (exchange: proportional devig); Polymarket and sportsbooks appear where available (sportsbooks: power devig).
- Sports: NFL, NBA, MLB with DeVig picks; NHL, CFB, WNBA with prices and scores.
- Hosted on Cloudflare Pages (devigai.pages.dev). The classic single-file app lives at `/`; the rebuild lives at `/v2/` (`web/`, Vite + React + shadcn/ui + TanStack) and replaces it page by page.
- Nothing is bet by DeVig. Picks are paper picks.

## Capabilities and Constraints

- Capabilities (classic app, moving to v2 over time): games board with live scores and Kalshi lines, game pages, DeVig picks, props, parlays, injuries, models comparison with champion/challenger, Research Lab, track record.
- Locked research rules: frozen models, pre-registrations and results in `FROZEN.sha256` must not change; app files are not locked.
- Kalshi fee is charged per order and rounded; profit numbers must include it.
- Undecided: how the "how experienced are you?" question is asked and stored, and exactly what changes per level.

## Brand Commitments

- Name: DeVig. Tagline: "Odds, read straight."
- Icon: `branding/devig-icon.svg` (a V whose right arm is sliced near the tip — the vig knocked away).
- Voice: plain, honest, unhyped. States limits openly ("Display only", "unofficial", "Nothing is bet"). Never "lock of the day", never guaranteed wins.

## Evidence on Hand

- Real, public pick logs and grades in the repo (append-only), live Kalshi prices, ESPN scores.
- Calibration table work on branch `app-accuracy-v1`.
- No testimonials, user counts, press or win-rate marketing claims exist; none may be invented.

## Product Principles

1. Show the number, then what it means: every figure is checkable and, for those who want it, explained.
2. Honesty over hype: losses, passes and "no edge" are shown as plainly as wins.
3. Phone first, never phone only: the glance on a phone and the slate on a computer are both first-class.
4. Meet each person at their level: the same truth, explained more or less depending on who's reading.
5. Market first, model second: the fair market price is the baseline; DeVig's model is judged against it.

## Accessibility & Inclusion

Readable at a glance on small screens in bright and dark settings; win/loss and edge never conveyed by color alone (signs, words or icons too).
