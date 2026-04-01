# Proposal: Interceptor Coverage for Custom GET Handlers

## Problem

API interceptors (`before`/`after` hooks) only fire for routes that go through `makeCrudRoute`. Currently **38 routes** use `crud.GET` (interceptors fire), while **144 routes** use custom `async function GET` handlers (interceptors don't fire).

This means UMES interceptors — the primary mechanism for app-level guardrails — are **unreliable for read paths**. Apps that need to filter, scope, or reject GET requests based on business rules cannot use interceptors and must build custom endpoints instead.

## Context: How We Found This

Building PRM's agency user management (Phase 2, Commit 8), we needed to restrict `/api/auth/users` GET results so `partner_admin` users only see users within their own organization. We registered an interceptor with `targetRoute: 'auth/users'` and `methods: ['GET']`.

- **Mutation interceptors** (POST/PUT/DELETE) worked correctly — they go through `crud.POST`/`crud.PUT`/`crud.DELETE` which runs the interceptor pipeline.
- **GET interceptor** never fired — the auth users GET handler is a custom `async function GET(req)` that bypasses `makeCrudRoute` entirely.

The platform provides `runCustomRouteAfterInterceptors` (used by `auth/api/login.ts`), but only 1 out of 144 custom GET handlers calls it.

### Workaround

We created a scoped PRM-specific endpoint (`/api/partnerships/agency-users`) that queries users directly with org filtering. This works but defeats the UMES pattern — every app that needs read-path guardrails has to build custom endpoints instead of using interceptors.

## Data

```
Routes using crud.GET (interceptors fire):     38
Routes using custom GET (interceptors skip):  144
Routes calling runCustomRouteAfterInterceptors: 1  (auth/api/login.ts)
```

Modules with custom GET handlers include: auth, customers, catalog, sales, staff, workflows, integrations, data_sync, notifications, messages, and more.

## Proposal

Add middleware-level interceptor support that wraps **all** API route responses, not just those going through `makeCrudRoute`. This would make `before`/`after` interceptors reliable for both read and write paths.

### Options (in order of preference)

**Option A: Next.js middleware-level interceptor runner**
Wire `runApiInterceptorsBefore` and `runApiInterceptorsAfter` in the API middleware layer (where auth and tenant scoping already run). Every route gets interceptor coverage automatically. No changes needed per-route.

**Option B: Adopt `runCustomRouteAfterInterceptors` across custom handlers**
Gradually wire the existing helper into all 144 custom GET handlers. Lower risk but high effort and easy to miss new routes.

**Option C: Migrate custom GETs to `makeCrudRoute`**
Move custom GET handlers to use the CRUD factory. Most impactful but largest refactor — many custom GETs have complex query logic that doesn't fit `makeCrudRoute` cleanly.

### Recommendation

Option A is the cleanest. It aligns with the UMES philosophy: "put a file in the right place, platform finds it." App developers register an interceptor with a `targetRoute` and expect it to fire — they shouldn't need to know whether the target route uses `makeCrudRoute` or a custom handler.

## Impact

This would enable:
- App-level org scoping on any core module's read path (the PRM use case)
- Response filtering/redaction via interceptors (GDPR, role-based field visibility)
- Read-path audit logging via interceptors
- Rate limiting or caching at the interceptor level for specific routes

## References

- PRM C8 spec: `apps/prm/docs/specs/2026-03-31-ph2-c8-partnership-settings-user-invitations.md`
- Interceptor runner: `packages/shared/src/lib/crud/interceptor-runner.ts`
- Custom route helper: `packages/shared/src/lib/crud/custom-route-interceptor.ts`
- CRUD factory interceptor wiring: `packages/shared/src/lib/crud/factory.ts:970-1000`
