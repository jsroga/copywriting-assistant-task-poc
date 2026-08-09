#!/usr/bin/env bash
# afterFileEdit — record frontend TS/TSX edits for the stop lint gate.
set -euo pipefail

input=$(cat)
file_path=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("file_path") or "")' 2>/dev/null || true)

[ -n "$file_path" ] || exit 0

if [[ "$file_path" != *"/frontend/"* && "$file_path" != frontend/* ]]; then
  exit 0
fi
if [[ "$file_path" != *.ts && "$file_path" != *.tsx ]]; then
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
hash=$(printf '%s' "$root" | shasum | cut -c1-12)
marker="${TMPDIR:-/tmp}/cursor-edited-frontend.${hash}"

mkdir -p "$(dirname "$marker")"
rel="$file_path"
case "$file_path" in
  "$root"/*) rel="${file_path#"$root"/}" ;;
esac
echo "$rel" >> "$marker"
exit 0
