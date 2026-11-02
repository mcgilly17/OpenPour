import type { FixtureRecord } from "openpour/replay";
import { describe, expect, test } from "vitest";

import type { LogEntry } from "./LogEntry.js";
import { selectRun } from "./selectRun.js";

const record = (t: number, dir: "rx" | "tx", chr = "n"): FixtureRecord => ({
  t,
  dir,
  svc: "s",
  chr,
  hex: "00",
});
const packet = (recording: number, r: FixtureRecord): LogEntry => ({
  kind: "packet",
  recording,
  record: r,
});

describe("selectRun", () => {
  test("keeps the rx packets of the first one's recording and characteristic, skipping the rest", () => {
    const first = record(10, "rx");
    const second = record(30, "rx");
    const entries: LogEntry[] = [
      { kind: "marker", t: 0, text: "session started" },
      packet(1, first),
      packet(1, record(15, "tx", "w")),
      { kind: "event", t: 15, event: { type: "battery", percent: 50 } },
      packet(1, record(20, "rx", "other")),
      packet(1, second),
      packet(2, record(40, "rx")),
    ];

    expect(selectRun(entries)).toEqual({ recording: 1, records: [first, second] });
  });

  test("selects nothing without an rx packet", () => {
    expect(selectRun([packet(1, record(0, "tx"))])).toBeUndefined();
  });
});
