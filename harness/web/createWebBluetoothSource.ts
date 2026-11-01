import type { BluetoothSource } from "../runner/BluetoothSource.js";
import type { Clock } from "../runner/Clock.js";
import { withTimeout } from "./withTimeout.js";

export interface WebBluetoothSourceOptions {
  server: BluetoothRemoteGATTServer;
  /** Everything discovery found; commands name them by the UUIDs discovery reported. */
  characteristics: BluetoothRemoteGATTCharacteristic[];
  clock: Clock;
}

const key = (svc: string, chr: string): string => `${svc}\n${chr}`;

/** Copies the value out: the browser may reuse the DataView's buffer for later values. */
function bytesOf(view: DataView): Uint8Array {
  return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
}

/**
 * A `BluetoothSource` over one connected Web Bluetooth GATT server. Every operation times out
 * (see `withTimeout`), and notifications carry the event's `timeStamp`, which shares
 * `performance.now()`'s time base with `browserClock`.
 */
export function createWebBluetoothSource({
  server,
  characteristics,
  clock,
}: WebBluetoothSourceOptions): BluetoothSource {
  const byKey = new Map(characteristics.map((c) => [key(c.service.uuid, c.uuid), c]));

  function find(svc: string, chr: string): BluetoothRemoteGATTCharacteristic {
    const characteristic = byKey.get(key(svc, chr));
    if (!characteristic) throw new Error(`characteristic ${chr} in ${svc} was not discovered`);
    return characteristic;
  }

  return {
    async subscribe(svc, chr, listener) {
      const characteristic = find(svc, chr);
      const onValue = (event: Event): void => {
        if (characteristic.value) listener(bytesOf(characteristic.value), event.timeStamp);
      };
      // Listen first: a notification can arrive before startNotifications() resolves.
      characteristic.addEventListener("characteristicvaluechanged", onValue);
      try {
        await withTimeout(clock, `subscribe to ${chr}`, characteristic.startNotifications());
      } catch (error) {
        characteristic.removeEventListener("characteristicvaluechanged", onValue);
        throw error;
      }
    },
    async write(svc, chr, bytes, mode) {
      const characteristic = find(svc, chr);
      const value = new Uint8Array(bytes);
      const operation =
        mode === "response"
          ? characteristic.writeValueWithResponse(value)
          : characteristic.writeValueWithoutResponse(value);
      await withTimeout(clock, `write to ${chr}`, operation);
    },
    async read(svc, chr) {
      return bytesOf(await withTimeout(clock, `read ${chr}`, find(svc, chr).readValue()));
    },
    onDisconnect(listener) {
      server.device.addEventListener("gattserverdisconnected", () => listener(), { once: true });
    },
    async disconnect() {
      server.disconnect();
    },
  };
}
