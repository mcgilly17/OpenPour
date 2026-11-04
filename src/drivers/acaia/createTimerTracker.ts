import type { ScaleEvent } from "../../core/types.js";

export type TimerEvent = Extract<ScaleEvent, { type: "timer" }>;

export interface TimerTracker {
  /**
   * Takes one timer record and returns the timer event it means, or undefined when the timer is
   * where it was or not yet known. `isStopNotice` marks a record sent ahead of the weight in its
   * message, which is how the Pearl S reports a stop or reset before its timer records cease.
   */
  push(ms: number, isStopNotice: boolean): TimerEvent | undefined;
}

/**
 * The timer runs while its value advances, and has stopped when a record shows it not advancing,
 * dropping back (a reset) or as a stop notice. The first value is only a baseline: alone it can't
 * tell a running timer from one stopped there. Only timer values change the timer: a button press
 * is reported as a button event alone, so one change never yields two timer events.
 */
export function createTimerTracker(): TimerTracker {
  let lastMs: number | undefined;
  let last: TimerEvent | undefined;

  return {
    push(ms, isStopNotice) {
      const previousMs = lastMs;
      lastMs = ms;
      if (previousMs === undefined) return undefined;
      const running = !isStopNotice && ms > previousMs;
      if (last?.running === running && last.ms === ms) return undefined;
      last = { type: "timer", running, ms };
      return { ...last };
    },
  };
}
