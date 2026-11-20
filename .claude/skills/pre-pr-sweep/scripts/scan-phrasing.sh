#!/usr/bin/env bash
# Scans a branch diff for common AI-artifact phrasing (added lines only).
# Agent configuration (AGENTS.md, .claude/, docs/agents/) is excluded.
#
# Usage:
#   .claude/skills/pre-pr-sweep/scripts/scan-phrasing.sh [<base-branch>]
#
# Defaults to comparing against "dev".

set -euo pipefail

base=${1:-dev}

if ! git rev-parse --verify "$base" >/dev/null 2>&1; then
  echo "error: base branch/ref '$base' not found" >&2
  exit 1
fi

patterns=(
  "as an AI"
  "AI-generated"
  "AI assistant"
  "curated by LLM"
  "as requested"
  "per your prompt"
  "you asked for"
  "\\bCursor\\b"
  "Copilot"
  "\\bClaude\\b"
  "AGENTS\\.md"
  "\\.cursor/"
  "\\.claude/"
)

diff_output=$(git diff "${base}...HEAD" -- . \
  ':(exclude)AGENTS.md' ':(exclude).claude/**' ':(exclude)docs/agents/**')

if [ -z "$diff_output" ]; then
  echo "No changes against $base."
  exit 0
fi

found=0
for pattern in "${patterns[@]}"; do
  matches=$(echo "$diff_output" | grep -nE "^\+[^+].*${pattern}" || true)
  if [ -n "$matches" ]; then
    echo "=== Pattern: $pattern ==="
    echo "$matches"
    echo
    found=1
  fi
done

if [ "$found" -eq 0 ]; then
  echo "No AI-artifact phrasing patterns found in the diff against $base."
fi
