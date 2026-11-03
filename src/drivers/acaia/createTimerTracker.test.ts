import { describe, expect, test } from "vitest";

import { createTimerTracker, TIMER_RESET_MS } from "./createTimerTracker.js";

/** Feeds `values` in order, each after its weight; returns the events, undefined where none. */
function track(...values: [ms: number, isStopNotice?: boolean][]) {
  const tracker = createTimerTracker();
  return values.map(([ms, isStopNotice = false]) => tracker.push(ms, isStopNotice));
}

const stopped = (ms: number) => ({ type: "timer", running: false, ms });
const running = (ms: number) => ({ type: "timer", running: true, ms });

describe("createTimerTracker", () => {
  test("an idle timer at its reset value is stopped, reported once", () => {
    expect(TIMER_RESET_MS).toBe(200);
    expect(track([200], [200], [200])).toEqual([stopped(200), undefined, undefined]);
  });

  test("runs while the value advances, from the first value above the reset value", () => {
    expect(track([700], [1200], [1600])).toEqual([running(700), running(1200), running(1600)]);
  });

  test("stops when a value repeats, and resets when it drops back", () => {
    expect(track([200], [400], [600], [600], [600], [200])).toEqual([
      stopped(200),
      running(400),
      running(600),
      stopped(600),
      undefined,
      stopped(200),
    ]);
  });

  test("a stop notice stops it at its own value, even one that advanced", () => {
    expect(track([4200], [4500, true], [200, true])).toEqual([
      running(4200),
      stopped(4500),
      stopped(200),
    ]);
  });
});
