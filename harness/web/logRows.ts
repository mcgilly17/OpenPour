import type { PacketRun } from "./comparePackets.js";
import type { LogRow } from "./createScalePanel.js";
import { formatT, shortUuid, spacedHex } from "./describeRun.js";
import type { LogEntry } from "./LogEntry.js";
import { describeScaleEvent } from "./showRunnerEvent.js";

/** The checkbox that shows or hides a row; markers always show. */
export type RowFilter = "tx" | "rx" | "reading" | "event";
export const ROW_FILTERS: readonly RowFilter[] = ["tx", "rx", "reading", "event"];
export type RowFilters = Readonly<Record<RowFilter, boolean>>;

function filterOf(entry: LogEntry): RowFilter | undefined {
  if (entry.kind === "packet") return entry.record.dir;
  if (entry.kind === "event") return entry.event.type === "reading" ? "reading" : "event";
  return undefined;
}

export function isShown(entry: LogEntry, filters: RowFilters): boolean {
  const filter = filterOf(entry);
  return filter === undefined || filters[filter];
}

/** The row's cells: time, direction, recording and characteristic, then the hex or the text. */
export function cellsOf(entry: LogEntry): [string, string, string, string] {
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

export function isMarked(entry: LogEntry, run: PacketRun | undefined): boolean {
  return entry.kind === "packet" && run?.records.includes(entry.record) === true;
}

/** The entries of the rows from `from` to `to` inclusive, in log order, whichever comes first. */
export function entriesBetween(rows: readonly LogRow[], from: LogRow, to: LogRow): LogEntry[] {
  const [start = 0, end = 0] = [from, to].map((row) => rows.indexOf(row)).sort((a, b) => a - b);
  return rows.slice(start, end + 1).map(({ entry }) => entry);
}
