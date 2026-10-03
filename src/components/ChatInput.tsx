import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Button, InputArea } from "@cloudflare/kumo";
import {
  PaperPlaneRightIcon,
  StopIcon,
  PaperclipIcon,
  XIcon
} from "@phosphor-icons/react";

// shared type for message parts sent to the agent
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string };

interface Attachment {
  id: string;
  file: File;
  preview: string;
  mediaType: string;
}

function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image could not be read"));
    };
    reader.onerror = () => reject(new Error("Image could not be read"));
    reader.readAsDataURL(file);
  });
}

// reducer keeps all attachment state transitions in one place
type AttachmentAction =
  | { kind: "add"; files: File[] }
  | { kind: "remove"; id: string }
  | { kind: "clear" };

function attachmentReducer(
  state: Attachment[],
  action: AttachmentAction
): Attachment[] {
  switch (action.kind) {
    case "add": {
      const images = action.files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return state;
      return [
        ...state,
        ...images.map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          preview: URL.createObjectURL(file),
          mediaType: file.type || "application/octet-stream"
        }))
      ];
    }
    case "remove": {
      const target = state.find((a) => a.id === action.id);
      if (target) URL.revokeObjectURL(target.preview);
      return state.filter((a) => a.id !== action.id);
    }
    case "clear":
      for (const att of state) URL.revokeObjectURL(att.preview);
      return [];
  }
}

export function ChatInput({
  connected,
  isStreaming,
  onSend,
  onStop
}: {
  connected: boolean;
  isStreaming: boolean;
  onSend: (parts: MessagePart[]) => Promise<void>;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, dispatch] = useReducer(attachmentReducer, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hintRef = useRef<HTMLOutputElement>(null);
  const sendingRef = useRef(false);
  const connectedRef = useRef(connected);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const busy = isStreaming || sending;
  const attachmentsRef = useRef<Attachment[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(
    () => () => {
      for (const attachment of attachmentsRef.current)
        URL.revokeObjectURL(attachment.preview);
    },
    []
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      dispatch({ kind: "add", files });
    }
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (
      (!text && attachments.length === 0) ||
      isStreaming ||
      sendingRef.current ||
      !connectedRef.current
    )
      return;
    sendingRef.current = true;
    setSending(true);
    setSendError(null);
    try {
      const parts: MessagePart[] = [];
      if (text) parts.push({ type: "text", text });
      for (const att of attachments) {
        const url = await fileToDataUri(att.file);
        parts.push({ type: "file", mediaType: att.mediaType, url });
      }
      if (!connectedRef.current) throw new Error("Connection lost");
      await onSend(parts);
      setInput("");
      dispatch({ kind: "clear" });
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch {
      setSendError(
        "The request did not finish. Your draft is saved here. Check the conversation before sending it again."
      );
    } finally {
      sendingRef.current = false;
      setSending(false);
      requestAnimationFrame(() => {
        if (
          formRef.current?.contains(document.activeElement) ||
          document.activeElement === document.body
        )
          textareaRef.current?.focus();
      });
    }
  }, [input, attachments, isStreaming, onSend]);

  return (
    <div className="shrink-0 border-t border-kumo-line bg-kumo-base">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="max-w-3xl mx-auto px-3 sm:px-5 py-3"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files)
              dispatch({ kind: "add", files: [...e.target.files] });
            e.target.value = "";
          }}
        />
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="relative group rounded-lg border border-kumo-line bg-kumo-control overflow-hidden"
              >
                <img
                  src={att.preview}
                  alt={att.file.name}
                  className="h-16 w-16 object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    dispatch({ kind: "remove", id: att.id });
                    requestAnimationFrame(() => {
                      if (connectedRef.current) textareaRef.current?.focus();
                      else {
                        const next =
                          formRef.current?.querySelector<HTMLButtonElement>(
                            'button[aria-label^="Remove "]'
                          );
                        if (next) next.focus();
                        else hintRef.current?.focus();
                      }
                    });
                  }}
                  className="absolute top-0 right-0 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-2 focus-visible:ring-2 focus-visible:ring-kumo-ring"
                  aria-label={`Remove ${att.file.name}`}
                >
                  <XIcon size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-3 rounded-xl border border-kumo-line bg-kumo-base p-3 shadow-sm focus-within:ring-2 focus-within:ring-kumo-ring focus-within:border-transparent transition-shadow">
          <Button
            type="button"
            variant="ghost"
            shape="square"
            aria-label="Attach images"
            icon={<PaperclipIcon size={18} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={!connected || busy}
            className="mb-0.5 min-h-11 min-w-11"
          />
          <InputArea
            ref={textareaRef}
            value={input}
            aria-label="Message to Site Watchdog"
            aria-describedby="composer-hint"
            onValueChange={setInput}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                e.keyCode !== 229
              ) {
                e.preventDefault();
                send();
              }
            }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onPaste={handlePaste}
            placeholder={
              attachments.length > 0
                ? "Add a message or send images..."
                : "URL or question..."
            }
            disabled={!connected || busy}
            rows={1}
            className="min-w-0 flex-1 text-base sm:text-sm ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              shape="square"
              aria-label="Stop generation"
              icon={<StopIcon size={18} />}
              onClick={onStop}
              className="mb-0.5 min-h-11 min-w-11"
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send message"
              disabled={
                (!input.trim() && attachments.length === 0) ||
                !connected ||
                sending
              }
              icon={<PaperPlaneRightIcon size={18} />}
              className="mb-0.5 min-h-11 min-w-11"
            />
          )}
        </div>
        <output
          ref={hintRef}
          tabIndex={-1}
          id="composer-hint"
          className="block mt-2 text-xs text-kumo-secondary"
        >
          {!connected
            ? "Reconnecting. Your draft stays here until the connection returns."
            : isStreaming
              ? "Request in progress. Use Stop to end the response."
              : sending
                ? "Preparing request..."
                : "Enter to send, Shift+Enter for a new line. Images can be attached or pasted."}
        </output>
        {sendError && (
          <p role="alert" className="mt-2 text-sm text-kumo-danger">
            {sendError}
          </p>
        )}
      </form>
    </div>
  );
}
