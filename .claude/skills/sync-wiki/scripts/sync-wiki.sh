#!/usr/bin/env bash
# Publishes all wiki drafts (*.md) to the GitHub Wiki, pushing to the wiki
# branch named after the current branch of this repo (e.g. `dev` -> `dev`).
#
# Usage:
#   .claude/skills/sync-wiki/scripts/sync-wiki.sh "<commit message>"
#
# Env:
#   WIKI_DRAFTS_DIR  Draft pages directory (default: <main-checkout>/.wiki)
#   WIKI_DIR         Local wiki clone (default: sibling "<main-checkout>.wiki")

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"<commit message>\"" >&2
  exit 1
fi

commit_message=$1

# Resolve the main checkout even when run from a linked worktree.
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
main_root=$(dirname "$common_dir")
repo_slug=$(gh repo view --json nameWithOwner -q .nameWithOwner)
drafts_dir=${WIKI_DRAFTS_DIR:-"${main_root}/.wiki"}
wiki_dir=${WIKI_DIR:-"${main_root}.wiki"}
branch=$(git rev-parse --abbrev-ref HEAD)

if [ "$branch" = "HEAD" ]; then
  echo "error: detached HEAD - check out a branch first" >&2
  exit 1
fi

if [ ! -d "$wiki_dir/.git" ]; then
  echo "No local wiki clone at $wiki_dir - cloning ${repo_slug}.wiki"
  gh repo clone "${repo_slug}.wiki" -- "$wiki_dir"
fi

shopt -s nullglob
drafts=("$drafts_dir"/*.md)
shopt -u nullglob

if [ ${#drafts[@]} -eq 0 ]; then
  echo "No draft pages found under $drafts_dir" >&2
  exit 1
fi

(
  cd "$wiki_dir"
  git fetch origin --prune

  default_branch=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || echo master)

  if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    git checkout -B "$branch" "origin/$branch"
  elif git show-ref --verify --quiet "refs/heads/$branch"; then
    git checkout "$branch"
  else
    echo "Wiki branch '$branch' doesn't exist yet - branching it off '$default_branch'."
    git checkout -B "$branch" "origin/$default_branch"
  fi
)

cp "${drafts[@]}" "$wiki_dir/"
basenames=("${drafts[@]##*/}")

(
  cd "$wiki_dir"
  git add -- "${basenames[@]}"

  if git diff --cached --quiet; then
    echo "No changes to publish (wiki branch '$branch' already matches the drafts)."
    exit 0
  fi

  git commit -m "$commit_message"
  git push -u origin "$branch"
)

echo "Published to wiki branch '$branch': ${basenames[*]}"
