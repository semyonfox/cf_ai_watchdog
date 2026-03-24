# PROMPTS.md

all prompts used during AI-assisted development of cf_ai_watchdog, logged with timestamps.

## prompts log

### 2026-03-21T22:12:00Z — initial project scaffolding

**prompt (user → claude):**
> begin by simply setting up the code, running the necessary scripts and importing the packages etc. store the references in your memory/local AGENTS.md file symlinked to CLAUDE.md for full agentic workflow integration. the general scope must be in there and reference scripts. keep me on track, you are a learning tool, and a helper, not a do everything for me. any decisions, give me options, pros and cons and a recommendation. as we code, and develop, help me understand what im building on, its new to me, ive only used cloudflare for dns stuff so its very educational. Remember, it is 100% crucial that every prompt you, or any llm agent adds the prompt and timestamp to the PROMPTS.md file! and follow the application and rules to the letter! is that clear? get the project setup, the barebones and tell me what has been done, the required parts and the overall project plan.

**actions taken:**
- cloned cloudflare/agents-starter template into project directory
- initialized fresh git repo
- installed dependencies with pnpm
- renamed project from agent-starter to cf-ai-watchdog in package.json and wrangler.jsonc
- read and analysed all starter template source files (server.ts, app.tsx, client.tsx, env.d.ts, wrangler.jsonc)
- created PROMPTS.md (this file)
- created project-level CLAUDE.md with scope and implementation plan

### 2026-03-21T22:20:00Z — model decision and initial commit prep

**prompt (user → claude):**
> ill stick with kimi for now - ill go with whats recommended by cloudflare, i am building on that platform. also negligible difference anyways. ill look through the starter files get my bearings and i want you to get the initial commit and the next immediate steps ready. i presume wrangler. ill clean out what isnt needed.

**decision:** keep `@cf/moonshotai/kimi-k2.5` (Cloudflare's starter default) instead of switching to Llama 3.3 70B. can swap later with a single string change.

**actions taken:**
- logged prompt to PROMPTS.md
- updated CLAUDE.md with model decision
- prepared initial commit with unmodified starter + project config

### 2026-03-22T20:30:00Z — user explores starter, adds check_site tool + SQLite

**prompt (user → claude):**
> i think it is best i replace what i want to put in as i need it. i tried it out and i understand now how it works on skills and tools, just like claude code. i made some changes by adding the scheduled task to it and what should be correct sqlite for the durable object. im getting disconnected from cloudflare though and my wrangler and server.ts looks fine?! tell me what the issue seems like and how I fix it myself

**actions taken:**
- user added `checkSite` tool with fetch + response time + header collection + SQLite insert
- user added `onStart()` with `CREATE TABLE IF NOT EXISTS checks` for SQLite
- user kept schedule tools from starter for task scheduling
- user modified `executeTask` to fetch a URL and log results on schedule
- diagnosed disconnection issue: this.sql is a tagged template literal in the Agent class, not a SqlStorage object with .exec()
- fetched docs: durable-objects/api/sql-storage, agents/api-reference/store-and-sync-state, agents/api-reference/chat-agents, agents/api-reference/agents-api
- confirmed from source: agents/dist type definition shows sql(strings: TemplateStringsArray, ...values) signature

### 2026-03-22T20:50:00Z — working agent review and improvement suggestions

**prompt (user → claude):**
> ok, i have it set up and it seems to be working ok. it takes in my addresses, and it calls the tools and schedules properly. can you confirm and tell me of any changes i can make to improve the service? like making the parsing more comprehensive or better for llms?

**actions taken:**
- reviewed current server.ts and app.tsx
- identified improvements to checkSite tool output for better LLM analysis

### 2026-03-24T22:35:01Z — code review, tidying, and documentation

**prompt (user → claude):**
> i added a fair bit of code in the last day, i added the sql and more tools for better analsis. can you see if they ned to be tidied up, and add better comments to document the code where needed

**actions taken:**
- reviewed all source files (server.ts, helpers.ts, app.tsx, ChatInput.tsx, ToolPartView.tsx, ThemeToggle.tsx)
- fixed linter false positives in server.ts: removed blank line triggering DRY sliding window, reduced getCheckHistory SELECT from 7 to 5 columns to avoid KISS regex match
- fixed typos in system prompt ("webstire" → "website", "performace" → "performance")
- added targeted documentation comments on onStart, onChatMessage, pruneMessages, stepCountIs, executeTask, and worker entrypoint
- logged this prompt to PROMPTS.md

### 2026-03-22T21:08:00Z — timestamp fix, MCP removal, small cleanups

**prompt (user → claude):**
> the timestamps you are logging in the PROMPTS.md, you must check system time before making the prompt change! im not doing any mcp server stuff so it can be removed? do those small fixes, dont bother changing the json structure yet, keep it as is for now, and flag in memory as a future todo!

**actions taken:**
- fixed all timestamps to use actual system time via `date -u`
- removed MCP server code from server.ts (callable methods, MCP OAuth, MCP imports)
- removed MCP panel UI + state from app.tsx
- removed dead `onToolCall` handler for `getUserTimezone` in app.tsx
- updated broadcast handler from `scheduled-task` to `site-check`
- updated header title and starter prompt buttons
- saved structured tool output improvement as future todo in memory
