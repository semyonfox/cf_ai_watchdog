# Site Watchdog

A conversational site health monitoring agent built on the Cloudflare Agents SDK.
Paste a URL into the chat, get back a security and performance breakdown, and
optionally schedule recurring checks. All running on Workers and Durable Objects.

Built for the Cloudflare Summer 2026 SWE Internship application.

---

## Why this exists

I wanted to build something that actually uses the parts of Cloudflare's stack
that interest me most (Durable Objects, Workers AI, and the Agents SDK) rather
than stitching together a generic CRUD app. Site monitoring felt like a natural
fit: it needs persistent state, scheduled work, and there's a real opportunity
for an LLM to explain what `Strict-Transport-Security: max-age=0` actually means
to someone who isn't reading RFCs for fun.

The agent fetches sites, logs response times and headers into the DO's built-in
SQLite, audits nine security headers, tracks changes over time, and explains
everything through the chat. The dashboard on the right shows response time
charts and scheduled tasks. It's a single Durable Object doing coordination,
storage, and real-time sync. No external databases, no queues, no extra services.

## What it does

- **Live site checks**: fetches a URL, measures response time, captures all
  response headers, logs everything to SQLite, and returns a structured result
  for the LLM to interpret
- **Security header auditing**: checks for HSTS, CSP, X-Frame-Options,
  Referrer-Policy, Permissions-Policy, and four others, flagging what's missing
  or misconfigured
- **History and analytics**: uptime percentage, response time stats (min, max,
  avg, p95, stddev), status code distribution, redirect tracking, header diffs
  between checks
- **Scheduled monitoring**: set up recurring checks via DO alarms, get
  broadcast notifications in the chat when they run
- **Dashboard**: response time charts, monitored sites list, scheduled tasks,
  all synced from the DO in real time

## Architecture

```
browser (React + Kumo)
    |
    |  WebSocket
    v
Cloudflare Worker
    |
    |  routeAgentRequest
    v
ChatAgent (Durable Object)
    |-- Workers AI (@cf/moonshotai/kimi-k2.5)
    |-- SQLite (checks table)
    |-- DO alarms (scheduled monitoring)
    |-- fetch() (site checks)
```

One Worker, one Durable Object class, no other Cloudflare services. The DO handles
chat state, tool execution, SQLite reads/writes, alarm scheduling, and WebSocket
broadcasts. The frontend connects over a single WebSocket and calls DO methods
directly via the Agents SDK's `callable` pattern.

## Stack

| Layer           | Tech                                                 |
| --------------- | ---------------------------------------------------- |
| Runtime         | Cloudflare Workers + Durable Objects                 |
| AI              | Workers AI via `workers-ai-provider` + Vercel AI SDK |
| Agent framework | `agents` (Cloudflare Agents SDK)                     |
| Frontend        | React 19, `@cloudflare/kumo`, Tailwind CSS v4        |
| Storage         | DO built-in SQLite                                   |
| Charts          | ECharts via Kumo's `TimeseriesChart`                 |
| Tooling         | Vite 7, TypeScript 5.9, oxlint, oxfmt                |

## Setup

Prerequisites: Node.js 20+ and pnpm.

```bash
git clone https://github.com/semyonfox/cf_ai_watchdog.git
cd cf_ai_watchdog
pnpm install
```

### Local development

```bash
pnpm dev
```

This starts Vite + Wrangler in dev mode. The AI binding runs in remote mode,
so you'll need to be authenticated with Cloudflare (`npx wrangler login`).

Open `http://localhost:5173` in your browser.

### Deploy

```bash
pnpm run deploy
```

Builds the frontend with Vite and deploys the Worker via Wrangler.

### Other commands

```bash
pnpm run check    # format check + lint + typecheck
pnpm run types    # regenerate env.d.ts from wrangler config
pnpm run format   # auto-format with oxfmt
pnpm run lint     # lint with oxlint
```

## Project structure

```
src/
  server.ts              agent class, 8 tools, alarm handler, system prompt
  client.tsx             React entry point
  app.tsx                chat UI + dashboard layout
  lib/
    helpers.ts           stddev, header parsing, security audit, data URI handling
  components/
    ChatInput.tsx        message input with image attachment support
    DashboardPanel.tsx   sidebar with charts, sites list, scheduled tasks
    ResponseTimeChart.tsx  ECharts line chart wrapper
    ThemeToggle.tsx      dark/light mode toggle
    ToolPartView.tsx     tool call status cards (running, done, approval)
```

## Tools the agent has access to

| Tool                                        | What it does                                |
| ------------------------------------------- | ------------------------------------------- |
| `checkSite`                                 | Fetch + time + log to SQLite                |
| `getSiteAnalytics`                          | Aggregated stats, uptime %, security audit  |
| `getCheckHistory`                           | Raw check records for a URL                 |
| `getResponseTimeTrend`                      | Time-bucketed response time data            |
| `listMonitoredSites`                        | All checked URLs with counts                |
| `getHeaderHistory`                          | Security header changes over time           |
| `scheduleSiteCheck`                         | Create recurring/delayed check via DO alarm |
| `getScheduledTasks` / `cancelScheduledTask` | Manage scheduled work                       |

## License

MIT
