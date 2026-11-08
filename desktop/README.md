# DeVig apps

**Web app:** https://devigai.pages.dev/ (the root opens DeVig at `/v2/`, built from `web/` into `docs/v2`).
On a phone, open it and use Share → Add to Home Screen.

**Updating the app:** change `web/`, run `npm run build` in `web/` (it writes `docs/v2`) and push to `main`.
Cloudflare Pages redeploys in about a minute, and the web, Mac, Windows and phone apps all show the new version on
their next open.

**Downloads (Mac, Windows, Android, iPhone):** Actions → "DeVig apps -- build Mac, Windows, Android and iPhone
downloads" → Run workflow. It builds `DeVig-mac.dmg`, `DeVig-Setup-windows.exe`, `DeVig-android.apk` and
`DeVig-iphone.ipa` and posts them on the Releases page. Every app is a window onto the web app, so it only needs
rebuilding when `desktop/` or `mobile/` changes. None are signed with paid certificates: the APK installs directly
(debug-signed), and the IPA is sideloaded with AltStore or Sideloadly, which re-sign it with your Apple ID.
