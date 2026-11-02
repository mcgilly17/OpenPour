import type { FixtureRecord } from "openpour/replay";
import { joinRun, type PacketRun } from "./comparePackets.js";

/** How many of the newest matches a search lists. */
export const MAX_EARLIER_MATCHES = 10;

/** One kept recording's packets, as the search sees them. */
export interface SearchedRecording {
  id: number;
  records: readonly FixtureRecord[];
}

/** What a search looks for: rx runs on one characteristic, `length` bytes long, starting with `prefix`. */
export interface RunPattern {
  svc: string;
  chr: string;
  prefix: readonly number[];
  length: number;
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

/** `run`'s characteristic and length, and its first `prefixBytes` bytes. */
export function patternOf(run: PacketRun, prefixBytes: number): RunPattern | undefined {
  const first = run.records[0];
  if (!first) return undefined;
  const { bytes } = joinRun(run.records);
  return {
    svc: first.svc,
    chr: first.chr,
    prefix: bytes.slice(0, prefixBytes),
    length: bytes.length,
  };
}

/**
 * Runs matching `pattern` that start before `before`, newest first, from every one of
 * `recordings`. Each starts at a notification and is `pattern.length` bytes long, so the same frame
 * split at other points still lines up. A run never spans recordings.
 */
export function findRuns(
  recordings: readonly SearchedRecording[],
  { svc, chr, prefix, length }: RunPattern,
  before: number = Number.POSITIVE_INFINITY,
): PacketRun[] {
  const isSameStream = (r: FixtureRecord): boolean =>
    r.dir === "rx" && r.svc === svc && r.chr === chr && r.t < before;
  const matches = recordings.flatMap(({ id, records }) => {
    const stream = records.filter(isSameStream);
    return stream.flatMap((_, i) => {
      const candidate = runFrom(stream, i, Math.max(prefix.length, length));
      return startsWith(joinRun(candidate).bytes, prefix)
        ? [{ recording: id, records: candidate }]
        : [];
    });
  });
  const startT = ({ records }: PacketRun): number => records[0]?.t ?? 0;
  return matches.sort((a, b) => startT(b) - startT(a));
}

/**
 * Earlier runs from `run`'s characteristic whose bytes start with `run`'s first `prefixBytes`,
 * newest first, from every kept recording, each as long as `run`.
 */
export function findEarlierRuns(
  recordings: readonly SearchedRecording[],
  run: PacketRun,
  prefixBytes: number,
): PacketRun[] {
  const pattern = patternOf(run, prefixBytes);
  const first = run.records[0];
  if (!pattern || !first) return [];
  return findRuns(recordings, pattern, first.t).slice(0, MAX_EARLIER_MATCHES);
}
