import type { PacketRun } from "./comparePackets.js";
import { formatT, shortUuid, spacedHex } from "./describeRun.js";
import { findElement } from "./findElement.js";
import type { LogEntry } from "./LogEntry.js";
import { selectRun } from "./selectRun.js";
import { describeScaleEvent } from "./showRunnerEvent.js";

/** Rows the log keeps on screen; older ones scroll away, but recordings keep every packet. */
export const LOG_ROWS_SHOWN = 300;

export type MarkSlot = "A" | "B";
export type Marks = Partial<Record<MarkSlot, PacketRun>>;

/** The checkbox that shows or hides a row; markers always show. */
type RowFilter = "tx" | "rx" | "reading" | "event";

export interface LogView {
  add(entry: LogEntry): void;
  /** Highlights the rows marked A and B. */
  showMarks(marks: Marks): void;
  onMark(handler: (slot: MarkSlot, run: PacketRun) => void): void;
}

function filterOf(entry: LogEntry): RowFilter | undefined {
  if (entry.kind === "packet") return entry.record.dir;
  if (entry.kind === "event") return entry.event.type === "reading" ? "reading" : "event";
  return undefined;
}

function cellsOf(entry: LogEntry): string[] {
  switch (entry.kind) {
    case "packet": {
      const { t, dir, chr, hex } = entry.record;
      return [formatT(t), dir, `#${entry.recording} ${shortUuid(chr)}`, spacedHex(hex)];
    }
    case "event":
      return [formatT(entry.t), "event", "", describeScaleEvent(entry.event)];
    case "marker":
      return [formatT(entry.t), "", "", entry.text];
  }
}

function markButtons(): HTMLTableCellElement {
  const cell = document.createElement("td");
  for (const slot of ["A", "B"] as const) {
    const button = Object.assign(document.createElement("button"), {
      type: "button",
      textContent: slot,
    });
    button.dataset.mark = slot;
    cell.append(button);
  }
  return cell;
}

function isMarked(entry: LogEntry | undefined, run: PacketRun | undefined): boolean {
  return entry?.kind === "packet" && run?.records.includes(entry.record) === true;
}

/**
 * The live log in `root`: one row per packet, decoded event or marker, in the order reported.
 * Pausing freezes what is on screen while rows keep arriving behind it.
 */
export function createLogView(root: HTMLElement): LogView {
  const body = findElement(root, "tbody", HTMLTableSectionElement);
  const scroller = findElement(root, ".log", HTMLElement);
  const pause = findElement(root, '[name="pause"]', HTMLInputElement);
  const checkbox = (filter: RowFilter) =>
    findElement(root, `[name="show-${filter}"]`, HTMLInputElement);
  const entries: LogEntry[] = [];
  let frozen: LogEntry[] = [];
  const entryOf = new WeakMap<Element, LogEntry>();
  const anchors: Partial<Record<MarkSlot, HTMLTableRowElement>> = {};
  let marks: Marks = {};
  let onMark: (slot: MarkSlot, run: PacketRun) => void = () => {};

  function isShown(entry: LogEntry): boolean {
    const filter = filterOf(entry);
    return filter === undefined || checkbox(filter).checked;
  }

  function rowOf(entry: LogEntry): HTMLTableRowElement {
    const row = document.createElement("tr");
    row.className = entry.kind === "packet" ? entry.record.dir : entry.kind;
    if (entry.kind === "packet") row.title = entry.record.chr;
    for (const text of cellsOf(entry)) row.insertCell().textContent = text;
    if (entry.kind === "packet" && entry.record.dir === "rx") row.append(markButtons());
    entryOf.set(row, entry);
    highlight(row);
    return row;
  }

  function highlight(row: Element): void {
    const entry = entryOf.get(row);
    row.classList.toggle("mark-a", isMarked(entry, marks.A));
    row.classList.toggle("mark-b", isMarked(entry, marks.B));
  }

  function scrollToEnd(): void {
    scroller.scrollTop = scroller.scrollHeight;
  }

  function render(): void {
    const source = pause.checked ? frozen : entries;
    body.replaceChildren(...source.filter(isShown).map(rowOf));
    if (!pause.checked) scrollToEnd();
  }

  function add(entry: LogEntry): void {
    entries.push(entry);
    if (entries.length > LOG_ROWS_SHOWN) entries.shift();
    if (pause.checked || !isShown(entry)) return;
    body.append(rowOf(entry));
    while (body.rows.length > LOG_ROWS_SHOWN) body.rows[0]?.remove();
    scrollToEnd();
  }

  /** The entries of the rows from `from` to `to` inclusive, in log order. */
  function rowsBetween(from: HTMLTableRowElement, to: HTMLTableRowElement): LogEntry[] {
    const rows = Array.from(body.rows);
    const [start = 0, end = 0] = [from, to].map((r) => rows.indexOf(r)).sort((a, b) => a - b);
    return rows.slice(start, end + 1).flatMap((row) => entryOf.get(row) ?? []);
  }

  // A click marks one row; a shift-click extends the mark from the last clicked row to this one.
  function mark(event: MouseEvent): void {
    const button = event.target instanceof HTMLElement ? event.target.closest("[data-mark]") : null;
    const row = button?.closest("tr");
    if (!(button instanceof HTMLElement) || !row) return;
    const slot: MarkSlot = button.dataset.mark === "B" ? "B" : "A";
    const anchor = anchors[slot];
    const from = event.shiftKey && anchor?.isConnected ? anchor : row;
    anchors[slot] = from;
    const run = selectRun(rowsBetween(from, row));
    if (run) onMark(slot, run);
  }

  body.addEventListener("click", mark);
  pause.addEventListener("change", () => {
    frozen = [...entries];
    render();
  });
  for (const filter of ["tx", "rx", "reading", "event"] as const) {
    checkbox(filter).addEventListener("change", render);
  }
  return {
    add,
    showMarks(next) {
      marks = next;
      for (const row of Array.from(body.rows)) highlight(row);
    },
    onMark(handler) {
      onMark = handler;
    },
  };
}
