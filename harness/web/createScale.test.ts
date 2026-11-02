import { acaia, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { parseFixture } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createScale } from "./createScale.js";
import type { ScalePanel } from "./createScalePanel.js";
import { downloadText } from "./downloadText.js";
import {
  asDevice,
  BATTERY_ONLY_GATT,
  operationsOn,
  type StubGatt,
  stubGatt,
} from "./test/stubGatt.js";

vi.mock("./downloadText.js");

const DISCOVERY = ["connect", "getPrimaryServices", "getCharacteristics"];

afterEach(() => {
  vi.useRealTimers();
});

function connectTo(gatt: StubGatt) {
  const clock = useFakeClock();
  const panel = {
    show: vi.fn(),
    setConnection: vi.fn(),
    addError: vi.fn(),
    onAction: vi.fn(),
    onExport: vi.fn(),
  } satisfies ScalePanel;
  const recordingStartT = vi.fn(() => 0);
  const device = asDevice(gatt.device);
  const scale = createScale({ device, label: "a", driver: acaia, clock, recordingStartT, panel });
  return { clock, panel, recordingStartT, connected: scale.connect() };
}

describe("createScale", () => {
  test("an unknown device is disconnected and reported, and no runner or recording starts", async () => {
    const gatt = stubGatt(BATTERY_ONLY_GATT, "PEARL x");
    const { clock, panel, recordingStartT, connected } = connectTo(gatt);

    await connected;
    await advanceTo(clock, 10_000);

    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "disconnect"]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ["failed"]]);
    expect(panel.addError).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("(unknown-device)"),
    );
    expect(recordingStartT).not.toHaveBeenCalled();
    expect(panel.show).not.toHaveBeenCalledWith("protocol", "handshaking");
  });

  test("a matching scale is only discovered until its session asks to subscribe; writes follow", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);

    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS - 1);
    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "startNotifications"]);
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    const writes = ["writeValueWithoutResponse", "writeValueWithoutResponse"];
    expect(operationsOn(gatt)).toEqual([...DISCOVERY, "startNotifications", ...writes]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ["connected"]]);
    expect(panel.show).toHaveBeenCalledWith("protocol", "handshaking");
  });

  test("an exported fixture records when the session started, before its first write", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    panel.onExport.mock.calls[0]?.[0](new FormData());

    const jsonl = vi.mocked(downloadText).mock.calls[0]?.[1] ?? "";
    const fixture = parseFixture(jsonl);
    expect(fixture.header.sessionStartT).toBe(0);
    expect(fixture.records[0]?.t).toBe(SUBSCRIBE_SETTLE_MS);
  });
});
