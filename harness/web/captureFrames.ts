import type { FixtureRecord } from "openpour/replay";

/** How many leading bytes most notifications share when they start a frame. */
export const SYNC_BYTES = 2;
/** A frame is cut here even if no sync follows, so a lost sync can't swallow a recording. */
export const MAX_FRAME_BYTES = 256;
/** A frame's kind: its first bytes, such as sync plus message type. */
export const KIND_PREFIX_BYTES = 3;

/** One kind of frame in one recording: its latest frame, and the bytes that varied meanwhile. */
export interface KindInCapture {
  /** The latest frame of this kind, as hex. */
  frame: string;
  /** Byte indices where this kind's frames disagreed within the recording: live data. */
  varying: readonly number[];
}

/** One recording's frames, by kind as hex, e.g. "efdd08". */
export type CaptureFrames = Readonly<Record<string, KindInCapture>>;

const hexBytes = (bytes: number): number => bytes * 2;

/** The prefix most of `notifications` start with, as hex; undefined when none is long enough. */
export function inferSync(notifications: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const hex of notifications) {
    if (hex.length < hexBytes(SYNC_BYTES)) continue;
    const prefix = hex.slice(0, hexBytes(SYNC_BYTES));
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [prefix, count] of counts) {
    if (count > bestCount) [best, bestCount] = [prefix, count];
  }
  return best;
}

/**
 * Splits one characteristic's notifications, joined, into frames: each runs from a sync to the
 * next, wherever the notifications were split. Bytes before the first sync are dropped.
 */
export function joinFrames(notifications: readonly string[]): string[] {
  // ponytail: a sync inside a payload starts a false frame; read a length byte if that matters.
  const sync = inferSync(notifications);
  if (sync === undefined) return [];
  const stream = notifications.join("");
  const frames: string[] = [];
  let start: number | undefined;
  for (let i = 0; i + sync.length <= stream.length; i += 2) {
    if (!stream.startsWith(sync, i)) continue;
    if (start !== undefined) frames.push(stream.slice(start, i));
    start = i;
  }
  if (start !== undefined) frames.push(stream.slice(start));
  return frames.map((frame) => frame.slice(0, hexBytes(MAX_FRAME_BYTES)));
}

function kindOf(frame: string): string {
  return frame.slice(0, hexBytes(KIND_PREFIX_BYTES));
}

/** Indices where any of `frames` differ, a byte only some of them have included. */
function varyingBytes(frames: readonly string[]): number[] {
  const length = Math.max(...frames.map((frame) => frame.length)) / 2;
  const byteAt = (frame: string, i: number): string => frame.slice(i * 2, i * 2 + 2);
  return Array.from({ length }, (_, i) => i).filter((i) =>
    frames.some((frame) => byteAt(frame, i) !== byteAt(frames[0] ?? "", i)),
  );
}

/** Groups `records`' rx notifications by characteristic, in arrival order. */
function notificationsByCharacteristic(records: readonly FixtureRecord[]): string[][] {
  const streams = new Map<string, string[]>();
  for (const { dir, svc, chr, hex } of records) {
    if (dir !== "rx") continue;
    const key = `${svc} ${chr}`;
    const stream = streams.get(key) ?? [];
    stream.push(hex);
    streams.set(key, stream);
  }
  return [...streams.values()];
}

/** Every kind of frame `records` received, with its latest frame and its live bytes. */
export function captureFrames(records: readonly FixtureRecord[]): CaptureFrames {
  // ponytail: kinds from two characteristics share a key; add the characteristic if one clashes.
  const byKind = new Map<string, string[]>();
  for (const frame of notificationsByCharacteristic(records).flatMap(joinFrames)) {
    const kind = kindOf(frame);
    const frames = byKind.get(kind) ?? [];
    frames.push(frame);
    byKind.set(kind, frames);
  }
  return Object.fromEntries(
    [...byKind].map(([kind, frames]) => [
      kind,
      { frame: frames.at(-1) ?? "", varying: varyingBytes(frames) },
    ]),
  );
}
