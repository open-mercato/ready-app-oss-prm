# Challenger Review: §2 Identity Model
**Reviewer:** Vaughn Vernon (DDD practitioner)
**Date:** 2026-03-20
**Section reviewed:** §2 Identity Model, PRM App Spec

---

## CRITICAL

### 1. "Contributor" is a role, not an identity — the model names two different things the same

The table header says "Identity" but lists `User` for all rows. That is the identity type. The column "Persona" and "Role key" carry the actual domain concept. That is fine. But the term **Contributor** is doing double duty:

- In §1.3 Ubiquitous Language, **WIC** stands for "Wildly Important **Contribution**." The person who makes a WIC is never given a domain name in §1.3.
- In §2, `partner_contributor` names the **person who makes WIC contributions** as "Contributor."

This means "Contributor" is a domain term in §2 that has no entry in §1.3's Ubiquitous Language table. Anyone reading the spec must infer who a Contributor is from the role table rather than from the language section. That is a ubiquitous language gap, not a terminology overlap, but it is a gap that will produce miscommunication when technical specs are generated from §2.

**Fix:** Add `Contributor` to §1.3 Ubiquitous Language. Definition: "Agency team member whose primary contribution to the program is code (WIC). Has no sales or administrative responsibilities. Identified in the system to enable WIC attribution via GitHub username."

---

### 2. PM's "all orgs" scoping is implemented as a null sentinel — a fragile invariant

`organizationsJson: null` means "sees all organizations." This is an anti-corruption layer problem: the identity invariant ("PM sees everything") is encoded as the **absence** of a value in an external system field rather than as an explicit domain concept.

Consequences:
- If the platform changes the semantics of `organizationsJson: null` (e.g., "no org assigned" rather than "all orgs"), PM silently loses access to all data. No domain invariant catches this.
- A misconfigured PM account (empty array `[]` instead of `null`) would restrict them to zero orgs with no validation error.
- The identity model has no named concept for "global visibility." The invariant exists implicitly in one implementation detail.

This is not a platform critique — it is a domain modeling gap. The domain needs a concept like **GlobalScope** or **ProgramScope** to express "PM has program-wide visibility." Whether the platform implements it as `null` is a separate concern. Without a named concept, the invariant cannot be tested, documented in sub-specs, or enforced at the aggregate level.

**Fix:** Name the concept. Add to §1.3 or §2: "**Program Scope** — A PM-level visibility grant that spans all partner organizations. Distinct from org-level scope. Enforced by identity system; implementation detail (`organizationsJson: null`) is platform-specific and must not be referenced in business rules."

---

## WARNING

### 3. BD and Admin both "see CRM (full)" — but CRM write access is not distinguished

The table says both `partner_admin` and `partner_member` (BD) see "CRM (full)" and both can "create deals." Admin additionally does "team management." What is not specified: can Admin **delete** BD's deals? Can Admin reassign deals between BDs in the same org?

This matters because:
- If Admin can delete deals, a disgruntled Admin can tank the org's WIP count.
- WIP counts deals created in a given month. If an Admin reassigns a deal's ownership, the WIC count for the original BD is unaffected, but the attribution is ambiguous.
- The business rule in §1.4.3 says "Admin can do everything BD can" — that is a capability superset claim. But it does not clarify whether Admin has **destructive** capabilities over BD's records.

This is not an identity model bug per se, but the identity model should state the boundary explicitly, because the boundary between Admin and BD is the most important invariant in this context. "Admin > BD" is not a full specification.

**Fix:** Add one line to §2 or §1.4.3: "Admin has full CRM write access within own org, including records created by BD users. BD has write access only to their own CRM records."  If the intent is different, state it explicitly.

---

### 4. "Responds to RFP" is listed under BD — but RFP is a campaign directed at an org, not a person

The table says BD `partner_member` can "respond to RFP." In §1.3, RFP is defined as PM distributing leads to qualified **agencies**. The response is agency-level, not BD-level.

Questions that are currently unanswered by the identity model:
- Who in the agency can initiate an RFP response — BD only, or also Admin?
- Can multiple BDs collaborate on a single RFP response, or is it one BD's record?
- If an Admin is the only person in the org (no BD invited yet), can Admin respond to an RFP?

The table lists RFP response under BD but not under Admin. If that is intentional (only BDs respond, never Admins), it needs a decision log entry. If it is an omission, the table is inconsistent with the principle "Admin can do everything BD can."

**Fix:** Either add "responds to RFP" to the Admin row, or add a decision log entry explaining why Admin cannot respond to RFPs.

---

### 5. Contributor's "configures own profile (e.g. GH username)" has no invariant around attribution

Contributor sets their GitHub username. That username is the basis for WIC attribution (linking GitHub PRs to a person in an org). The identity model does not state:

- Is GH username unique across all Contributors? What if two accounts share a username (typo, transfer)?
- Can a Contributor change their GH username after WIC has been attributed? Does that retroactively reattribute past scores?
- Can a PM override a Contributor's GH username?

These are not implementation details — they are domain invariants about data ownership and attribution integrity. The WIC formula in §1.4.2 depends on `person + month + feature_key` as the anti-double-counting unit. If `person` is resolved through a mutable GH username, the dedup key becomes unstable.

**Fix:** Add a business rule: "GH username is the WIC attribution key for a Contributor. Once set and WIC has been recorded against it, it is immutable except by PM override with audit log. Changes do not retroactively alter past scores."

---

## OK

**Single identity type (all User, zero CustomerUser):** The decision is correct and the reasoning is sound. BD needs CRM, CRM is in the backend, building CRM in portal would mean rebuilding the platform. The decision log entry covers this adequately. No dual-account complexity, no promotion flows. This is the right call for this scope.

**Role key naming convention:** `partnership_manager`, `partner_admin`, `partner_member`, `partner_contributor` follows a consistent namespace prefix (`partner_*` plus the PM exception). Naming is unambiguous and maps cleanly to the persona table without synonyms or collisions.

**Portal rejection:** The explicit "NOT USED. Zero portal pages. Zero CustomerUser accounts." is exactly the kind of decision boundary a DDD practitioner wants to see. It eliminates an entire class of architectural ambiguity. Well done.
