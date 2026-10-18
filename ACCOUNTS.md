# DeVig accounts (login + saved settings)

DeVig saves three things per person: what they track, their name tag and their favorite teams.
Without an account these stay in the browser on that device. With an account they follow the person to every device.
Opening an account takes the **invite code**: someone who finds the site can sign in and look around, but can't save
anything to the shared storage without the code you give your friends.

How it works:
- **Cloudflare Access** puts an email login in front of https://devigai.pages.dev. Visitors type their email, get a 6-digit code, and they're in. There are no passwords.
- **`functions/api/me.js`** is a Cloudflare Pages Function. It checks the Access login token and reads or writes that person's settings in a **KV** store. The key is a hash of the email, and nothing else about the person is stored.
- **`docs/account.js`** is in the website. It loads the settings after login and saves every change.

All of it runs on Cloudflare's free plans: Access is free for up to 50 people, and KV is free for 100,000 reads and 1,000 writes a day.

## One-time setup (Cloudflare dashboard)

1. **Login (Access)**
   - Go to Zero Trust → Access → Applications → Add an application → Self-hosted.
   - Domain: `devigai.pages.dev`, with the path left empty. Session duration: 1 month.
   - Policy: Allow. Include either *Emails* (a list) or *Everyone* (anyone with an email can sign in).
   - Login method: One-time PIN.
   - After saving, open the application and copy its **Application Audience (AUD) Tag**.
   - Note your **team domain**, for example `devigai.cloudflareaccess.com`. It's under Zero Trust → Settings → Custom Pages, or shown on the login page.
2. **Storage (KV)**
   - Go to Storage & Databases → KV → Create a namespace, named `devig-users`.
3. **Connect them to the site**
   - In Workers & Pages → devigai → Settings, find **Bindings** → Add → KV namespace.
   - Variable name `USERS`, namespace `devig-users`, for Production.
   - Under **Variables and secrets** → Add (Production):
     - `ACCESS_TEAM_DOMAIN` = your team domain, for example `devigai.cloudflareaccess.com`
     - `ACCESS_AUD` = the AUD tag from step 1
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
- **Friends only:** to stop strangers even seeing the site, change the policy's *Include* from *Everyone* to a list of
  your friends' emails.
- **Floods (DDoS):** Cloudflare absorbs attack traffic in front of every Pages site for free. The site is plain files,
  and only signed-in requests reach `/api/me`, so a flood can't run up anything.
- **Safety headers:** `docs/_headers` stops other sites from framing DeVig to trick people into clicking things.

## Check it

Open the site, sign in, go to the **Me** tab, type the invite code and tap **Open my account**.
It should then say "Saved to your account (your email)".
Pick a favorite team, then open the site on another device and sign in with the same email: the team is there.

If the Me tab says "Saved on this device", either the login isn't in front of the site yet or step 3 isn't
done. `/api/me` returns 401 without a valid login and 503 before the `USERS` binding exists.
"Invite codes are not set up yet" means `INVITE_CODE` is missing.
