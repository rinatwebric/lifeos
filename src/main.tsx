import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "@/App";
import "@/index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error('LifeOS could not start: element with id "root" was not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
