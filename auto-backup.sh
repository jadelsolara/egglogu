#!/bin/bash
# Auto-backup: commit all changes every 15 minutes
# Runs via cron to prevent work loss

REPO="$HOME/Desktop/Proyectos/EGGlogU"
cd "$REPO" || exit 1

# Check if there are changes to commit
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    exit 0  # Nothing to commit
fi

# Stage everything and commit
git add -A
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
git commit -m "auto-backup: $TIMESTAMP" --no-verify 2>/dev/null
