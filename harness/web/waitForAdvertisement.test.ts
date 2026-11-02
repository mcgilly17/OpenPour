import { afterEach, describe, expect, test, vi } from "vitest";

import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { ADVERTISEMENT_WAIT_MS, waitForAdvertisement } from "./waitForAdvertisement.js";

afterEach(() => {
  vi.useRealTimers();
});

/** A remembered device that starts watching when asked; `advertise` delivers an advertisement. */
function watchableDevice() {
  const target = new EventTarget();
  const watchAdvertisements = vi.fn(async (_options?: WatchAdvertisementsOptions) => {});
  const device = Object.assign(target, { watchAdvertisements });
  const signal = () => watchAdvertisements.mock.calls[0]?.[0]?.signal;
  const advertise = () => target.dispatchEvent(new Event("advertisementreceived"));
  return { device: device as unknown as BluetoothDevice, watchAdvertisements, signal, advertise };
}

describe("waitForAdvertisement", () => {
  test("resolves as soon as the scale advertises, and stops watching", async () => {
    const clock = useFakeClock();
    const { device, signal, advertise } = watchableDevice();

    const note = waitForAdvertisement(device, clock);
    await advanceTo(clock, 250);
    advertise();

    await expect(note).resolves.toContain("advertised 250 ms after");
    expect(signal()?.aborted).toBe(true);
  });

  test("gives up after ADVERTISEMENT_WAIT_MS, and stops watching", async () => {
    const clock = useFakeClock();
    const { device, signal } = watchableDevice();

    const note = waitForAdvertisement(device, clock);
    await advanceTo(clock, ADVERTISEMENT_WAIT_MS - 1);
    expect(signal()?.aborted).toBe(false);
    await advanceTo(clock, ADVERTISEMENT_WAIT_MS);

    await expect(note).resolves.toContain(`timed out after ${ADVERTISEMENT_WAIT_MS} ms`);
    expect(signal()?.aborted).toBe(true);
  });

  test("a browser that can't watch, or refuses to, is noted and never throws", async () => {
    const clock = useFakeClock();
    const refusing = watchableDevice();
    refusing.watchAdvertisements.mockRejectedValue(new DOMException("no", "NotSupportedError"));

    await expect(waitForAdvertisement(refusing.device, clock)).resolves.toContain(
      "NotSupportedError: no",
    );
    const unable = new EventTarget() as unknown as BluetoothDevice;
    await expect(waitForAdvertisement(unable, clock)).resolves.toContain("can't watch");
  });
});
