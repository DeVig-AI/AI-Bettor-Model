#!/bin/sh
# Starts the DeVig AI gate (gate.mjs) now and at every login, as a macOS LaunchAgent. Run it yourself:
#   sh scripts/local-ai/install-gate.sh        (undo: launchctl bootout gui/$(id -u)/ai.devig.gate; rm ~/Library/LaunchAgents/ai.devig.gate.plist)
set -e
DIR="$HOME/devig-local-ai"; P="$HOME/Library/LaunchAgents/ai.devig.gate.plist"; NODE="$(command -v node)"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
cp "$(dirname "$0")/gate.mjs" "$DIR/gate.mjs"
[ -s "$HOME/.devig-local-ai-key" ] || (umask 077; node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > "$HOME/.devig-local-ai-key")
cat > "$P" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ai.devig.gate</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/gate.mjs</string></array>
  <key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$DIR/gate.log</string><key>StandardErrorPath</key><string>$DIR/gate.log</string>
</dict></plist>
PL
launchctl bootout "gui/$(id -u)/ai.devig.gate" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$P"
sleep 1; curl -s localhost:11435/health && echo " gate is running"
