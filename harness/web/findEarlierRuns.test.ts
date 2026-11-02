import type { FixtureRecord } from "openpour/replay";
import { describe, expect, test } from "vitest";

import { findEarlierRuns, MAX_EARLIER_MATCHES } from "./findEarlierRuns.js";

const rx = (t: number, hex: string, chr = "n"): FixtureRecord => ({
  t,
  dir: "rx",
  svc: "s",
  chr,
  hex,
});
const tx = (t: number, hex: string): FixtureRecord => ({ t, dir: "tx", svc: "s", chr: "w", hex });
const times = (runs: { records: readonly FixtureRecord[] }[]) =>
  runs.map(({ records }) => records.map(({ t }) => t));

describe("findEarlierRuns", () => {
  test("finds earlier runs in every recording that start with the prefix, however they were split, newest first", () => {
    const recordings = [
      { id: 1, records: [rx(10, "efdd08"), tx(15, "efdd06"), rx(20, "0901020304")] },
      { id: 2, records: [rx(30, "efdd0c0c"), rx(40, "efdd0809"), rx(50, "01020305")] },
    ];
    const selected = { recording: 2, records: [rx(60, "efdd08090102"), rx(70, "0306")] };

    const matches = findEarlierRuns(
      [...recordings, { id: 3, records: selected.records }],
      selected,
      3,
    );

    expect(matches.map(({ recording }) => recording)).toEqual([2, 1]);
    expect(times(matches)).toEqual([
      [40, 50],
      [10, 20],
    ]);
  });

  test("matches only earlier packets from the same characteristic", () => {
    const records = [rx(10, "efdd08"), rx(20, "efdd08", "other"), rx(30, "efdd08")];

    const matches = findEarlierRuns(
      [{ id: 1, records }],
      { recording: 1, records: [rx(30, "efdd08")] },
      3,
    );

    expect(times(matches)).toEqual([[10]]);
  });

  test("lists at most MAX_EARLIER_MATCHES", () => {
    const records = Array.from({ length: MAX_EARLIER_MATCHES + 5 }, (_, i) => rx(i, "efdd08"));
    const selected = { recording: 1, records: [rx(100, "efdd08")] };

    expect(findEarlierRuns([{ id: 1, records }], selected, 3)).toHaveLength(MAX_EARLIER_MATCHES);
  });
});
