import { checksum, FRAME_HEADER } from "./encodeFrame.js";

/**
 * A length byte that claims more than this is corruption, not a frame. Waiting for that many
 * bytes would hold back every good frame behind it. Real frames seen so far are under 20 bytes.
 */
export const MAX_FRAME_BYTES = 64;

/** Header, type and length byte come before the body; the checksum follows it. */
const BODY_OFFSET = 3;
const CHECKSUM_BYTES = 2;

export interface Frame {
  type: number;
  /** The bytes after the length byte, without the checksum. */
  payload: Uint8Array;
}

export interface FrameReader {
  /** Adds one notification's bytes and returns every frame they complete. */
  push(bytes: Uint8Array): Frame[];
}

type ReadResult = { frame: Frame; size: number } | "incomplete" | "corrupt";

function byteAt(bytes: Uint8Array, i: number): number {
  return bytes[i] ?? -1;
}

function findHeader(bytes: Uint8Array, from: number): number {
  for (let i = from; i < bytes.length - 1; i++)
    if (byteAt(bytes, i) === FRAME_HEADER[0] && byteAt(bytes, i + 1) === FRAME_HEADER[1]) return i;
  return -1;
}

function readFrameAt(bytes: Uint8Array, at: number): ReadResult {
  if (bytes.length <= at + BODY_OFFSET) return "incomplete";
  // The length byte counts itself and the rest of the body.
  const length = byteAt(bytes, at + BODY_OFFSET);
  const size = BODY_OFFSET + length + CHECKSUM_BYTES;
  if (length < 1 || size > MAX_FRAME_BYTES) return "corrupt";
  if (bytes.length < at + size) return "incomplete";
  const body = bytes.subarray(at + BODY_OFFSET, at + BODY_OFFSET + length);
  const [even, odd] = checksum(body);
  const end = at + BODY_OFFSET + length;
  if (byteAt(bytes, end) !== even || byteAt(bytes, end + 1) !== odd) return "corrupt";
  return { frame: { type: byteAt(bytes, at + 2), payload: body.slice(1) }, size };
}

/** Keeps a trailing header byte, which may be the first half of a split header. */
function restAfterScan(bytes: Uint8Array): number {
  return bytes.at(-1) === FRAME_HEADER[0] ? bytes.length - 1 : bytes.length;
}

/**
 * Turns notifications into frames. A frame can be split across notifications, several can share
 * one, and noise can sit between them. A bad checksum drops only that header, so the reader finds
 * the next frame.
 */
export function createFrameReader(): FrameReader {
  let buffer = new Uint8Array(0);

  function push(bytes: Uint8Array): Frame[] {
    buffer = Uint8Array.of(...buffer, ...bytes);
    const frames: Frame[] = [];
    let start = 0;
    for (;;) {
      const at = findHeader(buffer, start);
      if (at === -1) {
        start = Math.max(start, restAfterScan(buffer));
        break;
      }
      const result = readFrameAt(buffer, at);
      if (result === "incomplete") {
        start = at;
        break;
      }
      if (result === "corrupt") {
        start = at + 1;
        continue;
      }
      frames.push(result.frame);
      start = at + result.size;
    }
    buffer = buffer.slice(start);
    return frames;
  }

  return { push };
}
