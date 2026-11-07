"""Writes the AltStore update feed (altstore.json) for the iPhone build, so AltStore shows an Update button for each
new DeVig build. Run by .github/workflows/devig_apps.yml after the IPA is built:
    python3 native/altstore_source.py <App.app> <ipa> <run number> <out json>
The feed's permissions are read from the built app itself, since AltStore refuses an install whose permissions don't
match its source. The feed lives on each GitHub release; the latest release's copy is the address added to AltStore."""
import datetime
import json
import os
import plistlib
import sys

REPO = "DeVig-AI/AI-Bettor-Model"
FEED = f"https://github.com/{REPO}/releases/latest/download/altstore.json"


def privacy(app):
    # every ...UsageDescription in the app and its extensions (the lock-screen cards)
    plists = [os.path.join(app, "Info.plist")]
    plug = os.path.join(app, "PlugIns")
    if os.path.isdir(plug):
        plists += [os.path.join(plug, p, "Info.plist") for p in sorted(os.listdir(plug))]
    out = {}
    for p in plists:
        with open(p, "rb") as f:
            d = plistlib.load(f)
        out.update({k: v for k, v in d.items() if k.endswith("UsageDescription")})
    return dict(sorted(out.items())), d_of(plists[0])


def d_of(p):
    with open(p, "rb") as f:
        return plistlib.load(f)


def main(app, ipa, run, out):
    priv, info = privacy(app)
    version, build = info["CFBundleShortVersionString"], info["CFBundleVersion"]
    assert version == f"1.{run}" and build == str(run), f"the build isn't stamped 1.{run} ({run}): {version} ({build})"
    feed = {
        "name": "DeVig",
        "subtitle": "Updates for the DeVig iPhone app",
        "sourceURL": FEED,
        "iconURL": "https://devigai.pages.dev/v2/icon-192.png",
        "tintColor": "#FFB547",
        "website": "https://devigai.pages.dev",
        "nsfw": False,
        "apps": [{
            "name": "DeVig",
            "bundleIdentifier": info["CFBundleIdentifier"],
            "developerName": "DeVig",
            "subtitle": "Odds, read straight.",
            "localizedDescription": "DeVig opens the hosted DeVig site, so most updates arrive on their own. "
                                    "A new build here is only needed when the app itself changes. Paper test data only; nothing is bet.",
            "iconURL": "https://devigai.pages.dev/v2/icon-192.png",
            "tintColor": "#FFB547",
            "category": "utilities",
            "versions": [{
                "version": version,
                "buildVersion": build,
                "date": datetime.date.today().isoformat(),
                "downloadURL": f"https://github.com/{REPO}/releases/download/app-v1.{run}/DeVig-iphone.ipa",
                "size": os.path.getsize(ipa),
                "localizedDescription": f"DeVig {version}. See the release notes on GitHub.",
                "minOSVersion": info.get("MinimumOSVersion", "13.0"),
            }],
            # an unsigned build has no entitlements; AltStore signs it with your Apple ID
            "appPermissions": {"entitlements": [], "privacy": priv},
        }],
        "news": [],
    }
    with open(out, "w") as f:
        json.dump(feed, f, indent=2)
    print(f"altstore.json: DeVig {version} ({build}), {len(priv)} privacy keys")


if __name__ == "__main__":
    main(*sys.argv[1:5])
