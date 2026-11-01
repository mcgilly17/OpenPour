import type { GattLayout } from "../../core/types.js";

export interface AcaiaVariant {
  svc: string;
  writeChr: string;
  notifyChr: string;
  writeMode: "response" | "noResponse";
  heartbeatMs: number;
}

/** Pyxis, Lunar 2021+ and (expected) Pearl S send heartbeats every 1–2 s. */
export const NEW_STYLE_HEARTBEAT_MS = 1000;
/** Older Lunars are reported to accept heartbeats up to 5 s apart. */
export const OLD_STYLE_HEARTBEAT_MS = 3000;

const NEW_STYLE = {
  svc: "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  writeChr: "49535343-8841-43f4-a8d4-ecbe34729bb3",
  notifyChr: "49535343-1e4d-4bd9-ba61-23c647249616",
};
const OLD_STYLE = { svc: "1820", chr: "2a80" };

const BLUETOOTH_BASE_UUID = "-0000-1000-8000-00805f9b34fb";
const SHORT_UUID = /^(?:0x)?([0-9a-f]{4})$/;

/** Lower-case, full 128-bit form, so `2A80`, `0x2a80` and the long form all compare equal. */
export function normalizeUuid(uuid: string): string {
  const lower = uuid.toLowerCase();
  const short = SHORT_UUID.exec(lower)?.[1];
  return short ? `0000${short}${BLUETOOTH_BASE_UUID}` : lower;
}

interface Found {
  svc: string;
  chr: string;
  properties: string[];
}

/** Returns the UUIDs as discovered, so commands echo exactly what the app's BLE library gave us. */
function findCharacteristic(gatt: GattLayout, svc: string, chr: string): Found | undefined {
  const service = gatt.find((s) => normalizeUuid(s.uuid) === normalizeUuid(svc));
  const found = service?.characteristics.find((c) => normalizeUuid(c.uuid) === normalizeUuid(chr));
  return service && found && { svc: service.uuid, chr: found.uuid, properties: found.properties };
}

/** Picks the protocol variant from the discovered GATT layout; undefined when neither fits. */
export function findVariant(gatt: GattLayout): AcaiaVariant | undefined {
  const write = findCharacteristic(gatt, NEW_STYLE.svc, NEW_STYLE.writeChr);
  const notify = findCharacteristic(gatt, NEW_STYLE.svc, NEW_STYLE.notifyChr);
  if (write && notify) {
    return {
      svc: write.svc,
      writeChr: write.chr,
      notifyChr: notify.chr,
      // ponytail: write mode follows the advertised property until captures confirm which one the scale wants.
      writeMode: write.properties.includes("writeWithoutResponse") ? "noResponse" : "response",
      heartbeatMs: NEW_STYLE_HEARTBEAT_MS,
    };
  }
  const shared = findCharacteristic(gatt, OLD_STYLE.svc, OLD_STYLE.chr);
  if (shared) {
    return {
      svc: shared.svc,
      writeChr: shared.chr,
      notifyChr: shared.chr,
      writeMode: "noResponse",
      heartbeatMs: OLD_STYLE_HEARTBEAT_MS,
    };
  }
  return undefined;
}
