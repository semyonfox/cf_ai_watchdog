import { Suspense, useCallback, useState, useEffect, useRef } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { Button, Badge, Empty, Text } from "@cloudflare/kumo";
import { Toasty, useKumoToastManager } from "@cloudflare/kumo/components/toast";
import { Streamdown } from "streamdown";
import { Switch } from "@cloudflare/kumo";
import {
  TrashIcon,
  ChatCircleDotsIcon,
  CircleIcon,
  BugIcon,
  BrainIcon,
  CaretDownIcon,
  ImageIcon
} from "@phosphor-icons/react";
import { ThemeToggle } from "./components/ThemeToggle";
import { ToolPartView } from "./components/ToolPartView";
import { ChatInput, type MessagePart } from "./components/ChatInput";
import { DashboardPanel } from "./components/DashboardPanel";

function Chat() {
  const [connected, setConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const toasts = useKumoToastManager();

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => {
      setConnected(true);
      setDashboardRevision((revision) => revision + 1);
    }, []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (error: Event) => console.error("WebSocket error:", error),
      []
    ),
    onMessage: useCallback(
      (message: MessageEvent) => {
        try {
          const data = JSON.parse(String(message.data));
          if (data.type === "site-check") {
            setDashboardRevision((revision) => revision + 1);
            toasts.add({
              title: `Site check: ${data.url}`,
              description: `Status ${data.status} (${data.responseTime}ms)`,
              timeout: 5000
            });
          } else if (data.type === "site-check-error") {
            setDashboardRevision((revision) => revision + 1);
            toasts.add({
              title: `Site check failed: ${data.url}`,
              description: String(data.error),
              timeout: 5000
            });
          }
        } catch {
          // not JSON or not our event
        }
      },
      [toasts]
    )
  });

  const {
    messages,
    sendMessage,
    clearHistory,
    addToolApprovalResponse,
    stop,
    status
  } = useAgentChat({ agent });

  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) setIsDragging(false);
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    // drop handling is inside ChatInput now
  }, []);

  const handleSend = useCallback(
    (parts: MessagePart[]) => {
      sendMessage({ role: "user", parts });
    },
    [sendMessage]
  );

  return (
    <div className="flex h-screen">
      <div
        className="flex flex-col flex-1 min-w-0 bg-kumo-elevated relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
            <div className="flex flex-col items-center gap-2 text-kumo-brand">
              <ImageIcon size={40} />
              <Text variant="heading3" as="h3">
                Drop images here
              </Text>
            </div>
          </div>
        )}

        {/* header */}
        <header className="px-5 py-4 bg-kumo-base border-b border-kumo-line">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-kumo-default">
                Site Watchdog
              </h1>
              <Badge variant="secondary">
                <ChatCircleDotsIcon size={12} weight="bold" className="mr-1" />
                AI Chat
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <CircleIcon
                  size={8}
                  weight="fill"
                  className={
                    connected ? "text-kumo-success" : "text-kumo-danger"
                  }
                />
                <Text size="xs" variant="secondary">
                  {connected ? "Connected" : "Disconnected"}
                </Text>
              </div>
              <div className="flex items-center gap-1.5">
                <BugIcon size={14} className="text-kumo-inactive" />
                <Switch
                  checked={showDebug}
                  onCheckedChange={setShowDebug}
                  size="sm"
                  aria-label="Toggle debug mode"
                />
              </div>
              <ThemeToggle />
              <Button
                variant="secondary"
                icon={<TrashIcon size={16} />}
                onClick={clearHistory}
              >
                Clear
              </Button>
            </div>
          </div>
        </header>

        {/* messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
            {messages.length === 0 && (
              <Empty
                icon={<ChatCircleDotsIcon size={32} />}
                title="Site Watchdog"
                contents={
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "Check https://example.com",
                      "Check https://cloudflare.com",
                      "What sites have I checked?",
                      "Schedule a check for https://example.com every 5 minutes"
                    ].map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        size="sm"
                        disabled={isStreaming}
                        onClick={() => {
                          sendMessage({
                            role: "user",
                            parts: [{ type: "text", text: prompt }]
                          });
                        }}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                }
              />
            )}

            {messages.map((message: UIMessage, index: number) => {
              const isUser = message.role === "user";
              const isLastAssistant =
                message.role === "assistant" && index === messages.length - 1;
              return (
                <div key={message.id} className="space-y-2">
                  {showDebug && (
                    <pre className="text-[11px] text-kumo-subtle bg-kumo-control rounded-lg p-3 overflow-auto max-h-64">
                      {JSON.stringify(message, null, 2)}
                    </pre>
                  )}

                  {/* tool parts */}
                  {message.parts.filter(isToolUIPart).map((part) => (
                    <ToolPartView
                      key={part.toolCallId}
                      part={part}
                      addToolApprovalResponse={addToolApprovalResponse}
                    />
                  ))}

                  {/* reasoning parts */}
                  {message.parts
                    .filter(
                      (part) =>
                        part.type === "reasoning" &&
                        (part as { text?: string }).text?.trim()
                    )
                    .map((part, i) => {
                      const reasoning = part as {
                        type: "reasoning";
                        text: string;
                        state?: "streaming" | "done";
                      };
                      const isDone = reasoning.state === "done" || !isStreaming;
                      return (
                        <div key={i} className="flex justify-start">
                          <details
                            className="max-w-[85%] w-full"
                            open={!isDone}
                          >
                            <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
                              <BrainIcon
                                size={14}
                                className="text-purple-400"
                              />
                              <span className="font-medium text-kumo-default">
                                Reasoning
                              </span>
                              {isDone ? (
                                <span className="text-xs text-kumo-success">
                                  Complete
                                </span>
                              ) : (
                                <span className="text-xs text-kumo-brand">
                                  Thinking...
                                </span>
                              )}
                              <CaretDownIcon
                                size={14}
                                className="ml-auto text-kumo-inactive"
                              />
                            </summary>
                            <pre className="mt-2 px-3 py-2 rounded-lg bg-kumo-control text-xs text-kumo-default whitespace-pre-wrap overflow-auto max-h-64">
                              {reasoning.text}
                            </pre>
                          </details>
                        </div>
                      );
                    })}

                  {/* image parts */}
                  {message.parts
                    .filter(
                      (part): part is Extract<typeof part, { type: "file" }> =>
                        part.type === "file" &&
                        (part as { mediaType?: string }).mediaType?.startsWith(
                          "image/"
                        ) === true
                    )
                    .map((part, i) => (
                      <div
                        key={`file-${i}`}
                        className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                      >
                        <img
                          src={part.url}
                          alt="Attachment"
                          className="max-h-64 rounded-xl border border-kumo-line object-contain"
                        />
                      </div>
                    ))}

                  {/* text parts */}
                  {message.parts
                    .filter((part) => part.type === "text")
                    .map((part, i) => {
                      const text = (part as { type: "text"; text: string })
                        .text;
                      if (!text) return null;
                      if (isUser) {
                        return (
                          <div key={i} className="flex justify-end">
                            <div className="max-w-[85%] px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                              {text}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={i} className="flex justify-start">
                          <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
                            <Streamdown
                              className="sd-theme rounded-2xl rounded-bl-md p-3"
                              controls={false}
                              isAnimating={isLastAssistant && isStreaming}
                            >
                              {text}
                            </Streamdown>
                          </div>
                        </div>
                      );
                    })}
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <ChatInput
          connected={connected}
          isStreaming={isStreaming}
          onSend={handleSend}
          onStop={stop}
        />
      </div>
      <DashboardPanel agent={agent} revision={dashboardRevision} />
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-screen text-kumo-inactive">
            Loading...
          </div>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
