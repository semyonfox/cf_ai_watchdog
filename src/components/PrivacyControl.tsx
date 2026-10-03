import { useRef, useState } from "react";
import { Button } from "@cloudflare/kumo";
import {
  telemetry,
  telemetryDisabled,
  telemetryPrivacyBlocked,
  setTelemetryDisabled
} from "../lib/telemetry";

export function PrivacyControl() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [disabled, setDisabled] = useState(telemetryDisabled);
  return (
    <>
      <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-kumo-line bg-kumo-base px-3 text-xs text-kumo-secondary">
        <span>
          {telemetry.configured && !disabled && !telemetryPrivacyBlocked()
            ? "Anonymous stats configured"
            : "Anonymous stats off"}
        </span>
        <Button
          variant="ghost"
          className="min-h-11 h-auto max-w-full whitespace-normal"
          onClick={() => dialog.current?.showModal()}
        >
          Privacy
        </Button>
      </footer>
      <dialog
        ref={dialog}
        aria-labelledby="privacy-title"
        aria-describedby="privacy-description"
        className="m-auto w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-xl border border-kumo-line bg-kumo-base p-5 text-kumo-default backdrop:bg-black/40"
      >
        <h2 id="privacy-title" className="text-lg font-semibold">
          Anonymous statistics
        </h2>
        <p id="privacy-description" className="mt-2 text-sm">
          Self-hosted screen and action counts and fixed error categories. No
          visitor tracking, chat contents, site URLs, images or recordings.
          Collection stays off until an owner endpoint is configured. Do Not
          Track and Global Privacy Control also disable it.
        </p>
        <label className="mt-4 flex min-h-11 items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={disabled}
            onChange={(event) => {
              setDisabled(setTelemetryDisabled(event.target.checked));
            }}
          />
          Disable anonymous statistics and error counts
        </label>
        <p className="mt-2 text-xs text-kumo-secondary">
          Only this preference is saved on this browser. When enabled, the
          collector must retain only daily totals for up to 30 days, or 14 days
          for error categories. No individual events or request metadata are
          stored.
        </p>
        <form method="dialog" className="mt-4 flex justify-end">
          <Button
            type="submit"
            variant="secondary"
            className="min-h-11 h-auto max-w-full whitespace-normal"
            autoFocus
          >
            Close privacy
          </Button>
        </form>
      </dialog>
    </>
  );
}
