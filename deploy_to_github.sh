#!/usr/bin/env bash
set -Eeuo pipefail

SOURCE_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_NAME="${REPO_NAME:-$(basename "$SOURCE_DIR")}"
OUTPUT_DIR="${OUTPUT_DIR:-$SOURCE_DIR}"

if [[ "${CONFIRM_PUBLIC_PUBLISH:-}" != "YES_I_MEAN_PUBLIC" ]]; then
  printf '%s\n' 'This script creates or pushes to a PUBLIC GitHub repository.' \
    'Review the files and set CONFIRM_PUBLIC_PUBLISH=YES_I_MEAN_PUBLIC to continue.' >&2
  exit 2
fi

if ! command -v gh >/dev/null 2>&1 || ! command -v git >/dev/null 2>&1 || ! command -v rsync >/dev/null 2>&1; then
  printf '%s\n' 'Git, the GitHub CLI (gh), and rsync must be installed.' >&2
  exit 1
fi
gh auth status >/dev/null
if [[ -z "$REPO_NAME" || -n "${REPO_NAME//[A-Za-z0-9._-]/}" ]]; then
  printf 'Invalid GitHub repository name: %s\n' "$REPO_NAME" >&2
  exit 1
fi

for source_file in README.md docker-compose.yml db/migrations/001_init.sql services/inventory/cmd/api/main.go services/rentals/src/index.ts services/sales/app/main.py web/src/App.tsx; do
  if [[ ! -f "$SOURCE_DIR/$source_file" ]]; then
    printf 'Required source file is missing: %s\n' "$source_file" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_DIR"
ROOT_DIR="$(cd -- "$OUTPUT_DIR" && pwd)"
if [[ "$ROOT_DIR" != "$SOURCE_DIR" ]]; then
  if [[ "$ROOT_DIR/" == "$SOURCE_DIR/"* ]]; then
    printf '%s\n' 'OUTPUT_DIR must not be inside the source directory.' >&2
    exit 1
  fi
  if [[ -n "$(find "$ROOT_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    printf 'OUTPUT_DIR must be empty: %s\n' "$ROOT_DIR" >&2
    exit 1
  fi
  rsync -a \
    --exclude='/.git/' \
    --exclude='node_modules/' \
    --exclude='dist/' \
    --exclude='.venv/' \
    --exclude='__pycache__/' \
    --include='/.env.example' \
    --exclude='/.env' \
    --exclude='/.env.*' \
    "$SOURCE_DIR/" "$ROOT_DIR/"
fi

mkdir -p "$ROOT_DIR/.github/workflows" "$ROOT_DIR/db/tests" "$ROOT_DIR/infra/envoy" "$ROOT_DIR/infra/keycloak"
if [[ ! -d "$ROOT_DIR/.git" ]]; then
  git -C "$ROOT_DIR" init --initial-branch=main
fi

OWNER="$(gh api user --jq .login)"

if ! git -C "$ROOT_DIR" config user.name >/dev/null; then
  git -C "$ROOT_DIR" config user.name "$OWNER"
fi
if ! git -C "$ROOT_DIR" config user.email >/dev/null; then
  git -C "$ROOT_DIR" config user.email "$OWNER@users.noreply.github.com"
fi

git -C "$ROOT_DIR" add -A
if ! git -C "$ROOT_DIR" diff --cached --quiet; then
  git -C "$ROOT_DIR" commit -m "feat: build Jupiter Cars sales and rental platform"
fi

REMOTE_URL="https://github.com/$OWNER/$REPO_NAME.git"
if gh repo view "$OWNER/$REPO_NAME" >/dev/null 2>&1; then
  VISIBILITY="$(gh repo view "$OWNER/$REPO_NAME" --json visibility --jq .visibility)"
  if [[ "$VISIBILITY" != "PUBLIC" ]]; then
    printf 'Refusing to change existing %s repository visibility.\n' "$VISIBILITY" >&2
    exit 1
  fi
else
  gh repo create "$REPO_NAME" --public --source "$ROOT_DIR" --remote origin
fi

if git -C "$ROOT_DIR" remote get-url origin >/dev/null 2>&1; then
  CURRENT_REMOTE="$(git -C "$ROOT_DIR" remote get-url origin)"
  case "$CURRENT_REMOTE" in
    "$REMOTE_URL"|"git@github.com:$OWNER/$REPO_NAME.git") ;;
    *) printf 'Refusing to overwrite unexpected origin: %s\n' "$CURRENT_REMOTE" >&2; exit 1 ;;
  esac
else
  git -C "$ROOT_DIR" remote add origin "$REMOTE_URL"
fi

git -C "$ROOT_DIR" push -u origin HEAD
printf 'Published: https://github.com/%s/%s\n' "$OWNER" "$REPO_NAME"