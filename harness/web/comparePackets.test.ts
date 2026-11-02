import type { FixtureRecord } from "openpour/replay";
import { describe, expect, test } from "vitest";

import { compareRuns, describeDifferences, joinRun } from "./comparePackets.js";

const rx = (t: number, hex: string): FixtureRecord => ({ t, dir: "rx", svc: "s", chr: "n", hex });

// A Lunar settings frame before and after one setting changed, each split at a different point.
const BEFORE = [rx(10, "efdd08"), rx(20, "094e020101000101010e50")];
const AFTER = [rx(30, "efdd08094e02"), rx(40, "0101000001010d50")];

describe("compareRuns", () => {
  test("lines frames split differently up byte by byte and marks only the bytes that differ", () => {
    const cells = compareRuns(BEFORE, AFTER);

    expect(cells).toHaveLength(14);
    expect(cells.filter((c) => c.isDifferent).map(({ index, a, b }) => [index, a, b])).toEqual([
      [9, 0x01, 0x00],
      [12, 0x0e, 0x0d],
    ]);
    expect(cells.filter((c) => c.startsPacketA).map(({ index }) => index)).toEqual([0, 3]);
    expect(cells.filter((c) => c.startsPacketB).map(({ index }) => index)).toEqual([0, 6]);
  });

  test("marks every byte only one side has", () => {
    const cells = compareRuns([rx(0, "efdd0c")], [rx(1, "efdd")]);

    expect(cells.map(({ b, isDifferent }) => [b, isDifferent])).toEqual([
      [0xef, false],
      [0xdd, false],
      [undefined, true],
    ]);
    expect(describeDifferences(cells)).toBe("1 of 3 bytes differ, at index 2 (0c → --).");
  });
});

describe("describeDifferences", () => {
  test("lists each differing index with both bytes, or says they all match", () => {
    expect(describeDifferences(compareRuns(BEFORE, AFTER))).toBe(
      "2 of 14 bytes differ, at index 9 (01 → 00) and 12 (0e → 0d).",
    );
    expect(describeDifferences(compareRuns(BEFORE, BEFORE))).toBe("All 14 bytes match.");
  });
});

describe("joinRun", () => {
  test("concatenates the recorded bytes unchanged and keeps where each notification began", () => {
    expect(joinRun(BEFORE)).toEqual({
      bytes: [0xef, 0xdd, 0x08, 0x09, 0x4e, 2, 1, 1, 0, 1, 1, 1, 0x0e, 0x50],
      starts: new Set([0, 3]),
    });
  });
});
