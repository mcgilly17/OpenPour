import {
  type CommandAvailability,
  KNOWN_COMMANDS,
  type KnownCommand,
} from "./commandAvailability.js";
import { createCompareView, type FindEarlier } from "./createCompareView.js";
import { createLogView } from "./createLogView.js";
import { addErrorLine, describeErrorLine, type ErrorLine } from "./errorLines.js";
import { findElement } from "./findElement.js";
import type { LogEntry } from "./LogEntry.js";
import type { DeviceInfoField } from "./readDeviceInfo.js";

export type ConnectionState =
  | "connecting"
  | "waiting"
  | "listening"
  | "connected"
  | "disconnected"
  | "failed";
export type PanelField =
  | "title"
  | "connection"
  | "protocol"
  | "info"
  | "capabilities"
  | "weight"
  | "timer"
  | "battery"
  | DeviceInfoField;
export type PanelAction =
  | "disconnect"
  | "reconnect"
  | "listen"
  | "startSession"
  | "cancel"
  | KnownCommand;

/** One kept recording as its row in the panel's list. */
export interface RecordingSummary {
  id: number;
  text: string;
  canDiscard: boolean;
}

/** A field with nothing to show, so a stale value never reads as live. */
export const EMPTY_FIELD = "–";

const CONNECTION_TEXT: Record<ConnectionState, string> = {
  connecting: "connecting…",
  waiting: "waiting for the scale to advertise…",
  listening: "listening only: nothing is sent",
  connected: "connected",
  disconnected: "disconnected",
  failed: "connect failed",
};

/** One scale's part of the page. */
export interface ScalePanel {
  show(field: PanelField, text: string): void;
  setConnection(state: ConnectionState): void;
  /** Enables each driver command, or disables it and shows why. */
  setCommands(availability: CommandAvailability): void;
  showRecordings(recordings: readonly RecordingSummary[]): void;
  log(entry: LogEntry): void;
  addError(text: string): void;
  /** Something worth knowing that isn't a failure; it joins the same list, marked as a note. */
  addNote(text: string): void;
  onAction(action: PanelAction, handler: () => void): void;
  /** Gets the export form's answers, with the chosen `recording`, once the browser validated them. */
  onExport(handler: (answers: FormData) => void): void;
  onDiscard(handler: (recording: number) => void): void;
  /** Answers the compare view's "find earlier" with runs from the scale's kept recordings. */
  onFindEarlier(handler: FindEarlier): void;
}

function recordingItem({ id, text, canDiscard }: RecordingSummary): HTMLLIElement {
  const item = document.createElement("li");
  const exportButton = Object.assign(document.createElement("button"), {
    type: "submit",
    name: "recording",
    value: String(id),
    textContent: "Export",
  });
  const discard = Object.assign(document.createElement("button"), {
    type: "button",
    textContent: "Discard",
    disabled: !canDiscard,
  });
  discard.dataset.discard = String(id);
  item.append(`${text} `, exportButton, " ", discard);
  return item;
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
  const logView = createLogView(findElement(root, '[data-part="log"]', HTMLElement));
  const compareView = createCompareView(findElement(root, '[data-part="compare"]', HTMLElement));
  logView.onMark((slot, run) => compareView.mark(slot, run));
  compareView.onMarksChanged((marks) => logView.showMarks(marks));
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

  function setCommands(availability: CommandAvailability): void {
    const byReason = new Map<string, string[]>();
    for (const command of KNOWN_COMMANDS) {
      const reason = availability[command];
      const commandButton = button(command);
      commandButton.disabled = reason !== undefined;
      commandButton.title = reason ?? "";
      if (reason)
        byReason.set(reason, [...(byReason.get(reason) ?? []), commandButton.textContent]);
    }
    const lines = [...byReason].map(([reason, labels]) => `${labels.join(", ")}: ${reason}.`);
    field("commands").textContent = lines.join(" ");
  }

  return {
    show,
    setConnection(state) {
      show("connection", CONNECTION_TEXT[state]);
      const isOpen = state === "connected" || state === "listening";
      const isClosed = state === "disconnected" || state === "failed";
      button("disconnect").disabled = !isOpen;
      button("reconnect").disabled = !isClosed;
      button("listen").disabled = !isClosed;
      button("startSession").disabled = state !== "listening";
      button("cancel").disabled = state !== "waiting";
      field("listen-warning").hidden = state !== "listening";
    },
    setCommands,
    showRecordings(recordings) {
      field("recordings").replaceChildren(...recordings.map(recordingItem));
    },
    log: (entry) => logView.add(entry),
    addError: addLine,
    addNote: (text) => addLine(`Note: ${text}`),
    onAction(action, handler) {
      button(action).addEventListener("click", handler);
    },
    onExport(handler) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        handler(new FormData(form, event.submitter));
      });
    },
    onDiscard(handler) {
      field("recordings").addEventListener("click", ({ target }) => {
        const id = target instanceof HTMLElement ? target.dataset.discard : undefined;
        if (id && confirm(`Discard recording #${id}? It can't be recovered.`)) handler(Number(id));
      });
    },
    onFindEarlier: (handler) => compareView.onFindEarlier(handler),
  };
}
