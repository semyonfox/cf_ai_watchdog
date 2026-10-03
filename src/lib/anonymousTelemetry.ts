const countNames = [
  "app_open",
  "screen_view",
  "action_completed",
  "action_failed"
] as const;
const errorNames = [
  "unexpected_error",
  "request_failed",
  "render_failed",
  "storage_failed",
  "permission_failed",
  "media_failed",
  "validation_failed"
] as const;
type CountName = (typeof countNames)[number];
type ErrorName = (typeof errorNames)[number];
type Route = "app" | "dashboard";

export interface TelemetryEnvironment {
  privacyBlocked: () => boolean;
  fetch: typeof fetch;
  now: () => number;
  controller: () => AbortController;
  schedule: (callback: () => void, delay: number) => number;
  cancel: (timer: number) => void;
}

function safeEndpoint(endpoint: string): boolean {
  if (endpoint === "/v1/events") return true;
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      url.pathname === "/v1/events" &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function createAnonymousTelemetry(
  config: { enabled: boolean; endpoint: string },
  environment: TelemetryEnvironment
) {
  const configured = config.enabled === true && safeEndpoint(config.endpoint);
  let disabled = false;
  let inFlight: AbortController | null = null;
  let sent = 0;
  let recent: number[] = [];
  const errors = new Map<string, number>();

  function record(
    kind: "count" | "error",
    name: CountName | ErrorName,
    route: Route
  ) {
    // optional reporting must never interrupt the product, even if privacy APIs throw
    try {
      if (!configured || disabled || inFlight || environment.privacyBlocked())
        return;
      const allowed = kind === "count" ? countNames : errorNames;
      if (!allowed.some((value) => value === name)) return;
      const category = route === "dashboard" ? "dashboard" : "app";
      const now = environment.now();
      if (!Number.isFinite(now)) return;
      recent = recent.filter((time) => now - time < 60000);
      const key = `${name}:${category}`;
      const previousError = errors.get(key);
      if (
        sent >= 200 ||
        recent.length >= 20 ||
        (kind === "error" &&
          previousError !== undefined &&
          now - previousError < 60000)
      )
        return;
      const controller = environment.controller();
      let timer: number;
      // arm the timeout before dispatch; setup failure must not leave a pending request
      timer = environment.schedule(() => {
        try {
          controller.abort();
        } catch {
          /* reporting remains optional */
        }
      }, 2000);
      inFlight = controller;
      const cleanup = () => {
        try {
          environment.cancel(timer);
        } catch {
          /* no retry or persistent queue */
        }
        if (inFlight === controller) inFlight = null;
      };
      const body = JSON.stringify({
        version: 1,
        app: "cf-ai-watchdog",
        kind,
        name,
        surface: "web",
        route: category
      });
      sent++;
      recent.push(now);
      if (kind === "error") errors.set(key, now);
      try {
        Promise.resolve(
          environment.fetch(config.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            credentials: "omit",
            referrerPolicy: "no-referrer",
            redirect: "error",
            cache: "no-store",
            signal: controller.signal
          })
        ).then(cleanup, cleanup);
      } catch {
        cleanup();
      }
    } catch {
      /* unreadable privacy settings or unavailable APIs drop the event */
    }
  }

  return {
    configured,
    setDisabled(value: boolean) {
      disabled = value;
      if (disabled) {
        try {
          inFlight?.abort();
        } catch {
          /* do not affect app flow */
        }
      }
    },
    count(name: CountName, route: Route = "app") {
      record("count", name, route);
    },
    error(name: ErrorName, route: Route = "app") {
      record("error", name, route);
    }
  };
}
