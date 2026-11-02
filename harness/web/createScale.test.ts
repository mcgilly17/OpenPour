import type { Driver } from "openpour";
import { acaia, NEW_STYLE_HEARTBEAT_MS, SUBSCRIBE_SETTLE_MS } from "openpour/acaia";
import { bytesToHex, type Fixture, parseFixture } from "openpour/replay";
import { afterEach, describe, expect, test, vi } from "vitest";

import { ACAIA_COMMAND_VECTORS as TX } from "../../src/test/acaiaVectors.js";
import { ACAIA_GATT } from "../test/acaiaGatt.js";
import { advanceTo, useFakeClock } from "../test/useFakeClock.js";
import { createScale } from "./createScale.js";
import type { PanelAction, ScalePanel } from "./createScalePanel.js";
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
const HANDSHAKE = ["startNotifications", "writeValueWithoutResponse", "writeValueWithoutResponse"];

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function stubPanel() {
  return {
    show: vi.fn(),
    setConnection: vi.fn(),
    addError: vi.fn(),
    onAction: vi.fn(),
    onExport: vi.fn(),
  } satisfies ScalePanel;
}

type StubPanel = ReturnType<typeof stubPanel>;

function connectTo(gatt: StubGatt, driver: Driver = acaia) {
  const clock = useFakeClock();
  const panel = stubPanel();
  const recordingStartT = vi.fn(() => 0);
  const device = asDevice(gatt.device);
  const scale = createScale({ device, label: "a", driver, clock, recordingStartT, panel });
  return { clock, panel, recordingStartT, connected: scale.connect() };
}

/** Clicks the panel's `action` button, through the handler the scale registered for it. */
function click(panel: StubPanel, action: PanelAction): void {
  const handler = panel.onAction.mock.calls.find(([name]) => name === action)?.[1];
  if (!handler) throw new Error(`no handler for ${action}`);
  handler();
}

/** Submits the export form with `answers`; returns the downloaded fixture, if there was one. */
function exportFixture(panel: StubPanel, answers = new FormData()): Fixture | undefined {
  panel.onExport.mock.calls[0]?.[0](answers);
  const jsonl = vi.mocked(downloadText).mock.calls.at(-1)?.[1];
  return jsonl === undefined ? undefined : parseFixture(jsonl);
}

function writtenHex({ characteristics }: StubGatt): string[] {
  return characteristics.flatMap((c) =>
    // The source writes Uint8Arrays.
    [...c.writeValueWithResponse.mock.calls, ...c.writeValueWithoutResponse.mock.calls].map(
      ([value]) => bytesToHex(value as Uint8Array),
    ),
  );
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

    expect(operationsOn(gatt)).toEqual([...DISCOVERY, ...HANDSHAKE]);
    expect(panel.setConnection.mock.calls).toEqual([["connecting"], ["connected"]]);
    expect(panel.show).toHaveBeenCalledWith("protocol", "handshaking");
  });

  test("an exported fixture records when the session started, before its first write", async () => {
    const { clock, panel, connected } = connectTo(stubGatt(ACAIA_GATT));
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    const fixture = exportFixture(panel);

    expect(fixture?.header.sessionStartT).toBe(0);
    expect(fixture?.records[0]?.t).toBe(SUBSCRIBE_SETTLE_MS);
  });
});

describe("createScale controls", () => {
  test("Tare sends one tare write", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);

    click(panel, "tare");
    await vi.advanceTimersByTimeAsync(0);

    expect(writtenHex(gatt).filter((hex) => hex === TX.tare)).toHaveLength(1);
  });

  test("Disconnect closes the connection; then nothing is written and no wake-up is left", async () => {
    const gatt = stubGatt(ACAIA_GATT);
    const { clock, panel, connected } = connectTo(gatt);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    const writes = writtenHex(gatt).length;

    click(panel, "disconnect");
    await advanceTo(clock, 10 * NEW_STYLE_HEARTBEAT_MS);

    expect(gatt.server.disconnect).toHaveBeenCalledOnce();
    expect(writtenHex(gatt)).toHaveLength(writes);
    expect(vi.getTimerCount()).toBe(0);
    expect(panel.setConnection).toHaveBeenLastCalledWith("disconnected");
  });

  test("Reconnect starts one fresh session, runner and recording, timed from the shared start", async () => {
    const reconnectT = 5000;
    const gatt = stubGatt(ACAIA_GATT);
    const driver = { ...acaia, createSession: vi.fn(acaia.createSession) };
    const { clock, panel, recordingStartT, connected } = connectTo(gatt, driver);
    await connected;
    await advanceTo(clock, SUBSCRIBE_SETTLE_MS);
    click(panel, "disconnect");
    await advanceTo(clock, reconnectT);
    const before = operationsOn(gatt).length;

    click(panel, "reconnect");
    await advanceTo(clock, reconnectT + SUBSCRIBE_SETTLE_MS);

    expect(operationsOn(gatt).slice(before)).toEqual([...DISCOVERY, ...HANDSHAKE]);
    expect(driver.createSession).toHaveBeenCalledTimes(2);
    expect(recordingStartT).toHaveBeenCalledTimes(2);
    const fixture = exportFixture(panel);
    expect(fixture?.header.sessionStartT).toBe(reconnectT);
    expect(fixture?.records.map(({ t, hex }) => [t, hex])).toEqual([
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.identify],
      [reconnectT + SUBSCRIBE_SETTLE_MS, TX.notificationRequest],
    ]);
  });
});
