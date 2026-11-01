import fc from "fast-check";
import { describe, expect, test } from "vitest";

import { hexToBytes } from "../../replay/replay.js";
import { ACAIA_VECTORS } from "../../test/acaiaVectors.js";
import { createFrameReader, type Frame, MAX_FRAME_BYTES } from "./createFrameReader.js";
import { encodeFrame, FRAME_HEADER } from "./encodeFrame.js";

const weight = hexToBytes(ACAIA_VECTORS.weight);
const settings = hexToBytes(ACAIA_VECTORS.settings);

function readAll(chunks: Uint8Array[]): Frame[] {
  const reader = createFrameReader();
  return chunks.flatMap((chunk) => reader.push(chunk));
}

/** A scale-to-phone frame: the length byte counts itself and the rest of the body. */
function inboundFrame(type: number, body: Uint8Array): Uint8Array {
  return encodeFrame(type, Uint8Array.of(body.length + 1, ...body));
}

function hasHeader(bytes: Uint8Array): boolean {
  return bytes.some((byte, i) => byte === FRAME_HEADER[0] && bytes[i + 1] === FRAME_HEADER[1]);
}

/** Splits bytes at the given cut points. */
function split(bytes: Uint8Array, cuts: number[]): Uint8Array[] {
  const points = [...new Set(cuts.map((cut) => cut % (bytes.length + 1)))].sort((a, b) => a - b);
  return [0, ...points].map((from, i) => bytes.slice(from, points[i] ?? bytes.length));
}

describe("createFrameReader", () => {
  test("reads one frame", () => {
    expect(readAll([weight])).toEqual([{ type: 12, payload: weight.slice(4, -2) }]);
  });

  test("reassembles a frame split after its header", () => {
    expect(readAll([weight.slice(0, 3), weight.slice(3)])).toEqual(readAll([weight]));
  });

  test("keeps a header byte that ends a notification", () => {
    expect(readAll([Uint8Array.of(0x01, 0xef), weight.slice(1)])).toEqual(readAll([weight]));
  });

  test("reads frames that share a notification", () => {
    expect(readAll([Uint8Array.of(...weight, ...settings)])).toHaveLength(2);
  });

  test("drops a frame with a bad checksum and finds the next one", () => {
    const corrupt = weight.slice();
    corrupt[corrupt.length - 1] = (corrupt.at(-1) ?? 0) ^ 0x01;
    expect(readAll([Uint8Array.of(...corrupt, ...settings)])).toEqual(readAll([settings]));
  });

  test("treats a length too long for any frame as corruption", () => {
    const tooLong = Uint8Array.of(...FRAME_HEADER, 0x0c, MAX_FRAME_BYTES);
    expect(readAll([Uint8Array.of(...tooLong, ...weight)])).toEqual(readAll([weight]));
  });

  test("treats a zero length as corruption", () => {
    expect(readAll([Uint8Array.of(...FRAME_HEADER, 0x0c, 0x00, ...weight)])).toEqual(
      readAll([weight]),
    );
  });

  test("waits for the rest of a frame", () => {
    expect(readAll([hexToBytes("efdd0c")])).toEqual([]);
    expect(readAll([weight.slice(0, -1)])).toEqual([]);
  });

  const frameArb = fc.oneof(
    fc.constantFrom(...Object.values(ACAIA_VECTORS).map(hexToBytes)),
    fc
      .record({ type: fc.integer({ min: 0, max: 255 }), body: fc.uint8Array({ maxLength: 40 }) })
      .map(({ type, body }) => inboundFrame(type, body)),
  );
  // Noise holding a header could itself be a valid frame, so it is excluded.
  const noiseArb = fc.uint8Array({ maxLength: 12 }).filter((bytes) => !hasHeader(bytes));

  test("splitting, merging or noise before frames never changes the frames read", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(noiseArb, frameArb), { minLength: 1, maxLength: 8 }),
        fc.array(fc.nat(), { maxLength: 10 }),
        (pairs, cuts) => {
          const expected = readAll(pairs.map(([, frame]) => frame));
          const stream = Uint8Array.from(pairs.flatMap(([noise, frame]) => [...noise, ...frame]));
          expect(readAll(split(stream, cuts))).toEqual(expected);
        },
      ),
    );
  });
});
