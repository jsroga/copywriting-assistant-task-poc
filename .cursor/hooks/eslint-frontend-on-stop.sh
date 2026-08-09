#!/usr/bin/env bash
# stop hook — frontend must pass root ESLint (tilemap local rules).
# On failure, emit followup_message so the agent fixes before handover.
set -euo pipefail

input=$(cat)

file_path=$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("file_path") or "")' 2>/dev/null || true)
[ -z "$file_path" ] || exit 0

status=$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("status") or "completed")' 2>/dev/null || echo completed)
loop_count=$(printf '%s' "$input" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("loop_count") or 0)' 2>/dev/null || echo 0)

if [ "$status" != "completed" ]; then
  echo '{}'
  exit 0
fi
if [ "${loop_count:-0}" -ge 2 ]; then
  echo '{}'
  exit 0
fi

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
cd "$root"

# Nothing to lint yet
if [ ! -d frontend ]; then
  echo '{}'
  exit 0
fi

shopt -s nullglob
ts_files=(frontend/**/*.{ts,tsx})
shopt -u nullglob
# Also find via find for nested depth
mapfile_count=$(find frontend -type f \( -name '*.ts' -o -name '*.tsx' \) ! -path '*/node_modules/*' ! -path '*/.next/*' 2>/dev/null | wc -l | tr -d ' ')
if [ "${mapfile_count:-0}" -eq 0 ]; then
  echo '{}'
  exit 0
fi

hash=$(printf '%s' "$root" | shasum | cut -c1-12)
marker="${TMPDIR:-/tmp}/cursor-edited-frontend.${hash}"

# Prefer files edited this turn; else lint all frontend TS/TSX
targets=()
if [ -f "$marker" ] && [ "$(wc -l < "$marker" | tr -d ' ')" -gt 0 ]; then
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    [ -f "$line" ] || continue
    targets+=("$line")
  done < "$marker"
fi
rm -f "$marker"

if [ "${#targets[@]}" -eq 0 ]; then
  # Full frontend lint when no marker (still enforce gate if frontend exists)
  targets=(frontend)
fi

if [ ! -d node_modules/eslint ]; then
  python3 - <<'PY'
import json
print(json.dumps({
  "followup_message": (
    "Frontend ESLint gate is not installed. From repo root run `npm install`, "
    "then fix any lint errors with `npm run lint`. Local rules from "
    "eslint-rules/ (no-magic-string, max-lines-strict, complexity-strict, "
    "no-repeated-array-filter) must pass — do not disable them."
  )
}))
PY
  exit 0
fi

set +e
out=$(npx eslint --max-warnings 0 "${targets[@]}" 2>&1)
eslint_status=$?
set -e

if [ "$eslint_status" -ne 0 ]; then
  summary=$(printf '%s\n' "$out" | head -c 5500)
  python3 - "$summary" <<'PY'
import json, sys
summary = sys.argv[1]
msg = (
    "Frontend ESLint gate failed (tilemap local rules). Fix all errors "
    "without disabling local/* rules, then stop again.\n\n"
    "Rules: local/no-magic-string, local/max-lines-strict, "
    "local/complexity-strict, local/no-repeated-array-filter "
    "(plus no-explicit-any / no type assertions).\n\n"
    f"{summary}"
)
print(json.dumps({"followup_message": msg}))
PY
  exit 0
fi

set +e
tsc_out=$(npm --prefix frontend run typecheck 2>&1)
tsc_status=$?
set -e

if [ "$tsc_status" -eq 0 ]; then
  echo '{}'
  exit 0
fi

summary=$(printf '%s\n' "$tsc_out" | head -c 5500)
python3 - "$summary" <<'PY'
import json, sys
summary = sys.argv[1]
msg = (
    "Frontend TypeScript gate failed (`npm run typecheck` / tsc --noEmit). "
    "Fix all type errors before handover.\n\n"
    f"{summary}"
)
print(json.dumps({"followup_message": msg}))
PY
exit 0
