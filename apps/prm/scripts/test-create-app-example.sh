#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# US-7.1 End-to-End Test: create-mercato-app --app prm
#
# Tests the full flow:
#   create-mercato-app prm --app <url>
#   cd prm && docker compose -f docker-compose.fullapp.dev.yml up --build
#   → app starts with all services, seeds data, responds on HTTP
#
# Prerequisites:
#   - npm registry reachable (official releases by default)
#   - If testing unpublished OM packages: set NPM_REGISTRY=http://localhost:4873 and ensure Verdaccio is running
#   - Docker running
#   - Current branch pushed to GitHub (--app fetches from GH)
#
# Usage:
#   ./scripts/test-create-app-example.sh [--keep]
#     --keep    Don't clean up the test directory on success
#   NPM_REGISTRY=http://localhost:4873 ./scripts/test-create-app-example.sh
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEST_PARENT="/tmp/prm-app-test-$$"
TEST_DIR="$TEST_PARENT/prm"
KEEP_ON_SUCCESS=false
COMPOSE_PROJECT="prm-test-$$"
PASSED=0
FAILED=0
TOTAL=0
APP_PORT=3333  # Avoid conflicts with local dev on 3000
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmjs.org}"

# Resolve GitHub owner/repo and branch from git remote
GITHUB_REPO_URL="$(cd "$REPO_ROOT" && git remote get-url origin 2>/dev/null || echo "")"
GITHUB_OWNER_REPO="$(echo "$GITHUB_REPO_URL" | sed -E 's|https://github.com/||;s|\.git$||')"
APP_BRANCH="$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"

if [[ "$NPM_REGISTRY" == "http://localhost:4873" || "$NPM_REGISTRY" == "http://127.0.0.1:4873" ]]; then
  REGISTRY_LABEL="Verdaccio"
else
  REGISTRY_LABEL="$NPM_REGISTRY"
fi

# Parse args
for arg in "$@"; do
  case "$arg" in
    --keep) KEEP_ON_SUCCESS=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

checkpoint() {
  TOTAL=$((TOTAL + 1))
  local name="$1"
  shift
  echo -n "  [$TOTAL] $name ... "
  if "$@" >/dev/null 2>&1; then
    echo -e "${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

checkpoint_output() {
  TOTAL=$((TOTAL + 1))
  local name="$1"
  shift
  echo -n "  [$TOTAL] $name ... "
  local output
  if output=$("$@" 2>&1); then
    echo -e "${GREEN}PASS${NC}"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}FAIL${NC}"
    echo "      Output: $(echo "$output" | tail -5)"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"

  # Stop Docker Compose stack
  if [ -d "$TEST_DIR" ]; then
    echo "  Stopping Docker Compose stack..."
    (cd "$TEST_DIR" && COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" APP_PORT="$APP_PORT" \
      docker compose -f docker-compose.fullapp.dev.yml down -v 2>/dev/null || true)
  fi

  # Remove test directory
  if [ "$KEEP_ON_SUCCESS" = false ] || [ "$FAILED" -gt 0 ]; then
    if [ -d "$TEST_PARENT" ]; then
      echo "  Removing $TEST_PARENT ..."
      rm -rf "$TEST_PARENT"
    fi
  else
    echo "  Keeping $TEST_DIR (--keep flag)"
  fi

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo -e "  Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}, $TOTAL total"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if [ "$FAILED" -gt 0 ]; then
    exit 1
  fi
}

trap cleanup EXIT

# ---------------------------------------------------------------------------
# Phase 0: Pre-flight
# ---------------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  US-7.1: create-mercato-app --app prm"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phase 0: Pre-flight"

echo "  Registry: $REGISTRY_LABEL"

if [ "$REGISTRY_LABEL" = "Verdaccio" ]; then
  checkpoint "Verdaccio is running" \
    curl -sf http://localhost:4873/-/ping
fi

checkpoint "Docker is running" \
  docker info

checkpoint "@open-mercato/core available in $REGISTRY_LABEL" \
  npm view @open-mercato/core --registry "$NPM_REGISTRY" version

checkpoint "create-mercato-app available in $REGISTRY_LABEL" \
  npm view create-mercato-app --registry "$NPM_REGISTRY" version

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo -e "${RED}Pre-flight failed. Ensure the selected registry is reachable and contains published packages.${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Phase 1: Scaffold
# ---------------------------------------------------------------------------

echo ""
echo "Phase 1: Scaffold app"

mkdir -p "$TEST_PARENT"

APP_URL="https://github.com/${GITHUB_OWNER_REPO}/tree/${APP_BRANCH}/apps/prm"
echo "  Using: $APP_URL (branch: $APP_BRANCH)"

# Install create-mercato-app locally to avoid npx arg-parsing issues
CLI_DIR="$TEST_PARENT/.cli"
npm install --prefix "$CLI_DIR" create-mercato-app@latest --registry "$NPM_REGISTRY" --silent 2>/dev/null
CLI_BIN="$CLI_DIR/node_modules/.bin/create-mercato-app"

checkpoint_output "create-mercato-app --app (from GitHub)" \
  bash -c "cd '$TEST_PARENT' && echo 5 | '$CLI_BIN' prm --app '$APP_URL' --app-branch '$APP_BRANCH' --registry '$NPM_REGISTRY'"

checkpoint "Test directory exists" \
  test -d "$TEST_DIR"

checkpoint "package.json exists" \
  test -f "$TEST_DIR/package.json"

checkpoint "src/modules/partnerships/ exists" \
  test -d "$TEST_DIR/src/modules/partnerships"

checkpoint "modules.ts includes partnerships" \
  grep -q "partnerships" "$TEST_DIR/src/modules.ts"

checkpoint "docker-compose.fullapp.dev.yml exists" \
  test -f "$TEST_DIR/docker-compose.fullapp.dev.yml"

# ---------------------------------------------------------------------------
# Phase 2: Docker Compose — one command does everything
# ---------------------------------------------------------------------------

echo ""
echo "Phase 2: docker compose up (install + migrate + initialize + start)"

cd "$TEST_DIR"

# Set up .env from example
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
fi

# Override port to avoid conflicts. Package registry is chosen during scaffold via --registry.
echo "APP_PORT=$APP_PORT" >> .env

# Start full stack
COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" APP_PORT="$APP_PORT" \
  docker compose -f docker-compose.fullapp.dev.yml up --build -d 2>&1 | tail -5

# Wait for app to be ready (max 180s — first build takes time)
echo "  Waiting for app on port $APP_PORT (max 180s)..."
READY=false
for i in $(seq 1 180); do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 "http://localhost:$APP_PORT/" 2>/dev/null || true)
  if [ "$HTTP_CODE" != "" ] && [ "$HTTP_CODE" != "000" ]; then
    echo "  App ready (HTTP $HTTP_CODE after ${i}s)"
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  echo -e "  ${RED}App failed to start within 180s${NC}"
  echo "  Docker logs (last 30 lines):"
  COMPOSE_PROJECT_NAME="$COMPOSE_PROJECT" docker compose -f docker-compose.fullapp.dev.yml logs --tail 30 app 2>&1 | head -30
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  exit 1
fi

