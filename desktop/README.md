# DeVig apps

**Web app (free, no Claude):** https://devigai.pages.dev/app/
It is DeVig.AI reading the repo's export files directly (`docs/app/repo-data.js`). On a phone, open it and use
Share → Add to Home Screen.

**Updating the app:** change `docs/app/` (or rebuild it from a new copy of DeVig with
`python3 tools/build_free_app.py tools/devig_source.html`) and push to `main`. GitHub Pages redeploys in about a
minute, and the web, Mac and Windows apps all show the new version on their next open.

**Downloads (Mac, Windows, Android, iPhone):** Actions → "DeVig apps -- build Mac, Windows, Android and iPhone
downloads" → Run workflow. It builds `DeVig-mac.dmg`, `DeVig-Setup-windows.exe`, `DeVig-android.apk` and
`DeVig-iphone.ipa` and posts them on the Releases page. Every app is a window onto the web app, so it only needs
rebuilding when `desktop/` or `mobile/` changes. None are signed with paid certificates: the APK installs directly
(debug-signed), and the IPA is sideloaded with AltStore or Sideloadly, which re-sign it with your Apple ID.
