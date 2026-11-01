import { findElement } from "./findElement.js";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "failed";
export type PanelField = "title" | "connection" | "protocol" | "info" | "capabilities" | "weight";
export type PanelAction = "tare" | "disconnect" | "reconnect";

/** Past this many errors the oldest go, so a long failing session can't grow the page forever. */
export const MAX_ERRORS_SHOWN = 50;

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "connecting…",
  connected: "connected",
  disconnected: "disconnected",
  failed: "connect failed",
};

/** One scale's part of the page. */
export interface ScalePanel {
  show(field: PanelField, text: string): void;
  setConnection(state: ConnectionState): void;
  addError(text: string): void;
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

  function show(name: PanelField, text: string): void {
    field(name).textContent = text;
  }

  return {
    show,
    setConnection(state) {
      show("connection", CONNECTION_TEXT[state]);
      button("tare").disabled = state !== "connected";
      button("disconnect").disabled = state !== "connected";
      button("reconnect").disabled = state === "connected" || state === "connecting";
    },
    addError(text) {
      const errors = field("errors");
      errors.append(Object.assign(document.createElement("li"), { textContent: text }));
      if (errors.children.length > MAX_ERRORS_SHOWN) errors.firstElementChild?.remove();
    },
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
