#!/bin/bash
# SMX Production Tracker — Policy Engine
# Runs on PreToolUse for Write/Edit operations
# Exit 0 = allow, Exit 2 = block with message

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
NEW_CONTENT=$(echo "$INPUT" | jq -r '.tool_input.new_string // .tool_input.content // empty')

# ─── Policy 1: readyForDispatch protection ───
# NEVER set readyForDispatch=true outside of dispatch-orders routes
if [[ "$FILE_PATH" != *"dispatch-orders"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE 'readyForDispatch\s*[=:]\s*true'; then
    echo "BLOCKED: readyForDispatch=true is ONLY allowed in app/api/dispatch-orders/. Setting it elsewhere permanently removes units from dispatch queries." >&2
    exit 2
  fi
fi

# ─── Policy 2: Print page protection ───
# NEVER call window.print() outside /print/ pages
if [[ "$FILE_PATH" != *"/print/"* ]]; then
  if echo "$NEW_CONTENT" | grep -qE 'window\.print\(\)|window\.open.*\/print\/' ; then
    echo "BLOCKED: window.print() and programmatic /print/ page opens cause browser freezes. Print pages auto-call window.print() — never open them from action flows." >&2
    exit 2
  fi
fi

# ─── Policy 3: Schema protection ───
# Warn (not block) when editing schema.prisma
if [[ "$FILE_PATH" == *"schema.prisma"* ]]; then
  echo "WARNING: Editing prisma/schema.prisma. This requires explicit user confirmation. Proceed only if the user explicitly approved this change." >&2
fi

# ─── Policy 4: Auth check on new API routes ───
# Warn if a new API route file doesn't include auth
if [[ "$FILE_PATH" == *"/api/"* ]] && [[ "$TOOL_NAME" == "Write" ]]; then
  if ! echo "$NEW_CONTENT" | grep -qE 'requireSession|requireRole|getSession'; then
    echo "WARNING: New API route at $FILE_PATH has no auth check. All API routes must use requireSession() or requireRole() from lib/auth.ts." >&2
  fi
fi

# ─── Policy 5: Prisma client protection ───
# Block creating new PrismaClient instances
if echo "$NEW_CONTENT" | grep -qE 'new PrismaClient\(' ; then
  if [[ "$FILE_PATH" != *"lib/prisma.ts"* ]]; then
    echo "BLOCKED: Do not create new PrismaClient instances. Import from lib/prisma.ts instead." >&2
    exit 2
  fi
fi

# ─── Policy 6: Deploy from worktree protection ───
# This catches if someone tries to run deploy commands from worktree
# (handled in bash hook, not here — this is for file edits)

# ─── Policy 7: Auth file protection ───
if [[ "$FILE_PATH" == *"lib/auth.ts"* ]]; then
  echo "WARNING: Editing lib/auth.ts (authentication). This gates ALL routes. Proceed only with explicit user instruction." >&2
fi

exit 0
