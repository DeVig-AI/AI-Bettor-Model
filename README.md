<p align="center"><img src="branding/devig-icon-1024.png" width="128" alt="DeVig icon"></p>

<h1 align="center">DeVig</h1>
<p align="center"><b>Odds, read straight.</b> NFL, MLB and NBA models, tested in public against real prices.</p>

<p align="center">
  <a href="https://devigai.pages.dev/">Open the app</a> ·
  <a href="https://github.com/perezreynaldo1226-afk/AI-Bettor-Model/releases/latest">Mac, Windows, Android and iPhone downloads</a>
</p>

GitHub Actions in this repo pull public odds and exchange prices, run frozen models, lock paper picks before each
game under pre-registered rules, and grade them afterward. Every pick and result is committed here, append-only.
Nothing is bet.

- `nfl/`, `mlb/`, `nba/`: models, live tests, pre-registrations (`*_PREREG.md`) and their logs
- `docs/`: the web app, served at https://devigai.pages.dev by Cloudflare Pages (`docs/app/` only forwards old links)
- `desktop/`, `mobile/`: the app shells; see `desktop/README.md` for building and updating them
- `branding/`: the icon (`devig-icon.svg`) and the repo's social preview image

## Locked test files
`FROZEN.sha256` lists the fingerprint of every frozen model, table, pre-registration, pick and grading script and
training file, and the results databases. The **Frozen guard** workflow checks it on every pull request, every push to
main and once a day. It goes red if a locked file changes or a recorded pick or result is rewritten or deleted.
Intended fixes are allowed when logged with a date in `FROZEN_CHANGES.md`; then run
`python3 tools/frozen_guard.py rehash <file>`. App files are not locked.
