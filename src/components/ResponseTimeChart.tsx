import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  AriaComponent
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { TimeseriesChart, ChartPalette } from "@cloudflare/kumo";

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  ToolboxComponent,
  AriaComponent,
  CanvasRenderer
]);

export function ResponseTimeChart({
  points,
  loading = false,
  isDarkMode = false
}: {
  points: [number, number][];
  loading?: boolean;
  isDarkMode?: boolean;
}) {
  if (!loading && points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-kumo-inactive text-sm">
        No data yet
      </div>
    );
  }

  return (
    <TimeseriesChart
      echarts={echarts}
      type="line"
      data={[
        {
          name: "Response Time",
          data: points,
          color: ChartPalette.categorical(0, isDarkMode)
        }
      ]}
      yAxisName="ms"
      tooltipValueFormat={(v) => `${v}ms`}
      isDarkMode={isDarkMode}
      gradient
      loading={loading}
      height={200}
      ariaDescription={`Response times for ${points.length} recorded checks, in milliseconds. ${points.length ? `Latest check: ${points[points.length - 1][1]} milliseconds. Minimum: ${Math.min(...points.map((point) => point[1]))}. Maximum: ${Math.max(...points.map((point) => point[1]))}.` : "Waiting for response time data."}`}
    />
  );
}
