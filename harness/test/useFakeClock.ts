import { vi } from "vitest";
import type { Clock } from "../runner/Clock.js";

// The runner core is platform-free, so its tsconfig declares no timers; vi fakes the global ones.
const timers = globalThis as unknown as {
  setTimeout(fn: () => void, delayMs: number): unknown;
  clearTimeout(id: unknown): void;
};

/**
 * A Clock on vi's fake timers, starting at `startT`. Move time with `vi.advanceTimersByTimeAsync`,
 * which also settles promises between timers. Call `vi.useRealTimers()` after each test.
 */
export function useFakeClock(startT = 0): Clock {
  vi.useFakeTimers({ now: startT });
  return {
    now: () => Date.now(),
    schedule(fn, delayMs) {
      const id = timers.setTimeout(fn, delayMs);
      return () => timers.clearTimeout(id);
    },
  };
}

/** Moves the fake clock forward to `t`. */
export async function advanceTo(clock: Clock, t: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(t - clock.now());
}
