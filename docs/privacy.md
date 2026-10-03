# Anonymous statistics

Collection is off by default. No endpoint is bundled unless the owner explicitly configures both `VITE_ANONYMOUS_TELEMETRY_ENABLED=true` and `VITE_ANONYMOUS_TELEMETRY_ENDPOINT`. The endpoint must be an HTTPS `/v1/events` URL without credentials, a query or fragment, or the same-origin path `/v1/events`. Configuration alone does not deploy a collector or proxy.

Each optional POST contains exactly `version`, `app`, `kind`, `name`, `surface` and `route`. App and surface are fixed to `cf-ai-watchdog` and `web`. Routes are static `app` or `dashboard` categories. Counts use fixed names for opening the app, viewing a screen and completing an action. Recoverable request failures use the fixed `request_failed` category. Message parts, site URLs, task descriptions, attachment names, raw exceptions, stacks and identifiers never enter the reporting API.

Do Not Track, Global Privacy Control and the Privacy dialog disable reporting. Unreadable privacy settings fail closed. The browser stores only the disable boolean, independently of the existing theme preference. No visitor identifiers, event queue, cookies or telemetry-derived state are persisted. Requests omit credentials and referrers and reject redirects.

Limits are 20 events per minute, 200 per app lifetime and one in-flight request. Repeated error categories on the same static route are suppressed for 60 seconds. The two-second timeout is armed before dispatch. Failures are dropped without retry and never affect chat, approvals or dashboard recovery.

Before enabling an owner collector, enforce the shared ingestion contract: only daily aggregate totals, at most 30 days for counts and 14 days for errors, hourly expiry, no raw events or request metadata. The dedicated proxy must disable access logs, strip cookies, authorization, referrers, user agents and forwarding addresses, and enforce body/time limits with an explicit origin allowlist. Necessary security audit logs remain separate. This branch does not activate or deploy collection.

Run privacy regressions with `node --test tests/anonymousTelemetry.test.mjs`. Browser verification uses synthetic chat and dashboard transports; it does not establish deployed retention, actual assistive-technology behavior or live monitoring accuracy.
