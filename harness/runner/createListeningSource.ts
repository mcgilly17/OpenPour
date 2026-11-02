import type { BluetoothSource, NotificationListener } from "./BluetoothSource.js";
import type { Clock } from "./Clock.js";

/** A source that can subscribe before any session runs, then hand the subscription to one. */
export interface ListeningSource extends BluetoothSource {
  /**
   * Subscribes to `svc`/`chr` and gives `listener` every notification, sending nothing else. A
   * later `subscribe` to the same characteristic takes its notifications over instead of
   * subscribing again, so each notification reaches one listener and is recorded once.
   */
  listen(svc: string, chr: string, listener: NotificationListener): Promise<void>;
}

const key = (svc: string, chr: string): string => `${svc}\n${chr}`;

/** Wraps `source`; anything not listened to passes straight through. */
export function createListeningSource(source: BluetoothSource, clock: Clock): ListeningSource {
  const listeners = new Map<string, NotificationListener>();
  /** Resolves to whether listening succeeded, so a takeover can wait for it. */
  const subscriptions = new Map<string, Promise<boolean>>();

  function listen(svc: string, chr: string, listener: NotificationListener): Promise<void> {
    const k = key(svc, chr);
    listeners.set(k, listener);
    const subscribing = source.subscribe(svc, chr, (bytes, t) => listeners.get(k)?.(bytes, t));
    const forget = (): boolean => {
      listeners.delete(k);
      subscriptions.delete(k);
      return false;
    };
    subscriptions.set(
      k,
      subscribing.then(() => true, forget),
    );
    return subscribing;
  }

  async function subscribe(svc: string, chr: string, listener: NotificationListener) {
    const k = key(svc, chr);
    const listening = subscriptions.get(k);
    if (!listening || !(await listening)) return source.subscribe(svc, chr, listener);
    const previous = listeners.get(k);
    const takenOverAt = clock.now();
    // A notification stamped before the takeover arrived before the session started, so it stays
    // with the listener: a fixture can't hold a packet from before its session start (ADR 0018).
    listeners.set(k, (bytes, t) => (t < takenOverAt ? previous : listener)?.(bytes, t));
  }

  return {
    listen,
    subscribe,
    write: (svc, chr, bytes, mode) => source.write(svc, chr, bytes, mode),
    read: (svc, chr) => source.read(svc, chr),
    onDisconnect: (listener) => source.onDisconnect(listener),
    disconnect: () => source.disconnect(),
  };
}
