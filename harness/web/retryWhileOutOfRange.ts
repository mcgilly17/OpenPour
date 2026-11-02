import type { Clock } from "../runner/Clock.js";
import { isOutOfRange } from "./explainFailure.js";

/** A scale switched on moments ago isn't advertising yet; connecting keeps trying this long. */
export const RECONNECT_WINDOW_MS = 15_000;
/** The wait between connection attempts while the scale isn't advertising. */
export const RECONNECT_RETRY_MS = 1000;

export interface RetryOptions {
  clock: Clock;
  /** Stops retrying; an attempt already in flight still finishes. */
  signal: AbortSignal;
  /** Called each time an attempt fails because the scale isn't advertising, before waiting. */
  onWaiting(): void;
}

/** Resolves after `delayMs`, or rejects as soon as `signal` aborts. */
function wait(clock: Clock, delayMs: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      cancel();
      reject(signal.reason);
    };
    const cancel = clock.schedule(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Runs `attempt` until it succeeds, retrying every RECONNECT_RETRY_MS while it fails because the
 * scale isn't advertising, for up to RECONNECT_WINDOW_MS. Any other failure, or one at the end of
 * the window, is thrown, as is the abort reason once `signal` aborts.
 */
export async function retryWhileOutOfRange<T>(
  attempt: () => Promise<T>,
  { clock, signal, onWaiting }: RetryOptions,
): Promise<T> {
  const giveUpAt = clock.now() + RECONNECT_WINDOW_MS;
  for (;;) {
    try {
      return await attempt();
    } catch (error) {
      if (!isOutOfRange(error) || clock.now() >= giveUpAt) throw error;
    }
    onWaiting();
    await wait(clock, RECONNECT_RETRY_MS, signal);
  }
}
