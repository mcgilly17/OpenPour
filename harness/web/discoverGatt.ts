import type { GattLayout } from "openpour";
import type { Clock } from "../runner/Clock.js";
import { withTimeout } from "./withTimeout.js";

/** Web Bluetooth's characteristic properties, which a GATT layout lists by name. */
const PROPERTY_NAMES = [
  "broadcast",
  "read",
  "writeWithoutResponse",
  "write",
  "notify",
  "indicate",
  "authenticatedSignedWrites",
  "reliableWrite",
  "writableAuxiliaries",
] as const;

export interface DiscoveredGatt {
  layout: GattLayout;
  characteristics: BluetoothRemoteGATTCharacteristic[];
}

// Web Bluetooth rejects with NotFoundError where other platforms return an empty list.
async function orNoneIfNotFound<T>(listing: Promise<T[]>): Promise<T[]> {
  try {
    return await listing;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return [];
    throw error;
  }
}

function propertiesOf(characteristic: BluetoothRemoteGATTCharacteristic): string[] {
  return PROPERTY_NAMES.filter((name) => characteristic.properties[name]);
}

/**
 * Lists the services and characteristics this page may use. The browser hides every service not
 * named in `requestDevice`'s filters or `optionalServices`, so the layout can be empty.
 */
export async function discoverGatt(
  server: BluetoothRemoteGATTServer,
  clock: Clock,
): Promise<DiscoveredGatt> {
  const services = await orNoneIfNotFound(
    withTimeout(clock, "discover services", server.getPrimaryServices()),
  );
  const discovered: DiscoveredGatt = { layout: [], characteristics: [] };
  for (const service of services) {
    const found = await orNoneIfNotFound(
      withTimeout(clock, `discover ${service.uuid}`, service.getCharacteristics()),
    );
    discovered.characteristics.push(...found);
    const characteristics = found.map((c) => ({ uuid: c.uuid, properties: propertiesOf(c) }));
    discovered.layout.push({ uuid: service.uuid, characteristics });
  }
  return discovered;
}
