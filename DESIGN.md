---
name: DeVig
description: Odds, read straight. Night-game ink, slate sides, and DeVig amber reserved for DeVig's own read.
colors:
  ink-ground: "#0c0f14"
  ink-row: "#151a22"
  ink-raised: "#1b212b"
  ink-rail: "#0f1218"
  chalk: "#e9ecf2"
  chalk-soft: "#9aa4b6"
  hairline: "#2a313d"
  hairline-strong: "#38414f"
  devig-amber: "#e0a656"
  devig-amber-ink: "#1a1206"
  side-away: "#3a4556"
  side-home: "#66748b"
  live-green: "#57c98c"
  loss-red: "#e2807f"
  day-ground: "#f6f4ef"
  day-row: "#ffffff"
  day-ink: "#161a21"
  day-ink-soft: "#5d6575"
  day-amber: "#8a5a12"
typography:
  title:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Barlow, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
  score:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    letterSpacing: "0.025em"
    fontFeature: "tnum"
  figure:
    fontFamily: "Barlow Semi Condensed, Barlow, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    fontFeature: "tnum"
rounded:
  md: "10px"
  lg: "12px"
  xl: "16px"
  pill: "9999px"
spacing:
  row-x: "16px"
  row-x-wide: "20px"
  row-y: "14px"
  stack: "16px"
components:
  button-primary:
    backgroundColor: "{colors.devig-amber}"
    textColor: "{colors.devig-amber-ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  chip:
    textColor: "{colors.chalk-soft}"
    rounded: "{rounded.pill}"
    height: "32px"
    padding: "0 14px"
  chip-active:
    backgroundColor: "{colors.chalk}"
    textColor: "{colors.ink-ground}"
    rounded: "{rounded.pill}"
    height: "32px"
  game-group:
    backgroundColor: "{colors.ink-row}"
    rounded: "{rounded.xl}"
  group-header:
    backgroundColor: "{colors.ink-rail}"
    textColor: "{colors.chalk}"
    typography: "{typography.body}"
    padding: "10px 16px"
  fair-line:
    height: "8px"
    rounded: "{rounded.pill}"
---

# DeVig design system

## Overview

DeVig is a working tool for reading sports prices honestly. The screen is a product of its category first: a ruled list of games with standard controls (chips, a segmented day switch, search, a bottom tab bar on phones, a sidebar on computers). The identity lives in four places only: night-game ink, Barlow's broadcast-condensed figures, the density of a scoreboard list, and one signature move, the **fair line**.

The fair line is every game's 100% split at Kalshi's price with the fee gap removed: away on the left, home on the right, slate on slate. When DeVig's model picks a side, an amber notch marks its chance and an amber band fills the gap between the market split and the notch. That gap is the product.

Phone first, never phone only: rows stack on phones and spread into columns (status, matchup, fair line) from 1024px up. Dark is the default because games are watched at night on a couch; the daytime twin is complete, not an afterthought.

## Colors

- **Ink** (`ink-ground`, `ink-row`, `ink-raised`, `ink-rail`): blue-black grounds. Rows sit one step above the page; group headers and the sidebar use the rail tone.
- **Chalk** (`chalk`, `chalk-soft`): text. Secondary text is `chalk-soft`, never a plain grey.
- **DeVig amber** (`devig-amber`, light: `day-amber`): only DeVig's own read. The notch, the edge band, the "DeVig:" line, the active tab, the primary button of the level question. Never decoration, never a hover color for generic UI.
- **Sides** (`side-away`, `side-home`): the two halves of the fair line. Neutral on purpose so amber reads instantly.
- **State**: `live-green` for games in progress (dot, clock, a 4% row wash); `loss-red` for a lost pick. Win and loss are always also written as words.

## Typography

Barlow everywhere; Barlow Semi Condensed for anything read as a figure: team codes, scores, prices, percentages, spreads, counts. Figures use tabular numerals so columns align. A tight fixed rem scale (0.75 / 0.875 / 1.0625 / 1.125rem); weight does the hierarchy, not size jumps. No display face, no all-caps labels except real abbreviations (team codes, league codes).

## Layout

- Phone: sticky top bar (DeVig mark, page title with a one-line summary in plain words, refresh with age, explain toggle, theme), filter row (league chips scroll sideways with a bleed), day switch + search, then groups. Bottom tab bar respects the safe area.
- Computer (lg, 1024px+): row grid `8.5rem | minmax(15rem,1fr) | minmax(16rem,1.15fr)`; filters on one line with day switch and search pushed right.
- Group order: DeVig's picks, Live now, Upcoming, Final (final newest first).
- Row padding 14px × 16px (20px from md). More space above a group than inside it.

## Elevation & Depth

Flat and tonal. Depth comes from the ink steps (ground → row → raised) and 1px hairlines, not shadows. The only shadow is the small one under the selected day in the segmented switch. The amber notch carries a 2px ring in the row color so it cuts cleanly through the bar.

## Shapes

Groups are rounded 16px; controls 10–12px; chips and the fair line are full pills. Rows inside a group are ruled with hairlines and have no radius of their own.

## Components

- **Game row**: status (live clock in green with a pulsing dot, or local time; league code) · two team lines (code, name, score, Kalshi price) · fair line · DeVig line + spread/total. Optional plain-English sentence when the reader chose "explain".
- **Fair line**: see Overview. Labelled at both ends with code and fair %. Exposed to screen readers as one sentence.
- **DeVig line**: "DeVig: MEM 64%  −10.6 pts vs. Kalshi" in amber; "DeVig: pass · not far enough from the market" in muted text; omitted for sports without a DeVig model.
- **Level question**: amber-tinted callout on first visit, "New to betting odds?" with "Yes, explain" / "I know odds". The book button in the top bar flips it later.
- **Chips**: outline pills; active is solid chalk on ink. "DeVig picks" sits after a divider as a filter, not a league.
- **Empty state**: says what's empty and offers the way out (clear filters, show next 7 days).

## Do's and Don'ts

- Do keep amber for DeVig's read and nothing else.
- Do show losses, passes and negative gaps as plainly as wins.
- Do write numbers' meaning in plain words when the reader asked for it.
- Don't add KPI cards, hero metrics or sparklines over the list.
- Don't use eyebrow labels above headings or "A · B · C" meta strings in headers.
- Don't add glass, gradients or decorative motion; motion is 150ms state change only (the live dot is the one exception).
