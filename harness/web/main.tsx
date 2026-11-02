import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { supportProblem } from "./explainFailure.js";

const root = document.getElementById("root");
if (!root) throw new Error("harness markup has no #root");
createRoot(root).render(
  <StrictMode>
    <App supportProblem={supportProblem()} />
  </StrictMode>,
);
