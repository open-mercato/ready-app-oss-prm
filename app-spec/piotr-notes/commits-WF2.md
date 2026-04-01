# Commit Plan: WF2 — Pipeline Building (WIP)

Verified against upstream/main (543 commits ahead of local main, 2026-03-20).

## Platform findings before estimation

- `customers` module: pipeline + stages fully implemented. `seedDefaultPipeline` in `cli.ts` seeds an 8-stage default pipeline (Opportunity → MQL → SQL → Offering → Negotiations → Win/Loose/Stalled). The stage names do not match PRM spec (New → Contacted → Qualified → SQL → Proposal → Won/Lost). The app must seed its own pipeline and suppress or replace the default.
- `customers/acl.ts`: features `customers.deals.view`, `customers.deals.manage`, `customers.pipelines.view`, `customers.pipelines.manage` exist. Role assignment happens in app `setup.ts`.
- API interceptors: `ApiInterceptor` type has `before` and `after` hooks with `(request, context) => Promise<result>`. `context` carries `em`, `organizationId`, `tenantId`. No `customers/api/interceptors.ts` exists in core — the app adds its own file at the app module level. Pattern reference: `payment_gateways/api/interceptors.ts`.
- Custom field on deals: `wip_registered_at` is a custom field seeded via entities module (`cf.*` DSL). The interceptor reads the existing deal record from `em`, checks `wip_registered_at`, and writes it if null. This is entirely `after`-hook work — the deal PATCH has already succeeded by that point.
- Dashboard widgets: `lazyDashboardWidget` + `DashboardWidgetModule` pattern from `@open-mercato/shared/modules/dashboard/widgets`. Widget declared in `widget.ts`, client component in `widget.client.tsx`, registered via `injection-table.ts`. No new core code needed.
- RBAC: `partner_member` (BD) and `partner_admin` need `customers.*` features. `partnership_manager` needs read-only view features. All declared in app `setup.ts` `defaultRoleFeatures`.

## Commit 1: Seed PRM roles and customers module features in app setup.ts

- Scope: app
- Pattern: setup.ts seed — defaultRoleFeatures
- Files:
  - `src/modules/prm/setup.ts` (create or extend app module setup)
- Delivers: `partner_member`, `partner_admin`, `partnership_manager` roles receive correct `customers.*` feature grants. BD can open CRM. PM gets read-only deals/companies/people view features. No interceptor, no custom fields yet — just access.
- Depends on: none

## Commit 2: Seed PRM pipeline stages in app setup.ts

- Scope: app
- Pattern: setup.ts seed — seedDefaults calling `POST /api/customers/pipelines` + `POST /api/customers/pipeline-stages` via em directly (mirror `seedDefaultPipeline` pattern from `customers/cli.ts`)
- Files:
  - `src/modules/prm/setup.ts` (extend seedDefaults)
  - `src/modules/prm/cli.ts` (seedPrmPipeline helper, imported by setup)
- Delivers: On tenant init, a "PRM Pipeline" is seeded with 7 stages in order: New (0), Contacted (1), Qualified (2), SQL (3), Proposal (4), Won (5), Lost (6). SQL stage `value` key is `sql` — interceptor in Commit 3 matches on this key. Guard: skip if pipeline with name "PRM Pipeline" already exists (idempotent).
- Depends on: Commit 1

## Commit 3: Seed `wip_registered_at` custom field on deals

- Scope: app
- Pattern: setup.ts seed — entities module custom field definition via `cf.dateTime` DSL on `customers.deal` entity
- Files:
  - `src/modules/prm/setup.ts` (extend seedDefaults — call entities batch API or direct em insert of custom field definition)
  - `src/modules/prm/data/custom-fields.ts` (field definitions constant, imported by setup)
- Delivers: `wip_registered_at` custom field (type: datetime, nullable, hidden from default CRM form) exists on the `customers.deal` entity for all new tenants. Field is read/write via entities module API. Not yet stamped by anything — that's Commit 4.
- Depends on: Commit 1

## Commit 4: API interceptor — stamp `wip_registered_at` on first SQL stage transition

- Scope: app
- Pattern: API interceptor — `after` hook on `customers/deals` PATCH
- Files:
  - `src/modules/prm/api/interceptors.ts` (new file, auto-discovered by platform)
- Delivers: When a deal PATCH sets `pipelineStageId` to the SQL stage (or any stage with order >= SQL), the `after` hook fires. It loads the deal from `em` using the record id from the response body, checks if `wip_registered_at` custom field value is already set — if null, writes current UTC timestamp. If already set, no-op. Immutability enforced here: moving deal backward and re-qualifying does not re-stamp. Org-scoped: interceptor reads `context.organizationId` to confirm the deal belongs to the org before writing.
- Depends on: Commits 2, 3

## Commit 5: KPI dashboard widget — WIP count for current month

- Scope: app
- Pattern: widget injection — `widget.ts` + `widget.client.tsx` + injection-table entry
- Files:
  - `src/modules/prm/widgets/dashboard/wip-count/widget.ts`
  - `src/modules/prm/widgets/dashboard/wip-count/widget.client.tsx`
  - `src/modules/prm/widgets/injection-table.ts` (add `dashboard:widgets` entry for `prm.dashboard.wip-count`)
- Delivers: Dashboard shows a "WIP This Month" tile. Client component calls an API route (added in Commit 6) that returns `{ count: number, month: string }`. Visible to `partner_member`, `partner_admin`, `partnership_manager`. Features gate: `prm.widgets.wip-count`. Widget respects org scope — BD sees their org's count, PM sees the currently selected org's count via org switcher.
- Depends on: Commits 3, 4

## Commit 6: API route — WIP count query endpoint

- Scope: app
- Pattern: entity+CRUD — custom GET route with live query (no worker)
- Files:
  - `src/modules/prm/api/get/wip-count.ts` (exports handler + `openApi`)
- Delivers: `GET /api/prm/wip-count?month=YYYY-MM` returns `{ count: number, month: string }`. Query: `COUNT(DISTINCT deal.id) WHERE organizationId = ctx.organizationId AND wip_registered_at IS NOT NULL AND wip_registered_at >= month_start AND wip_registered_at < month_end`. Auth-guarded: requires `prm.widgets.wip-count` feature. PM with Program Scope (`organizationId` from org switcher header) hits same route — no special case needed, org switcher already scopes the context.
- Depends on: Commit 3

## Summary

| Commit | Scope | Score |
|--------|-------|-------|
| 1: Role features in setup.ts | app | 1 |
| 2: PRM pipeline stages seed | app | 1 |
| 3: `wip_registered_at` custom field seed | app | 1 |
| 4: API interceptor — WIP stamp | app | 2 |
| 5: Dashboard widget — WIP count tile | app | 2 |
| 6: API route — WIP count query | app | 1 |

**Total: 6 atomic commits. Score: 3 (medium gap — all app scope, no upstream dependencies).**

No `core-module` or `official-module` commits. No flags. WF2 is entirely buildable within the app layer using existing OM extensibility mechanisms.

## Open question for implementation

The `after` interceptor in Commit 4 needs to identify which stage is "SQL or above" by order, not by hardcoded label string. Implementation must load the pipeline stage record from `em` using the `pipelineStageId` from the response body, read its `order`, and compare to the SQL stage's order (3 in PRM seed). Alternatively, mark the SQL stage with a metadata flag during seeding. Recommend: store the SQL threshold order (3) as a module constant tied to the seed definition in `cli.ts`, so the interceptor and seed stay in sync.
