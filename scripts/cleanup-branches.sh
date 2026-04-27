#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"
DELETE=false
REMOTE=false

usage() {
  cat <<USAGE
Usage: $(basename "$0") [--delete] [--remote] [--default-branch <name>]

Lists local branches that are fully merged into the default branch and can be removed.
By default this is a dry run and only prints candidate branches.

Options:
  --delete                  Delete merged local branches (safe delete: git branch -d)
  --remote                  Also prune remote-tracking references (git fetch --all --prune)
  --default-branch <name>   Default branch to compare against (default: main or \$DEFAULT_BRANCH)
  -h, --help                Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --delete)
      DELETE=true
      shift
      ;;
    --remote)
      REMOTE=true
      shift
      ;;
    --default-branch)
      DEFAULT_BRANCH="${2:-}"
      if [[ -z "$DEFAULT_BRANCH" ]]; then
        echo "Error: --default-branch requires a value." >&2
        exit 1
      fi
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if $REMOTE; then
  git fetch --all --prune
fi

if ! git show-ref --verify --quiet "refs/heads/$DEFAULT_BRANCH"; then
  echo "Default branch '$DEFAULT_BRANCH' does not exist locally." >&2
  echo "Try: git fetch origin $DEFAULT_BRANCH:$DEFAULT_BRANCH" >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

mapfile -t CANDIDATE_BRANCHES < <(
  git for-each-ref refs/heads --merged "$DEFAULT_BRANCH" --format='%(refname:short)'
)

MERGED_BRANCHES=()
for branch in "${CANDIDATE_BRANCHES[@]}"; do
  if [[ "$branch" == "$DEFAULT_BRANCH" || "$branch" == "$CURRENT_BRANCH" ]]; then
    continue
  fi
  MERGED_BRANCHES+=("$branch")
done

if [[ ${#MERGED_BRANCHES[@]} -eq 0 ]]; then
  echo "No merged local branches to clean up."
  exit 0
fi

echo "Merged local branches (base: $DEFAULT_BRANCH):"
printf '  - %s\n' "${MERGED_BRANCHES[@]}"

if ! $DELETE; then
  echo
  echo "Dry run only. Re-run with --delete to remove these branches."
  exit 0
fi

for branch in "${MERGED_BRANCHES[@]}"; do
  git branch -d "$branch"
done
