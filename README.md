# Vibe Money: AI visibility POC

Customers ask AI assistants where to eat, train or get their hair done. Most local businesses aren't in the answer, or the assistant gets their facts wrong. Vibe Money shows a business how assistants describe it, fixes what holds it back, and publishes its facts in a form AI agents can read.

This POC covers the **Free audit** and **Visible** tiers from the Presight proposal, and the program-outcomes view for the Abu Dhabi Chamber SME pilot. Offers, payments and tokens are out of scope.

## What it does

| Step | What happens | Real or simulated |
|---|---|---|
| **Audit** | Asks a fixed set of customer questions ("quiet café to work from on Al Reem Island") across assistants. Scores how often the business is named, whether its facts (opening hours) are right, and how it ranks against named competitors. | Claude answers are real when `ANTHROPIC_API_KEY` is set. Four labelled simulated assistants always run. |
| **Fix plan** | Ranks the causes of low visibility: few reviews, missing or inconsistent listings (Google, Yelp, Bing), no structured data, nothing agents can read. Each fix has a one-click action. | Listing updates and review responses are simulated: no platform APIs yet. |
| **Publish** | Serves `schema.org` JSON-LD, `llms.txt`, a signed A2A agent card and a read-only MCP endpoint for each business. | Real: served by this server. |
| **Re-audit** | Re-runs the same questions so the before/after score is comparable. Monthly re-audits run with `REAUDIT_INTERVAL_HOURS`. | Same as Audit. |
| **Program outcomes** | Baseline vs latest for every pilot business, rolled up by sector and district and checked against the week-8 gate (visibility up ≥30% for at least half the businesses). | It compares only assistants that appear in both audits, and flags results that rest on simulated assistants. |

Every agent and owner action goes to a hash-chained activity log (`/api/audit-log` verifies the chain).

### About the simulated assistants

They are deterministic and are driven by the signals research links to being recommended: review volume (recommended businesses average about 133 Google reviews, ignored ones about 11), listing presence and consistency, structured data, and agent readability. A business's simulated score changes only when one of those changes. That makes the fix-to-score loop demonstrable, but **it is a model, not evidence**. The pilot's evidence must come from real assistants.

## Run it

Needs Node 20+.

```bash
npm install
```

```bash
npm run seed:journey
```

```bash
npm start
```

Open http://localhost:3000. `seed:journey` loads five fictional Abu Dhabi businesses (café, gym, salon, restaurant, yoga studio), runs baseline audits, applies the fix plan to three of them and re-audits. Use `npm run seed` for baselines only.

To add real Claude answers to audits:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

To see what an AI agent gets from a published business (run while the server is up):

```bash
npm run demo:agent -- sidra-coffee
```

Tests:

```bash
npm test
```

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:$PORT` | Public URL written into llms.txt and agent cards |
| `DATA_FILE` | `data/db.json` | JSON store (swap for a database before the pilot) |
| `ANTHROPIC_API_KEY` | unset | Turns on real Claude answers in audits |
| `VIBEMONEY_MODEL` | `claude-opus-5-5` | Model used for audit answers |
| `REAUDIT_INTERVAL_HOURS` | `0` (off) | Re-audit all businesses on this interval |

## Endpoints

Owner console API:

- `GET /api/businesses`, `POST /api/businesses` (onboard), `GET|PUT /api/businesses/:id`
- `POST /api/businesses/:id/audits`, `GET /api/businesses/:id/audits`
- `GET /api/businesses/:id/readiness` (fix plan and file previews)
- `POST /api/businesses/:id/fixes/{align_listings|request_reviews|publish}`
- `GET /api/program`, `POST /api/program/reaudit`
- `GET /api/audit-log`

Published per business (after Publish):

- `GET /b/:slug`: public page with embedded JSON-LD
- `GET /b/:slug/schema.json`, `GET /b/:slug/llms.txt`
- `GET /b/:slug/.well-known/agent-card.json`: signed with the business's Ed25519 key
- `POST /mcp/:slug`: MCP over JSON-RPC (`initialize`, `tools/list`, `tools/call`). Tools: `get_business_profile`, `get_opening_hours`, `get_menu`.

## Layout

```
src/
  server.js            HTTP routes, public pages, scheduler
  app.js               wires modules together (used by server and tests)
  seed.js              fictional pilot businesses
  llm/claude.js        optional Claude client for real audit answers
  mcp/server.js        read-only MCP endpoint
  modules/
    businesses.js      business profiles
    visibility.js      audit harness, answer analysis, competitor comparison
    readiness.js       fix plan, listing checks, schema.org / llms.txt / agent card
    program.js         outcomes by sector and district, week-8 gate
    hours.js           opening-hours parsing and open-now checks
  lib/                 store, crypto, audit log, HTTP helpers
public/                owner console (vanilla JS)
scripts/               seed and demo agent
test/                  node:test suites
```

## Next steps for the pilot

1. Add more real assistants beside Claude, and run each question several times to account for answer variance.
2. Connect the Google Business Profile, Yelp and Bing Places APIs for listing fixes, and a consented review-request channel (WhatsApp or email).
3. Pull baseline facts from the business's website and Google profile instead of manual onboarding.
4. Move storage to a UAE-hosted database. Add owner logins, and Arabic in both the console and the published files.
