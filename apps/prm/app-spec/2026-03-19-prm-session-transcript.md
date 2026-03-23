# PRM Session Transcript — Phase 0 Design Session
> Extracted from session 2026-03-19, starting from Mat's "reset" moment.
> Mat = product owner (human). Claude = AI assistant.

---

### [21:06] Mat
dobra, wg mnie to wszsytko jest źle

### [21:07] Mat
1. mamy słabo opisane user stories, nie maja sukcesów czyli rezultatów jak są wykonane. 
2. te słabe user stories są źle zmapowane na to co OM daje, przez to mamy kod, ktory nie jest legitny tylko taki potworek
3. to nie będzie dobry przykłąd dla innych

**[21:07] Claude:**
Zgadzam się w 100%. Podsumowując co mamy:

**User stories** — brak success criteria, brak "so that [measurable outcome]". "BD wants to answer RFPs" — ale co to znaczy? Jakie dane wprowadza? Co widzi po submicie? Jak PM ocenia response?

**Mapping na platformę** — SPEC-053c wziął shortcut z CustomerUser/portal zamiast przemyśleć kto czego potrzebuje. Efekt: 570 linii portal code na coś co backend daje za darmo, RFP ręcznie zamiast workflows, WIP bez flow do tworzenia deals, team management page bo portal nie ma user management.

**Jako example app** — powinien pokazywać "tak się buduje na OM". Zamiast tego pokazuje: buduj custom portal pages, pisz własne API routes, ignoruj workflows module, ignoruj messages module. Antyprzykład.

Chcesz przerobić user stories od zera? Dobrze opisane user stories z success criteria → prawidłowy mapping na platformę → czysty kod który pokazuje siłę OM.

---

### [21:09] Mat
zrobmy skill o nazwie Mat, to ja, człowiek, któ®y ciągle chce mapwoać projekty na to jak OM powinien je obsłużyc, ma swój flow i się go trzyma

**[21:09] Claude:**
Mam jasny obraz z naszej rozmowy — to co właśnie przeszliśmy jest idealnym "failing test" dla tego skilla. Bez procesu Mata zbudowaliśmy portal code na CustomerUser, custom RFP flow zamiast workflows, team management page zamiast backend RBAC.

---

**[21:25] Claude:**
Skill zapisany. Chcesz go przetestować na naszych PRM user stories — przepuścić je przez Mata i zobaczyć jak mapping wygląda z nowym procesem?

---

### [21:28] Mat
dobra, Mat zanim zacznie zbierac user stories to chce zrozumiec glowne workflows jakie chcemy spelnić i ich ROI dla biznesu

**[21:28] Claude:**
Racja — user stories bez kontekstu biznesowego to strzelanie na ślepo. Mat najpierw musi zrozumieć **po co** robimy PRM i **jakie workflows generują wartość**.

---

**[21:28] Claude:**
Zaktualizowany. Mat teraz zaczyna od Phase 0 — business workflows i ROI, potem dopiero user stories.

Chcesz odpalić Mata na PRM i zacząć od zdefiniowania core workflows?

---

### [21:29] Mat
mapuje je na ROI i gotowośc w OM oraz na to jak dużo trzeba zrobic atomic commits aby dorobic braki (Ralph loop approach)

**[21:29] Claude:**
Zaktualizowany. Phase 0 teraz ma:
- **ROI** — kto zyskuje, jak, ile
- **OM readiness** — % journey pokryte out of the box
- **Gap commits** — ile atomic commits trzeba żeby dorobić braki (Ralph loop)

Odpalamy Mata na PRM?

---

### [21:30] Mat
Mat po zebraniu workflows pyta czy to co mamy wystarczy aby odpalic to na produkcji i skasować klienta za PoC, czy naprawdę klient zaplaciłby za taki działający system czy brakować mu będzie czegoś aby faktycznie mógl z tego czerpać ROI

**[21:31] Claude:**
Gotowe. Mat teraz po zebraniu workflows robi Production Reality Check — "Would a client pay for this?" z tabelą blokerów i cytatami co klient by powiedział.

Odpalamy na PRM?

---

**[21:32] Claude:**
## Phase 0: Business Workflows & ROI

Zanim zaproponuję workflows, muszę rozumieć biznes. Jedno pytanie:

**Kto jest "klientem" w tym PRM — kto płaci za system?**

Opcje:
- **A)** Vendor (np. firma SaaS) który zarządza siecią partnerskich agencji — płaci za OM z PRM żeby governance'ować program partnerski
- **B)** Agencja która chce zarządzać swoimi relacjami z vendorami
- **C)** Marketplace operator który łączy klientów końcowych z agencjami

To determinuje które workflows generują ROI i dla kogo.

---

