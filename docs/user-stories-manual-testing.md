# PRM — Zaimplementowane User Stories + Weryfikacja Ręczna

> Stan na: 2026-03-23. Phase 1 + Phase 2 zaimplementowane i zmergowane.
>
> Dane demo: `yarn initialize` seeduje 3 agencje, PM, użytkowników per rola, deale, case studies, WIC scores, tier assignments.

## Loginy demo

| Rola | Email | Haslo |
|------|-------|-------|
| Partnership Manager | `partnership-manager@demo.local` | `Demo123!` |
| Agency Admin (Acme) | `acme-admin@demo.local` | `Demo123!` |
| BD (Acme) | `acme-bd@demo.local` | `Demo123!` |
| Contributor (Acme) | `acme-contributor@demo.local` | `Demo123!` |
| Agency Admin (Nordic) | `nordic-admin@demo.local` | `Demo123!` |

---

## Phase 1: Core Loop (WF1 + WF2)

### US-1.1 — PM onboarduje agencje w jednym kroku

**Co robi:** PM tworzy nowa agencje (organizacja + admin + opcjonalnie demo data) jednym formularzem.

**Jak sprawdzic:**
1. Zaloguj sie jako PM
2. `POST /api/partnerships/agencies` z body: `{ "agencyName": "Test Agency", "adminEmail": "test@test.local", "seedDemoData": true }`
3. Odpowiedz zawiera `organizationId`, `adminUserId`, `inviteMessage` z loginem i haslem
4. Zaloguj sie na nowe konto — CRM jest wypelniony demo danymi (jesli `seedDemoData: true`)

**Testy e2e:** TC-PRM-004 (T1-T5)

---

### US-1.2 + US-1.3 — Admin wypelnia profil agencji, a Admin i BD moga zarzadzac case studies

**Co robi:** Custom fields na Organization (13 pol: services, industries, tech_capabilities, itp.) + custom entity Case Study (17 pol). Admin dodaje pierwszy case study w onboardingu, a potem i Admin, i BD moga tworzyc/edytowac case studies swojej agencji.

**Jak sprawdzic:**
1. Zaloguj sie jako Acme Admin
2. Idz do `/backend/partnerships/agency-profile` — widac pola profilu agencji
3. Idz do `/backend/partnerships/case-studies` — mozna tworzyc/edytowac case study
4. Wyloguj sie i zaloguj jako Acme BD
5. Idz do `/backend/partnerships/case-studies` — BD tez moze tworzyc/edytowac case study w swojej organizacji
6. Proba stworzenia case study bez wymaganych pol (title, industry, technologies, budget_bucket, duration_bucket) zwraca blad walidacji

**Testy e2e:** TC-PRM-008 (T5, T6)

---

### US-1.4 + US-1.5 — Admin tworzy konta BD i Contributor

**Co robi:** Admin moze tworzyc uzytkownikow w swojej organizacji z rolami `partner_member` (BD) i `partner_contributor`.

**Jak sprawdzic:**
1. Zaloguj sie jako Acme Admin
2. Idz do `/backend/users/create` — organizacja jest pre-filled (tylko Acme)
3. Stworz usera z rola `partner_member` — sukces
4. Stworz usera z rola `partner_contributor` — sukces
5. Zaloguj sie jako BD (`acme-bd@demo.local`) — probujesz stworzyc usera → 403

**Testy e2e:** TC-PRM-007 (T1-T3)

---

### US-1.7 + US-1.8 — Onboarding checklist na dashboardzie

**Co robi:** Widget na dashboardzie pokazuje checklisty onboardingowa. Admin widzi 4 pozycje (profil, case study, invite BD, invite Contributor). BD widzi 2 (prospect, deal). Znika po ukonczeniu.

**Jak sprawdzic:**
1. Zaloguj sie jako Acme Admin — `GET /api/partnerships/onboarding-status`
2. Odpowiedz: `{ role: "admin", items: [...], allCompleted: true/false }`
3. Admin widzi 4 itemy, BD widzi 2 itemy
4. Na seedowanych danych `allCompleted: true` (bo demo dane juz istnieja)

**Testy e2e:** TC-PRM-003 (T1-T5)

---

### US-2.2 — WIP stamp na SQL stage

**Co robi:** Kiedy BD przenosi deal do stage "SQL" (order >= 3), API interceptor ustawia `wip_registered_at` z aktualnym timestampem. Stamp jest immutable — cofniecie i ponowne przesuniecie nie nadpisuje.

