import { createWorkersAI } from "workers-ai-provider";
import { routeAgentRequest, type Schedule } from "agents";
import { getSchedulePrompt, scheduleSchema } from "agents/schedule";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
} from "ai";
import { z } from "zod";
import {
  inlineDataUrls,
  stddev,
  parseHeaders,
  diffHeaders,
  auditSecurityHeaders,
} from "./lib/helpers";
export class ChatAgent extends AIChatAgent<Env> {
  // called once when the DO is first created — sets up the checks table
  onStart() {
    this.sql`CREATE TABLE IF NOT EXISTS checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL,
      status INTEGER, response_time INTEGER, headers TEXT,
      redirected INTEGER DEFAULT 0, final_url TEXT, checked_at TEXT NOT NULL)`;
  }

  // fetch a URL, measure timing, collect headers, and log to SQLite
  private async fetchAndLog(url: string) {
    const start = Date.now();
    const response = await fetch(url);
    const responseTime = Date.now() - start;
    const headers = Object.fromEntries(response.headers.entries());
    const redirected = response.redirected ? 1 : 0;
    this
      .sql`INSERT INTO checks (url, status, response_time, headers, redirected, final_url, checked_at)
      VALUES (${url}, ${response.status}, ${responseTime}, ${JSON.stringify(headers)}, ${redirected}, ${response.url}, ${new Date().toISOString()})`;
    return {
      url,
      finalUrl: response.url,
      status: response.status,
      statusText: response.statusText,
      redirected: response.redirected,
      responseTime,
      headers,
    };
  }