### [21:34] Mat
Open Mercato korzysta z pomocy agencji do wdrożeń OM u klientów. Agencje aby być partnerami OM muszą spełniać określone KPIs takie jak WIC, WIP i MIN. Aby to mierzyć chce dać im portal, który pokazuje im gdzie są (jaki tier partnerstwa) i ile im brakuje do kolejengo poziomu, albo czy nie tracą własnie partnerstwa z racji braku spełnionych KPI's. Tutaj są poziomy:
1. OM Agency 
To achieve and maintain the foundational OM Agency status, you must meet the following requirements:
1 WIC/month: Complete at least one WIC (level 1-2) contribution per month.
1 WIP/month: Log at least one conversation with a new prospect per month into the Open Mercato CRM.
Maintain at least two developers who are familiar with the project, have contributed to WIC Levels 1-2, and have secured core-team approval to contribute to Levels 3 or 4 within three months of achieving OM Agency status.
1 MIN/year: Successfully sell and implement Open Mercato (including the mandatory Enterprise License) in at least one company within the first year from becoming OM Agency.
2. OM AI-native Agency 
Agencies that scale their operations and team expertise can unlock the AI-native tier, which grants a higher matching score for incoming leads due to a proven, stable team. Requirements include:
2 WIC/month: Complete at least two WIC (level 1-4) contributions per month.
5 WiP/month: Log at least five conversations with a new prospect per month into the Open Mercato CRM.
2 MIN/year Successfully sell and implement Open Mercato (including the mandatory Enterprise License) in at least two companies within the first year from becoming OM Agency.
Agencies at this level receive increased visibility within the Agentic Engineering sections of the Open Mercato website and achieve higher match scores for general, non-niche clients.
3. OM AI-native Expert Agency
This level of partnership, designed for agencies that dominate a specific "micro-vertical".
3 WIC/month: Complete at least two WIC (level 1-4) contributions per month.
15 WiP/month: Log at least fifteen conversations with a new prospect per month into the Open Mercato CRM.
5 MIN/year including 3 in given vertical.
Vertical Dominance: Build deep expertise around a specific industry niche (e.g., aerospace parts manufacturing) and successfully sell Open Mercato with licenses to a minimum of 3 companies in that given year within that vertical.
Ultimate Visibility: Agencies at this level are highlighted on the Open Mercato website as the definitive experts for their niche. They receive the highest possible matching score, making them the default #1 choice for clients operating in their vertical.
4. OM AI-native Core Agency 
This is the level of partnership, designed for agencies that dominate Agentic Engineering horizontally. 
4 WIC/month: Complete at least four WIC (level 3-4) contributions per month. Build deep expertise around OM core modules.


15 WiP/month: Log at least fifteen conversations with a new prospect per month into the Open Mercato CRM.


5 MIN/year. Horizontal Dominance: Build deep expertise around Agentic Engineering and successfully sell Open Mercato with licenses to a minimum of 5 companies in that given year.
Ultimate Visibility: Agencies at this level are highlighted on the Open Mercato website as the definitive experts in Agentic Engineering. They receive the highest possible matching score, making them the default #1 choice for clients highly technical and demanding market leading experts in Agentic Engineering.


**[21:35] Claude:**
Teraz rozumiem biznes. OM sprzedaje przez agencje, nie bezpośrednio. Agencje muszą udowodnić wartość przez trzy KPI:

- **WIC** — kontrybuujesz do kodu OM (open source contributions)
- **WIP** — generujesz pipeline (logujesz rozmowy z prospectami w CRM)
- **MIN** — sprzedajesz i wdrażasz (enterprise licenses)

Im więcej robisz → wyższy tier → lepsza widoczność na stronie OM → więcej leadów → więcej sprzedaży. Flywheel.

## Business Workflows

### Workflow 1: Agency Onboarding
Journey: PM zaprasza agencję → Agency Admin zakłada konto → dodaje developerów → developerzy zaczynają kontrybuować (WIC) → agencja loguje rozmowy z prospectami (WIP) → zamyka pierwszą sprzedaż (MIN) → osiąga tier "OM Agency"

ROI: **OM** — nowy partner w sieci, nowe źródło pipeline i kontrybuacji. **Agencja** — dostęp do programu, widoczność na stronie OM, incoming leads.

Key personas: Partnership Manager (zaprasza), Agency Admin (konfiguruje), BD (loguje WIP), Contributor/Developer (robi WIC)

OM readiness: 
- Zaproszenie → **Gap** (auth module nie ma invitation flow)
- Konto + role → `auth` module (User + RBAC) — **80% ready** (brak invitation link)
- CRM do WIP → `customers` module — **100% ready**
- WIC tracking → **Gap** (custom: powiązanie GitHub contributions z agencją)
- MIN tracking → **Gap** (custom: powiązanie license deals z agencją)
- Tier calculation → **Gap** (custom: logika tier thresholds)