checkpoint "App responds on port $APP_PORT" \
  curl -sf --max-time 5 "http://localhost:$APP_PORT/"

# ---------------------------------------------------------------------------
# Phase 3: Verify seed data and logins
# ---------------------------------------------------------------------------

echo ""
echo "Phase 3: Verify seed data"

BASE="http://localhost:$APP_PORT"

# Login helper
login() {
  curl -s "$BASE/api/auth/login" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "email=$1&password=Demo123!" \
    | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4
}

PM_TOKEN=$(login "partnership-manager@demo.local")
BD_TOKEN=$(login "acme-bd@demo.local")
ADMIN_TOKEN=$(login "acme-admin@demo.local")
CONTRIB_TOKEN=$(login "acme-contributor@demo.local")
NORDIC_ADMIN_TOKEN=$(login "nordic-admin@demo.local")

checkpoint "PM can login" \
  test -n "$PM_TOKEN"

checkpoint "BD can login" \
  test -n "$BD_TOKEN"

checkpoint "Admin can login" \
  test -n "$ADMIN_TOKEN"

checkpoint "Contributor can login" \
  test -n "$CONTRIB_TOKEN"

checkpoint "Nordic Admin can login" \
  test -n "$NORDIC_ADMIN_TOKEN"

# Phase 1 seed
checkpoint "PRM Pipeline exists" \
  bash -c "curl -sf '$BASE/api/customers/pipelines' -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'PRM Pipeline'"

checkpoint "BD sees deals" \
  bash -c "curl -sf '$BASE/api/customers/deals' -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'items'"

checkpoint "WIP count API responds" \
  bash -c "curl -sf '$BASE/api/partnerships/wip-count' -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'count'"

checkpoint "Contributor onboarding shows set_gh_username" \
  bash -c "curl -sf '$BASE/api/partnerships/onboarding-status' -H 'Authorization: Bearer $CONTRIB_TOKEN' | grep -q 'set_gh_username'"

# Phase 2 seed
checkpoint "PM sees agencies with tiers" \
  bash -c "curl -sf '$BASE/api/partnerships/agencies' -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'currentTier'"

checkpoint "PM sees license deals" \
  bash -c "curl -sf '$BASE/api/partnerships/partner-license-deals' -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'items'"

# Phase 3 seed
checkpoint "PM sees RFP campaigns" \
  bash -c "curl -sf '$BASE/api/partnerships/rfp-campaigns' -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'FinTech Migration'"

checkpoint "Awarded campaign has responses" \
  bash -c "CAMPAIGN_ID=\$(curl -sf '$BASE/api/partnerships/rfp-campaigns' -H 'Authorization: Bearer $PM_TOKEN' | python3 -c \"import sys,json; campaigns=json.load(sys.stdin).get('results',json.load(sys.stdin).get('items',[])); print([c['id'] for c in campaigns if c.get('status')=='awarded'][0])\" 2>/dev/null) && curl -sf '$BASE/api/partnerships/rfp-responses?campaignId=\$CAMPAIGN_ID' -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'responseText'"

# Org isolation
checkpoint "Nordic Admin does NOT see Acme deals" \
  bash -c "! curl -sf '$BASE/api/customers/deals' -H 'Authorization: Bearer $NORDIC_ADMIN_TOKEN' | grep -q 'Acme'"

echo ""
echo -e "${GREEN}All checkpoints passed!${NC}"
