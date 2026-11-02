import type { Driver } from "openpour";
import { matchedPrefix } from "./chooseScale.js";

/** `navigator.bluetooth` where it may lack `getDevices`, which Chrome can keep behind a flag. */
export type DeviceList = Partial<Pick<Bluetooth, "getDevices">> | undefined;

export const NO_DEVICE_LIST =
  "This browser doesn't list the scales it remembers (no navigator.bluetooth.getDevices), so use Connect a scale. See harness/README.md.";

/** Whether the browser lists the devices this origin may use, so a saved scale needs no chooser. */
export function canRemember(bluetooth: DeviceList): boolean {
  return typeof bluetooth?.getDevices === "function";
}

/** The device with `id` among those this origin may use; undefined if it isn't, or can't be, listed. */
export async function rememberedDevice(
  bluetooth: DeviceList,
  id: string,
): Promise<BluetoothDevice | undefined> {
  if (typeof bluetooth?.getDevices !== "function") return undefined;
  return (await bluetooth.getDevices()).find((device) => device.id === id);
}

/**
 * The saved scale `id`, found without the chooser. Throws a plain explanation when the browser
 * can't list remembered devices, no longer remembers this one, or it isn't named like a scale the
 * chooser would offer: a saved scale gets the same name check as a chosen one.
 */
export async function findRememberedDevice(
  bluetooth: DeviceList,
  id: string,
  driver: Driver,
): Promise<BluetoothDevice> {
  if (!canRemember(bluetooth)) throw new Error(NO_DEVICE_LIST);
  const device = await rememberedDevice(bluetooth, id);
  if (!device) {
    throw new Error(
      "The browser no longer remembers this scale: its permission was revoked or forgotten, or lasted only until the browser restarted. Use Connect a scale to choose it again.",
    );
  }
  if (matchedPrefix(driver, device.name) === undefined) {
    throw new Error(
      `The remembered device's name matches none of the ${driver.brand} driver's prefixes, so the chooser wouldn't offer it.`,
    );
  }
  return device;
}
