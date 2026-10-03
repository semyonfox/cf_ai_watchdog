import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./app";
import { telemetry } from "./lib/telemetry";

telemetry.count("app_open");

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
