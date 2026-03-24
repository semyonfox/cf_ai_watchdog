// shared analysis utilities for the watchdog agent
import type { ModelMessage } from "ai";

/**
 * AI SDK workaround: the downloadAssets step runs new URL(data) on file
 * parts. data URIs parse as valid URLs causing failed HTTP fetches.
 * decode to Uint8Array so the SDK treats them as inline data.
 */
export function inlineDataUrls(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((msg) => {
    if (msg.role !== "user" || typeof msg.content === "string") return msg;
    return {
      ...msg,
      content: msg.content.map((part) => {
        if (part.type !== "file" || typeof part.data !== "string") return part;
        const match = part.data.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return part;
        const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
        return { ...part, data: bytes, mediaType: match[1] };
      }),
    };
  });
}

/** population standard deviation, rounded to 2 decimal places */
export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance) * 100) / 100;
}

/** safely parse a JSON headers string into a key-value Record */
export function parseHeaders(raw: unknown): Record<string, string> {
  if (typeof raw === "object" && raw !== null) return raw as Record<string, string>;
  if (typeof raw !== "string") return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

/** diff two header objects → added, removed, and changed keys */
export function diffHeaders(
  older: Record<string, string>,
  newer: Record<string, string>,
) {
  const added: Record<string, string> = {};
  const removed: Record<string, string> = {};
  const changed: { header: string; from: string; to: string }[] = [];
  const allKeys = new Set([...Object.keys(older), ...Object.keys(newer)]);
  for (const key of allKeys) {
    const inOld = key in older;
    const inNew = key in newer;
    if (!inOld && inNew) added[key] = newer[key];
    else if (inOld && !inNew) removed[key] = older[key];
    else if (inOld && inNew && older[key] !== newer[key])
      changed.push({ header: key, from: older[key], to: newer[key] });
  }
  return { added, removed, changed };
}

/** check which well-known security headers are present/missing */
export function auditSecurityHeaders(headers: Record<string, string>) {
  const present: Record<string, string> = {};
  const missing: string[] = [];
  function check(name: string) {
    if (headers[name]) present[name] = headers[name];
    else missing.push(name);
  }
  check("strict-transport-security");
  check("content-security-policy");
  check("x-content-type-options");
  check("x-frame-options");
  check("x-xss-protection");
  check("referrer-policy");
  check("permissions-policy");
  check("cross-origin-opener-policy");
  check("cross-origin-resource-policy");
  return { present, missing };
}
