import { addErrorLine, describeErrorLine, type ErrorLine } from "./errorLines.js";
import { findElement } from "./findElement.js";

export type ConnectionState = "connecting" | "waiting" | "connected" | "disconnected" | "failed";
export type PanelField = "title" | "connection" | "protocol" | "info" | "capabilities" | "weight";
export type PanelAction = "tare" | "disconnect" | "reconnect" | "cancel";

/** A field with nothing to show, so a stale value never reads as live. */
export const EMPTY_FIELD = "–";

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "connecting…",
  waiting: "waiting for the scale to advertise…",
  connected: "connected",
  disconnected: "disconnected",
  failed: "connect failed",
};

/** One scale's part of the page. */
export interface ScalePanel {
  show(field: PanelField, text: string): void;
  setConnection(state: ConnectionState): void;
  addError(text: string): void;
  /** Something worth knowing that isn't a failure; it joins the same list, marked as a note. */
  addNote(text: string): void;
  onAction(action: PanelAction, handler: () => void): void;
  /** Gets the export form's answers once the browser has validated them. */
  onExport(handler: (answers: FormData) => void): void;
}

/** Adds a panel, from the page's `#scale-panel` template, to `container`. */
export function createScalePanel(container: Element): ScalePanel {
  const template = findElement(document, "#scale-panel", HTMLTemplateElement);
  const root = findElement(document.importNode(template.content, true), "section", HTMLElement);
  container.append(root);
  const field = (name: string) => findElement(root, `[data-field="${name}"]`, HTMLElement);
  const button = (action: PanelAction) =>
    findElement(root, `[data-action="${action}"]`, HTMLButtonElement);
  const form = findElement(root, "form", HTMLFormElement);
  const errorLines: ErrorLine[] = [];

  function show(name: PanelField, text: string): void {
    field(name).textContent = text;
  }

  function addLine(text: string): void {
    addErrorLine(errorLines, text);
    const item = (line: ErrorLine) =>
      Object.assign(document.createElement("li"), { textContent: describeErrorLine(line) });
    field("errors").replaceChildren(...errorLines.map(item));
  }

  return {
    show,
    setConnection(state) {
      show("connection", CONNECTION_TEXT[state]);
      button("tare").disabled = state !== "connected";
      button("disconnect").disabled = state !== "connected";
      button("reconnect").disabled = state !== "disconnected" && state !== "failed";
      button("cancel").disabled = state !== "waiting";
    },
    addError: addLine,
    addNote: (text) => addLine(`Note: ${text}`),
    onAction(action, handler) {
      button(action).addEventListener("click", handler);
    },
    onExport(handler) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handler(new FormData(form));
      });
    },
  };
}
