import { acaia } from "openpour/acaia";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_GATT, ACAIA_NOTIFY, ACAIA_SVC, ACAIA_WRITE } from "../test/acaiaGatt.js";
import { useFakeClock } from "../test/useFakeClock.js";
import { discoverGatt } from "./discoverGatt.js";
import { asServer, stubGatt } from "./test/stubGatt.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("discoverGatt", () => {
  test("lists each service's characteristics with their property names", async () => {
    const gatt = stubGatt(ACAIA_GATT);

    const { layout, characteristics } = await discoverGatt(asServer(gatt.server), useFakeClock());

    expect(layout).toEqual([
      {
        uuid: ACAIA_SVC,
        characteristics: [
          { uuid: ACAIA_WRITE, properties: ["writeWithoutResponse", "write"] },
          { uuid: ACAIA_NOTIFY, properties: ["notify"] },
        ],
      },
    ]);
    expect(characteristics).toEqual(gatt.characteristics);
  });

  test("a device without the driver's services gives an empty layout, rejected as unknown-device", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    gatt.server.getPrimaryServices.mockRejectedValueOnce(
      new DOMException("No Services found in device.", "NotFoundError"),
    );

    const { layout } = await discoverGatt(asServer(gatt.server), useFakeClock());

    expect(layout).toEqual([]);
    expect(() => acaia.createSession(layout)).toThrow(
      expect.objectContaining({ code: "unknown-device" }),
    );
  });

  test("passes on any other discovery failure", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const dropped = new DOMException("GATT Server is disconnected.", "NetworkError");
    gatt.server.getPrimaryServices.mockRejectedValueOnce(dropped);

    await expect(discoverGatt(asServer(gatt.server), useFakeClock())).rejects.toBe(dropped);
  });
});
