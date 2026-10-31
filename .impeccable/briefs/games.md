# Surface brief: Games (web/src/features/games)

Mode: Operate. Phone first (390px), computer first-class (1280–1600px). Code-led (no image generation; launcher not installed).

Audience/job: anyone checking tonight's games: what's live, what the market really says, what DeVig thinks, how far apart those are. Glance on a phone; full slate on a computer.

## Direction contract

THESIS: Every game is read as one fair line: Kalshi's price split to 100% with the fee gap knocked away, and DeVig's read notched onto it. Refuses the admin-template dashboard (KPI cards over a grey data table).

OWN-WORLD: Night-game ink (#0c0f14 ground, #151a22 rows, slate team tones) with DeVig amber (#e0a656) reserved for DeVig's own read: the notch, the edge, the pick. Live = green state only. Barlow throughout; Barlow Semi Condensed for scores, codes and prices, tabular figures. Ruled list rows, not cards.

STORY: The visitor sees what's live first, reads each game's fair split in one bar, spots the amber notch where DeVig disagrees with the market and by how much, and can switch on plain-English explanations if odds are new to them.

FIRST VIEWPORT: Phone: sticky top bar (DeVig mark, "Games", update time + refresh); league chips; day segmented control; "Live now" group header; game rows (status · teams + scores · fair line with amber notch · DeVig line). Bottom tab bar (Games, Track record). Computer: sidebar + the same rows laid out as columns (status, matchup, fair line wide, Kalshi, spread/total, DeVig).

FORM: Ruled sports-list with the fair-line bar as signature move (own derivation, first of list: fair line > score-bug rows > odds-board columns). seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- How experience level is stored beyond this device (localStorage only for now).
- Game detail page (rows are not yet tappable).
