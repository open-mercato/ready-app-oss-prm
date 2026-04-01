# B2B Partner Relationship Management (PRM)

A reference [Open Mercato](https://github.com/open-mercato/open-mercato) application for managing a B2B partner agency program — onboarding agencies, tracking KPIs, governing tiers, and distributing leads via RFPs.

## What it does

Open Mercato sells enterprise licenses through partner agencies. PRM gives the Partnership Manager (PM) a single tool to run the entire program:

```
Agency joins program
  → contributes code (WIC) → OM product improves
  → prospects clients (WIP) → OM pipeline grows
  → closes deals (MIN) → OM revenue grows
  → higher tier → more visibility → more leads → flywheel accelerates
```

### Core Workflows

| # | Workflow | What it does |
|---|---------|--------------|
| WF1 | **Agency Onboarding** | PM creates an agency org, invites admin + BD + contributors, seeds CRM pipeline |
| WF2 | **WIP Tracking** | Auto-stamps deals at SQL qualification; PM sees pipeline activity across all agencies |
| WF3 | **WIC Scoring** | Import/score code contributions (L1–L4) with bounty multipliers per contributor per month |
| WF4 | **RFP Distribution** | PM publishes lead campaigns to tier-qualified agencies, agencies respond, PM awards |
| WF5 | **Tier Governance** | Monthly evaluation against KPI thresholds, grace periods, PM-approved upgrades/downgrades |

### Key Concepts

- **WIC** — Wildly Important Contribution. Code contributions scored by level (L1–L4)
- **WIP** — Work In Progress. Deals that reached Sales Qualified Lead stage in a given month
- **MIN** — Minimum Implementations Needed. Enterprise license deals attributed to an agency
- **Tier** — Partnership level (4 tiers) based on WIC + WIP + MIN thresholds

## Getting Started

### Prerequisites

- Node.js >= 24
- Yarn (via corepack)
- Docker & Docker Compose

### Setup

```bash
# Clone the repo
git clone <repo-url> && cd <repo-dir>

# Start infrastructure (PostgreSQL, Redis, Meilisearch)
docker compose up -d

# Install dependencies
yarn install

# Generate framework files
yarn generate

# Create .env from template
cp .env.example .env

# Initialize database (migrations + seed data)
yarn reinstall
```

### Run

```bash
yarn dev
# Open http://localhost:3000
```

### Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Partnership Manager | `partnership-manager@demo.local` | `Demo123!` |
| Agency Admin (Acme) | `acme-admin@demo.local` | `Demo123!` |
| Agency BD (Acme) | `acme-bd@demo.local` | `Demo123!` |
| Agency Contributor (Acme) | `acme-contributor@demo.local` | `Demo123!` |
| Agency Admin (Nordic) | `nordic-admin@demo.local` | `Demo123!` |
| Agency BD (Nordic) | `nordic-bd@demo.local` | `Demo123!` |

### Development Commands

```bash
yarn dev               # Start dev server
yarn build             # Production build
yarn typecheck         # Type check
yarn test              # Unit tests
yarn generate          # Regenerate framework files
yarn db:generate       # Create migration after entity changes
yarn db:migrate        # Apply pending migrations
yarn reinstall         # Reset DB + fresh seed
```

## Project Structure

```
app-spec/              # Business specification (domain model, workflows, phasing)
src/modules/
  partnerships/        # PRM module — all custom business logic
    api/               # REST endpoints
    backend/           # Admin UI pages
    data/              # Entities, validators, custom fields
    subscribers/       # Domain event handlers
    widgets/           # Dashboard widgets (WIC, WIP, tier status)
    workers/           # Background jobs (tier evaluation)
    setup.ts           # Roles, permissions, seed data
docs/specs/            # Implementation specifications
.ai/                   # OM platform skills & guides
```

## Built With

[Open Mercato](https://github.com/open-mercato/open-mercato) — Next.js, TypeScript, MikroORM, Awilix DI, Zod
