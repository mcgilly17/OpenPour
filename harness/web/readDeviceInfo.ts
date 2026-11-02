import type { Clock } from "../runner/Clock.js";
import { describeError } from "./explainFailure.js";
import { withTimeout } from "./withTimeout.js";

/** The standard Device Information service; the chooser asks for it alongside the driver's. */
export const DEVICE_INFORMATION_SERVICE = "0000180a-0000-1000-8000-00805f9b34fb";

/**
 * The Device Information strings the harness reads, in order. Never the serial number (2a25): it
 * identifies one scale, and what the page shows can end up in a public fixture.
 */
export const DEVICE_INFO_CHARACTERISTICS = {
  manufacturer: "00002a29-0000-1000-8000-00805f9b34fb",
  modelNumber: "00002a24-0000-1000-8000-00805f9b34fb",
  firmwareRevision: "00002a26-0000-1000-8000-00805f9b34fb",
  hardwareRevision: "00002a27-0000-1000-8000-00805f9b34fb",
  softwareRevision: "00002a28-0000-1000-8000-00805f9b34fb",
} as const;

export type DeviceInfoField = keyof typeof DEVICE_INFO_CHARACTERISTICS;
export type DeviceInfo = Partial<Record<DeviceInfoField, string>>;

export const DEVICE_INFO_FIELDS: DeviceInfoField[] = [
  "manufacturer",
  "modelNumber",
  "firmwareRevision",
  "hardwareRevision",
  "softwareRevision",
];

export interface DeviceInfoResult {
  info: DeviceInfo;
  /** Why reading stopped early, when a read failed; the fields not read stay unknown. */
  note?: string;
}

// Some devices pad these strings with NULs.
const TRAILING_PADDING = /[\s\0]+$/;

function decode(view: DataView): string {
  return new TextDecoder().decode(view).replace(TRAILING_PADDING, "");
}

function find(
  characteristics: BluetoothRemoteGATTCharacteristic[],
  uuid: string,
): BluetoothRemoteGATTCharacteristic | undefined {
  return characteristics.find(
    (c) => c.service.uuid === DEVICE_INFORMATION_SERVICE && c.uuid === uuid,
  );
}

/**
 * Reads the Device Information strings that discovery found, one at a time with the GATT timeout.
 * Nothing here fails the connection: a missing service or characteristic leaves its field unknown,
 * and the first failed read stops reading. That keeps a stalled characteristic from holding back
 * the session's handshake by more than one timeout, as scales drop a silent connection quickly.
 */
export async function readDeviceInfo(
  characteristics: BluetoothRemoteGATTCharacteristic[],
  clock: Clock,
): Promise<DeviceInfoResult> {
  const info: DeviceInfo = {};
  for (const field of DEVICE_INFO_FIELDS) {
    const characteristic = find(characteristics, DEVICE_INFO_CHARACTERISTICS[field]);
    if (!characteristic) continue;
    try {
      const text = decode(await withTimeout(clock, `read ${field}`, characteristic.readValue()));
      if (text !== "") info[field] = text;
    } catch (error) {
      const reason = describeError(error);
      return {
        info,
        note: `Device Information stopped at ${field} (${reason}); the rest show as unknown.`,
      };
    }
  }
  return { info };
}
