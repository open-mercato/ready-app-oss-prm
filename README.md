# B2B PRM Example — Open Mercato

A complete, runnable B2B Partner Relationship Management application built on the Open Mercato platform. This example demonstrates how to build a vertical PRM solution using UMES (Universal Mercato Extension System).

Aligned with [SPEC-053](https://github.com/open-mercato/open-mercato/blob/main/.ai/specs/SPEC-053-2026-03-02-b2b-prm-starter.md) and the [Use-Case Examples Framework (SPEC-068)](https://github.com/open-mercato/open-mercato/blob/main/.ai/specs/SPEC-068-2026-03-02-use-case-examples-framework.md).

## What's Included

- **Partnerships module** (`src/modules/partnerships/`) — agencies, tier governance, KPIs (WIC/WIP/MIN), RFP campaigns, partner portal
- **18 core modules** from `@open-mercato/core` and ecosystem packages
- **Docker Compose** setup for PostgreSQL, Redis, and Meilisearch
- **Seed data** for demo agencies, tier definitions, and partner roles

## Prerequisites

- Node.js >= 24 (via [corepack](https://nodejs.org/api/corepack.html))
- Docker & Docker Compose

## Quick Start

```bash
# Start infrastructure services
docker compose up -d

# Install dependencies
yarn install

# Initialize database (migrations + seed data)
yarn initialize

# Start development server
yarn dev
```

Open http://localhost:3000

## Seed Configuration

| Env Var | Purpose | Default |
|---------|---------|---------|
| `OM_PRM_SEED_PROFILE` | Which demo fixtures to seed (`demo_agency`) | `demo_agency` |
| `OM_SEED_EXAMPLES` | Seed demo data during `yarn initialize` | `true` |

Set `OM_SEED_EXAMPLES=false` in `.env` to skip demo data and seed only structural defaults (tier definitions, partner roles).

## Development

```bash
yarn dev          # Start dev server
yarn generate     # Regenerate .mercato/generated/ files
yarn db:generate  # Generate new migration
yarn db:migrate   # Run pending migrations
yarn typecheck    # Type check
yarn lint         # Lint
yarn test         # Run tests
yarn test:e2e     # Run Playwright e2e tests
```

## Docker (Full App)

Run the entire stack (app + services) in Docker:

```bash
docker compose -f docker-compose.fullapp.yml up
```

## License

See the Open Mercato license terms.
