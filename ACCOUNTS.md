# DeVig accounts (login + saved settings)

DeVig saves three things per person: what they track, their name tag and their favorite teams.
Anyone can open https://devigai.pages.dev and use the app without signing in. Tracking, the name tag and favorite
teams need a free account, and they follow the person to every device. Opening an account takes the **invite code**
you give your friends, so a stranger can look around but can't save anything to the shared storage.

How it works:
- **Cloudflare Access** guards only https://devigai.pages.dev/login. The profile button's "Sign in or create account" goes
  there: people type their email, get a 6-digit code, and come back to the app signed in. There are no passwords.
- **`functions/api/me.js`** is a Cloudflare Pages Function. It checks the Access login token and reads or writes that person's settings in a **KV** store. The key is a hash of the email, and nothing else about the person is stored.
- **`docs/account.js`** is in the website. It loads the settings after login and saves every change.

All of it runs on Cloudflare's free plans: Access is free for up to 50 people, and KV is free for 100,000 reads and 1,000 writes a day.

## One-time setup (Cloudflare dashboard)

1. **Login (Access)**
   - Go to Zero Trust → Access → Applications → Add an application → Self-hosted.
   - Domain: `devigai.pages.dev`, path `login` (only the sign-in page; the rest of the site stays public). Session duration: 1 month.
   - Policy: Allow. Include either *Emails* (a list) or *Everyone* (anyone with an email can sign in).
   - Login method: One-time PIN.
   - Optional: copy the application's **Application Audience (AUD) Tag** if the dashboard shows it. Without it, logins
     from any Access app on your own team are accepted, and DeVig is the only one.
   - Note your **team domain**, for example `devigai.cloudflareaccess.com`. It's under Zero Trust → Settings → Custom Pages, or shown on the login page.
2. **Storage (KV)**
   - Go to Storage & Databases → KV → Create a namespace, named `devig-users`.
3. **Connect them to the site**
   - In Workers & Pages → devigai → Settings, find **Bindings** → Add → KV namespace.
   - Variable name `USERS`, namespace `devig-users`, for Production.
   - Under **Variables and secrets** → Add (Production):
     - `ACCESS_TEAM_DOMAIN` = your team domain, for example `devigai.cloudflareaccess.com`
     - `ACCESS_AUD` = the AUD tag from step 1 (optional)
   - Under **Build watch paths**, add `functions/*` next to `docs/*`.
4. **Redeploy**
   - Go to Deployments → latest → ⋯ → Retry deployment, so the function and the bindings go live.

## Invite code and keeping out griefers

- **Set the code.** In devigai → Settings → **Variables and secrets** → Add, choose type **Secret**:
  - name `INVITE_CODE`, value something hard to guess, for example `bears-tacos-4417`;
  - capital letters and spaces at the ends don't matter;
  - you can list several codes with commas, which makes it easy to retire one.
  - Retry the deployment afterwards.
- **Share it privately** with friends (a text or a group chat). Don't put it in the repo: the repo is public.
- **What each person is limited to:**
  - 5 wrong codes per 15 minutes;
  - one save every 2 seconds;
  - 300 saves a day.
  - So one person can't use up the free daily allowance everyone shares, and wrong guesses don't use any of it.
- **Someone leaked the code?** Change `INVITE_CODE` and retry the deployment. People who already opened an account keep it.
- **Ban someone:** in Zero Trust → Access → Applications → DeVig → Policies, add an **Exclude** rule with their email.
  They can't sign in at all after that.
- **Friends only:** to stop strangers from even signing in, change the policy's *Include* from *Everyone* to a list of
  your friends' emails (the app itself stays viewable).
- **Floods (DDoS):** Cloudflare absorbs attack traffic in front of every Pages site for free. The site is plain files.
  A request to `/api/me` without a valid login is turned away before storage is touched, and if a flood ever used up
  the free function allowance, "Fail open" keeps the site itself loading for everyone.
- **Safety headers:** `docs/_headers` stops other sites from framing DeVig to trick people into clicking things.

## Chat (Ask tab)

The Ask tab answers questions about the picks with a free AI, through `functions/api/ask.js`. It answers from the
app's data plus a general betting guide, and every answer reminds people that AI can make mistakes. Only signed-in
people with an open account (the invite code) can use it, up to 50 questions each per day.

It uses the first of these that's set up:

1. **Google Gemini** (most free answers, about 1,000 a day): get a free key at https://aistudio.google.com (Get API
   key), then in devigai → Settings → Variables and secrets → Add, type **Secret**, name `GEMINI_API_KEY`.
   On the free tier Google may use the questions to improve its products; no names or emails are sent.
2. **Cloudflare Workers AI** (no sign-up, a few hundred answers a day): devigai → Settings → **Bindings** → Add →
   **Workers AI**, variable name `AI`. It uses a small Llama model; `AI_MODEL` picks another.

Set up both and Gemini answers first, with Cloudflare as the backup when Gemini's daily allowance runs out.
Retry the deployment after adding either. When everything is used up, the chat says so and works again the next day.

## Screenshot reading (Parlay → Check a bet you made)

`functions/api/scan.js` reads a screenshot of a bet slip with the same AI and the same setup as the chat: Gemini
(`GEMINI_API_KEY`, reads images well) first, then Cloudflare's Llama vision model through the `AI` binding (weaker). The
first time the Cloudflare model runs it accepts Meta's license for the account automatically. Open accounts only, 20
screenshots each per day; the image isn't stored. On Google's free tier Google may use the images to improve its products.

## Check it

Open the site, tap the profile button (top right) → **Sign in or create account**, enter the email code, then type the
invite code and tap **Open my account**.
It should then say "Saved to your account (your email)".
Pick a favorite team, then open the site on another device and sign in with the same email: the team is there.

If the profile says "Saved on this device (…)", the words in brackets say what's missing. `/api/me` returns 401 without a valid login and 503 before the `USERS` binding exists.
"Invite codes are not set up yet" means `INVITE_CODE` is missing.

## Owner Lab (private)

`/lab` is a private phone dashboard for the owner (layout from the owner-approved sketch): the latest run of every GitHub Actions workflow and the Research
Lab's progress (`research/status.json`, format in `research/STATUS_SCHEMA.md`). It's served only by
`functions/lab.js` and `functions/api/lab.js`, never linked from the app, and marked noindex / no-store.
Anyone who isn't the owner (signed out, another account, `OWNER_EMAIL` not set) gets the site's normal
"Page not found" (`docs/404.html`).

Setup, in devigai → Settings → Variables and secrets (Production), then retry the deployment:
- `OWNER_EMAIL` = the email you sign in with (plain variable).
- `GITHUB_TOKEN` (optional, type Secret) = a fine-grained token for this repo only, permission Actions: read-only.
  Without it GitHub allows 60 requests an hour; the page caches for 3 minutes, which stays under that.

To open it: go to **/login?next=/lab**, enter the email code, and you land on the Lab. The page keeps showing
/login?next=/lab as its address, so Share → Add to Home Screen (or a bookmark) saves that route: tapping the icon
signs you in again if needed and opens the Lab.
The Access login cookie covers the whole site, so `/lab` sees it the same way `/api/me` does. When the login runs
out, the page shows "Sign in again", which goes the same way.

Tests: `node --test tests/lab/lab.test.mjs tests/lab/ui.test.mjs` (the second drives Chromium at 390px with mocked
GitHub answers; screenshots land in `tests/lab/out/`).
