import {
  type CommandAvailability,
  commandAvailability,
  type KnownCommand,
} from "./commandAvailability.js";
import type { PacketRun } from "./comparePackets.js";
import {
  EMPTY_INVESTIGATION,
  type InvestigateAction,
  type InvestigationState,
} from "./createInvestigation.js";
import { addErrorLine, type ErrorLine } from "./errorLines.js";
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
  | "protocol"
  | "info"
  | "capabilities"
  | "weight"
  | "timer"
  | "battery"
  | DeviceInfoField;
export type ConnectionAction = "disconnect" | "reconnect" | "listen" | "startSession" | "cancel";
export type PanelAction = ConnectionAction | KnownCommand;
/** Whether each connection button works now. */
export type ConnectionControls = Record<ConnectionAction, boolean>;

/** One kept recording as its row in the panel's list. */
export interface RecordingSummary {
  id: number;
  text: string;
  canDiscard: boolean;
}

/** A field with nothing to show, so a stale value never reads as live. */
export const EMPTY_FIELD = "–";

/** Rows the log keeps on screen; older ones scroll away, but recordings keep every packet. */
export const LOG_ROWS_SHOWN = 300;

/** Starts a note's line: notes share the errors list, so a line says which it is. */
export const NOTE_PREFIX = "Note: ";

/** Earlier runs, from the scale's kept recordings, whose bytes start like `run`'s. */
export type FindEarlier = (run: PacketRun, prefixBytes: number) => PacketRun[];

/** One scale's part of the page, as its scale drives it. */
export interface ScalePanel {
  show(field: PanelField, text: string): void;
  setConnection(state: ConnectionState): void;
  /** Enables or disables each connection button, as the scale's own state allows. */
  setControls(controls: ConnectionControls): void;
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
  showInvestigation(investigation: InvestigationState): void;
  /** Gets the "Investigate a setting" wizard's clicks. */
  onInvestigate(handler: (action: InvestigateAction) => void): void;
}

/** A log entry with a key that stays the same as older rows drop off. */
export interface LogRow {
  id: number;
  entry: LogEntry;
}

/** Everything the panel shows. Every change replaces it, so the page re-renders what changed. */
export interface PanelState {
  /** Shown fields; one never shown yet is EMPTY_FIELD. */
  fields: Readonly<Partial<Record<PanelField, string>>>;
  connection: ConnectionState | undefined;
  controls: ConnectionControls;
  commands: CommandAvailability;
  recordings: readonly RecordingSummary[];
  log: readonly LogRow[];
  errors: readonly ErrorLine[];
  investigation: InvestigationState;
}

/**
 * The panel as a store: the scale writes to it through ScalePanel, the page renders its snapshot
 * (with useSyncExternalStore) and passes clicks back through the rest.
 */
export interface ScalePanelStore extends ScalePanel {
  subscribe(listener: () => void): () => void;
  getSnapshot(): PanelState;
  act(action: PanelAction): void;
  exportFixture(answers: FormData): void;
  discard(recording: number): void;
  findEarlier: FindEarlier;
  investigate(action: InvestigateAction): void;
}

export function createScalePanel(): ScalePanelStore {
  let state: PanelState = {
    fields: {},
    connection: undefined,
    controls: {
      disconnect: false,
      reconnect: false,
      listen: false,
      startSession: false,
      cancel: false,
    },
    commands: commandAvailability(undefined, false),
    recordings: [],
    log: [],
    errors: [],
    investigation: EMPTY_INVESTIGATION,
  };
  let nextRowId = 0;
  const listeners = new Set<() => void>();
  const actions = new Map<PanelAction, () => void>();
  let onExport: (answers: FormData) => void = () => {};
  let onDiscard: (recording: number) => void = () => {};
  let onFindEarlier: FindEarlier = () => [];
  let onInvestigate: (action: InvestigateAction) => void = () => {};

  function update(change: Partial<PanelState>): void {
    state = { ...state, ...change };
    for (const listener of listeners) listener();
  }

  function addLine(text: string): void {
    // addErrorLine counts a repeat into the last line in place, so it gets copies.
    const errors = state.errors.map((line) => ({ ...line }));
    addErrorLine(errors, text);
    update({ errors });
  }

  return {
    show: (field, text) => update({ fields: { ...state.fields, [field]: text } }),
    setConnection: (connection) => update({ connection }),
    setControls: (controls) => update({ controls }),
    setCommands: (commands) => update({ commands }),
    showRecordings: (recordings) => update({ recordings }),
    log(entry) {
      const row = { id: nextRowId++, entry };
      update({ log: [...state.log, row].slice(-LOG_ROWS_SHOWN) });
    },
    addError: addLine,
    addNote: (text) => addLine(`${NOTE_PREFIX}${text}`),
    onAction(action, handler) {
      actions.set(action, handler);
    },
    onExport(handler) {
      onExport = handler;
    },
    onDiscard(handler) {
      onDiscard = handler;
    },
    onFindEarlier(handler) {
      onFindEarlier = handler;
    },
    showInvestigation: (investigation) => update({ investigation }),
    onInvestigate(handler) {
      onInvestigate = handler;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    act: (action) => actions.get(action)?.(),
    exportFixture: (answers) => onExport(answers),
    discard: (recording) => onDiscard(recording),
    findEarlier: (run, prefixBytes) => onFindEarlier(run, prefixBytes),
    investigate: (action) => onInvestigate(action),
  };
}
