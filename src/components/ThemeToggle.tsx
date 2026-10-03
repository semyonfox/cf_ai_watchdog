import { useCallback, useState } from "react";
import { Button } from "@cloudflare/kumo";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.getAttribute("data-mode") === "dark"
  );

  const toggle = useCallback(() => {
    const next = !dark;
    setDark(next);
    const mode = next ? "dark" : "light";
    document.documentElement.setAttribute("data-mode", mode);
    document.documentElement.style.colorScheme = mode;
    try {
      localStorage.setItem("theme", mode);
    } catch {
      /* theme remains usable without storage */
    }
  }, [dark]);

  return (
    <Button
      variant="secondary"
      shape="square"
      icon={dark ? <SunIcon size={16} /> : <MoonIcon size={16} />}
      onClick={toggle}
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      className="min-h-11 min-w-11"
    />
  );
}