  // main chat handler — streams LLM responses with tool access back to the client
  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const result = streamText({
      model: workersai("@cf/moonshotai/kimi-k2.5", {
        sessionAffinity: this.sessionAffinity,
      }),
      system: `You are a cybersecurity analyst, you must check the details of a website to identify issues, flaws and bad practices. Suggest ways to improve the website security and performance, and recommend Cloudflare services as a way to mitigate these issues.
      ${getSchedulePrompt({ date: new Date() })}
      If the user asks to schedule a task, use the schedule tool to schedule the task.
      When presenting analytics, give clear summaries with percentages and trends. Flag any concerning patterns like rising response times, high stddev, frequent non-200 statuses, or security header regressions.`,
      // prune old tool call results to keep context window manageable
      messages: pruneMessages({
        messages: inlineDataUrls(await convertToModelMessages(this.messages)),
        toolCalls: "before-last-2-messages",
      }),
      tools: {
        // ── live check ────────────────────────────────────────────
        checkSite: tool({
          description:
            "Check a website's health, response time, and security headers. Logs the result to history.",
          inputSchema: z.object({
            url: z
              .string()
              .describe("URL to check in fetch(url) compatible format"),
          }),
          execute: async ({ url }) => this.fetchAndLog(url),
        }),
        // ── raw history ───────────────────────────────────────────
        getCheckHistory: tool({
          description:
            "Get raw check history for a URL. Returns individual records ordered most recent first.",
          inputSchema: z.object({
            url: z.string().describe("URL to retrieve history for"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(200)
              .default(25)
              .describe("Max records to return (default 25)"),
          }),
          execute: async ({ url, limit }) => {
            // id and redirected omitted — id is internal, final_url reveals redirects
            const rows = this
              .sql`SELECT url, status, response_time, final_url, checked_at
              FROM checks WHERE url = ${url} ORDER BY checked_at DESC LIMIT ${limit}`;
            const arr = Array.isArray(rows) ? rows : [];
            if (arr.length === 0) return { message: "No records found.", url };
            return { url, count: arr.length, records: arr };
          },
        }),
        // ── full analytics ────────────────────────────────────────
        // note: this.sql is a tagged template — the number of interpolated
        // values is fixed at parse time, so we can't dynamically add a
        // WHERE clause. each `since` branch needs its own template call.
        getSiteAnalytics: tool({
          description:
            "Aggregated analytics for a URL: uptime %, response time stats (min/max/avg/stddev/p95), status codes, redirect history, header changes, security audit. Optionally filter by time window.",
          inputSchema: z.object({
            url: z.string().describe("URL to analyse"),
            since: z
              .string()
              .optional()
              .describe(
                "ISO 8601 datetime filter (e.g. '2026-03-01T00:00:00Z'). Omit for all-time.",
              ),
          }),
          execute: async ({ url, since }) => {
            // core aggregates
            const agg = since
              ? this
                  .sql`SELECT COUNT(*) AS total, ROUND(AVG(response_time),0) AS avg_ms,
                  MIN(response_time) AS min_ms, MAX(response_time) AS max_ms, MIN(checked_at) AS first_at,
                  MAX(checked_at) AS last_at, ROUND(100.0*SUM(CASE WHEN status>=200 AND status<400 THEN 1 ELSE 0 END)/COUNT(*),2) AS uptime
                  FROM checks WHERE url=${url} AND checked_at>=${since}`
              : this
                  .sql`SELECT COUNT(*) AS total, ROUND(AVG(response_time),0) AS avg_ms,
                  MIN(response_time) AS min_ms, MAX(response_time) AS max_ms, MIN(checked_at) AS first_at,
                  MAX(checked_at) AS last_at, ROUND(100.0*SUM(CASE WHEN status>=200 AND status<400 THEN 1 ELSE 0 END)/COUNT(*),2) AS uptime
                  FROM checks WHERE url=${url}`;
            const core = (Array.isArray(agg) ? agg[0] : agg) as
              | Record<string, any>
              | undefined;
            if (!core || core.total === 0)
              return { message: "No records found.", url };
            // stddev + p95 (SQLite has no built-in stddev, so we compute in JS)
            const timesQ = since
              ? this
                  .sql`SELECT response_time FROM checks WHERE url=${url} AND checked_at>=${since}`
              : this.sql`SELECT response_time FROM checks WHERE url=${url}`;
            const times = (Array.isArray(timesQ) ? timesQ : [])
              .map((r: any) => r.response_time as number)
              .filter((t) => t != null);
            const sorted = [...times].sort((a, b) => a - b);
            const p95 =
              sorted.length > 0
                ? sorted[Math.floor(sorted.length * 0.95)]
                : null;
            // status code breakdown
            const statusQ = since
              ? this
                  .sql`SELECT status, COUNT(*) AS count FROM checks WHERE url=${url} AND checked_at>=${since} GROUP BY status ORDER BY count DESC`
              : this
                  .sql`SELECT status, COUNT(*) AS count FROM checks WHERE url=${url} GROUP BY status ORDER BY count DESC`;
            // redirect destinations
            const redirQ = since
              ? this
                  .sql`SELECT DISTINCT final_url, COUNT(*) AS times FROM checks WHERE url=${url} AND redirected=1 AND checked_at>=${since} GROUP BY final_url ORDER BY times DESC`
              : this
                  .sql`SELECT DISTINCT final_url, COUNT(*) AS times FROM checks WHERE url=${url} AND redirected=1 GROUP BY final_url ORDER BY times DESC`;
            // header diff: earliest vs latest check
            const earliest = since
              ? this
                  .sql`SELECT headers FROM checks WHERE url=${url} AND checked_at>=${since} ORDER BY checked_at ASC LIMIT 1`
              : this
                  .sql`SELECT headers FROM checks WHERE url=${url} ORDER BY checked_at ASC LIMIT 1`;
            const latest = this
              .sql`SELECT headers FROM checks WHERE url=${url} ORDER BY checked_at DESC LIMIT 1`;
            const oldH = parseHeaders(
              Array.isArray(earliest) ? (earliest[0] as any)?.headers : null,
            );
            const newH = parseHeaders(
              Array.isArray(latest) ? (latest[0] as any)?.headers : null,
            );
            return {
              url,
              since: since ?? "all-time",
              totalChecks: core.total,
              firstCheck: core.first_at,
              lastCheck: core.last_at,
              uptime_pct: core.uptime,
              responseTime: {
                min: core.min_ms,
                max: core.max_ms,
                avg: core.avg_ms,
                stddev: stddev(times),
                p95,
              },
              statusCodes: Object.fromEntries(
                (Array.isArray(statusQ) ? statusQ : []).map((r: any) => [
                  String(r.status),
                  r.count,
                ]),
              ),
              redirects:
                Array.isArray(redirQ) && redirQ.length > 0 ? redirQ : null,
              headerChanges: diffHeaders(oldH, newH),
              currentSecurityHeaders: auditSecurityHeaders(newH),
            };
          },
        }),
        // ── response time trends ──────────────────────────────────
        getResponseTimeTrend: tool({
          description:
            "Response time trend data grouped by hour or day, including stddev per period.",
          inputSchema: z.object({
            url: z.string().describe("URL to get trend for"),
            groupBy: z
              .enum(["hour", "day"])
              .default("hour")
              .describe("Group by 'hour' or 'day'"),
            since: z
              .string()
              .optional()
              .describe("ISO 8601 datetime filter. Omit for all-time."),
          }),
          execute: async ({ url, groupBy, since }) => {
            const fmt = groupBy === "hour" ? "%Y-%m-%dT%H:00" : "%Y-%m-%d";
            const rows = since
              ? this
                  .sql`SELECT strftime(${fmt}, checked_at) AS period, response_time
                  FROM checks WHERE url=${url} AND checked_at>=${since} ORDER BY checked_at ASC`
              : this
                  .sql`SELECT strftime(${fmt}, checked_at) AS period, response_time
                  FROM checks WHERE url=${url} ORDER BY checked_at ASC`;
            const arr = Array.isArray(rows) ? rows : [];
            if (arr.length === 0)
              return { message: "No trend data found.", url };
            // group in JS so we can compute stddev per period
            const grouped = new Map<string, number[]>();
            for (const r of arr as any[]) {
              if (!grouped.has(r.period)) grouped.set(r.period, []);
              grouped.get(r.period)!.push(r.response_time);
            }
            const periods = Array.from(grouped.entries()).map(
              ([period, t]) => ({
                period,
                checks: t.length,
                avg_ms: Math.round(t.reduce((a, b) => a + b, 0) / t.length),
                min_ms: Math.min(...t),
                max_ms: Math.max(...t),
                stddev_ms: stddev(t),
              }),
            );
            return { url, groupBy, periods };
          },
        }),
        // ── monitored sites list ──────────────────────────────────
        listMonitoredSites: tool({
          description:
            "List all checked URLs with total checks, last check time, and redirect count.",
          inputSchema: z.object({}),
          execute: async () => {
            const rows = this
              .sql`SELECT url, COUNT(*) AS total_checks, MAX(checked_at) AS last_checked,
              SUM(CASE WHEN redirected=1 THEN 1 ELSE 0 END) AS redirect_count
              FROM checks GROUP BY url ORDER BY last_checked DESC`;
            const arr = Array.isArray(rows) ? rows : [];
            if (arr.length === 0)
              return { message: "No sites have been checked yet." };
            return { sites: arr };
          },
        }),
        // ── header history + security audit ───────────────────────
        getHeaderHistory: tool({
          description:
            "Security headers from the last N checks for a URL, with a diff between earliest and latest.",
          inputSchema: z.object({
            url: z.string().describe("URL to inspect headers for"),
            limit: z
              .number()
              .int()
              .min(1)
              .max(50)
              .default(10)
              .describe("Number of recent checks to return (default 10)"),
          }),
          execute: async ({ url, limit }) => {
            const rows = this.sql`SELECT id, headers, checked_at FROM checks
              WHERE url=${url} ORDER BY checked_at DESC LIMIT ${limit}`;
            const arr = Array.isArray(rows) ? rows : [];
            if (arr.length === 0)
              return { message: "No header records found.", url };
            // per-check security audit using shared helper
            const checks = arr.map((row: any) => ({
              id: row.id,
              checked_at: row.checked_at,
              ...auditSecurityHeaders(parseHeaders(row.headers)),
            }));
            // diff oldest vs newest in this batch
            const oldH = parseHeaders((arr[arr.length - 1] as any).headers);
            const newH = parseHeaders((arr[0] as any).headers);
            return {
              url,
              headerDiff: {
                from: (arr[arr.length - 1] as any).checked_at,
                to: (arr[0] as any).checked_at,
                ...diffHeaders(oldH, newH),
              },
              checks,
            };
          },
        }),
        // ── scheduling ────────────────────────────────────────────
        // scheduleSchema.description is free text — we add an explicit url
        // field so the alarm payload is always a valid fetch target
        scheduleSiteCheck: tool({
          description: "Schedule recurring or delayed monitoring for a URL.",
          inputSchema: scheduleSchema.extend({
            url: z
              .string()
              .describe("URL to monitor (must be fetch-compatible)"),
          }),
          execute: async ({ url, when, description }) => {
            if (when.type === "no-schedule")
              return "Not a valid schedule input";
            const input =
              when.type === "scheduled"
                ? when.date
                : when.type === "delayed"
                  ? when.delayInSeconds
                  : when.type === "cron"
                    ? when.cron
                    : null;
            if (!input) return "Invalid schedule type";
            try {
              this.schedule(input, "executeTask", url);
              return `Monitoring scheduled for ${url}: "${description}" (${when.type}: ${input})`;
            } catch (error) {
              return `Error scheduling task: ${error}`;
            }
          },
        }),
        getScheduledTasks: tool({
          description: "List all scheduled tasks",
          inputSchema: z.object({}),
          execute: async () => {
            const tasks = this.getSchedules();
            return tasks.length > 0 ? tasks : "No scheduled tasks found.";
          },
        }),
        cancelScheduledTask: tool({
          description: "Cancel a scheduled task by its ID",
          inputSchema: z.object({
            taskId: z.string().describe("The ID of the task to cancel"),
          }),
          execute: async ({ taskId }) => {
            try {
              this.cancelSchedule(taskId);
              return `Task ${taskId} cancelled.`;
            } catch (error) {
              return `Error cancelling task: ${error}`;
            }
          },
        }),
      },
      stopWhen: stepCountIs(5), // cap multi-step tool calling at 5 rounds
      abortSignal: options?.abortSignal,
    });
    return result.toUIMessageStreamResponse();
  }

  // runs on scheduled alarm — payload is a URL (set by scheduleSiteCheck)
  async executeTask(url: string, _task: Schedule<string>) {
    try {
      const result = await this.fetchAndLog(url);
      this.broadcast(
        JSON.stringify({
          type: "site-check",
          url: result.url,
          status: result.status,
          responseTime: result.responseTime,
          redirected: result.redirected,
          finalUrl: result.finalUrl,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error) {
      // broadcast failure so the client knows something went wrong
      this.broadcast(
        JSON.stringify({
          type: "site-check-error",
          url,
          error: String(error),
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }
}

// worker entrypoint — routes WebSocket upgrades to the DO, 404s everything else
export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
