import type { FixtureRecord } from "openpour/replay";
import { joinRun, type PacketRun } from "./comparePackets.js";

/** How many of the newest matches a search lists. */
export const MAX_EARLIER_MATCHES = 10;

/** One kept recording's packets, as the search sees them. */
export interface SearchedRecording {
  id: number;
  records: readonly FixtureRecord[];
}

function startsWith(bytes: readonly number[], prefix: readonly number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte);
}

/** Packets from `start` on, as many as it takes to hold `length` bytes, or all that are left. */
function runFrom(stream: readonly FixtureRecord[], start: number, length: number): FixtureRecord[] {
  const run: FixtureRecord[] = [];
  let byteCount = 0;
  for (let i = start; byteCount < length; i++) {
    const record = stream[i];
    if (!record) break;
    run.push(record);
    byteCount += record.hex.length / 2;
  }
  return run;
}

/**
 * Earlier runs from `run`'s characteristic whose bytes start with `run`'s first `prefixBytes`,
 * newest first, from every kept recording. Each starts at a notification and is as long as
 * `run`, so the same frame split at other points still lines up. A run never spans recordings.
 */
export function findEarlierRuns(
  recordings: readonly SearchedRecording[],
  run: PacketRun,
  prefixBytes: number,
): PacketRun[] {
  const first = run.records[0];
  if (!first) return [];
  const wanted = joinRun(run.records).bytes;
  const prefix = wanted.slice(0, prefixBytes);
  const isSameStream = (r: FixtureRecord): boolean =>
    r.dir === "rx" && r.svc === first.svc && r.chr === first.chr && r.t < first.t;
  const matches = recordings.flatMap(({ id, records }) => {
    const stream = records.filter(isSameStream);
    return stream.flatMap((_, i) => {
      const candidate = runFrom(stream, i, Math.max(prefix.length, wanted.length));
      return startsWith(joinRun(candidate).bytes, prefix)
        ? [{ recording: id, records: candidate }]
        : [];
    });
  });
  const startT = ({ records }: PacketRun): number => records[0]?.t ?? 0;
  return matches.sort((a, b) => startT(b) - startT(a)).slice(0, MAX_EARLIER_MATCHES);
}
