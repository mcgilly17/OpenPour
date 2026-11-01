import type { Driver } from "openpour";

/**
 * The device chooser's options for `driver`: only devices whose names match its prefixes, and
 * access to its services alone. Never `acceptAllDevices` or empty filters, so the chooser can't
 * offer an unrelated device.
 */
export function buildRequestOptions(driver: Driver): RequestDeviceOptions {
  if (driver.namePrefixes.length === 0) {
    throw new Error(`the ${driver.brand} driver has no name prefixes to filter the chooser by`);
  }
  return {
    filters: driver.namePrefixes.map((namePrefix) => ({ namePrefix })),
    optionalServices: driver.services,
  };
}

/**
 * Opens the browser's device chooser for `driver`. Browsers allow this only during a user
 * gesture, and the page calls it only from the Connect button's click handler: it never scans or
 * picks a device by itself.
 */
export function chooseScale(
  bluetooth: Pick<Bluetooth, "requestDevice">,
  driver: Driver,
): Promise<BluetoothDevice> {
  return bluetooth.requestDevice(buildRequestOptions(driver));
}