Gap commits: ~8 (invitation entity+command+page, WIC entity+import, MIN entity+attribution, tier

[...continued...]

---

### [21:38] Mat
poprawmy Skill Mata, ze atomic commits trzeba liczyc na poziomie worfklows a potem na poziomie user stories i dopiero potem dać total gap analysis

**[21:38] Claude:**
Zaktualizowany. Teraz Mat liczy commits w trzech warstwach:
1. **Workflow** — tylko identyfikuje gapy (co brakuje)
2. **User story** — szacuje commits per story (ile pracy)
3. **Gap analysis** — deduplikuje, agreguje, daje dependency order (total)

Wracamy do PRM? Mamy Phase 0 workflows gotowe — powinniśmy przejść do Phase 1 (user stories z success criteria) i dopiero tam policzyć commits per story.

---

### [21:39] Mat
dodatkowo, Mat powinien po zrobioeniu Workflow Gap Matrix sprawdzić z Piotrem (inny skill) czy dobrze zmapwaoł workflow na OM na poziomie workflows, a o zrobioenu User Stories Gap Matrix ponownie z Piotrem srpawedzi czy dobrze zmapował user stories na OM gap analysis.

**[21:39] Claude:**
Now let me update the flow section and add Piotr checkpoints at the right places.

---

**[21:40] Claude:**
Gotowe. Dwa Piotr checkpoints:
1. **Po workflow gap matrix** — "czy dobrze zmapowałem workflows na OM?"
2. **Po user story gap matrix** — "czy dobrze zmapowałem stories na OM?"

Oba z loopback — jeśli Piotr znajdzie błąd, wracamy i poprawiamy mapping.

Wracamy do PRM Phase 1 — user stories?

---

### [21:40] Mat
tak, ale Mat skill został zaktualizowany tak?

**[21:40] Claude:**
Wszystko jest:
- **Phase 0** — workflows + ROI + Production Reality Check
- **Three Layers** — commit estimation: workflow → user story → total
- **Piotr checkpoint 1** — po Workflow Gap Matrix
- **Piotr checkpoint 2** — po User Story Gap Matrix
- **Loopback** — jeśli Piotr znajdzie błąd, wracamy

Kontynuujemy PRM — teraz mamy Phase 0 zrobione (workflows + production reality check). Następny krok wg skilla to **Workflow Gap Matrix → Piotr checkpoint**. Mam tę matrycę z naszej analizy. Odpalić Piotra na niej?

---

### [21:41] Mat
workflow layer jest done gdy na poziomie krokow w workflow i wszystkich kluczowych workflows mamy spójność, czy teraz tak mamy?

**[21:42] Claude:**
Nie. Mamy niespójności. Sprawdźmy:

### Workflow 1: Agency Onboarding
Journey: PM zaprasza → Admin zakłada konto → dodaje devów → devowie kontrybuują (WIC) → BD loguje prospects (WIP) → zamyka sprzedaż (MIN) → tier "OM Agency"

**Problem:** "Admin zakłada konto" — ale jakiego typu? Ustaliliśmy że User (auth), ale w onboarding journey nie zdefiniowaliśmy:
- Kto jest Admin, kto jest BD, kto jest Dev/Contributor — czy to osobne konta czy ta sama osoba?
- "dodaje devów" — jak? Auth module nie ma invitation flow.

### Workflow 2: Pipeline Building (WIP)
Journey: BD spotyka prospekta → loguje w CRM → system liczy WIP

**Problem:** Krok "loguje w CRM" — jako co? Deal? Activity? Contact? Spec mówi "Log at least one conversation with a new prospect." Conversation to Activity w CRM, ale WIP spec mówi "count deals in Sales Qualified Lead stage." **Deal czy Activity?** To są dwie różne rzeczy.

### Workflow 3: Code Contribution (WIC)
Journey: Dev robi PR → review → merge → WIC recorded

**Spójne** — ale brakuje kroku: jak system wie że PR jest od developera z danej agencji? Potrzebny link GH profile → User → Organization.

### Workflow 4: Lead Distribution (RFP)
Journey: OM otrzymuje lead → PM tworzy RFP → notyfikuje agencje → BD odpowiada → PM ocenia → wybiera

**Problem:** "BD odpowiada" — na czym? Jeśli BD jest User z backend access, to odpowiada w backendzie. Ale na jakiej stronie? Custom RFP response page, workflow USER_TASK, czy messages reply? Nie ustaliliśmy.

### Workflow 5: Tie

[...continued...]

---

### [21:46] Mat
Partenrship Manager to admin wsystkich organizacji w danym tier, wysyła zaproszenie do jednej osoby z danej agencji (organizacji) i ta organizacja wypełnia swój profil, moze zaprosic business deva, ktory nie zaprasza ludzi i nie zarzadza organizacją, ale moze dodawac deals i moze edytowac profil firmy i case studies, admin organizacji (agencji) moze zaprosic tez kontrybutora, ktory nie widzi crma, w sumie nic poza WIC score, ktory może obecnie tylko podejrzeć i może zobaczyć poziom partnerstwa. Poziom partnerstwa moze tez zobaczc bdm i admin agencji, ale oni tez widzą KPI's (WIC, WIP, MIN) nie tylko  WIC jak dev.

**[21:46] Claude:**
Teraz jest jasne. Mapuję persony:

| Persona | Kto to | Typ konta | Co widzi | Co robi |
|---------|--------|-----------|----------|---------|
| **Partnership Manager** | Pracownik OM | User (superadmin/admin) | Wszystko, wszystkie orgi | Zaprasza agencje, zarządza tierami, tworzy RFP, ocenia |
| **Agency Admin** | Pierwsza osoba z agencji | User (rola `partner_admin`) | CRM scoped do org, KPI (WIC/WIP/MIN), tier | Wypełnia profil firmy, zaprasza BD i Contributors, zarządza case studies |
| **Business Developer** | Handlowiec agencji | User (rola `partner_member`) | CRM scoped do org, KPI (WIC/WIP/MIN), tier | Dodaje deals, edytuje profil firmy i case studies. Nie zaprasza ludzi. |
| **Contributor** | Developer agencji | User (rola `partner_contributor`) | Tylko WIC score + tier level | Patrzy. Nic nie robi w systemie. |

Kluczowe ustalenia:
- **3 role**, wszystkie User (auth), nie CustomerUser
- **Contributor** to read-only — widzi 2 rzeczy (WIC score, tier). Zero CRM.
- **BD** widzi CRM + KPI + tier, edytuje profil/case studies, ale nie zarządza ludźmi
- **Agency Admin** to BD + zarządzanie ludźmi (invite)
- **WIP = deals** w CRM (nie activities). BD dodaje deal = WIP rośnie.

Poprawiam workflows z tą wiedzą:

### Workflow 1: Agency Onboarding (poprawiony)
PM zaprasza Agency Admin (email + link) → Admin ustawia hasło → loguje się do backend → widzi CRM scoped do swojej org → wypełnia profil firmy (industries, services, tech) → zaprasza BD → zaprasza Contributors

### Workfl

[...continued...]

---

### [21:47] Mat
wg mnie Mat skill powinien tutaj zrobić challenge i upewnić się że workflows mają odpowiednie boundaries, że zanalizował też edge cases najważniejsze 3-5 dla danego worfklow z wysokim prawdopodobieństwem wystiapeinia, dodatkowo kazde workflow powinno miec swoj wpływ na ROI

**[21:48] Claude:**
Zaktualizowany. Mat teraz dla każdego workflow robi:
- **Boundaries** — start/end trigger, co NIE jest tym workflow, overlaps
- **Edge cases** — 3-5 najczęstszych w produkcji (timeout, brak danych, gaming, odejście osoby)
- **Specific ROI** — mierzalny impact, nie generyki

Chcesz żebym teraz przepuścił nasze 5 workflows przez ten challenge?

---

**[21:49] Claude:**
## Workflow Challenge

### Workflow 1: Agency Onboarding

**Journey:** PM zaprasza Agency Admin (email+link) → Admin ustawia hasło → loguje się → wypełnia profil firmy → zaprasza BD → zaprasza Contributors

**ROI impact:** Każda nowa agencja w programie = potencjalnie 1-15 WIP/miesiąc (prospects w pipeline) + 1-5 MIN/rok (enterprise license sales á ~$X). Bez onboardingu = zero agencji = zero indirect pipeline.

**Boundaries:**
- Starts when: PM klika "Invite Agency" i podaje email Agency Admin
- Ends when: Agency Admin zalogował się, profil firmy jest wypełniony, min. 1 BD zaproszony
- NOT this workflow: BD dodaje deals (→ WF2), dev robi PR (→ WF3), tier evaluation (→ WF5)

**Edge cases:**

1. **Agency Admin nie akceptuje zaproszenia w ciągu 72h** → token wygasa → PM widzi "pending" status → może ponowić zaproszenie → risk: agencja nigdy nie dołączy, PM nie wie dlaczego
2. **Agency Admin odchodzi z agencji po onboardingu** → konto zostaje aktywne → nikt nie zarządza org → risk: zombie org z nieaktualnym profilem, nikt nie zaprasza nowych ludzi
3. **PM zaprasza ten sam email dwa razy** → system musi deduplikować → risk: duplikat konta lub błąd bez wyjaśnienia
4. **Agency Admin wypełnia profil ale nie zaprasza BD** → onboarding technically "done" ale workflow nie generuje wartości (zero WIP) → risk: agencja jest w programie ale nic nie robi

---

### Workflow 2: Pipeline Building (WIP)

**Journey:** BD loguje się → tworzy deal w CRM (prospect name, stage, value) → deal scoped d

[...continued...]

---

### [21:51] Mat
jest jeszcze jeden cel tego projektu - Mat chce aby ten projekt był wzorcem example app na OM, aby ten projekt był używany jako przykład jak zrobić swój własny example app, który nie ma za dużo, jest w sam raz, korzyta z teg oco OM daje i nie przesadza

**[21:51] Claude:**
To zmienia priorytetyzację. Ten projekt ma **dwa ROI**:

1. **Biznesowy** — PRM działa, agencje generują pipeline
2. **Platformowy** — example app pokazuje jak budować na OM

I ten drugi jest może ważniejszy — bo jeden dobry example app = dziesiątki projektów zbudowanych poprawnie. Zły example = dziesiątki projektów które powtórzą nasze błędy (portal zamiast backend, custom code zamiast workflows, etc.).

Dodaję to do skilla.

---

**[21:52] Claude:**
Gotowe. Mat teraz ma trzy gates przed user stories:
1. **Production viable** — klient zapłaci
2. **Example worthy** — inni się nauczą dobrych wzorców
3. **Platform-first** — każdy kawałek kodu testowany pytaniem "czy ktoś kopiując to zbuduje na platformie czy obok niej?"

Odpalamy Piotra na workflow gap matrix?

---

### [21:53] Mat
wg mnie Mat pominął kilka ciekawych kwestii... np. Mat jako Partnership Manager chciałby widzieć prospekty od agencji, ale nie powinien ich moc zmieniac bo to nie są propsekci/klienci z jego organizacji, jak to osiągnąć?

**[21:53] Claude:**
Dobre — to jest cross-org visibility problem. PM musi widzieć deals ze wszystkich agencji (żeby liczyć WIP, oceniać agencje), ale nie może ich edytować (bo to dane agencji, nie jego org).

To jest fundamentalne pytanie o architekturę:

**Czy PM jest w osobnej organizacji (OM HQ) i patrzy na dane wielu organizacji?**

Bo OM ma org scoping na każdym query — `WHERE organization_id = :orgId`. Jeśli PM jest w org "OM HQ" a deals są w org "Agency X", PM ich nie widzi. Platforma to blokuje by design.

Opcje:
1. **PM jest superadmin** — widzi wszystkie org (platforma to wspiera: `isSuperAdmin` bypasses org scoping)
2. **Read-only cross-org view** — API interceptor/enricher który daje PM read-only agregat z wielu org
3. **Dane KPI kopiowane do OM HQ org** — aggregation job kopiuje metryki, PM widzi kopię

Ale to nie jedyne pominięcie. Jakie inne kwestie widzisz? Chcę zebrać wszystkie zanim pójdziemy do Piotra.

---

### [21:54] Mat
w OM widze taki selektor na gorze Tier i organisations, moze to by pozwoliło na zmiane kontekstu i rozwiazanie tego problemu?

**[21:54] Claude:**
Tak! OM ma organization switcher w topbar — User może mieć dostęp do wielu organizacji. PM jako superadmin lub z listą visible organizations mógłby:

- Przełączyć się na org agencji → widzi ich CRM read-only (jeśli jego rola w tej org jest read-only)
- Wrócić do OM HQ → widzi dashboard z agregatami

Ale sprawdźmy co platforma faktycznie daje.

---

**[21:54] Claude:**
Platforma ma to out of the box:

**`RoleAcl.organizationsJson`** — lista org do których rola ma dostęp. `null` = wszystkie organizacje.

**`UserAcl.organizationsJson`** — per-user override.

Więc rozwiązanie:

| Persona | Rola | `organizationsJson` | `featuresJson` | Efekt |
|---------|------|---------------------|----------------|-------|
| **PM** | `partnership_manager` | `null` (wszystkie org) | `partnerships.*`, `customers.*.view` | Widzi CRM wszystkich agencji **read-only**, przełącza org switcherem |
| **Agency Admin** | `partner_admin` | `["agency-org-uuid"]` (tylko swoja) | `partnerships.*`, `customers.*` | Full CRM w swojej org |
| **BD** | `partner_member` | `["agency-org-uuid"]` | `customers.*`, `partnerships.view`, `partnerships.rfp.*` | CRM + RFP w swojej org |
| **Contributor** | `partner_contributor` | `["agency-org-uuid"]` | `partnerships.kpi.view` | Tylko WIC + tier |

PM przełącza org w topbar → widzi CRM danej agencji → ale ma tylko `*.view` features na customers → read-only. Wraca do OM HQ org → widzi swój dashboard z agregatami.

**Zero nowego kodu.** To jest RBAC + org visibility + org switcher — platforma to ma.

To jest dokładnie ten typ insightu który Mat powinien łapać. Zapisuję jako finding do workflow gap matrix.

Jakie inne kwestie widzisz?

---

### [21:58] Mat
wazne aby admin mogl robic to co bdm agencji, ale bdm agencji nie to co admin (userzy), wanze aby bdm/admin wiedzieli co muszą zrobić aby WIP się zaliczył, bo to może nie być jasne dla nich, nie wystarczy dodac osobe/deal do CRMa, musi byc w okreslonym stage'gu ktory jest narzucony przez PRM. Coś prostego by sie przydalo np. jakas checklista na poziomie deala WIP checklist, ktora by pozwoliła jesli bdm/admin agencji je odhaczy aby zaliczyc WIP, a moze nawet nie na poziomie deal'a tylko company profile? mysle glosno. Moim celem jest aby to było wygodne, ale tez aby było spojne z tym jak powinno sie uzywac CRMow

**[21:58] Claude:**
Myślisz w dobrym kierunku. Rozłóżmy to:

**Problem:** BD dodaje deal do CRM ale nie wie czy to liczy się jako WIP. WIP wymaga konkretnego stage ("Sales Qualified Lead"). BD może dodać deal w stage "New" i myśleć że zrobił swoje.

**Twoja intuicja o checkliście jest dobra, ale deal vs company — to kluczowe pytanie.**

Popatrzmy co właściwie WIP mierzy wg tier requirements:

> "Log at least one **conversation with a new prospect** per month into the Open Mercato CRM"

To nie jest deal w stage SQL. To jest **zalogowana rozmowa z nowym prospektem**. Spec 053b zinterpretował to jako "deals in SQL stage" ale oryginalne wymaganie mówi o conversations.

To zmienia flow. Może WIP to:

1. BD dodaje **Company** (prospect) do CRM
2. BD loguje **Activity** (conversation) na tym company
3. System liczy: ile unikalnych companies z min. 1 activity w danym miesiącu = WIP

To jest bardziej spójne z CRM best practices — companies + activities, nie stages na deals. Deal to następny krok (kiedy prospect jest zainteresowany kupnem).

Ale wracając do twojego pytania o UX — niezależnie od modelu danych, BD musi wiedzieć co zrobić. Opcje:

**A) Checklista na Company profile** — custom fields: "First contact logged? ☑", "Qualification done? ☑", "WIP eligible? (auto-calculated)" — widget injection na company detail page

