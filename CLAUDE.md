# CLAUDE.md — cf_ai_watchdog

## what this is

a site health monitoring agent for the Cloudflare Summer 2026 SWE Internship application.
users paste a URL into a chat, the agent fetches it, analyses response headers for security
and performance issues, explains findings via an LLM, and monitors sites on a schedule.

## required components (all four must be present)

1. **LLM** — Workers AI with `@cf/moonshotai/kimi-k2.5` (Cloudflare starter default, swappable)
2. **Workflow/coordination** — Durable Object alarm-based scheduled monitoring
3. **User input via chat** — React frontend with `useAgentChat` hook
4. **Memory/state** — DO state for watchlist, built-in SQLite for check history

## cloudflare services in scope

Workers, Workers AI, Durable Objects (with SQLite), Pages — nothing else.
no KV, D1, R2, Vectorize, Workflows-as-a-service, or external APIs.

## file structure

```
src/
  server.ts   — agent class, tools, alarm handler, system prompt
  client.tsx  — React entry point
  app.tsx     — chat UI and monitored sites sidebar
```

## key patterns

- `agents` package provides `AIChatAgent`, `routeAgentRequest`, `callable`
- `workers-ai-provider` wraps Workers AI for use with Vercel AI SDK's `streamText`
- `@cloudflare/ai-chat` provides the `useAgentChat` React hook
- `@cloudflare/kumo` is the UI component library
- state syncs to frontend automatically via `this.state` on the DO
- SQLite is accessed via `this.sql` on the DO
- alarm scheduling via `this.schedule()` / `alarm()` method

## implementation order

1. ~~scaffold from agents-starter~~ (done)
2. strip unnecessary demo code (weather, calculator, timezone tools)
3. implement `check_site` tool function
4. wire tool into agent with system prompt
5. add state management for watchlist
6. add SQLite table and history logging
7. implement alarm-based scheduled monitoring
8. modify frontend sidebar for monitored sites
9. test locally with `pnpm dev`
10. deploy with `pnpm run deploy` / `npx wrangler deploy`
11. write README.md
12. write PROMPTS.md (ongoing)
13. push to GitHub + submit

## commands

```bash
pnpm dev          # local dev server (vite + wrangler)
pnpm run deploy   # build + deploy to cloudflare
pnpm run check    # format + lint + typecheck
pnpm run types    # regenerate env.d.ts
```

## prompt logging (CRITICAL)

every prompt sent to any LLM (user prompts, system prompts, agent prompts)
must be logged in PROMPTS.md with a timestamp. this is a hard requirement
from the application rules.

## scope restrictions

do NOT build: DNS lookups, SSL inspection, charts, alerting, multi-region,
auth, subdomain enumeration, crawling, Workflows service, KV/D1/R2/Vectorize,
custom CSS beyond starter template, anything not in "what to build".
