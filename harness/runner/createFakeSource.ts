import type { Command } from "openpour";
import type { BluetoothSource, NotificationListener } from "./BluetoothSource.js";
import type { Clock } from "./Clock.js";

export type FakeCall = Command | { type: "disconnect" };

/** How one operation settles: after `delayMs` (default at once), failing with `error` if set. */
export interface FakeOutcome {
  delayMs?: number;
  error?: unknown;
  /** What a read returns; empty by default. */
  bytes?: Uint8Array;
}

/** A scripted Bluetooth source for tests: no radio, every operation logged and controllable. */
export interface FakeSource extends BluetoothSource {
  /** Every operation in the order it was called, as the runner asked for it. */
  readonly calls: FakeCall[];
  /**
   * Delivers a notification to a successful subscription for `svc`/`chr`, arriving at `t` (default
   * now). It still delivers after a disconnect, like a late callback from a real platform.
   */
  notify(svc: string, chr: string, bytes: Uint8Array, t?: number): void;
  /** Ends the connection from the scale's side. */
  drop(): void;
}

const key = (svc: string, chr: string): string => `${svc}\n${chr}`;

export function createFakeSource(
  clock: Clock,
  outcomeOf: (call: FakeCall) => FakeOutcome = () => ({}),
): FakeSource {
  const calls: FakeCall[] = [];
  const subscriptions = new Map<string, NotificationListener>();
  const disconnectListeners: (() => void)[] = [];

  function settle<T>(call: FakeCall, onSuccess: (outcome: FakeOutcome) => T): Promise<T> {
    calls.push(call);
    const outcome = outcomeOf(call);
    return new Promise((resolve, reject) => {
      const done = (): void =>
        outcome.error === undefined ? resolve(onSuccess(outcome)) : reject(outcome.error);
      if (outcome.delayMs === undefined) done();
      else clock.schedule(done, outcome.delayMs);
    });
  }

  function drop(): void {
    for (const listener of disconnectListeners) listener();
  }

  return {
    calls,
    subscribe: (svc, chr, listener) =>
      settle({ type: "subscribe", svc, chr }, () => {
        subscriptions.set(key(svc, chr), listener);
      }),
    write: (svc, chr, bytes, mode) =>
      settle({ type: "write", svc, chr, bytes, mode }, () => undefined),
    read: (svc, chr) =>
      settle({ type: "read", svc, chr }, (outcome) => outcome.bytes ?? new Uint8Array()),
    onDisconnect: (listener) => disconnectListeners.push(listener),
    disconnect: () => settle({ type: "disconnect" }, drop),
    notify: (svc, chr, bytes, t = clock.now()) => subscriptions.get(key(svc, chr))?.(bytes, t),
    drop,
  };
}