**B) Workflow na qualify prospect** — BD tworzy company → system startuje workflow "Qualify Prospect" → USER_TASK: "Log first conversation" → USER_TASK: "Confirm prospect is new" → aut

[...continued...]

---

### [21:59] Mat
mysle ze deal stage w pipeline to chyba taki CRM best practice?

**[21:59] Claude:**
Tak. Deal pipeline z stages to standard CRM (Salesforce, HubSpot, Pipedrive — wszyscy tak robią). Company to account, deal to opportunity na tym account, stage to gdzie jest w procesie sprzedaży.

Więc flow powinien być:

1. BD dodaje **Company** (prospect) do CRM
2. BD tworzy **Deal** na tym company
3. BD przesuwa deal przez stages: `New → Contacted → Qualified → SQL → Proposal → Won/Lost`
4. System liczy WIP = unikalne deals w stage `SQL` lub wyżej per org per miesiąc

I teraz pytanie — czy OM customers module ma pipeline stages?

---

**[22:00] Claude:**
OM ma to kompletnie:

- **`CustomerPipeline`** — named pipeline (np. "Partner Sales Pipeline")
- **`CustomerPipelineStage`** — stages w pipeline (New, Contacted, SQL, Proposal, Won)
- **`CustomerDeal`** — deal z `pipelineId`, `pipelineStageId`, `pipelineStage` (text)