**Jak sprawdzic:**
1. Zaloguj sie jako BD
2. Stworz deal na pipeline "PRM Pipeline"
3. Zaktualizuj stage deala na "SQL" (`PATCH /api/customers/deals`)
4. Sprawdz custom fields deala — `wip_registered_at` jest ustawiony na aktualny timestamp UTC
5. Cofnij deal do "Contacted", potem znow do "SQL" — timestamp sie nie zmienil
6. Proba ustawienia `wip_registered_at` recznie w PUT body jest ignorowana (stripped)

**Testy e2e:** TC-PRM-001 (T1-T5)

---

### US-2.3 — WIP count widget (PM dashboard)

**Co robi:** PM widzi liczbe WIP per agencja per miesiac. Live query zliczajacy deale z `wip_registered_at` w danym miesiacu.

**Jak sprawdzic:**
1. Zaloguj sie jako PM
2. `GET /api/partnerships/wip-count?month=2026-03` — zwraca `{ count: N, month: "2026-03" }`
3. `GET /api/partnerships/agencies` — lista agencji z `wipCount` per agencja
4. Niepoprawny format miesiaca (`2026-3`, `abc`) zwraca 400

**Testy e2e:** TC-PRM-002 (T1-T4), TC-PRM-006 (T1-T3)

---

### US-6.1–6.4 — Izolacja organizacyjna

**Co robi:** PM widzi dane wszystkich agencji (Program Scope). Agencyjni uzytkownicy widza tylko swoja organizacje.

**Jak sprawdzic:**
1. Zaloguj sie jako PM — org switcher pokazuje wszystkie organizacje
2. Zaloguj sie jako Acme Admin — widac tylko Acme, brak dostepu do Nordic
3. Zaloguj sie jako Acme BD — widac tylko Acme deals/companies
4. Proba pobrania danych innej organizacji przez Acme usera — brak wynikow (org scoping)

**Testy e2e:** TC-PRM-005 (T1-T4)

---

### US-7.2 + US-7.3 — Seed data (demo uzytkownicy i dane)

**Co robi:** `yarn initialize` seeduje 3 agencje, pipeline 7-stage, demo userow per rola, deale z WIP stamps, case studies, profil organizacji.

**Jak sprawdzic:**
1. `yarn initialize`
2. Zaloguj sie kolejno jako PM, Admin, BD, Contributor — kazdy widzi odpowiednie dane
3. Pipeline "PRM Pipeline" ma 7 stages: New, Contacted, Qualified, SQL, Proposal, Won, Lost
4. Minimum 3 demo agencje (Acme Digital, Nordic AI Labs, CloudBridge Solutions)
5. Demo deale na roznych stage'ach, czesc z WIP stamps

**Testy e2e:** TC-PRM-008 (T1-T5)

---

## Phase 2: Governance + KPI (WF3 + WF5)

### US-3.1 — Contributor linkuje GH username

**Co robi:** Custom field `github_username` na User. Unikalny — dwa usery nie moga miec tego samego. Immutable po zaimportowaniu WIC (chyba ze PM overriduje).

**Jak sprawdzic:**
1. Zaloguj sie jako Admin
2. `PUT /api/entities/records` z `{ entityId: "auth:user", recordId: "<userId>", values: { github_username: "myhandle" } }` — sukces
3. Proba ustawienia tego samego username na innym userze — interceptor powinien odrzucic (403, known gap: custom route moze nie odpalac interceptora)

**Testy e2e:** TC-PRM-011 (T1-T3)

---

### US-3.2 — PM importuje WIC scores

**Co robi:** PM uploaduje wyniki WIC dla danej agencji+miesiaca. System waliduje schema, sprawdza GH username matching, liczy wic_score, archiwizuje poprzedni import.

**Jak sprawdzic:**
1. Zaloguj sie jako PM
2. `POST /api/partnerships/wic/import` z body:
   ```json
   {
     "organizationId": "<acme-org-id>",
     "month": "2026-03",
     "source": "manual_import",
     "records": [{
       "contributorGithubUsername": "carol-acme",
       "prId": "PR-123",
       "month": "2026-03",
       "featureKey": "SPEC-099",
       "level": "L2",
       "impactBonus": true,
       "bountyApplied": false
     }]
   }
   ```
3. Odpowiedz: `{ imported: 1, archived: 0, assessmentId: "..." }`
4. Nieznany GH username → 422 z `unmatchedUsernames`
5. Duplikat w batchu (ten sam user+month+featureKey) → 422
6. Re-import tego samego org+month → archiwizuje stare, `archived: N`

**Testy e2e:** TC-PRM-009 (T1-T5)

---

### US-3.3 — WIC score display

