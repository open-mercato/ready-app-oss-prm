#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# US-7.1 End-to-End Test: create-mercato-app --example prm
#
# Tests the full SPEC-068 flow:
#   npx create-mercato-app <dir> --example prm → yarn install → yarn initialize → app starts
#
# Prerequisites:
#   - Verdaccio running with @open-mercato/* packages published (including PR #1047)
#   - Docker running (for ephemeral DB)
#
# Usage:
#   ./scripts/test-create-app-example.sh [--keep]
#     --keep    Don't clean up the test directory on success (useful for inspection)
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEST_DIR="/tmp/prm-example-test-$$"
KEEP_ON_SUCCESS=false
APP_PID=""
PASSED=0
FAILED=0
TOTAL=0

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
    echo "      Output: $output"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"

  # Stop app if running
  if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
    echo "  Stopping app (PID $APP_PID)..."
    kill "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi

  # Stop Docker containers started by the test app
  if [ -d "$TEST_DIR" ]; then
    (cd "$TEST_DIR" && docker compose down 2>/dev/null || true)
  fi

  # Remove test directory
  if [ "$KEEP_ON_SUCCESS" = false ] || [ "$FAILED" -gt 0 ]; then
    if [ -d "$TEST_DIR" ]; then
      echo "  Removing $TEST_DIR ..."
      rm -rf "$TEST_DIR"
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
# Pre-flight checks
# ---------------------------------------------------------------------------

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  US-7.1: create-mercato-app --example prm"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Phase 0: Pre-flight"

checkpoint "Verdaccio is running" \
  curl -sf http://localhost:4873/-/ping

checkpoint "Docker is running" \
  docker info

checkpoint "@open-mercato/core available in Verdaccio" \
  npm view @open-mercato/core --registry http://localhost:4873 version

checkpoint "create-mercato-app available in Verdaccio" \
  npm view create-mercato-app --registry http://localhost:4873 version

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo -e "${RED}Pre-flight failed. Ensure Verdaccio is running with published packages.${NC}"
  exit 1
fi

# ---------------------------------------------------------------------------
# Phase 1: Scaffold
# ---------------------------------------------------------------------------

echo ""
echo "Phase 1: Scaffold app"

mkdir -p "$(dirname "$TEST_DIR")"

checkpoint_output "create-mercato-app --example prm" \
  npx --registry http://localhost:4873 create-mercato-app@latest "$TEST_DIR" \
    --example prm --registry http://localhost:4873

checkpoint "Test directory exists" \
  test -d "$TEST_DIR"

checkpoint "package.json exists" \
  test -f "$TEST_DIR/package.json"

checkpoint "src/modules/partnerships/ exists" \
  test -d "$TEST_DIR/src/modules/partnerships"

checkpoint "modules.ts includes partnerships" \
  grep -q "partnerships" "$TEST_DIR/src/modules.ts"

# ---------------------------------------------------------------------------
# Phase 2: Install + Initialize
# ---------------------------------------------------------------------------

echo ""
echo "Phase 2: Install and initialize"

cd "$TEST_DIR"

# Start DB via docker compose (if compose file exists)
if [ -f "docker-compose.yml" ] || [ -f "docker-compose.yaml" ] || [ -f "compose.yaml" ]; then
  checkpoint_output "docker compose up -d" \
    docker compose up -d
  sleep 3
fi

checkpoint_output "yarn install" \
  yarn install --registry http://localhost:4873

checkpoint_output "yarn generate" \
  yarn generate

checkpoint_output "yarn db:migrate" \
  yarn db:migrate

checkpoint_output "yarn initialize" \
  yarn initialize

# ---------------------------------------------------------------------------
# Phase 3: Verify seed data
# ---------------------------------------------------------------------------

echo ""
echo "Phase 3: Verify app starts and seed data works"

# Start app in background
yarn dev --port 5099 &
APP_PID=$!
echo "  App starting (PID $APP_PID, port 5099)..."

# Wait for app to be ready (max 30s)
READY=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:5099/api/docs/openapi >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done

if [ "$READY" = false ]; then
  echo -e "  ${RED}App failed to start within 30s${NC}"
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  exit 1
fi

checkpoint "App responds on /api/docs/openapi" \
  curl -sf http://localhost:5099/api/docs/openapi

# Login as PM
PM_TOKEN=$(curl -sf http://localhost:5099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"partnership-manager@demo.local","password":"Demo123!"}' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "PM can login (partnership-manager@demo.local)" \
  test -n "$PM_TOKEN"

# Login as BD
BD_TOKEN=$(curl -sf http://localhost:5099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"acme-bd@demo.local","password":"Demo123!"}' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "BD can login (acme-bd@demo.local)" \
  test -n "$BD_TOKEN"

# Login as Contributor
CONTRIB_TOKEN=$(curl -sf http://localhost:5099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"acme-contributor@demo.local","password":"Demo123!"}' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "Contributor can login (acme-contributor@demo.local)" \
  test -n "$CONTRIB_TOKEN"

# Check pipelines
checkpoint "PRM Pipeline exists" \
  bash -c "curl -sf http://localhost:5099/api/customers/pipelines -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'PRM Pipeline'"

# Check deals exist for BD
checkpoint "BD sees deals" \
  bash -c "curl -sf http://localhost:5099/api/customers/deals -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'items'"

# Check WIP count API works
checkpoint "WIP count API responds" \
  bash -c "curl -sf http://localhost:5099/api/partnerships/wip-count -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'count'"

# Check onboarding status for Contributor
checkpoint "Contributor onboarding shows set_gh_username" \
  bash -c "curl -sf http://localhost:5099/api/partnerships/onboarding-status -H 'Authorization: Bearer $CONTRIB_TOKEN' | grep -q 'set_gh_username'"

# ---------------------------------------------------------------------------
# Phase 4: Unit tests pass
# ---------------------------------------------------------------------------

echo ""
echo "Phase 4: Tests pass in scaffolded app"

checkpoint_output "yarn test (unit tests)" \
  yarn test

echo ""
echo -e "${GREEN}All checkpoints passed!${NC}"