Więc WIP flow to:

1. **seedDefaults** — tworzy pipeline "PRM Sales" z stages odpowiadającymi WIP requirements
2. **BD** tworzy deal w CRM → przypisuje do pipeline → przesuwa przez stages
3. **System** liczy: deals w stage `sql` lub wyżej per org per miesiąc = WIP

**Zero nowego kodu na pipeline/stages** — platforma ma. Potrzebny tylko:
- Seed pipeline + stages w `setup.ts` (~20 linii)
- WIP calculation job: `SELECT COUNT(DISTINCT id) FROM customer_deals WHERE pipeline_stage_id IN (sql_stage_id, ...) AND organization_id = :orgId AND created_at >= :periodStart` (~30 linii)

A co do UX — BD widzi deal detail page z pipeline stage selector (platforma ma UI do tego). Kiedy przesuwa deal do "SQL" → WIP się zalicza. Jasne, intuicyjne, CRM best practice.

Jakie jeszcze kwestie widzisz zanim pójdziemy do Piotra?

---

### [22:01] Mat
a czy OM wspiera jakis onboarding hints/workflow tips aby pomoc userom zrozumiec gdzie maja dawac rzeczy aby liczył się np. WIP?

**[22:01] Claude:**
OM ma kilka mechanizmów:

1. **`@open-mercato/onboarding`** — wizard framework ze step-based flow. Ale to jest dla tenant provisioning (initial setup), nie dla user guidance w runtime.

