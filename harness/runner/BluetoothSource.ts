import type { Command } from "openpour";

export type WriteMode = Extract<Command, { type: "write" }>["mode"];

/** Gets each notification's raw bytes and arrival time, on the runner's clock. */
export type NotificationListener = (bytes: Uint8Array, t: number) => void;

/**
 * The Bluetooth operations a platform provides for one connected scale. Operations are async
 * because real radios are. Notifications carry their arrival time, stamped as close to the radio
 * as the platform allows, on the same base as the runner's `Clock.now()`.
 */
export interface BluetoothSource {
  /** Resolves once notifications are on; `listener` then gets every notification. */
  subscribe(svc: string, chr: string, listener: NotificationListener): Promise<void>;
  write(svc: string, chr: string, bytes: Uint8Array, mode: WriteMode): Promise<void>;
  read(svc: string, chr: string): Promise<Uint8Array>;
  /** Called once when the connection ends, whichever side ends it. */
  onDisconnect(listener: () => void): void;
  disconnect(): Promise<void>;
}
