/** Injected time, so tests are deterministic and wake-ups share the notifications' time base. */
export interface Clock {
  /** ms, on the same base as notification arrival times. */
  now(): number;
  /** Runs `fn` once after `delayMs`; the returned function cancels it. */
  schedule(fn: () => void, delayMs: number): () => void;
}
