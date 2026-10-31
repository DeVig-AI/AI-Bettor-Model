# DeVig web v2

The next version of the DeVig app, built on [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT, see `LICENSE`):
Vite, React, TypeScript, shadcn/ui, TanStack Router, Query and Table.

It reads the same public export files as the classic app (`docs/index.html`), straight from the repo on GitHub.
The classic app stays live while pages move over here one at a time.

```sh
cd web
npm install
npm run dev     # http://localhost:5173
npm run build   # writes ../docs/v2, served at https://devigai.pages.dev/v2/
```

Pages so far: **Games** (`src/features/games`), **Track record** (placeholder, `src/features/track-record`).
Data and odds math: `src/lib/devig.ts` (same fair-chance rule as the classic app's `devigTwoWay`).
