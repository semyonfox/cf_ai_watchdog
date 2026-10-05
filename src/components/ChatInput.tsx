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
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
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
  onSend: (parts: MessagePart[]) => void;
  onStop: () => void;
}) {
  const [input, setInput] = useState("");
  const [attachments, dispatch] = useReducer(attachmentReducer, []);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if ((!text && attachments.length === 0) || isStreaming) return;
    setInput("");
    const parts: MessagePart[] = [];
    if (text) parts.push({ type: "text", text });
    for (const att of attachments) {
      const url = await fileToDataUri(att.file);
      parts.push({ type: "file", mediaType: att.mediaType, url });
    }
    dispatch({ kind: "clear" });
    onSend(parts);
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }, [input, attachments, isStreaming, onSend]);

  // re-focus input after streaming ends
  const prevStreaming = useRef(isStreaming);
  useEffect(() => {
    const wasStreaming = prevStreaming.current;
    prevStreaming.current = isStreaming;
    if (wasStreaming && !isStreaming) textareaRef.current?.focus();
  }, [isStreaming]);

  return (
    <div className="border-t border-kumo-line bg-kumo-base">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="max-w-3xl mx-auto px-5 py-4"
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
                  onClick={() => dispatch({ kind: "remove", id: att.id })}
                  className="absolute top-0.5 right-0.5 rounded-full bg-kumo-contrast/80 text-kumo-inverse p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Remove ${att.file.name}`}
                >
                  <XIcon size={10} />
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
            disabled={!connected || isStreaming}
            className="mb-0.5"
          />
          <InputArea
            ref={textareaRef}
            value={input}
            onValueChange={setInput}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
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
                : "Send a message..."
            }
            disabled={!connected || isStreaming}
            rows={1}
            className="flex-1 ring-0! focus:ring-0! shadow-none! bg-transparent! outline-none! resize-none max-h-40"
          />
          {isStreaming ? (
            <Button
              type="button"
              variant="secondary"
              shape="square"
              aria-label="Stop generation"
              icon={<StopIcon size={18} />}
              onClick={onStop}
              className="mb-0.5"
            />
          ) : (
            <Button
              type="submit"
              variant="primary"
              shape="square"
              aria-label="Send message"
              disabled={
                (!input.trim() && attachments.length === 0) || !connected
              }
              icon={<PaperPlaneRightIcon size={18} />}
              className="mb-0.5"
            />
          )}
        </div>
      </form>
    </div>
  );
}
