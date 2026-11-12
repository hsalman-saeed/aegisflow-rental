> **MANDATORY COMPLIANCE DISCLOSURE:** AegisFlow Rental is built on the **PayPal Braintree Sandbox** (`sandbox.braintreegateway.com` — utilizing PayPal, Venmo, Security Deposit Holds, Partial Settlement, and Automated Dispute Representment APIs per Official Rules Section 4, confirmed in writing by Hackathon Judge Eddie Jaoude & Organizer Janet on Discord).

# AegisFlow Rental — Deposit-to-Dispute Operational & Financial Cockpit

**AegisFlow Rental** is a production-grade rental escrow, equipment inspection, fleet scheduling, chargeback defense, and relational BI platform built for independent cinema and AV rental houses (*Northside AV & Cinema Rentals*).

Independent camera, lighting, and audio rental yards routinely lose thousands of dollars per quarter to unrecovered missing/damaged accessories, manual deposit releases, double-booked repair turnarounds, and lost chargeback disputes. **AegisFlow Rental** closes the entire **6-Step Operational & Financial Loop** in under 45 seconds using live **PayPal Braintree Sandbox**, **AWS Bedrock Amazon Nova**, **Channel3**, **Bryntum Scheduler**, **AG Studio 3.1**, **Upstash Redis**, and **OpenAPI 3.1 / Postman**.

---

## The 6-Step Closed Hero Loop

