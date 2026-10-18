# DeVig accounts (login + saved settings)

DeVig saves three things per person: what they track, their name tag and their favorite teams.
Without a login these stay in the browser on that device. With a login they follow the person to every device.

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

## Check it

Open the site, sign in, go to the **Me** tab. It should say "Saved to your account (your email)".
Pick a favorite team, then open the site on another device and sign in with the same email: the team is there.

If the Me tab says "Saved on this device", either the login isn't in front of the site yet or step 3 isn't
done. `/api/me` returns 401 without a valid login and 503 before the `USERS` binding exists.