2. **`InjectionWizard`** — UMES widget z krokami, step indicators, form fields. Injektowalny na dowolną stronę. To jest bardziej obiecujące.

3. **`dashboards` module** — custom dashboard widgets. Można by zrobić "Getting Started" widget.

4. **`notifications` module** — in-app notifications. Można wysłać hint po pierwszym loginie.

Ale **nie ma** dedykowanego "tooltip tour" / "product hints" systemu jak Intercom, Pendo, czy Chameleon.

Natomiast — na potrzeby PRM example app nie trzeba budować systemu hints. Wystarczy:

**Dashboard widget "WIP Checklist"** — widget injection na partnerships dashboard:

```
✅ Add a Company (prospect) to CRM
✅ Create a Deal on that Company  
⬚ Move Deal to "Sales Qualified Lead" stage
→ Once in SQL stage, this deal counts as 1 WIP
```

To jest widget injection na `admin.page:partnerships:before` — UMES, zero modyfikacji core. Widget czyta dane z CRM (ma user deals w danym miesiącu?) i pokazuje progress. Jak example app pattern — idealny: "tak się robi onboarding hints na OM — widget injection + existing data."

Chcesz to dodać do workflow 2 (Pipeline Building) jako step, czy masz jeszcze inne kwestie?

---

### [22:02] Mat
jako onboarding workflow per admin/bdm user, kazdy powinien to przejsc

