import assert from "node:assert/strict";
import { test } from "node:test";
import { createAnonymousTelemetry } from "../src/lib/anonymousTelemetry.ts";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

function harness(config = {}, overrides = {}) {
  const requests = [];
  const timers = new Map();
  let clock = 100000;
  let blocked = false;
  const environment = {
    privacyBlocked: () => blocked,
    now: () => clock,
    controller: () => new AbortController(),
    schedule(callback) {
      timers.set(timers.size + 1, callback);
      return timers.size;
    },
    cancel(timer) {
      timers.delete(timer);
    },
    fetch(url, options) {
      requests.push({ url, options });
      return Promise.resolve(new Response(null, { status: 204 }));
    },
    ...overrides
  };
  const client = createAnonymousTelemetry(
    {
      enabled: true,
      endpoint: "https://collector.example/v1/events",
      ...config
    },
    environment
  );
  return {
    client,
    requests,
    timers,
    environment,
    tick: (amount) => {
      clock += amount;
    },
    block: () => {
      blocked = true;
    }
  };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

test("default-off and missing or unsafe endpoints never touch privacy or transport", () => {
  for (const config of [
    { enabled: false },
    { endpoint: "" },
    { endpoint: "http://collector.example/v1/events" },
    { endpoint: "//collector.example/v1/events" },
    { endpoint: "https://user:secret@collector.example/v1/events" },
    { endpoint: "https://collector.example/v1/events?private=id" },
    { endpoint: "https://collector.example/v1/events#private" },
    { endpoint: "https://collector.example/other" }
  ]) {
    const h = harness(config, {
      privacyBlocked() {
        throw new Error("must not read");
      }
    });
    h.client.count("app_open");
    h.client.error("request_failed");
    assert.equal(h.requests.length, 0);
  }
});

test("page opt-out and privacy opt-out drop counts and errors", () => {
  for (const explicit of [false, true]) {
    const h = harness();
    if (explicit) h.client.setDisabled(true);
    else h.block();
    h.client.count("screen_view", "dashboard");
    h.client.error("request_failed");
    assert.equal(h.requests.length, 0);
  }
});

test("throwing privacy getters fail closed without affecting caller or recovery", async () => {
  for (const field of [
    "globalPrivacyControl",
    "doNotTrack",
    "storedPreference"
  ]) {
    const h = harness(
      {},
      {
        privacyBlocked() {
          const privacy = Object.defineProperty({}, field, {
            get() {
              throw new Error("private fixture");
            }
          });
          return privacy[field];
        }
      }
    );
    assert.doesNotThrow(() => h.client.count("app_open"));
    assert.doesNotThrow(() => h.client.error("request_failed"));
    assert.equal(h.requests.length, 0);
    h.environment.privacyBlocked = () => false;
    h.client.count("app_open");
    await settle();
    assert.equal(h.requests.length, 1);
  }
});

test("payload has exactly six allowlisted fields, and private values cannot enter", async () => {
  const h = harness();
  const privateText =
    "private chat, synthetic-user-id, https://private.example/?token=fixture";
  h.client.count("screen_view", privateText);
  await settle();
  h.client.error("request_failed", "dashboard");
  await settle();
  h.client.error(new Error(privateText));
  h.client.count(privateText);
  assert.equal(h.requests.length, 2);
  for (const { options, url } of h.requests) {
    const payload = JSON.parse(options.body);
    assert.deepEqual(Object.keys(payload).sort(), [
      "app",
      "kind",
      "name",
      "route",
      "surface",
      "version"
    ]);
    assert.equal(payload.app, "cf-ai-watchdog");
    assert.equal(payload.surface, "web");
    assert.equal(payload.version, 1);
    assert.ok(["app", "dashboard"].includes(payload.route));
    assert.equal(options.credentials, "omit");
    assert.equal(options.referrerPolicy, "no-referrer");
    assert.equal(options.redirect, "error");
    assert.equal(options.cache, "no-store");
    assert.ok(Buffer.byteLength(options.body) < 1024);
    assert.equal((url + options.body).includes(privateText), false);
  }
});

test("transport failures are harmless and never retried", async () => {
  for (const synchronous of [false, true]) {
    let calls = 0;
    const h = harness(
      {},
      {
        fetch() {
          calls++;
          if (synchronous) throw new Error("private");
          return Promise.reject(new Error("private"));
        }
      }
    );
    assert.doesNotThrow(() => h.client.count("app_open"));
    await settle();
    assert.equal(calls, 1);
    assert.equal(h.timers.size, 0);
    h.client.count("screen_view");
    await settle();
    assert.equal(calls, 2);
  }
});

test("one request in flight; timeout and disabling abort only the owned request", async () => {
  let resolve;
  const h = harness(
    {},
    {
      fetch(url, options) {
        h.requests.push({ url, options });
        return new Promise((done) => {
          resolve = done;
        });
      }
    }
  );
  h.client.count("app_open");
  h.client.count("screen_view");
  assert.equal(h.requests.length, 1);
  [...h.timers.values()][0]();
  assert.equal(h.requests[0].options.signal.aborted, true);
  h.client.count("screen_view");
  assert.equal(h.requests.length, 1);
  resolve(new Response(null, { status: 204 }));
  await settle();
  h.client.count("screen_view");
  assert.equal(h.requests.length, 2);
  h.client.setDisabled(true);
  assert.equal(h.requests[1].options.signal.aborted, true);
  resolve(new Response(null, { status: 204 }));
  await settle();
  h.client.count("screen_view");
  assert.equal(h.requests.length, 2);
});

test("throwing controller or timeout setup dispatches nothing and allows recovery", async () => {
  for (const field of ["controller", "schedule"]) {
    const h = harness();
    const original = h.environment[field];
    h.environment[field] = () => {
      throw new Error("setup failure");
    };
    assert.doesNotThrow(() => h.client.count("app_open"));
    assert.doesNotThrow(() => h.client.error("request_failed"));
    assert.equal(h.requests.length, 0);
    h.environment[field] = original;
    h.client.count("app_open");
    await settle();
    assert.equal(h.requests.length, 1);
  }
});

test("throwing timer cancellation releases request ownership without surfacing", async () => {
  const h = harness(
    {},
    {
      cancel() {
        throw new Error("timer failure");
      }
    }
  );
  h.client.count("app_open");
  await settle();
  h.client.count("screen_view");
  await settle();
  assert.equal(h.requests.length, 2);
});

test("twenty events per minute and two hundred per app lifetime", async () => {
  const h = harness();
  for (let index = 0; index < 25; index++) {
    h.client.count("screen_view");
    await settle();
  }
  assert.equal(h.requests.length, 20);
  for (let minute = 1; minute < 12; minute++) {
    h.tick(60000);
    for (let index = 0; index < 25; index++) {
      h.client.count("screen_view");
      await settle();
    }
  }
  assert.equal(h.requests.length, 200);
});

test("repeated errors are suppressed for sixty seconds without a retry queue", async () => {
  const h = harness();
  h.client.error("request_failed", "dashboard");
  await settle();
  h.client.error("request_failed", "dashboard");
  await settle();
  assert.equal(h.requests.length, 1);
  h.tick(60000);
  h.client.error("request_failed", "dashboard");
  await settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.timers.size, 0);
});

