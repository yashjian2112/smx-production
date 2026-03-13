#!/usr/bin/env bash

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: npm run ship -- \"your commit message\""
  exit 1
fi

commit_message="$*"
current_branch="$(git branch --show-current)"

if [[ "$current_branch" != "main" ]]; then
  echo "Refusing to ship from branch '$current_branch'. Switch to 'main' first."
  exit 1
fi

if git diff --cached --quiet; then
  echo "No staged changes found. Stage the files you want to deploy, then run ship again."
  exit 1
fi

staged_files="$(git diff --cached --name-only)"
conflicted_files=()

while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if ! git diff --quiet -- "$file"; then
    conflicted_files+=("$file")
  fi
done <<< "$staged_files"

if (( ${#conflicted_files[@]} > 0 )); then
  echo "These staged files also have unstaged edits. Finish or stash them first:"
  printf ' - %s\n' "${conflicted_files[@]}"
  exit 1
fi

echo "Running TypeScript check..."
npx tsc --noEmit

echo "Creating commit..."
git commit -m "$commit_message"

echo "Pushing to origin/main..."
git push origin main

cat <<'EOF'
Push complete.
If Vercel is connected to this repo, it will start deploying automatically from GitHub.
EOF