**Co robi:** Uzytkownicy widza WIC scores per miesiac. PM widzi wszystkie orgi, contributor widzi tylko swoje.

**Jak sprawdzic:**
1. Zaloguj sie jako PM — `GET /api/partnerships/wic-scores?month=2026-03` — widac scores wszystkich organizacji
2. Zaloguj sie jako Contributor — ten sam endpoint — widac tylko swoje scores
3. Query na pusty miesiac zwraca `totalWicScore: 0`

**Testy e2e:** TC-PRM-010 (T1-T3)

---

### US-5.6 — MIN attribution (PartnerLicenseDeal CRUD + Cross-org company search)

**Co robi:** PM tworzy PartnerLicenseDeal (atrybucja licencji do agencji). PM moze szukac firm we wszystkich agencjach (cross-org search).

**Jak sprawdzic:**
1. Zaloguj sie jako PM
2. `GET /api/partnerships/company-search?q=Demo` — zwraca firmy ze wszystkich agencji z `organizationName`
3. `POST /api/partnerships/partner-license-deals` z body:
   ```json
   {
     "organizationId": "<acme-org-id>",
     "companyId": "<company-id>",
     "licenseIdentifier": "LIC-TEST-001",
     "industryTag": "Finance",
     "closedAt": "2026-03-15",
     "year": 2026
   }
   ```
4. Duplikat (ten sam `licenseIdentifier` + `year`) → odrzucony (unique constraint)
5. Non-PM user → 403
6. Search term < 2 znakow → 400

**Testy e2e:** TC-PRM-012 (T1-T4), TC-PRM-013 (T1-T4)

---

### US-5.1 + US-5.2 — Tier evaluation (enqueue + KPI aggregation)

**Co robi:** PM moze uruchomic ewaluacje tierow. System agreguje WIC+WIP+MIN per agencja i porownuje z progami tierow.

**Jak sprawdzic:**
1. Zaloguj sie jako PM
2. `POST /api/partnerships/enqueue-tier-evaluation` — odpowiedz: `{ jobsEnqueued: N }`
3. Non-PM user → 403

**Testy e2e:** TC-PRM-014 (T1, T4)

---

### US-5.4 + US-5.5 — Tier status widget

**Co robi:** Uzytkownicy agencji widza aktualny tier, wartosci KPI vs progi, progress % do nastepnego poziomu.

**Jak sprawdzic:**
1. Zaloguj sie jako Acme Admin
2. `GET /api/partnerships/tier-status` — odpowiedz zawiera:
   - `currentTier` (np. "OM Agency")
   - `kpis: { wic: { current, required }, wip: { current, required }, min: { current, required } }`
   - `progress` (0-100)
   - `nextTier`
3. Contributor i BD tez dostaja 200 (nie 403)
4. Niezalogowany → 401

**Testy e2e:** TC-PRM-014 (T2-T3), TC-PRM-016 (T1-T4)

---

### Cron triggers (wspoldzielone WF3/WF5)

**Co robi:** Endpointy do triggerowania z zewnetrznego crona (API key auth, nie user auth).

**Jak sprawdzic:**
1. `POST /api/partnerships/trigger-monthly-evaluation` bez headera `x-api-key` → 401
2. Z blednym `x-api-key` → 401
3. `POST /api/partnerships/trigger-wic-import` — analogicznie

**Testy e2e:** TC-PRM-015 (T1-T4)

---

## Dashboard Widgets (UI)

| Widget | Rola | Lokalizacja |
|--------|------|-------------|
| Cross-org WIP Table | PM | Dashboard — tabela agencji z WIP count |
| Onboarding Checklist | Admin (4 items), BD (2 items) | Dashboard — pierwszy widget |
| WIP Count | Admin, BD | Dashboard — WIP w aktualnym miesiacu |
| WIC Summary | Admin, BD, Contributor | Dashboard — WIC score w aktualnym miesiacu |
| Tier Status | Admin, BD, Contributor | Dashboard — aktualny tier + progress |

---

## Co NIE jest zaimplementowane (Phase 3+)

| User Story | Phase | Opis |
|------------|-------|------|
| US-4.1–4.5 | Phase 3 | RFP (Lead Distribution) — kampanie, odpowiedzi, ewaluacja |
| US-1.1b | Phase 4 | Zaproszenie admina emailem (invitation flow) |
| US-3.4 | Phase 4 | Automatyczny WIC scoring (n8n + GitHub + LLM) |
| US-4.5 | Phase 4 | AI-assisted RFP scoring |
| US-5.3 | Phase 2 (partial) | Tier approval workflow (workflow JSON — encja TierChangeProposal istnieje, workflow do review jeszcze nie) |
