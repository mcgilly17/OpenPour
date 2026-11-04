import { describe, expect, test } from "vitest";

import { createTimerTracker } from "./createTimerTracker.js";

/** Feeds `values` in order, each after its weight; returns the events, undefined where none. */
function track(...values: [ms: number, isStopNotice?: boolean][]) {
  const tracker = createTimerTracker();
  return values.map(([ms, isStopNotice = false]) => tracker.push(ms, isStopNotice));
}

const stopped = (ms: number) => ({ type: "timer", running: false, ms });
const running = (ms: number) => ({ type: "timer", running: true, ms });

describe("createTimerTracker", () => {
  test("takes the first value as a baseline, reporting nothing for it", () => {
    expect(track([200])).toEqual([undefined]);
    expect(track([700])).toEqual([undefined]);
  });

  test("a timer stopped before connecting is reported stopped at its value once, never running", () => {
    expect(track([9600], [9600], [9600])).toEqual([undefined, stopped(9600), undefined]);
  });

  test("runs while the value advances, from the second value", () => {
    expect(track([700], [1200], [1600])).toEqual([undefined, running(1200), running(1600)]);
  });

  test("stops when a value repeats, and resets when it drops back", () => {
    expect(track([200], [400], [600], [600], [600], [200])).toEqual([
      undefined,
      running(400),
      running(600),
      stopped(600),
      undefined,
      stopped(200),
    ]);
  });

  test("a stop notice stops it at its own value, even one that advanced", () => {
    expect(track([3700], [4200], [4500, true], [200, true])).toEqual([
      undefined,
      running(4200),
      stopped(4500),
      stopped(200),
    ]);
  });
});
