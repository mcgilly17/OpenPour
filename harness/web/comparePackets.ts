import { type FixtureRecord, hexToBytes } from "openpour/replay";

/**
 * Consecutive rx packets from one characteristic in one recording: a single notification, or a
 * frame the scale split across several.
 */
export interface PacketRun {
  recording: number;
  records: readonly FixtureRecord[];
}

export interface JoinedRun {
  bytes: number[];
  /** The index of each notification's first byte, so split points stay visible. */
  starts: Set<number>;
}

export function joinRun(records: readonly FixtureRecord[]): JoinedRun {
  const bytes: number[] = [];
  const starts = new Set<number>();
  for (const { hex } of records) {
    starts.add(bytes.length);
    bytes.push(...hexToBytes(hex));
  }
  return { bytes, starts };
}

/** One byte position of a comparison; a byte only one side has counts as different. */
export interface ByteCell {
  index: number;
  a: number | undefined;
  b: number | undefined;
  isDifferent: boolean;
  startsPacketA: boolean;
  startsPacketB: boolean;
}

/** Lines A and B up from their first byte, whatever notifications each was split into. */
export function compareRuns(a: readonly FixtureRecord[], b: readonly FixtureRecord[]): ByteCell[] {
  const left = joinRun(a);
  const right = joinRun(b);
  const length = Math.max(left.bytes.length, right.bytes.length);
  return Array.from({ length }, (_, index) => {
    const x = left.bytes[index];
    const y = right.bytes[index];
    return {
      index,
      a: x,
      b: y,
      isDifferent: x !== y,
      startsPacketA: left.starts.has(index),
      startsPacketB: right.starts.has(index),
    };
  });
}

export function hexByte(byte: number | undefined): string {
  return byte === undefined ? "--" : byte.toString(16).padStart(2, "0");
}

/** e.g. "2 of 14 bytes differ, at index 9 (01 → 00) and 12 (0e → 0d)". */
export function describeDifferences(cells: readonly ByteCell[]): string {
  const different = cells.filter(({ isDifferent }) => isDifferent);
  if (different.length === 0) return `All ${cells.length} bytes match.`;
  const where = different.map(({ index, a, b }) => `${index} (${hexByte(a)} → ${hexByte(b)})`);
  const list =
    where.length === 1 ? where.join("") : `${where.slice(0, -1).join(", ")} and ${where.at(-1)}`;
  return `${different.length} of ${cells.length} bytes differ, at index ${list}.`;
}
