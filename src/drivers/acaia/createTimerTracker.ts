import type { ScaleEvent } from "../../core/types.js";

/** What both the Pearl S and the Lunar read once reset: 0.2 s, reported as is. */
export const TIMER_RESET_MS = 200;

export type TimerEvent = Extract<ScaleEvent, { type: "timer" }>;

export interface TimerTracker {
  /**
   * Takes one timer record and returns the timer event it means, or undefined when the timer is
   * where it was. `isStopNotice` marks a record sent ahead of the weight in its message, which is
   * how the Pearl S reports a stop or reset before its timer records cease.
   */
  push(ms: number, isStopNotice: boolean): TimerEvent | undefined;
}

/**
 * The timer runs while its value advances, and has stopped when a record shows it not advancing,
 * dropping back (a reset) or as a stop notice. The first value is compared with the reset value,
 * as if the timer had just been reset. Only timer values change the timer: a button press is
 * reported as a button event alone, so one change never yields two timer events.
 */
export function createTimerTracker(): TimerTracker {
  let lastMs = TIMER_RESET_MS;
  let last: TimerEvent | undefined;

  return {
    push(ms, isStopNotice) {
      const running = !isStopNotice && ms > lastMs;
      lastMs = ms;
      if (last?.running === running && last.ms === ms) return undefined;
      last = { type: "timer", running, ms };
      return { ...last };
    },
  };
}
