#!/bin/sh
# Installs the lint + test pre-commit hook for this clone.
top="$(git rev-parse --show-toplevel)" && cp "$top/trading/scripts/pre-commit" "$top/.git/hooks/pre-commit" && chmod +x "$top/.git/hooks/pre-commit" && echo "pre-commit hook installed"
