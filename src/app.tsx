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
import { PrivacyControl } from "./components/PrivacyControl";
import { telemetry } from "./lib/telemetry";

function Chat() {
  const [connected, setConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dashboardRevision, setDashboardRevision] = useState(0);
  const [view, setView] = useState<"chat" | "dashboard">("chat");
  const [showLatest, setShowLatest] = useState(false);
  const [replyStatus, setReplyStatus] = useState("");
  const clearedRef = useRef(false);
  const stoppedRef = useRef(false);
  const nearBottomRef = useRef(true);
  const clearDialogRef = useRef<HTMLDialogElement>(null);
  const sendErrorRef = useRef<Error | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationRef = useRef<HTMLElement>(null);
  const toasts = useKumoToastManager();

  const agent = useAgent({
    agent: "ChatAgent",
    onOpen: useCallback(() => {
      setConnected(true);
      setDashboardRevision((revision) => revision + 1);
    }, []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(() => telemetry.error("request_failed"), []),
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
    status,
    error,
    clearError,
    isServerStreaming
  } = useAgentChat({
    agent,
    onError: (error) => {
      sendErrorRef.current = error;
      telemetry.error("request_failed");
    }
  });

  const isStreaming =
    status === "streaming" || status === "submitted" || isServerStreaming;

  useEffect(() => {
    if (messages.length === 0) {
      if (conversationRef.current) conversationRef.current.scrollTop = 0;
      nearBottomRef.current = true;
      return;
    }
    if (nearBottomRef.current)
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    else setShowLatest(true);
  }, [messages, view]);

  const wasStreaming = useRef(isStreaming);
  useEffect(() => {
    if (isStreaming && !wasStreaming.current) stoppedRef.current = false;
    if (wasStreaming.current && !isStreaming) {
      setDashboardRevision((revision) => revision + 1);
      const last = messages[messages.length - 1];
      const available =
        last?.role === "assistant" &&
        last.parts.some(
          (part) =>
            (part.type === "text" && part.text.trim().length > 0) ||
            (isToolUIPart(part) && part.state === "output-available")
        );
      setReplyStatus(
        error || sendErrorRef.current
          ? "The request did not finish. Check your connection and try again."
          : stoppedRef.current
            ? "Request stopped. Any results already received remain in Chat."
            : available
              ? view === "dashboard"
                ? "Response ready. Open Chat to read it."
                : nearBottomRef.current
                  ? "Response ready."
                  : "Response ready. Use Latest messages to read it."
              : "Request finished."
      );
    }
    if (isStreaming) setReplyStatus("Request in progress.");
    wasStreaming.current = isStreaming;
  }, [isStreaming, error, messages, view]);

  useEffect(() => {
    telemetry.count("screen_view", view === "dashboard" ? "dashboard" : "app");
  }, [view]);

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
    async (parts: MessagePart[]) => {
      if (!connected) throw new Error("Connection lost");
      sendErrorRef.current = null;
      clearError();
      try {
        await sendMessage({ role: "user", parts });
        // the chat SDK reports transport failures through onError without rejecting
        if (sendErrorRef.current) throw sendErrorRef.current;
        telemetry.count("action_completed");
      } catch (error) {
        telemetry.error("request_failed");
        throw error;
      }
    },
    [connected, clearError, sendMessage]
  );

  return (
    <div className="flex h-dvh min-h-[40rem] flex-col">
      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav
          aria-label="Workspace"
          className="flex shrink-0 gap-2 border-b border-kumo-line bg-kumo-base px-3 py-2 lg:hidden"
        >
          <Button
            variant={view === "chat" ? "primary" : "secondary"}
            aria-pressed={view === "chat"}
            aria-controls="chat-panel"
            onClick={() => setView("chat")}
            className="min-h-11 h-auto flex-1 whitespace-normal"
          >
            Chat
          </Button>
          <Button
            variant={view === "dashboard" ? "primary" : "secondary"}
            aria-pressed={view === "dashboard"}
            aria-controls="dashboard-panel"
            onClick={() => setView("dashboard")}
            className="min-h-11 h-auto flex-1 whitespace-normal"
          >
            Dashboard
          </Button>
        </nav>
        <div
          id="chat-panel"
          className={`${view === "chat" ? "flex" : "hidden"} lg:flex flex-col flex-1 min-h-0 min-w-0 bg-kumo-elevated relative`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex items-center justify-center bg-kumo-elevated/80 backdrop-blur-sm border-2 border-dashed border-kumo-brand rounded-xl m-2 pointer-events-none">
              <div className="flex flex-col items-center gap-2 text-kumo-brand">
                <ImageIcon size={40} />
                <Text variant="heading3" as="h3">
                  Paste images or use Attach images
                </Text>
              </div>
            </div>
          )}

          {/* header */}
          <header className="shrink-0 px-3 sm:px-5 py-3 bg-kumo-base border-b border-kumo-line">
            <div className="max-w-3xl mx-auto flex flex-wrap gap-3 items-center justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-lg font-semibold text-kumo-default">
                  Site Watchdog
                </h1>
                <Badge variant="secondary">
                  <ChatCircleDotsIcon
                    size={12}
                    weight="bold"
                    className="mr-1"
                  />
                  AI Chat
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <output className="flex items-center gap-1.5">
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
                </output>
                <div className="flex min-h-11 items-center gap-1.5">
                  <BugIcon size={14} className="text-kumo-inactive" />
                  <Switch
                    checked={showDebug}
                    onCheckedChange={setShowDebug}
                    size="lg"
                    aria-label="Toggle debug mode"
                  />
                </div>
                <ThemeToggle />
                <Button
                  variant="secondary"
                  icon={<TrashIcon size={16} />}
                  disabled={messages.length === 0 || !connected || isStreaming}
                  onClick={() => clearDialogRef.current?.showModal()}
                  className="min-h-11 h-auto whitespace-normal"
                >
                  Clear chat
                </Button>
              </div>
            </div>
          </header>

          {/* messages */}
          <section
            ref={conversationRef}
            className="flex-1 min-h-32 overflow-y-auto"
            aria-label="Conversation"
            onScroll={(event) => {
              const element = event.currentTarget;
              if (element.clientHeight === 0) return;
              nearBottomRef.current =
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                80;
              if (nearBottomRef.current) setShowLatest(false);
            }}
          >
            <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
              {messages.length === 0 && (
                <Empty
                  icon={<ChatCircleDotsIcon size={32} />}
                  title="Check a website"
                  contents={
                    <div className="w-full min-w-0 space-y-4">
                      <p className="text-sm text-kumo-secondary">
                        Paste a website URL to check its response time and
                        security headers. Ask to schedule recurring checks when
                        you want to monitor it.
                      </p>
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
                            disabled={isStreaming || !connected}
                            className="min-h-11 h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
                            onClick={() => {
                              void handleSend([
                                { type: "text", text: prompt }
                              ]).catch(() => {});
                            }}
                          >
                            {prompt}
                          </Button>
                        ))}
                      </div>
                    </div>
                  }
                />
              )}

              {messages.map((message: UIMessage, index: number) => {
                const isUser = message.role === "user";
                const isLastAssistant =
                  message.role === "assistant" && index === messages.length - 1;
                return (
                  <article
                    key={message.id}
                    aria-label={isUser ? "You" : "Site Watchdog"}
                    className="space-y-2"
                  >
                    <h2 className="sr-only">
                      {isUser ? "You" : "Site Watchdog"}
                    </h2>
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
                        const isDone =
                          reasoning.state === "done" || !isStreaming;
                        return (
                          <div key={i} className="flex justify-start">
                            <details
                              className="max-w-[85%] w-full"
                              open={!isDone}
                            >
                              <summary className="flex flex-wrap items-center gap-2 cursor-pointer px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm select-none">
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
                        (
                          part
                        ): part is Extract<typeof part, { type: "file" }> =>
                          part.type === "file" &&
                          (
                            part as { mediaType?: string }
                          ).mediaType?.startsWith("image/") === true
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
                              <div className="min-w-0 max-w-[85%] [overflow-wrap:anywhere] whitespace-pre-wrap px-4 py-2.5 rounded-2xl rounded-br-md bg-kumo-contrast text-kumo-inverse leading-relaxed">
                                {text}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="flex justify-start">
                            <div className="min-w-0 max-w-[95%] sm:max-w-[85%] [overflow-wrap:anywhere] overflow-x-auto rounded-2xl rounded-bl-md bg-kumo-base text-kumo-default leading-relaxed">
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
                  </article>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          </section>

          {showLatest && (
            <Button
              variant="secondary"
              onClick={() => {
                nearBottomRef.current = true;
                setShowLatest(false);
                messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
              }}
              className="self-center my-2 min-h-11"
            >
              Latest messages
            </Button>
          )}
          {error && (
            <p role="alert" className="px-5 py-2 text-sm text-kumo-danger">
              The request did not finish. Check your connection and try again.
              Any results already received remain in the conversation.
            </p>
          )}
          <ChatInput
            connected={connected}
            isStreaming={isStreaming}
            onSend={handleSend}
            onStop={() => {
              stoppedRef.current = true;
              stop();
            }}
          />
        </div>
        <div
          id="dashboard-panel"
          className={`${view === "dashboard" ? "flex" : "hidden"} lg:flex flex-1 lg:flex-none min-h-0 min-w-0`}
        >
          <DashboardPanel agent={agent} revision={dashboardRevision} />
        </div>
      </main>
      <output className="sr-only" aria-live="polite" aria-atomic="true">
        {replyStatus}
      </output>
      <PrivacyControl />
      <dialog
        ref={clearDialogRef}
        onClose={() => {
          if (clearedRef.current) {
            clearedRef.current = false;
            requestAnimationFrame(() => {
              const composer = document.querySelector<HTMLTextAreaElement>(
                'textarea[aria-label="Message to Site Watchdog"]'
              );
              if (composer && !composer.disabled) composer.focus();
              else document.getElementById("composer-hint")?.focus();
            });
          }
        }}
        aria-labelledby="clear-chat-title"
        aria-describedby="clear-chat-description"
        className="m-auto w-[calc(100%-2rem)] max-w-sm max-h-[90dvh] overflow-y-auto rounded-xl border border-kumo-line bg-kumo-base p-5 text-kumo-default backdrop:bg-black/40"
      >
        <h2 id="clear-chat-title" className="text-lg font-semibold">
          Clear this chat?
        </h2>
        <p id="clear-chat-description" className="mt-2 text-sm">
          This removes the conversation. Stored site checks and scheduled
          monitoring stay in place.
        </p>
        <form method="dialog" className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            type="submit"
            variant="secondary"
            autoFocus
            className="min-h-11 h-auto whitespace-normal"
          >
            Keep chat
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="min-h-11 h-auto whitespace-normal"
            onClick={() => {
              clearedRef.current = true;
              clearHistory();
              clearError();
              setShowLatest(false);
            }}
          >
            Clear chat
          </Button>
        </form>
      </dialog>
    </div>
  );
}

export default function App() {
  return (
    <Toasty>
      <Suspense
        fallback={
          <output className="flex items-center justify-center h-screen text-kumo-secondary">
            Loading...
          </output>
        }
      >
        <Chat />
      </Suspense>
    </Toasty>
  );
}
