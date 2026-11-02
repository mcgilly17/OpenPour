import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { useFakeClock } from "../test/useFakeClock.js";
import { readDeviceInfo } from "./readDeviceInfo.js";
import {
  asCharacteristics,
  characteristicOf,
  DEVICE_INFORMATION_GATT,
  DIS,
  readsAs,
  type StubGatt,
  stubGatt,
} from "./test/stubGatt.js";

afterEach(() => {
  vi.useRealTimers();
});

function pearlS(): StubGatt {
  const gatt = stubGatt([...ACAIA_GATT, ...DEVICE_INFORMATION_GATT]);
  readsAs(gatt, DIS.manufacturer, "acaia\0\0\0");
  readsAs(gatt, DIS.modelNumber, "PEARLS ");
  readsAs(gatt, DIS.serialNumber, "SERIAL-1234");
  readsAs(gatt, DIS.firmwareRevision, "1.0.016\n");
  readsAs(gatt, DIS.hardwareRevision, "2.0");
  readsAs(gatt, DIS.softwareRevision, "1.2.3");
  return gatt;
}

function read(gatt: StubGatt) {
  return readDeviceInfo(asCharacteristics(gatt.characteristics), useFakeClock());
}

describe("readDeviceInfo", () => {
  test("reads every allowed string, without trailing NULs or whitespace", async () => {
    await expect(read(pearlS())).resolves.toEqual({
      info: {
        manufacturer: "acaia",
        modelNumber: "PEARLS",
        firmwareRevision: "1.0.016",
        hardwareRevision: "2.0",
        softwareRevision: "1.2.3",
      },
    });
  });

  test("never reads the serial number, even when the scale has one", async () => {
    const gatt = pearlS();

    const { info } = await read(gatt);

    expect(characteristicOf(gatt, DIS.serialNumber).readValue).not.toHaveBeenCalled();
    expect(JSON.stringify(info)).not.toContain("SERIAL");
  });

  test("leaves missing characteristics, or a missing service, unknown without a note", async () => {
    const [service] = DEVICE_INFORMATION_GATT;
    const someMissing = service && {
      ...service,
      characteristics: service.characteristics.filter(({ uuid }) => uuid === DIS.modelNumber),
    };
    const partial = stubGatt([...ACAIA_GATT, ...(someMissing ? [someMissing] : [])]);
    readsAs(partial, DIS.modelNumber, "PEARLS");

    await expect(read(partial)).resolves.toEqual({ info: { modelNumber: "PEARLS" } });
    await expect(read(stubGatt(ACAIA_GATT))).resolves.toEqual({ info: {} });
  });

  test("stops at a read that fails, with one note, keeping what it already read", async () => {
    const gatt = pearlS();
    const failure = new DOMException("GATT operation failed.", "NetworkError");
    characteristicOf(gatt, DIS.firmwareRevision).readValue.mockRejectedValue(failure);

    const { info, note } = await read(gatt);

    expect(info).toEqual({ manufacturer: "acaia", modelNumber: "PEARLS" });
    expect(note).toContain("NetworkError: GATT operation failed.");
    expect(characteristicOf(gatt, DIS.hardwareRevision).readValue).not.toHaveBeenCalled();
  });
});
