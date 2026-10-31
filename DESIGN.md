---
name: DeVig
description: Odds, read straight. Matchup Plates: each game in its teams' colors, cut at Kalshi's fair split, with DeVig's read as an amber slash.
colors:
  ink-ground: "#0a0b0f"
  ink-row: "#12151c"
  ink-raised: "#1b212b"
  ink-rail: "#0f1218"
  chalk: "#f2f4f8"
  chalk-soft: "#9aa4b6"
  hairline: "#2a313d"
  hairline-strong: "#38414f"
  devig-amber: "#ffb547"
  devig-amber-ink: "#1a1206"
  side-away: "#3a4556"
  side-home: "#66748b"
  live-green: "#4ade80"
  win-green: "#8ef0b4"
  loss-red: "#ffa3a3"
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

# DeVig design system: Matchup Plates

## Overview

DeVig is a working tool for reading sports prices honestly, dressed like a broadcast matchup graphic. Every game is a
**Matchup Plate**: the two teams' real colors (from `live/game_lines.json`) meet in a diagonal cut placed at Kalshi's
fair split (away on the left), with team codes and percentages set huge in Big Shoulders Display. DeVig's own read is
an **amber slash** through the plate at the model's chance; the gap between cut and slash is the gap between DeVig and
the market. The slash echoes the logo: a V with its tip sliced off.

The rest of the screen stays a standard product: chips, a segmented day switch, search, a bottom tab bar on phones, a
sidebar on computers, a bottom sheet for explanations. Phone first, never phone only: plates stack on phones and sit two
across from 1024px.

## Colors

- **Team colors** paint the plates. A 25% black veil keeps white type readable on light team colors, and a dark seam
  marks the cut so two similar colors still read as two sides. Without colors, the plate falls back to the neutral sides.
- **Ink** (`ink-ground` #0a0b0f, `ink-row` #12151c): grounds; everything that isn't a plate.
- **DeVig amber** (#ffb547 dark, #8a5a12 light): only DeVig's read and DeVig's own actions: the slash, the "DeVig:" line,
  the Why? button, the DeVig picks filter, the active tab. Never decoration.
- **State:** live green (#4ade80) dot and clock; won (#8ef0b4) and lost (#ffa3a3) always also written as words.

## Typography

Big Shoulders Display (900/800) for team codes, scores, percentages and page/section titles: the broadcast voice.
Barlow for everything people read; Barlow Semi Condensed with tabular figures for prices and data. No all-caps labels
except real abbreviations.

## Layout

- Group order on Games: DeVig's picks, Live now, Upcoming, Final.
- A plate is 132px tall in lists (248px as a game-page hero); the line under it carries DeVig's read, Kalshi's prices
  and the Why? button.
- Track record leads with a Won/Lost plate (cut at the win share), then units in big type, then the graded list.

## Components

- **Matchup Plate** (`web/src/features/games/plate.tsx`).
- **Why? sheet** (`explain-sheet.tsx`): bottom sheet with a three-level switch (New to this / Sometimes / Numbers). Same
  numbers at every level. Built only from the model's locked inputs (`inputs` in the lineboard export) and real prices;
  it says which side each input favors, never how much it moved the number. Live and finished games say the read is
  pregame.
- **How do you bet?** first-run card: three tinted half-plates; the book button in the header cycles the level.
- **Track record**: win–loss plus units at the locked price (before fee), and the plain sentence when a winning record
  lost money.

## Do's and Don'ts

- Do keep amber for DeVig's read and nothing else.
- Do show losses, passes, negative gaps and "pregame" labels as plainly as wins.
- Don't compare DeVig's pregame number with an in-game price as if it were an edge.
- Don't add KPI cards, sparklines or decorative motion; motion is 150ms state change (the live dot is the exception).
