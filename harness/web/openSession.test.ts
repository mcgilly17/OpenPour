import { acaia } from "openpour/acaia";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { CONNECT_TIMEOUT_MS, openSession } from "./openSession.js";
import {
  asDevice,
  BATTERY_ONLY_GATT,
  DEVICE_INFORMATION_GATT,
  DIS,
  operationsOn,
  readsAs,
  stubGatt,
} from "./test/stubGatt.js";

// Two services: the scale's own and Device Information.
const DISCOVERY = ["connect", "getPrimaryServices", "getCharacteristics", "getCharacteristics"];
const DEVICE_INFO_READS = Array<string>(5).fill("readValue");

afterEach(() => {
  vi.useRealTimers();
});

describe("openSession", () => {
  test("a matching scale: connects, discovers GATT and reads Device Information, nothing more", async () => {
    const gatt = stubGatt([...ACAIA_GATT, ...DEVICE_INFORMATION_GATT]);
    readsAs(gatt, DIS.modelNumber, "PEARLS");

    const opened = await openSession(asDevice(gatt.device), acaia, useFakeClock());

    expect(operationsOn(gatt)).toEqual([...DISCOVERY, ...DEVICE_INFO_READS]);
    expect(opened.session.info.brand).toBe("Acaia");
    expect(opened.characteristics).toEqual(gatt.characteristics);
    expect(opened.deviceInfo.info.modelNumber).toBe("PEARLS");
  });

  test("a scale-named device without the driver's services: unknown-device, nothing read or sent, disconnected", async () => {
    const gatt = stubGatt([...BATTERY_ONLY_GATT, ...DEVICE_INFORMATION_GATT], "PEARL x");

    await expect(openSession(asDevice(gatt.device), acaia, useFakeClock())).rejects.toMatchObject({
      code: "unknown-device",
    });

    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "disconnect"]);
  });

  test("abandons and cancels a connection attempt that never settles", async () => {
    const clock = useFakeClock();
    const gatt = stubGatt(ACAIA_GATT);
    gatt.server.connect.mockImplementationOnce(() => new Promise(() => {}));

    const failed = expect(openSession(asDevice(gatt.device), acaia, clock)).rejects.toThrow(
      `connect timed out after ${CONNECT_TIMEOUT_MS} ms`,
    );
    await advanceTo(clock, CONNECT_TIMEOUT_MS);
    await failed;

    expect(operationsOn(gatt)).toEqual(["connect", "disconnect"]);
  });
});