**[22:02] Claude:**
Rozumiem — to nie jest hint na dashboardzie. To jest **onboarding flow** który każdy nowy admin/BD musi przejść zanim zacznie normalnie pracować. Jak setup wizard po pierwszym loginie.

I OM ma na to **onboarding package** + **workflows module**:

**Opcja A: Onboarding package** — step-based wizard z GET/POST endpoints, persist state per user, ordered steps. Ale to jest designed for tenant provisioning, nie per-user onboarding.

**Opcja B: Workflows module** — USER_TASK per step, assignment do konkretnego usera, trackowanie completion. Workflow startuje automatycznie kiedy user jest stworzony (event trigger na `auth.users.created`). Każdy USER_TASK = jeden krok checklisy. Workflow jest complete kiedy user przeszedł wszystkie kroki.

Opcja B brzmi lepiej — bo:
- Workflow per user, nie per tenant
- Event trigger = automatycznie startuje kiedy nowy BD dołącza
- USER_TASK = BD musi coś zrobić (nie tylko przeczytać)
- PM widzi kto przeszedł onboarding a kto nie (workflow instance status)
- Różne workflow definitions dla admin vs BD (inne kroki)

Flow:

**Admin onboarding workflow:**
1. USER_TASK: Wypełnij profil firmy (services, industries, tech)
2. USER_TASK: Zaproś minimum 1 BD
3. USER_TASK: Zaproś minimum 1 Contributor
4. AUTOMATED: Mark org as "onboarded"

**BD onboarding workflow:**
1. USER_TASK: Dodaj pierwszą firmę (prospect) do CRM
2. USER_TASK: Stwórz deal na tej firmie
3. USER_TASK: Przesuń deal do stage "Contacted"
4. AUTOMATED: Mark user as "onboarded", send notificati

[...continued...]

---

**[22:03] Claude:**
Sub-flow workflow 1. Agency Onboarding nie kończy się kiedy Admin ustawia hasło — kończy się kiedy agencja jest operacyjna. Admin przeszedł swój onboarding, zaprosił BD, BD przeszedł swój onboarding, pierwszy WIP zalogowany.

Więc Workflow 1 powinien wyglądać tak:

**Journey:** PM zaprasza Agency Admin → Admin ustawia hasło → **Admin onboarding workflow startuje** (profil firmy → zaproś BD → zaproś Contributor) → BD dostaje konto → **BD onboarding workflow startuje** (dodaj prospect → stwórz deal → przesuń do Contacted) → agencja jest operacyjna

To jest jeden workflow z zagnieżdżonymi sub-workflows. I workflows module ma na to `SUB_WORKFLOW` step type — workflow w workflow.

Czyli 5 workflows, nie 6. Onboarding to Phase 1 workflow 1, nie osobny workflow. Boundary się nie zmienia: starts when PM zaprasza, ends when agencja jest operacyjna (min. 1 BD zalogował deal).

Coś jeszcze zanim Piotr?

---

### [22:05] Mat
no taki detal, w onboarding workflow jest tez wypelnij swoje case studies bo chcemy aby bdm/agency admin dodali swoje case studies aby to byly dane do naszego matchera, ktory potem bedziemy dodawac w kolejnej fazie (poza scope).

nie mamy tez dobrze rozpisanego workflow RFP, oraz worrkflow na WIC i MIN score, czyli kto updatetuje skad sie biora dane

**[22:06] Claude:**
Racja. Zbierzmy braki:

### Workflow 1: Agency Onboarding — brakuje case studies

Admin onboarding powinien mieć krok: "Dodaj min. 1 case study" — bo bez case studies matcher nie ma danych do RFP scoring.

Poprawiony admin onboarding sub-workflow:
1. Wypełnij profil firmy (services, industries, tech)
2. Dodaj min. 1 case study (project type, tech stack, budget, duration)
3. Zaproś min. 1 BD
4. Zaproś min. 1 Contributor

### Workflow 3: WIC — brakuje klarowności kto i jak

Obecny opis: "System Operator importuje WIC batch" — ale kto to jest? Jak? Skąd dane?

