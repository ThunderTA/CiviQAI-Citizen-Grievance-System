# SIH26-S02 — AI Citizen Grievance System

Unified prototype for **AI-Based Citizen Grievance Classification, Prioritization
and Duplicate Complaint Detection**, merged from three source repositories.

```
                    ┌──────────────────────────┐
                    │  React portal  :5173     │
                    │  citizen + admin UI      │
                    └────────────┬─────────────┘
                                 │ REST
                    ┌────────────▼─────────────┐
                    │  Express API   :3000     │◄──── system of record
                    │  auth · votes · SLA      │
                    └───┬──────────────────┬───┘
        POST /analyze-  │                  │
        complaint       │                  │
                    ┌───▼──────────────┐  ┌▼──────────────┐
                    │ FastAPI  :8000   │  │ MongoDB :27017│
                    │ · classification │  │ grievances    │
                    │ · prioritisation │  └───────────────┘
                    │ · duplicates     │
                    │   (MiniLM+FAISS) │
                    └───┬──────────────┘
                        │
                  ┌─────▼──────┐
                  │ FAISS index│  (own volume — not in MongoDB)
                  └────────────┘
```

## Layout

| Path | Origin | Role |
|---|---|---|
| `sih-web-portal/` | [PRATYAKSH15/CitizenCare](https://github.com/PRATYAKSH15/CitizenCare) | React client + Express/MongoDB API. System of record. |
| `sih-ai-service/` | [RiteshKumar2e/customer-complaint-agent_new](https://github.com/RiteshKumar2e/customer-complaint-agent_new) (code reused, MIT) + [anshikaparikh/AI_Powered_Grievance_Redressal_System](https://github.com/anshikaparikh/AI_Powered_Grievance_Redressal_System) (approach only, no code — see **Licensing** below) | FastAPI triage + duplicate detection. Stateless apart from its vector index. |

`_upstream/` (the three original clones) and `sih-ai-service/vendor/faiss_reference/`
are **not part of this repository** — both are gitignored and exist only as a
local convenience if you clone the source projects yourself. See **Licensing**.

## Licensing

This project is MIT-licensed (`LICENSE`). It incorporates code from two other
MIT-licensed projects (PRATYAKSH15/CitizenCare and
RiteshKumar2e/customer-complaint-agent_new) — their required copyright and
permission notices are reproduced in full in `THIRD_PARTY_NOTICES.md`.

A third project, anshikaparikh/AI_Powered_Grievance_Redressal_System, carries
no license at all. No code from it is included in this repository — only its
general approach informed `app/sih/duplicate_detector.py`'s design, which is
an original implementation. See `THIRD_PARTY_NOTICES.md` for the detail.

## Quick start

### No Docker, no MongoDB install — just see it run

```bash
./demo.sh
```

Boots an in-memory MongoDB, the AI service, the API and the client, and seeds
sample grievances **through the real AI pipeline**. Then open
<http://localhost:5173/feed>.

Seeded accounts, all with password `demo12345`:

| Account | Signs in at | Can do |
|---|---|---|
| `citizen@demo.in` | `/sign-in` | File and track grievances |
| `meena@demo.in` | `/sign-in` | Same |
| `officer@gov.in` | `/official/sign-in` | Public Works Department · Karnataka: view, update status, add notes |
| `pwd.officer@gov.in` | `/official/sign-in` | Same scope |
| `admin@demo.in` | `/sign-in` | Owner console, dashboards, user management |

Registering at `/sign-up` walks the Aadhaar verification step. The in-memory
database is wiped when you stop the script.

### Docker (everything at once)

```bash
docker compose up --build
```

### Local

```bash
./start.sh --setup     # first run: creates the venv, installs deps
./start.sh             # subsequent runs
./start.sh --no-llm    # deterministic rule engine only (fully offline)
```

Needs MongoDB on `localhost:27017`:

```bash
docker run -d -p 27017:27017 --name sih-mongo mongo:7
```

On macOS, a persistent local MongoDB service can be installed and started with
Homebrew instead. It survives terminal closes and machine restarts:

```bash
brew tap mongodb/brew
brew install mongodb-community@8.0
brew services start mongodb-community@8.0
```

The server's default `MONGODB_URI=mongodb://localhost:27017/citizencare`
already targets this database. Seed its persistent demo data once with:

```bash
cd sih-web-portal/server
node seedDemo.js --reset
```

To show the stored records during a presentation, connect with either
MongoDB Compass using `mongodb://localhost:27017/citizencare`, or the bundled
shell:

```bash
mongosh mongodb://localhost:27017/citizencare
show collections
db.issues.find({}, { title: 1, department: 1, state: 1, status: 1 }).limit(20)
db.users.find({}, { name: 1, email: 1, role: 1, department: 1, region: 1 })
```

No third-party auth service is required — see **Authentication** below.

Then: portal `:5173` · API `:3000/api/health` · AI docs `:8000/docs` · engine
status `:8000/ai-health`.

### Tests

```bash
cd sih-ai-service
.venv/bin/python tests/test_pipeline.py      # 51 checks — AI pipeline
.venv/bin/python tools/eval_thresholds.py    # duplicate threshold measurement
.venv/bin/python tools/eval_categories.py --both --stress   # category accuracy (DEV+HOLDOUT+adversarial)
.venv/bin/python tools/export_taxonomy.py --check           # is the snapshot Node reads still current?

cd ../sih-web-portal/server                  # these need the stack running
node tests/permissions.test.mjs              # 25 checks — role boundaries
node tests/aadhaar.test.mjs                  # 25 checks — Aadhaar privacy
node tests/passwordReset.test.mjs            # 22 checks — reset & session revocation
node tests/escalation.unit.test.mjs          # 38 checks — escalation rules, no stack needed
node tests/escalation.test.mjs               # 77 checks — repeat reports, folding, tracking
```

238 pass/fail checks in total, plus the category accuracy measurement above
(100% on 210 labelled examples across DEV+HOLDOUT as of writing — see
**Categories** below for what that number does and doesn't mean).

`escalation.test.mjs` runs against your real database, so it is built to be
harmless: throwaway accounts, coordinates in a remote part of the country that
cannot match a real complaint, and a `finally` block that removes everything —
including the vector-index entries — and then asserts the index is back to its
original size. The other suites that write (`permissions`, `aadhaar`,
`passwordReset`) are best pointed at a scratch database if it holds real data:
`permissions` advances a real grievance's status.

Stage a live demonstration of the feature with
`node scripts/demoRepeatReports.mjs up` (and remove it with `... down`).

The suite covers routing, priority scoring, duplicate detection, the geo gate,
and the LLM validation layer. All of it runs on the deterministic path, so it
needs no API key and is reproducible.

`seed_demo.py` matters before a demo: against an empty index every complaint is
trivially "not a duplicate", which looks like the feature is broken.

## The unified endpoint

`POST http://localhost:8000/analyze-complaint`

```json
{ "title": "…", "description": "…", "latitude": 12.97, "longitude": 77.59 }
```

```json
{
  "department": "Public Safety Department",
  "priority_score": 5,
  "urgency_level": "Critical",
  "is_duplicate": false,
  "matched_complaint_id": null,

  "category": "Public Safety",
  "portal_priority": "high",
  "sentiment": "negative",
  "summary": "…",
  "reasoning": "Rule signals: live wire, children, school",
  "sla_hours": 24,
  "similarity_score": 0.0,
  "match_rule": null,
  "similar_complaints": [],
  "analysis_source": "rules"
}
```

The first five fields are the problem-statement contract; the rest is
supporting detail the portal and admin console use.

Also exposed: `POST /index-complaint`, `POST /index-complaints/bulk`,
`DELETE /index-complaint/{id}`, `GET /ai-health`.

## How the merge was done

### Classification and prioritisation

The upstream agent classified into a **customer-support** taxonomy (Billing,
Technical, Delivery, Service, Security), which is meaningless for a municipal
portal. Its *architecture* was kept — layered deterministic-then-LLM analysis,
its Groq/Gemini client with multi-key rotation and model fallback — and the
taxonomy was replaced with **21 civic categories across 13 ULB departments** in
`app/sih/taxonomy.py`. The upstream `async_ask_ai` is imported, not
reimplemented.

The layers:

1. **Keyword rules** — instant, always run, always produce an answer.
2. **LLM** — nuance the rules miss, hard-bounded by `LLM_TIMEOUT_SECONDS`.
3. **Validation** — the model's answer is reconciled against layer 1.

Layer 3 is not a formality. A model will invent a department that does not
exist, or rate a snapped conductor "Routine". Unknown departments are
discarded, `urgency_level` is *derived* from the score rather than trusted, and
the score is the **max** of the rule and model values — under-triaging a
live-wire report costs far more than over-triaging a pothole.

### Categories

| Category | Department |
|---|---|
| Pothole, Road Damage | Public Works Department |
| Traffic & Signals, Public Transport | Traffic & Transport Department |
| Water Supply | Water Supply Department |
| Sewage, Flooding & Waterlogging | Sewerage & Drainage Department |
| Waste Management, Public Toilets | Sanitation Department |
| Street Light, Power Supply | Electricity Department |
| Public Safety | Public Safety Department |
| Stray Animals | Veterinary & Animal Control Department |
| Public Health | Public Health Department |
| Air & Water Pollution, Noise Pollution | Pollution Control Department |
| Parks & Recreation | Parks & Horticulture Department |
| Encroachment & Illegal Construction | Town Planning & Enforcement Department |
| Public Buildings & Amenities | Public Works Department |
| Government Services, **Other** | General Administration |

**"Other" is a real category, not an error state.** A complaint that fits
nothing above is filed there rather than forced into the nearest match. This
matters more than it sounds: an official only sees their own department's
queue, so a wrong department *hides* a complaint from the people who could act
on it, while "Other" still has an owner (General Administration) who can
triage it by hand. Every design choice below optimises for this — a fallback
is a safe miss, a misroute is not.

The rules use a small weighted mini-language (`app/sih/taxonomy.py`, see the
comment above `CATEGORY_KEYWORDS`): plain words, `word*` prefixes, `a ~ b`
proximity pairs, and a leading `?` for a weak/corroborating-only signal. A
category needs a minimum score **and** at least one strong (non-corroborating)
match to win — a single generic word can never carry a category on its own.
Two more refinements came directly out of measurement, not intuition:

- **Locative demotion.** "near the bus stop" describes *where* a problem is,
  not *what* it is; a match immediately after "near / beside / outside / ..."
  is worth half. Without this, "pothole near the bus stop" and "bus fare
  complaint" would both look like Public Transport.
- **Non-grievance penalty.** Politeness and adverts ("thank you", "for
  sale") subtract points, so a stray keyword in "garden furniture for sale"
  falls back to Other instead of being read as a Parks complaint.

A narrow `OVERRIDING_HAZARDS` list still lets a genuine danger (a live wire, a
gas leak, an open manhole) win outright regardless of what infrastructure it
sits on, exactly as before.

**Measured, not eyeballed.** `sih-ai-service/tools/`:

| Tool | What it checks |
|---|---|
| `eval_categories.py` | Accuracy against 210 hand-labelled citizen complaints, split into a tuning set (`DEV`) and one never used while tuning (`HOLDOUT`) — `--both` runs both, `--stress` runs a separate adversarial set (typos, Hinglish, sarcasm, "false friends" like "parking space" or "the bench of the court") that exists to catch overfitting to the labelled examples. |
| `export_taxonomy.py` | Writes the snapshot the Node API falls back on; `--check` fails if it has gone stale relative to `taxonomy.py`. |

Current numbers: **100% on DEV and HOLDOUT** (0 misroutes, 0 forced fits), and
100% on the adversarial set once its failures were fixed — treat that last
number as a regression check, not a generalisation claim, since the rules
were iterated against it.

Two alternatives were tried and rejected on evidence, not intuition, using the
same held-out methodology: a semantic layer (cosine similarity against
category prototype sentences, using the embedding model duplicate detection
already loads) and a k-nearest-neighbours classifier over the labelled set.
Both were tuned by grid search over a floor/margin threshold and measured by
leave-one-out cross-validation; both landed worse than the rules alone at every
setting that kept a zero false-fit rate. The result is not "embeddings don't
work here" — it's that 210 examples is too little data to beat well-targeted
rules, and neither survives in the code.

### Categories, one source of truth

`GET /taxonomy` (AI service) and `GET /api/issues/taxonomy` (Node, proxying
it) are now the *only* place categories and departments are read from.
Before this, six files each kept a hand-typed copy, and they had drifted:
the admin dashboard's "Assign Department" dropdown offered `'Public Works'`
and `'Police'` — matching nothing an official's account could actually be
assigned — and `UserManagement.jsx` was missing the four newest departments
outright. The client's `src/lib/taxonomy.js` fetches once per tab and is used
everywhere a category or department list appears: the admin filters, the
department-assignment dropdowns (now a `<select>` with only real
options, and a `<datalist>` on the owner's official-creation form so a typo
gets corrected rather than silently creating an unreachable queue), and the
landing page's category strip. The Node route caches the AI service's answer
for 5 minutes and falls back to a committed JSON snapshot
(`sih-web-portal/server/config/taxonomy.json`) if the AI service is
unreachable, so the portal's dropdowns never come back empty.

### Duplicate detection

`app/sih/duplicate_detector.py` ports the SentenceTransformers + FAISS approach
from `qna_faiss.py`, with three changes the original could not support as a
duplicate detector:

| Upstream | Here | Why |
|---|---|---|
| `IndexFlatL2` | `IndexFlatIP` over L2-normalised vectors | Inner product on unit vectors *is* cosine similarity. L2 distance is unbounded and cannot be compared to a 0.85 threshold. |
| Built once at import from a CSV | Incremental, persisted to disk | The CSV is not in the repo, and grievances arrive one at a time. |
| Text only | Geo-aware | Two identical pothole reports 40km apart are two potholes. |

The upstream file is a Q&A chatbot over a corpus, not a duplicate detector, and
depends on data and model directories that are not committed. Only the
*approach* was carried over — `duplicate_detector.py` is an original
implementation, not a modified copy. The upstream repo itself carries no
license, so its code is **not included in this repository**; it stays in a
local, gitignored copy (`sih-ai-service/vendor/faiss_reference/`, populated by
cloning `anshikaparikh/AI_Powered_Grievance_Redressal_System` yourself) for
anyone who wants to compare the two side by side.

### Node bridge

`sih-web-portal/server/services/aiServiceClient.js` calls the AI service; the
submission route in `routes/issues.js` uses it. Two analyses run in parallel via
`Promise.allSettled` — the Python service does text triage and duplicates, the
existing Groq vision pass inspects the photo. Neither can fail the submission.

Indexing happens **after** the MongoDB write, deliberately: the vector store
must only hold ids that exist, or `matched_complaint_id` could point at a
document that was never created.

A detected duplicate is still saved — the citizen gets a tracking id, and the
original gains an upvote, which is the honest signal of how many people an issue
affects. Dropping it silently would lose both.

## Authentication

The portal originally required **Clerk**, a hosted auth service: `main.jsx`
threw without a publishable key and every write sat behind
`ClerkExpressRequireAuth`. That made the project impossible to run, demo or
grade without signing up for a third party. It was replaced with self-contained
email/password auth.

**Server** — `middleware/auth.js`, `routes/auth.js`
- bcrypt hashing (cost 12); `passwordHash` is `select: false`, so it cannot
  leak through an unrelated `User.find()`.
- Stateless JWTs. `req.auth` keeps the shape the routes already read, so route
  code barely changed.
- Login returns one message for both a bad password and an unknown email —
  distinguishing them hands out a list of registered addresses.
- `admin` comes from `ADMIN_EMAILS` at request time and is never stored or
  grantable through the API, so an admin cannot silently promote anyone, and
  revoking an address takes effect without waiting for token expiry.
- Refuses to start in production on the fallback signing key.

**Client** — `src/lib/auth.jsx`

A drop-in replacement exporting Clerk's names (`useAuth`, `useUser`,
`SignedIn`, `SignedOut`, `UserButton`), so the fourteen files written against
Clerk kept working with only their import path changed. Sessions live in
`localStorage` behind try/catch, and are re-validated against `/auth/me` on
boot rather than trusted.

Endpoints: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`,
`PATCH /api/auth/me`, `POST /api/auth/change-password`, plus the admin-only
`GET/PATCH /api/auth/users`.

## Repeat reports raise priority

When several *different people* report the same problem nearby, the grievance's
priority score rises, its SLA tightens, and the reports fold into one card — so
an official sees one urgent problem instead of five identical rows.

| People who reported it | Score change |
|---|---|
| 1 | none |
| 2–4 | +1 |
| 5–9 | +2 |
| 10+ | +3 (capped at 5) |

Tunable with `ESCALATION_STEPS` (default `2:1,5:2,10:3`).

**The rules are deliberately conservative.**

- **Only distinct people count.** One citizen filing the same complaint three
  times is one voice; counting them would make the queue gameable. The original
  reporter re-filing does not count either.
- **The score only ever goes up from this rule**, and never past 5. The AI's own
  score is kept (`aiTriage.baseScore`) and every raise is recorded in
  `priorityHistory` with its reason, so a number never moves unexplained.
- **The SLA can only get tighter.** The new window starts from the moment of
  escalation, not from filing — otherwise an old grievance would be marked
  breached the instant a fresh report arrived. The deadline is the *earlier* of
  the old one and the new one.
- **A manual priority set by the owner is respected** (`priorityLocked`); an
  automatic rule does not silently overwrite a human decision.
- **Upvotes do not count.** They cost one click, and a duplicate report already
  adds an upvote — counting both would score one person twice.
- **Resolved grievances are not escalated, and are not merged into.** A problem
  reported again after being fixed has come back; filing it as a duplicate of a
  closed ticket would bury it. It is filed fresh.

**Things that would have broken this, found while building it:**

- *Duplicate chains.* Every saved report — duplicates included — is indexed for
  similarity, so a third report can match the second instead of the original.
  Linking it there would leave it invisible to any count taken on the original.
  Matches are walked back to their root before linking.
- *Bulk delete never cleaned the vector index*, leaving ghost embeddings that
  kept matching new complaints against issues that no longer existed.
- *Folding hides rows, so they must stay in sync.* Staff never see merged
  reports, so nobody would ever advance them. Status changes on the original —
  with the note, and who made them — are copied onto every merged report, and
  each person is notified. Deleting an original un-merges its reports rather
  than orphaning them behind a parent that no longer exists.

**Where you see it.** Feed and staff views list each problem once with
"+N similar reports" and a "Raised to High" chip; the Official Console and admin
dashboard sort by urgency (highest score, then soonest deadline) instead of
filing date, with `?sort=newest` to restore the old order; the admin dashboard
can show the repeat reports as rows again (`?includeDuplicates=true`).
Headline counts count problems, not reports.

**Citizen tracking.** *My Issues* opens on "where things stand" — status, who is
handling it (name, title and department, recorded when the official acts), how
many people reported it — followed by the full trail, newest first: reported,
routed, matched, priority raised and why, each official action with its note. A
report merged into another shows the shared grievance's priority and deadline,
not its own stale copy.

**Existing data.** Reports filed before this feature were never counted:

```bash
cd sih-web-portal/server
node scripts/recomputeEscalations.mjs            # preview — writes nothing
node scripts/recomputeEscalations.mjs --apply    # apply it
```

The same is available to the owner as `POST /api/issues/recompute-priorities`
(`?dryRun=true` to preview). It also repairs chained duplicates and releases
duplicates whose original was deleted. Idempotent, and only ever raises a score.

## Password reset

`/forgot-password` → emailed link → `/reset-password?token=…`.

- **The endpoint cannot be used to discover who has an account.** A registered
  address, an unknown one, and a malformed one all get the same 200 and the
  same sentence. Anything else turns it into a membership oracle for a citizen
  database.
- **Only a SHA-256 hash of the token is stored**, for the same reason the
  password is hashed: a leaked database must not hand out working links. No
  HMAC secret is needed — the token is 256 bits of CSPRNG output, so unlike a
  password it is not brute-forceable.
- **One hour, one use.** The stored hash is cleared on success.
- **A reset ends every other session.** The token carries a `pwd` claim — the
  millisecond stamp of the account's last password change — compared exactly on
  every request. If someone else knew the old password, resetting logs them
  out. `POST /auth/change-password` does the same.

  The obvious approach, comparing the JWT's `iat` against `passwordChangedAt`,
  has a real hole: `iat` has one-second resolution, so a token minted in the
  same second as the reset is indistinguishable from one minted just before it
  and survives. That was reproducible. The millisecond stamp closes it exactly.

- The freshness check **fails closed**: if the lookup errors, the request gets
  a 503 rather than being waved through. Failing open would mean a database
  blip silently restores every session the reset existed to kill.

**Rate limiting** (`middleware/rateLimit.js`), which the earlier build lacked:

| Endpoint | Limit | Keyed by |
|---|---|---|
| `/auth/login` | 10 / 15 min | IP + email |
| `/auth/forgot-password` | 5 / 15 min | IP + email |
| `/auth/register` | 10 / hour | IP |
| `/auth/reset-password*` | 10 / 15 min | **token**, with a 100/15 min IP backstop |

The reset endpoints are keyed per *token* deliberately. The property worth
enforcing is "you cannot grind at one reset link"; keying by IP instead would
let one noisy client lock out an entire office behind a shared NAT while doing
nothing extra against an attacker with many addresses.

In-memory, so it is per-process. Behind more than one instance, move the
counter to Redis or the limit is N times looser than it reads.

## Aadhaar verification

> **This is a simulated check, not UIDAI e-KYC.** Real Aadhaar authentication
> requires being a licensed AUA/KUA with a UIDAI contract, licence keys, an HSM
> and a certified OTP or biometric channel — none of which can be stubbed. What
> this does is validate the number's **Verhoeff check digit**, the same
> algorithm UIDAI uses, and run an OTP round trip through a mock channel. It
> catches typos and invented numbers. It does **not** prove the number belongs
> to the person entering it. The sign-up screen says so in as many words.

The privacy design is production-shaped even though the verification is not:

- The number exists in memory for one request and is **never** written to
  MongoDB, a log line, or an error message — not raw, not hashed, not truncated.
- The OTP session is keyed by a random UUID, never by anything derived from the
  number, so the store cannot be walked back into a list of Aadhaar numbers.
- Success mints a 10-minute token whose entire payload is
  `{purpose: "aadhaar_verified"}` — no identifier at all.
- The user document records exactly two things: `aadhaarVerified` and
  `aadhaarVerifiedAt`.

`node tests/aadhaar.test.mjs` asserts all of this, including scanning every
MongoDB collection for the number after a full registration.

**The tradeoff of storing nothing:** there is no way to stop one Aadhaar from
registering many accounts. Deduplicating would mean storing a keyed HMAC of the
number — but a 12-digit space is only 10¹², brute-forceable if the database and
pepper ever leak together. Given the explicit requirement not to store it, this
build accepts duplicate registrations. Revisit only with a pepper held outside
the database, in an HSM or KMS.

Set `REQUIRE_AADHAAR=false` to skip the step in development.

## Roles and what each may do

| | Citizen | Official | Dept admin | Owner |
|---|---|---|---|---|
| File a grievance | ✅ | — | — | — |
| Read the public feed and map | ✅ | ✅ | ✅ | ✅ |
| Read grievances | — | own department + region | own department + region | ✅ |
| Update status, add a note | — | own department + region | own department + region | ✅ |
| Upload resolution proof | — | own department + region | own department + region | ✅ |
| Edit title, description, category | — | ❌ | ❌ | ✅ |
| Change priority or department | — | ❌ | ❌ | ✅ |
| Delete a grievance | own only | ❌ | ❌ | ✅ |
| Provision official accounts | — | ❌ | ❌ | ✅ |

**Officials can advance a grievance in their assigned department and region but never rewrite it.** A public record of
what citizens reported must not be editable or erasable by the body being
complained about. Enforced in `routes/issues.js` with an explicit field
whitelist and in `middleware/auth.js` with `denyOfficialDeletion` — on the
server, because a hidden button is not a permission. `node
tests/permissions.test.mjs` runs 25 checks against the live API, including
verifying the grievance is byte-for-byte unchanged after every blocked attempt.

Officials are **provisioned by the owner**, never self-registered: anyone who
could sign themselves up as an official could mark grievances resolved without
doing anything. `admin` is not grantable through the API at all — it comes from
`ADMIN_EMAILS` and is re-derived on every request.

Status changes are attributed (`statusHistory.changedBy` / `changedByRole`), so
a citizen can see which office moved their grievance.

## The three consoles

| Route | Who | For |
|---|---|---|
| `/official` | official, dept admin | Work the queue: read, note, advance status. No edit or delete affordance anywhere. |
| `/owner` | owner | Operate the system: are the AI engines live, who holds official access, where the backlog sits, what duplicate detection collapsed. |
| `/dashboard` | owner | The existing issue dashboard — bulk actions, full edit. |

## Navigation

`components/Sidebar.jsx` + `components/AppShell.jsx` replace the old top
navbar: a fixed sidebar from `lg` up, a drawer below it, grouped into
**Community** / **My Grievances** / **Administration**. Each entry declares who
may see it, so the sidebar never advertises a page the user would be bounced
off, and `ProtectedRoute` enforces the same rule at the route.

## Design decisions worth knowing

**Duplicate thresholds are measured, not guessed.** The problem statement
specifies cosine > 0.85, which is kept as the bar for a text-only match. But on
MiniLM, citizens rewording the same grievance land well below it. Running
`tools/eval_thresholds.py` over a labelled sample:

| | n | min | max | mean |
|---|---|---|---|---|
| True duplicates | 7 | 0.684 | 0.897 | 0.779 |
| Different grievances, same location | 5 | 0.349 | 0.636 | 0.448 |

| threshold | recall | false merges |
|---|---|---|
| 0.85 (spec) | 29% | 0/5 |
| 0.75 | 57% | 0/5 |
| **0.68** | **100%** | **0/5** |
| 0.60 | 100% | 1/5 |

So when two reports are within 100m — where co-location is independent
corroborating evidence — the text bar drops to **0.68**. That catches every
true duplicate in the sample with no false merges; the 0.75 first guessed here
dropped 43% of them. The separating gap (0.636 → 0.684) is real but narrow, so
re-run the script against your own corpus before changing it. Every match
reports which rule fired (`match_rule`: `text` or `text+proximity`), so merges
stay auditable.

**The geo gate.** Beyond 500m, no text similarity makes two reports the same
grievance. Verified: identical text 38km apart scores 1.0 and is still not a
duplicate.

**Hazard routing overrides infrastructure.** "An electric wire snapped and hangs
over the footpath" was routing to Public Works, because *footpath* matched
before any safety keyword. A narrow list of unambiguous hazards (`live wire`,
`gas leak`, `open manhole`, …) now decides routing outright. Generic modifiers
(`unsafe`, `hazard`, `dangerous`) deliberately did **not** get that power — "the
garbage dump is a health hazard" is a Sanitation complaint. Both directions are
locked by tests.

**Degradation is explicit, never silent.** Missing API keys → rule engine.
Missing `sentence-transformers` → hashing encoder. Missing `faiss` → NumPy
brute force. AI service unreachable → the complaint still saves, with
`aiTriage.serviceStatus` recording why. `GET /ai-health` reports which engines
are actually live, so a demo can never claim semantic matching it is not doing.

## New MongoDB fields

Added to `Issue` (`sih-web-portal/server/models/Issue.js`):
`priorityScore` (1–5), `urgencyLevel`, `isDuplicate`, `matchedComplaintId`,
`similarityScore`, `matchedDistanceMeters`, `similarComplaints[]`, and
`aiTriage{reasoning, source, serviceStatus, analyzedAt}`.

The existing `priority` (low/medium/high) is untouched, so the current UI and
SLA engine keep working unchanged.

## New admin endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/issues/ai-status` | Is the AI service live, on which engines |
| `POST /api/issues/ai-reindex` | Rebuild the vector index from MongoDB |
| `GET /api/issues/duplicates` | Duplicate clusters — "1 issue, 6 reports" |

`ai-reindex` matters because the index lives outside MongoDB: after restoring a
database, or on first run against an existing corpus, it must be replayed.

## Known limitations

- **Duplicate recall is bounded by the embedding model.** Code-switched Indian
  English ("sabzi mandi" vs "vegetable market") scores ~0.72 and is missed even
  by the relaxed rule. Fix is a multilingual model — set `EMBEDDING_MODEL` to
  e.g. `paraphrase-multilingual-MiniLM-L12-v2`; no code change needed.
- **`IndexFlatIP` is exact but linear.** Fine to ~100k grievances; beyond that
  switch to `IndexIVFFlat`.
- **The vector index is a separate durable store.** It is not in MongoDB, so it
  needs its own backup, and `ai-reindex` after any restore.
- **`docker compose` is unvalidated at runtime** — Docker was not installed on
  the build machine. The YAML is structurally valid and the service/env wiring
  was verified by hand.
- **Upstream `google-generativeai` is deprecated** and warns on import. It still
  works; migrating to `google-genai` is a follow-up.
- **No email verification at registration.** The address is trusted as given,
  so someone can register with an address they do not own. Password reset does
  prove control of the address, but only after the fact.
- **Email delivery is unconfigured by default.** Without `EMAIL_USER` /
  `EMAIL_PASS`, reset links are returned in the API response outside production
  instead of being sent. The server prints a startup banner listing this and
  the other `NODE_ENV`-gated conveniences, because deploying without
  `NODE_ENV=production` would silently leave them on.
- **Repeat-report counting trusts the duplicate detector.** If two different
  problems are worded alike near the same spot they will be merged and
  escalated together; if the same problem is described very differently it will
  not be. The thresholds are in `tools/eval_thresholds.py`'s territory.
- **Deleting a repeat report does not lower an escalated score.** The score is
  monotonic by design, so a withdrawn report does not undo a raise.
- **Rate limiting is in-memory**, so it is per-process and resets on restart.
  Redis is needed behind more than one instance.
- **The category rules are hand-tuned against 262 labelled examples**, which is
  a real evaluation but not a large one. `eval_categories.py --stress` was
  fixed to 100%, so it is a regression check now, not evidence of
  generalisation — extend `category_eval_data.py` / `category_eval_stress.py`
  with real production complaints as they arrive rather than trusting the
  current number to hold. Vocabulary in languages other than English/Hinglish
  romanised text (e.g. Devanagari or other scripts) was not tested at all.
- **The taxonomy snapshot can silently drift** if someone edits
  `taxonomy.py` and forgets `tools/export_taxonomy.py`. `--check` catches it,
  but nothing runs that check automatically yet — worth wiring into whatever
  CI or pre-commit hook this project eventually gets.
- The legacy `sih-ai-service/app/main.py` (the full customer-complaint-agent
  stack with its own SQL database, auth and email) is left intact but unused —
  MongoDB is the single system of record.
