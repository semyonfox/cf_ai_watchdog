import { isToolUIPart, getToolName } from "ai";
import type { UIMessage } from "ai";
import { Button, Badge, Surface, Text } from "@cloudflare/kumo";
import { GearIcon, CheckCircleIcon, XCircleIcon } from "@phosphor-icons/react";

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
  if (!isToolUIPart(part)) return null;
  const toolName = getToolName(part);
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
        <div className="flex flex-wrap items-center gap-2">
          {failed || denied ? (
            <XCircleIcon size={16} className="shrink-0 text-kumo-danger" />
          ) : (
            <GearIcon
              size={16}
              className={`shrink-0 text-kumo-inactive ${running ? "motion-safe:animate-spin" : ""}`}
            />
          )}
          <Text size="sm" bold>
            {toolName}
          </Text>
          <Badge variant="secondary">{label}</Badge>
        </div>
        {failed && (
          <p
            role="alert"
            className="mt-2 text-sm text-kumo-danger [overflow-wrap:anywhere]"
          >
            {part.errorText}
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
            <summary className="min-h-11 py-3 cursor-pointer text-xs text-kumo-secondary focus-visible:ring-2 focus-visible:ring-kumo-ring">
              Request details
            </summary>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-kumo-control p-2 text-xs text-kumo-default">
              {JSON.stringify(part.input, null, 2)}
            </pre>
          </details>
        )}
        {part.state === "output-available" && (
          <details className="mt-2">
            <summary className="min-h-11 py-3 cursor-pointer text-xs text-kumo-secondary focus-visible:ring-2 focus-visible:ring-kumo-ring">
              Result details
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-kumo-control p-2 text-xs text-kumo-default">
              {JSON.stringify(part.output, null, 2)}
            </pre>
          </details>
        )}
        {part.state === "approval-requested" && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              className="min-h-11"
              icon={<CheckCircleIcon size={16} />}
              onClick={() =>
                addToolApprovalResponse({
                  id: part.approval.id,
                  approved: true
                })
              }
            >
              Approve
            </Button>
            <Button
              variant="secondary"
              className="min-h-11"
              icon={<XCircleIcon size={16} />}
              onClick={() =>
                addToolApprovalResponse({
                  id: part.approval.id,
                  approved: false
                })
              }
            >
              Reject
            </Button>
          </div>
        )}
      </Surface>
    </div>
  );
}
