// the bounded sample table needs keyboard scrolling
/* oxlint-disable jsx-a11y/no-noninteractive-tabindex */
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
    <div>
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
        xAxisTickCount={3}
        yAxisName="ms"
        tooltipValueFormat={(v) => `${v}ms`}
        isDarkMode={isDarkMode}
        gradient
        loading={loading}
        height={200}
        ariaDescription={`Response times for ${points.length} recorded checks, in milliseconds. ${points.length ? `Latest check: ${points[points.length - 1][1]} milliseconds. Minimum: ${Math.min(...points.map((point) => point[1]))}. Maximum: ${Math.max(...points.map((point) => point[1]))}.` : "Waiting for response time data."}`}
      />
      {!loading && points.length > 0 && (
        <>
          <p className="mt-2 text-xs text-kumo-secondary">
            {points.length} samples. Latest: {points[points.length - 1][1]} ms.
            Minimum: {Math.min(...points.map((point) => point[1]))} ms. Maximum:{" "}
            {Math.max(...points.map((point) => point[1]))} ms.
          </p>
          <details className="mt-2">
            <summary className="min-h-11 py-3 text-xs text-kumo-secondary cursor-pointer">
              Response-time samples
            </summary>
            <section
              className="max-h-64 overflow-auto"
              tabIndex={0}
              aria-label="Response-time samples"
            >
              <table className="w-full text-xs text-left text-kumo-default">
                <caption className="sr-only">
                  Recorded response-time samples
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Check time</th>
                    <th scope="col">Milliseconds</th>
                  </tr>
                </thead>
                <tbody>
                  {points.slice(-200).map(([time, value], index) => (
                    <tr key={`${time}:${index}`}>
                      <td className="py-1 pr-2">
                        {new Date(time).toLocaleString()}
                      </td>
                      <td className="tabular-nums">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </details>
        </>
      )}
    </div>
  );
}
