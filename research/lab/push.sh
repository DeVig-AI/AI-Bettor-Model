#!/usr/bin/env bash
# Commit the Research Lab's files and push, with the same pull --rebase retry loop the other bots use.
# Usage: research/lab/push.sh "<commit message>"
set -u
git config user.name "research-lab-bot"
git config user.email "actions@users.noreply.github.com"
git add research FROZEN.sha256
git diff --cached --quiet && { echo "nothing to commit"; exit 0; }
git commit -q -m "$1"
# another bot may have pushed since checkout: rebase onto it and retry. A conflict aborts the rebase and fails the
# step (never a half-rebased push); the step only passes once the results are on main.
for i in 1 2 3; do
  if git pull --rebase --autostash -q; then
    git push -q && exit 0
  else
    git rebase --abort 2>/dev/null || true
    echo "::warning::git pull --rebase failed (try $i)"
  fi
  sleep $((i * 5))
done
echo "::error::could not push the Research Lab's results after 3 tries"
exit 1
