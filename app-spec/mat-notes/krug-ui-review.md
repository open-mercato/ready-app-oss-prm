# Krug UI Review — PRM App Spec §3.5

**Reviewer:** Steve Krug (usability)
**Date:** 2026-03-22
**Method:** Parallel walkthrough — one subagent per workflow (WF1-WF5 + cross-workflow)
**Status:** All findings addressed in §3.5

## BLOCKERS (7) — all fixed

| # | WF | Finding | Fix applied |
|---|-----|---------|-------------|
| B1 | WF1 | No-demo-data: "Fill profile" checklist has no company record | Add Agency ALWAYS creates agency company record |
| B2 | WF5 | Tier Review not in PM sidebar | Added to Navigation table |
| B3 | WF5 | No discovery for pending tier proposals | Added "Pending Proposals" PM dashboard widget |
| B4 | WF4 | BD/Admin no in-app RFP entry point | Added "Incoming RFPs" dashboard widget |
| B5 | WF3 | WIC Import UI missing | Added Custom Page `/backend/partnerships/wic-import` |
| B6 | WF3 | No rejection/mismatch feedback after WIC import | Import result shows matched + rejected inline |
| B7 | WF3 | WIC breakdown not renderable as widget | Added Custom Page `/backend/partnerships/my-wic` + widget links to it |

## FRICTION (13) — all addressed

| # | WF | Finding | Fix applied |
|---|-----|---------|-------------|
| F1 | WF1 | Credentials displayed once, no recovery | Added clipboard copy button to spec |
| F2 | WF1 | No post-creation CTA | Added "Go to Agency List" CTA |
| F3 | WF1 | Company profile fields on prospect companies | Accepted — architectural decision (agencies are companies) |
| F4 | WF1 | Admin role dropdown shows all roles | Phase 1 procedural — documented |
| F5 | WF1 | No back-to-checklist CTA | Accepted — browser back + sidebar nav sufficient for Phase 1 |
| F6 | WF2 | No visual feedback on WIP stamp | Added flash message to BD flow |
| F7 | WF5 | Checklist no success state | Added "All done!" flash before disappearing |
| F8 | WF5 | Tier detail page undefined | Added Custom Page `/backend/partnerships/my-tier` |
| F9 | WF5 | Org switch visual feedback | Added: "header org label updates" to WIP widget spec |
| F10 | WF4 | Comparison page URL missing | Added `/backend/partnerships/rfp/[id]` |
| F11 | WF4 | No deadline-expired state | Added EmptyState to response page |
| F12 | WF4 | Draft vs Publish ambiguous | Added explicit "Save as Draft" and "Publish" actions |
| F13 | WF3 | No PM view of WIC post-import | WIC Import page shows result inline |

## POLISH (noted, not all actioned)

- PM "return to own org" flow added
- GH username format hint added
- WicAssessmentSource surfacing deferred to Phase 4
- n8n status indicator deferred to Phase 4
- Admin per-contributor WIC drill-down deferred (aggregate in Tier widget sufficient)
