import type { Clock } from "../runner/Clock.js";

/** Longest one GATT operation may take. A healthy one takes tens of ms; a stalled one never ends. */
export const GATT_OPERATION_TIMEOUT_MS = 3000;

/**
 * Rejects when `operation` hasn't settled within `timeoutMs`. The runner waits for each command
 * in turn, so one Web Bluetooth call that never settles would otherwise stall every later one.
 */
export function withTimeout<T>(
  clock: Clock,
  what: string,
  operation: Promise<T>,
  timeoutMs: number = GATT_OPERATION_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = clock.schedule(
      () => reject(new Error(`${what} timed out after ${timeoutMs} ms`)),
      timeoutMs,
    );
    operation.then(
      (value) => {
        cancel();
        resolve(value);
      },
      (error: unknown) => {
        cancel();
        reject(error);
      },
    );
  });
}
