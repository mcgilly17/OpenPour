import type { Driver } from "openpour";
import { acaia } from "openpour/acaia";
import { describe, expect, test, vi } from "vitest";

import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { chooseScale } from "./chooseScale.js";
import { asDevice, stubGatt } from "./test/stubGatt.js";

function stubBluetooth() {
  const device = asDevice(stubGatt(ACAIA_GATT).device);
  return { device, requestDevice: vi.fn(async (_options?: RequestDeviceOptions) => device) };
}

describe("chooseScale", () => {
  test("asks only for devices named like the driver's scales, with access to its services and Device Information", async () => {
    const bluetooth = stubBluetooth();

    await expect(chooseScale(bluetooth, acaia)).resolves.toBe(bluetooth.device);

    expect(bluetooth.requestDevice).toHaveBeenCalledOnce();
    expect(bluetooth.requestDevice.mock.calls[0]?.[0]).toStrictEqual({
      filters: [
        { namePrefix: "ACAIA" },
        { namePrefix: "LUNAR" },
        { namePrefix: "PYXIS" },
        { namePrefix: "PROCH" },
        { namePrefix: "PEARL" },
        { namePrefix: "CINCO" },
      ],
      optionalServices: [
        "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        "00001820-0000-1000-8000-00805f9b34fb",
        "0000180a-0000-1000-8000-00805f9b34fb",
      ],
    });
  });

  test("refuses a driver without name prefixes instead of opening an unfiltered chooser", () => {
    const bluetooth = stubBluetooth();
    const unnamed: Driver = { ...acaia, namePrefixes: [] };

    expect(() => chooseScale(bluetooth, unnamed)).toThrow("no name prefixes");
    expect(bluetooth.requestDevice).not.toHaveBeenCalled();
  });
});
