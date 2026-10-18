# DeVig apps

**Web app (free, no Claude):** https://perezreynaldo1226-afk.github.io/AI-Bettor-Model/app/
It is DeVig.AI reading the repo's export files directly (`docs/app/repo-data.js`). On a phone, open it and use
Share → Add to Home Screen.

**Updating the app:** change `docs/app/` (or rebuild it from a new copy of DeVig with
`python3 tools/build_free_app.py tools/devig_source.html`) and push to `main`. GitHub Pages redeploys in about a
minute, and the web, Mac and Windows apps all show the new version on their next open.

**Mac and Windows downloads:** Actions → "DeVig desktop apps -- build Mac and Windows downloads" → Run workflow.
It builds `DeVig-mac.dmg` and `DeVig-Setup-windows.exe` and posts them on the Releases page. The desktop app is a
window onto the web app, so it only needs rebuilding when this `desktop/` folder changes.

**Later: Android (APK) and iPhone (IPA).** Same idea with Capacitor. The APK can be built by GitHub Actions and
installed directly. An IPA that installs on a real iPhone needs an Apple Developer account ($99/year) to sign it;
until then the home-screen web app is the iPhone version.
