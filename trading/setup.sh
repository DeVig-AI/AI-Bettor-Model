#!/bin/sh
# One-time setup on Mac or Linux. From this folder:  sh setup.sh
# Needs Python 3.12 (Mac: `brew install python@3.12`; Ubuntu: `sudo apt install python3.12 python3.12-venv`).
set -e
cd "$(dirname "$0")"

PY=""
for c in python3.12 python3 python; do
    if command -v "$c" >/dev/null 2>&1 && [ "$("$c" -c 'import sys; print("%d.%d" % sys.version_info[:2])')" = "3.12" ]; then
        PY="$c"; break
    fi
done
if [ -z "$PY" ]; then
    echo "Python 3.12 not found. Install it (see the top of this file), then run again."
    exit 1
fi

[ -d .venv ] || { echo "Creating .venv ..."; "$PY" -m venv .venv; }
.venv/bin/python -m pip install --upgrade pip -q
echo "Installing packages (a few minutes the first time) ..."
.venv/bin/python -m pip install --prefer-binary -r requirements.txt -q

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env - open it and paste your keys."
fi
chmod +x trader.sh

echo "Running quick self-test ..."
.venv/bin/python scripts/cli.py selftest
echo ""
echo "Ready. Use ./trader.sh <command>, e.g.  ./trader.sh probe"
