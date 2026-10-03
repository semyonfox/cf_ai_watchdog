import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import { Button, Badge, Surface, Text } from "@cloudflare/kumo";
import { GearIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { useId, useRef } from "react";

export function ToolPartView({
  part,
  addToolApprovalResponse
}: {
  part: UIMessage["parts"][number];
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
  }) => void;
}) {
  const headingId = useId();
  const statusRef = useRef<HTMLOutputElement>(null);
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);
  const readableNames: Record<string, string> = {
    checkSite: "Check website",
    scheduleSiteCheck: "Schedule website checks",
    getSiteAnalytics: "Read site statistics",
    getCheckHistory: "Read check history",
    getResponseTimeTrend: "Read response-time trend",
    listMonitoredSites: "List monitored sites",
    getHeaderHistory: "Read header history",
    getScheduledTasks: "List scheduled tasks",
    cancelScheduledTask: "Cancel scheduled task"
  };
  const action = readableNames[toolName] ?? toolName;
  const respond = (approved: boolean) => {
    if (part.state !== "approval-requested") return;
    const ownedFocus = statusRef.current?.parentElement?.contains(
      document.activeElement
    );
    addToolApprovalResponse({ id: part.approval.id, approved });
    requestAnimationFrame(() => {
      if (
        !ownedFocus ||
        (document.activeElement !== document.body &&
          !statusRef.current?.parentElement?.contains(document.activeElement))
      )
        return;
      if (statusRef.current?.isConnected) statusRef.current.focus();
      else {
        const composer = document.querySelector<HTMLTextAreaElement>(
          'textarea[aria-label="Message to Site Watchdog"]'
        );
        if (composer && !composer.disabled) composer.focus();
        else document.getElementById("composer-hint")?.focus();
      }
    });
  };
  const needsApproval = part.state === "approval-requested";
  const failed = part.state === "output-error";
  const denied =
    part.state === "output-denied" || part.approval?.approved === false;
  const running =
    part.state === "input-available" || part.state === "input-streaming";
  const label = failed
    ? "Failed"
    : denied
      ? "Rejected"
      : needsApproval
        ? "Approval needed"
        : part.state === "approval-responded"
          ? "Approved, awaiting result"
          : part.state === "output-available"
            ? "Result received"
            : "Running";

  return (
    <div className="flex justify-start min-w-0">
      <Surface
        className={`min-w-0 w-full max-w-[95%] sm:max-w-[85%] px-4 py-3 rounded-xl ring ${needsApproval ? "ring-2 ring-kumo-warning" : "ring-kumo-line"}`}
      >
        <output
          ref={statusRef}
          tabIndex={-1}
          id={headingId}
          aria-atomic="true"
          className="flex flex-wrap items-center gap-2"
        >
          {failed || denied ? (
            <XCircleIcon size={16} className="shrink-0 text-kumo-danger" />
          ) : (
            <GearIcon
              size={16}
              className={`shrink-0 text-kumo-inactive ${running ? "motion-safe:animate-spin" : ""}`}
            />
          )}
          <Text size="sm" bold>
            {action}
          </Text>
          <Badge variant="secondary">{label}</Badge>
        </output>
        {failed && (
          <p
            role="alert"
            className="mt-2 text-sm text-kumo-danger [overflow-wrap:anywhere]"
          >
            {action} failed: {part.errorText}
          </p>
        )}
        {failed && (
          <p className="mt-2 text-xs text-kumo-secondary">
            Review the request and ask again in chat. Check for existing
            schedules before retrying a scheduling request.
          </p>
        )}
        {part.input !== undefined && (
          <details open={needsApproval} className="mt-2">
            <summary
              aria-label={`${action}: request details`}
              className="min-h-11 py-3 cursor-pointer text-xs text-kumo-secondary focus-visible:ring-2 focus-visible:ring-kumo-ring"
            >
              Request details
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-kumo-control p-2 text-xs text-kumo-default">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </details>
        )}
        {part.state === "output-available" && (
          <details className="mt-2">
            <summary
              aria-label={`${action}: result details`}
              className="min-h-11 py-3 cursor-pointer text-xs text-kumo-secondary focus-visible:ring-2 focus-visible:ring-kumo-ring"
            >
              Result details
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-kumo-control p-2 text-xs text-kumo-default">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          </details>
        )}
        {part.state === "approval-requested" && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-kumo-secondary">
              Review the request details before allowing this action. Reject to
              leave it unapproved.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                className="min-h-11"
                icon={<CheckCircleIcon size={16} />}
                aria-label={`Approve: ${action}`}
                onClick={() => respond(true)}
              >
                Approve
              </Button>
              <Button
                variant="secondary"
                className="min-h-11"
                icon={<XCircleIcon size={16} />}
                aria-label={`Reject: ${action}`}
                onClick={() => respond(false)}
              >
                Reject
              </Button>
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}