Pytanie do ciebie: **Jak WIC score trafia do systemu?**
- A) Core team ręcznie wpisuje score po review PR?
- B) Automatyczny batch z GitHub API (count merged PRs per user)?
- C) Zewnętrzny skrypt który analizuje PRs i generuje WIC score z wagami (level 1-4)?

### Workflow 4: RFP — brakuje detali

Obecny opis jest surface-level. Brakuje:
- Skąd lead przychodzi? (formularz na stronie OM? email? ręcznie PM wpisuje?)
- Co PM widzi kiedy ocenia responses? Jakie kryteria?
- Co znaczy "handoff"? Deal tworzony w CRM? Intro email do klienta?
- Jak matching score działa? (tier + vertical + case studies?)

### Workflow 5: Tier/MIN — brakuje MIN source

MIN = "Successfully sell and implement Open Mercato (including Enterprise License)." Ale:
- Kto rejestruje sprzedaż? PM? BD? System?
- Skąd system wie że license jest enterprise?
- Jak attribution do agencji działa?

Chcesz teraz doprecyzować te 4 braki? Albo powiedz mi co wiesz a czeg

[...continued...]

---

### [22:09] Mat
co do WIC to najlepiej jakby system sam go liczył, mamy do tego algorytm zrobiony i w sumie najlepiej jakby po prostu raz dziennie z automatu liczył, algorytm jest w /Users/maciejgren/Documents/SDRC Wic Assessment Guide i w pliku do niego dolaczonym, ale nie wiem jak to zaimplemenotwac bo ten algorytm wymaga uzycia LLMa, moze n8n? https://github.com/open-mercato/n8n-nodes mamy taki projekt, ale niew iem co Piotr na to

**[22:09] Claude:**
To są dwa osobne tematy — algorytm WIC i integracja n8n. Zanim pójdę do Piotra, zobaczę co mamy.

---

**[22:10] Claude:**
OK, teraz rozumiem WIC. To jest złożony algorytm który:
- Pobiera PRs z GitHub API per contributor
- Grupuje po `osoba + miesiąc + feature key`
- Scoring: L1-L4 z impact bonus i bounty multiplier
- **Wymaga LLM** do: auto-adjudication bounty matching, ownership analysis, quality assessment

To nie jest prosta query do bazy. To jest **pipeline**: GitHub API → grouping → LLM scoring → human checkpoint → result.

Teraz n8n:

---

**[22:10] Claude:**
n8n-nodes jest na GitHub (`open-mercato/n8n-nodes`), nie lokalnie. Ale zanim idziemy w technologię, zapiszmy findings:

---

## Braki do uzupełnienia w workflows

### Workflow 1: Agency Onboarding — dodać case studies
Admin onboarding sub-workflow:
1. Wypełnij profil firmy
2. **Dodaj min. 1 case study** ← nowe
3. Zaproś min. 1 BD
4. Zaproś min. 1 Contributor

### Workflow 3: WIC — pełny flow
Journey: GitHub PR merged → **daily scheduled job** → pobiera PRs z GitHub API per registered contributor → grupuje po (osoba, miesiąc, feature key) → LLM scoring (level 1-4, impact bonus, bounty matching) → **opcjonalny human checkpoint** (PM override) → WIC score zapisany w systemie → Contributor/BD/Admin widzi score

**Wymaga:**
- GitHub API integration (PRs, reviews, comments)
- GH username → User → org mapping
- LLM call (scoring, bounty adjudication)
- Human checkpoint (PM override)
- Scheduled daily run

**To jest poza scope example app PRM?** Albo to jest core value i musi być w POC?

### Workflow 4: RFP — pytania otwarte
- Skąd lead? Kto go wpisuje?
- Jakie kryteria matchingu? (tier + vertical + case studies?)
- Co znaczy handoff?

### Workflow 5: MIN — pytania otwarte
- Kto rejestruje sprzedaż enterprise license?
- Skąd system wie o license type?

---

Mam propozycję — WIC scoring z LLM to jest duży temat. RFP i MIN mają otwarte pytania biznesowe. Zamiast próbować odpowiedzieć na wszystko teraz, może:

1. **Zapiszemy te findings jako dokument** — workflow analysis z gaps i otwar

[...continued...]

---

### [22:10] Mat
ad 1 - tak, zrobmy to

**[22:13] Claude:**
Zapisane i pushnięte. Dokument jest w `docs/superpowers/specs/2026-03-19-prm-workflow-analysis.md`.

W następnej sesji kontynuujemy od:
1. Odpowiedzi na otwarte pytania (WIC impl, RFP source, MIN attribution)
2. Piotr checkpoint na workflow gap matrix
3. Phase 1 — user stories z success criteria
4. Phase 2 — mapping na platformę
5. Piotr checkpoint na user story gap matrix

---

**[22:13] Claude:**
Wszystko zapisane. Memory i dokument zaktualizowane. Gotowe do kontynuacji w następnej sesji.

---

