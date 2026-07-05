import React from "react";
import ReactDOM from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18n from "../shared/i18n";
import { App } from "./App";
import "./styles.css";

function logRendererError(message: string, stack?: string, source?: string): void {
  void window.suwol?.writeRendererLog({
    level: "error",
    message,
    stack,
    source
  });
}

window.addEventListener("error", (event) => {
  logRendererError(event.message, event.error instanceof Error ? event.error.stack : undefined, event.filename);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  logRendererError(
    reason instanceof Error ? reason.message : String(reason),
    reason instanceof Error ? reason.stack : undefined,
    "unhandledrejection"
  );
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </React.StrictMode>
);
