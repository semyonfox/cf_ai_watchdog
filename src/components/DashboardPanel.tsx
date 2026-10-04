import { useState, useEffect } from "react";
import { Text, Badge, Surface } from "@cloudflare/kumo";
import {
  GlobeIcon,
  ClockCountdownIcon,
  ChartLineUpIcon
} from "@phosphor-icons/react";
import { ResponseTimeChart } from "./ResponseTimeChart";

// matches the shape returned by getDashboardData callable
interface SiteInfo {
  url: string;
  total_checks: number;
  last_checked: string;
  avg_ms: number | null;
  uptime: number;
}

interface DashboardData {
  sites: SiteInfo[];
  tasks: { id: string; type: string; description?: string }[];
}

interface ChartData {
  url: string;
  points: [number, number][];
}

interface RefreshKey {
  url: string;
  revision: number;
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
    revision: number;
    data: DashboardData;
  } | null>(null);
  const [dashboardErrorRevision, setDashboardErrorRevision] = useState<
    number | null
  >(null);
  const [chart, setChart] = useState<(ChartData & RefreshKey) | null>(null);
  const [chartError, setChartError] = useState<RefreshKey | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const isDark = document.documentElement.getAttribute("data-mode") === "dark";

  // fetch dashboard data on mount and whenever selection changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await agent.call<DashboardData>("getDashboardData");
        if (cancelled) return;
        setDashboard({ revision, data: result });
        setDashboardErrorRevision(null);
        if (
          !selectedUrl ||
          !result.sites.some((site) => site.url === selectedUrl)
        ) {
          setSelectedUrl(result.sites[0]?.url ?? null);
        }
      } catch (e) {
        if (!cancelled) {
          setDashboard(null);
          setDashboardErrorRevision(revision);
          console.error("dashboard fetch failed:", e);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agent, selectedUrl, revision]);

  // fetch chart data when the site or dashboard revision changes
  useEffect(() => {
    if (!selectedUrl) return;
    let cancelled = false;
    agent
      .call<ChartData>("getResponseTimeSeries", [selectedUrl])
      .then((result) => {
        if (!cancelled) {
          setChart({ ...result, url: selectedUrl, revision });
          setChartError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setChart(null);
          setChartError({ url: selectedUrl, revision });
          console.error("chart fetch failed:", e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent, selectedUrl, revision]);

  const data = dashboard?.revision === revision ? dashboard.data : null;
  const dashboardLoading = !data && dashboardErrorRevision !== revision;
  const chartCurrent =
    chart?.url === selectedUrl && chart.revision === revision;
  const chartFailed =
    chartError?.url === selectedUrl && chartError.revision === revision;
  const chartLoading = Boolean(selectedUrl) && !chartCurrent && !chartFailed;
  const sites = data?.sites ?? [];
  const tasks = data?.tasks ?? [];
  const selected = sites.find((s) => s.url === selectedUrl);

  return (
    <div className="w-[380px] shrink-0 border-l border-kumo-line bg-kumo-base flex flex-col overflow-y-auto">
      {/* header */}
      <div className="px-4 py-3 border-b border-kumo-line">
        <div className="flex items-center gap-2">
          <ChartLineUpIcon size={16} className="text-kumo-inactive" />
          <Text size="sm" bold>
            Dashboard
          </Text>
        </div>
      </div>

      {/* chart section */}
      <div className="px-4 pt-4 pb-2">
        <div className="mb-2">
          <Text size="xs" variant="secondary" bold>
            Response Time
          </Text>
        </div>
        {selected && (
          <div className="mb-1 truncate">
            <Text size="xs" variant="secondary">
              {selected.url}
            </Text>
          </div>
        )}
        {dashboardErrorRevision === revision || chartFailed ? (
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

      {/* quick stats */}
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
        {dashboardLoading || dashboardErrorRevision === revision ? (
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
                className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors ${
                  site.url === selectedUrl
                    ? "bg-kumo-control text-kumo-default"
                    : "text-kumo-secondary hover:bg-kumo-control/50"
                }`}
              >
                <span className="block truncate">{site.url}</span>
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
        {dashboardLoading || dashboardErrorRevision === revision ? (
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
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-kumo-control/30"
              >
                <Badge variant="secondary">{task.type}</Badge>
                <span className="text-xs text-kumo-secondary truncate flex-1 min-w-0">
                  {task.description ?? task.id}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
