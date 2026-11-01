import type { Clock } from "../runner/Clock.js";

/**
 * The page's clock. Event `timeStamp`s, which stamp notification arrival, count from the same
 * time origin as `performance.now()`, so wake-ups and arrivals share one time base.
 */
export const browserClock: Clock = {
  now: () => performance.now(),
  schedule(fn, delayMs) {
    const id = setTimeout(fn, delayMs);
    return () => clearTimeout(id);
  },
};
