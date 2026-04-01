# Challenger Review: Tier Validity Dates

**Reviewer:** Vaughn Vernon (DDD challenger)
**Date:** 2026-04-01
**Section:** Domain model changes for tier validity period

---

## CRITICAL Findings

### C1: "Informational only" validity is a domain lie
Conflating contractual semantics (validFrom/validUntil from partnership agreement) with operational entity (TierAssignment = "what tier does agency hold"). Calling it "informational" while also triggering notifications and defining glossary terms = contradiction.

**Mat response: PARTIALLY ACCEPT.**
Vernon is right that "informational only" is dishonest framing. But his option (b) — separate PartnershipAgreement entity — is over-engineering for our scale (15 agencies).

**Resolution:** Reframe validUntil as "scheduled review date" rather than "contractual end." When validUntil passes, the TierAssignment enters a computed `PendingReview` state — tier is still operationally active, but the domain acknowledges the review is overdue. This is honest without adding enforcement complexity. Enforcement (blocking/suspension) is explicitly deferred to the GitHub issue.

### C2: Current tier query contradicts validity model
If validFrom is future-dated, ORDER BY validFrom DESC would pick it up as current tier before it starts.

**Mat response: ACCEPT.**
Fix: validFrom = today always. Add validation: validFrom cannot be in the future. No scheduled assignments — not a business need. PM assigns tiers effective immediately.

### C3: Missing invariant for overlapping validity periods
Two TierAssignments can have overlapping validFrom-validUntil ranges. Which is current?

**Mat response: ACCEPT.**
Fix: Document explicitly that TierAssignments supersede — latest by validFrom wins. Previous assignment's validUntil is historical record only. When new assignment is created, it becomes current regardless of old one's validUntil. No overlap constraint needed because superseding semantics make overlap irrelevant.

---

## WARNING Findings

### W4: isExpiring/isExpired are read-model projections, not domain concepts
They have no write-model behavior. Shouldn't be in ubiquitous language glossary.

**Mat response: ACCEPT.** Move to API/read model documentation. Remove from glossary.

### W5: No domain events for expiring/expired states
Need TierValidityApproaching and TierValidityLapsed events.

**Mat response: PUSHBACK.** For v1, compute at read time (tier-status API). Dashboard banner reads API on page load. No cron or async events needed. Events make sense when we add email/push notifications — not in scope now. Adding events now = infrastructure for future features = premature.

### W6: 30-day threshold is a magic number
Should be configurable, may differ by tier.

**Mat response: ACCEPT.** Make it a constant in tier-thresholds config. Single value for now, per-tier override possible later.

### W7: Migration rename changes semantics
effectiveDate (historical fact) -> validFrom (temporal boundary). Need to audit all consumers.

**Mat response: ACCEPT.** Standalone app, contained blast radius. Will audit all references in codebase.

### W8: validUntil NOT NULL with default "12 months" is fabricated data
Backfilling contractual dates that never existed.

**Mat response: ACCEPT.** 
Fix: Make validUntil nullable. null = "no expiry set" (legacy assignments). New assignments require it. UI shows "No expiry date" for null. This avoids fabricated data and maintains historical honesty.

---

## Summary

- 3 CRITICAL findings: 1 partially accepted (reframed), 2 fully accepted
- 5 WARNING findings: 4 accepted, 1 pushed back (domain events premature for v1)
- Spec updated to reflect resolutions