| Step | Operational Milestone | UI Surface | Backend Route(s) | Live Verification |
| :---: | :--- | :--- | :--- | :--- |
| **1A** | **$1,500.00 Security Deposit Hold & Dispatch** (`BK-9021` Sony FX6 Unit #1) | `SURF-02`, `SURF-03` | `POST /api/braintree/hold`, `POST /api/bookings/dispatch` | Braintree Sandbox Auth-Only Hold (`submitForSettlement: false`, e.g. `qw33m189`) unlocks yard dispatch |
| **1B** | **$2,000.00 Processor Decline Gate** (`BK-9022` Aputure 600d) | `SURF-02`, `SURF-03` | `POST /api/braintree/hold`, `POST /api/bookings/dispatch` | Braintree `2000: Do Not Honor` hard-blocks dispatch (`HTTP 409`) |
| **2** | **Multimodal Return Inspection & Yard Sign-Off** | `SURF-04` | `POST /api/inspection/analyze`, `POST /api/inspection/confirm` | Amazon Nova Pro/Lite detects missing SDXC card & damaged Rode NTG5 mic + mandatory Yard Manager sign-off |
| **3** | **Live Retail Replacement Price Proof** | `SURF-05` | `POST /api/channel3/price-check`, `POST /api/channel3/lock-price` | Live Channel3 lookup locks `$53.80` (`newegg.com`) & `$639.00` (`bhphotovideo.com`) with retail URLs |
| **4** | **Deterministic `$100.00` Policy Gate & Partial Settlement** | `SURF-06` | `POST /api/braintree/settle-partial` | `<= $100.00` auto-captures (`81jjpdgy`); `> $100.00` pauses on Human Approval Card before capture (`5mprfbw1`) |
| **5** | **48h Maintenance Quarantine & Fleet Conflict Reassignment** | `SURF-02`, `SURF-07` | `POST /api/scheduler/maintenance-and-conflict`, `POST /api/scheduler/reassign` | Inserts 48h block on Unit #1, flags colliding `BK-9024`, reassigns to *Sony FX6 Backup Unit #2* |
| **6** | **Chargeback Defense & 6-Table Relational BI** | `SURF-08`, `SURF-09` | `POST /api/braintree/dispute/*`, `POST /api/ai/nova-stream` | Opens `venmo_6201` dispute (`tw33njjs2kdk8g8t`), drafts grounded Nova brief (`BR-040`), wins in Sandbox + updates AG Studio (`100%` recovery) |

---

## Official Sponsor Bounty Deep-Dive

1. **PayPal / Braintree Integration (Core Requirement):**
   - Uses `braintree` Node SDK against `sandbox.braintreegateway.com` (`src/lib/braintree/client.ts`).
   - Exercises **Auth-Only Holds** (`submitForSettlement: false`), **Processor Decline Dispatch Gates** (`2000: Do Not Honor`), deterministic **`$100.00` Policy-Gated Partial Settlement** (`submitForPartialSettlement` with `finalCapture: true` on Venmo/PayPal holds and documented `AUDIT-COND-001` vaulted child capture fallback), and **Automated Dispute Representment** (`dispute.addTextEvidence` + `dispute.finalize` with transparent `"compelling_evidence"` sandbox sentinel disclosure).
2. **Best Use of AG Grid / AG Studio 3.1 ($10,000 Bounty):**
   - `SURF-09` (`src/components/studio/AgStudioWorkspace.tsx`, `AgStudioInner.tsx`) mounts `ag-studio@3.1.0` & `ag-studio-react@3.1.0` over **6 normalized relational tables** (`customers`, `assets`, `bookings`, `transactions`, `inspections`, `disputes`) with foreign-key relationships (`src/lib/ag-studio/data-sources.ts`).
   - Features Dark Cinema `studioTheme.withParams`, custom 5-card `DepositHealthWidget` (`FR-071`), custom `AgLlmAdapter` (`directLlmRunner`) streaming live from AWS Bedrock Amazon Nova (`FR-072`), and read-only `check_dispute_evidence_readiness` tool (`FR-073`).
3. **Best Use of Bryntum Scheduler ($3,000 Bounty):**
   - `SURF-02` (`src/components/scheduler/FleetScheduler.tsx`, `BryntumTimelineInner.tsx`) embeds `@bryntum/scheduler-react@7.3.8` (`stockholm-dark.css`) with non-color-only accessible event badges (`[⚠ HOLD FAILED — DISPATCH BLOCKED]`, `[⇄ REASSIGNED TO BACKUP UNIT]`, `[🎬 DISPATCHED / IN FIELD]`), hold-gated dispatch locking, 48-hour maintenance quarantine blocks, overlap conflict detection, and 1-click backup reassignment.
4. **Best Use of Channel3 ($1,500 Bounty):**
   - Live `POST https://api.trychannel3.com/v1/search` integration (`src/lib/channel3/client.ts`) retrieving real retail replacement prices and merchant proof URLs (`newegg.com`, `bhphotovideo.com`) that govern exact integer-cent partial captures and anchor representment packets.
5. **Best Use of APIMatic ($3,000 Bounty):**
   - Complete **OpenAPI 3.1.0** specification ([`docs/openapi.yaml`](docs/openapi.yaml)) and **Postman Collection v2.1.0** ([`docs/postman_collection.json`](docs/postman_collection.json)) documenting all 16 `/api/*` endpoints with integer-cent schemas, HTTP error contracts (`400`/`403`/`404`/`409`/`429`/`504`), cookie auth (`af_session_id`), and zero hardcoded secrets.

---

## System Architecture & Guardrails

- **Pure Deterministic Financial & Scheduling Engines:**
  - `src/lib/domain/money.ts` — Integer USD cents (`*Cents`) everywhere; zero floating-point currency math.
  - `src/lib/domain/policy-gate.ts` — Server-enforced `$100.00` (`10000` cents) auto-capture cap (`HTTP 403` without Finance Approver sign-off).
  - `src/lib/domain/conflict-engine.ts` — Half-open UTC interval overlap detection and eligible backup unit filtering (`BR-022`).
  - `src/lib/domain/evidence-validator.ts` — `BR-040` anti-hallucination guard verifying exact IDs, dollar amounts, and Channel3 proof URLs before Braintree dispute dispatch.
- **Bounded AI (`AWS Bedrock Amazon Nova`):**
  - `src/lib/bedrock/client.ts` wraps `us.amazon.nova-pro-v1:0` with automatic failover to `us.amazon.nova-lite-v1:0` and explicit `aiSource` / `aiAvailable` honesty flags.
  - Unstructured inspection notes and assistant prompts are fenced inside `<untrusted_record>` tags (`NFR-007`) so prompt injection cannot override deterministic policy gates.
- **Session Isolation & Rate Limiting:**
  - `src/lib/store/index.ts` isolates each visitor via HTTP-only `af_session_id` cookie backed by Upstash Redis (`24h` TTL) with local file fallback and per-session sliding-window rate limiting (`HTTP 429`).

---

## Mandatory AI Tools Statement & License Disclosures

- **Runtime AI:** **AWS Bedrock Amazon Nova Pro (`us.amazon.nova-pro-v1:0`)** and **Amazon Nova Lite (`us.amazon.nova-lite-v1:0`)**.
- **Development AI Assistants:** **Gemini Argon** (Product Architecture, Specification Governance & Code Auditing) and **Google Antigravity** (Full-Stack Engineering & Test Automation).
- **Sponsor Evaluation Waivers:**
  - `@bryntum/scheduler-trial@7.3.8` & `@bryntum/scheduler-react@7.3.8` used under the official 45-day public evaluation trial.
  - `ag-studio@3.1.0` & `ag-studio-react@3.1.0` used under the official hackathon judging evaluation license waiver.
- **Repository License:** **MIT License** ([`LICENSE`](LICENSE)).

---

## Local Setup, Verification & Test Commands

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables (paste your sandbox keys into .env.local)
cp .env.example .env.local

# 3. Verify TypeScript & automated unit/integration/OpenAPI test suite (17/17 tests)
npx tsc --noEmit
npx vitest run

# 4. Run live integration smoke checks (Braintree, Channel3, Bedrock Nova, Upstash)
npx tsx scripts/verify-integrations.ts

# 5. Run live 6-step end-to-end Hero Loop verification
npx tsx scripts/verify-e2e-loop.ts

# 6. Build & start local app on http://localhost:3000
npm run build
npm run dev
```

Health check endpoint: `GET http://localhost:3000/api/health` (returns boolean integration readiness flags with zero secret values).

---

## GitHub Push & Vercel Deployment Guide

### 1. Push to a Public GitHub Repository

```bash
git remote add origin https://github.com/<your-username>/aegisflow-rental.git
git branch -M main
git push -u origin main
```

*(Confirm `.env.local` is ignored by `.gitignore` and never committed.)*

### 2. Import & Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your `aegisflow-rental` repository (Framework Preset: **Next.js**).
2. Add the **8 environment variables** from `.env.example` in **Project Settings → Environment Variables**:
   - `BRAINTREE_ENVIRONMENT` (`sandbox`)
   - `BRAINTREE_MERCHANT_ID`
   - `BRAINTREE_PUBLIC_KEY`
   - `BRAINTREE_PRIVATE_KEY`
   - `AWS_REGION` (`us-east-1`)
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `CHANNEL3_API_KEY`
   - *(Optional for distributed persistence across serverless instances: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`)*
3. Click **Deploy** and verify `https://<your-deployment>.vercel.app/api/health` returns `200 OK`.


---

**License: MIT (OSI-Approved Open Source License)** — See [LICENSE](LICENSE).
