import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@hangcord/ui/tokens.css";
import "@hangcord/ui/components.css";
import "./app.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
