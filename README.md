# Vibe Money: The Answer Desk

Customers ask AI assistants where to eat, train or get their hair done. Most local businesses aren't in the answer, or the assistant gets their facts wrong. Vibe Money shows a business how assistants describe it, fixes what holds it back, and publishes its facts in a form AI agents can read.

This POC covers the **Free audit** and **Visible** tiers from the Presight proposal, and the outcomes view for the Abu Dhabi Chamber SME pilot. Offers, payments and tokens are out of scope.

## Two editions, one engine

| Edition | How to run | What runs where |
|---|---|---|
| **Static** (GitHub Pages) | Pushed automatically by `.github/workflows/pages.yml` | The whole engine runs in the visitor's browser, with state kept in `localStorage`. Simulated assistants only, because an API key can't live in a public page. |
| **Server** | `npm start` | Node server with a JSON store. Adds real Claude answers when `ANTHROPIC_API_KEY` is set, and serves the published files and MCP endpoint at real URLs. |

Both editions use the same modules (`src/`) and the same route table (`src/routes.js`). The static build bundles them for the browser with esbuild.

### Turning on GitHub Pages (one time)

1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Pages on a **private** repository needs a paid GitHub plan (Pro, Team or Enterprise). On a free plan, make the repository public or deploy from a public fork.
3. Re-run the "Deploy to GitHub Pages" workflow, or push a commit. The site appears at `https://<owner>.github.io/VibeMoney/`.

## The interface

The interface is designed as **The Answer Desk**: each business is laid out like a proof sheet of what assistants say about it.

- **The Mark** (a hot-pink highlighter stroke) appears wherever an assistant names the business.
- **The Pencil** (blue proofreader's ink) appears wherever an assistant gets a fact wrong.

Typography: Archivo (heavy and condensed for headlines and numerals), Schibsted Grotesk and JetBrains Mono, on cool proof paper.

- **The Desk** (per business):
  - § 00 *Front page*: the headline figure, the score over time, a carousel of overheard answers, and a one-sentence summary written from the data.
  - § 01 *The question sheet*: every question × assistant, with marks. Open any mark to read the answer.
  - § 02 *Who they name instead*: share of mentions and tally marks per competitor.
  - § 03 *Corrections*: the ranked fix plan, with one action per fix. Fixed items are struck through and stamped.
  - § 04 *What agents read*: llms.txt, schema.json and the signed agent card as a printed proof, beside a console that sends a real agent through discovery, signature check and MCP calls.
  - § 05 *The ledger*: the hash-chained activity log.
- **District Report** (for the program sponsor): the week-8 gate, a before/after slopegraph, and roll-ups by sector and district.

The demo opens with two of five businesses already fixed, and the gate not met. Fixing Sidra Coffee Roasters and asking the assistants again moves the gate to met.

## What's real and what's simulated

| Step | Real | Simulated |
|---|---|---|
| Audit | Claude answers (server edition, with an API key) | Four labelled assistants driven by the signals research links to being recommended: review volume, listing consistency, structured data, agent readability |
| Fix listings, request reviews | | Simulated: no platform APIs yet. Labelled `sim` everywhere. |
| Publish | schema.org, llms.txt, a signed A2A agent card and a read-only MCP endpoint | |
| Program outcomes | Comparison only on assistants present in both audits | Flagged when it rests on simulated assistants |

The simulated assistants are deterministic, so a score moves only when the business changes. They show how the method works; **they are not evidence**.

## Run the server edition

Needs Node 20+.

```bash
npm install
```

```bash
npm run seed
```

```bash
npm start
```

Open http://localhost:3000. To add real Claude answers:

```bash
ANTHROPIC_API_KEY=sk-ant-... npm start
```

To try the static edition locally:

```bash
npm run build
```

```bash
npx serve dist
```

## Other commands

To see what an agent gets from a published business (with the server running):

```bash
npm run demo:agent -- ironbark-strength
```

```bash
npm test
```

## Configuration (server)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BASE_URL` | `http://localhost:$PORT` | Public URL written into llms.txt and agent cards |
| `DATA_FILE` | `data/db.json` | JSON store (swap for a database before the pilot) |
| `ANTHROPIC_API_KEY` | unset | Turns on real Claude answers in audits |
| `VIBEMONEY_MODEL` | `claude-opus-5-5` | Model used for audit answers |
| `REAUDIT_INTERVAL_HOURS` | `0` (off) | Re-audit all businesses on this interval |

## Endpoints

- `GET /api/businesses`, `POST /api/businesses`, `GET|PUT /api/businesses/:id`
- `POST|GET /api/businesses/:id/audits`, `GET /api/businesses/:id/readiness`
- `POST /api/businesses/:id/fixes/{align_listings|request_reviews|publish}`
- `GET /api/program`, `POST /api/program/reaudit`, `GET /api/audit-log`, `POST /api/demo/reset`
- Published, after Publish:
  - `GET /b/:slug`
  - `/b/:slug/schema.json`
  - `/b/:slug/llms.txt`
  - `/b/:slug/.well-known/agent-card.json`
  - `POST /mcp/:slug` (MCP JSON-RPC: `get_business_profile`, `get_opening_hours`, `get_menu`)

## Layout

```
src/
  app.js, routes.js, pages.js, seed.js   engine wiring, shared API, public page, demo data
  server.js                              Node entry point
  browser/engine.js                      in-browser entry point for the static edition
  modules/                               visibility audit, fix plan and publishing, program report, hours
  mcp/server.js                          read-only MCP endpoint
  llm/claude.js                          optional Claude client (server only)
  lib/                                   store, isomorphic crypto, audit log, router
public/                                  The Answer Desk (vanilla JS modules, no framework)
scripts/                                 seed, static build, demo agent
.github/workflows/pages.yml              test, build, deploy to GitHub Pages
```

## Next steps for the pilot

1. Add more real assistants beside Claude, and run each question several times to account for answer variance.
2. Connect the Google Business Profile, Yelp and Bing Places APIs, and a consented review-request channel.
3. Pull baseline facts from the business's website and Google profile.
4. Move to UAE hosting with owner logins, and add Arabic in the console and the published files.
