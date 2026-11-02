import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.tsx";
import { ApiKeyGate } from "./components/api-key-gate.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiKeyGate>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ApiKeyGate>
    </QueryClientProvider>
  </StrictMode>,
);
