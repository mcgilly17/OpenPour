import type { PacketRun } from "./comparePackets.js";
import type { LogEntry } from "./LogEntry.js";

/**
 * The run marked by clicking one log row and shift-clicking another: of `entries`, the rows
 * between the two in log order, the rx packets sharing the first one's recording and
 * characteristic. Writes and events in between are skipped.
 */
export function selectRun(entries: readonly LogEntry[]): PacketRun | undefined {
  const received = entries.flatMap((entry) =>
    entry.kind === "packet" && entry.record.dir === "rx" ? [entry] : [],
  );
  const first = received[0];
  if (!first) return undefined;
  const { svc, chr } = first.record;
  const records = received
    .filter((e) => e.recording === first.recording && e.record.svc === svc && e.record.chr === chr)
    .map(({ record }) => record);
  return { recording: first.recording, records };
}
