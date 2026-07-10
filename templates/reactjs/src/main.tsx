import { initI18n } from "@/i18n/i18n";
import { AppQueryClientProvider } from "@/providers/query-client-provider";
import { router } from "@/router";
import { initServices } from "@/services";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import "@/styles/tailwind.css";
import "@/styles/main.css";

// 1. Wire axios base URLs + interceptors before any API calls.
initServices();

// 2. Boot i18n — reads persisted locale from localStorage.
const i18n = initI18n();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <StrictMode>
    <AppQueryClientProvider>
      <I18nextProvider i18n={i18n}>
        <RouterProvider router={router} />
      </I18nextProvider>
    </AppQueryClientProvider>
  </StrictMode>,
);
