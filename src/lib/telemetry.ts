import { createAnonymousTelemetry } from "./anonymousTelemetry";

const preferenceKey = "watchdog.telemetry.disabled";
export function telemetryDisabled(): boolean {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value !== null && value !== "false";
  } catch {
    return true;
  }
}

export function telemetryPrivacyBlocked(): boolean {
  try {
    const privacyNavigator: Navigator & { globalPrivacyControl?: boolean } =
      navigator;
    const privacyWindow: Window & { doNotTrack?: string } = window;
    return (
      telemetryDisabled() ||
      privacyNavigator.globalPrivacyControl === true ||
      navigator.doNotTrack === "1" ||
      navigator.doNotTrack === "yes" ||
      privacyWindow.doNotTrack === "1" ||
      privacyWindow.doNotTrack === "yes"
    );
  } catch {
    return true;
  }
}

export const telemetry = createAnonymousTelemetry(
  {
    enabled: import.meta.env.VITE_ANONYMOUS_TELEMETRY_ENABLED === "true",
    endpoint: import.meta.env.VITE_ANONYMOUS_TELEMETRY_ENDPOINT ?? ""
  },
  {
    privacyBlocked: telemetryPrivacyBlocked,
    fetch: (...args) => fetch(...args),
    now: () => Date.now(),
    controller: () => new AbortController(),
    schedule: (callback, delay) => window.setTimeout(callback, delay),
    cancel: (timer) => window.clearTimeout(timer)
  }
);

export function setTelemetryDisabled(value: boolean) {
  telemetry.setDisabled(value);
  try {
    localStorage.setItem(preferenceKey, String(value));
  } catch {
    telemetry.setDisabled(true);
    return true;
  }
  return value;
}