let browserFixture = 0;
async function withBrowserTelemetry(options, run) {
  const saved = new Map();
  const requests = [];
  const preferences = new Map();
  const privacyNavigator = {};
  const privacyWindow = { setTimeout: () => 1, clearTimeout() {} };
  if (options.navigator)
    Object.defineProperties(privacyNavigator, options.navigator);
  if (options.window) Object.defineProperties(privacyWindow, options.window);
  const globals = {
    navigator: privacyNavigator,
    window: privacyWindow,
    localStorage: {
      getItem(key) {
        if (options.readThrows) throw new Error("unreadable preference");
        return options.preference ?? preferences.get(key) ?? null;
      },
      setItem(key, value) {
        if (options.writeThrows) throw new Error("unwritable preference");
        preferences.set(key, value);
      }
    },
    fetch(url, settings) {
      requests.push({ url, settings });
      return Promise.resolve(new Response(null, { status: 204 }));
    }
  };
  for (const [key, value] of Object.entries(globals)) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true
    });
  }
  try {
    let source = stripTypeScriptTypes(
      await readFile(
        new URL("../src/lib/telemetry.ts", import.meta.url),
        "utf8"
      )
    );
    source = source.replace(
      '"./anonymousTelemetry"',
      JSON.stringify(
        new URL("../src/lib/anonymousTelemetry.ts", import.meta.url).href
      )
    );
    source = source.replaceAll(
      "import.meta.env",
      JSON.stringify({
        VITE_ANONYMOUS_TELEMETRY_ENABLED:
          options.enabled === false ? "false" : "true",
        VITE_ANONYMOUS_TELEMETRY_ENDPOINT: "/v1/events"
      })
    );
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${browserFixture++}`
    );
    await run(module, requests, preferences);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test("actual browser reader honors DNT, GPC, malformed and unreadable preferences", async () => {
  const throws = {
    configurable: true,
    get() {
      throw new Error("synthetic private setting");
    }
  };
  for (const options of [
    { navigator: { globalPrivacyControl: { value: true } } },
    { navigator: { doNotTrack: { value: "1" } } },
    { navigator: { doNotTrack: { value: "yes" } } },
    { window: { doNotTrack: { value: "1" } } },
    { window: { doNotTrack: { value: "yes" } } },
    { navigator: { globalPrivacyControl: throws } },
    { navigator: { doNotTrack: throws } },
    { window: { doNotTrack: throws } },
    { readThrows: true },
    { preference: "true" },
    { preference: "unreadable" }
  ]) {
    await withBrowserTelemetry(options, async (module, requests) => {
      assert.equal(module.telemetryPrivacyBlocked(), true);
      assert.doesNotThrow(() => module.telemetry.count("app_open"));
      assert.doesNotThrow(() => module.telemetry.error("request_failed"));
      await settle();
      assert.equal(requests.length, 0);
    });
  }
});

test("actual browser defaults off, emits allowlisted configuration, and persists only disable boolean", async () => {
  await withBrowserTelemetry({ enabled: false }, async (module, requests) => {
    module.telemetry.count("app_open");
    await settle();
    assert.equal(requests.length, 0);
  });
  await withBrowserTelemetry({}, async (module, requests, preferences) => {
    module.telemetry.count("screen_view", "dashboard");
    await settle();
    assert.equal(requests.length, 1);
    assert.equal(JSON.parse(requests[0].settings.body).route, "dashboard");
    module.setTelemetryDisabled(true);
    module.telemetry.error("request_failed");
    await settle();
    assert.equal(requests.length, 1);
    assert.deepEqual(
      [...preferences],
      [["watchdog.telemetry.disabled", "true"]]
    );
    module.setTelemetryDisabled(false);
    module.telemetry.count("screen_view");
    await settle();
    assert.equal(requests.length, 2);
    assert.deepEqual(
      [...preferences],
      [["watchdog.telemetry.disabled", "false"]]
    );
  });
});

test("unwritable preference keeps actual browser client disabled and cannot interrupt UI", async () => {
  await withBrowserTelemetry(
    { writeThrows: true },
    async (module, requests) => {
      assert.equal(module.setTelemetryDisabled(false), true);
      module.telemetry.count("app_open");
      module.telemetry.error("request_failed");
      await settle();
      assert.equal(requests.length, 0);
    }
  );
});
