import { useState, useEffect } from "react";
import { Text, Badge, Surface, Button } from "@cloudflare/kumo";
import { z } from "zod";
import {
  GlobeIcon,
  ClockCountdownIcon,
  ChartLineUpIcon
} from "@phosphor-icons/react";
import { ResponseTimeChart } from "./ResponseTimeChart";

const dashboardSchema = z.object({
  sites: z.array(
    z.object({
      url: z.string(),
      total_checks: z.number().int().nonnegative(),
      last_checked: z.string(),
      avg_ms: z.number().finite().nullable(),
      uptime: z.number().finite()
    })
  ),
  tasks: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      description: z.string().nullish()
    })
  )
});
const chartSchema = z.object({
  url: z.string(),
  points: z.array(z.tuple([z.number().finite(), z.number().finite()]))
});
type DashboardData = z.infer<typeof dashboardSchema>;
type ChartData = z.infer<typeof chartSchema>;

interface RefreshKey {
  url: string;
  revision: string;
}

// agent connection from useAgent — has .call() for callable methods
type AgentConnection = {
  call: <T = unknown>(method: string, args?: unknown[]) => Promise<T>;
};

export function DashboardPanel({
  agent,
  revision
}: {
  agent: AgentConnection;
  revision: number;
}) {
  const [dashboard, setDashboard] = useState<{
    revision: string;
    data: DashboardData;
  } | null>(null);
  const [dashboardErrorRevision, setDashboardErrorRevision] = useState<
    string | null
  >(null);
  const [chart, setChart] = useState<(ChartData & RefreshKey) | null>(null);
  const [chartError, setChartError] = useState<RefreshKey | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const [refreshCount, setRefreshCount] = useState(0);
  const refreshKey = `${revision}:${refreshCount}`;
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setIsDark(document.documentElement.getAttribute("data-mode") === "dark")
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-mode"]
    });
    return () => observer.disconnect();
  }, []);

  // fetch dashboard data on mount and whenever selection changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = dashboardSchema.parse(
          await agent.call("getDashboardData")
        );
        if (cancelled) return;
        setDashboard({ revision: refreshKey, data: result });
        setDashboardErrorRevision(null);
        setSelectedUrl((current) =>
          current && result.sites.some((site) => site.url === current)
            ? current
            : (result.sites[0]?.url ?? null)
        );
      } catch (e) {
        if (!cancelled) {
          setDashboardErrorRevision(refreshKey);
          console.error("dashboard fetch failed:", e);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agent, refreshKey]);

  // fetch chart data when the site or dashboard revision changes
  useEffect(() => {
    if (!selectedUrl) return;
    let cancelled = false;
    agent
      .call("getResponseTimeSeries", [selectedUrl])
      .then((result) => {
        const parsed = chartSchema.parse(result);
        if (!cancelled) {
          setChart({ ...parsed, url: selectedUrl, revision: refreshKey });
          setChartError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setChart(null);
          setChartError({ url: selectedUrl, revision: refreshKey });
          console.error("chart fetch failed:", e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent, selectedUrl, refreshKey]);

  const data = dashboard?.data;
  const dashboardFailed = dashboardErrorRevision === refreshKey;
  const dashboardLoading =
    dashboard?.revision !== refreshKey && !dashboardFailed;
  const chartCurrent =
    chart?.url === selectedUrl && chart.revision === refreshKey;
  const chartFailed =
    chartError?.url === selectedUrl && chartError.revision === refreshKey;
  const chartLoading = Boolean(selectedUrl) && !chartCurrent && !chartFailed;
  const sites = data?.sites ?? [];
  const tasks = data?.tasks ?? [];
  const selected = sites.find((s) => s.url === selectedUrl);

  return (
    <aside
      aria-label="Monitoring dashboard"
      className="w-full lg:w-[380px] min-w-0 shrink-0 lg:border-l border-kumo-line bg-kumo-base flex flex-col overflow-y-auto"
    >
      {/* header */}
      <div className="px-4 py-3 border-b border-kumo-line">
        <div className="flex items-center gap-2 justify-between">
          <ChartLineUpIcon size={16} className="text-kumo-inactive" />
          <Text size="sm" bold as="h2">
            Dashboard
          </Text>
          <Button
            variant="secondary"
            onClick={() => setRefreshCount((count) => count + 1)}
            className="min-h-11"
            disabled={dashboardLoading || chartLoading}
          >
            Refresh
          </Button>
        </div>
      </div>
      <output className="block px-4 pt-3 text-xs text-kumo-secondary">
        {dashboardLoading
          ? "Updating dashboard..."
          : dashboardFailed
            ? data
              ? "Could not refresh. Showing the previous snapshot."
              : "Dashboard unavailable. Try loading it again."
            : "Select a site to inspect its recorded checks."}
      </output>
      {(dashboardFailed || chartFailed) && (
        <Button
          variant="secondary"
          onClick={() => setRefreshCount((count) => count + 1)}
          className="mx-4 mt-2 min-h-11 self-start"
        >
          Retry dashboard
        </Button>
      )}

      {/* chart section */}
      <div className="px-4 pt-4 pb-2">
        <div className="mb-2">
          <Text size="xs" variant="secondary" bold>
            Response Time
          </Text>
        </div>
        {selected && (
          <div className="mb-1 [overflow-wrap:anywhere]">
            <Text size="xs" variant="secondary">
              {selected.url}
            </Text>
          </div>
        )}
        {dashboardFailed || chartFailed ? (
          <div className="flex items-center justify-center h-[200px] text-kumo-inactive text-sm">
            Response time unavailable
          </div>
        ) : (
          <ResponseTimeChart
            points={chartCurrent ? chart.points : []}
            loading={dashboardLoading || chartLoading}
            isDarkMode={isDark}
          />
        )}
      </div>
      <p className="px-4 text-xs text-kumo-secondary">
        Chart shows up to the latest 200 recorded response-time samples.
        Statistics use all recorded checks.
      </p>

      {/* quick stats */}
      {selected && (
        <p className="px-4 pt-3 text-xs text-kumo-secondary [overflow-wrap:anywhere]">
          Last check:{" "}
          {Number.isFinite(Date.parse(selected.last_checked))
            ? new Date(selected.last_checked).toLocaleString()
            : "Unknown"}
        </p>
      )}
      {selected && (
        <div className="px-4 py-3 grid grid-cols-3 gap-2">
          <Surface className="px-2 py-1.5 rounded-lg ring ring-kumo-line text-center">
            <Text size="xs" variant="secondary">
              Uptime
            </Text>
            <Text size="sm" bold>
              {selected.uptime ?? "—"}%
            </Text>
          </Surface>
          <Surface className="px-2 py-1.5 rounded-lg ring ring-kumo-line text-center">
            <Text size="xs" variant="secondary">
              Avg
            </Text>
            <Text size="sm" bold>
              {selected.avg_ms ?? "—"}ms
            </Text>
          </Surface>
          <Surface className="px-2 py-1.5 rounded-lg ring ring-kumo-line text-center">
            <Text size="xs" variant="secondary">
              Checks
            </Text>
            <Text size="sm" bold>
              {selected.total_checks ?? 0}
            </Text>
          </Surface>
        </div>
      )}

      {/* monitored sites */}
      <div className="px-4 py-3 border-t border-kumo-line">
        <div className="flex items-center gap-2 mb-2">
          <GlobeIcon size={14} className="text-kumo-inactive" />
          <Text size="xs" variant="secondary" bold>
            Monitored Sites
          </Text>
        </div>
        {!data && (dashboardLoading || dashboardFailed) ? (
          <Text size="xs" variant="secondary">
            {dashboardLoading ? "Loading sites…" : "Sites unavailable"}
          </Text>
        ) : sites.length === 0 ? (
          <Text size="xs" variant="secondary">
            No sites checked yet
          </Text>
        ) : (
          <div className="space-y-1">
            {sites.map((site) => (
              <button
                key={site.url}
                type="button"
                onClick={() => setSelectedUrl(site.url)}
                aria-pressed={site.url === selectedUrl}
                className={`w-full min-h-11 text-left px-2 py-2 rounded-md text-sm focus-visible:ring-2 focus-visible:ring-kumo-ring transition-colors ${
                  site.url === selectedUrl
                    ? "bg-kumo-control text-kumo-default"
                    : "text-kumo-secondary hover:bg-kumo-control/50"
                }`}
              >
                <span className="block [overflow-wrap:anywhere]">
                  {site.url}
                </span>
                <span className="text-xs text-kumo-inactive">
                  {site.total_checks} checks · {site.avg_ms ?? "—"}ms avg
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* scheduled tasks */}
      <div className="px-4 py-3 border-t border-kumo-line">
        <div className="flex items-center gap-2 mb-2">
          <ClockCountdownIcon size={14} className="text-kumo-inactive" />
          <Text size="xs" variant="secondary" bold>
            Scheduled Tasks
          </Text>
        </div>
        {!data && (dashboardLoading || dashboardFailed) ? (
          <Text size="xs" variant="secondary">
            {dashboardLoading ? "Loading tasks…" : "Tasks unavailable"}
          </Text>
        ) : tasks.length === 0 ? (
          <Text size="xs" variant="secondary">
            No scheduled tasks
          </Text>
        ) : (
          <div className="space-y-1">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-2 px-2 py-1.5 rounded-md bg-kumo-control/30"
              >
                <Badge variant="secondary">{task.type}</Badge>
                <span className="text-xs text-kumo-secondary [overflow-wrap:anywhere] flex-1 min-w-0">
                  {task.description ?? task.id}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-kumo-secondary">
          Ask in chat to list schedule details or cancel a task.
        </p>
      </div>
    </aside>
  );
}
