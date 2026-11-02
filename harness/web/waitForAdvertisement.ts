import type { Clock } from "../runner/Clock.js";
import { describeError } from "./explainFailure.js";
import { withTimeout } from "./withTimeout.js";

/**
 * How long a remembered scale gets to advertise before the page connects anyway. Until a scan has
 * seen a device, the browser's Bluetooth stack may not know it and connecting fails as "no longer
 * in range"; an awake scale advertises several times a second.
 */
export const ADVERTISEMENT_WAIT_MS = 10_000;

/** Resolves on the device's first advertisement, once watching has started. */
async function firstAdvertisement(device: BluetoothDevice, signal: AbortSignal): Promise<void> {
  const advertised = new Promise<void>((resolve) => {
    device.addEventListener("advertisementreceived", () => resolve(), { once: true, signal });
  });
  await device.watchAdvertisements({ signal });
  await advertised;
}

/**
 * Watches `device` until it advertises, for up to ADVERTISEMENT_WAIT_MS, then stops watching.
 * Resolves to a note on what happened and never rejects. The advertisement's contents, which can
 * carry an address, are never read.
 */
export async function waitForAdvertisement(device: BluetoothDevice, clock: Clock): Promise<string> {
  if (typeof device.watchAdvertisements !== "function") {
    return "This browser can't watch for advertisements, so the page connected without waiting for one.";
  }
  const watching = new AbortController();
  const startT = clock.now();
  try {
    const advertised = firstAdvertisement(device, watching.signal);
    await withTimeout(clock, "waiting for an advertisement", advertised, ADVERTISEMENT_WAIT_MS);
    return `The saved scale advertised ${Math.round(clock.now() - startT)} ms after the page started watching, then the page connected.`;
  } catch (error) {
    return `No advertisement from the saved scale (${describeError(error)}); the page connected anyway.`;
  } finally {
    watching.abort();
  }
}
