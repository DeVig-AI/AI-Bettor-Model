#!/usr/bin/env python3
"""
build_free_app.py -- turns a saved copy of the DeVig.AI artifact page into the free version at docs/index.html (the site's main page):
the same app, reading the repo's export files (docs/repo-data.js) instead of the claude.ai database, with the
Claude-only features hidden (docs/free.css).

Usage:  python3 tools/build_free_app.py path/to/devig.html
Re-run it whenever DeVig itself changes; repo-data.js and free.css stay as they are.
"""
import os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "docs", "index.html")

HEAD = ('<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#08090B">'
        '<link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-180.png">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="DeVig">')
FREE = '<link rel="stylesheet" href="free.css">\n<link rel="stylesheet" href="desktop.css">\n<script src="repo-data.js"></script>\n<script src="install.js" defer></script>\n<script src="account.js" defer></script>\n'
FOOT = ('<div class="free-foot">Free · account optional · '
        '<a href="#" onclick="return window.devigInstallTip ? devigInstallTip() : false">Add to home screen</a> · '
        '<a href="https://github.com/DeVig-AI/AI-Bettor-Model/releases/latest" target="_blank" rel="noopener">'
        'Desktop &amp; phone downloads</a></div>\n')

# (old, new, required)
EDITS = [
    ('<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">',
     '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' + HEAD, True),
    ("\n<script>\n(function(){", "\n" + FREE + "<script>\n(function(){", True),
    ("</body></html>", FOOT + "</body></html>", True),
]


def main():
    src = open(sys.argv[1], encoding="utf-8").read()
    for old, new, required in EDITS:
        n = src.count(old)
        if n != 1:
            msg = f"expected 1 match, found {n}: {old[:70]!r}"
            if required:
                sys.exit("build_free_app: " + msg)
            print("warning:", msg)
            continue
        src = src.replace(old, new)
    open(OUT, "w", encoding="utf-8").write(src)
    print("wrote", os.path.normpath(OUT), len(src), "bytes")


if __name__ == "__main__":
    main()
