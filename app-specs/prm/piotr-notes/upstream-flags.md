# Upstream Flags — PRM App Spec

## US-1.1b: Email invitation flow (Phase 4)

### Upstream investigation
- **Scope:** `core-module` — auth module changes needed
- **Needed capability:** Invite User by email (send link, user sets own password)
- **Spec found:** `SPEC-038-2026-02-23-invite-user-email.md` — full spec exists in `.ai/specs/`
  - Adds `sendInviteEmail` flag to `auth.users.create` command
  - Reuses `PasswordReset` entity with 48h token expiry
  - New command: `auth.users.resend_invite`
  - Modifies `CreateUserPage` UI with invite toggle
  - Clean, minimal design — no new entities or modules
- **Issues/PRs found:** None open on `open-mercato/open-mercato`
- **On develop branch:** No — not implemented. Zero commits matching SPEC-038 or invite flow.
- **Recommendation:** Submit PR implementing SPEC-038 during Phase 2-3 work. Spec is already approved and designed. Implementation is straightforward (the spec reuses existing PasswordReset mechanism). If PR is merged before Phase 4 starts, the 2 commits become `app` scope (just configure the invite in PRM's setup.ts). If not merged in time, Phase 4 keeps self-onboard workaround until upstream merges.

### Timeline
- Spec written: 2026-02-23
- Implementation: not started
- Risk: low — spec is approved, design is clean, no architectural debate expected
- Mitigation: submit PR early, self-onboard workaround covers until merge

---

## defaultRoleFeatures ignores custom role keys (Phase 1 blocker — workaround active)

### Upstream investigation
- **Scope:** `core-module` — auth module `setup-app.ts`
- **Needed capability:** `defaultRoleFeatures` should process arbitrary role keys, not just superadmin/admin/employee
- **Spec found:** None
- **Issues/PRs found:** PR #1040 submitted (https://github.com/open-mercato/open-mercato/pull/1040)
- **On develop branch:** No — not implemented
- **Recommendation:** PR submitted. App workaround: `seedPrmRoles` manually creates RoleAcl entries for custom roles.

### Impact
- Every OM app with custom roles (PRM, CFP, any future app) hits this
- Without fix, custom role features silently ignored during `yarn initialize`
- Workaround: manually seed RoleAcl in module's `seedDefaults`

### Timeline
- PR submitted: 2026-03-20
- Risk: low — fix is 22 lines, backward compatible, no architectural debate
- Mitigation: workaround in seedPrmRoles is stable

---

## Per-org feature scoping for PM role (by design — not a gap)

### Upstream investigation
- **Scope:** `core-module` — auth module RBAC
- **Needed capability:** Different feature sets per organization for the same role. E.g., PM gets `customers.*` in own org but `customers.*.view` in agency orgs.
- **Spec found:** None
- **Issues/PRs found:** None
- **On develop branch:** No — `RoleAcl.featuresJson` applies to all visible orgs equally
- **Assessment:** This is **by design, not a gap.** OM RBAC uses organizations as data partitioning (which records you see), not permission partitioning (what actions you can perform). This is consistent with standard CRM/ERP RBAC — roles define capabilities, org assignment defines data scope. Verified in `rbacService.ts`: `organizationsJson` controls visibility only, features are resolved tenant-wide regardless of selected org.

### PRM approach
- PM gets `customers.*` (full write everywhere) — this is **correct** per OM's architecture
- PM cross-org read-only is a **procedural convention**, not a technical enforcement
- If per-org feature scoping is ever needed at scale, it would require a new `OrgRoleAcl` entity or `organizationId` on `RoleAcl` — a significant architectural enhancement, not a bugfix
- **No upstream PR planned** — the current model works for PRM's trust-based partner program
