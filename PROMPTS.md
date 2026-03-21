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
