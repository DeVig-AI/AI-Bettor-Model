#!/bin/sh
# Runs a trader command with this folder's Python. Example: ./trader.sh probe
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || { echo "Run setup first: sh setup.sh"; exit 1; }
exec .venv/bin/python scripts/cli.py "$@"
