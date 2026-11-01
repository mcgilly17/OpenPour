import type { Driver, ScaleSession } from "openpour";
import type { Clock } from "../runner/Clock.js";
import { discoverGatt } from "./discoverGatt.js";
import { withTimeout } from "./withTimeout.js";

/** Connecting takes up to a few seconds; past this the attempt is abandoned. */
export const CONNECT_TIMEOUT_MS = 10_000;

export interface OpenedSession {
  server: BluetoothRemoteGATTServer;
  characteristics: BluetoothRemoteGATTCharacteristic[];
  /** Fresh for every connection. */
  session: ScaleSession;
}

/**
 * Connects, discovers GATT and creates the driver's session for it. Throws the driver's
 * `unknown-device` error when the scale lacks its services. A failure leaves nothing connected.
 */
export async function openSession(
  device: BluetoothDevice,
  driver: Driver,
  clock: Clock,
): Promise<OpenedSession> {
  const server = device.gatt;
  if (!server) throw new Error("this device has no GATT server");
  try {
    await withTimeout(clock, "connect", server.connect(), CONNECT_TIMEOUT_MS);
    const { layout, characteristics } = await discoverGatt(server, clock);
    return { server, characteristics, session: driver.createSession(layout) };
  } catch (error) {
    // Also cancels a connection attempt that timed out, so it can't complete unseen later.
    server.disconnect();
    throw error;
  }
}
