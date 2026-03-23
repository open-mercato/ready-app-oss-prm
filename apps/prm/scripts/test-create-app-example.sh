#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# US-7.1 End-to-End Test: create-mercato-app --example prm
#
# Tests the full SPEC-068 flow:
#   npx create-mercato-app prm --example <url> → yarn install → yarn initialize → app starts
#
# Prerequisites:
#   - Verdaccio running with @open-mercato/* packages published
#   - Docker running (for ephemeral DB)
#   - Current branch pushed to GitHub (--example fetches from GH)
#
# Usage:
#   ./scripts/test-create-app-example.sh [--keep]
#     --keep    Don't clean up the test directory on success (useful for inspection)
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
TEST_PARENT="/tmp/prm-example-test-$$"
TEST_DIR="$TEST_PARENT/prm"
KEEP_ON_SUCCESS=false
APP_PID=""
PASSED=0
FAILED=0
TOTAL=0

# Resolve GitHub owner/repo and branch from git remote
GITHUB_REPO_URL="$(cd "$REPO_ROOT" && git remote get-url origin 2>/dev/null || echo "")"
GITHUB_OWNER_REPO="$(echo "$GITHUB_REPO_URL" | sed -E 's|https://github.com/||;s|\.git$||')"
EXAMPLE_BRANCH="$(cd "$REPO_ROOT" && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")"

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

mkdir -p "$TEST_PARENT"

# --example fetches from GitHub. Use repo URL + branch from current git state.
# Pipe "5" to skip the interactive AI coding tool prompt.
EXAMPLE_URL="https://github.com/${GITHUB_OWNER_REPO}/tree/${EXAMPLE_BRANCH}/apps/prm"
echo "  Using: $EXAMPLE_URL (branch: $EXAMPLE_BRANCH)"
checkpoint_output "create-mercato-app --example (from GitHub)" \
  bash -c "cd '$TEST_PARENT' && echo 5 | npx --registry http://localhost:4873 create-mercato-app@latest prm --example '$EXAMPLE_URL' --example-branch '$EXAMPLE_BRANCH' --registry http://localhost:4873"

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

# Set up .env from example (docker-compose defaults)
if [ -f ".env.example" ] && [ ! -f ".env" ]; then
  cp .env.example .env
fi

checkpoint_output "yarn install" \
  yarn install --registry http://localhost:4873

checkpoint_output "yarn generate" \
  yarn generate

checkpoint_output "yarn db:migrate" \
  yarn db:migrate

checkpoint_output "yarn initialize" \
  yarn initialize --reinstall

# ---------------------------------------------------------------------------
# Phase 3: Verify seed data
# ---------------------------------------------------------------------------

echo ""
echo "Phase 3: Verify app starts and seed data works"

# Start app in background
yarn dev --port 3000 &
APP_PID=$!
echo "  App starting (PID $APP_PID, port 3000)..."

# Wait for app to be ready (max 120s — first Turbopack compile of API routes takes ~15s).
# Trigger API compilation with a single request, then wait for it to complete.
READY=false
echo "  Waiting for app readiness (Turbopack cold-compile may take ~15s)..."
for i in $(seq 1 120); do
  # Simple TCP check first, then HTTP check once server is listening
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:3000/ 2>/dev/null || true)
  if [ "$HTTP_CODE" != "000" ] && [ "$HTTP_CODE" != "500" ]; then
    echo "  App ready (HTTP $HTTP_CODE after ${i}s)"
    READY=true
    break
  fi
  [ $((i % 10)) -eq 0 ] && echo "  Still waiting... ($i/120, last code: $HTTP_CODE)"
  sleep 2
done

if [ "$READY" = false ]; then
  echo -e "  ${RED}App failed to start within 120s${NC}"
  TOTAL=$((TOTAL + 1))
  FAILED=$((FAILED + 1))
  exit 1
fi

# Warm up API route compilation (Turbopack lazy-compiles on first request)
curl -s -o /dev/null --max-time 30 http://localhost:3000/api/auth/login 2>/dev/null || true
sleep 2

checkpoint "App responds on port 3000" \
  curl -sf --max-time 10 http://localhost:3000/

# Login as PM
PM_TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'email=partnership-manager@demo.local&password=Demo123!' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

checkpoint "PM can login (partnership-manager@demo.local)" \
  test -n "$PM_TOKEN"

# Login as BD
BD_TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'email=acme-bd@demo.local&password=Demo123!' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "BD can login (acme-bd@demo.local)" \
  test -n "$BD_TOKEN"

# Login as Admin
ADMIN_TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'email=acme-admin@demo.local&password=Demo123!' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "Admin can login (acme-admin@demo.local)" \
  test -n "$ADMIN_TOKEN"

# Login as Contributor
CONTRIB_TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'email=acme-contributor@demo.local&password=Demo123!' \
  | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)

checkpoint "Contributor can login (acme-contributor@demo.local)" \
  test -n "$CONTRIB_TOKEN"

# Check pipelines
checkpoint "PRM Pipeline exists" \
  bash -c "curl -sf http://localhost:3000/api/customers/pipelines -H 'Authorization: Bearer $PM_TOKEN' | grep -q 'PRM Pipeline'"

# Check deals exist for BD
checkpoint "BD sees deals" \
  bash -c "curl -sf http://localhost:3000/api/customers/deals -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'items'"

# Check WIP count API works
checkpoint "WIP count API responds" \
  bash -c "curl -sf http://localhost:3000/api/partnerships/wip-count -H 'Authorization: Bearer $BD_TOKEN' | grep -q 'count'"

# Check onboarding status for Contributor
checkpoint "Contributor onboarding shows set_gh_username" \
  bash -c "curl -sf http://localhost:3000/api/partnerships/onboarding-status -H 'Authorization: Bearer $CONTRIB_TOKEN' | grep -q 'set_gh_username'"

# ---------------------------------------------------------------------------
# Phase 4: Unit tests pass
# ---------------------------------------------------------------------------

echo ""
echo "Phase 4: Tests pass in scaffolded app"

checkpoint_output "yarn test (unit tests)" \
  yarn test

echo ""
echo -e "${GREEN}All checkpoints passed!${NC}"
