#!/bin/bash
# SMX Production Tracker — Deploy Guard
# Blocks deployment commands if running from a worktree
# Runs on PreToolUse for Bash commands

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

# Check if this is a deploy-related command
if echo "$COMMAND" | grep -qE 'vercel|git push'; then
  # Check if current working directory is a worktree
  CWD=$(pwd)
  if [[ "$CWD" == *"worktrees"* ]] || [[ "$CWD" == *".claude/worktrees"* ]]; then
    echo "BLOCKED: Deployment detected from a git worktree ($CWD). ALWAYS deploy from /Users/mr.yash/Desktop/production only. Merge worktree changes to main first, then deploy from the main directory." >&2
    exit 2
  fi
fi

exit 0
