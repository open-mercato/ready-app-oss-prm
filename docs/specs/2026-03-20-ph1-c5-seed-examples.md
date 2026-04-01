# Phase 1, Commit 5: seedExamples — Phase 1 Demo Data

## Source
- App Spec sections: §7 (Phase 1 seedExamples)
- User stories: US-7.1, US-7.2
- Commit plan: commits-WF1.md (Commit 6)

## What This Delivers
After this commit, running `yarn initialize` populates a complete Phase 1 demo environment: 3 agencies with company profiles and case studies, a PM user, 3 sets of agency users (Admin + BD + Contributor), deals at various pipeline stages with some `wip_registered_at` stamps, and completed onboarding checklists for 2 of 3 agencies. A developer can see working KPI widgets and CRM data immediately.

## Acceptance Criteria
**Business (Mat):**
- [ ] `yarn initialize` populates demo data that exercises every Phase 1 workflow
- [ ] 3 demo agencies with different profiles (different verticals, services, team sizes)
- [ ] Demo deals at various pipeline stages (some with WIP stamps, some not yet at SQL)
- [ ] All demo data labeled clearly (e.g., "Acme Digital (Demo)")
- [ ] Developer sees working dashboards, CRM with deals, onboarding widgets without manual setup

## Files
| File | Action | Purpose |
|------|--------|---------|
| `src/modules/partnerships/setup.ts` | Modify | Add `seedExamples` function with all demo data creation logic |

## OM Patterns Used
- **setup.ts seedExamples** — Reference: `$OM_REPO/packages/core/src/modules/customers/setup.ts` (seedExamples function structure)
- **Demo data seeding** — Reference: `$OM_REPO/packages/core/src/modules/customers/cli.ts` (seedCustomerExamples — creating people, companies, deals programmatically)

## Implementation Notes

### Demo Agencies (3 organizations)
| Agency | Vertical | Team Size | Onboarding Status |
|--------|----------|-----------|-------------------|
| Acme Digital (Demo) | FinTech | 21-50 | Complete (profile + case study + BD + Contributor) |
| Nordic AI Labs (Demo) | HealthTech | 6-20 | Complete |
| CloudBridge Solutions (Demo) | RetailTech | 1-5 | Partial (profile filled, no case study yet) |

### Demo Users
| User | Role | Agency |
|------|------|--------|
| pm@demo.local | partnership_manager | PM org (top-level) |
| admin@acme-demo.local | partner_admin | Acme Digital |
| bd@acme-demo.local | partner_member | Acme Digital |
| contributor@acme-demo.local | partner_contributor | Acme Digital |
| admin@nordic-demo.local | partner_admin | Nordic AI Labs |
| bd@nordic-demo.local | partner_member | Nordic AI Labs |
| contributor@nordic-demo.local | partner_contributor | Nordic AI Labs |
| admin@cloudbridge-demo.local | partner_admin | CloudBridge Solutions |
| bd@cloudbridge-demo.local | partner_member | CloudBridge Solutions |
| contributor@cloudbridge-demo.local | partner_contributor | CloudBridge Solutions |

All demo users: password `demo1234` (hashed with bcryptjs).

### Demo Deals
Per agency, seed 3-5 deals at various pipeline stages:
- Acme: 5 deals (1 at New, 1 at Contacted, 1 at SQL with `wip_registered_at` stamp from 2026-03-10, 1 at Proposal with `wip_registered_at` from 2026-02-15, 1 at Won)
- Nordic: 3 deals (1 at Qualified, 1 at SQL with `wip_registered_at` from 2026-03-18, 1 at Lost)
- CloudBridge: 2 deals (1 at New, 1 at Contacted — no WIP yet)

### Demo Case Studies
- Acme: 2 case studies (FinTech payment integration, banking compliance platform)
- Nordic: 1 case study (HealthTech patient portal)
- CloudBridge: 0 case studies (onboarding incomplete — demonstrates partial state)

### Demo Company Profiles
All 3 agencies have company profile fields populated (services, industries, technologies, etc.) except CloudBridge which has a minimal profile (demonstrates "profile needs attention" state).

### Seeding Order
1. Create organizations (agencies)
2. Create users with role assignments
3. Fill company profiles (custom fields on company entity)
4. Create case studies (entity records)
5. Create CRM companies (prospects)
6. Create deals at various stages
7. Stamp `wip_registered_at` on qualifying deals (direct write via entities API, bypassing interceptor for seed purposes)

### Idempotency
Guard: check if demo data already exists before seeding (e.g., check for org with name "Acme Digital (Demo)"). Skip if already present.

## Verification
```bash
yarn typecheck                   # Must pass
yarn build                       # Must pass
yarn initialize                  # Run full bootstrap — verify all demo data created
# Manual check: log in as pm@demo.local, verify 3 agencies visible via org switcher
# Manual check: log in as bd@acme-demo.local, verify deals visible in CRM, WIP count = 2
# Manual check: log in as admin@cloudbridge-demo.local, verify onboarding checklist shows incomplete items
```
