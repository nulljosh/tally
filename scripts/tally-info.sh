#!/usr/bin/env bash
# tally-info.sh — Print payment summary from local Tally server
# Usage: npm run info  (or bash scripts/tally-info.sh)
# Requires: npm start running on localhost:3000 with .env credentials

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ -f "$ENV_FILE" ]]; then
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

BASE="http://localhost:3000"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

echo "Tally — local info check"
echo "------------------------"

# Login — blank body triggers server .env fallback
LOGIN=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
  -X POST "$BASE/api/login" \
  -H "Content-Type: application/json" \
  -d '{}')

if ! echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d.get('success')" 2>/dev/null; then
  echo "Login failed: $LOGIN"
  exit 1
fi

echo "Logged in."

# Fetch /api/info
INFO=$(curl -s -c "$COOKIE_JAR" -b "$COOKIE_JAR" "$BASE/api/info")

echo "$INFO" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error' in d:
    print('Error:', d['error'])
    sys.exit(1)
pay = d.get('nextPayment', {})
print(f\"Next payment:    {pay.get('amount','?')}  on  {pay.get('date','?')}\")
print(f\"Unread messages: {d.get('unreadMessages','?')}\")
b = d.get('activeBenefits', [])
print(f\"Active benefits: {', '.join(b) if b else 'none'}\")
u = d.get('lastUpdated','')
if u:
    print(f\"Last updated:    {u[:19].replace('T',' ')}\")
"
