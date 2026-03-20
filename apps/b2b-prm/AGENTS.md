# B2B PRM — App-Specific Overrides

@../../AGENTS.md

## Identity Model (CRITICAL — overrides SPEC-053c)

All agency users are `User` (auth module, backend access). **Portal is NOT used. Zero CustomerUser accounts.**

| Persona | Role key | Org scope | Access |
|---------|----------|-----------|--------|
| Partnership Manager | `partnership_manager` | all orgs (`organizationsJson: null`) | All CRM read-only, all KPIs, tier governance, RFP, MIN attribution |
| Agency Admin | `partner_admin` | own org | CRM full write, KPI, tier, team mgmt, case studies, RFP |
| Business Developer | `partner_member` | own org | CRM own records, KPI, tier, RFP responses |
| Contributor | `partner_contributor` | own org | WIC score + tier only |

## Key Domain Rules

These rules are acceptance criteria — code must enforce them:

- **WIP:** `wip_registered_at` is immutable once set. Stamped by interceptor on first SQL+ transition only. BD cannot write field directly.
- **WIC:** one active assessment per org+month. Re-import replaces + archives. Feature Key dedup enforced as invariant at ContributionUnit creation.
- **MIN:** no double-attribution (unique: license_identifier + year). PM-only. Calendar year UTC boundaries.
- **Tiers:** TierEligibility (computed) != TierAssignment (durable). Grace period state machine: OK -> GracePeriod -> ProposedDowngrade. One open TierChangeProposal per org per period.
- **RBAC:** Admin > BD > Contributor. PM has Program Scope (all orgs). Agency users see own org only.

## What NOT to Do

- Do NOT use CustomerUser or portal pages — all users are `User` with backend access
- Do NOT build custom notification subscribers — use workflows SEND_EMAIL activity
- Do NOT build custom state machines — use workflows module
- Do NOT reference old SPEC-053c portal design — it was wrong (see App Spec §8)
